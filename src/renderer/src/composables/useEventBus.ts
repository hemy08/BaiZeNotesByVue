import { getCurrentInstance, onUnmounted } from 'vue'
import eventBus from '../common/event_bus/event-bus'

let componentIdCounter = 0

function generateComponentId(): string {
    componentIdCounter += 1
    return `useEventBus-${componentIdCounter}-${Date.now()}`
}

export function useEventBus() {
    const instance = getCurrentInstance()
    const componentId = instance
        ? `vm-${instance.uid}`
        : generateComponentId()

    function on(eventName: string, callback: (...args: unknown[]) => void, options?: { once?: boolean }): void {
        eventBus.$on(eventName, callback, { ...options, componentId })
    }

    function off(eventName: string, callback: (...args: unknown[]) => void): void {
        eventBus.$off(eventName, callback)
    }

    function emit(eventName: string, payload?: unknown): void {
        eventBus.$emit(eventName, payload)
    }

    function once(eventName: string, callback: (...args: unknown[]) => void): void {
        on(eventName, callback, { once: true })
    }

    function cleanup(): void {
        eventBus.$cleanup(componentId)
    }

    onUnmounted(() => {
        cleanup()
    })

    return { on, off, emit, once, cleanup, componentId }
}