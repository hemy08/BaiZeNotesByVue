import { describe, it, expect, beforeEach, vi } from 'vitest'

// CMP-30：dialog-helpers 经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// dialog-helpers 使用 dialog.showMessageBoxSync / showSaveDialog / showOpenDialog
const dialogMocks = vi.hoisted(() => ({
    showMessageBoxSync: vi.fn(),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn()
}))

vi.mock('electron', () => ({
    BrowserWindow: class {},
    dialog: {
        showMessageBoxSync: dialogMocks.showMessageBoxSync,
        showSaveDialog: dialogMocks.showSaveDialog,
        showOpenDialog: dialogMocks.showOpenDialog
    }
}))

import { appState } from '../../src/main/utils/app-state'
import {
    showErrorMessageBox,
    showInfoMessageBox,
    showWarningMessageBox,
    showConfirmDialog,
    showSaveDialog,
    showOpenDialog
} from '../../src/main/utils/file-utils/dialog-helpers'

// 主窗口 mock：仅提供 webContents.send 用于断言发送给渲染层的消息
const mainSend = vi.fn()
const makeWindow = () => ({ webContents: { send: mainSend } })

describe('showErrorMessageBox', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        appState._resetForTesting()
        appState.mainWindow = makeWindow() as never
    })

    it('should send an error dialog message with default title', () => {
        showErrorMessageBox('boom')
        expect(mainSend).toHaveBeenCalledWith('baize:dialog:open-vue', 'message', {
            title: '错误!',
            type: 'error',
            message: 'boom'
        })
    })

    it('should send an error dialog message with custom title', () => {
        showErrorMessageBox('boom', '自定义标题')
        expect(mainSend).toHaveBeenCalledWith('baize:dialog:open-vue', 'message', {
            title: '自定义标题',
            type: 'error',
            message: 'boom'
        })
    })
})

describe('showInfoMessageBox / showWarningMessageBox', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        appState._resetForTesting()
        appState.mainWindow = makeWindow() as never
    })

    it('should send an info dialog message with default title', () => {
        showInfoMessageBox('done')
        expect(mainSend).toHaveBeenCalledWith('baize:dialog:open-vue', 'message', {
            title: '提示',
            type: 'info',
            message: 'done'
        })
    })

    it('should send a warning dialog message with default title', () => {
        showWarningMessageBox('careful')
        expect(mainSend).toHaveBeenCalledWith('baize:dialog:open-vue', 'message', {
            title: '警告',
            type: 'warning',
            message: 'careful'
        })
    })
})

describe('showConfirmDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return true when user confirms with a window', () => {
        dialogMocks.showMessageBoxSync.mockReturnValue(0)
        const win = makeWindow() as never
        const result = showConfirmDialog('sure?', '确认', win)
        expect(result).toBe(true)
        expect(dialogMocks.showMessageBoxSync).toHaveBeenCalledWith(
            win,
            expect.objectContaining({
                type: 'question',
                buttons: ['确认', '取消'],
                defaultId: 0,
                cancelId: 1
            })
        )
    })

    it('should return false when user cancels with a window', () => {
        dialogMocks.showMessageBoxSync.mockReturnValue(1)
        const result = showConfirmDialog('sure?', '确认', makeWindow() as never)
        expect(result).toBe(false)
    })

    it('should call dialog without window argument when window is omitted', () => {
        dialogMocks.showMessageBoxSync.mockReturnValue(0)
        const result = showConfirmDialog('sure?')
        expect(result).toBe(true)
        expect(dialogMocks.showMessageBoxSync).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'question',
                title: '确认',
                message: 'sure?'
            })
        )
        expect(dialogMocks.showMessageBoxSync.mock.calls[0]).toHaveLength(1)
    })
})

describe('showSaveDialog / showOpenDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should pass through save dialog result', async () => {
        const expected = { canceled: true, filePath: undefined }
        dialogMocks.showSaveDialog.mockResolvedValue(expected)
        const win = makeWindow() as never
        const options = { title: '保存' }
        const result = await showSaveDialog(win, options)
        expect(result).toBe(expected)
        expect(dialogMocks.showSaveDialog).toHaveBeenCalledWith(win, options)
    })

    it('should pass through open dialog result', async () => {
        const expected = { canceled: false, filePaths: ['C:\\a.md'] }
        dialogMocks.showOpenDialog.mockResolvedValue(expected)
        const win = makeWindow() as never
        const options = { properties: ['openFile' as const] }
        const result = await showOpenDialog(win, options)
        expect(result).toBe(expected)
        expect(dialogMocks.showOpenDialog).toHaveBeenCalledWith(win, options)
    })
})
