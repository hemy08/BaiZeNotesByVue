/**
 * app-message-box.test.ts（2026-11-21 应用内消息/确认对话框通用服务）
 *
 * 覆盖主进程 `showAppMessageBox()` 服务：
 * 1. 正常应用内路径：向渲染层发 APP_MESSAGE_REQUEST（requestId 关联），回执结算；
 * 2. 取消语义 / 非法回执归一化 / 重复与过期回执（stale）；
 * 3. 串行队列：同一时刻最多一个应用内消息框；
 * 4. 兜底：宿主未就绪 / 无父窗口 → 原生框；等待超时 → 撤销应用内框 + 原生框；
 *    窗口销毁 / 渲染进程崩溃 → 安全侧取消；发送异常 → 原生框；原生框异常 → 取消；
 * 5. 纯逻辑：按钮归一化 / 载荷归一化（默认/取消按钮、超时钳制、未知 kind）。
 *
 * 说明：本文件只 mock electron 原生 dialog 与 logger/i18n，其余（app-context）用真实实现，
 * 覆盖窗口判活、串行队列与超时兜底的真实分支。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'

const electronMocks = vi.hoisted(() => ({
    showMessageBox: vi.fn(),
    appGetPath: vi.fn(() => '')
}))

vi.mock('electron', () => ({
    // app 供 logger 的守卫读取（logger 在本文件被 mock）
    app: { getPath: electronMocks.appGetPath },
    dialog: { showMessageBox: electronMocks.showMessageBox }
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// 固定中文词条，隔离主进程系统设置读取链（默认按钮「确定」断言用）
vi.mock('../../src/main/utils/i18n', () => ({
    tMain: (key: string) => (key === 'common.ok' ? '确定' : key)
}))

import { IPC } from '../../src/shared/ipc-channels'
import { getAppContext, resetAppContext } from '../../src/main/app-context'
import { logger } from '../../src/main/utils/logger'
import {
    APP_MESSAGE_MAX_TIMEOUT_MS,
    APP_MESSAGE_MIN_TIMEOUT_MS,
    APP_MESSAGE_TIMEOUT_MS,
    buildAppMessageRequestPayload,
    isAppMessageHostReady,
    normalizeAppMessageButtons,
    notifyAppMessageHostReady,
    resetAppMessageBoxStateForTesting,
    showAppMessageBox,
    submitAppMessageChoice
} from '../../src/main/utils/app-message-box'

/** 伪造 BrowserWindow：记录 send / 事件监听，供测试手动触发 closed / render-process-gone */
interface FakeWindowHarness {
    win: BrowserWindow
    sent: ReturnType<typeof vi.fn>
    emitWindowEvent: (event: string) => void
    emitRendererEvent: (event: string) => void
    destroy: () => void
}

function createFakeWindow(): FakeWindowHarness {
    const windowListeners = new Map<string, Set<() => void>>()
    const rendererListeners = new Map<string, Set<() => void>>()
    const sent = vi.fn()
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
            removeListener(windowListeners, event, cb)
    }

    return {
        win: win as unknown as BrowserWindow,
        sent,
        emitWindowEvent: (event) => emit(windowListeners, event),
        emitRendererEvent: (event) => emit(rendererListeners, event),
        destroy: () => {
            destroyed = true
        }
    }
}

/** 取出主进程最近一次发出的应用内消息框请求（通道 + 载荷） */
function sentRequest(harness: FakeWindowHarness): {
    requestId: string
    kind: string
    title: string
    message: string
    buttons: Array<{ id: string; label: string }>
    defaultId: string
    cancelId: string
    timeoutMs?: number
} | null {
    const calls = harness.sent.mock.calls.filter(
        (item) => item[0] === IPC.DIALOG.APP_MESSAGE_REQUEST
    )
    const call = calls[calls.length - 1]
    return (call?.[1] as ReturnType<typeof sentRequest>) ?? null
}

