/**
 * IPC 监听器管理器
 * 用于统一管理所有 IPC 监听器，防止内存泄漏
 *
 * MEM-10：扩展"全局一次性注册 + 登记库存清单"能力：
 * - registerOnce()：ipcMain.on 的全局一次性注册（重复调用跳过，防 ARC-06 回归）；
 * - registerHandleOnce()：ipcMain.handle 的全局一次性注册（Electron 对重复 handle 会抛错，
 *   此处捕获并跳过，防 ARC-06 回归）；
 * - persistent 标记：进程级全局注册不随 cleanupAll() 清理，与迁移前直连注册
 *   "从未被清理"的行为保持一致（避免 macOS window-all-closed 后 activate 重建窗口
 *   时主 IPC 处理器全部失效）；
 * - inventory()：导出库存清单快照，供测试与诊断使用。
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- 本文件是 IPC 监听器注册表边界，
   监听器签名镜像 Electron ipcMain 自身类型（(event, ...args: any[]) => void），
   参数类型随通道语义各异，无法在注册表内统一具体化；调用点各自声明参数类型。 */

import { ipcMain, IpcMainEvent } from 'electron'

interface ListenerInfo {
    /** 注册时生成的唯一 ID（库存清单用） */
    id: string
    channel: string
    listener: (...args: any[]) => any
    componentId: string
    registeredAt: number
    /** 注册方式：ipcMain.on 或 ipcMain.handle */
    kind: 'on' | 'handle'
    /** 进程级全局一次性注册：cleanupAll() 不清理（仅退出时由 OS 回收） */
    persistent: boolean
}

export class IPCListenerManager {
    private static instance: IPCListenerManager
    private listeners: Map<string, ListenerInfo[]> = new Map()
    // A-5/MEM-08：直接存 ListenerInfo 引用，而不是"channel:时间戳:随机数"拼接
    // 的 listenerId。原实现清理时用 split(':') 取 channel，通道名本身含冒号
    // （如 'baize:file:open-select-file'）时会被截断导致 removeListener 静默失败。
    private componentListeners: Map<string, Set<ListenerInfo>> = new Map()

    private constructor() {
        // 单例模式：私有构造函数，禁止外部实例化
        void 0
    }

    static getInstance(): IPCListenerManager {
        if (!this.instance) {
            this.instance = new IPCListenerManager()
        }
        return this.instance
    }

    /**
     * 注册 ipcMain.on 监听器（随组件生命周期清理，语义保持不变）。
     * 防重复：同一通道已登记过完全相同的 listener 函数引用时跳过，
     * 避免误调用导致监听器累积（ARC-06 类问题）。
     * @returns 监听器唯一 ID
     */
    register(
        channel: string,
        listener: (event: IpcMainEvent, ...args: any[]) => void,
        componentId: string = 'global'
    ): string {
        // CQ-15：一次 find 同时完成"是否重复"判断与重复项取用，避免 some + find 的重复遍历
        // 与非空断言（find 结果与 some 结果的成立条件完全一致）。
        const duplicate = this.listeners.get(channel)?.find((info) => info.listener === listener)
        if (duplicate) {
            console.warn(
                `[IPCListenerManager] 通道 "${channel}" 已登记相同的监听器函数，跳过重复注册`
            )
            return duplicate.id
        }

        ipcMain.on(channel, listener)

        const listenerId = `${channel}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const info: ListenerInfo = {
            id: listenerId,
            channel,
            listener,
            componentId,
            registeredAt: Date.now(),
            kind: 'on',
            persistent: false
        }

        const channelListeners = this.listeners.get(channel)
        if (channelListeners) {
            channelListeners.push(info)
        } else {
            this.listeners.set(channel, [info])
        }

        const componentSet = this.componentListeners.get(componentId)
        if (componentSet) {
            componentSet.add(info)
        } else {
            this.componentListeners.set(componentId, new Set([info]))
        }

        return listenerId
    }

    /**
     * MEM-10：ipcMain.on 的"全局一次性注册"（进程生命周期级，persistent）。
     * 以 ipcMain 实际状态为准判重：真实运行环境下 ipcMain 提供 listenerCount
     * 查询能力，已注册则警告并跳过；重复调用（如误将注册函数重复执行）不会
     * 累积监听器，防 ARC-06 类问题回归。
     * @returns 监听器唯一 ID；通道已注册时返回 null
     */
    registerOnce(
        channel: string,
        listener: (event: IpcMainEvent, ...args: any[]) => void,
        componentId: string = 'global'
    ): string | null {
        // 真实 Electron 环境：ipcMain 为 EventEmitter，提供 listenerCount 查询
        if (typeof ipcMain.listenerCount === 'function' && ipcMain.listenerCount(channel) > 0) {
            console.warn(
                `[IPCListenerManager] 通道 "${channel}" 已注册（listenerCount=${ipcMain.listenerCount(channel)}），跳过重复注册`
            )
            return null
        }

        ipcMain.on(channel, listener)

        const listenerId = `${channel}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const info: ListenerInfo = {
            id: listenerId,
            channel,
            listener,
            componentId,
            registeredAt: Date.now(),
            kind: 'on',
            persistent: true
        }

        const channelListeners = this.listeners.get(channel)
        if (channelListeners) {
            channelListeners.push(info)
        } else {
            this.listeners.set(channel, [info])
        }

        const componentSet = this.componentListeners.get(componentId)
        if (componentSet) {
            componentSet.add(info)
        } else {
            this.componentListeners.set(componentId, new Set([info]))
        }

        return listenerId
    }

