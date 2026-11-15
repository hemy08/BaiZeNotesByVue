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

import { ShowReleaseNotesDialog } from '../../src/main/dialogs/ShowReleaseNotesDialog'
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

describe('ShowReleaseNotesDialog', () => {
    it('should create a per-version window with expected options', () => {
        ShowReleaseNotesDialog('1.2.2')
        expect(eState.windows).toHaveLength(1)
        const win = eState.windows[0]
        expect(win.options.width).toBe(800)
        expect(win.options.height).toBe(650)
        expect(win.options.resizable).toBe(true)
        expect(win.options.title).toBe('版本发布 v1.2.2 - 白泽笔记')
    })

    it('should load data URL html and show the dialog', () => {
        ShowReleaseNotesDialog('1.2.2')
        const win = eState.windows[0]
        expect(win.setMenu).toHaveBeenCalledWith(null)
        expect(win.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html;charset=utf-8,/)
        expect(win.show).toHaveBeenCalledTimes(1)
    })

    it('should send theme styles after did-finish-load', () => {
        ShowReleaseNotesDialog('1.2.2')
        const win = eState.windows[0]
        win.emitWeb('did-finish-load')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:theme:init-styles', themeStyles)
    })

    it('should render known release note content', () => {
        ShowReleaseNotesDialog('1.2.2')
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('Electron 43 重大升级')
        expect(html).toContain('2026-08-22')
        expect(html).toContain('发布日期')
        expect(html).toContain('新功能')
        expect(html).toContain('问题修复')
        expect(html).toContain('优化改进')
        expect(html).toContain('技术栈')
        expect(html).toContain('v1.2.2')
        expect(html).toContain('Monaco Editor')
    })

    it('should render v1.3.0 release note content', () => {
        ShowReleaseNotesDialog('1.3.0')
        const win = eState.windows[0]
        expect(win.options.title).toBe('版本发布 v1.3.0 - 白泽笔记')
        const html = getLoadedHtml(win)
        expect(html).toContain('1.3.0 全面治理版')
        expect(html).toContain('2026-11-15')
        expect(html).toContain('v1.3.0')
        expect(html).toContain('Path Guard')
        expect(html).toContain('CSP')
        expect(html).toContain('Electron')
        expect(html).toContain('43.8.10')
    })

    it('should render not-found message for unknown version', () => {
        ShowReleaseNotesDialog('9.9.9')
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('未找到版本 9.9.9 的发布说明')
        expect(html).not.toContain('版本发布 v9.9.9 - 白泽笔记')
    })

    it('should render older version without tech stack section', () => {
        ShowReleaseNotesDialog('1.0.0')
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('初始版本发布')
        expect(html).toContain('Markdown 编辑与预览')
        expect(html).not.toContain('🔧 技术栈')
    })

    it('should isolate windows per version', () => {
        ShowReleaseNotesDialog('1.2.2')
        ShowReleaseNotesDialog('1.2.1')
        expect(eState.windows).toHaveLength(2)
        const html = getLoadedHtml(eState.windows[1])
        expect(html).toContain('全量扫描与代码优化')
    })

    it('should focus existing window of the same version', () => {
        ShowReleaseNotesDialog('1.2.2')
        const first = eState.windows[0]
        first.focus.mockClear()
        ShowReleaseNotesDialog('1.2.2')
        expect(eState.windows).toHaveLength(1)
        expect(first.focus).toHaveBeenCalledTimes(1)
    })
})
