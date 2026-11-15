/**
 * 窗口管理器
 * 用于统一管理所有 BrowserWindow 实例，防止内存泄漏
 */

import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'

interface WindowInfo {
    window: BrowserWindow
    type: string
    createdAt: number
    componentId: string
}

export class WindowManager {
    private static instance: WindowManager
    private windows: Map<string, WindowInfo> = new Map()
    private typeCounters: Map<string, number> = new Map()

    private constructor() {
        // 单例模式：私有构造函数，禁止外部实例化
        void 0
    }

    static getInstance(): WindowManager {
        if (!this.instance) {
            this.instance = new WindowManager()
        }
        return this.instance
    }

    createWindow(
        type: string,
        options: BrowserWindowConstructorOptions,
        componentId?: string,
        singleton: boolean = true
    ): BrowserWindow {
        if (singleton) {
            const existingWindow = this.getWindowByType(type)
            if (existingWindow && !existingWindow.isDestroyed()) {
                existingWindow.focus()
                return existingWindow
            }
        }

        const window = new BrowserWindow(options)
        const windowId = `${type}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const actualComponentId = componentId || windowId

        const info: WindowInfo = {
            window,
            type,
            createdAt: Date.now(),
            componentId: actualComponentId
        }
        this.windows.set(windowId, info)

        const count = this.typeCounters.get(type) || 0
        this.typeCounters.set(type, count + 1)

        window.on('closed', () => {
            this.cleanupWindow(windowId)
        })

        return window
    }

    getWindowByType(type: string): BrowserWindow | null {
        for (const info of this.windows.values()) {
            if (info.type === type && !info.window.isDestroyed()) {
                return info.window
            }
        }
        return null
    }

    getWindowsByType(type: string): BrowserWindow[] {
        const result: BrowserWindow[] = []
        for (const info of this.windows.values()) {
            if (info.type === type && !info.window.isDestroyed()) {
                result.push(info.window)
            }
        }
        return result
    }

    closeWindowsByType(type: string) {
        const windows = this.getWindowsByType(type)
        windows.forEach((window) => {
            if (!window.isDestroyed()) {
                window.close()
            }
        })
    }

    private cleanupWindow(windowId: string) {
        const info = this.windows.get(windowId)
        if (!info) return

        ipcListenerManager.cleanupComponent(info.componentId)

        this.windows.delete(windowId)

        const count = this.typeCounters.get(info.type) || 0
        if (count > 0) {
            this.typeCounters.set(info.type, count - 1)
        }
    }

    closeAll() {
        this.windows.forEach((info) => {
            if (!info.window.isDestroyed()) {
                info.window.close()
            }
        })
        this.windows.clear()
        this.typeCounters.clear()
    }

    // A-5/ARC-15：已删除 getStats()/printStats() 死代码。
    // 二者为仅供调试的窗口统计链（printStats 是 getStats 的唯一调用方），
    // 全库（含测试）grep 零调用；窗口生命周期治理已在 cleanupWindow/closeAll 内完成。
}

export const windowManager = WindowManager.getInstance()
