// @vitest-environment jsdom

/**
 * useEventBus 组合式函数单元测试
 *
 * 被测模块：src/renderer/src/composables/useEventBus.ts
 * 环境说明：该 composable 通过 getCurrentInstance + onUnmounted 自动清理，
 * 组件内场景使用 @vue/test-utils 挂载测试组件（jsdom 环境），
 * 组件外场景直接调用（Vue 会告警无组件实例，测试中静默该告警）。
 *
 * 覆盖点：组件内/外 componentId 生成、on/emit/off/once 转发、cleanup 隔离性、
 * 组件卸载自动清理、反复挂载不泄漏、空事件名等边界。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, VueWrapper } from '@vue/test-utils'
import { useEventBus } from '../../../src/renderer/src/composables/useEventBus'
import eventBus from '../../../src/renderer/src/common/event-bus/event-bus'

type BusApi = ReturnType<typeof useEventBus>

let buses: BusApi[]
let wrappers: VueWrapper[]
let eventSeq: number

beforeEach(() => {
    buses = []
    wrappers = []
    eventSeq = 0
})

afterEach(() => {
    // 先卸载组件（触发 onUnmounted 自动清理），再兜底 cleanup，避免污染后续用例
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    for (const bus of buses) {
        bus.cleanup()
    }
    vi.restoreAllMocks()
})

/** 生成每个用例独有的事件名，避免用例之间互相干扰 */
function uniqueEventName(prefix = 'use-event-bus-test'): string {
    eventSeq += 1
    return `${prefix}-${eventSeq}`
}

/** 在真实组件上下文中调用 useEventBus（验证 vm componentId 与卸载自动清理） */
function mountBus(): { wrapper: VueWrapper; bus: BusApi } {
    let bus: BusApi | undefined
    const wrapper = mount(
        defineComponent({
            setup() {
                bus = useEventBus()
                return () => null
            }
        })
    )
    wrappers.push(wrapper)
    if (!bus) {
        throw new Error('useEventBus 未在组件 setup 中初始化')
    }
    buses.push(bus)
    return { wrapper, bus }
}

/** 组件外调用 useEventBus：Vue 会对缺失组件实例的 onUnmounted 告警，这里静默 */
function createStandaloneBus(): BusApi {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
        const bus = useEventBus()
        buses.push(bus)
        return bus
    } finally {
        warnSpy.mockRestore()
    }
}

describe('useEventBus component id', () => {
    it('should expose the composable api surface', () => {
        const bus = createStandaloneBus()
        expect(typeof bus.on).toBe('function')
        expect(typeof bus.off).toBe('function')
        expect(typeof bus.emit).toBe('function')
        expect(typeof bus.once).toBe('function')
        expect(typeof bus.cleanup).toBe('function')
        expect(typeof bus.componentId).toBe('string')
    })

    it('should generate unique ids when used outside a component', () => {
        const first = createStandaloneBus()
        const second = createStandaloneBus()

        expect(first.componentId).toMatch(/^useEventBus-\d+-\d+$/)
        expect(second.componentId).toMatch(/^useEventBus-\d+-\d+$/)
        expect(first.componentId).not.toBe(second.componentId)
    })

    it('should use the component vm uid as id inside a component', () => {
        const first = mountBus()
        const second = mountBus()

        expect(first.bus.componentId).toMatch(/^vm-\d+$/)
        expect(second.bus.componentId).toMatch(/^vm-\d+$/)
        expect(first.bus.componentId).not.toBe(second.bus.componentId)
    })
})

