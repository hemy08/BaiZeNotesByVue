/**
 * close-confirm.test.ts（2026-11-20 关闭确认应用内对话框改造）
 *
 * 覆盖主进程「未保存修改」确认协议：
 * 1. 应用内路径：向渲染层发 UNSAVED_CLOSE_REQUEST，等待 UNSAVED_CLOSE_SUBMIT 回执；
 *    discard/cancel 结算、save 执行真实保存（成功放行 / 失败保留等待与对话框）；
 * 2. 兜底：30s 超时、主窗口 closed、渲染进程 render-process-gone 一律按取消安全侧；
 * 3. 渲染层不可用（窗口/webContents 已销毁、未就绪握手）→ 原生 dialog 回退并记录原因；
 * 4. 原生回退的保存语义（保存成功才放行，失败中止）；
 * 5. 防重入（重复请求/重复回执）、迟到的回执（stale）、托盘/最小化场景先显示窗口。
 *
 * 说明：本文件替换改造前的「原生 dialog 映射」测试——原生框现在只是渲染层不可用时的
 * 兜底路径，不再是主路径；断言重点为应用内双通道协议。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const electronMocks = vi.hoisted(() => ({
    showMessageBox: vi.fn(),
    appGetPath: vi.fn(() => '')
}))
const fileMocks = vi.hoisted(() => ({
    SaveActiveFile: vi.fn()
}))

vi.mock('electron', () => ({
    // close-confirm 只用 dialog 运行时 API；app 供 logger 的守卫读取（logger 在本文件被 mock）
    app: { getPath: electronMocks.appGetPath },
    dialog: { showMessageBox: electronMocks.showMessageBox }
}))

// 保存动作的真实实现在 file-utils（重依赖），单测注入替身即可聚焦确认协议
vi.mock('../../src/main/utils/file-utils', () => ({
    SaveActiveFile: fileMocks.SaveActiveFile
}))

// 日志只做记录，不落盘/不依赖 electron 运行时
vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}))

import type { BrowserWindow } from 'electron'
import { IPC } from '../../src/shared/ipc-channels'
import {
    UNSAVED_CLOSE_TIMEOUT_MS,
    confirmUnsavedChangesClose,
    mapNativeUnsavedCloseResponse,
    normalizeUnsavedCloseChoice,
    resetUnsavedCloseConfirmStateForTesting,
    submitUnsavedCloseChoice
} from '../../src/main/utils/close-confirm'

/** 伪造 BrowserWindow：记录 send / 事件监听，供测试手动触发 closed / render-process-gone */
interface FakeWindowHarness {
    win: BrowserWindow
    sent: ReturnType<typeof vi.fn>
    emitWindowEvent: (event: string) => void
    emitRendererEvent: (event: string) => void
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    restore: ReturnType<typeof vi.fn>
    destroy: () => void
}

function createFakeWindow(
    overrides: { visible?: boolean; minimized?: boolean } = {}
): FakeWindowHarness {
    const windowListeners = new Map<string, Set<() => void>>()
    const rendererListeners = new Map<string, Set<() => void>>()
    const sent = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    const restore = vi.fn()
    let destroyed = false

    const addListener = (
        map: Map<string, Set<() => void>>,
        event: string,
        cb: () => void
    ): void => {
        const set = map.get(event) ?? new Set()
        set.add(cb)
        map.set(event, set)
    }
    const removeListener = (
        map: Map<string, Set<() => void>>,
        event: string,
        cb: () => void
    ): void => {
        map.get(event)?.delete(cb)
    }
    const emit = (map: Map<string, Set<() => void>>, event: string): void => {
        for (const cb of [...(map.get(event) ?? [])]) {
            cb()
        }
    }

    const win = {
        isDestroyed: () => destroyed,
        webContents: {
            send: sent,
            isDestroyed: () => destroyed,
            once: (event: string, cb: () => void) => addListener(rendererListeners, event, cb),
            removeListener: (event: string, cb: () => void) =>
                removeListener(rendererListeners, event, cb)
        },
        once: (event: string, cb: () => void) => addListener(windowListeners, event, cb),
        removeListener: (event: string, cb: () => void) =>
            removeListener(windowListeners, event, cb),
        isVisible: () => overrides.visible !== false,
        show,
        isMinimized: () => overrides.minimized === true,
        restore,
        isFocused: () => true,
        focus
    }

    return {
        win: win as unknown as BrowserWindow,
        sent,
        emitWindowEvent: (event) => emit(windowListeners, event),
        emitRendererEvent: (event) => emit(rendererListeners, event),
        show,
        focus,
        restore,
        destroy: () => {
            destroyed = true
        }
    }
}

