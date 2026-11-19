// CQ-10：渲染层统一日志出口（避免本模块裸 console.warn/error）
import { logger } from '../logger'

// P1 存量清理：内部容器统一以 unknown 载荷存储；公开 API（$on/$off）已按泛型 T 收窄，
// 因此不再需要 `(...args: any[]) => unknown` 这一宽化签名。
type AnyEventHandler = (payload: unknown) => unknown

interface EventListener {
    callback: AnyEventHandler
    once?: boolean
    componentId?: string
}

class EventBus {
    private callbacks: Map<string, Set<EventListener>> = new Map()
    private readonly MAX_LISTENERS_PER_EVENT = 200
    private componentListeners: Map<string, Set<{ eventName: string; listener: EventListener }>> =
        new Map()

    // MEM-09：泄漏检测阈值——恢复基线（2026-05-02 报告）中的检测能力：
    // 单个事件监听器数达到 EVENT_LEAK_THRESHOLD 或同一组件前缀累计监听器数
    // 达到 COMPONENT_LEAK_THRESHOLD 时，$checkLeaks 产生警告。
    private readonly EVENT_LEAK_THRESHOLD = 50
    private readonly COMPONENT_LEAK_THRESHOLD = 20

    $on<T = unknown>(
        eventName: string,
        callback: (payload: T) => unknown,
        options?: { once?: boolean; componentId?: string }
    ): void {
        // CQ-15：局部变量判空替代 Map.get() 之后的非空断言；事件首次注册时建桶，已有桶直接复用
        let listeners = this.callbacks.get(eventName)
        if (!listeners) {
            listeners = new Set<EventListener>()
            this.callbacks.set(eventName, listeners)
        }
        if (listeners.size >= this.MAX_LISTENERS_PER_EVENT) {
            logger.warn(
                `Event "${eventName}" has too many listeners (${listeners.size}), may cause memory leak`
            )
            return
        }

        const listener: EventListener = {
            callback: callback as AnyEventHandler,
            once: options?.once,
            componentId: options?.componentId
        }

        listeners.add(listener)

        if (options?.componentId) {
            const componentSet = this.componentListeners.get(options.componentId)
            if (componentSet) {
                componentSet.add({ eventName, listener })
            } else {
                this.componentListeners.set(options.componentId, new Set([{ eventName, listener }]))
            }
        }
    }

    $off<T = unknown>(eventName: string, callback: (payload: T) => unknown): void {
        const listeners = this.callbacks.get(eventName)
        if (!listeners) return

        const stored = callback as AnyEventHandler
        for (const listener of listeners) {
            if (listener.callback === stored) {
                listeners.delete(listener)

                if (listener.componentId) {
                    const componentSet = this.componentListeners.get(listener.componentId)
                    if (componentSet) {
                        for (const item of componentSet) {
                            if (item.eventName === eventName && item.listener === listener) {
                                componentSet.delete(item)
                                break
                            }
                        }
                        if (componentSet.size === 0) {
                            this.componentListeners.delete(listener.componentId)
                        }
                    }
                }
                break
            }
        }

        if (listeners.size === 0) {
            this.callbacks.delete(eventName)
        }
    }

    $emit(eventName: string, payload?: unknown): void {
        const listeners = this.callbacks.get(eventName)
        if (!listeners) return

        const toRemove: EventListener[] = []

        listeners.forEach((listener) => {
            try {
                listener.callback(payload)
                if (listener.once) {
                    toRemove.push(listener)
                }
            } catch (error) {
                logger.error(`Error in event listener for "${eventName}":`, error)
            }
        })

        toRemove.forEach((listener) => {
            listeners.delete(listener)

            if (listener.componentId) {
                const componentSet = this.componentListeners.get(listener.componentId)
                if (componentSet) {
                    for (const item of componentSet) {
                        if (item.eventName === eventName && item.listener === listener) {
                            componentSet.delete(item)
                            break
                        }
                    }
                    if (componentSet.size === 0) {
                        this.componentListeners.delete(listener.componentId)
                    }
                }
            }
        })

        if (listeners.size === 0) {
            this.callbacks.delete(eventName)
        }
    }

    $cleanup(componentId: string): void {
        const componentSet = this.componentListeners.get(componentId)
        if (!componentSet) return

        componentSet.forEach(({ eventName, listener }) => {
            const listeners = this.callbacks.get(eventName)
            if (listeners) {
                listeners.delete(listener)
                if (listeners.size === 0) {
                    this.callbacks.delete(eventName)
                }
            }
        })

        this.componentListeners.delete(componentId)
    }

    /**
     * MEM-09：统计当前事件与监听器总数（恢复基线 $stats 接口）。
     * @returns totalEvents 存在监听器的事件总数；totalListeners 全部监听器总数
     */
    $stats(): { totalEvents: number; totalListeners: number } {
        let totalListeners = 0
        this.callbacks.forEach((listeners) => {
            totalListeners += listeners.size
        })

        return {
            totalEvents: this.callbacks.size,
            totalListeners
        }
    }

    /**
     * MEM-09：泄漏检测（恢复基线 $checkLeaks 接口）。
     * 1) 事件维度：单个事件监听器数 >= EVENT_LEAK_THRESHOLD → 警告；
     * 2) 组件维度：按组件前缀聚合，前缀累计监听器数 >= COMPONENT_LEAK_THRESHOLD → 警告。
     * @returns hasLeaks 是否疑似存在泄漏；warnings 具体警告信息列表
     */
    $checkLeaks(): { hasLeaks: boolean; warnings: string[] } {
        const warnings: string[] = []

        // 事件维度：单事件监听器过多（组件忘记 $off/$cleanup 时随时间累积）
        this.callbacks.forEach((listeners, eventName) => {
            if (listeners.size >= this.EVENT_LEAK_THRESHOLD) {
                warnings.push(
                    `事件 "${eventName}" 监听器数量为 ${listeners.size}，` +
                        `达到泄漏预警阈值（>= ${this.EVENT_LEAK_THRESHOLD}）`
                )
            }
        })

        // 组件维度：按组件前缀聚合（同一组件/页面反复挂载未清理时随时间累积）
        const prefixCounts = new Map<string, number>()
        this.componentListeners.forEach((listenerSet, componentId) => {
            const prefix = this.getComponentPrefix(componentId)
            prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + listenerSet.size)
        })
        prefixCounts.forEach((count, prefix) => {
            if (count >= this.COMPONENT_LEAK_THRESHOLD) {
                warnings.push(
                    `组件前缀 "${prefix}" 累计监听器数量为 ${count}，` +
                        `达到泄漏预警阈值（>= ${this.COMPONENT_LEAK_THRESHOLD}），请检查是否忘记调用 $cleanup`
                )
            }
        })

        return { hasLeaks: warnings.length > 0, warnings }
    }

    /**
     * MEM-09：提取组件前缀——取 componentId 第一个 '-' 或 '/' 之前的部分。
     * 例如 'useEventBus-1-1730000000000' → 'useEventBus'；'dialogs/theme' → 'dialogs'。
     */
    private getComponentPrefix(componentId: string): string {
        const match = componentId.match(/^[^/-]+/)
        return match ? match[0] : componentId
    }
}

const eventBus = new EventBus()
export default eventBus
