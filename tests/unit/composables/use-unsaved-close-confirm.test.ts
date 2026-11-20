/**
 * useUnsavedCloseConfirm 组合式函数测试（2026-11-20 关闭确认应用内对话框）
 *
 * 覆盖渲染层控制器：
 * 1. start/stop 监听注册与退订（幂等）；
 * 2. 主进程请求载荷解析（托盘语义 / 非法载荷）与重复请求忽略；
 * 3. 三个按钮回传（save/discard/cancel）与结果处理：
 *    save 成功→收起；失败→保留对话框 + 错误提示 + 恢复可操作；stale→收起；
 *    IPC 异常→按失败提示（不抛给 UI）；
 * 4. 渲染层 35s 看门狗（主进程 30s 超时兜底的后备），到点自动收起；
 * 5. preload IPC 缺失时不崩溃、不注册监听。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    UNSAVED_CLOSE_DIALOG_WATCHDOG_MS,
    useUnsavedCloseConfirm
} from '@renderer/composables/useUnsavedCloseConfirm'
import { IPC } from '../../../src/shared/ipc-channels'

type Listener = (event: unknown, ...args: unknown[]) => void

interface IpcStub {
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    listeners: Map<string, Listener[]>
    trigger: (channel: string, payload?: unknown) => void
}

function installIpcStub(): IpcStub {
    const listeners = new Map<string, Listener[]>()
    const on = vi.fn((channel: string, listener: Listener) => {
        const list = listeners.get(channel) ?? []
        list.push(listener)
        listeners.set(channel, list)
    })
    const removeListener = vi.fn((channel: string, listener: Listener) => {
        const list = listeners.get(channel) ?? []
        listeners.set(
            channel,
            list.filter((item) => item !== listener)
        )
    })
    const invoke = vi.fn().mockResolvedValue({ ok: true })
    // 组合式函数经 window.electron（preload contextBridge）访问受限 ipcRenderer；
    // 本文件为 node 环境，显式注入 window 替身（jsdom 下 window 与 globalThis 同源）。
    vi.stubGlobal('window', { electron: { ipcRenderer: { on, removeListener, invoke } } })
    return {
        on,
        removeListener,
        invoke,
        listeners,
        trigger(channel: string, payload?: unknown) {
            for (const listener of listeners.get(channel) ?? []) {
                listener({}, payload)
            }
        }
    }
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

let ipc: IpcStub
let controllers: Array<ReturnType<typeof useUnsavedCloseConfirm>>

function createController(): ReturnType<typeof useUnsavedCloseConfirm> {
    const controller = useUnsavedCloseConfirm()
    controllers.push(controller)
    return controller
}

beforeEach(() => {
    ipc = installIpcStub()
    controllers = []
})

afterEach(() => {
    for (const controller of controllers) {
        controller.stop()
    }
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe('监听注册/退订', () => {
    it('start 注册主进程未保存确认请求监听（幂等），stop 精确退订', () => {
        const controller = createController()
        controller.start()
        controller.start()
        expect(ipc.on).toHaveBeenCalledTimes(1)
        expect(ipc.on.mock.calls[0][0]).toBe(IPC.DIALOG.UNSAVED_CLOSE_REQUEST)

        controller.stop()
        expect(ipc.removeListener).toHaveBeenCalledTimes(1)
        expect(ipc.removeListener.mock.calls[0][0]).toBe(IPC.DIALOG.UNSAVED_CLOSE_REQUEST)
        // 退订后再 stop 不重复操作
        controller.stop()
        expect(ipc.removeListener).toHaveBeenCalledTimes(1)
    })

    it('收到请求经 start 注册的监听打开确认框（载荷缺失按普通关闭处理）', () => {
        const controller = createController()
        controller.start()
        expect(controller.state.visible).toBe(false)

        ipc.trigger(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, undefined)
        expect(controller.state.visible).toBe(true)
        expect(controller.state.minimizeToTray).toBe(false)
        expect(controller.state.busy).toBe(false)
        expect(controller.state.error).toBe('')
    })

    it('preload IPC 不可用时 start/stop 不抛错且不注册监听', () => {
        vi.stubGlobal('window', {})
        const controller = createController()
        expect(() => controller.start()).not.toThrow()
        expect(ipc.on).not.toHaveBeenCalled()

        controller.handleRequest({ minimizeToTray: true })
        expect(controller.state.visible).toBe(true)
        expect(controller.state.minimizeToTray).toBe(true)
        expect(() => controller.stop()).not.toThrow()
    })
})

describe('请求载荷 / 重复请求', () => {
    it('托盘语义从载荷读取；重复请求在显示期间被忽略', () => {
        const controller = createController()
        controller.handleRequest({ minimizeToTray: true })
        expect(controller.state.minimizeToTray).toBe(true)

        controller.handleRequest({ minimizeToTray: false })
        // 已显示时忽略重复请求，保留首次载荷
        expect(controller.state.minimizeToTray).toBe(true)
        expect(controller.state.visible).toBe(true)
    })
})

describe('保存并关闭', () => {
    it('保存中进入 busy；成功（ok=true）后收起对话框', async () => {
        let resolveInvoke: (value: unknown) => void = () => undefined
        ipc.invoke.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveInvoke = resolve
                })
        )
        const controller = createController()
        controller.handleRequest({})

        const saving = controller.confirmSave()
        expect(controller.state.busy).toBe(true)
        expect(controller.state.error).toBe('')
        await flushMicrotasks()
        expect(ipc.invoke).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, 'save')

        resolveInvoke({ ok: true })
        await saving
        expect(controller.state.visible).toBe(false)
        expect(controller.state.busy).toBe(false)
    })

    it('保存失败（ok=false）：保留对话框、恢复可操作并展示错误提示', async () => {
        ipc.invoke.mockResolvedValue({ ok: false })
        const controller = createController()
        controller.handleRequest({})

        await controller.confirmSave()
        expect(controller.state.visible).toBe(true)
        expect(controller.state.busy).toBe(false)
        expect(controller.state.error).toContain('保存失败')
    })

    it('主进程已结束等待（stale）：收起对话框（本次关闭已中止）', async () => {
        ipc.invoke.mockResolvedValue({ ok: false, stale: true })
        const controller = createController()
        controller.handleRequest({})

        await controller.confirmSave()
        expect(controller.state.visible).toBe(false)
    })

    it('未受信发送方拒绝对象/非法返回：按保存失败处理', async () => {
        ipc.invoke.mockResolvedValue({ code: 'UNTRUSTED_SENDER', message: 'rejected' })
        const controller = createController()
        controller.handleRequest({})

        await controller.confirmSave()
        expect(controller.state.visible).toBe(true)
        expect(controller.state.busy).toBe(false)
        expect(controller.state.error).toContain('保存失败')
    })

    it('IPC 调用异常：保留对话框并提示失败（不向上抛）', async () => {
        ipc.invoke.mockRejectedValue(new Error('ipc failure'))
        const controller = createController()
        controller.handleRequest({})

        await expect(controller.confirmSave()).resolves.toBeUndefined()
        expect(controller.state.visible).toBe(true)
        expect(controller.state.busy).toBe(false)
        expect(controller.state.error).toContain('保存失败')
    })

    it('未显示 / 保存中重复点击不重复回传', async () => {
        const controller = createController()
        await controller.confirmSave()
        expect(ipc.invoke).not.toHaveBeenCalled()

        let resolveInvoke: (value: unknown) => void = () => undefined
        ipc.invoke.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveInvoke = resolve
                })
        )
        controller.handleRequest({})
        const saving = controller.confirmSave()
        await controller.confirmSave()
        expect(ipc.invoke).toHaveBeenCalledTimes(1)
        resolveInvoke({ ok: true })
        await saving
    })
})

describe('不保存 / 取消', () => {
    it('discard：先收起对话框，再回传 discard', async () => {
        const controller = createController()
        controller.handleRequest({})
        await controller.confirmDiscard()
        expect(controller.state.visible).toBe(false)
        expect(ipc.invoke).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, 'discard')
    })

    it('cancel：先收起对话框，再回传 cancel', async () => {
        const controller = createController()
        controller.handleRequest({})
        await controller.confirmCancel()
        expect(controller.state.visible).toBe(false)
        expect(ipc.invoke).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, 'cancel')
    })

    it('回传失败（IPC 异常）：不抛错，主进程按超时取消兜底', async () => {
        ipc.invoke.mockRejectedValue(new Error('ipc failure'))
        const controller = createController()
        controller.handleRequest({})
        await expect(controller.confirmDiscard()).resolves.toBeUndefined()
        expect(controller.state.visible).toBe(false)
    })

    it('busy 期间 discard/cancel 被忽略', async () => {
        let resolveInvoke: (value: unknown) => void = () => undefined
        ipc.invoke.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveInvoke = resolve
                })
        )
        const controller = createController()
        controller.handleRequest({})
        const saving = controller.confirmSave()
        await controller.confirmDiscard()
        await controller.confirmCancel()
        expect(ipc.invoke).toHaveBeenCalledTimes(1)
        resolveInvoke({ ok: true })
        await saving
    })
})

describe('渲染层看门狗', () => {
    it('看门狗超时后自动收起对话框（主进程此前已按 30s 超时取消）', () => {
        vi.useFakeTimers()
        const controller = createController()
        controller.handleRequest({})
        expect(controller.state.visible).toBe(true)

        vi.advanceTimersByTime(UNSAVED_CLOSE_DIALOG_WATCHDOG_MS - 1)
        expect(controller.state.visible).toBe(true)
        vi.advanceTimersByTime(1)
        expect(controller.state.visible).toBe(false)
    })

    it('看门狗常量大于主进程超时（30s），保证主进程先兜底', () => {
        expect(UNSAVED_CLOSE_DIALOG_WATCHDOG_MS).toBeGreaterThan(30_000)
    })

    it('保存成功后清理看门狗，不再触发（不会误收起/误改状态）', async () => {
        vi.useFakeTimers()
        const controller = createController()
        controller.handleRequest({})
        await controller.confirmSave()
        expect(controller.state.visible).toBe(false)

        controller.handleRequest({})
        vi.advanceTimersByTime(UNSAVED_CLOSE_DIALOG_WATCHDOG_MS)
        expect(controller.state.visible).toBe(false)
    })
})
