/**
 * preload/dialog.ts 单元测试
 * 覆盖：contextIsolated 开关、exposeInMainWorld 暴露结构、
 * send 通道白名单（放行/丢弃+告警）、on 的事件剥离转发、
 * removeListener/shell.openExternal 委托（P0 安全：仅 http/https 协议白名单）。
 * P2：broadcastTheme 辅助函数随主题设置 JSDOM 对话框删除（DIALOG_BROADCAST_THEME
 * 通道双端移除）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const dialogMocks = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    openExternal: vi.fn()
}))

vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: dialogMocks.exposeInMainWorld },
    ipcRenderer: {
        send: dialogMocks.send,
        on: dialogMocks.on,
        removeListener: dialogMocks.removeListener
    },
    shell: { openExternal: dialogMocks.openExternal }
}))

// dialog.ts 在模块加载时读取 process.contextIsolated，需在 import 前设置
async function loadDialog(): Promise<void> {
    await import('../../src/preload/dialog')
}

function getExposedDialogApi(): {
    ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        on: (channel: string, callback: (...args: unknown[]) => void) => void
        removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
    }
    shell: { openExternal: (url: string) => Promise<void> }
} {
    const call = dialogMocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI')
    expect(call, '应存在 exposeInMainWorld("electronAPI", ...) 调用').toBeDefined()
    return call![1]
}

// 与源码 ALLOWED_SEND_CHANNELS 一致的完整白名单（ARC-01）
// P2：随 8 个不可达 JSDOM 对话框 / Mermaid 隐藏窗口 / 主题广播删除，白名单只剩
// 当前可达的两个对话框通道。
const ALLOWED_CHANNELS = [
    'baize:dialog:create-file-folder-enter',
    'baize:dialog:rename-file-folder-enter'
]

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.resetModules()
    dialogMocks.exposeInMainWorld.mockClear()
    dialogMocks.send.mockClear()
    dialogMocks.on.mockClear()
    dialogMocks.removeListener.mockClear()
    dialogMocks.openExternal.mockClear()
    ;(process as unknown as { contextIsolated?: boolean }).contextIsolated = true
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
})

describe('preload/dialog exposure', () => {
    it('should expose dialogApi under electronAPI when contextIsolated', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        expect(Object.keys(api).sort()).toEqual(['ipcRenderer', 'shell'])
    })

    it('should not expose anything when context is not isolated', async () => {
        ;(process as unknown as { contextIsolated?: boolean }).contextIsolated = false
        await loadDialog()
        expect(dialogMocks.exposeInMainWorld).not.toHaveBeenCalled()
    })
})

describe('preload/dialog send whitelist', () => {
    it('should forward every whitelisted send channel to ipcRenderer', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        for (const channel of ALLOWED_CHANNELS) {
            dialogMocks.send.mockClear()
            api.ipcRenderer.send(channel, 'payload')
            expect(dialogMocks.send, `白名单通道 ${channel} 应被放行`).toHaveBeenCalledWith(
                channel,
                'payload'
            )
        }
    })

    it('should drop unknown send channels with a warning', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        api.ipcRenderer.send('baize:navigation:open-exe', 'evil')
        expect(dialogMocks.send).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('baize:navigation:open-exe'))
    })
})

describe('preload/dialog ipcRenderer delegation', () => {
    it('should forward on() payload args without the event object', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        const callback = vi.fn()
        api.ipcRenderer.on('baize:theme:updated', callback)
        expect(dialogMocks.on).toHaveBeenCalledWith('baize:theme:updated', expect.any(Function))
        // 触发包装后的监听器：第一个参数 event 被剥离
        const wrapper = dialogMocks.on.mock.calls[0][1]
        wrapper({ sender: 'fake-event' }, 'a', 2)
        expect(callback).toHaveBeenCalledWith('a', 2)
    })

    it('should drop unknown on channels with a warning (2026-11-19 接收白名单)', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        api.ipcRenderer.on('baize:file:saved', vi.fn())
        expect(dialogMocks.on).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('baize:file:saved'))
    })

    it('should delegate removeListener directly', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        const callback = vi.fn()
        api.ipcRenderer.removeListener('some-channel', callback)
        expect(dialogMocks.removeListener).toHaveBeenCalledWith('some-channel', callback)
    })

    it('should unsubscribe the exact wrapped listener after on() (P2/C-02)', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        const callback = vi.fn()
        api.ipcRenderer.on('baize:theme:updated', callback)
        // on 传给 ipcRenderer 的是包装函数，removeListener 必须用同一引用退订
        const wrapped = dialogMocks.on.mock.calls[0][1]
        api.ipcRenderer.removeListener('baize:theme:updated', callback)
        expect(dialogMocks.removeListener).toHaveBeenCalledTimes(1)
        expect(dialogMocks.removeListener).toHaveBeenCalledWith('baize:theme:updated', wrapped)
    })
})

describe('preload/dialog shell', () => {
    it('should delegate shell.openExternal with normalized http/https URL', async () => {
        await loadDialog()
        dialogMocks.openExternal.mockResolvedValue(undefined)
        await expect(
            getExposedDialogApi().shell.openExternal('https://example.com')
        ).resolves.toBeUndefined()
        // P0 安全：协议白名单封装会先规范化 URL 再委托 shell
        expect(dialogMocks.openExternal).toHaveBeenCalledWith('https://example.com/')
    })

    it('should reject non http/https protocols with a warning', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        for (const url of [
            'javascript:alert(1)',
            'file:///C:/Windows/System32/calc.exe',
            'data:text/html,<h1>x</h1>',
            'baize-evil://payload',
            'not a valid url',
            ''
        ]) {
            await expect(api.shell.openExternal(url)).resolves.toBeUndefined()
        }
        expect(dialogMocks.openExternal).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('已拒绝打开非 http/https'))
    })

    it('should propagate shell failures to the renderer caller', async () => {
        await loadDialog()
        dialogMocks.openExternal.mockRejectedValueOnce(new Error('no browser'))
        await expect(
            getExposedDialogApi().shell.openExternal('https://example.com/')
        ).rejects.toThrow('no browser')
    })
})
