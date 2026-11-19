// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- 测试内联多个最小探针组件，非生产组件文件 */
/**
 * useEventBus 组合式封装测试（结构优化第 4 批 4.3 / M5）
 *
 * 覆盖：
 * 1. on/emit 基本注册与派发；
 * 2. off 精确解绑（含未注册处理器/重复解绑的幂等）；
 * 3. once 语义；
 * 4. 组件卸载自动清理（不再收到事件、监听器计数回落，等价于原手写 $off）；
 * 5. cleanup 幂等、清理后 on 被静默忽略（防异步注册泄漏）；
 * 6. 同一组件内多次调用 useEventBus 的 componentId 相互独立（卸载只清自身）；
 * 7. 纯 effectScope 场景（无组件实例）由 onScopeDispose 兜底清理；
 * 8. componentId 前缀参与泄漏检测聚合（$checkLeaks 的组件前缀维度）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, onMounted, effectScope, type Component, type EffectScope } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import eventBus from '@renderer/common/event-bus/event-bus'
import { useEventBus } from '@renderer/composables/useEventBus'

const mountedWrappers: VueWrapper[] = []

afterEach(() => {
    while (mountedWrappers.length > 0) {
        mountedWrappers.pop()?.unmount()
    }
    vi.restoreAllMocks()
})

/** 事件名带随机后缀，避免不同用例间串扰（EventBus 为进程内单例） */
let seed = 0
function uniqueEvent(name: string): string {
    seed += 1
    return `useEventBus-test-${name}-${seed}-${Date.now()}`
}

/**
 * 测试组件：在 onMounted 中注册（对齐 8 个既有消费方的注册时机），
 * 把收到的负载写入外部数组便于断言。
 */
function makeComponent(eventName: string, received: unknown[]): Component {
    return defineComponent({
        name: 'UseEventBusProbe',
        setup() {
            const { on } = useEventBus({ componentIdPrefix: 'useEventBusProbe' })
            onMounted(() => {
                on(eventName, (payload) => {
                    received.push(payload)
                })
            })
            return () => h('div')
        }
    })
}

