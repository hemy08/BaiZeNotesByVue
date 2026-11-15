import { describe, it, expect, vi } from 'vitest'

// CMP-30：对话框文案经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// dialog-common.ts 仅依赖 electron 的 dialog，mock 掉整个 electron 模块即可
const dialogMocks = vi.hoisted(() => ({
    showMessageBox: vi.fn()
}))

vi.mock('electron', () => ({
    dialog: { showMessageBox: dialogMocks.showMessageBox }
}))

// P2/CQ-4：颜色调色板与 NewSelect/NewButton/NewCheckBox/NewTextArea/
// ApplyCancelButton 等 JSDOM 构建工具零生产消费，已随源码删除；
// 本测试只覆盖唯一生产可达的 ShowAlreadyExistDialog。
import { ShowAlreadyExistDialog } from '../../src/main/dialogs/dialog-common'

describe('ShowAlreadyExistDialog', () => {
    it('should show a message box with duplicated dialog warning', () => {
        ShowAlreadyExistDialog()
        expect(dialogMocks.showMessageBox).toHaveBeenCalledTimes(1)
        const arg = dialogMocks.showMessageBox.mock.calls[0][0]
        expect(arg.title).toBe('错误！')
        expect(arg.type).toBe('info')
        expect(arg.detail).toBe('已经有一个相同的对话框，请先关闭！！！')
        expect(arg.buttons).toEqual(['确定'])
    })
})
