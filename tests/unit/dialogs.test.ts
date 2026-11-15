import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'

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
    showSaveDialog: vi.fn(),
    showItemInFolder: vi.fn()
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
        shell: { openExternal: vi.fn(), showItemInFolder: eState.showItemInFolder },
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

// ============ 依赖模块 mock ============
const configMocks = vi.hoisted(() => ({
    getCurrentThemeStyles: vi.fn(),
    getSystemSetting: vi.fn(),
    saveSystemSetting: vi.fn(),
    getCurrentTheme: vi.fn(() => 'baize'),
    setTheme: vi.fn(),
    getAllThemes: vi.fn(() => []),
    getAllMonacoThemes: vi.fn(() => []),
    getSeparateEditorTheme: vi.fn(() => false),
    setSeparateEditorTheme: vi.fn(),
    getMonacoTheme: vi.fn(() => 'vs'),
    setMonacoTheme: vi.fn()
}))

vi.mock('../../src/main/config', () => configMocks)

const editorSettingMocks = vi.hoisted(() => ({
    getEditorSetting: vi.fn(() => ({})),
    saveEditorSetting: vi.fn(),
    resetEditorSetting: vi.fn(),
    getDefaultEditorSetting: vi.fn(() => ({}))
}))

vi.mock('../../src/main/config/editor-setting', () => editorSettingMocks)

const quickLinkMocks = vi.hoisted(() => ({
    getQuickLinks: vi.fn(() => []),
    saveQuickLinks: vi.fn(),
    resetToDefault: vi.fn()
}))

vi.mock('../../src/main/config/quick-link-config', () => quickLinkMocks)

