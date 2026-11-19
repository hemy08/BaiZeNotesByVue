/**
 * 主进程状态栏提示 / 用户错误文案统一 helper 测试（结构优化第 4 批 4.4 / M2 剩余）
 *
 * 覆盖：
 * 1. toUserError：Error / string / number / boolean / null / undefined / 普通对象 /
 *    自定义 toString / toString 抛错 → 归一化文案与 fallback；
 * 2. notifyStatus：正常发送、窗口销毁、webContents 销毁/缺失、send 抛错（不得向调用方抛）；
 * 3. notifyIpcAsyncError（收敛后唯一的异步 IPC 异常兜底）：日志 + 状态栏文案/类型。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const loggerMocks = vi.hoisted(() => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}))
vi.mock('../../src/main/utils/logger', () => loggerMocks)

import { isNotifyTargetAlive, notifyStatus, toUserError } from '../../src/main/utils/status-notify'
import { notifyIpcAsyncError } from '../../src/main/utils/error-report'
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import type { StatusBarUpdatePayload } from '../../src/shared/types'

/** 状态栏通道字面量（与 IPC.EVENTS.STATUS_BAR_UPDATE 同值，测试显式断言） */
const STATUS_BAR_CHANNEL = 'baize:status-bar:update'

/** 固定中文词典，隔离 electron-store/config 读取链 */
setSystemSettingProvider(() => ({ language: 'zh-CN' }) as never)

/** 最小可发送窗口桩 */
function makeWindow(sendImpl?: (channel: string, payload: unknown) => void) {
    const send = vi.fn(sendImpl)
    return { send, webContents: { send }, isDestroyed: vi.fn(() => false) }
}

beforeEach(() => {
    for (const fn of Object.values(loggerMocks.logger)) {
        fn.mockClear()
    }
})

describe('toUserError 归一化（Error/string/unknown）', () => {
    it('Error → message；空 message 使用 fallback', () => {
        expect(toUserError(new Error('disk full'))).toBe('disk full')
        expect(toUserError(new TypeError('bad type'))).toBe('bad type')
        expect(toUserError(new Error(''), '未知错误')).toBe('未知错误')
    })

    it('string 原样返回；空串使用 fallback', () => {
        expect(toUserError('string boom')).toBe('string boom')
        expect(toUserError('', 'fallback')).toBe('fallback')
    })

    it('number / boolean / Symbol 走 String 归一化', () => {
        expect(toUserError(42)).toBe('42')
        expect(toUserError(false)).toBe('false')
        expect(toUserError(0)).toBe('0')
        expect(toUserError(Symbol('sym'))).toBe('Symbol(sym)')
    })

    it('null / undefined / 普通对象 / 无意义字符串使用 fallback', () => {
        expect(toUserError(null, 'fallback')).toBe('fallback')
        expect(toUserError(undefined, 'fallback')).toBe('fallback')
        expect(toUserError({ code: 'EACCES' }, 'fallback')).toBe('fallback')
        expect(toUserError(new Error(''), '')).toBe('')
    })

    it('自定义 toString 使用其返回值；toString 抛错时回退 fallback（不抛）', () => {
        expect(toUserError({ toString: () => 'custom message' })).toBe('custom message')
        const exploding = {
            toString: () => {
                throw new Error('toString exploded')
            }
        }
        expect(() => toUserError(exploding, 'fallback')).not.toThrow()
        expect(toUserError(exploding, 'fallback')).toBe('fallback')
    })
})

