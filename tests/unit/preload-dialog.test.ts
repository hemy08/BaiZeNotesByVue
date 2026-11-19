/**
 * preload/dialog.ts 单元测试
 * 覆盖：contextIsolated 开关、exposeInMainWorld 暴露结构、
 * send 通道白名单（结构优化第 2 批 2.1 后为空——任何 send 都丢弃并告警）、
 * on 接收白名单（同样为空）、removeListener 委托、
 * shell.openExternal 委托（P0 安全：仅 http/https 协议白名单）。
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

/**
 * 结构优化第 2 批 2.1（H3）：JSDOM 对话框全部迁移为渲染层 Vue 对话框后，
 * 生成器从 `src/main/dialogs` 扫描到的 dialog preload 通道为 0，
 * dialog.ts 成为「白名单为空的安全空壳」——任何通道都必须被丢弃并告警。
 */
const ALLOWED_CHANNELS: string[] = []

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
    it('should have an empty generated whitelist (JSDOM dialogs migrated to Vue)', async () => {
        await loadDialog()
        expect(ALLOWED_CHANNELS).toEqual([])
    })

    it('should drop every send channel with a warning', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        for (const channel of [
            'baize:dialog:rename-file-folder-submit',
            'baize:dialog:delete-file-folder-confirm',
            'baize:navigation:open-exe'
        ]) {
            dialogMocks.send.mockClear()
            api.ipcRenderer.send(channel, 'payload')
            expect(dialogMocks.send, `空白名单下 ${channel} 不应被放行`).not.toHaveBeenCalled()
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(channel))
        }
    })
})

describe('preload/dialog ipcRenderer delegation', () => {
    it('should drop every on channel with a warning (empty receive whitelist)', async () => {
        await loadDialog()
        const api = getExposedDialogApi()
        api.ipcRenderer.on('baize:theme:updated', vi.fn())
        expect(dialogMocks.on).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('baize:theme:updated'))
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
