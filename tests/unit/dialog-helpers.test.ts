import { describe, it, expect, beforeEach, vi } from 'vitest'

// CMP-30：dialog-helpers 经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

import { appState } from '../../src/main/utils/app-state'
import {
    showErrorMessageBox,
    showInfoMessageBox,
    showWarningMessageBox
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
