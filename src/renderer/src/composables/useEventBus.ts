/**
 * Vue组合式API - EventBus监听器自动管理
 * 自动在组件卸载时清理所有监听器，防止内存泄漏
 */

import { onUnmounted, getCurrentInstance } from 'vue'
import EventBus from '../event-bus'

/**
 * 使用EventBus监听器，自动清理
 * 
 * @example
 * ```typescript
 * import { useEventBus } from '@/composables/useEventBus'
 * 
 * export default {
 *   setup() {
 *     const { on, once, emit } = useEventBus()
 *     
 *     // 自动清理的监听器
 *     on('event-name', (data) => {
 *       console.log(data)
 *     })
 *     
 *     // 一次性监听器
 *     once('another-event', (data) => {
 *       console.log(data)
 *     })
 *     
 *     // 触发事件
 *     emit('some-event', { message: 'hello' })
 *   }
 * }
 * ```
 */
export function useEventBus() {
    // 获取当前组件实例
    const instance = getCurrentInstance()
    const componentId = instance?.uid?.toString() || `anonymous-${Date.now()}-${Math.random()}`
    
    // 组件卸载时自动清理
    onUnmounted(() => {
        EventBus.$cleanup(componentId)
    })
    
    /**
     * 注册事件监听器（自动清理）
     */
    const on = (eventName: string, callback: Function) => {
        EventBus.$on(eventName, callback, { componentId })
    }
    
    /**
     * 注册一次性事件监听器（自动清理）
     */
    const once = (eventName: string, callback: Function) => {
        EventBus.$once(eventName, callback, { componentId })
    }
    
    /**
     * 触发事件
     */
    const emit = (eventName: string, payload?: any) => {
        EventBus.$emit(eventName, payload)
    }
    
    /**
     * 手动移除监听器
     */
    const off = (eventName: string, callback: Function) => {
        EventBus.$off(eventName, callback)
    }
    
    return {
        on,
        once,
        emit,
        off,
        componentId
    }
}

/**
 * 使用EventBus统计信息（用于调试）
 */
export function useEventBusStats() {
    const getStats = () => {
        return EventBus.$stats()
    }
    
    const checkLeaks = () => {
        return EventBus.$checkLeaks()
    }
    
    return {
        getStats,
        checkLeaks
    }
}