    /**
     * MEM-10：ipcMain.handle 的"全局一次性注册"（进程生命周期级，persistent）。
     * Electron 对同一通道重复 handle 会抛错，此处捕获并跳过，防 ARC-06 类问题回归。
     * @returns 监听器唯一 ID；通道已有处理器时返回 null
     */
    registerHandleOnce(
        channel: string,
        listener: (...args: any[]) => any,
        componentId: string = 'global'
    ): string | null {
        try {
            ipcMain.handle(channel, listener)
        } catch (error) {
            console.warn(
                `[IPCListenerManager] 通道 "${channel}" 已存在 handle 处理器，跳过重复注册:`,
                error instanceof Error ? error.message : error
            )
            return null
        }

        const listenerId = `${channel}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const info: ListenerInfo = {
            id: listenerId,
            channel,
            listener,
            componentId,
            registeredAt: Date.now(),
            kind: 'handle',
            persistent: true
        }

        const channelListeners = this.listeners.get(channel)
        if (channelListeners) {
            channelListeners.push(info)
        } else {
            this.listeners.set(channel, [info])
        }

        const componentSet = this.componentListeners.get(componentId)
        if (componentSet) {
            componentSet.add(info)
        } else {
            this.componentListeners.set(componentId, new Set([info]))
        }

        return listenerId
    }

    unregister(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
        const channelListeners = this.listeners.get(channel)
        if (!channelListeners) {
            return
        }

        const index = channelListeners.findIndex((info) => info.listener === listener)
        if (index === -1) {
            return
        }

        const info = channelListeners[index]
        this.removeFromIpcMain(info)
        channelListeners.splice(index, 1)

        // A-5/MEM-08：按 ListenerInfo 引用精确移除，不依赖 listenerId 前缀匹配
        const componentSet = this.componentListeners.get(info.componentId)
        if (componentSet) {
            componentSet.delete(info)
        }

        if (channelListeners.length === 0) {
            this.listeners.delete(channel)
        }
    }

    cleanupComponent(componentId: string) {
        const infos = this.componentListeners.get(componentId)
        if (!infos) return

        // A-5/MEM-08：直接用 ListenerInfo 中的 channel 字段移除监听器，
        // 不再对 listenerId 做 split(':') 截断通道名。
        infos.forEach((info) => {
            this.removeFromIpcMain(info)

            const channelListeners = this.listeners.get(info.channel)
            if (channelListeners) {
                const remaining = channelListeners.filter((item) => item !== info)
                if (remaining.length === 0) {
                    this.listeners.delete(info.channel)
                } else {
                    this.listeners.set(info.channel, remaining)
                }
            }
        })

        this.componentListeners.delete(componentId)
    }

    cleanupChannel(channel: string) {
        const channelListeners = this.listeners.get(channel)
        if (!channelListeners) return

        channelListeners.forEach((info) => {
            this.removeFromIpcMain(info)

            const componentSet = this.componentListeners.get(info.componentId)
            if (componentSet) {
                componentSet.delete(info)
            }
        })

        this.listeners.delete(channel)
    }

    cleanupAll() {
        this.listeners.forEach((channelListeners, channel) => {
            channelListeners.forEach((info) => {
                // MEM-10：persistent（进程级全局一次性注册）不随 cleanupAll 清理。
                // 迁移前的直连注册从未被清理，若此处一并移除，macOS 在
                // window-all-closed 后 activate 重建窗口时主 IPC 处理器将全部失效。
                if (info.persistent) {
                    return
                }
                this.removeFromIpcMain(info)
            })

            const remaining = channelListeners.filter((info) => info.persistent)
            if (remaining.length === 0) {
                this.listeners.delete(channel)
            } else {
                this.listeners.set(channel, remaining)
            }
        })

        // 保留 persistent 注册对应的 componentId 记录
        const persistentComponents = new Map<string, Set<ListenerInfo>>()
        this.componentListeners.forEach((infos, componentId) => {
            const remaining = new Set<ListenerInfo>()
            infos.forEach((info) => {
                if (info.persistent) {
                    remaining.add(info)
                }
            })
            if (remaining.size > 0) {
                persistentComponents.set(componentId, remaining)
            }
        })
        this.componentListeners.clear()
        persistentComponents.forEach((infos, componentId) => {
            this.componentListeners.set(componentId, infos)
        })
    }

    /**
     * 按注册方式从 ipcMain 移除监听器（on → removeListener；handle → removeHandler）
     */
    private removeFromIpcMain(info: ListenerInfo) {
        if (info.kind === 'handle') {
            ipcMain.removeHandler(info.channel)
        } else {
            ipcMain.removeListener(info.channel, info.listener)
        }
    }

    getStats() {
        let totalListeners = 0
        this.listeners.forEach((listeners) => {
            totalListeners += listeners.length
        })

        return {
            totalChannels: this.listeners.size,
            totalListeners,
            totalComponents: this.componentListeners.size,
            details: Array.from(this.listeners.entries()).map(([channel, listeners]) => ({
                channel,
                count: listeners.length,
                components: Array.from(new Set(listeners.map((l) => l.componentId)))
            }))
        }
    }

    /**
     * MEM-10：库存清单快照——按通道汇总注册情况，供测试与诊断使用。
     */
    getInventory() {
        return Array.from(this.listeners.entries()).map(([channel, infos]) => ({
            channel,
            kind: infos[0]?.kind ?? null,
            persistent: infos.some((info) => info.persistent),
            count: infos.length,
            components: Array.from(new Set(infos.map((info) => info.componentId))),
            registeredAt: infos[0]?.registeredAt ?? null
        }))
    }
}

export const ipcListenerManager = IPCListenerManager.getInstance()

/**
 * MEM-10：导出库存清单快照（全局函数），供测试断言注册登记情况。
 */
export function inventory() {
    return ipcListenerManager.getInventory()
}
