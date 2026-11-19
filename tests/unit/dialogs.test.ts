/**
 * 主进程对话框入口单元测试（结构优化第 2 批 2.1 / H3：双对话框体系收敛）
 *
 * 覆盖：
 * 1. 帮助类 Vue 对话框请求：RequestShortcutKeysDialog / RequestUpdateLogDialog /
 *    RequestReleaseNotesDialog 经 OPEN_VUE_DIALOG 发送正确 dialogName + data；
 * 2. 文件管理器右键通道（新建/重命名/删除）只转发为 Vue 对话框请求、不再创建窗口；
 * 3. Vue 对话框确认后的动作通道（重命名/删除 invoke）真正执行文件操作，
 *    失败经 Vue 消息对话框提示并返回 ok=false；
 * 4. P1/N-05 安全边界：仅受信主窗口可触发上述通道；
 * 5. FE-09 语义：失败不静默；AS-8：定位路径校验保留；
 * 6. 监听台账：on 通道随窗口清理、确认动作 handle 为进程级持久注册。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
// ============ electron mock ============
const eState = vi.hoisted(() => ({
    ipcListeners: new Map<string, Array<(...args: unknown[]) => unknown>>(),
    handleListeners: new Map<string, (...args: unknown[]) => unknown>(),
    showItemInFolder: vi.fn()
}))

vi.mock('electron', () => {
    return {
        BrowserWindow: class MockBrowserWindow {},
        dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
        shell: { openExternal: vi.fn(), showItemInFolder: eState.showItemInFolder },
        ipcMain: {
            on: vi.fn((channel: string, cb: (...args: unknown[]) => unknown) => {
                const list = eState.ipcListeners.get(channel) || []
                list.push(cb)
                eState.ipcListeners.set(channel, list)
            }),
            removeListener: vi.fn((channel: string, cb: (...args: unknown[]) => unknown) => {
                const list = eState.ipcListeners.get(channel) || []
                const idx = list.indexOf(cb)
                if (idx !== -1) list.splice(idx, 1)
            }),
            removeAllListeners: vi.fn(),
            once: vi.fn(),
            handle: vi.fn((channel: string, cb: (...args: unknown[]) => unknown) => {
                // 镜像 Electron 行为：重复 handle 抛错（registerHandleOnce 以此判重）
                if (eState.handleListeners.has(channel)) {
                    throw new Error(`Attempted to register a second handler for '${channel}'`)
                }
                eState.handleListeners.set(channel, cb)
            }),
            removeHandler: vi.fn((channel: string) => {
                eState.handleListeners.delete(channel)
            }),
            listenerCount: vi.fn(() => 0)
        },
        app: {
            getPath: vi.fn(() => ''),
            getVersion: vi.fn(() => '1.0.0'),
            getName: vi.fn(() => 'baize')
        }
    }
})

// ============ 依赖模块 mock ============
// OpenOnlineWebPages（经 dialogs.ts 再导出）会读取 config 的主题/系统设置与窗口管理器，
// 这里用最小替身隔离 electron-store 等主进程存储依赖链。
const configMocks = vi.hoisted(() => ({
    getCurrentThemeStyles: vi.fn(),
    getSystemSettingValString: vi.fn(() => 'browser')
}))
vi.mock('../../src/main/config', () => configMocks)

const windowManagerMock = vi.hoisted(() => ({
    windowManager: {
        createWindow: vi.fn()
    }
}))
vi.mock('../../src/main/config/window-manager', () => windowManagerMock)

const fileUtilsMocks = vi.hoisted(() => ({
    DeleteFileFolder: vi.fn(),
    RenameFileFolder: vi.fn(),
    InsertImportFormFile: vi.fn(),
    showErrorMessageBox: vi.fn()
}))
vi.mock('../../src/main/utils/file-utils', () => fileUtilsMocks)

import { IPC } from '../../src/shared/ipc-channels'
import {
    CleanupMainWindowDialogsEvent,
    MainWindowListenDialogsEvent,
    RequestReleaseNotesDialog,
    RequestShortcutKeysDialog,
    RequestUpdateLogDialog
} from '../../src/main/dialogs/dialogs'
import { ipcListenerManager } from '../../src/main/ipc/ipc-listener-manager'

// P1/N-05：事件桩需携带受信主窗口 webContents
interface MainWindowStub {
    webContents: { send: ReturnType<typeof vi.fn>; id: number }
    isDestroyed: () => boolean
}
let mainWindowStub: MainWindowStub

function triggerIpc(channel: string, ...args: unknown[]) {
    return triggerIpcWithSender({ sender: mainWindowStub.webContents }, channel, ...args)
}

function triggerIpcWithSender(event: { sender: unknown }, channel: string, ...args: unknown[]) {
    const listeners = eState.ipcListeners.get(channel) || []
    return listeners.map((cb) => cb(event as never, ...args))
}

async function triggerHandle(channel: string, ...args: unknown[]) {
    const handler = eState.handleListeners.get(channel)
    expect(handler, `应注册 handle 通道 ${channel}`).toBeDefined()
    return await handler!({ sender: mainWindowStub.webContents }, ...args)
}

beforeEach(() => {
    eState.ipcListeners.clear()
    eState.handleListeners.clear()
    vi.clearAllMocks()
    // 确认动作 handle 为进程级持久注册：清理台账中的持久项，保证每个用例重新注册成功
    ipcListenerManager.cleanupChannel(IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT)
    ipcListenerManager.cleanupChannel(IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM)
    ipcListenerManager.cleanupComponent('main-window-dialogs')
    mainWindowStub = {
        webContents: { send: vi.fn(), id: 1 },
        isDestroyed: () => false
    }
    fileUtilsMocks.DeleteFileFolder.mockResolvedValue(undefined)
    fileUtilsMocks.RenameFileFolder.mockResolvedValue(undefined)
    fileUtilsMocks.InsertImportFormFile.mockResolvedValue(undefined)
})

describe('帮助类 Vue 对话框请求（原 JSDOM 帮助对话框 → OPEN_VUE_DIALOG）', () => {
    it('should request the shortcut-keys Vue dialog', () => {
        RequestShortcutKeysDialog(mainWindowStub as never)
        expect(mainWindowStub.webContents.send).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'shortcutKeys'
        )
    })

    it('should request the update-log Vue dialog', () => {
        RequestUpdateLogDialog(mainWindowStub as never)
        expect(mainWindowStub.webContents.send).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'updateLog'
        )
    })

    it('should request the release-notes Vue dialog with the version payload', () => {
        RequestReleaseNotesDialog(mainWindowStub as never, '1.2.2')
        expect(mainWindowStub.webContents.send).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'releaseNotes',
            { version: '1.2.2' }
        )
    })
})

describe('文件管理器右键通道 → Vue 对话框请求（不再创建 JSDOM 窗口）', () => {
    const channels = [
        IPC.FILE_MANAGER.CREATE_FILE,
        IPC.FILE_MANAGER.IMPORT_FROM,
        IPC.FILE_MANAGER.DELETE,
        IPC.FILE_MANAGER.FIND_IN,
        IPC.FILE_MANAGER.RENAME
    ]

    it('should register all file-manager context menu channels', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        for (const channel of channels) {
            expect(eState.ipcListeners.get(channel)?.length ?? 0).toBeGreaterThan(0)
        }
    })

    it('should track registered on-channels in the IPC listener inventory', () => {
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

    it('should forward create-file to the create Vue dialog with the target directory', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpc(IPC.FILE_MANAGER.CREATE_FILE, 'C:/notes', false, '')
        expect(mainWindowStub.webContents.send).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'createFileFolder',
            { dirPath: 'C:/notes' }
        )
    })

    it('should forward rename to the rename Vue dialog with path/isFile', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpc(IPC.FILE_MANAGER.RENAME, 'C:/notes/a.md', true)
        expect(mainWindowStub.webContents.send).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'renameFileFolder',
            { path: 'C:/notes/a.md', isFile: true }
        )
    })

    it('should forward delete to the confirm-delete Vue dialog with path/isFile', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpc(IPC.FILE_MANAGER.DELETE, 'C:/notes/a.md', true)
        expect(mainWindowStub.webContents.send).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'confirmDelete',
            { path: 'C:/notes/a.md', isFile: true }
        )
    })

    it('should keep the right-click import flow (no dialog window)', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpc(IPC.FILE_MANAGER.IMPORT_FROM, 'word')
        expect(fileUtilsMocks.InsertImportFormFile).toHaveBeenCalledWith(
            mainWindowStub,
            'word',
            false
        )
        expect(mainWindowStub.webContents.send).not.toHaveBeenCalled()
    })

    it('should reject untrusted senders for file-manager channels', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        MainWindowListenDialogsEvent(mainWindowStub as never)
        triggerIpcWithSender({ sender: { id: 999 } }, IPC.FILE_MANAGER.CREATE_FILE, 'C:/evil')
        triggerIpcWithSender({ sender: { id: 999 } }, IPC.FILE_MANAGER.DELETE, 'C:/notes/a.md', true)
        triggerIpcWithSender({ sender: { id: 999 } }, IPC.FILE_MANAGER.RENAME, 'C:/notes/a.md', true)
        expect(mainWindowStub.webContents.send).not.toHaveBeenCalled()
        expect(fileUtilsMocks.DeleteFileFolder).not.toHaveBeenCalled()
        expect(fileUtilsMocks.RenameFileFolder).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should clean up on-channel listeners and inventory entries on window close', () => {
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
            triggerIpc(IPC.FILE_MANAGER.FIND_IN, trustedPath)
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
                triggerIpc(IPC.FILE_MANAGER.FIND_IN, targetPath)
            }
            expect(eState.showItemInFolder).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })
})

describe('Vue 对话框确认动作（invoke → 主进程执行文件操作）', () => {
    it('should rename the file/folder on submit and report success', async () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const result = await triggerHandle(
            IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
            'C:/notes/a.md',
            true,
            'b'
        )
        expect(fileUtilsMocks.RenameFileFolder).toHaveBeenCalledWith('C:/notes/a.md', 'b', true)
        expect(result).toEqual({ ok: true })
    })

    it('should report rename failures via the Vue message dialog and keep ok=false (FE-09)', async () => {
        fileUtilsMocks.RenameFileFolder.mockRejectedValueOnce(new Error('rename boom'))
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const result = await triggerHandle(
            IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
            'C:/notes/a.md',
            true,
            'b'
        )
        expect(result).toEqual({ ok: false, error: 'rename boom' })
        expect(fileUtilsMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
        const message = fileUtilsMocks.showErrorMessageBox.mock.calls[0][0] as string
        expect(message).toContain('重命名「C:/notes/a.md」失败')
        expect(message).toContain('rename boom')
    })

    it('should delete the file/folder on confirm and report success', async () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const result = await triggerHandle(
            IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM,
            'C:/notes/a.md',
            true
        )
        expect(fileUtilsMocks.DeleteFileFolder).toHaveBeenCalledWith('C:/notes/a.md', true)
        expect(result).toEqual({ ok: true })
    })

    it('should report delete failures via the Vue message dialog and keep ok=false', async () => {
        fileUtilsMocks.DeleteFileFolder.mockRejectedValueOnce(new Error('delete boom'))
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const result = await triggerHandle(
            IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM,
            'C:/notes/folder',
            false
        )
        expect(result).toEqual({ ok: false, error: 'delete boom' })
        expect(fileUtilsMocks.showErrorMessageBox).toHaveBeenCalledWith('delete boom')
    })

    it('should reject untrusted senders for confirm actions (no file operation)', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const renameHandler = eState.handleListeners.get(IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT)!
        const deleteHandler = eState.handleListeners.get(IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM)!
        const renameResult = await renameHandler(
            { sender: { id: 999 } },
            'C:/notes/a.md',
            true,
            'hacked'
        )
        const deleteResult = await deleteHandler({ sender: { id: 999 } }, 'C:/notes/a.md', true)
        expect(renameResult).toMatchObject({ ok: false, code: 'untrusted-sender' })
        expect(deleteResult).toMatchObject({ ok: false, code: 'untrusted-sender' })
        expect(fileUtilsMocks.RenameFileFolder).not.toHaveBeenCalled()
        expect(fileUtilsMocks.DeleteFileFolder).not.toHaveBeenCalled()
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })

    it('should re-register confirm-action handlers when the main window is recreated', () => {
        MainWindowListenDialogsEvent(mainWindowStub as never)
        const inventory = ipcListenerManager.getInventory()
        for (const channel of [
            IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
            IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM
        ]) {
            const entry = inventory.find((item) => item.channel === channel)
            expect(entry, `台账应包含 ${channel}`).toMatchObject({
                kind: 'handle',
                persistent: true
            })
            expect(eState.handleListeners.has(channel)).toBe(true)
        }
        // 窗口关闭时随 componentId 清理（主窗口重建时由 MainWindowListenDialogsEvent 重新注册）
        CleanupMainWindowDialogsEvent()
        expect(eState.handleListeners.has(IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT)).toBe(false)
        expect(eState.handleListeners.has(IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM)).toBe(false)
        MainWindowListenDialogsEvent(mainWindowStub as never)
        expect(eState.handleListeners.has(IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT)).toBe(true)
        expect(eState.handleListeners.has(IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM)).toBe(true)
    })
})
