/**
 * 覆盖率补测第五批：auto-save.ts 定时回调异常兜底分支（独立于既有 auto-save.test.ts）。
 *
 * SaveActiveFile 正常路径不会抛错（内部 catch 并返回 false）；这里用 mock 模拟极端异常，
 * 覆盖定时器回调的 catch 兜底：记录 logger.error 并经状态栏通知渲染层。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
    mainSend: vi.fn()
}))

vi.mock('electron', () => ({
    BrowserWindow: class {},
    app: { getPath: () => '', getVersion: () => '1.4.0-test' },
    ipcMain: { on: () => {} }
}))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const saveMocks = vi.hoisted(() => ({
    SaveActiveFile: vi.fn(async () => true)
}))
vi.mock('../../../src/main/utils/file-utils/file-operations', () => ({
    SaveActiveFile: saveMocks.SaveActiveFile
}))

import {
    IsAutoSaveRunning,
    StartAutoSaveFileTime,
    StopAutoSaveFileTime
} from '../../../src/main/utils/file-utils/auto-save'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function makeDirtyActiveFile(): void {
    appState.currentActiveFile = {
        name: 'note.md',
        path: 'E:/notes/note.md',
        type: 'file',
        content: 'changed',
        encoding: 'utf-8'
    }
    appState.markFileLoaded('baseline')
}

beforeEach(() => {
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.mainWindow = {
        webContents: { id: 1, send: electronMocks.mainSend, isDestroyed: () => false },
        isDestroyed: () => false
    } as unknown as Electron.BrowserWindow
    saveMocks.SaveActiveFile.mockResolvedValue(true)
})

afterEach(() => {
    StopAutoSaveFileTime()
})

describe('自动保存定时回调异常兜底', () => {
    it('SaveActiveFile 抛错时记录错误并经状态栏通知（非模态）', async () => {
        const error = new Error('disk exploded')
        saveMocks.SaveActiveFile.mockRejectedValueOnce(error)
        makeDirtyActiveFile()

        StartAutoSaveFileTime(20)
        expect(IsAutoSaveRunning()).toBe(true)
        await sleep(80)
        StopAutoSaveFileTime()

        expect(logger.error).toHaveBeenCalledWith('Auto-save failed:', error)
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            expect.stringContaining('status-bar:update'),
            expect.objectContaining({ type: 'error' })
        )
        expect(IsAutoSaveRunning()).toBe(false)
    })

    it('主窗口不可用时异常分支仍不抛出（可选链安全降级）', async () => {
        saveMocks.SaveActiveFile.mockRejectedValueOnce(new Error('boom'))
        makeDirtyActiveFile()
        appState.mainWindow = null

        StartAutoSaveFileTime(20)
        await sleep(80)
        StopAutoSaveFileTime()

        expect(logger.error).toHaveBeenCalledWith('Auto-save failed:', expect.any(Error))
        expect(electronMocks.mainSend).not.toHaveBeenCalled()
    })

    it('文件不脏时不调用 SaveActiveFile（定时器空转）', async () => {
        appState.currentActiveFile = {
            name: 'note.md',
            path: 'E:/notes/note.md',
            type: 'file',
            content: 'same',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('same')

        StartAutoSaveFileTime(20)
        await sleep(80)
        StopAutoSaveFileTime()

        expect(saveMocks.SaveActiveFile).not.toHaveBeenCalled()
    })
})
