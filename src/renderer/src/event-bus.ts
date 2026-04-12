interface EventListener {
    callback: Function
    once?: boolean
    componentId?: string // 用于追踪监听器所属组件
}

class EventBus {
    private callbacks: Map<string, Set<EventListener>> = new Map()
    private readonly MAX_LISTENERS_PER_EVENT = 200

    /**
     * 注册事件监听器
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param options 选项 { once: 是否只监听一次, componentId: 组件ID用于自动清理 }
     */
    $on(eventName: string, callback: Function, options?: { once?: boolean; componentId?: string }): void {
        if (!this.callbacks.has(eventName)) {
            this.callbacks.set(eventName, new Set())
        }

        const listeners = this.callbacks.get(eventName)!
        if (listeners.size >= this.MAX_LISTENERS_PER_EVENT) {
            console.warn(`Event "${eventName}" has too many listeners (${listeners.size}), may cause memory leak`)
            return
        }

        listeners.add({
            callback,
            once: options?.once,
            componentId: options?.componentId
        })
    }

    /**
     * 注册一次性事件监听器
     */
    $once(eventName: string, callback: Function, options?: { componentId?: string }): void {
        this.$on(eventName, callback, { ...options, once: true })
    }

    /**
     * 移除事件监听器
     */
    $off(eventName: string, callback: Function): void {
        const listeners = this.callbacks.get(eventName)
        if (!listeners) return

        for (const listener of listeners) {
            if (listener.callback === callback) {
                listeners.delete(listener)
                break
            }
        }

        if (listeners.size === 0) {
            this.callbacks.delete(eventName)
        }
    }

    /**
     * 触发事件
     */
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

        toRemove.forEach(listener => listeners.delete(listener))
    }

    /**
     * 清理指定组件的所有监听器
     * @param componentId 组件ID
     */
    $cleanup(componentId: string): void {
        this.callbacks.forEach((listeners, eventName) => {
            const toRemove: EventListener[] = []
            
            listeners.forEach(listener => {
                if (listener.componentId === componentId) {
                    toRemove.push(listener)
                }
            })
            
            toRemove.forEach(listener => listeners.delete(listener))
            
            if (listeners.size === 0) {
                this.callbacks.delete(eventName)
            }
        })
    }

    /**
     * 清理所有监听器
     */
    $offAll(): void {
        this.callbacks.clear()
    }

    /**
     * 获取事件监听器统计信息（用于调试）
     */
    $stats(): { totalEvents: number; totalListeners: number; eventDetails: Map<string, number> } {
        let totalListeners = 0
        const eventDetails = new Map<string, number>()
        
        this.callbacks.forEach((listeners, eventName) => {
            const count = listeners.size
            totalListeners += count
            eventDetails.set(eventName, count)
        })
        
        return {
            totalEvents: this.callbacks.size,
            totalListeners,
            eventDetails
        }
    }
}

// 导出单例实例
const eventBus = new EventBus()
export default eventBus
