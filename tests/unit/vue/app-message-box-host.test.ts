// @vitest-environment jsdom
/**
 * AppMessageBoxHost.vue 集成测试（2026-11-21 应用内消息/确认对话框通用服务）
 *
 * 覆盖主界面常驻宿主的接线（真实 Host + useAppMessageBox + AppMessageDialog）：
 * 1. onMounted 注册请求/撤销监听并发送宿主就绪握手；onBeforeUnmount 精确退订并发送卸载握手；
 * 2. 主进程请求 → 应用内 BaseDialog 出现（标题/正文/详情/按钮/默认焦点/ARIA 语义）；
 * 3. 点击按钮 → 收起对话框并按 requestId + choiceId invoke 回传主进程；
 * 4. Esc → 回传 cancelId；主进程 DISMISS → 按 requestId 收起且不回传（不形成双回执）；
 * 5. 非法/重复请求兜底；stale 结果与 IPC 异常不崩溃；看门狗自动收起。
 *
 * 说明：宿主挂在主界面（BaiZeNotes.vue），随主界面异步 chunk 加载，不占渲染入口预算；
 * 欢迎页等未挂载宿主时主进程会直接回退原生框（由主进程单测覆盖）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

import AppMessageBoxHost from '@renderer/components/dialogs/AppMessageBoxHost.vue'
import { IPC } from '../../../src/shared/ipc-channels'
import {
    APP_MESSAGE_DIALOG_WATCHDOG_MS,
    normalizeAppMessageRequest
} from '@renderer/composables/useAppMessageBox'

type Listener = (event: unknown, ...args: unknown[]) => void

interface IpcStub {
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    trigger: (channel: string, payload?: unknown) => void
}

/** 标准两按钮 confirm 载荷（主进程已本地化文案） */
function requestPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        requestId: 'app-msg-1',
        kind: 'warning',
        title: '安全确认',
        message: '即将打开可执行程序',
        detail: '请确认来源可信后再继续。',
        buttons: [
            { id: 'cancel', label: '取消' },
            { id: 'confirm', label: '确认打开', kind: 'danger' }
        ],
        defaultId: 'confirm',
        cancelId: 'cancel',
        timeoutMs: 30000,
        ...overrides
    }
}

let ipc: IpcStub
let wrapper: VueWrapper | null = null

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
    const send = vi.fn()
    vi.stubGlobal('electron', { ipcRenderer: { on, removeListener, invoke, send } })
    return {
        on,
        removeListener,
        invoke,
        send,
        trigger(channel: string, payload?: unknown) {
            for (const listener of listeners.get(channel) ?? []) {
                listener({}, payload)
            }
        }
    }
}

