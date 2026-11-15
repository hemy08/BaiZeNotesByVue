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

const fileOpsMocks = vi.hoisted(() => ({
    RenameFileFolder: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => fileOpsMocks)

// FE-09：失败提示走统一错误消息框（避免真实加载 electron dialog 链）
const dialogHelperMocks = vi.hoisted(() => ({
    showErrorMessageBox: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/dialog-helpers', () => dialogHelperMocks)

import { ShowFileFolderRenameDialog } from '../../src/main/dialogs/ShowRenameDialog'
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

// P1/N-05：对话框通道按窗口归属校验 sender——仅登记的对话框窗口 webContents 可信
function triggerIpc(channel: string, ...args: unknown[]) {
    const listeners = eState.ipcListeners.get(channel) || []
    return listeners.map((cb) => cb({ sender: eState.windows[0]?.webContents }, ...args))
}

function triggerIpcFromForeign(channel: string, ...args: unknown[]) {
    const listeners = eState.ipcListeners.get(channel) || []
    return listeners.map((cb) => cb({ sender: { id: 999 } }, ...args))
}

beforeEach(() => {
    eState.windows.length = 0
    eState.ipcListeners.clear()
    vi.clearAllMocks()
    configMocks.getCurrentThemeStyles.mockReturnValue(themeStyles)
    fileOpsMocks.RenameFileFolder.mockResolvedValue(undefined)
    windowManager.closeAll()
})

describe('ShowFileFolderRenameDialog', () => {
    it('should create a rename-file-folder window with expected options', () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        expect(eState.windows).toHaveLength(1)
        const win = eState.windows[0]
        expect(win.options.width).toBe(500)
        // FE-09：新增「取消/确定」按钮行，窗口高度相应增加
        expect(win.options.height).toBe(220)
        expect(win.options.minimizable).toBe(false)
        expect(win.options.resizable).toBe(false)
        expect(win.options.title).toBe('重命名')
    })

    it('should load data URL html and send init theme', () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        const win = eState.windows[0]
        expect(win.setMenu).toHaveBeenCalledWith(null)
        expect(win.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html;charset=utf-8,/)
        expect(win.show).toHaveBeenCalledTimes(1)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:theme:init-styles', themeStyles)
    })

    it('should generate html containing old path and input', () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('重命名')
        expect(html).toContain('old-path')
        expect(html).toContain('C:/notes/a.md')
        expect(html).toContain('file-folder-name')
        expect(html).toContain('请输入新名称')
        expect(html).toContain('baize:dialog:rename-file-folder-enter')
    })

    // FE-09：此前对话框只有标题栏与关闭 ×，提交只能按回车；现在必须有可见的「确定/取消」按钮，
    // 且标题栏关闭按钮经脚本绑定（原实现 onclick 属性在 JSDOM 序列化时丢失）
    it('should render visible confirm/cancel buttons and bind the close button (FE-09)', () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('id="confirm-dialog-btn"')
        expect(html).toContain('id="cancel-dialog-btn"')
        expect(html).toContain('id="close-dialog-btn"')
        expect(html).toContain('确定')
        expect(html).toContain('取消')
        expect(html).toContain('新名称不能为空')
        expect(html).toContain('getElementById("close-dialog-btn").onclick')
    })

    // FE-09：重命名失败（如目标重名/被占用）必须提示用户且保留对话框，不得静默
    it('should report rename failures and keep the dialog open (FE-09)', async () => {
        fileOpsMocks.RenameFileFolder.mockRejectedValueOnce(new Error('rename boom'))
        ShowFileFolderRenameDialog('C:/notes/a.md', true)

        await Promise.all(triggerIpc('baize:dialog:rename-file-folder-enter', 'b.md'))

        expect(dialogHelperMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
        const message = dialogHelperMocks.showErrorMessageBox.mock.calls[0][0] as string
        expect(message).toContain('重命名「C:/notes/a.md」失败')
        expect(message).toContain('rename boom')
        expect(eState.windows[0].isDestroyed()).toBe(false)
    })

    it('should rename and close dialog on enter', async () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        await Promise.all(triggerIpc('baize:dialog:rename-file-folder-enter', 'b.md'))
        expect(fileOpsMocks.RenameFileFolder).toHaveBeenCalledWith('C:/notes/a.md', 'b.md', true)
        expect(eState.windows[0].isDestroyed()).toBe(true)
    })

    it('should pass isFile flag through to rename operation', async () => {
        ShowFileFolderRenameDialog('C:/notes/folder', false)
        await Promise.all(triggerIpc('baize:dialog:rename-file-folder-enter', 'folder2'))
        expect(fileOpsMocks.RenameFileFolder).toHaveBeenCalledWith(
            'C:/notes/folder',
            'folder2',
            false
        )
    })

    it('should clean up the ipc listener after dialog closed', () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        expect(eState.ipcListeners.get('baize:dialog:rename-file-folder-enter')?.length).toBe(1)
        eState.windows[0].close()
        expect(eState.ipcListeners.get('baize:dialog:rename-file-folder-enter')?.length).toBe(0)
    })

    it('should focus existing window instead of creating a new one', () => {
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        const first = eState.windows[0]
        first.focus.mockClear()
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        expect(eState.windows).toHaveLength(1)
        expect(first.focus).toHaveBeenCalledTimes(1)
    })

    // P1/N-05：主窗口/其他窗口发来的对话框通道消息一律拒绝
    it('should reject senders that are not the dialog window', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        ShowFileFolderRenameDialog('C:/notes/a.md', true)
        await Promise.all(
            triggerIpcFromForeign('baize:dialog:rename-file-folder-enter', 'hacked.md')
        )
        expect(fileOpsMocks.RenameFileFolder).not.toHaveBeenCalled()
        expect(eState.windows[0].isDestroyed()).toBe(false)
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})
