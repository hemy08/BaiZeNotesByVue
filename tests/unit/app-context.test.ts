/**
 * 主进程全局上下文（src/main/app-context.ts）单元测试
 *
 * 结构优化第 2 批 2.4（M1）：验证 AppContext 的默认值、单例语义与 resetAppContext 的
 * 整体复位能力（窗口重建/单测复用依赖它）：
 * - createDefaultAppContext 每次返回独立对象（互不共享引用）；
 * - getAppContext 返回同一单例，reset 后仍是可用的新默认上下文；
 * - resetAppContext 清空全部业务模块迁入的状态（主窗口/欢迎页/快捷键/退出/握手/启动恢复等）；
 * - resetAppContext 取消挂起的启动恢复兜底计时器（避免复位后旧计时器触发恢复）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createDefaultAppContext, getAppContext, resetAppContext } from '../../src/main/app-context'

beforeEach(() => {
    resetAppContext()
})

afterEach(() => {
    vi.useRealTimers()
    resetAppContext()
})

describe('createDefaultAppContext', () => {
    it('should return a fully reset context with independent nested groups', () => {
        const context = createDefaultAppContext()
        expect(context.mainWindow).toBeNull()
        expect(context.welcome.mainViewEntered).toBe(false)
        expect(context.shortKeys.registered).toBe(false)
        expect(context.shortKeys.targetWindow).toBeNull()
        expect(context.quit.isQuitting).toBe(false)
        expect(context.quit.flushedForQuit).toBe(false)
        expect(context.quit.flushedForClose).toBe(false)
        // P2-6/P2-7：关闭确认重入保护与「重启应用」意图
        expect(context.quit.confirming).toBe(false)
        expect(context.quit.pendingRelaunch).toBe(false)
        // P1-9：更新安装中标志（安装路径 before-quit 跳过未保存确认）
        expect(context.update.installing).toBe(false)
        expect(context.rendererReady.received).toBe(false)
        expect(context.startupRestore.pendingWindow).toBeNull()
        expect(context.startupRestore.fallbackTimer).toBeNull()
        expect(context.windowBounds.disposePersistence).toBeNull()
        expect(context.tray.hideNotified).toBe(false)
        // P1-1（工作区受信根来源收敛）：默认无任何受信根
        expect(context.workspace.approvedRoots).toBeInstanceOf(Set)
        expect(context.workspace.approvedRoots.size).toBe(0)

        // 两次创建互不共享嵌套对象（reset 时不会串改其它上下文实例）
        const another = createDefaultAppContext()
        expect(another.welcome).not.toBe(context.welcome)
        expect(another.quit).not.toBe(context.quit)
        expect(another.workspace.approvedRoots).not.toBe(context.workspace.approvedRoots)
    })
})

describe('getAppContext / resetAppContext', () => {
    it('should expose a singleton context', () => {
        expect(getAppContext()).toBe(getAppContext())
    })

    it('should reset every migrated state slot', () => {
        const context = getAppContext()
        const windowStub = { webContents: { id: 1 }, isDestroyed: () => false }
        context.mainWindow = windowStub as never
        context.welcome.mainViewEntered = true
        context.shortKeys.registered = true
        context.shortKeys.targetWindow = windowStub as never
        context.quit.isQuitting = true
        context.quit.flushedForQuit = true
        context.quit.flushedForClose = true
        context.quit.confirming = true
        context.quit.pendingRelaunch = true
        context.update.installing = true
        context.rendererReady.received = true
        context.startupRestore.pendingWindow = windowStub as never
        context.windowBounds.disposePersistence = () => undefined
        context.tray.hideNotified = true
        context.workspace.approvedRoots.add('c:/notes')

        resetAppContext()

        // reset 后仍是通过 getAppContext 可取的默认上下文（单例语义保持）
        const reset = getAppContext()
        expect(reset.mainWindow).toBeNull()
        expect(reset.welcome.mainViewEntered).toBe(false)
        expect(reset.shortKeys.registered).toBe(false)
        expect(reset.shortKeys.targetWindow).toBeNull()
        expect(reset.quit.isQuitting).toBe(false)
        expect(reset.quit.flushedForQuit).toBe(false)
        expect(reset.quit.flushedForClose).toBe(false)
        expect(reset.quit.confirming).toBe(false)
        expect(reset.quit.pendingRelaunch).toBe(false)
        expect(reset.update.installing).toBe(false)
        expect(reset.rendererReady.received).toBe(false)
        expect(reset.startupRestore.pendingWindow).toBeNull()
        expect(reset.startupRestore.fallbackTimer).toBeNull()
        expect(reset.windowBounds.disposePersistence).toBeNull()
        expect(reset.tray.hideNotified).toBe(false)
        // P1-1：受信工作区根随上下文复位清空
        expect(reset.workspace.approvedRoots.size).toBe(0)
    })

    it('should cancel the pending startup-restore fallback timer on reset', () => {
        vi.useFakeTimers()
        const onFallback = vi.fn()
        // 测试环境同时含 DOM/Node 两套 setTimeout 声明，统一按上下文属性类型收窄
        getAppContext().startupRestore.fallbackTimer = setTimeout(
            onFallback,
            3000
        ) as unknown as ReturnType<typeof setTimeout>

        resetAppContext()
        vi.advanceTimersByTime(3000)

        expect(onFallback).not.toHaveBeenCalled()
    })
})