async function mountHost(): Promise<VueWrapper> {
    wrapper = mount(AppMessageBoxHost, {
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    await vi.waitFor(() => {
        expect(ipc.on).toHaveBeenCalledWith(IPC.DIALOG.APP_MESSAGE_REQUEST, expect.any(Function))
    })
    return wrapper
}

/** 触发主进程消息框请求并等待按需渲染的对话框出现 */
async function openDialog(payload: unknown = requestPayload()): Promise<void> {
    ipc.trigger(IPC.DIALOG.APP_MESSAGE_REQUEST, payload)
    await vi.waitFor(() => {
        expect(wrapper?.find('.app-message-dialog').exists()).toBe(true)
    })
}

function dialogButton(buttonId: string) {
    const button = wrapper?.find(`[data-button-id="${buttonId}"]`)
    expect(button?.exists()).toBe(true)
    return button!
}

beforeEach(() => {
    ipc = installIpcStub()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe('应用内消息框宿主：监听生命周期与就绪握手', () => {
    it('onMounted 注册请求/撤销监听并发送就绪握手；unmount 精确退订并发送卸载握手', async () => {
        await mountHost()
        expect(ipc.on).toHaveBeenCalledWith(IPC.DIALOG.APP_MESSAGE_REQUEST, expect.any(Function))
        expect(ipc.on).toHaveBeenCalledWith(IPC.DIALOG.APP_MESSAGE_DISMISS, expect.any(Function))
        expect(ipc.send).toHaveBeenCalledWith(IPC.DIALOG.APP_MESSAGE_HOST_READY, true)

        wrapper?.unmount()
        wrapper = null
        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC.DIALOG.APP_MESSAGE_REQUEST,
            expect.any(Function)
        )
        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC.DIALOG.APP_MESSAGE_DISMISS,
            expect.any(Function)
        )
        expect(ipc.send).toHaveBeenCalledWith(IPC.DIALOG.APP_MESSAGE_HOST_READY, false)
    })

    it('preload IPC 不可用时只记录告警，不崩溃（主进程将走原生兜底）', async () => {
        vi.stubGlobal('electron', undefined)
        wrapper = mount(AppMessageBoxHost, {
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        expect(wrapper.find('.app-message-dialog').exists()).toBe(false)
    })
})

describe('应用内消息框宿主：展示与回传', () => {
    it('主进程请求 → BaseDialog 出现（标题/正文/详情/按钮/ARIA）', async () => {
        await mountHost()
        await openDialog()

        const container = wrapper!.find('.dialog-container.app-message-dialog')
        expect(container.exists()).toBe(true)
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')
        expect(container.attributes('aria-labelledby')).toBeTruthy()
        expect(container.attributes('aria-describedby')).toBeTruthy()
        expect(container.classes()).toContain('app-message-dialog--warning')
        expect(wrapper!.find('.title-text').text()).toBe('安全确认')
        expect(wrapper!.find('.message').text()).toBe('即将打开可执行程序')
        expect(wrapper!.find('.detail').text()).toBe('请确认来源可信后再继续。')
        expect(dialogButton('cancel').text()).toBe('取消')
        expect(dialogButton('confirm').text()).toBe('确认打开')
    })

    it('默认焦点在 defaultId 对应按钮', async () => {
        await mountHost()
        await openDialog()
        await vi.waitFor(() => {
            expect(document.activeElement?.getAttribute('data-button-id')).toBe('confirm')
        })
    })

    it('点击按钮 → 收起对话框并按 requestId + choiceId invoke 回传', async () => {
        await mountHost()
        await openDialog()

        await dialogButton('confirm').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('.app-message-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledWith(
            IPC.DIALOG.APP_MESSAGE_SUBMIT,
            'app-msg-1',
            'confirm'
        )
    })

    it('Esc → 按 cancelId 回传（与旧原生框 cancelId 语义等价）', async () => {
        await mountHost()
        await openDialog()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await vi.waitFor(() => {
            expect(wrapper?.find('.app-message-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledWith(
            IPC.DIALOG.APP_MESSAGE_SUBMIT,
            'app-msg-1',
            'cancel'
        )
    })

    it('主进程 DISMISS（超时回退原生前）→ 按 requestId 收起且不回传（不产生双回执）', async () => {
        await mountHost()
        await openDialog()

        ipc.trigger(IPC.DIALOG.APP_MESSAGE_DISMISS, 'app-msg-1')
        await vi.waitFor(() => {
            expect(wrapper?.find('.app-message-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).not.toHaveBeenCalled()
    })

    it('DISMISS 的 requestId 不匹配 → 忽略（仍显示当前消息框）', async () => {
        await mountHost()
        await openDialog()
        ipc.trigger(IPC.DIALOG.APP_MESSAGE_DISMISS, 'app-msg-other')
        expect(wrapper!.find('.app-message-dialog').exists()).toBe(true)
        expect(ipc.invoke).not.toHaveBeenCalled()
    })

    it('非法载荷被忽略（主进程超时后自动兜底，不渲染残缺对话框）', async () => {
        await mountHost()
        ipc.trigger(IPC.DIALOG.APP_MESSAGE_REQUEST, { requestId: '', buttons: [] })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(wrapper!.find('.app-message-dialog').exists()).toBe(false)
    })

    it('主进程已结算（stale）时不崩溃，对话框保持收起', async () => {
        ipc.invoke.mockResolvedValue({ ok: false, stale: true })
        await mountHost()
        await openDialog()

        await dialogButton('cancel').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('.app-message-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledTimes(1)
    })

    it('回传 IPC 异常：记录错误且不向上抛（对话框已收起，主进程超时兜底）', async () => {
        ipc.invoke.mockRejectedValue(new Error('ipc failure'))
        await mountHost()
        await openDialog()

        await dialogButton('cancel').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('.app-message-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledTimes(1)
    })

    it('看门狗超时：主进程链路完全无响应时自动收起遮罩（不回传选择）', async () => {
        vi.useFakeTimers()
        await mountHost()
        ipc.trigger(IPC.DIALOG.APP_MESSAGE_REQUEST, requestPayload())
        await vi.advanceTimersByTimeAsync(0)
        expect(wrapper!.find('.app-message-dialog').exists()).toBe(true)

        await vi.advanceTimersByTimeAsync(APP_MESSAGE_DIALOG_WATCHDOG_MS)
        expect(wrapper!.find('.app-message-dialog').exists()).toBe(false)
        expect(ipc.invoke).not.toHaveBeenCalled()
    })
})

describe('应用内消息框载荷归一化（纯逻辑）', () => {
    it('非法 requestId / 空按钮 → null；defaultId/cancelId 回退首/末按钮', () => {
        expect(normalizeAppMessageRequest(null)).toBeNull()
        expect(normalizeAppMessageRequest({ requestId: '' })).toBeNull()
        expect(normalizeAppMessageRequest({ requestId: 'r', buttons: [] })).toBeNull()
        const normalized = normalizeAppMessageRequest({
            requestId: 'r',
            kind: 'unknown',
            title: 't',
            message: 'm',
            buttons: [
                { id: 'a', label: 'A' },
                { id: 'b', label: 'B' }
            ]
        })
        expect(normalized).toMatchObject({
            requestId: 'r',
            kind: 'info',
            title: 't',
            message: 'm',
            defaultId: 'a',
            cancelId: 'b'
        })
        expect(normalized?.detail).toBeUndefined()
        expect(normalized?.timeoutMs).toBeUndefined()
    })
})