/** 取出主进程发出的确认请求载荷（首参通道，第二参载荷） */
function sentRequestPayload(sent: ReturnType<typeof vi.fn>): unknown {
    const call = sent.mock.calls.find((item) => item[0] === IPC.DIALOG.UNSAVED_CLOSE_REQUEST)
    return call?.[1]
}

/** 等待挂起的 Promise 至少完成一轮微任务（用于断言「仍处于等待中」） */
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

beforeEach(() => {
    electronMocks.showMessageBox.mockReset()
    fileMocks.SaveActiveFile.mockReset().mockResolvedValue(true)
    resetUnsavedCloseConfirmStateForTesting()
})

afterEach(() => {
    resetUnsavedCloseConfirmStateForTesting()
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('确认选择归一化 / 原生映射（纯逻辑）', () => {
    it('normalizeUnsavedCloseChoice 只接受 save/discard，其余一律按取消安全侧', () => {
        expect(normalizeUnsavedCloseChoice('save')).toBe('save')
        expect(normalizeUnsavedCloseChoice('discard')).toBe('discard')
        expect(normalizeUnsavedCloseChoice('cancel')).toBe('cancel')
        expect(normalizeUnsavedCloseChoice('SAVE')).toBe('cancel')
        expect(normalizeUnsavedCloseChoice(undefined)).toBe('cancel')
        expect(normalizeUnsavedCloseChoice(null)).toBe('cancel')
        expect(normalizeUnsavedCloseChoice(0)).toBe('cancel')
        expect(normalizeUnsavedCloseChoice({ choice: 'save' })).toBe('cancel')
    })

    it('mapNativeUnsavedCloseResponse：0=保存 / 1=不保存 / 其余=取消（含 Esc/关窗）', () => {
        expect(mapNativeUnsavedCloseResponse(0)).toBe('save')
        expect(mapNativeUnsavedCloseResponse(1)).toBe('discard')
        expect(mapNativeUnsavedCloseResponse(2)).toBe('cancel')
        expect(mapNativeUnsavedCloseResponse(-1)).toBe('cancel')
    })
})

describe('应用内确认（主路径）', () => {
    it('向渲染层发送 UNSAVED_CLOSE_REQUEST（含托盘语义）并等待回执', async () => {
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, {
            minimizeToTray: true,
            rendererReady: true
        })

        expect(harness.sent).toHaveBeenCalledTimes(1)
        expect(harness.sent.mock.calls[0][0]).toBe(IPC.DIALOG.UNSAVED_CLOSE_REQUEST)
        expect(sentRequestPayload(harness.sent)).toEqual({ minimizeToTray: true })

        await expect(submitUnsavedCloseChoice('discard')).resolves.toEqual({ ok: true })
        await expect(promise).resolves.toBe('discard')
        // 结算后应移除窗口/渲染进程兜底监听，避免监听器残留
        harness.emitWindowEvent('closed')
        harness.emitRendererEvent('render-process-gone')
    })

    it('取消分支：回执 cancel 结算为 cancel（不关闭窗口）', async () => {
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        await expect(submitUnsavedCloseChoice('cancel')).resolves.toEqual({ ok: true })
        await expect(promise).resolves.toBe('cancel')
    })

    it('「保存并关闭」成功：执行 SaveActiveFile 后才放行（save）', async () => {
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })

        await expect(submitUnsavedCloseChoice('save')).resolves.toEqual({ ok: true })
        expect(fileMocks.SaveActiveFile).toHaveBeenCalledTimes(1)
        await expect(promise).resolves.toBe('save')
    })

    it('「保存并关闭」失败：返回 ok=false 且保持等待，用户可改选不保存', async () => {
        fileMocks.SaveActiveFile.mockResolvedValue(false)
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })

        await expect(submitUnsavedCloseChoice('save')).resolves.toEqual({ ok: false })
        expect(fileMocks.SaveActiveFile).toHaveBeenCalledTimes(1)

        // 保存失败不结算：等待仍挂起（本轮关闭不会放行）
        let settled = false
        void promise.then(() => {
            settled = true
        })
        await flushMicrotasks()
        expect(settled).toBe(false)

        // 用户改选「不保存」→ 结算并放行丢弃
        await expect(submitUnsavedCloseChoice('discard')).resolves.toEqual({ ok: true })
        await expect(promise).resolves.toBe('discard')
    })

    it('保存执行异常：按失败返回 ok=false，不关闭窗口', async () => {
        fileMocks.SaveActiveFile.mockRejectedValue(new Error('disk full'))
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })

        await expect(submitUnsavedCloseChoice('save')).resolves.toEqual({ ok: false })
        await expect(submitUnsavedCloseChoice('cancel')).resolves.toEqual({ ok: true })
        await expect(promise).resolves.toBe('cancel')
    })

    it('保存执行期间重复回执返回 stale（防并发保存/重复结算）', async () => {
        let resolveSave: (value: boolean) => void = () => undefined
        fileMocks.SaveActiveFile.mockImplementation(
            () =>
                new Promise<boolean>((resolve) => {
                    resolveSave = resolve
                })
        )
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })

        const saving = submitUnsavedCloseChoice('save')
        await flushMicrotasks()
        await expect(submitUnsavedCloseChoice('discard')).resolves.toEqual({
            ok: false,
            stale: true
        })

        resolveSave(true)
        await expect(saving).resolves.toEqual({ ok: true })
        await expect(promise).resolves.toBe('save')
    })
})

