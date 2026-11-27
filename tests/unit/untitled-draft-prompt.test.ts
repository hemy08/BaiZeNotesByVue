// @vitest-environment jsdom
/**
 * 未命名草稿确认框宿主：验证动态挂载/卸载与三选一结果。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { showUntitledDraftPrompt } from '@renderer/components/Markdown/untitled-draft-prompt'

async function waitForDialog(): Promise<void> {
    await nextTick()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

describe('showUntitledDraftPrompt', () => {
    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('点击「不保存」返回 discard 并移除宿主', async () => {
        const promise = showUntitledDraftPrompt()
        await waitForDialog()

        const discard = document.querySelector<HTMLButtonElement>(
            '.untitled-draft-dialog .btn-discard'
        )
        expect(discard).not.toBeNull()
        discard!.click()

        await expect(promise).resolves.toBe('discard')
        expect(document.getElementById('baize-untitled-draft-host')).toBeNull()
    })

    it('点击「取消」返回 cancel', async () => {
        const promise = showUntitledDraftPrompt()
        await waitForDialog()

        document.querySelector<HTMLButtonElement>('.untitled-draft-dialog .btn-cancel')!.click()
        await expect(promise).resolves.toBe('cancel')
    })

    it('点击右上角关闭按钮返回 cancel', async () => {
        const promise = showUntitledDraftPrompt()
        await waitForDialog()

        document.querySelector<HTMLButtonElement>('.untitled-draft-dialog .close-btn')!.click()
        await expect(promise).resolves.toBe('cancel')
    })
})
