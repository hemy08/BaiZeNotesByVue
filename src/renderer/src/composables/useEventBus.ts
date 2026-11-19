/**
 * useEventBus —— 渲染层 EventBus 组合式封装（M5：EventBus 统一）
 *
 * 背景：EventBus 已支持 `$on/$off/$cleanup` 与 `$checkLeaks`，但 8 个消费方仍手写
 * 「onMounted 注册一堆 $on → onBeforeUnmount 逐条 $off」样板代码：
 * - 逐条 `$off` 容易漏写（漏一条就是一次常驻监听泄漏，只能靠 `$checkLeaks` 兜底发现）；
 * - 组件同名/多实例场景需要手工拼 componentId 才能按实例清理；
 * - 异步挂载（如 Monaco 初始化后）注册的监听，在组件已卸载时仍可能被注册进来。
 *
 * 本 composable 把「注册 + 自动清理」收口为一次调用：
 * 1. 每次调用生成唯一 componentId（`前缀-c实例序号-序号`），组件卸载时按 id 整体
 *    `$cleanup`，不会误清同一组件的另一处调用或其他实例的监听；
 * 2. 在组件 setup 中调用时自动挂 `onBeforeUnmount(cleanup)`（清理时机与原手写
 *    `onBeforeUnmount` 中的 `$off` 一致）；在 effectScope 中调用时退化为
 *    `onScopeDispose(cleanup)`；两者皆无时由调用方自行调用返回的 cleanup（兜底）；
 * 3. cleanup 幂等：重复调用、`off` 未注册的处理器、清理后再注册（静默忽略）均安全；
 * 4. 保留 EventBus.$checkLeaks/$stats 泄漏检测兜底——componentId 前缀即
 *    `getComponentPrefix` 的聚合维度，泄漏检测可按组件前缀告警。
 *
 * 事件语义不变：本封装只负责「注册方式与清理范围」，不改变事件名、负载、派发顺序，
 * 也不在 cleanup 之外主动触发任何事件。
 */
import {
    getCurrentInstance,
    getCurrentScope,
    onBeforeUnmount,
    onScopeDispose,
    type ComponentInternalInstance
} from 'vue'
import EventBus from '../common/event-bus/event-bus'
import { logger } from '../common/logger'

/** useEventBus 可配置项 */
export interface UseEventBusOptions {
    /**
     * componentId 前缀（泄漏检测按 `-` 前的部分聚合同一组件，建议用组件名，
     * 如 'ShowPdfEditor' / 'StatusBar'；不要包含 '-'，否则前缀会被截断）。
     */
    componentIdPrefix?: string
    /** 显式指定 componentId（多调用方共享清理时使用；缺省自动生成，保证每次调用唯一） */
    componentId?: string
}

/** useEventBus 返回值 */
export interface UseEventBusReturn {
    /** 本次调用注册监听使用的组件唯一 id（卸载时按该 id 整体清理） */
    readonly componentId: string
    /**
     * 注册监听（等价 `EventBus.$on` + 自动加入本次调用的清理范围）。
     * @returns 解绑函数（只解绑本次注册；重复调用安全）
     */
    on<T = unknown>(
        eventName: string,
        handler: (payload: T) => unknown,
        options?: { once?: boolean }
    ): () => void
    /** 解绑指定事件（省略 handler 时解绑该事件下本次调用的全部监听；幂等） */
    off<T = unknown>(eventName: string, handler?: (payload: T) => unknown): void
    /** 派发事件（等价 `EventBus.$emit`，不参与自动清理） */
    emit(eventName: string, payload?: unknown): void
    /** 立即清理本次调用注册的全部监听（幂等；组件卸载时会自动调用） */
    cleanup(): void
}

/** 已注册监听项：保留事件名与处理器引用，供 off 精确解绑 */
interface Subscription {
    eventName: string
    handler: (payload: unknown) => unknown
}

let standaloneSeed = 0
let busCallSeed = 0

/**
 * 生成唯一 componentId。
 * 形如 `StatusBar-c12-3`：第一段是泄漏检测聚合用的组件前缀，第二段区分组件实例，
 * 第三段区分同一组件内的多次 useEventBus 调用。
 */
function createComponentId(
    instance: ComponentInternalInstance | null,
    prefix: string | undefined
): string {
    const safePrefix = prefix && prefix.trim().length > 0 ? prefix.trim() : 'useEventBus'
    const owner = instance ? `c${instance.uid}` : `standalone${++standaloneSeed}`
    return `${safePrefix}-${owner}-${++busCallSeed}`
}

/**
 * 创建 EventBus 注册器（需在组件 setup 或 effectScope 内调用以获得自动清理）。
 *
 * @param options 可选的 componentId 前缀/显式 id
 * @returns on/off/emit/cleanup 与本次调用的 componentId
 */
export function useEventBus(options: UseEventBusOptions = {}): UseEventBusReturn {
    const instance = getCurrentInstance()
    const componentId =
        options.componentId ?? createComponentId(instance, options.componentIdPrefix)
    // 本次调用注册的监听清单（off 精确解绑；cleanup 时整体清空）
    const subscriptions: Subscription[] = []
    let cleanedUp = false

    /** 幂等清理：按 componentId 清掉本次调用的全部监听，并拒绝清理后的新注册 */
    function cleanup(): void {
        if (cleanedUp) {
            return
        }
        cleanedUp = true
        subscriptions.length = 0
        // EventBus.$cleanup 按 componentId 删除监听；空集合/重复调用均为安全 no-op
        EventBus.$cleanup(componentId)
    }

    function on<T = unknown>(
        eventName: string,
        handler: (payload: T) => unknown,
        onOptions?: { once?: boolean }
    ): () => void {
        if (cleanedUp) {
            // 组件已卸载后（如异步初始化晚到）不再注册，避免监听永久驻留
            logger.warn(
                `[useEventBus] ${componentId} 已清理，忽略事件注册：${eventName}（请检查异步注册时序）`
            )
            return () => {}
        }
        EventBus.$on<T>(eventName, handler, {
            once: onOptions?.once,
            componentId
        })
        subscriptions.push({
            eventName,
            handler: handler as (payload: unknown) => unknown
        })
        return () => {
            off(eventName, handler)
        }
    }

    function off<T = unknown>(eventName: string, handler?: (payload: T) => unknown): void {
        // 倒序删除：与 EventBus.$off「删除第一条匹配监听」配对，保证重复注册同一
        // 处理器的极端场景下本地清单与总线计数始终一致
        for (let index = subscriptions.length - 1; index >= 0; index--) {
            const subscription = subscriptions[index]
            if (subscription.eventName !== eventName) {
                continue
            }
            if (handler && subscription.handler !== (handler as (payload: unknown) => unknown)) {
                continue
            }
            EventBus.$off(eventName, subscription.handler)
            subscriptions.splice(index, 1)
            if (handler) {
                // 指定处理器时每次只解绑一条（与 $off 语义一致），保留重复注册的其余条目
                break
            }
        }
    }

    function emit(eventName: string, payload?: unknown): void {
        EventBus.$emit(eventName, payload)
    }

    // 自动清理：组件内优先 onBeforeUnmount（与原手写代码清理时机一致）；
    // 纯 effectScope（无组件实例）用 onScopeDispose；两者皆无则需调用方手动 cleanup。
    if (instance) {
        onBeforeUnmount(cleanup)
    } else if (getCurrentScope()) {
        onScopeDispose(cleanup)
    }

    return {
        componentId,
        on,
        off,
        emit,
        cleanup
    }
}