describe('useEventBus subscribe and emit', () => {
    it('should receive the emitted payload', () => {
        const bus = createStandaloneBus()
        const eventName = uniqueEventName()
        const callback = vi.fn()

        bus.on(eventName, callback)
        bus.emit(eventName, { filePath: '/data/note.md' })

        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith({ filePath: '/data/note.md' })
    })

    it('should notify every registered listener of the same event', () => {
        const bus = createStandaloneBus()
        const eventName = uniqueEventName()
        const first = vi.fn()
        const second = vi.fn()

        bus.on(eventName, first)
        bus.on(eventName, second)
        bus.emit(eventName, 'payload')

        expect(first).toHaveBeenCalledWith('payload')
        expect(second).toHaveBeenCalledWith('payload')
    })

    it('should stop receiving events after off', () => {
        const bus = createStandaloneBus()
        const eventName = uniqueEventName()
        const removed = vi.fn()
        const kept = vi.fn()

        bus.on(eventName, removed)
        bus.on(eventName, kept)
        bus.off(eventName, removed)
        bus.emit(eventName, 'payload')

        expect(removed).not.toHaveBeenCalled()
        expect(kept).toHaveBeenCalledWith('payload')
    })

    it('should only receive one emission for once listeners', () => {
        const bus = createStandaloneBus()
        const eventName = uniqueEventName()
        const callback = vi.fn()

        bus.once(eventName, callback)
        bus.emit(eventName, 1)
        bus.emit(eventName, 2)

        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith(1)
    })

    it('should tolerate emit/off on events without listeners', () => {
        const bus = createStandaloneBus()
        const eventName = uniqueEventName()

        expect(() => bus.emit(eventName, 'nobody-listens')).not.toThrow()
        expect(() => bus.off(eventName, vi.fn())).not.toThrow()
    })
})

describe('useEventBus cleanup', () => {
    it('should only clean up listeners registered by its own component id', () => {
        const first = createStandaloneBus()
        const second = createStandaloneBus()
        const eventName = uniqueEventName()
        const firstCallback = vi.fn()
        const secondCallback = vi.fn()

        first.on(eventName, firstCallback)
        second.on(eventName, secondCallback)

        first.cleanup()
        eventBus.$emit(eventName, 'payload')

        expect(firstCallback).not.toHaveBeenCalled()
        expect(secondCallback).toHaveBeenCalledWith('payload')
    })

    it('should remove all listeners of the component across events on cleanup', () => {
        const bus = createStandaloneBus()
        const eventA = uniqueEventName()
        const eventB = uniqueEventName()
        const callback = vi.fn()

        bus.on(eventA, callback)
        bus.on(eventB, callback)
        bus.cleanup()

        eventBus.$emit(eventA)
        eventBus.$emit(eventB)

        expect(callback).not.toHaveBeenCalled()
    })

    it('should allow cleanup to be called repeatedly', () => {
        const bus = createStandaloneBus()
        const eventName = uniqueEventName()
        bus.on(eventName, vi.fn())

        expect(() => {
            bus.cleanup()
            bus.cleanup()
        }).not.toThrow()
        expect(eventBus.$stats().totalListeners).toBe(0)
    })

    it('should automatically clean up listeners when the component unmounts', () => {
        const baseline = eventBus.$stats()
        const { wrapper, bus } = mountBus()
        const eventA = uniqueEventName()
        const eventB = uniqueEventName()
        const callbackA = vi.fn()
        const callbackB = vi.fn()

        bus.on(eventA, callbackA)
        bus.on(eventB, callbackB)
        expect(eventBus.$stats().totalListeners).toBe(baseline.totalListeners + 2)

        wrapper.unmount()

        // onUnmounted -> cleanup 后监听器应全部移除，事件回退到空总线
        expect(eventBus.$stats()).toEqual({ totalEvents: 0, totalListeners: 0 })
        eventBus.$emit(eventA)
        eventBus.$emit(eventB)
        expect(callbackA).not.toHaveBeenCalled()
        expect(callbackB).not.toHaveBeenCalled()
    })

    it('should not leak listeners across repeated mount/unmount cycles', () => {
        const eventName = uniqueEventName()
        const baseline = eventBus.$stats().totalListeners

        for (let index = 0; index < 3; index += 1) {
            const { wrapper, bus } = mountBus()
            bus.on(eventName, vi.fn())
            bus.once(eventName, vi.fn())
            expect(eventBus.$stats().totalListeners).toBe(baseline + 2)
            wrapper.unmount()
        }

        expect(eventBus.$stats().totalListeners).toBe(baseline)
        expect(eventBus.$stats().totalEvents).toBe(0)
    })
})
