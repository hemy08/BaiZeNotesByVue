import { describe, it, expect, beforeEach, vi } from 'vitest'
import eventBus from '../../src/renderer/src/common/event_bus/event-bus'

describe('EventBus', () => {
    beforeEach(() => {
        eventBus.$cleanup('test-component')
    })

    it('should register and emit events', () => {
        let received: unknown
        eventBus.$on('test-event', (payload) => {
            received = payload
        }, { componentId: 'test-component' })

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
        eventBus.$on('test-once', () => {
            callCount += 1
        }, { once: true, componentId: 'test-component' })

        eventBus.$emit('test-once')
        eventBus.$emit('test-once')
        expect(callCount).toBe(1)
    })

    it('should cleanup all listeners for a component', () => {
        let count1 = 0
        let count2 = 0

        eventBus.$on('test-cleanup-1', () => {
            count1 += 1
        }, { componentId: 'test-component' })
        eventBus.$on('test-cleanup-2', () => {
            count2 += 1
        }, { componentId: 'test-component' })

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
})