describe('useEventBus 注册/派发/解绑', () => {
    it('注册后接收事件负载，并暴露本次调用的 componentId', () => {
        const eventName = uniqueEvent('basic')
        const received: unknown[] = []
        let componentId = ''
        const Probe = defineComponent({
            setup() {
                const bus = useEventBus({ componentIdPrefix: 'basicProbe' })
                componentId = bus.componentId
                bus.on(eventName, (payload) => received.push(payload))
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        eventBus.$emit(eventName, 'hello')
        expect(received).toEqual(['hello'])
        // componentId 形如 `前缀-c<uid>-<序号>`，前缀供泄漏检测按组件聚合
        expect(componentId).toMatch(/^basicProbe-/)
        w.unmount()
    })

    it('off 精确解绑指定处理器（未注册/重复解绑均幂等）', () => {
        const eventName = uniqueEvent('off')
        const received: unknown[] = []
        let offEvent: (
            handledEvent: string,
            handler?: (payload: unknown) => unknown
        ) => void = () => undefined
        const Probe = defineComponent({
            setup() {
                const { on, off } = useEventBus({ componentIdPrefix: 'offProbe' })
                on(eventName, (payload) => received.push(payload))
                offEvent = off
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        eventBus.$emit(eventName, 1)
        expect(received).toEqual([1])

        // off 一个未注册的处理器：不抛错、不影响已注册监听
        offEvent(eventName, () => undefined)
        eventBus.$emit(eventName, 2)
        expect(received).toEqual([1, 2])

        offEvent(eventName)
        eventBus.$emit(eventName, 3)
        expect(received).toEqual([1, 2])
        // 重复 off 幂等
        expect(() => offEvent(eventName)).not.toThrow()
        w.unmount()
    })

    it('on 返回的解绑函数只解绑本次注册', () => {
        const eventName = uniqueEvent('unsubscribe')
        const first: unknown[] = []
        const second: unknown[] = []
        let unsubscribe: () => void = () => undefined
        const Probe = defineComponent({
            setup() {
                const { on } = useEventBus({ componentIdPrefix: 'unsubProbe' })
                unsubscribe = on(eventName, (payload) => first.push(payload))
                on(eventName, (payload) => second.push(payload))
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        unsubscribe()
        eventBus.$emit(eventName, 'x')
        expect(first).toEqual([])
        expect(second).toEqual(['x'])
        w.unmount()
    })

    it('once 选项只派发一次', () => {
        const eventName = uniqueEvent('once')
        const received: unknown[] = []
        const Probe = defineComponent({
            setup() {
                const { on } = useEventBus({ componentIdPrefix: 'onceProbe' })
                on(eventName, (payload) => received.push(payload), { once: true })
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        eventBus.$emit(eventName, 1)
        eventBus.$emit(eventName, 2)
        expect(received).toEqual([1])
        w.unmount()
    })
})

describe('useEventBus 自动清理与幂等', () => {
    it('组件卸载后监听自动失效，监听器计数回落到挂载前基线', () => {
        const eventName = uniqueEvent('auto-cleanup')
        const baseline = eventBus.$stats().totalListeners
        const received: unknown[] = []
        const w = mount(makeComponent(eventName, received))
        mountedWrappers.push(w)

        eventBus.$emit(eventName, 1)
        expect(received).toEqual([1])
        expect(eventBus.$stats().totalListeners).toBe(baseline + 1)

        w.unmount()
        mountedWrappers.splice(mountedWrappers.indexOf(w), 1)

        eventBus.$emit(eventName, 2)
        expect(received).toEqual([1])
        expect(eventBus.$stats().totalListeners).toBe(baseline)
    })

    it('cleanup 幂等：重复调用不抛错，且仅清理一次', () => {
        const eventName = uniqueEvent('idempotent')
        const received: unknown[] = []
        let cleanup: () => void = () => undefined
        const Probe = defineComponent({
            setup() {
                const { on, cleanup: busCleanup } = useEventBus({
                    componentIdPrefix: 'idempotentProbe'
                })
                on(eventName, (payload) => received.push(payload))
                cleanup = busCleanup
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        expect(() => cleanup()).not.toThrow()
        expect(() => cleanup()).not.toThrow()
        eventBus.$emit(eventName, 1)
        expect(received).toEqual([])
        w.unmount()
    })

    it('清理后再注册被静默忽略（防止异步初始化晚到造成常驻监听）', () => {
        const eventName = uniqueEvent('after-cleanup')
        const received: unknown[] = []
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // 用持有器对象记录 setup 内创建的晚到注册函数（避免 TS 把 let 变量窄化为 null）
        const late: { on?: () => void } = {}
        const Probe = defineComponent({
            setup() {
                const { on, cleanup } = useEventBus({ componentIdPrefix: 'lateProbe' })
                late.on = () => {
                    on(eventName, (payload) => received.push(payload))
                }
                cleanup()
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        late.on?.()
        eventBus.$emit(eventName, 1)
        expect(received).toEqual([])
        // 已清理后的注册会留下告警，便于排查异步注册时序
        expect(warnSpy).toHaveBeenCalled()
        w.unmount()
    })

    it('同一组件内多次调用 useEventBus 的清理范围相互独立', () => {
        const eventA = uniqueEvent('independent-a')
        const eventB = uniqueEvent('independent-b')
        const receivedA: unknown[] = []
        const receivedB: unknown[] = []
        let cleanupA: () => void = () => undefined
        const Probe = defineComponent({
            setup() {
                const busA = useEventBus({ componentIdPrefix: 'independentA' })
                const busB = useEventBus({ componentIdPrefix: 'independentB' })
                busA.on(eventA, (payload) => receivedA.push(payload))
                busB.on(eventB, (payload) => receivedB.push(payload))
                cleanupA = busA.cleanup
                return () => h('div')
            }
        })
        const w = mount(Probe)
        mountedWrappers.push(w)

        cleanupA()
        eventBus.$emit(eventA, 'a')
        eventBus.$emit(eventB, 'b')
        expect(receivedA).toEqual([])
        // B 的监听不受 A 的 cleanup 影响
        expect(receivedB).toEqual(['b'])
        w.unmount()
    })

    it('无组件实例的 effectScope 由 onScopeDispose 兜底清理', () => {
        const eventName = uniqueEvent('scope')
        const received: unknown[] = []
        const baseline = eventBus.$stats().totalListeners
        const scope: EffectScope = effectScope()
        scope.run(() => {
            const { on } = useEventBus({ componentIdPrefix: 'scopeProbe' })
            on(eventName, (payload) => received.push(payload))
        })

        eventBus.$emit(eventName, 1)
        expect(received).toEqual([1])
        scope.stop()
        eventBus.$emit(eventName, 2)
        expect(received).toEqual([1])
        expect(eventBus.$stats().totalListeners).toBe(baseline)
    })

    it('componentId 前缀参与泄漏检测聚合（$checkLeaks 组件维度）', () => {
        const eventName = uniqueEvent('leak-prefix')
        // 构造同一前缀下 21 个监听（阈值 COMPONENT_LEAK_THRESHOLD = 20）
        const cleanupFns: Array<() => void> = []
        for (let i = 0; i < 21; i++) {
            const scope = effectScope()
            scope.run(() => {
                const { on, cleanup } = useEventBus({ componentIdPrefix: 'leakBusProbe' })
                on(eventName, () => undefined)
                cleanupFns.push(cleanup)
            })
            cleanupFns.push(() => scope.stop())
        }

        const result = eventBus.$checkLeaks()
        expect(result.hasLeaks).toBe(true)
        expect(result.warnings.some((warning) => warning.includes('leakBusProbe'))).toBe(true)

        for (const cleanup of cleanupFns) {
            cleanup()
        }
    })
})
