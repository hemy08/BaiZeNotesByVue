/**
 * IPC 监听器管理器
 * 用于统一管理所有 IPC 监听器，防止内存泄漏
 */

import { ipcMain, IpcMainEvent } from 'electron'

interface ListenerInfo {
    channel: string
    listener: (event: IpcMainEvent, ...args: any[]) => void
    componentId: string
    registeredAt: number
}

/**
 * IPC 监听器管理器类
 * 提供监听器的注册、注销和批量清理功能
 */
export class IPCListenerManager {
    private static instance: IPCListenerManager
    private listeners: Map<string, ListenerInfo[]> = new Map()
    private componentListeners: Map<string, Set<string>> = new Map()

    private constructor() {}

    /**
     * 获取单例实例
     */
    static getInstance(): IPCListenerManager {
        if (!this.instance) {
            this.instance = new IPCListenerManager()
        }
        return this.instance
    }

    /**
     * 注册 IPC 监听器
     * @param channel IPC 通道名称
     * @param listener 监听器函数
     * @param componentId 组件标识（用于批量清理）
     * @returns 监听器 ID
     */
    register(
        channel: string,
        listener: (event: IpcMainEvent, ...args: any[]) => void,
        componentId: string = 'global'
    ): string {
        // 注册到 ipcMain
        ipcMain.on(channel, listener)

        // 记录监听器信息
        const listenerId = `${channel}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const info: ListenerInfo = {
            channel,
            listener,
            componentId,
            registeredAt: Date.now()
        }

        // 按通道存储
        if (!this.listeners.has(channel)) {
            this.listeners.set(channel, [])
        }
        this.listeners.get(channel)!.push(info)

        // 按组件存储
        if (!this.componentListeners.has(componentId)) {
            this.componentListeners.set(componentId, new Set())
        }
        this.componentListeners.get(componentId)!.add(listenerId)

        return listenerId
    }

    /**
     * 注销单个监听器
     * @param channel IPC 通道名称
     * @param listener 监听器函数
     */
    unregister(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
        ipcMain.removeListener(channel, listener)

        // 从记录中移除
        const channelListeners = this.listeners.get(channel)
        if (channelListeners) {
            const index = channelListeners.findIndex(info => info.listener === listener)
            if (index !== -1) {
                const info = channelListeners[index]
                channelListeners.splice(index, 1)

                // 从组件记录中移除
                const componentSet = this.componentListeners.get(info.componentId)
                if (componentSet) {
                    componentSet.forEach(listenerId => {
                        if (listenerId.startsWith(channel)) {
                            componentSet.delete(listenerId)
                        }
                    })
                }
            }
        }
    }

    /**
     * 清理指定组件的所有监听器
     * @param componentId 组件标识
     */
    cleanupComponent(componentId: string) {
        const listenerIds = this.componentListeners.get(componentId)
        if (!listenerIds) return

        // 遍历该组件的所有监听器
        listenerIds.forEach(listenerId => {
            const [channel] = listenerId.split(':')
            const channelListeners = this.listeners.get(channel)
            
            if (channelListeners) {
                // 找到并移除该组件在该通道的所有监听器
                const toRemove = channelListeners.filter(info => info.componentId === componentId)
                toRemove.forEach(info => {
                    ipcMain.removeListener(channel, info.listener)
                })
                
                // 更新记录
                const remaining = channelListeners.filter(info => info.componentId !== componentId)
                if (remaining.length === 0) {
                    this.listeners.delete(channel)
                } else {
                    this.listeners.set(channel, remaining)
                }
            }
        })

        // 清理组件记录
        this.componentListeners.delete(componentId)
    }

    /**
     * 清理指定通道的所有监听器
     * @param channel IPC 通道名称
     */
    cleanupChannel(channel: string) {
        const channelListeners = this.listeners.get(channel)
        if (!channelListeners) return

        // 移除所有监听器
        channelListeners.forEach(info => {
            ipcMain.removeListener(channel, info.listener)
            
            // 从组件记录中移除
            const componentSet = this.componentListeners.get(info.componentId)
            if (componentSet) {
                componentSet.forEach(listenerId => {
                    if (listenerId.startsWith(channel)) {
                        componentSet.delete(listenerId)
                    }
                })
            }
        })

        // 删除通道记录
        this.listeners.delete(channel)
    }

    /**
     * 清理所有监听器
     */
    cleanupAll() {
        this.listeners.forEach((channelListeners, channel) => {
            channelListeners.forEach(info => {
                ipcMain.removeListener(channel, info.listener)
            })
        })
        
        this.listeners.clear()
        this.componentListeners.clear()
    }

    /**
     * 获取统计信息
     */
    getStats() {
        let totalListeners = 0
        this.listeners.forEach(listeners => {
            totalListeners += listeners.length
        })

        return {
            totalChannels: this.listeners.size,
            totalListeners,
            totalComponents: this.componentListeners.size,
            details: Array.from(this.listeners.entries()).map(([channel, listeners]) => ({
                channel,
                count: listeners.length,
                components: Array.from(new Set(listeners.map(l => l.componentId)))
            }))
        }
    }

    /**
     * 打印统计信息（用于调试）
     */
    printStats() {
        const stats = this.getStats()
        console.log('[IPC Listener Manager] Stats:')
        console.log(`  Total channels: ${stats.totalChannels}`)
        console.log(`  Total listeners: ${stats.totalListeners}`)
        console.log(`  Total components: ${stats.totalComponents}`)
        
        if (stats.details.length > 0) {
            console.log('  Details:')
            stats.details.forEach(detail => {
                console.log(`    ${detail.channel}: ${detail.count} listeners (${detail.components.join(', ')})`)
            })
        }
    }
}

// 导出单例实例
export const ipcListenerManager = IPCListenerManager.getInstance()
