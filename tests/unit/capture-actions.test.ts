/**
 * 1.5.2 E6 今日日记 / 快速收件箱 —— 渲染层入口动作单测（`src/renderer/src/common/capture-actions.ts`）
 *
 * 覆盖口径：
 * 1. IPC 调用参数（只传 kind 白名单，与主进程契约一致）；
 * 2. 成功不弹错误提示；
 * 3. 失败 reason（no-workspace / invalid-kind / write-failed / 未知）映射为 i18n 提示；
 * 4. invoke 拒绝与受限 ipcRenderer 不可用时的可见反馈（LOG-08 禁止静默失败）；
 * 5. 能力开关关闭提示（菜单动作执行前的统一提示）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'

const mocks = vi.hoisted(() => ({
    showError: vi.fn(),
    showWarning: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({
        showError: mocks.showError,
        showWarning: mocks.showWarning
    })
}))
vi.mock('@renderer/common/logger', () => ({ logger: mocks.logger }))
// i18n 替身：保留「键 + 插值参数」形态，便于断言 reason → 文案键的映射关系
vi.mock('@renderer/common/i18n', () => ({
    t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}|${JSON.stringify(params)}` : key
}))
vi.mock('@renderer/common/action-feedback', () => ({
    describeActionError: (error: unknown, fallback: string) =>
        error instanceof Error && error.message ? error.message : fallback
}))

import {
    openOrCreateCaptureEntry,
    showCaptureFeatureDisabled
} from '../../src/renderer/src/common/capture-actions'

let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
    vi.clearAllMocks()
    invoke = vi.fn()
    vi.stubGlobal('window', {
        electron: { ipcRenderer: { invoke } }
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

/** 等待 capture-actions 内部 Promise 链执行完（两次微任务即可覆盖 then/catch） */
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe('openOrCreateCaptureEntry：IPC 调用与成功路径', () => {
    it('只把 kind 白名单传给主进程（渲染层不传路径/文件名）', async () => {
        invoke.mockResolvedValue({ ok: true, created: true, filePath: 'C:/w/diary/2026-01-04.md' })
        openOrCreateCaptureEntry('daily')
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.OPEN_OR_CREATE_ENTRY, { kind: 'daily' })
        await flushMicrotasks()
        expect(mocks.showError).not.toHaveBeenCalled()
        expect(mocks.showWarning).not.toHaveBeenCalled()
    })

    it('inbox 入口同样走同一通道', async () => {
        invoke.mockResolvedValue({ ok: true, created: true })
        openOrCreateCaptureEntry('inbox')
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.OPEN_OR_CREATE_ENTRY, { kind: 'inbox' })
        await flushMicrotasks()
        expect(mocks.showError).not.toHaveBeenCalled()
    })

    it('打开链路由主进程推送内容，渲染层不额外调用其他 IPC', async () => {
        invoke.mockResolvedValue({ ok: true, created: false })
        openOrCreateCaptureEntry('daily')
        await flushMicrotasks()
        expect(invoke).toHaveBeenCalledTimes(1)
    })
})

describe('openOrCreateCaptureEntry：失败原因提示', () => {
    it('no-workspace → 提示先打开工作区', async () => {
        invoke.mockResolvedValue({ ok: false, reason: 'no-workspace' })
        openOrCreateCaptureEntry('daily')
        await flushMicrotasks()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.dailyEntries.failedTitle',
            'editorUi.dailyEntries.noWorkspace'
        )
        expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('invalid-kind → 提示通过菜单/命令面板重试', async () => {
        invoke.mockResolvedValue({ ok: false, reason: 'invalid-kind' })
        openOrCreateCaptureEntry('inbox')
        await flushMicrotasks()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.dailyEntries.failedTitle',
            'editorUi.dailyEntries.invalidKind'
        )
    })

    it('write-failed → 提示检查目录权限', async () => {
        invoke.mockResolvedValue({ ok: false, reason: 'write-failed' })
        openOrCreateCaptureEntry('daily')
        await flushMicrotasks()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.dailyEntries.failedTitle',
            'editorUi.dailyEntries.writeFailed'
        )
    })

    it('未知 reason / 空返回值 → 通用失败提示（不静默）', async () => {
        invoke.mockResolvedValueOnce(undefined)
        openOrCreateCaptureEntry('daily')
        await flushMicrotasks()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.dailyEntries.failedTitle',
            'editorUi.dailyEntries.failedMessage'
        )
    })

    it('invoke 拒绝 → 提示携带归一化错误信息', async () => {
        invoke.mockRejectedValueOnce(new Error('ipc broken'))
        openOrCreateCaptureEntry('inbox')
        await flushMicrotasks()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.dailyEntries.failedTitle',
            'editorUi.dailyEntries.invokeFailed|{"error":"ipc broken"}'
        )
        expect(mocks.logger.error).toHaveBeenCalled()
    })
})

describe('受限 ipcRenderer 不可用', () => {
    it('window 未注入 electron 时给出可见错误提示，不抛异常', () => {
        vi.stubGlobal('window', {})
        expect(() => openOrCreateCaptureEntry('daily')).not.toThrow()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.dailyEntries.failedTitle',
            'editorUi.dailyEntries.unavailable'
        )
    })
})

describe('showCaptureFeatureDisabled：能力开关关闭提示', () => {
    it('提示「系统设置 → 功能」开启日常记录（不调用 IPC）', () => {
        showCaptureFeatureDisabled()
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.dailyEntries.disabledTitle',
            'editorUi.dailyEntries.disabledMessage'
        )
        expect(invoke).not.toHaveBeenCalled()
    })
})