/** 标准两按钮请求（主操作 ok / 取消 cancel） */
function twoButtonOptions(overrides: Record<string, unknown> = {}) {
    return {
        kind: 'warning' as const,
        title: '安全确认',
        message: '即将执行操作',
        detail: '补充说明',
        buttons: [
            { id: 'ok', label: '继续', kind: 'primary' as const },
            { id: 'cancel', label: '取消' }
        ],
        defaultId: 'ok',
        cancelId: 'cancel',
        ...overrides
    }
}

/** 等待挂起的 Promise 至少完成一轮微任务（队列泵在 finally 中启动下一个请求） */
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

beforeEach(() => {
    resetAppMessageBoxStateForTesting()
    resetAppContext()
    electronMocks.showMessageBox.mockReset()
    // 原生兜底默认选「取消」（第二个按钮）
    electronMocks.showMessageBox.mockResolvedValue({ response: 1 })
})

afterEach(() => {
    resetAppMessageBoxStateForTesting()
    resetAppContext()
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('载荷归一化（纯逻辑）', () => {
    it('无按钮时回退单按钮「确定」；非法/重复按钮被过滤', () => {
        expect(normalizeAppMessageButtons(undefined)).toEqual([
            { id: 'ok', label: '确定', kind: 'primary' }
        ])
        expect(
            normalizeAppMessageButtons([
                { id: 'a', label: 'A' },
                { id: 'a', label: 'A2' },
                { id: '', label: '无效' },
                { id: 'b', label: '' },
                { id: 'c', label: 'C', kind: 'danger' },
                'oops'
            ])
        ).toEqual([
            { id: 'a', label: 'A' },
            { id: 'c', label: 'C', kind: 'danger' }
        ])
    })

    it('defaultId/cancelId 非法时回退首/末按钮；未知 kind 回退 info；超时钳制', () => {
        const payload = buildAppMessageRequestPayload(
            {
                kind: 'bogus' as never,
                title: '标题',
                message: '正文',
                buttons: [
                    { id: 'first', label: '一' },
                    { id: 'second', label: '二' }
                ],
                defaultId: 'missing',
                cancelId: 'missing',
                timeoutMs: 10
            },
            'req-1'
        )
        expect(payload.kind).toBe('info')
        expect(payload.defaultId).toBe('first')
        expect(payload.cancelId).toBe('second')
        expect(payload.timeoutMs).toBe(APP_MESSAGE_MIN_TIMEOUT_MS)
        expect(payload.detail).toBeUndefined()

        const tooLong = buildAppMessageRequestPayload(
            { title: '', message: '', timeoutMs: Number.MAX_SAFE_INTEGER },
            'req-2'
        )
        expect(tooLong.timeoutMs).toBe(APP_MESSAGE_MAX_TIMEOUT_MS)

        const defaultTimeout = buildAppMessageRequestPayload({ title: '', message: '' }, 'req-3')
        expect(defaultTimeout.timeoutMs).toBe(APP_MESSAGE_TIMEOUT_MS)
    })
})

describe('应用内消息框（主路径）', () => {
    it('宿主就绪时向渲染层发请求并等待回执；选择主操作 → 非取消', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)
        expect(isAppMessageHostReady()).toBe(true)

        const promise = showAppMessageBox(twoButtonOptions())

        const payload = sentRequest(harness)
        expect(payload).toMatchObject({
            kind: 'warning',
            title: '安全确认',
            message: '即将执行操作',
            detail: '补充说明',
            defaultId: 'ok',
            cancelId: 'cancel',
            timeoutMs: APP_MESSAGE_TIMEOUT_MS
        })
        expect(payload?.requestId).toMatch(/^app-msg-\d+$/)
        expect(payload?.buttons.map((button) => button.id)).toEqual(['ok', 'cancel'])

        expect(submitAppMessageChoice(payload?.requestId, 'ok')).toEqual({ ok: true })
        await expect(promise).resolves.toEqual({ choiceId: 'ok', canceled: false })
        // 结算后移除窗口/渲染进程兜底监听
        harness.emitWindowEvent('closed')
        harness.emitRendererEvent('render-process-gone')
    })

    it('选择取消按钮 → canceled=true；Esc/关闭同样映射 cancelId', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const promise = showAppMessageBox(twoButtonOptions())
        const requestId = sentRequest(harness)?.requestId
        expect(submitAppMessageChoice(requestId, 'cancel')).toEqual({ ok: true })
        await expect(promise).resolves.toEqual({ choiceId: 'cancel', canceled: true })
    })

    it('过期/重复回执返回 stale；未知 requestId 不影响等待中的请求', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const promise = showAppMessageBox(twoButtonOptions())
        const requestId = sentRequest(harness)?.requestId

        expect(submitAppMessageChoice('app-msg-999', 'ok')).toEqual({
            ok: false,
            stale: true
        })
        expect(submitAppMessageChoice(requestId, 'ok')).toEqual({ ok: true })
        await expect(promise).resolves.toEqual({ choiceId: 'ok', canceled: false })
        // 已结算后的重复回执：stale
        expect(submitAppMessageChoice(requestId, 'cancel')).toEqual({
            ok: false,
            stale: true
        })
        expect(logger.warn).toHaveBeenCalled()
    })

    it('非法 choiceId 按取消安全侧结算', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const promise = showAppMessageBox(twoButtonOptions())
        const requestId = sentRequest(harness)?.requestId
        expect(submitAppMessageChoice(requestId, 'not-a-button')).toEqual({ ok: true })
        await expect(promise).resolves.toEqual({ choiceId: 'cancel', canceled: true })
    })

    it('并发请求串行化：第一个结算后才发送第二个（不叠框）', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const first = showAppMessageBox(twoButtonOptions({ title: '第一个' }))
        const second = showAppMessageBox(twoButtonOptions({ title: '第二个' }))

        const firstRequest = sentRequest(harness)
        expect(firstRequest?.title).toBe('第一个')
        // 第二个请求仍在队列里：只发送过一次
        expect(harness.sent).toHaveBeenCalledTimes(1)

        expect(submitAppMessageChoice(firstRequest?.requestId, 'ok')).toEqual({ ok: true })
        await expect(first).resolves.toEqual({ choiceId: 'ok', canceled: false })
        await flushMicrotasks()

        // 第二个请求已发送（新 requestId）
        const secondRequest = sentRequest(harness)
        expect(secondRequest?.title).toBe('第二个')
        expect(secondRequest?.requestId).not.toBe(firstRequest?.requestId)
        expect(submitAppMessageChoice(secondRequest?.requestId, 'cancel')).toEqual({ ok: true })
        await expect(second).resolves.toEqual({ choiceId: 'cancel', canceled: true })
    })

    it('宿主卸载时等待中的消息框按取消安全侧结算', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const promise = showAppMessageBox(twoButtonOptions())
        notifyAppMessageHostReady(false)
        await expect(promise).resolves.toEqual({ choiceId: 'cancel', canceled: true })
        expect(electronMocks.showMessageBox).not.toHaveBeenCalled()
    })
})

