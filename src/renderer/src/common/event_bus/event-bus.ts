interface EventListener {
    callback: Function
    once?: boolean
    componentId?: string // 用于追踪监听器所属组件
}

class EventBus {
    private callbacks: Map<string, Set<EventListener>> = new Map()
    private readonly MAX_LISTENERS_PER_EVENT = 200
    // 组件监听器映射，用于快速清理
    private componentListeners: Map<string, Set<{ eventName: string; listener: EventListener }>> = new Map()

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

        const listener: EventListener = {
            callback,
            once: options?.once,
            componentId: options?.componentId
        }

        listeners.add(listener)

        // 如果有componentId，添加到组件映射中
        if (options?.componentId) {
            if (!this.componentListeners.has(options.componentId)) {
                this.componentListeners.set(options.componentId, new Set())
            }
            this.componentListeners.get(options.componentId)!.add({ eventName, listener })
        }
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
                
                // 从组件映射中移除
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

        // 移除一次性监听器
        toRemove.forEach(listener => {
            listeners.delete(listener)
            
            // 从组件映射中移除
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

    /**
     * 清理指定组件的所有监听器（优化版本，使用映射快速清理）
     * @param componentId 组件ID
     */
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
     * 清理所有监听器
     */
    $offAll(): void {
        this.callbacks.clear()
        this.componentListeners.clear()
    }

    /**
     * 获取事件监听器统计信息（用于调试）
     */
    $stats(): { 
        totalEvents: number
        totalListeners: number
        eventDetails: Map<string, number>
        componentDetails: Map<string, number>
    } {
        let totalListeners = 0
        const eventDetails = new Map<string, number>()
        
        this.callbacks.forEach((listeners, eventName) => {
            const count = listeners.size
            totalListeners += count
            eventDetails.set(eventName, count)
        })

        const componentDetails = new Map<string, number>()
        this.componentListeners.forEach((set, componentId) => {
            componentDetails.set(componentId, set.size)
        })
        
        return {
            totalEvents: this.callbacks.size,
            totalListeners,
            eventDetails,
            componentDetails
        }
    }

    /**
     * 检测潜在的内存泄漏（用于开发环境调试）
     */
    $checkLeaks(): { hasLeaks: boolean; warnings: string[] } {
        const warnings: string[] = []
        
        // 检查事件监听器数量
        this.callbacks.forEach((listeners, eventName) => {
            if (listeners.size > 50) {
                warnings.push(`Event "${eventName}" has ${listeners.size} listeners, potential memory leak`)
            }
        })

        // 检查组件监听器数量
        this.componentListeners.forEach((set, componentId) => {
            if (set.size > 20) {
                warnings.push(`Component "${componentId}" has ${set.size} listeners, may not be cleaned up properly`)
            }
        })

        return {
            hasLeaks: warnings.length > 0,
            warnings
        }
    }
}

// 导出单例实例
const eventBus = new EventBus()
export default eventBus
