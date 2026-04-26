/**
 * 窗口管理器
 * 用于统一管理所有 BrowserWindow 实例，防止内存泄漏
 */

import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { ipcListenerManager } from './ipc-listener-manager'

interface WindowInfo {
    window: BrowserWindow
    type: string
    createdAt: number
    componentId: string
}

/**
 * 窗口管理器类
 * 提供窗口的创建、获取、关闭和批量清理功能
 */
export class WindowManager {
    private static instance: WindowManager
    private windows: Map<string, WindowInfo> = new Map()
    private typeCounters: Map<string, number> = new Map()

    private constructor() {}

    /**
     * 获取单例实例
     */
    static getInstance(): WindowManager {
        if (!this.instance) {
            this.instance = new WindowManager()
        }
        return this.instance
    }

    /**
     * 创建或获取窗口
     * @param type 窗口类型
     * @param options 窗口配置选项
     * @param componentId 组件标识（用于清理监听器）
     * @param singleton 是否单例模式（如果已存在则返回现有窗口）
     * @returns BrowserWindow 实例
     */
    createWindow(
        type: string,
        options: BrowserWindowConstructorOptions,
        componentId?: string,
        singleton: boolean = true
    ): BrowserWindow {
        // 如果是单例模式，检查是否已存在
        if (singleton) {
            const existingWindow = this.getWindowByType(type)
            if (existingWindow && !existingWindow.isDestroyed()) {
                existingWindow.focus()
                return existingWindow
            }
        }

        // 创建新窗口
        const window = new BrowserWindow(options)
        const windowId = `${type}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
        const actualComponentId = componentId || windowId

        // 记录窗口信息
        const info: WindowInfo = {
            window,
            type,
            createdAt: Date.now(),
            componentId: actualComponentId
        }
        this.windows.set(windowId, info)

        // 更新类型计数器
        const count = this.typeCounters.get(type) || 0
        this.typeCounters.set(type, count + 1)

        // 窗口关闭时自动清理
        window.on('closed', () => {
            this.cleanupWindow(windowId)
        })

        return window
    }

    /**
     * 获取指定类型的窗口
     * @param type 窗口类型
     * @returns BrowserWindow 实例或 null
     */
    getWindowByType(type: string): BrowserWindow | null {
        for (const info of this.windows.values()) {
            if (info.type === type && !info.window.isDestroyed()) {
                return info.window
            }
        }
        return null
    }

    /**
     * 获取所有指定类型的窗口
     * @param type 窗口类型
     * @returns BrowserWindow 数组
     */
    getWindowsByType(type: string): BrowserWindow[] {
        const result: BrowserWindow[] = []
        for (const info of this.windows.values()) {
            if (info.type === type && !info.window.isDestroyed()) {
                result.push(info.window)
            }
        }
        return result
    }

    /**
     * 关闭指定类型的所有窗口
     * @param type 窗口类型
     */
    closeWindowsByType(type: string) {
        const windows = this.getWindowsByType(type)
        windows.forEach(window => {
            if (!window.isDestroyed()) {
                window.close()
            }
        })
    }

    /**
     * 清理单个窗口
     * @param windowId 窗口ID
     */
    private cleanupWindow(windowId: string) {
        const info = this.windows.get(windowId)
        if (!info) return

        // 清理该窗口的 IPC 监听器
        ipcListenerManager.cleanupComponent(info.componentId)

        // 从管理器中移除
        this.windows.delete(windowId)

        // 更新类型计数器
        const count = this.typeCounters.get(info.type) || 0
        if (count > 0) {
            this.typeCounters.set(info.type, count - 1)
        }
    }

    /**
     * 关闭所有窗口
     */
    closeAll() {
        this.windows.forEach((info) => {
            if (!info.window.isDestroyed()) {
                info.window.close()
            }
        })
        this.windows.clear()
        this.typeCounters.clear()
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const typeStats: { [key: string]: number } = {}
        this.typeCounters.forEach((count, type) => {
            typeStats[type] = count
        })

        return {
            totalWindows: this.windows.size,
            typeStats,
            details: Array.from(this.windows.entries()).map(([id, info]) => ({
                id,
                type: info.type,
                createdAt: info.createdAt,
                isDestroyed: info.window.isDestroyed()
            }))
        }
    }

    /**
     * 打印统计信息（用于调试）
     */
    printStats() {
        const stats = this.getStats()
        console.log('[Window Manager] Stats:')
        console.log(`  Total windows: ${stats.totalWindows}`)

        if (Object.keys(stats.typeStats).length > 0) {
            console.log('  By type:')
            Object.entries(stats.typeStats).forEach(([type, count]) => {
                console.log(`    ${type}: ${count}`)
            })
        }
    }
}

// 导出单例实例
export const windowManager = WindowManager.getInstance()