describe('超时 / 窗口销毁 / 渲染进程崩溃兜底', () => {
    it('等待超时：先撤销应用内框（DISMISS），再回退原生框', async () => {
        vi.useFakeTimers()
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)
        electronMocks.showMessageBox.mockResolvedValue({ response: 0 })

        const promise = showAppMessageBox(twoButtonOptions({ timeoutMs: 1000 }))
        const requestId = sentRequest(harness)?.requestId
        await vi.advanceTimersByTimeAsync(1000)

        await expect(promise).resolves.toEqual({ choiceId: 'ok', canceled: false })
        expect(harness.sent).toHaveBeenCalledWith(IPC.DIALOG.APP_MESSAGE_DISMISS, requestId)
        expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1)
        // 原生兜底按钮/默认/取消语义与请求一致
        const [, options] = electronMocks.showMessageBox.mock.calls[0] as [
            unknown,
            { type: string; buttons: string[]; defaultId: number; cancelId: number }
        ]
        expect(options).toMatchObject({
            type: 'warning',
            buttons: ['继续', '取消'],
            defaultId: 0,
            cancelId: 1
        })
        expect(logger.warn).toHaveBeenCalled()
    })

    it('默认超时为 30s（APP_MESSAGE_TIMEOUT_MS）', () => {
        expect(APP_MESSAGE_TIMEOUT_MS).toBe(30_000)
    })

    it('等待期间窗口 closed：立即按取消结算（不再回退原生框）', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const promise = showAppMessageBox(twoButtonOptions())
        harness.emitWindowEvent('closed')
        await expect(promise).resolves.toEqual({ choiceId: 'cancel', canceled: true })
        expect(electronMocks.showMessageBox).not.toHaveBeenCalled()
    })

    it('等待期间渲染进程 render-process-gone：立即按取消结算', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)

        const promise = showAppMessageBox(twoButtonOptions())
        harness.emitRendererEvent('render-process-gone')
        await expect(promise).resolves.toEqual({ choiceId: 'cancel', canceled: true })
        expect(electronMocks.showMessageBox).not.toHaveBeenCalled()
    })

    it('发送请求抛错（销毁竞态）：回退原生框，不向调用方抛异常', async () => {
        const harness = createFakeWindow()
        harness.sent.mockImplementation(() => {
            throw new Error('Object has been destroyed')
        })
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)
        electronMocks.showMessageBox.mockResolvedValue({ response: 0 })

        await expect(showAppMessageBox(twoButtonOptions())).resolves.toEqual({
            choiceId: 'ok',
            canceled: false
        })
        expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1)
    })
})

