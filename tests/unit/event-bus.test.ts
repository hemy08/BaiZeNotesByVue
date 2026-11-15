import { describe, it, expect, beforeEach, vi } from 'vitest'
import eventBus from '../../src/renderer/src/common/event-bus/event-bus'

describe('EventBus', () => {
    beforeEach(() => {
        eventBus.$cleanup('test-component')
    })

    it('should register and emit events', () => {
        let received: unknown
        eventBus.$on(
            'test-event',
            (payload) => {
                received = payload
            },
            { componentId: 'test-component' }
        )

        eventBus.$emit('test-event', 'hello')
        expect(received).toBe('hello')
    })

    it('should remove listeners with $off', () => {
        let callCount = 0
        const callback = () => {
            callCount += 1
        }

        eventBus.$on('test-off', callback, { componentId: 'test-component' })
        eventBus.$emit('test-off')
        expect(callCount).toBe(1)

        eventBus.$off('test-off', callback)
        eventBus.$emit('test-off')
        expect(callCount).toBe(1)
    })

    it('should support once option', () => {
        let callCount = 0
        eventBus.$on(
            'test-once',
            () => {
                callCount += 1
            },
            { once: true, componentId: 'test-component' }
        )

        eventBus.$emit('test-once')
        eventBus.$emit('test-once')
        expect(callCount).toBe(1)
    })

    it('should cleanup all listeners for a component', () => {
        let count1 = 0
        let count2 = 0

        eventBus.$on(
            'test-cleanup-1',
            () => {
                count1 += 1
            },
            { componentId: 'test-component' }
        )
        eventBus.$on(
            'test-cleanup-2',
            () => {
                count2 += 1
            },
            { componentId: 'test-component' }
        )

        eventBus.$emit('test-cleanup-1')
        eventBus.$emit('test-cleanup-2')
        expect(count1).toBe(1)
        expect(count2).toBe(1)

        eventBus.$cleanup('test-component')
        eventBus.$emit('test-cleanup-1')
        eventBus.$emit('test-cleanup-2')
        expect(count1).toBe(1)
        expect(count2).toBe(1)
    })

    it('should warn when too many listeners are added', () => {
        const warnSpy = vi.spyOn(console, 'warn')
        for (let i = 0; i < 201; i++) {
            eventBus.$on('test-limit', () => {}, { componentId: 'test-component' })
        }
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    // ==================== MEM-09：$stats 泄漏统计接口 ====================

    it('should report zero events and listeners on an empty bus ($stats)', () => {
        expect(eventBus.$stats()).toEqual({ totalEvents: 0, totalListeners: 0 })
    })

    it('should count total events and listeners in $stats', () => {
        const statsComponent = 'stats-component'
        eventBus.$on('stats-event-1', () => {}, { componentId: statsComponent })
        eventBus.$on('stats-event-1', () => {}, { componentId: statsComponent })
        eventBus.$on('stats-event-2', () => {}, { componentId: statsComponent })

        expect(eventBus.$stats()).toEqual({ totalEvents: 2, totalListeners: 3 })

        eventBus.$cleanup(statsComponent)
        expect(eventBus.$stats()).toEqual({ totalEvents: 0, totalListeners: 0 })
    })

    // ==================== MEM-09：$checkLeaks 泄漏检测接口 ====================

    it('should report no leaks for a clean bus ($checkLeaks)', () => {
        const cleanComponent = 'clean-component'
        eventBus.$on('clean-event', () => {}, { componentId: cleanComponent })
        const result = eventBus.$checkLeaks()
        expect(result.hasLeaks).toBe(false)
        expect(result.warnings).toEqual([])

        eventBus.$cleanup(cleanComponent)
    })

    it('should warn when a single event accumulates too many listeners ($checkLeaks)', () => {
        const eventLeakComponent = 'event-leak-component'
        for (let i = 0; i < 50; i++) {
            eventBus.$on('leak-busy-event', () => {}, { componentId: eventLeakComponent })
        }

        const result = eventBus.$checkLeaks()
        expect(result.hasLeaks).toBe(true)
        expect(result.warnings.length).toBeGreaterThanOrEqual(1)
        expect(result.warnings.some((w) => w.includes('leak-busy-event'))).toBe(true)

        eventBus.$cleanup(eventLeakComponent)
    })

    it('should warn when listeners accumulate under the same component prefix ($checkLeaks)', () => {
        // 注意：getComponentPrefix 将 '-' 与 '/' 都视为分隔符，
        // 'leak-dialog/x' 的前缀是 'leak'，此处用不含 '-' 的 id 使前缀为 'leakdialog'
        const compA = 'leakdialog/first-instance'
        const compB = 'leakdialog/second-instance'
        for (let i = 0; i < 12; i++) {
            eventBus.$on('leak-evt-a', () => {}, { componentId: compA })
        }
        for (let i = 0; i < 8; i++) {
            eventBus.$on('leak-evt-b', () => {}, { componentId: compB })
        }

        const result = eventBus.$checkLeaks()
        expect(result.hasLeaks).toBe(true)
        expect(result.warnings.some((w) => w.includes('leakdialog'))).toBe(true)

        eventBus.$cleanup(compA)
        eventBus.$cleanup(compB)
    })

    it('should not warn when the same prefix stays below the threshold ($checkLeaks)', () => {
        const compC = 'quietdialog/one'
        const compD = 'quietdialog/two'
        for (let i = 0; i < 10; i++) {
            eventBus.$on('quiet-evt', () => {}, { componentId: compC })
        }
        for (let i = 0; i < 9; i++) {
            eventBus.$on('quiet-evt', () => {}, { componentId: compD })
        }

        const result = eventBus.$checkLeaks()
        expect(result.hasLeaks).toBe(false)
        expect(result.warnings).toEqual([])

        eventBus.$cleanup(compC)
        eventBus.$cleanup(compD)
    })
})
