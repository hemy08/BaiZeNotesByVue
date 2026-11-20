/**
 * close-confirm.test.ts
 *
 * 2026-11-20 用户需求：关闭/退出时未保存修改确认对话框。
 * 验证按钮顺序（保存并关闭 / 不保存 / 取消）与返回值映射，以及窗口销毁时
 * 退化为无父窗口对话框。
 * P3 F-09：minimizeToTray 场景（关闭 = 隐藏到托盘）使用「保存并隐藏」文案。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const dialogMocks = vi.hoisted(() => ({
    showMessageBox: vi.fn()
}))

vi.mock('electron', () => ({
    dialog: { showMessageBox: dialogMocks.showMessageBox }
}))

import { confirmUnsavedChangesClose } from '../../src/main/utils/close-confirm'

describe('confirmUnsavedChangesClose', () => {
    beforeEach(() => {
        dialogMocks.showMessageBox.mockReset()
    })

    it('maps response 0 to save (with buttons/defaultId/cancelId contract)', async () => {
        dialogMocks.showMessageBox.mockResolvedValue({ response: 0 })
        const parent = { isDestroyed: () => false } as never
        await expect(confirmUnsavedChangesClose(parent)).resolves.toBe('save')
        expect(dialogMocks.showMessageBox).toHaveBeenCalledTimes(1)
        const [win, options] = dialogMocks.showMessageBox.mock.calls[0]
        expect(win).toBe(parent)
        expect(options).toMatchObject({
            type: 'warning',
            defaultId: 0,
            cancelId: 2,
            noLink: true,
            buttons: ['保存并关闭', '不保存', '取消']
        })
        expect(typeof options.message).toBe('string')
        expect(options.message.length).toBeGreaterThan(0)
    })

    it('maps response 1 to discard', async () => {
        dialogMocks.showMessageBox.mockResolvedValue({ response: 1 })
        await expect(confirmUnsavedChangesClose(null)).resolves.toBe('discard')
        // 无父窗口时使用单参重载
        expect(dialogMocks.showMessageBox).toHaveBeenCalledTimes(1)
        expect(dialogMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    it('maps unknown/cancel responses (including Esc) to cancel', async () => {
        dialogMocks.showMessageBox.mockResolvedValue({ response: 2 })
        await expect(
            confirmUnsavedChangesClose({ isDestroyed: () => false } as never)
        ).resolves.toBe('cancel')
        dialogMocks.showMessageBox.mockResolvedValue({ response: -1 })
        await expect(confirmUnsavedChangesClose(null)).resolves.toBe('cancel')
    })

    it('falls back to parentless dialog when the window is destroyed', async () => {
        dialogMocks.showMessageBox.mockResolvedValue({ response: 1 })
        await confirmUnsavedChangesClose({ isDestroyed: () => true } as never)
        expect(dialogMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    // P3 F-09：minimizeToTray 开启时关闭动作实际是隐藏到托盘，文案必须如实
    it('uses tray wording when the close action actually hides to tray (P3 F-09)', async () => {
        dialogMocks.showMessageBox.mockResolvedValue({ response: 0 })
        await expect(
            confirmUnsavedChangesClose({ isDestroyed: () => false } as never, {
                minimizeToTray: true
            })
        ).resolves.toBe('save')

        const options = dialogMocks.showMessageBox.mock.calls[0][1] as {
            message: string
            detail: string
            buttons: string[]
        }
        expect(options.buttons).toEqual(['保存并隐藏', '不保存', '取消'])
        expect(options.message).toContain('隐藏到系统托盘')
        expect(options.detail).toContain('隐藏到系统托盘')
        expect(options.message).not.toContain('保存后关闭')
    })

    it('keeps the "close" wording for quit (minimizeToTray not applicable)', async () => {
        dialogMocks.showMessageBox.mockResolvedValue({ response: 2 })
        await expect(confirmUnsavedChangesClose(null, { minimizeToTray: false })).resolves.toBe(
            'cancel'
        )
        const options = dialogMocks.showMessageBox.mock.calls[0][0] as {
            message: string
            buttons: string[]
        }
        expect(options.buttons).toEqual(['保存并关闭', '不保存', '取消'])
        expect(options.message).toContain('保存后关闭')
    })
})