describe('原生兜底（渲染层不可用 / 无父窗口 / 原生异常）', () => {
    it('宿主未就绪（欢迎页/主界面未挂载）：直接回退原生框，不发送应用内请求', async () => {
        const harness = createFakeWindow()
        getAppContext().mainWindow = harness.win
        electronMocks.showMessageBox.mockResolvedValue({ response: 1 })

        await expect(showAppMessageBox(twoButtonOptions())).resolves.toEqual({
            choiceId: 'cancel',
            canceled: true
        })
        expect(harness.sent).not.toHaveBeenCalled()
        expect(electronMocks.showMessageBox).toHaveBeenCalledWith(
            harness.win,
            expect.objectContaining({ type: 'warning', message: '即将执行操作' })
        )
        expect(logger.warn).toHaveBeenCalled()
    })

    it('窗口已销毁：回退无父窗口原生框', async () => {
        const harness = createFakeWindow()
        harness.destroy()
        getAppContext().mainWindow = harness.win
        notifyAppMessageHostReady(true)
        electronMocks.showMessageBox.mockResolvedValue({ response: 0 })

        await expect(showAppMessageBox(twoButtonOptions())).resolves.toEqual({
            choiceId: 'ok',
            canceled: false
        })
        expect(harness.sent).not.toHaveBeenCalled()
        // 无父窗口时使用单参重载
        expect(electronMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    it('无主窗口（parentWindow=null）：回退无父窗口原生框', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 0 })
        await expect(showAppMessageBox(twoButtonOptions({ parentWindow: null }))).resolves.toEqual({
            choiceId: 'ok',
            canceled: false
        })
        expect(electronMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    it('原生框 response 越界 → 按取消安全侧返回', async () => {
        electronMocks.showMessageBox.mockResolvedValue({ response: 9 })
        await expect(showAppMessageBox(twoButtonOptions())).resolves.toEqual({
            choiceId: 'cancel',
            canceled: true
        })
    })

    it('原生框自身抛错 → 返回 cancelId（不向调用方抛异常）', async () => {
        electronMocks.showMessageBox.mockRejectedValue(new Error('dialog destroyed'))
        await expect(showAppMessageBox(twoButtonOptions())).resolves.toEqual({
            choiceId: 'cancel',
            canceled: true
        })
        expect(logger.error).toHaveBeenCalled()
    })
})
