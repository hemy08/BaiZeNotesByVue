// @vitest-environment jsdom
/**
 * 剪贴板统一封装（src/renderer/src/common/clipboard.ts）单测（P3 修复）。
 * 覆盖：成功写入、权限拒绝提示、API 缺失提示、空文本短路。
 *
 * alert 应用内化批次：失败提示改走 `common/app-message`（MessageDialog），
 * 本文件 mock 该 helper 断言「提示一次且文案含剪贴板关键词」；helper 内部
 * showDialog 的类型/标题映射由 tests/unit/app-message.test.ts 覆盖。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

const appMessageMocks = vi.hoisted(() => ({
    showAppError: vi.fn(),
    showAppWarning: vi.fn()
}))

vi.mock('@renderer/common/app-message', () => appMessageMocks)

import { copyTextToClipboard } from '@renderer/common/clipboard'

function installClipboardMock(
    behavior: 'resolve' | 'reject' | 'missing'
): ReturnType<typeof vi.fn> {
    const writeText = vi.fn()
    if (behavior === 'resolve') {
        writeText.mockResolvedValue(undefined)
    } else if (behavior === 'reject') {
        writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    }
    if (behavior === 'missing') {
        Object.defineProperty(window.navigator, 'clipboard', {
            value: undefined,
            configurable: true
        })
    } else {
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText },
            configurable: true
        })
    }
    return writeText
}

describe('copyTextToClipboard（剪贴板统一封装）', () => {
    beforeEach(() => {
        appMessageMocks.showAppError.mockClear()
        appMessageMocks.showAppWarning.mockClear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('成功写入返回 true，且不弹提示', async () => {
        const writeText = installClipboardMock('resolve')
        const ok = await copyTextToClipboard('hello')
        expect(ok).toBe(true)
        expect(writeText).toHaveBeenCalledWith('hello')
        expect(appMessageMocks.showAppError).not.toHaveBeenCalled()
        expect(appMessageMocks.showAppWarning).not.toHaveBeenCalled()
    })

    it('写入被拒绝（权限问题）返回 false 并弹出应用内错误提示', async () => {
        installClipboardMock('reject')
        const ok = await copyTextToClipboard('hello')
        expect(ok).toBe(false)
        expect(appMessageMocks.showAppError).toHaveBeenCalledTimes(1)
        // 默认语言 zh-CN 的通用词条（含「剪贴板」关键词）
        expect(String(appMessageMocks.showAppError.mock.calls[0]?.[0])).toContain('剪贴板')
    })

    it('navigator.clipboard 缺失时返回 false 并提示', async () => {
        installClipboardMock('missing')
        const ok = await copyTextToClipboard('hello')
        expect(ok).toBe(false)
        expect(appMessageMocks.showAppError).toHaveBeenCalledTimes(1)
    })

    it('空文本短路：不调用 writeText、不弹提示', async () => {
        const writeText = installClipboardMock('resolve')
        const ok = await copyTextToClipboard('')
        expect(ok).toBe(false)
        expect(writeText).not.toHaveBeenCalled()
        expect(appMessageMocks.showAppError).not.toHaveBeenCalled()
    })
})
