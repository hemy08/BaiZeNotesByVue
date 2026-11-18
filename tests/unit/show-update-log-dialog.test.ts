import { describe, it, expect, beforeEach, vi } from 'vitest'

// CMP-30：对话框文案经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

import { FakeBrowserWindow, FakeWebContents, GenericListener } from './helpers/fake-dialog-env'

// ============ electron mock：捕获 BrowserWindow 构造选项与 IPC 监听器 ============
const eState = vi.hoisted(() => ({
    windows: [] as FakeBrowserWindow[],
    ipcListeners: new Map<string, Array<GenericListener>>(),
    showMessageBox: vi.fn(),
    showSaveDialog: vi.fn()
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
        webContents: FakeWebContents

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
                })
            }
            eState.windows.push(this)
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

        emit(event: string, ...args: unknown[]) {
            ;(this.listeners.get(event) || []).forEach((cb) => cb(...args))
        }

        emitWeb(event: string, ...args: unknown[]) {
            ;(this.webListeners.get(event) || []).forEach((cb) => cb(...args))
        }
    }

    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showMessageBox: eState.showMessageBox,
            showSaveDialog: eState.showSaveDialog
        },
        shell: { openExternal: vi.fn() },
        ipcMain: {
            on: vi.fn((channel: string, cb: GenericListener) => {
                const list = eState.ipcListeners.get(channel) || []
                list.push(cb)
                eState.ipcListeners.set(channel, list)
            }),
            removeListener: vi.fn((channel: string, cb: GenericListener) => {
                const list = eState.ipcListeners.get(channel) || []
                const idx = list.indexOf(cb)
                if (idx !== -1) list.splice(idx, 1)
            }),
            removeAllListeners: vi.fn((channel?: string) => {
                if (channel) eState.ipcListeners.delete(channel)
                else eState.ipcListeners.clear()
            }),
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
    getCurrentThemeStyles: vi.fn()
}))

vi.mock('../../src/main/config', () => configMocks)

import { ShowUpdateLogDialog } from '../../src/main/dialogs/ShowUpdateLogDialog'
import { windowManager } from '../../src/main/config/window-manager'

const themeStyles = {
    name: '白泽紫韵',
    description: '优雅的紫色渐变主题',
    titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    backgroundColor: '#f5f0ff',
    cardBackground: '#ffffff',
    textColor: '#2d2d2d',
    secondaryTextColor: '#666666',
    borderColor: '#e0d4f0',
    accentColor: '#764ba2',
    buttonBackground: '#667eea',
    buttonTextColor: '#ffffff',
    hoverBackground: '#f0e8ff'
}

function getLoadedHtml(win: FakeBrowserWindow): string {
    const url = win.loadURL.mock.calls[0][0] as string
    return decodeURIComponent(url.substring(url.indexOf(',') + 1))
}

beforeEach(() => {
    eState.windows.length = 0
    eState.ipcListeners.clear()
    vi.clearAllMocks()
    configMocks.getCurrentThemeStyles.mockReturnValue(themeStyles)
    windowManager.closeAll()
})

describe('ShowUpdateLogDialog', () => {
    it('should create an update-log-dialog window with expected options', () => {
        ShowUpdateLogDialog()
        expect(eState.windows).toHaveLength(1)
        const win = eState.windows[0]
        expect(win.options.width).toBe(900)
        expect(win.options.height).toBe(700)
        expect(win.options.resizable).toBe(true)
        expect(win.options.title).toBe('更新日志 - 白泽笔记')
        expect(win.setMenu).toHaveBeenCalledWith(null)
        expect(win.show).toHaveBeenCalledTimes(1)
    })

    it('should load data URL html content', () => {
        ShowUpdateLogDialog()
        expect(eState.windows[0].loadURL.mock.calls[0][0]).toMatch(
            /^data:text\/html;charset=utf-8,/
        )
    })

    it('should render upgrade groups with dependency rows', () => {
        ShowUpdateLogDialog()
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('更新日志')
        expect(html).toContain('1.3.0 重大更新')
        expect(html).toContain('核心框架')
        expect(html).toContain('electron')
        expect(html).toContain('^43.0.0')
        expect(html).toContain('^43.8.10')
        expect(html).toContain('补丁')
        expect(html).toContain('移除')
        expect(html).toContain('代码适配修复')
        expect(html).toContain('验证结果')
    })

    it('should render fix list and version footer', () => {
        ShowUpdateLogDialog()
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('v-html')
        expect(html).toContain('白泽笔记 v1.3.0')
        expect(html).toContain('TypeScript (main+preload): 0 错误')
    })

    it('should focus existing window instead of creating a new one', () => {
        ShowUpdateLogDialog()
        const first = eState.windows[0]
        first.focus.mockClear()
        ShowUpdateLogDialog()
        expect(eState.windows).toHaveLength(1)
        expect(first.focus).toHaveBeenCalledTimes(1)
    })
})
