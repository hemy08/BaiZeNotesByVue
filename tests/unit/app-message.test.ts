/**
 * 渲染层应用内消息 helper（common/app-message.ts）单测。
 *
 * 覆盖：五种消息类型 → showDialog(type) 映射、缺省标题（common.* 词条）、自定义标题、
 * 语言切换后标题即时跟随、以及 throttleKey 节流窗口行为。
 * 说明：helper 只依赖 getConfigStore 单例（纯模块可调用），本文件 mock 掉 store。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { showDialogMock } = vi.hoisted(() => ({ showDialogMock: vi.fn() }))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({ showDialog: showDialogMock })
}))

import {
    resetAppMessageThrottleForTesting,
    showAppError,
    showAppFailed,
    showAppInfo,
    showAppMessage,
    showAppSuccess,
    showAppWarning
} from '@renderer/common/app-message'
import { setLocale } from '@renderer/common/i18n'

/** 读取最近一次 showDialog 调用的 [type, data] */
function lastDialog(): [string, { title: string; message: string }] {
    const calls = showDialogMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    return calls[calls.length - 1] as [string, { title: string; message: string }]
}

beforeEach(() => {
    showDialogMock.mockClear()
    resetAppMessageThrottleForTesting()
    setLocale('zh-CN')
})

afterEach(() => {
    setLocale('zh-CN')
    resetAppMessageThrottleForTesting()
})

describe('showAppMessage：类型 → MessageDialog 映射', () => {
    const CASES: Array<{
        type: 'success' | 'error' | 'warning' | 'info' | 'failed'
        call: (message: string) => void
        zhTitle: string
    }> = [
        { type: 'success', call: showAppSuccess, zhTitle: '成功' },
        { type: 'error', call: showAppError, zhTitle: '错误' },
        { type: 'warning', call: showAppWarning, zhTitle: '警告' },
        { type: 'info', call: showAppInfo, zhTitle: '提示' },
        { type: 'failed', call: showAppFailed, zhTitle: '失败' }
    ]

    it.each(CASES)('$type：映射到同名类型并回退 common.* 标题', ({ type, call, zhTitle }) => {
        call('测试消息')
        expect(showDialogMock).toHaveBeenCalledTimes(1)
        expect(showDialogMock).toHaveBeenCalledWith(type, {
            title: zhTitle,
            message: '测试消息'
        })
    })

    it('showAppMessage 可显式指定类型与消息正文', () => {
        showAppMessage('warning', '自定义正文')
        expect(lastDialog()).toEqual(['warning', { title: '警告', message: '自定义正文' }])
    })

    it('自定义标题优先于类型缺省标题', () => {
        showAppWarning('正文', { title: '自定义标题' })
        expect(lastDialog()).toEqual(['warning', { title: '自定义标题', message: '正文' }])
    })

    it('空标题字符串回退到类型缺省标题', () => {
        showAppError('正文', { title: '' })
        expect(lastDialog()[1].title).toBe('错误')
    })

    it('语言切换后新消息标题跟随当前语言（不缓存翻译结果）', () => {
        setLocale('en-US')
        showAppError('boom')
        expect(lastDialog()).toEqual(['error', { title: 'Error', message: 'boom' }])
    })
})

describe('showAppMessage：节流防刷屏', () => {
    it('同类型同节流键在窗口内只展示首次', () => {
        showAppError('第一次失败', { throttleKey: 'hash-failed' })
        showAppError('第二次失败', { throttleKey: 'hash-failed' })
        expect(showDialogMock).toHaveBeenCalledTimes(1)
        expect(lastDialog()[1].message).toBe('第一次失败')
    })

    it('不同节流键互不影响', () => {
        showAppError('失败 A', { throttleKey: 'key-a' })
        showAppError('失败 B', { throttleKey: 'key-b' })
        expect(showDialogMock).toHaveBeenCalledTimes(2)
    })

    it('不同类型相同键互不影响（节流键按类型隔离）', () => {
        showAppError('错误', { throttleKey: 'shared-key' })
        showAppWarning('警告', { throttleKey: 'shared-key' })
        expect(showDialogMock).toHaveBeenCalledTimes(2)
    })

    it('窗口过期后允许再次展示（可用 throttleMs 覆盖默认窗口）', () => {
        vi.useFakeTimers()
        try {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
            showAppError('失败 1', { throttleKey: 'slow-op', throttleMs: 1000 })
            showAppError('失败 2', { throttleKey: 'slow-op', throttleMs: 1000 })
            expect(showDialogMock).toHaveBeenCalledTimes(1)

            vi.setSystemTime(new Date('2026-01-01T00:00:02Z'))
            showAppError('失败 3', { throttleKey: 'slow-op', throttleMs: 1000 })
            expect(showDialogMock).toHaveBeenCalledTimes(2)
            expect(lastDialog()[1].message).toBe('失败 3')
        } finally {
            vi.useRealTimers()
        }
    })

    it('resetAppMessageThrottleForTesting 清空节流记录', () => {
        showAppError('失败 1', { throttleKey: 'reset-me' })
        resetAppMessageThrottleForTesting()
        showAppError('失败 2', { throttleKey: 'reset-me' })
        expect(showDialogMock).toHaveBeenCalledTimes(2)
    })

    it('默认节流窗口内不重复展示（未显式传 throttleMs）', () => {
        showAppError('失败 1', { throttleKey: 'default-window' })
        showAppError('失败 2', { throttleKey: 'default-window' })
        expect(showDialogMock).toHaveBeenCalledTimes(1)
    })
})
