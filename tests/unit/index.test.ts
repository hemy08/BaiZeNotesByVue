import { describe, it, expect, vi } from 'vitest'

// CMP-30：file-utils 依赖链经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron 与外围依赖 mock ============
// index 聚合全部子模块，需要完整 electron mock 以及 logger/file-state 桩
const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBoxSync: vi.fn(),
    getAllWindows: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: vi.fn() }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: electronMocks.showSaveDialog,
            showOpenDialog: electronMocks.showOpenDialog,
            showMessageBoxSync: electronMocks.showMessageBoxSync
        },
        shell: { showItemInFolder: vi.fn() },
        clipboard: { writeText: vi.fn() },
        app: { getPath: () => '', getVersion: () => '1.0.0-test' },
        ipcMain: { on: () => {} }
    }
})

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/utils/file-state', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

// ARC-11：file-operations 直接依赖 file-state-store，桩替换其存储实现
vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

import * as FileUtils from '../../src/main/utils/file-utils/index'
import * as pathUtils from '../../src/main/utils/file-utils/path-utils'
import * as fileOps from '../../src/main/utils/file-utils/file-operations'

describe('file-utils index re-exports', () => {
    it('should re-export path utils with identical function references', () => {
        expect(FileUtils.ParserFileName).toBe(pathUtils.ParserFileName)
        expect(FileUtils.ParseDirectoryPath).toBe(pathUtils.ParseDirectoryPath)
        expect(FileUtils.GetCurrentFileDirectory).toBe(pathUtils.GetCurrentFileDirectory)
        expect(FileUtils.SelectDirectory).toBe(pathUtils.SelectDirectory)
        expect(FileUtils.BuildFileTree).toBe(pathUtils.BuildFileTree)
    })

    it('should re-export dialog helpers', () => {
        expect(typeof FileUtils.showErrorMessageBox).toBe('function')
        expect(typeof FileUtils.showInfoMessageBox).toBe('function')
        expect(typeof FileUtils.showWarningMessageBox).toBe('function')
        expect(typeof FileUtils.showConfirmDialog).toBe('function')
        expect(typeof FileUtils.showSaveDialog).toBe('function')
        expect(typeof FileUtils.showOpenDialog).toBe('function')
    })

    it('should re-export auto-save functions', () => {
        expect(typeof FileUtils.StartAutoSaveFileTime).toBe('function')
        expect(typeof FileUtils.StopAutoSaveFileTime).toBe('function')
        expect(typeof FileUtils.IsAutoSaveRunning).toBe('function')
    })

    it('should re-export file operations with identical references', () => {
        expect(FileUtils.getMathRandom).toBe(fileOps.getMathRandom)
        expect(FileUtils.SaveActiveFile).toBe(fileOps.SaveActiveFile)
        expect(FileUtils.TraverseDirectory).toBe(fileOps.TraverseDirectory)
        expect(typeof FileUtils.CreateFileFolder).toBe('function')
        expect(typeof FileUtils.Rename).toBe('function')
        expect(typeof FileUtils.Delete).toBe('function')
    })

    it('should re-export image, clipboard, import and export functions', () => {
        expect(typeof FileUtils.SaveImageDataToFile).toBe('function')
        expect(typeof FileUtils.InsertImagesToFile).toBe('function')
        expect(typeof FileUtils.CopyImageLink).toBe('function')
        expect(typeof FileUtils.FileManagerContextMenuCopy).toBe('function')
        expect(typeof FileUtils.FileManagerContextMenuPaste).toBe('function')
        expect(typeof FileUtils.InsertImportFormFile).toBe('function')
        expect(typeof FileUtils.ImportCreateNewFile).toBe('function')
        expect(typeof FileUtils.ExportToFile).toBe('function')
    })
})