describe('notifyStatus 状态栏发送', () => {
    const payload: StatusBarUpdatePayload = { message: '保存失败：磁盘已满', type: 'error' }

    it('窗口可用时向 STATUS_BAR_UPDATE 发送负载并返回 true', () => {
        const win = makeWindow()
        expect(notifyStatus(payload, win)).toBe(true)
        expect(win.webContents.send).toHaveBeenCalledTimes(1)
        expect(win.webContents.send).toHaveBeenCalledWith(STATUS_BAR_CHANNEL, payload)
    })

    it('窗口已销毁 / webContents 已销毁 / webContents 缺失时静默返回 false', () => {
        const destroyedWin = { webContents: { send: vi.fn() }, isDestroyed: () => true }
        expect(notifyStatus(payload, destroyedWin)).toBe(false)
        expect(destroyedWin.webContents.send).not.toHaveBeenCalled()

        const destroyedContents = {
            webContents: { send: vi.fn(), isDestroyed: () => true },
            isDestroyed: () => false
        }
        expect(notifyStatus(payload, destroyedContents)).toBe(false)
        expect(destroyedContents.webContents.send).not.toHaveBeenCalled()

        expect(notifyStatus(payload, {})).toBe(false)
        expect(notifyStatus(payload, { webContents: {} } as never)).toBe(false)
        expect(notifyStatus(payload, null)).toBe(false)
        expect(notifyStatus(payload, undefined)).toBe(false)
    })

    it('发送抛错（销毁竞态）时不向调用方抛出，记日志并返回 false', () => {
        const win = makeWindow(() => {
            throw new Error('ipc channel dead')
        })
        expect(() => notifyStatus(payload, win)).not.toThrow()
        expect(notifyStatus(payload, win)).toBe(false)
        expect(loggerMocks.logger.error).toHaveBeenCalledWith(
            '[StatusBar] 状态栏消息发送失败:',
            expect.any(Error)
        )
    })

    it('isNotifyTargetAlive 与发送语义一致（测试桩缺少 isDestroyed 时按可用处理）', () => {
        expect(isNotifyTargetAlive({ webContents: { send: vi.fn() } })).toBe(true)
        expect(
            isNotifyTargetAlive({ webContents: { send: vi.fn() }, isDestroyed: () => true })
        ).toBe(false)
        expect(isNotifyTargetAlive({ webContents: {} } as never)).toBe(false)
        expect(isNotifyTargetAlive(null)).toBe(false)
    })
})

describe('notifyIpcAsyncError 异步 IPC 异常兜底（CQ-05 收敛）', () => {
    it('记录带通道名的错误日志并发送 error 状态栏消息', () => {
        const win = makeWindow()
        notifyIpcAsyncError(win, 'baize:test:channel', new Error('disk full'))

        expect(loggerMocks.logger.error).toHaveBeenCalledWith(
            '[IPC] 通道 "baize:test:channel" 异步处理失败:',
            expect.any(Error)
        )
        expect(win.webContents.send).toHaveBeenCalledWith(STATUS_BAR_CHANNEL, {
            message: '操作失败：disk full',
            type: 'error'
        })
    })

    it('非 Error 异常（字符串）同样归一化后上报', () => {
        const win = makeWindow()
        notifyIpcAsyncError(win, 'baize:test:channel', 'string boom')
        expect(win.webContents.send).toHaveBeenCalledWith(STATUS_BAR_CHANNEL, {
            message: '操作失败：string boom',
            type: 'error'
        })
    })

    it('空 message 的 Error 使用 i18n 兜底文案', () => {
        const win = makeWindow()
        notifyIpcAsyncError(win, 'baize:test:channel', new Error(''))
        expect(win.webContents.send).toHaveBeenCalledWith(STATUS_BAR_CHANNEL, {
            message: '操作失败：未知',
            type: 'error'
        })
    })

    it('窗口已销毁时只记日志、不发送（不抛错）', () => {
        const win = { webContents: { send: vi.fn() }, isDestroyed: () => true }
        expect(() =>
            notifyIpcAsyncError(win, 'baize:test:channel', new Error('boom'))
        ).not.toThrow()
        expect(loggerMocks.logger.error).toHaveBeenCalled()
        expect(win.webContents.send).not.toHaveBeenCalled()
    })
})
