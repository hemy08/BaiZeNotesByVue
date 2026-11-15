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

// 文件操作 mock：避免真实落盘与 electron 依赖
const fileOpsMocks = vi.hoisted(() => ({
    CreateFileFolder: vi.fn(),
    ReloadDirFromDisk: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => fileOpsMocks)

// FE-09：失败提示走统一错误消息框（避免真实加载 electron dialog 链）
const dialogHelperMocks = vi.hoisted(() => ({
    showErrorMessageBox: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/dialog-helpers', () => dialogHelperMocks)

import { ShowCreateFileFolderDialog } from '../../src/main/dialogs/ShowCreateFileFolderDialog'
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
    fileOpsMocks.CreateFileFolder.mockResolvedValue(undefined)
    fileOpsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    windowManager.closeAll()
})

describe('ShowCreateFileFolderDialog', () => {
    it('should create a create-file-folder window with expected options', () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        expect(eState.windows).toHaveLength(1)
        const win = eState.windows[0]
        expect(win.options.width).toBe(450)
        // FE-09：新增「取消/确定」按钮行，窗口高度相应增加
        expect(win.options.height).toBe(230)
        expect(win.options.minimizable).toBe(false)
        expect(win.options.maximizable).toBe(false)
        expect(win.options.resizable).toBe(false)
        expect(win.options.title).toBe('新建')
    })

    it('should load data URL html and send init theme', () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        const win = eState.windows[0]
        expect(win.setMenu).toHaveBeenCalledWith(null)
        expect(win.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html;charset=utf-8,/)
        expect(win.show).toHaveBeenCalledTimes(1)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:theme:init-styles', themeStyles)
    })

    it('should generate html with input, hint and theme variables', () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('file-folder-name')
        expect(html).toContain('请输入名称')
        expect(html).toContain('文件默认后缀 .md')
        expect(html).toContain('baize:dialog:create-file-folder-enter')
        expect(html).toContain('--title-bar-gradient')
    })

    // FE-09：此前对话框只有标题栏与关闭 ×，提交只能按回车；现在必须有可见的「确定/取消」按钮
    it('should render visible confirm and cancel buttons (FE-09)', () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        const html = getLoadedHtml(eState.windows[0])
        expect(html).toContain('id="confirm-dialog-btn"')
        expect(html).toContain('id="cancel-dialog-btn"')
        expect(html).toContain('确定')
        expect(html).toContain('取消')
        // 空名称提示元素（提交时做最小校验）
        expect(html).toContain('id="create-error-tip"')
        expect(html).toContain('名称不能为空')
    })

    // FE-09：创建失败（如磁盘错误）必须提示用户且保留对话框，不得静默关闭
    it('should report creation failures and keep the dialog open (FE-09)', async () => {
        fileOpsMocks.CreateFileFolder.mockRejectedValueOnce(new Error('disk full'))
        ShowCreateFileFolderDialog('C:/notes', false, '')

        await Promise.all(triggerIpc('baize:dialog:create-file-folder-enter', '新笔记'))

        expect(dialogHelperMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
        const message = dialogHelperMocks.showErrorMessageBox.mock.calls[0][0] as string
        expect(message).toContain('创建「新笔记」失败')
        expect(message).toContain('disk full')
        expect(eState.windows[0].isDestroyed()).toBe(false)
        expect(fileOpsMocks.ReloadDirFromDisk).not.toHaveBeenCalled()
    })

    it('should append .md for file without extension and empty default extension', async () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        await Promise.all(triggerIpc('baize:dialog:create-file-folder-enter', '我的笔记'))
        expect(fileOpsMocks.CreateFileFolder).toHaveBeenCalledWith(
            '我的笔记.md',
            'C:/notes',
            false,
            ''
        )
        expect(fileOpsMocks.ReloadDirFromDisk).toHaveBeenCalledTimes(1)
        expect(eState.windows[0].isDestroyed()).toBe(true)
    })

    it('should keep explicit name when it already contains a dot', async () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        await Promise.all(triggerIpc('baize:dialog:create-file-folder-enter', 'todo.txt'))
        expect(fileOpsMocks.CreateFileFolder).toHaveBeenCalledWith(
            'todo.txt',
            'C:/notes',
            false,
            ''
        )
    })

    it('should not append .md when a default file extension is given', async () => {
        ShowCreateFileFolderDialog('C:/notes', false, 'txt')
        await Promise.all(triggerIpc('baize:dialog:create-file-folder-enter', 'todo'))
        expect(fileOpsMocks.CreateFileFolder).toHaveBeenCalledWith('todo', 'C:/notes', false, 'txt')
    })

    it('should not append .md when creating a folder', async () => {
        ShowCreateFileFolderDialog('C:/notes', true, '')
        await Promise.all(triggerIpc('baize:dialog:create-file-folder-enter', '新目录'))
        expect(fileOpsMocks.CreateFileFolder).toHaveBeenCalledWith('新目录', 'C:/notes', true, '')
    })

    it('should clean up the ipc listener after dialog closed', () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        expect(eState.ipcListeners.get('baize:dialog:create-file-folder-enter')?.length).toBe(1)
        eState.windows[0].close()
        expect(eState.ipcListeners.get('baize:dialog:create-file-folder-enter')?.length).toBe(0)
    })

    it('should show already-exist dialog when window exists', () => {
        ShowCreateFileFolderDialog('C:/notes', false, '')
        ShowCreateFileFolderDialog('C:/notes', false, '')
        expect(eState.windows).toHaveLength(1)
        expect(eState.showMessageBox).toHaveBeenCalledTimes(1)
    })

    // P1/N-05：主窗口/其他窗口发来的对话框通道消息一律拒绝
    it('should reject senders that are not the dialog window', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        ShowCreateFileFolderDialog('C:/notes', false, '')
        await Promise.all(
            triggerIpcFromForeign('baize:dialog:create-file-folder-enter', 'hacked.md')
        )
        expect(fileOpsMocks.CreateFileFolder).not.toHaveBeenCalled()
        expect(eState.windows[0].isDestroyed()).toBe(false)
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})