describe('超时 / 窗口销毁 / 渲染进程退出兜底（安全侧取消）', () => {
    it('等待回执超时：按取消处理，且超时后迟到的回执返回 stale', async () => {
        vi.useFakeTimers()
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, {
            rendererReady: true,
            timeoutMs: 1000
        })

        await vi.advanceTimersByTimeAsync(1000)
        await expect(promise).resolves.toBe('cancel')
        await expect(submitUnsavedCloseChoice('discard')).resolves.toEqual({
            ok: false,
            stale: true
        })
    })

    it('默认超时为 30s（UNSAVED_CLOSE_TIMEOUT_MS）', () => {
        expect(UNSAVED_CLOSE_TIMEOUT_MS).toBe(30_000)
    })

    it('等待期间主窗口 closed：立即按取消结算', async () => {
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        harness.emitWindowEvent('closed')
        await expect(promise).resolves.toBe('cancel')
    })

    it('等待期间渲染进程 render-process-gone：立即按取消结算', async () => {
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        harness.emitRendererEvent('render-process-gone')
        await expect(promise).resolves.toBe('cancel')
    })

    it('保存失败恢复等待计时后再次超时：仍按取消结算', async () => {
        vi.useFakeTimers()
        fileMocks.SaveActiveFile.mockResolvedValue(false)
        const harness = createFakeWindow()
        const promise = confirmUnsavedChangesClose(harness.win, {
            rendererReady: true,
            timeoutMs: 500
        })

        await expect(submitUnsavedCloseChoice('save')).resolves.toEqual({ ok: false })
        await vi.advanceTimersByTimeAsync(500)
        await expect(promise).resolves.toBe('cancel')
    })

    it('已存在等待中的确认请求时，第二个请求按取消处理（不叠加确认框）', async () => {
        const harness = createFakeWindow()
        const first = confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        const second = confirmUnsavedChangesClose(harness.win, { rendererReady: true })

        await expect(second).resolves.toBe('cancel')
        // 第二个请求不会再向渲染层发一次确认框
        expect(harness.sent).toHaveBeenCalledTimes(1)

        await submitUnsavedCloseChoice('discard')
        await expect(first).resolves.toBe('discard')
    })

    it('无等待中请求时的回执返回 stale（不误结算已结束的关闭流程）', async () => {
        await expect(submitUnsavedCloseChoice('save')).resolves.toEqual({
            ok: false,
            stale: true
        })
        expect(fileMocks.SaveActiveFile).not.toHaveBeenCalled()
    })

    it('发送确认请求抛错（销毁竞态）：按取消处理，不抛给调用方', async () => {
        const harness = createFakeWindow()
        harness.sent.mockImplementation(() => {
            throw new Error('Object has been destroyed')
        })
        await expect(
            confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        ).resolves.toBe('cancel')
    })
})

