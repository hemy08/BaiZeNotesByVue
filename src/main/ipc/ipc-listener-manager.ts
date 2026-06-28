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

export class IPCListenerManager {
    private static instance: IPCListenerManager
    private listeners: Map<string, ListenerInfo[]> = new Map()
    private componentListeners: Map<string, Set<string>> = new Map()

    private constructor() {}

    static getInstance(): IPCListenerManager {
        if (!this.instance) {
            this.instance = new IPCListenerManager()
        }
        return this.instance
    }

    register(
        channel: string,
        listener: (event: IpcMainEvent, ...args: any[]) => void,
        componentId: string = 'global'
    ): string {
        ipcMain.on(channel, listener)

        const listenerId = `${channel}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const info: ListenerInfo = {
            channel,
            listener,
            componentId,
            registeredAt: Date.now()
        }

        if (!this.listeners.has(channel)) {
            this.listeners.set(channel, [])
        }
        this.listeners.get(channel)!.push(info)

        if (!this.componentListeners.has(componentId)) {
            this.componentListeners.set(componentId, new Set())
        }
        this.componentListeners.get(componentId)!.add(listenerId)

        return listenerId
    }

    unregister(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
        ipcMain.removeListener(channel, listener)

        const channelListeners = this.listeners.get(channel)
        if (channelListeners) {
            const index = channelListeners.findIndex(info => info.listener === listener)
            if (index !== -1) {
                const info = channelListeners[index]
                channelListeners.splice(index, 1)

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

    cleanupComponent(componentId: string) {
        const listenerIds = this.componentListeners.get(componentId)
        if (!listenerIds) return

        listenerIds.forEach(listenerId => {
            const [channel] = listenerId.split(':')
            const channelListeners = this.listeners.get(channel)
            
            if (channelListeners) {
                const toRemove = channelListeners.filter(info => info.componentId === componentId)
                toRemove.forEach(info => {
                    ipcMain.removeListener(channel, info.listener)
                })
                
                const remaining = channelListeners.filter(info => info.componentId !== componentId)
                if (remaining.length === 0) {
                    this.listeners.delete(channel)
                } else {
                    this.listeners.set(channel, remaining)
                }
            }
        })

        this.componentListeners.delete(componentId)
    }

    cleanupChannel(channel: string) {
        const channelListeners = this.listeners.get(channel)
        if (!channelListeners) return

        channelListeners.forEach(info => {
            ipcMain.removeListener(channel, info.listener)
            
            const componentSet = this.componentListeners.get(info.componentId)
            if (componentSet) {
                componentSet.forEach(listenerId => {
                    if (listenerId.startsWith(channel)) {
                        componentSet.delete(listenerId)
                    }
                })
            }
        })

        this.listeners.delete(channel)
    }

    cleanupAll() {
        this.listeners.forEach((channelListeners, channel) => {
            channelListeners.forEach(info => {
                ipcMain.removeListener(channel, info.listener)
            })
        })
        
        this.listeners.clear()
        this.componentListeners.clear()
    }

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

    printStats() {
    }
}

export const ipcListenerManager = IPCListenerManager.getInstance()