const fileUtilsMocks = vi.hoisted(() => ({
    DeleteFileFolder: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils', () => fileUtilsMocks)

const fileOpsMocks = vi.hoisted(() => ({
    CreateFileFolder: vi.fn(),
    ReloadDirFromDisk: vi.fn(),
    RenameFileFolder: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => fileOpsMocks)

const autoSaveMocks = vi.hoisted(() => ({
    StartAutoSaveFileTime: vi.fn(),
    StopAutoSaveFileTime: vi.fn(),
    IsAutoSaveRunning: vi.fn(() => false)
}))

vi.mock('../../src/main/utils/file-utils/auto-save', () => autoSaveMocks)

// P2 死代码清理：原 JSDOM 主题设置对话框已删除（其模块顶层 window.electronAPI
// 访问曾需要 stubGlobal('window') 兜底）；C-03 起主进程主题广播统一走
// ipc/theme-broadcast（无渲染层全局引用），本文件不再需要 window 桩。

import {
    ShowConfirmDeleteDialog,
    MainWindowListenDialogsEvent,
    CleanupMainWindowDialogsEvent
} from '../../src/main/dialogs/dialogs'
import { windowManager } from '../../src/main/config/window-manager'
import { ipcListenerManager } from '../../src/main/ipc/ipc-listener-manager'

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

// P1/N-05：文件管理器右键通道统一校验发送方，事件桩需携带受信主窗口 webContents
let mainWindowStub: { webContents: { send: ReturnType<typeof vi.fn> }; isDestroyed: () => boolean }

function triggerIpc(channel: string, ...args: unknown[]) {
    triggerIpcWithSender({ sender: mainWindowStub.webContents }, channel, ...args)
}

function triggerIpcWithSender(event: { sender: unknown }, channel: string, ...args: unknown[]) {
    const listeners = eState.ipcListeners.get(channel) || []
    listeners.forEach((cb) => cb(event as never, ...args))
}

beforeEach(() => {
    eState.windows.length = 0
    eState.ipcListeners.clear()
    vi.clearAllMocks()
    mainWindowStub = {
        webContents: { send: vi.fn() },
        isDestroyed: () => false
    }
    configMocks.getCurrentThemeStyles.mockReturnValue(themeStyles)
    configMocks.getSystemSetting.mockReturnValue({
        language: 'zh',
        resourceManager: 'left',
        editorModel: 'monaco',
        pluginOpen: 'browser',
        menuBarStyle: 'electron',
        autoSaveEnabled: true,
        autoSaveInterval: 60,
        fontFamily: 'Microsoft YaHei',
        fontSize: 14,
        renderWhitespace: 'all',
        editorSettingModal: false,
        systemSettingModal: false,
        themeSettingModal: false,
        helpAboutModal: false,
        helpContactUsModal: false,
        insertImageModal: false,
        admonitionsModal: false,
        fontSelectModal: false,
        mathTextModal: false,
        mdSheetModal: false,
        importOptionModal: false,
        mermaidEditModal: false,
        quickLinkSettingModal: false,
        techStackModal: false,
        webUrlModal: false
    })
    windowManager.closeAll()
})

describe('ShowConfirmDeleteDialog', () => {
    it('should ask for confirmation with question type and path in message', async () => {
        eState.showMessageBox.mockResolvedValue({ response: 1 })
        await ShowConfirmDeleteDialog('C:/notes/a.md', true)
        expect(eState.showMessageBox).toHaveBeenCalledTimes(1)
        const arg = eState.showMessageBox.mock.calls[0][0]
        expect(arg.type).toBe('question')
        expect(arg.title).toBe('确认')
        expect(arg.buttons).toEqual(['是', '否'])
        expect(arg.message).toBe('确定要删除[C:/notes/a.md]吗？')
    })

    it('should delete the file when user confirms', async () => {
        eState.showMessageBox.mockResolvedValue({ response: 0 })
        fileUtilsMocks.DeleteFileFolder.mockResolvedValue(undefined)
        await ShowConfirmDeleteDialog('C:/notes/a.md', true)
        expect(fileUtilsMocks.DeleteFileFolder).toHaveBeenCalledWith('C:/notes/a.md', true)
    })

    it('should not delete when user cancels', async () => {
        eState.showMessageBox.mockResolvedValue({ response: 1 })
        await ShowConfirmDeleteDialog('C:/notes/a.md', true)
        expect(fileUtilsMocks.DeleteFileFolder).not.toHaveBeenCalled()
    })
})

describe('MainWindowListenDialogsEvent / CleanupMainWindowDialogsEvent', () => {
    const channels = [
        'baize:fs:create-file',
        'baize:fs:import-from',
        'baize:fs:delete',
        'baize:fs:find-in',
        'baize:fs:rename'
    ]

    it('should register all file-manager context menu channels', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        for (const channel of channels) {
            expect(eState.ipcListeners.get(channel)?.length ?? 0).toBeGreaterThan(0)
        }
    })

    it('should track registered channels in the IPC listener inventory', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const inventory = ipcListenerManager.getInventory()
        for (const channel of channels) {
            const entry = inventory.find((item) => item.channel === channel)
            expect(entry, `台账应包含 ${channel}`).toMatchObject({
                kind: 'on',
                persistent: false
            })
            expect(entry?.components).toEqual(['main-window-dialogs'])
        }
    })

    it('should open create-file-folder dialog when create-file event arrives', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpc('baize:fs:create-file', 'C:/notes', false, '')
        // 事件处理器内部调用 ShowCreateFileFolderDialog → 创建窗口
        const win = eState.windows.find((w) => w.options.title === '新建')
        expect(win).toBeDefined()
        expect(win!.options.width).toBe(450)
        // FE-09：新增「取消/确定」按钮行，窗口高度由 150 调整为 230
        expect(win!.options.height).toBe(230)
    })

    it('should open rename dialog when rename event arrives', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpc('baize:fs:rename', 'C:/notes/a.md', true)
        const win = eState.windows.find((w) => w.options.title === '重命名')
        expect(win).toBeDefined()
        expect(win!.options.width).toBe(500)
    })

    it('should reject untrusted senders for file-manager channels', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpcWithSender({ sender: { id: 999 } }, 'baize:fs:create-file', 'C:/evil', false, '')
        triggerIpcWithSender({ sender: { id: 999 } }, 'baize:fs:delete', 'C:/notes/a.md', true)
        expect(eState.windows).toHaveLength(0)
        expect(eState.showMessageBox).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should clean up all registered listeners and inventory entries', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        CleanupMainWindowDialogsEvent()
        const inventory = ipcListenerManager.getInventory()
        for (const channel of channels) {
            expect(eState.ipcListeners.get(channel)?.length ?? 0).toBe(0)
            expect(
                inventory
                    .find((item) => item.channel === channel)
                    ?.components.includes('main-window-dialogs') ?? false
            ).toBe(false)
        }
    })

    // AS-8：在资源管理器中定位只接受受信根内路径，UNC/设备命名空间一律拒绝（NTLM 泄露面）
    describe('FIND_IN path validation (AS-8)', () => {
        it('should locate a file inside a trusted root', () => {
            MainWindowListenDialogsEvent(mainWindowStub as never)
            const trustedPath = path.join(os.tmpdir(), 'baize-dialogs-find-in.md')
            triggerIpc('baize:fs:find-in', trustedPath)
            expect(eState.showItemInFolder).toHaveBeenCalledWith(trustedPath)
        })

        it('should reject UNC / device / relative paths without calling the shell', () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            MainWindowListenDialogsEvent(mainWindowStub as never)
            for (const targetPath of [
                '\\\\attacker\\share\\file.txt',
                '//attacker/share/file.txt',
                '\\\\?\\C:\\Windows\\win.ini',
                'relative/path.md'
            ]) {
                triggerIpc('baize:fs:find-in', targetPath)
            }
            expect(eState.showItemInFolder).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })
})
