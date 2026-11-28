/**
 * 1.5.7 体验优化（减少弹窗）：轻量 Toast 模块单测（`common/toast.ts`）。
 *
 * 覆盖点：
 * 1. 展示：默认类型/时长/自动 id、显式配置、空白消息忽略、非法时长兜底、常驻时长；
 * 2. 自动消失：到时移除、常驻不自动移除、关闭后定时器回收（推进时间不再误删）；
 * 3. 上限：同屏最多 MAX_TOAST_COUNT 条，超出移除最旧；
 * 4. 同 id 覆盖：原地更新（不叠加）并重置自动消失计时，旧标题可清空；
 * 5. 关闭/复位：dismissToast 返回值、dismissAllToasts 全量回收、测试复位自增 id。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    DEFAULT_TOAST_DURATION,
    MAX_TOAST_COUNT,
    dismissAllToasts,
    dismissToast,
    resetToastsForTesting,
    showToast,
    toastState
} from '../../src/renderer/src/common/toast'

beforeEach(() => {
    vi.useFakeTimers()
    resetToastsForTesting()
})

afterEach(() => {
    resetToastsForTesting()
    vi.useRealTimers()
})

describe('showToast：展示与配置', () => {
    it('默认 info 类型 / 默认时长 / 自动 id，追加到队列末尾', () => {
        const id = showToast('操作完成')

        expect(id).toBe('toast-1')
        expect(toastState.toasts).toHaveLength(1)
        expect(toastState.toasts[0]).toMatchObject({
            id,
            type: 'info',
            message: '操作完成',
            duration: DEFAULT_TOAST_DURATION
        })
        expect(toastState.toasts[0]!.title).toBeUndefined()
    })

    it('显式 type / title / duration / id 生效（正文与标题去首尾空白）', () => {
        const id = showToast('  已切换  ', {
            type: 'success',
            title: '  切换成功  ',
            duration: 1000,
            id: 'switch-ok'
        })

        expect(id).toBe('switch-ok')
        expect(toastState.toasts).toHaveLength(1)
        expect(toastState.toasts[0]).toMatchObject({
            id: 'switch-ok',
            type: 'success',
            title: '切换成功',
            message: '已切换',
            duration: 1000
        })
    })

    it('空消息 / 纯空白消息 / 非字符串消息直接忽略（返回空串，不产生空提示）', () => {
        expect(showToast('')).toBe('')
        expect(showToast('   \n\t ')).toBe('')
        // 运行时防御分支：调用方绕过类型（旧代码/动态载荷）传入非字符串时按空消息忽略
        expect(showToast(undefined as unknown as string)).toBe('')
        expect(toastState.toasts).toHaveLength(0)
    })

    it('标题 / id 为空串或纯空白时等价于缺省（自动 id、不渲染标题）', () => {
        const id = showToast('正文', { title: '   ', id: '  ' })

        expect(id).toBe('toast-1')
        expect(toastState.toasts[0]!.title).toBeUndefined()
    })

    it('非法时长（NaN）回退默认值；负数收敛为 0（常驻）', () => {
        showToast('非法时长', { duration: Number.NaN })
        expect(toastState.toasts[0]!.duration).toBe(DEFAULT_TOAST_DURATION)

        resetToastsForTesting()
        showToast('常驻', { duration: -100 })
        expect(toastState.toasts[0]!.duration).toBe(0)
    })
})

describe('showToast：自动消失', () => {
    it('到时自动移除（到点前仍展示）', () => {
        showToast('短暂提示', { duration: 1000 })

        vi.advanceTimersByTime(999)
        expect(toastState.toasts).toHaveLength(1)

        vi.advanceTimersByTime(1)
        expect(toastState.toasts).toHaveLength(0)
    })

    it('duration <= 0 常驻：长时间推进也不自动移除，可手动关闭', () => {
        showToast('常驻提示', { duration: 0 })

        vi.advanceTimersByTime(60_000)
        expect(toastState.toasts).toHaveLength(1)

        expect(dismissToast('toast-1')).toBe(true)
        expect(toastState.toasts).toHaveLength(0)
    })

    it('手动关闭后定时器已回收：推进到原到期时间不会影响其它提示', () => {
        showToast('第一条', { duration: 1000 })
        showToast('第二条', { duration: 5000 })
        dismissToast('toast-1')

        vi.advanceTimersByTime(1000)
        expect(toastState.toasts.map((toast) => toast.id)).toEqual(['toast-2'])
    })
})

describe('showToast：同屏上限与同 id 覆盖', () => {
    it(`最多同时展示 ${MAX_TOAST_COUNT} 条，超出移除最旧`, () => {
        const ids = ['a', 'b', 'c', 'd'].map((message) => showToast(message))

        expect(ids).toHaveLength(4)
        expect(toastState.toasts).toHaveLength(MAX_TOAST_COUNT)
        expect(toastState.toasts.map((toast) => toast.message)).toEqual(['b', 'c', 'd'])
        expect(toastState.toasts.map((toast) => toast.id)).toEqual([ids[1], ids[2], ids[3]])
        // 被移除的最旧一条定时器已回收：推进全部时长不报错且队列仍为空
        vi.advanceTimersByTime(10_000)
        expect(toastState.toasts).toHaveLength(0)
    })

    it('同 id 原地更新（不新增条目）并重置自动消失计时', () => {
        showToast('旧正文', { id: 'stable', title: '旧标题', duration: 1000 })

        vi.advanceTimersByTime(800)
        showToast('新正文', { id: 'stable', type: 'success', title: '新标题', duration: 1000 })

        expect(toastState.toasts).toHaveLength(1)
        expect(toastState.toasts[0]).toMatchObject({
            id: 'stable',
            type: 'success',
            title: '新标题',
            message: '新正文'
        })

        // 计时已重置：原到期点 1000ms 时仍展示（已推进 800，再推进 300 = 1100 > 原到期点）
        vi.advanceTimersByTime(300)
        expect(toastState.toasts).toHaveLength(1)

        // 新计时到期（显示后 1000ms）才移除
        vi.advanceTimersByTime(700)
        expect(toastState.toasts).toHaveLength(0)
    })

    it('同 id 再次展示未带标题时清空旧标题', () => {
        showToast('有标题', { id: 'stable', title: '标题' })
        showToast('无标题', { id: 'stable' })

        expect(toastState.toasts).toHaveLength(1)
        expect(toastState.toasts[0]!.title).toBeUndefined()
    })
})

describe('dismissToast / dismissAllToasts / resetToastsForTesting', () => {
    it('dismissToast：已存在返回 true 并移除；未知 id 返回 false 且不改变队列', () => {
        showToast('提示一')
        showToast('提示二')

        expect(dismissToast('toast-1')).toBe(true)
        expect(toastState.toasts.map((toast) => toast.id)).toEqual(['toast-2'])

        expect(dismissToast('unknown')).toBe(false)
        expect(toastState.toasts).toHaveLength(1)
    })

    it('dismissAllToasts：清空队列并回收全部定时器（推进时间不产生副作用）', () => {
        showToast('一', { duration: 1000 })
        showToast('二', { duration: 2000 })
        showToast('三', { duration: 0 })

        dismissAllToasts()
        expect(toastState.toasts).toHaveLength(0)

        vi.advanceTimersByTime(10_000)
        expect(toastState.toasts).toHaveLength(0)
    })

    it('resetToastsForTesting：清空状态并复位自动 id 序号', () => {
        showToast('一')
        showToast('二')

        resetToastsForTesting()
        expect(toastState.toasts).toHaveLength(0)
        expect(showToast('复位后')).toBe('toast-1')
    })
})
