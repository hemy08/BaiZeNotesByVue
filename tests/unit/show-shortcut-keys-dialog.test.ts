/**
 * FE-07：ShowShortcutKeysDialog 单元测试
 *
 * 表单验证：帮助 → 快捷键菜单项对应的主进程 handler 现在真正打开只读快捷键说明对话框，
 * 不再是空实现（原 console.warn）。本测试覆盖窗口创建/复用、主题下发与内容渲染。
 */
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
    getCurrentThemeStyles: vi.fn()
}))

vi.mock('../../src/main/config', () => configMocks)

import { ShowShortcutKeysDialog } from '../../src/main/dialogs/ShowShortcutKeysDialog'
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

describe('ShowShortcutKeysDialog（FE-07）', () => {
    it('should create a themed frameless dialog window', () => {
        ShowShortcutKeysDialog()
        expect(eState.windows).toHaveLength(1)
        const win = eState.windows[0]
        expect(win.options.width).toBe(620)
        expect(win.options.height).toBe(640)
        expect(win.options.resizable).toBe(true)
        expect(win.options.title).toBe('键盘快捷键 - 白泽笔记')
        expect(win.setMenu).toHaveBeenCalledWith(null)
        expect(win.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html;charset=utf-8,/)
        expect(win.show).toHaveBeenCalledTimes(1)
    })

    it('should send the current theme styles after did-finish-load', () => {
        ShowShortcutKeysDialog()
        const win = eState.windows[0]
        win.emitWeb('did-finish-load')
        expect(win.webContents.send).toHaveBeenCalledWith('baize:theme:init-styles', themeStyles)
    })

    it('should focus the existing dialog instead of opening a second one', () => {
        ShowShortcutKeysDialog()
        const first = eState.windows[0]
        first.focus.mockClear()
        ShowShortcutKeysDialog()
        expect(eState.windows).toHaveLength(1)
        expect(first.focus).toHaveBeenCalledTimes(1)
    })

    it('should render shortcut groups and key combinations in the html', () => {
        ShowShortcutKeysDialog()
        const html = getLoadedHtml(eState.windows[0])

        // 标题与分组
        expect(html).toContain('键盘快捷键')
        expect(html).toContain('文件')
        expect(html).toContain('编辑')
        expect(html).toContain('Markdown 格式')
        expect(html).toContain('视图')
        // 真实绑定的快捷键与说明（与 short-key-register / hemy-editor-shortcut 对齐）
        for (const key of ['Ctrl+N', 'Ctrl+O', 'Ctrl+S', 'Ctrl+R', 'Ctrl+Shift+R', 'F4']) {
            expect(html).toContain(`<kbd>${key}</kbd>`)
        }
        for (const key of [
            'Ctrl+Z',
            'Ctrl+Y',
            'Ctrl+X',
            'Ctrl+C',
            'Ctrl+V',
            'Ctrl+F',
            'Ctrl+H',
            'Ctrl+G'
        ]) {
            expect(html).toContain(`<kbd>${key}</kbd>`)
        }
        for (const key of [
            'Ctrl+1 ~ 6',
            'Ctrl+B',
            'Ctrl+I',
            'Ctrl+U',
            'Ctrl+D',
            'Ctrl+K',
            'Ctrl+L'
        ]) {
            expect(html).toContain(`<kbd>${key}</kbd>`)
        }
        for (const key of ['F9', 'F10', 'F11', 'F12']) {
            expect(html).toContain(`<kbd>${key}</kbd>`)
        }
        expect(html).toContain('新建文件 / 文件夹')
        expect(html).toContain('保存当前文件')
        expect(html).toContain('开发者工具')
        // 只读说明（非空实现）
        expect(html).toContain('onclick="window.close()"')
    })
})
