/**
 * src/main/dialogs/OpenOnlineWebPages.ts 单元测试
 * 覆盖：打开方式路由（browser/local-dialog/未知值回退 browser）、
 * P0 安全 C-08：URL 仅 http/https 白名单、本地窗口无 preload + sandbox、
 * 窗口内导航全部拦截、window.open 交给系统浏览器/拒绝非 http(s) 协议
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeBrowserWindow, FakeWebContents, GenericListener } from './helpers/fake-dialog-env'

// ============ electron mock ============
const eState = vi.hoisted(() => ({
    windows: [] as FakeBrowserWindow[],
    openExternal: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        options: Record<string, unknown>
        listeners = new Map<string, Array<GenericListener>>()
        webListeners = new Map<string, Array<GenericListener>>()
        destroyed = false
        setMenu = vi.fn()
        loadURL = vi.fn()
        loadFile = vi.fn()
        show = vi.fn()
        focus = vi.fn()
        webContents: FakeWebContents & { setWindowOpenHandler: ReturnType<typeof vi.fn> }

        constructor(options: Record<string, unknown>) {
            this.options = options
            this.webContents = {
                send: vi.fn(),
                executeJavaScript: vi.fn(),
                insertCSS: vi.fn(),
                on: vi.fn((event: string, cb: GenericListener) => {
                    const list = this.webListeners.get(event) || []
                    list.push(cb)
                    this.webListeners.set(event, list)
                }),
                setWindowOpenHandler: vi.fn()
            }
            // 本文件的 MockBrowserWindow 只实现测试实际用到的字段（未实现 emit/emitWeb），
            // 与 FakeBrowserWindow 共享类型存在结构缺口，故显式断言后入栈。
            eState.windows.push(this as unknown as FakeBrowserWindow)
        }

        static getAllWindows = () => eState.windows

        isDestroyed() {
            return this.destroyed
        }

        close() {
            if (this.destroyed) return
            this.destroyed = true
            ;(this.listeners.get('closed') || []).forEach((cb) => cb())
        }

        on(event: string, cb: GenericListener) {
            const list = this.listeners.get(event) || []
            list.push(cb)
            this.listeners.set(event, list)
        }
    }

    return {
        BrowserWindow: MockBrowserWindow,
        dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
        shell: { openExternal: eState.openExternal },
        ipcMain: {
            on: vi.fn(),
            removeListener: vi.fn(),
            removeAllListeners: vi.fn(),
            once: vi.fn(),
            handle: vi.fn()
        },
        app: {
            getPath: vi.fn(() => ''),
            getVersion: vi.fn(() => '1.0.0'),
            getName: vi.fn(() => 'baize')
        }
    }
})

const configMocks = vi.hoisted(() => ({
    getSystemSettingValString: vi.fn()
}))

vi.mock('../../src/main/config', () => configMocks)

const loggerMocks = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
}))

vi.mock('../../src/main/utils/logger', () => ({ logger: loggerMocks }))

import { OpenOnlineWebPage } from '../../src/main/dialogs/OpenOnlineWebPages'
import { windowManager } from '../../src/main/config/window-manager'

// 取出 webContents.on 注册的处理器
function getWebHandler(win: FakeBrowserWindow, event: string): GenericListener {
    const calls = win.webContents.on.mock.calls as unknown[][]
    const call = calls.find((item) => item[0] === event)
    expect(call, `webContents 应注册 ${event} 处理器`).toBeDefined()
    return call![1] as GenericListener
}

// 取出 setWindowOpenHandler 注册的处理器
function getWindowOpenHandler(
    win: FakeBrowserWindow
): (details: { url: string }) => { action: string } {
    const webContents = win.webContents as FakeWebContents & {
        setWindowOpenHandler: ReturnType<typeof vi.fn>
    }
    const calls = webContents.setWindowOpenHandler.mock.calls as unknown[][]
    expect(calls.length, '应注册 setWindowOpenHandler').toBeGreaterThan(0)
    return calls[0][0] as (details: { url: string }) => { action: string }
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    eState.windows.length = 0
    vi.clearAllMocks()
    windowManager.closeAll()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
})

describe('OpenOnlineWebPage', () => {
    it('should open in system browser when pluginOpen is browser', () => {
        configMocks.getSystemSettingValString.mockReturnValue('browser')
        OpenOnlineWebPage('https://example.com')
        // 协议白名单封装会先把 URL 规范化（补全根路径斜杠）再交给 shell
        expect(eState.openExternal).toHaveBeenCalledWith('https://example.com/')
        expect(eState.windows).toHaveLength(0)
    })

    it('should open in local dialog when pluginOpen is local-dialog', () => {
        configMocks.getSystemSettingValString.mockReturnValue('local-dialog')
        OpenOnlineWebPage('https://example.com')
        expect(eState.openExternal).not.toHaveBeenCalled()
        expect(eState.windows).toHaveLength(1)
        const win = eState.windows[0]
        expect(win.options.width).toBe(1280)
        expect(win.options.height).toBe(960)
        // 结构优化第 2 批 2.3（H6）：原 dialog-defaults.test.ts 的对话框默认值断言归并到本文件
        expect(win.options.frame).toBe(false)
        expect(win.options.autoHideMenuBar).toBe(true)
        expect(win.loadURL).toHaveBeenCalledWith('https://example.com/')
    })

    it('should default to browser when setting value is unexpected', () => {
        configMocks.getSystemSettingValString.mockReturnValue('weird-value')
        OpenOnlineWebPage('https://example.com')
        expect(eState.openExternal).toHaveBeenCalledWith('https://example.com/')
        expect(eState.windows).toHaveLength(0)
    })

    it('should log the chosen open mode', () => {
        configMocks.getSystemSettingValString.mockReturnValue('browser')
        OpenOnlineWebPage('https://example.com')
        expect(loggerMocks.info).toHaveBeenCalledWith('网页打开方式： ', 'browser')
    })

    it('should reject non http/https URLs before opening anything (C-08)', () => {
        const unsafeUrls = [
            'javascript:alert(1)',
            'file:///C:/Windows/System32/calc.exe',
            'data:text/html,<h1>x</h1>',
            'baize-evil://payload',
            'not a valid url',
            ''
        ]
        for (const mode of ['browser', 'local-dialog']) {
            configMocks.getSystemSettingValString.mockReturnValue(mode)
            for (const url of unsafeUrls) {
                OpenOnlineWebPage(url)
            }
        }
        expect(eState.openExternal).not.toHaveBeenCalled()
        expect(eState.windows).toHaveLength(0)
        expect(loggerMocks.info).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })
})

describe('online web page window hardening (C-08)', () => {
    beforeEach(() => {
        configMocks.getSystemSettingValString.mockReturnValue('local-dialog')
        OpenOnlineWebPage('https://example.com')
    })

    it('should not attach any preload and keep sandbox enabled', () => {
        const win = eState.windows[0]
        const webPreferences = win.options.webPreferences as Record<string, unknown>
        expect(webPreferences.preload).toBeUndefined()
        expect(webPreferences.sandbox).toBe(true)
        expect(webPreferences.nodeIntegration).toBe(false)
        expect(webPreferences.contextIsolation).toBe(true)
    })

    it('should deny every navigation inside the remote page window', () => {
        const win = eState.windows[0]
        const handler = getWebHandler(win, 'will-navigate')
        const event = { preventDefault: vi.fn() }
        handler(event, 'https://phishing.example.com/login')
        expect(event.preventDefault).toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should deny window.open and open only http/https links externally', () => {
        const win = eState.windows[0]
        const openHandler = getWindowOpenHandler(win)

        expect(openHandler({ url: 'https://help.example.com/page' })).toEqual({ action: 'deny' })
        expect(eState.openExternal).toHaveBeenCalledWith('https://help.example.com/page')

        eState.openExternal.mockClear()
        expect(openHandler({ url: 'file:///C:/Windows/System32/calc.exe' })).toEqual({
            action: 'deny'
        })
        expect(openHandler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
        expect(eState.openExternal).not.toHaveBeenCalled()
    })
})
