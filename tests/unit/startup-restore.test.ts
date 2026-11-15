/**
 * src/main/utils/startup-restore.ts 单元测试（系统设置补充实现批次 A：#1/#2 启动恢复）
 *
 * 覆盖：
 * - 两个自动打开开关都关闭时不执行任何恢复动作；
 * - autoOpenLastFolder 且目录存在：先 WELCOME_ENTER_MAIN（directory）再经
 *   runAfterMainViewEntered 时序执行 CLEAR_EDITOR_PREVIEW + ReloadDirFromDisk；
 * - 目录不存在：清除持久化记录、不进入主界面、状态栏 warning 提示（i18n）；
 * - autoOpenLastFile 且文件存在：先 WELCOME_ENTER_MAIN（file）再 OpenSelectFile；
 * - 文件不存在：清除记录 + 状态栏 warning；
 * - 目录缺失但文件存在时仍恢复文件（进入主界面一次）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'

const hoisted = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        userData: `${base}/baize-vitest-startup-restore/user-data`,
        setting: {
            language: 'zh-CN',
            autoOpenLastFile: false,
            autoOpenLastFolder: false
        } as Record<string, unknown>
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => (name === 'userData' ? hoisted.userData : ''))
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => hoisted.setting
}))

// FE-01 时序等价桩：先同步执行调用方代码（WELCOME_ENTER_MAIN 已投递），
// 再在下一个 tick 执行数据任务（与真实 runAfterMainViewEntered 一致）
vi.mock('../../src/main/ipc/handlers', () => ({
    runAfterMainViewEntered: (task: () => Promise<void> | void) =>
        new Promise<void>((resolve, reject) => {
            setImmediate(() => {
                void (async () => {
                    try {
                        await task()
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                })()
            })
        })
}))

const fileUtilsMocks = vi.hoisted(() => ({
    OpenSelectFile: vi.fn(async () => {}),
    ReloadDirFromDisk: vi.fn(async () => {}),
    ParserFileName: vi.fn((filePath: string) => path.basename(filePath))
}))

vi.mock('../../src/main/utils/file-utils', () => fileUtilsMocks)

import { FakeStore } from './helpers/fake-store'
import { appState } from '../../src/main/utils/app-state'
import { IPC } from '../../src/shared/ipc-channels'
import { restoreLastOpenedAtStartup } from '../../src/main/utils/startup-restore'
import {
    getLastOpenedDirectory,
    getLastOpenedFile,
    saveLastOpenedDirectory,
    saveLastOpenedFile
} from '../../src/main/utils/file-state-store'
import type { SystemSetting } from '../../src/shared/types'

const mainWindowStub = () => {
    const send = vi.fn()
    return {
        win: {
            isDestroyed: () => false,
            webContents: { send, isDestroyed: () => false }
        } as never,
        send
    }
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
    FakeStore.resetAll()
    appState._resetForTesting()
    hoisted.setting = {
        language: 'zh-CN',
        autoOpenLastFile: false,
        autoOpenLastFolder: false
    }
    fileUtilsMocks.OpenSelectFile.mockClear()
    fileUtilsMocks.ReloadDirFromDisk.mockClear()
    fileUtilsMocks.ParserFileName.mockClear()
    fileUtilsMocks.OpenSelectFile.mockResolvedValue(undefined)
    fileUtilsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    fs.rmSync(hoisted.userData, { recursive: true, force: true })
    fs.mkdirSync(hoisted.userData, { recursive: true })
})

describe('restoreLastOpenedAtStartup', () => {
    it('should do nothing when both auto-open switches are off', async () => {
        const { win, send } = mainWindowStub()
        saveLastOpenedDirectory(path.join(hoisted.userData, 'notes'))
        saveLastOpenedFile(path.join(hoisted.userData, 'note.md'))

        await restoreLastOpenedAtStartup(win, hoisted.setting as unknown as SystemSetting)

        expect(send).not.toHaveBeenCalled()
        expect(fileUtilsMocks.ReloadDirFromDisk).not.toHaveBeenCalled()
        expect(fileUtilsMocks.OpenSelectFile).not.toHaveBeenCalled()
        expect(appState.rootPath).toBe('')
    })

    it('should restore an existing folder: WELCOME_ENTER_MAIN first, then reload the tree', async () => {
        const dir = path.join(hoisted.userData, 'notes')
        fs.mkdirSync(dir, { recursive: true })
        saveLastOpenedDirectory(dir)
        hoisted.setting.autoOpenLastFolder = true
        const { win, send } = mainWindowStub()
        appState.mainWindow = win

        await restoreLastOpenedAtStartup(win, hoisted.setting as unknown as SystemSetting)
        await settle()

        expect(send).toHaveBeenCalledWith(IPC.FILE.WELCOME_ENTER_MAIN, {
            type: 'directory',
            path: dir
        })
        const enterMainIndex = send.mock.calls.findIndex(
            (call) => call[0] === IPC.FILE.WELCOME_ENTER_MAIN
        )
        const clearPreviewIndex = send.mock.calls.findIndex(
            (call) => call[0] === IPC.FILE.CLEAR_EDITOR_PREVIEW
        )
        expect(enterMainIndex).toBeGreaterThanOrEqual(0)
        expect(clearPreviewIndex).toBeGreaterThan(enterMainIndex)
        expect(appState.rootPath).toBe(dir)
        expect(fileUtilsMocks.ReloadDirFromDisk).toHaveBeenCalledTimes(1)
        expect(getLastOpenedDirectory()).toBe(dir)
        appState.mainWindow = null
    })

    it('should clear a missing folder, stay on welcome and show a status hint', async () => {
        const gone = path.join(hoisted.userData, 'gone')
        saveLastOpenedDirectory(gone)
        hoisted.setting.autoOpenLastFolder = true
        const { win, send } = mainWindowStub()
        appState.mainWindow = win

        await restoreLastOpenedAtStartup(win, hoisted.setting as unknown as SystemSetting)

        expect(getLastOpenedDirectory()).toBeNull()
        expect(fileUtilsMocks.ReloadDirFromDisk).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalledWith(IPC.FILE.WELCOME_ENTER_MAIN, expect.anything())
        const statusCall = send.mock.calls.find((call) => call[0] === IPC.EVENTS.STATUS_BAR_UPDATE)
        expect(statusCall).toBeDefined()
        expect(statusCall![1]).toEqual(
            expect.objectContaining({
                type: 'warning',
                message: expect.stringContaining('工作目录')
            })
        )
        appState.mainWindow = null
    })

    it('should restore an existing file through OpenSelectFile after entering main view', async () => {
        const file = path.join(hoisted.userData, 'note.md')
        fs.writeFileSync(file, 'content', 'utf-8')
        saveLastOpenedFile(file)
        hoisted.setting.autoOpenLastFile = true
        const { win, send } = mainWindowStub()

        await restoreLastOpenedAtStartup(win, hoisted.setting as unknown as SystemSetting)
        await settle()

        expect(send).toHaveBeenCalledWith(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'file', path: file })
        expect(fileUtilsMocks.OpenSelectFile).toHaveBeenCalledWith({
            name: 'note.md',
            path: file,
            type: 'file',
            content: ''
        })
        expect(getLastOpenedFile()).toBe(file)
    })

    it('should clear a missing file and show a status warning without opening anything', async () => {
        const gone = path.join(hoisted.userData, 'gone.md')
        saveLastOpenedFile(gone)
        hoisted.setting.autoOpenLastFile = true
        const { win, send } = mainWindowStub()
        appState.mainWindow = win

        await restoreLastOpenedAtStartup(win, hoisted.setting as unknown as SystemSetting)

        expect(getLastOpenedFile()).toBeNull()
        expect(fileUtilsMocks.OpenSelectFile).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalledWith(IPC.FILE.WELCOME_ENTER_MAIN, expect.anything())
        const statusCall = send.mock.calls.find((call) => call[0] === IPC.EVENTS.STATUS_BAR_UPDATE)
        expect(statusCall).toBeDefined()
        expect(statusCall![1]).toEqual(
            expect.objectContaining({ type: 'warning', message: expect.stringContaining('文件') })
        )
        appState.mainWindow = null
    })

    it('should still restore the file when the folder is missing (single enter-main)', async () => {
        const dir = path.join(hoisted.userData, 'gone-dir')
        const file = path.join(hoisted.userData, 'note.md')
        saveLastOpenedDirectory(dir)
        fs.writeFileSync(file, 'x', 'utf-8')
        saveLastOpenedFile(file)
        hoisted.setting.autoOpenLastFolder = true
        hoisted.setting.autoOpenLastFile = true
        const { win, send } = mainWindowStub()
        appState.mainWindow = win

        await restoreLastOpenedAtStartup(win, hoisted.setting as unknown as SystemSetting)
        await settle()

        expect(getLastOpenedDirectory()).toBeNull()
        expect(fileUtilsMocks.OpenSelectFile).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'file', path: file })
        appState.mainWindow = null
    })
})
