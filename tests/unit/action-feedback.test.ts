/**
 * P2 功能错误处理修复：渲染层用户操作失败统一反馈 helper 单测
 *
 * 覆盖：
 * 1. describeActionError：Error / 字符串 / Electron invoke 包装前缀 / null / 对象 的归一化；
 * 2. reportActionFailure：error 日志 + 全局消息对话框（标题/正文原样展示）；
 * 3. 带 retry 时挂载可重试动作，经 runMessageDialogRetry 关闭消息框并再次执行原操作。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    describeActionError,
    reportActionFailure,
    resetActionFailureThrottleForTesting
} from '../../src/renderer/src/common/action-feedback'
import { getConfigStore } from '../../src/renderer/src/common/useConfigStore'

const store = getConfigStore()

describe('describeActionError（错误详情归一化）', () => {
    it('提取 Error.message / 字符串原文', () => {
        expect(describeActionError(new Error('磁盘只读'), '未知')).toBe('磁盘只读')
        expect(describeActionError('文件不存在', '未知')).toBe('文件不存在')
    })

    it('去掉 Electron invoke 的通道包装前缀，只保留原始错误信息', () => {
        const wrapped = new Error(
            "Error invoking remote method 'baize:file:convert-save-encoding': Error: 文件保存失败：权限不足"
        )
        expect(describeActionError(wrapped, '未知')).toBe('文件保存失败：权限不足')
    })

    it('空值 / 无意义对象回退到调用方兜底文案', () => {
        expect(describeActionError(null, '未知错误')).toBe('未知错误')
        expect(describeActionError(undefined, '未知错误')).toBe('未知错误')
        expect(describeActionError(new Error(''), '未知错误')).toBe('未知错误')
        expect(describeActionError({}, '未知错误')).toBe('未知错误')
    })
})

describe('reportActionFailure（用户操作失败统一反馈）', () => {
    beforeEach(() => {
        store.hideDialog('message')
        store.clearMessageDialogRetry()
    })

    afterEach(() => {
        store.hideDialog('message')
        store.clearMessageDialogRetry()
        vi.restoreAllMocks()
    })

    it('记 error 日志并经全局消息对话框展示已本地化文案', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        reportActionFailure({ title: '编码转换失败', message: '无法转换：权限不足' })

        expect(errorSpy).toHaveBeenCalledWith('[ActionFeedback] 编码转换失败: 无法转换：权限不足')
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe('编码转换失败')
        expect(store.dialogs.messageDialog.message).toBe('无法转换：权限不足')
        // 普通失败不显示「重试」按钮
        expect(store.messageDialogRetry.value).toBeNull()
    })

    it('带 retry 时挂载重试动作：重试关闭消息框并再次执行原操作', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const retry = vi.fn().mockResolvedValue(undefined)

        reportActionFailure({ title: '编码转换失败', message: '可重试', retry })

        expect(store.messageDialogRetry.value).not.toBeNull()
        store.runMessageDialogRetry()
        await Promise.resolve()

        expect(retry).toHaveBeenCalledTimes(1)
        expect(store.dialogs.messageDialog.visible).toBe(false)
        expect(store.messageDialogRetry.value).toBeNull()
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })
})

describe('reportActionFailure 节流（P2 防刷屏）', () => {
    beforeEach(() => {
        resetActionFailureThrottleForTesting()
        store.hideDialog('message')
        store.clearMessageDialogRetry()
    })

    afterEach(() => {
        resetActionFailureThrottleForTesting()
        store.hideDialog('message')
        store.clearMessageDialogRetry()
        vi.restoreAllMocks()
    })

    it('同一 throttleKey 在窗口期内重复失败只弹一次，后续只记 throttled 日志', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const options = {
            title: '自动保存开关同步失败',
            message: '主进程不可用',
            throttleKey: 'system-setting:auto-save-sync:true',
            throttleMs: 60_000
        }

        reportActionFailure(options)
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(errorSpy).toHaveBeenCalledWith('[ActionFeedback] 自动保存开关同步失败: 主进程不可用')

        // 模拟用户关闭弹框后 10s 内再次触发同一失败：只记日志，不再弹框
        store.hideDialog('message')
        reportActionFailure(options)
        expect(store.dialogs.messageDialog.visible).toBe(false)
        expect(errorSpy).toHaveBeenCalledWith(
            '[ActionFeedback][throttled] 自动保存开关同步失败: 主进程不可用'
        )
        expect(errorSpy).toHaveBeenCalledTimes(2)
    })

    it('不同 throttleKey / 不传 throttleKey 不受影响；显式重试（不传键）始终可见', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        reportActionFailure({
            title: '自动保存开关同步失败',
            message: '主进程不可用',
            throttleKey: 'system-setting:auto-save-sync:true'
        })
        store.hideDialog('message')

        // 不同目标状态（键不同）→ 正常提示
        reportActionFailure({
            title: '自动保存开关同步失败',
            message: '主进程不可用',
            throttleKey: 'system-setting:auto-save-sync:false'
        })
        expect(store.dialogs.messageDialog.visible).toBe(true)

        // 不传 throttleKey（用户显式重试路径）→ 正常提示，不节流
        store.hideDialog('message')
        reportActionFailure({ title: '自动保存开关同步失败', message: '主进程不可用' })
        expect(store.dialogs.messageDialog.visible).toBe(true)

        // 未进入节流分支：日志前缀无 [throttled]
        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('[ActionFeedback][throttled]')
        )
    })

    it('resetActionFailureThrottleForTesting 清空记录后可再次提示', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const options = {
            title: '自动保存开关同步失败',
            message: '主进程不可用',
            throttleKey: 'reset-test'
        }

        reportActionFailure(options)
        store.hideDialog('message')
        reportActionFailure(options)
        expect(store.dialogs.messageDialog.visible).toBe(false)

        resetActionFailureThrottleForTesting()
        reportActionFailure(options)
        expect(store.dialogs.messageDialog.visible).toBe(true)
    })
})
