/**
 * close-confirm.test.ts
 *
 * 2026-11-20 用户需求：关闭/退出时未保存修改确认对话框。
 * 验证按钮顺序（保存并关闭 / 不保存 / 取消）与返回值映射，以及窗口销毁时
 * 退化为无父窗口对话框。
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
})
