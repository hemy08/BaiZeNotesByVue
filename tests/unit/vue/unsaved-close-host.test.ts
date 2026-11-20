// @vitest-environment jsdom
/**
 * UnsavedCloseConfirmHost.vue 集成测试（2026-11-20 关闭确认应用内对话框）
 *
 * 覆盖主界面常驻宿主的接线（真实 Host + useUnsavedCloseConfirm + UnsavedChangesDialog）：
 * 1. onMounted 注册 IPC.DIALOG.UNSAVED_CLOSE_REQUEST 监听、onBeforeUnmount 精确退订；
 * 2. 主进程请求到达 → 应用内 BaseDialog 出现（标题/三按钮/默认焦点/ARIA 语义）；
 * 3. 「保存并关闭」成功收起 + invoke 回传 save；失败保留对话框并展示错误提示；
 * 4. 「不保存」/「取消」（Esc）收起并回传对应选择；
 * 5. 托盘语义（minimizeToTray）→「保存并隐藏」文案；
 * 6. 主进程 stale 结果 → 收起（本次关闭已中止）；IPC 异常 → 错误提示不崩溃。
 *
 * 说明：宿主挂在主界面（BaiZeNotes.vue）而不是 App 层，是为了让确认框代码随主界面
 * 异步 chunk 加载、不突破渲染入口 chunk 150 KiB 硬预算（PERF-01）；脏文件只可能出现在
 * 主界面编辑场景，因此该挂载点的时序满足关闭/退出协议。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

import UnsavedCloseConfirmHost from '@renderer/components/dialogs/UnsavedCloseConfirmHost.vue'
import { IPC } from '../../../src/shared/ipc-channels'

type Listener = (event: unknown, ...args: unknown[]) => void

interface IpcStub {
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    trigger: (channel: string, payload?: unknown) => void
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
    vi.stubGlobal('electron', { ipcRenderer: { on, removeListener, invoke } })
    return {
        on,
        removeListener,
        invoke,
        trigger(channel: string, payload?: unknown) {
            for (const listener of listeners.get(channel) ?? []) {
                listener({}, payload)
            }
        }
    }
}

async function mountHost(): Promise<VueWrapper> {
    wrapper = mount(UnsavedCloseConfirmHost, {
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    // onMounted 同步注册监听
    expect(ipc.on).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, expect.any(Function))
    return wrapper
}

/** 触发主进程确认请求并等待按需渲染的对话框出现 */
async function openConfirmDialog(payload: unknown = { minimizeToTray: false }): Promise<void> {
    ipc.trigger(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, payload)
    await vi.waitFor(() => {
        expect(wrapper?.find('.unsaved-close-dialog').exists()).toBe(true)
    })
}

function dialogButton(className: string) {
    const button = wrapper?.find(`.${className}`)
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

describe('关闭确认宿主：监听生命周期', () => {
    it('onMounted 注册确认请求监听，onBeforeUnmount 精确退订', async () => {
        await mountHost()
        wrapper?.unmount()
        wrapper = null
        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC.DIALOG.UNSAVED_CLOSE_REQUEST,
            expect.any(Function)
        )
    })

    it('主进程请求 → 应用内 BaseDialog 出现（标题/三按钮/默认焦点/ARIA）', async () => {
        await mountHost()
        await openConfirmDialog()

        const container = wrapper!.find('.dialog-container.unsaved-close-dialog')
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')
        expect(container.attributes('aria-labelledby')).toBeTruthy()
        expect(container.attributes('aria-describedby')).toBeTruthy()
        expect(wrapper!.find('.title-text').text()).toBe('未保存的修改')
        expect(dialogButton('btn-save').text()).toBe('保存并关闭')
        expect(dialogButton('btn-discard').text()).toBe('不保存')
        expect(dialogButton('btn-cancel').text()).toBe('取消')

        await vi.waitFor(() => {
            expect(document.activeElement?.classList.contains('btn-save')).toBe(true)
        })
    })

    it('托盘语义：保存按钮显示「保存并隐藏」，正文使用托盘文案', async () => {
        await mountHost()
        await openConfirmDialog({ minimizeToTray: true })
        expect(dialogButton('btn-save').text()).toBe('保存并隐藏')
        expect(wrapper!.find('.message').text()).toContain('隐藏到系统托盘')
    })
})

describe('关闭确认宿主：结果回传', () => {
    it('「保存并关闭」成功：回传 save 并收起对话框', async () => {
        await mountHost()
        await openConfirmDialog()

        await dialogButton('btn-save').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('.unsaved-close-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, 'save')
    })

    it('「保存并关闭」失败：保留对话框并展示错误提示（可重试）', async () => {
        ipc.invoke.mockResolvedValue({ ok: false })
        await mountHost()
        await openConfirmDialog()

        await dialogButton('btn-save').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('[role="alert"]').exists()).toBe(true)
        })
        expect(wrapper!.find('.unsaved-close-dialog').exists()).toBe(true)
        expect(wrapper!.find('[role="alert"]').text()).toContain('保存失败')
        // 失败后按钮恢复可操作
        expect(dialogButton('btn-save').attributes('disabled')).toBeUndefined()
    })

    it('IPC 异常：保留对话框并展示失败提示，不向上抛', async () => {
        ipc.invoke.mockRejectedValue(new Error('ipc failure'))
        await mountHost()
        await openConfirmDialog()

        await dialogButton('btn-save').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('[role="alert"]').text()).toContain('保存失败')
        })
        expect(wrapper!.find('.unsaved-close-dialog').exists()).toBe(true)
    })

    it('stale（主进程已超时/结束等待）：收起对话框', async () => {
        ipc.invoke.mockResolvedValue({ ok: false, stale: true })
        await mountHost()
        await openConfirmDialog()

        await dialogButton('btn-save').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('.unsaved-close-dialog').exists()).toBe(false)
        })
    })

    it('「不保存」：收起对话框并回传 discard', async () => {
        await mountHost()
        await openConfirmDialog()

        await dialogButton('btn-discard').trigger('click')
        await vi.waitFor(() => {
            expect(wrapper?.find('.unsaved-close-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, 'discard')
    })

    it('Esc = 取消：收起对话框并回传 cancel', async () => {
        await mountHost()
        await openConfirmDialog()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await vi.waitFor(() => {
            expect(wrapper?.find('.unsaved-close-dialog').exists()).toBe(false)
        })
        expect(ipc.invoke).toHaveBeenCalledWith(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, 'cancel')
    })
})
