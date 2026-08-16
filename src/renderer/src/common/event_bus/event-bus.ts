interface EventListener {
    callback: Function
    once?: boolean
    componentId?: string
}

class EventBus {
    private callbacks: Map<string, Set<EventListener>> = new Map()
    private readonly MAX_LISTENERS_PER_EVENT = 200
    private componentListeners: Map<string, Set<{ eventName: string; listener: EventListener }>> = new Map()

    $on(eventName: string, callback: Function, options?: { once?: boolean; componentId?: string }): void {
        if (!this.callbacks.has(eventName)) {
            this.callbacks.set(eventName, new Set())
        }

        const listeners = this.callbacks.get(eventName)!
        if (listeners.size >= this.MAX_LISTENERS_PER_EVENT) {
            console.warn(`Event "${eventName}" has too many listeners (${listeners.size}), may cause memory leak`)
            return
        }

        const listener: EventListener = {
            callback,
            once: options?.once,
            componentId: options?.componentId
        }

        listeners.add(listener)

        if (options?.componentId) {
            if (!this.componentListeners.has(options.componentId)) {
                this.componentListeners.set(options.componentId, new Set())
            }
            this.componentListeners.get(options.componentId)!.add({ eventName, listener })
        }
    }

    $off(eventName: string, callback: Function): void {
        const listeners = this.callbacks.get(eventName)
        if (!listeners) return

        for (const listener of listeners) {
            if (listener.callback === callback) {
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

    $emit(eventName: string, payload?: any): void {
        const listeners = this.callbacks.get(eventName)
        if (!listeners) return

        const toRemove: EventListener[] = []

        listeners.forEach(listener => {
            try {
                listener.callback(payload)
                if (listener.once) {
                    toRemove.push(listener)
                }
            } catch (error) {
                console.error(`Error in event listener for "${eventName}":`, error)
            }
        })

        toRemove.forEach(listener => {
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
}

const eventBus = new EventBus()
export default eventBus