describe('渲染层不可用时的原生兜底', () => {
    it('渲染层未就绪：回退原生确认框（不发送应用内请求）', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 1 })
        const harness = createFakeWindow()

        await expect(
            confirmUnsavedChangesClose(harness.win, { rendererReady: false })
        ).resolves.toBe('discard')
        expect(harness.sent).not.toHaveBeenCalled()
        expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1)
    })

    it('窗口已销毁：回退无父窗口原生确认框', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 2 })
        const harness = createFakeWindow()
        harness.destroy()

        await expect(
            confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        ).resolves.toBe('cancel')
        expect(harness.sent).not.toHaveBeenCalled()
        expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1)
        // 无父窗口时使用单参重载
        expect(electronMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    it('null 窗口：回退无父窗口原生确认框', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 1 })
        await expect(confirmUnsavedChangesClose(null, { rendererReady: true })).resolves.toBe(
            'discard'
        )
        expect(electronMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    it('原生兜底「保存并关闭」成功：先保存成功才返回 save', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 0 })
        const harness = createFakeWindow()
        await expect(
            confirmUnsavedChangesClose(harness.win, { rendererReady: false })
        ).resolves.toBe('save')
        expect(fileMocks.SaveActiveFile).toHaveBeenCalledTimes(1)
    })

    it('原生兜底「保存并关闭」失败：中止关闭（cancel），避免丢内容', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 0 })
        fileMocks.SaveActiveFile.mockResolvedValue(false)
        const harness = createFakeWindow()
        await expect(
            confirmUnsavedChangesClose(harness.win, { rendererReady: false })
        ).resolves.toBe('cancel')
        expect(fileMocks.SaveActiveFile).toHaveBeenCalledTimes(1)
    })

    it('原生兜底按钮/默认/取消语义与历史一致（保存并关闭 / 不保存 / 取消）', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 2 })
        const harness = createFakeWindow()
        await confirmUnsavedChangesClose(harness.win, { rendererReady: false })

        const [parent, options] = electronMocks.showMessageBox.mock.calls[0]
        expect(parent).toBe(harness.win)
        expect(options).toMatchObject({
            type: 'warning',
            defaultId: 0,
            cancelId: 2,
            noLink: true,
            buttons: ['保存并关闭', '不保存', '取消']
        })
        expect(typeof options.message).toBe('string')
        expect(options.message.length).toBeGreaterThan(0)
    })

    it('托盘语义（minimizeToTray）：原生兜底文案使用「保存并隐藏」', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 1 })
        const harness = createFakeWindow()
        await confirmUnsavedChangesClose(harness.win, {
            rendererReady: false,
            minimizeToTray: true
        })
        const options = electronMocks.showMessageBox.mock.calls[0][1] as {
            buttons: string[]
            message: string
            detail: string
        }
        expect(options.buttons).toEqual(['保存并隐藏', '不保存', '取消'])
        expect(options.message).toContain('隐藏到系统托盘')
        expect(options.detail).toContain('隐藏到系统托盘')
    })
})

describe('托盘/最小化场景：应用内确认前先显示窗口', () => {
    it('窗口不可见（已隐藏到托盘）时先 show/restore/focus，再请求渲染层确认', async () => {
        const harness = createFakeWindow({ visible: false, minimized: true })
        const promise = confirmUnsavedChangesClose(harness.win, {
            minimizeToTray: true,
            rendererReady: true
        })
        expect(harness.show).toHaveBeenCalledTimes(1)
        expect(harness.restore).toHaveBeenCalledTimes(1)
        expect(harness.sent).toHaveBeenCalledTimes(1)
        await submitUnsavedCloseChoice('cancel')
        await expect(promise).resolves.toBe('cancel')
    })

    it('窗口可见时不重复 show/focus', async () => {
        const harness = createFakeWindow({ visible: true })
        const promise = confirmUnsavedChangesClose(harness.win, { rendererReady: true })
        expect(harness.show).not.toHaveBeenCalled()
        expect(harness.restore).not.toHaveBeenCalled()
        await submitUnsavedCloseChoice('cancel')
        await expect(promise).resolves.toBe('cancel')
    })
})
