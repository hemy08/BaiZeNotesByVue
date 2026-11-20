/**
 * 覆盖率补测第五批：ipc-security.ts 边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - isWindowDestroyed：isDestroyed 自身抛错按已销毁处理；
 * - getWebContentsId / isSameWebContents：非对象 contents、id 兜底比较；
 * - registerTrustedDialogWindow：读取 webContents 抛错、无 once 时退回 on、on 注册抛错；
 * - unregisterTrustedDialogWindow：null 窗口 / webContents 缺失 / 读取抛错；
 * - isTrustedSender：窗口 webContents 读取抛错、webContents 缺失；
 * - isTrustedDialogSender：sender 缺失；
 * - describeSender：senderFrame URL 优先、getURL 回空后回退 id、全失败回退 unknown；
 * - isUntrustedSenderResult：非对象值；
 * - withSenderCheck：on 通道返回 undefined / handle 通道返回拒绝对象 / 受信时透传参数与返回值。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ipc-security / app-context 仅 type import electron，这里仍给出最小桩避免意外运行时依赖
vi.mock('electron', () => ({ BrowserWindow: class {} }))

import {
    assertTrustedSender,
    getTrustedMainWindow,
    isTrustedDialogSender,
    isTrustedIpcSender,
    isTrustedSender,
    isUntrustedSenderResult,
    registerTrustedDialogWindow,
    resetTrustedSenderRegistry,
    setTrustedMainWindow,
    UNTRUSTED_SENDER_RESULT,
    unregisterTrustedDialogWindow,
    withSenderCheck
} from '../../../src/main/utils/ipc-security'

const mainContents = { id: 1, send: vi.fn(), isDestroyed: () => false }
const aliveMainWindow = { webContents: mainContents, isDestroyed: () => false }

beforeEach(() => {
    resetTrustedSenderRegistry()
    setTrustedMainWindow(aliveMainWindow as never)
})

describe('isWindowDestroyed 边界', () => {
    it('isDestroyed 自身抛错时按已销毁处理（不受信）', () => {
        const throwingWindow = {
            webContents: mainContents,
            isDestroyed: () => {
                throw new Error('Object has been destroyed')
            }
        }
        expect(isTrustedSender({ sender: mainContents }, throwingWindow as never)).toBe(false)
    })

    it('窗口无 isDestroyed 方法时按存活处理（测试桩兼容）', () => {
        const stubWindow = { webContents: mainContents }
        expect(isTrustedSender({ sender: mainContents }, stubWindow as never)).toBe(true)
    })

    it('显式传入 null 主窗口时判定为不受信', () => {
        expect(isTrustedSender({ sender: mainContents }, null)).toBe(false)
    })
})

describe('webContents id 兜底比较', () => {
    it('不同对象但 id 相同视为同一发送方', () => {
        const senderById = { id: 1 }
        expect(isTrustedSender({ sender: senderById })).toBe(true)
    })

    it('sender 与主窗口 webContents 不是对象时经对象引用优先路径返回 false', () => {
        const window = { webContents: 'main-contents-string', isDestroyed: () => false }
        expect(isTrustedSender({ sender: 'other-contents-string' }, window as never)).toBe(false)
    })

    it('主窗口 webContents 读取抛错时按不受信处理', () => {
        const throwingWindow = {
            get webContents(): never {
                throw new Error('Object has been destroyed')
            },
            isDestroyed: () => false
        }
        expect(isTrustedSender({ sender: mainContents }, throwingWindow as never)).toBe(false)
    })

    it('主窗口 webContents 缺失时按不受信处理', () => {
        const emptyWindow = { webContents: null, isDestroyed: () => false }
        expect(isTrustedSender({ sender: mainContents }, emptyWindow as never)).toBe(false)
    })
})

describe('对话框窗口受信登记', () => {
    it('登记后按对象引用受信，注销后不再受信', () => {
        const contents = { id: 20, close: vi.fn() }
        const dialogWindow = { webContents: contents, once: vi.fn() }
        registerTrustedDialogWindow(dialogWindow as never)
        expect(isTrustedDialogSender({ sender: contents })).toBe(true)

        unregisterTrustedDialogWindow(dialogWindow as never)
        expect(isTrustedDialogSender({ sender: contents })).toBe(false)
    })

    it('webContents 非对象时仅按对象引用登记（id 兜底分支），closed 后自动注销', () => {
        const contents = 'plain-contents-token'
        const listeners: Array<() => void> = []
        const dialogWindow = {
            webContents: contents,
            once: vi.fn((_event: string, listener: () => void) => {
                listeners.push(listener)
            })
        }
        registerTrustedDialogWindow(dialogWindow as never)
        expect(isTrustedDialogSender({ sender: contents })).toBe(true)
        // closed 事件触发注册时捕获的清理函数
        listeners.forEach((listener) => listener())
        expect(isTrustedDialogSender({ sender: contents })).toBe(false)
    })

    it('窗口只提供 on 时用 on 注册 closed 清理', () => {
        const contents = { id: 21 }
        const listeners: Array<() => void> = []
        const dialogWindow = {
            webContents: contents,
            on: vi.fn((_event: string, listener: () => void) => {
                listeners.push(listener)
            })
        }
        registerTrustedDialogWindow(dialogWindow as never)
        expect(isTrustedDialogSender({ sender: contents })).toBe(true)
        listeners.forEach((listener) => listener())
        expect(isTrustedDialogSender({ sender: contents })).toBe(false)
    })

    it('读取 webContents 抛错时告警并跳过登记', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const destroyedWindow = {
            get webContents(): never {
                throw new Error('Object has been destroyed')
            }
        }
        registerTrustedDialogWindow(destroyedWindow as never)
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('登记对话框窗口时读取 webContents 失败'),
            expect.any(Error)
        )
    })

    it('closed 监听注册抛错时告警但不影响登记', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const contents = { id: 22 }
        const dialogWindow = {
            webContents: contents,
            once: () => {
                throw new Error('max listeners')
            }
        }
        registerTrustedDialogWindow(dialogWindow as never)
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('登记对话框窗口 closed 清理失败'),
            expect.any(Error)
        )
        expect(isTrustedDialogSender({ sender: contents })).toBe(true)
    })

    it('webContents 缺失时不登记', () => {
        registerTrustedDialogWindow({ webContents: null } as never)
        expect(isTrustedDialogSender({ sender: mainContents })).toBe(false)
    })

    it('注销 null 窗口 / 缺失 webContents / 读取抛错窗口均为安全空操作', () => {
        unregisterTrustedDialogWindow(null)
        unregisterTrustedDialogWindow({ webContents: null } as never)
        const destroyedWindow = {
            get webContents(): never {
                throw new Error('Object has been destroyed')
            }
        }
        expect(() => unregisterTrustedDialogWindow(destroyedWindow as never)).not.toThrow()
    })

    it('注销时按 id 兜底移除登记', () => {
        const contents = { id: 23 }
        registerTrustedDialogWindow({ webContents: contents, once: vi.fn() } as never)
        // 用同 id 的另一个对象注销：id 集合命中后移除
        unregisterTrustedDialogWindow({ webContents: { id: 23 } } as never)
        expect(isTrustedDialogSender({ sender: { id: 23 } })).toBe(false)
    })
})

describe('isTrustedDialogSender / isTrustedIpcSender', () => {
    it('sender 缺失时对话框通道不受信', () => {
        expect(isTrustedDialogSender({})).toBe(false)
        expect(isTrustedDialogSender(null)).toBe(false)
    })

    it('scope=dialog 使用对话框登记表，scope=main-window 使用主窗口', () => {
        expect(isTrustedIpcSender({ sender: mainContents }, 'dialog')).toBe(false)
        expect(isTrustedIpcSender({ sender: mainContents }, 'main-window')).toBe(true)
    })
})

describe('assertTrustedSender 拒绝日志', () => {
    it('优先记录 senderFrame URL 并带通道名', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        expect(
            assertTrustedSender(
                { sender: { id: 9 }, senderFrame: { url: 'https://evil.example/' } },
                { channel: 'baize:file:save-to-disk' }
            )
        ).toBe(false)
        const text = String(warn.mock.calls[0]?.[0])
        expect(text).toContain('baize:file:save-to-disk')
        expect(text).toContain('https://evil.example/')
    })

    it('senderFrame URL 缺失时回退 getURL，再回退 webContents id', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        assertTrustedSender({ sender: { id: 5, getURL: () => '' } })
        expect(String(warn.mock.calls[0]?.[0])).toContain('webContents#5')
    })

    it('senderFrame / getURL 抛错时回退 unknown 而不影响判定', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const event = {
            sender: {
                id: 6,
                getURL: () => {
                    throw new Error('destroyed')
                }
            },
            senderFrame: {
                get url(): string {
                    throw new Error('destroyed')
                }
            }
        }
        expect(assertTrustedSender(event)).toBe(false)
        expect(String(warn.mock.calls[0]?.[0])).toContain('unknown')
    })

    it('合法发送方返回 true 且不告警', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        expect(assertTrustedSender({ sender: mainContents })).toBe(true)
        expect(warn).not.toHaveBeenCalled()
    })
})

describe('withSenderCheck 包装器', () => {
    it('handle 通道拒绝时返回统一错误对象且不执行监听器', async () => {
        const listener = vi.fn()
        const guarded = withSenderCheck('baize:config:write', listener, { kind: 'handle' })
        const result = await (guarded as unknown as (event: unknown) => Promise<unknown>)({
            sender: { id: 99 }
        })
        expect(result).toBe(UNTRUSTED_SENDER_RESULT)
        expect(listener).not.toHaveBeenCalled()
        expect(isUntrustedSenderResult(result)).toBe(true)
    })

    it('on 通道拒绝时返回 undefined 且不执行监听器', () => {
        const listener = vi.fn()
        const guarded = withSenderCheck('baize:file:save-to-disk', listener)
        expect((guarded as unknown as (event: unknown) => unknown)({ sender: { id: 99 } })).toBe(
            undefined
        )
        expect(listener).not.toHaveBeenCalled()
    })

    it('受信时透传 event 与其余参数并返回监听器结果', () => {
        const listener = vi.fn((_event: unknown, a: number, b: number) => a + b)
        const guarded = withSenderCheck('baize:file:update-content', listener)
        const result = (guarded as unknown as (...args: unknown[]) => unknown)(
            { sender: mainContents },
            2,
            3
        )
        expect(result).toBe(5)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('scope=dialog 时使用对话框登记表', () => {
        const listener = vi.fn()
        const guarded = withSenderCheck('baize:dialog:create', listener, { scope: 'dialog' })
        expect(
            (guarded as unknown as (event: unknown) => unknown)({ sender: mainContents })
        ).toBeUndefined()
        expect(listener).not.toHaveBeenCalled()
    })
})

describe('isUntrustedSenderResult', () => {
    it('非对象 / code 不匹配时返回 false', () => {
        expect(isUntrustedSenderResult(undefined)).toBe(false)
        expect(isUntrustedSenderResult(42)).toBe(false)
        expect(isUntrustedSenderResult({ code: 'other' })).toBe(false)
        expect(isUntrustedSenderResult({ code: 'untrusted-sender' })).toBe(true)
    })
})

describe('受信主窗口读写', () => {
    it('setTrustedMainWindow 写入后 getTrustedMainWindow 可读回', () => {
        const win = { webContents: mainContents }
        setTrustedMainWindow(win as never)
        expect(getTrustedMainWindow()).toBe(win)
        setTrustedMainWindow(null)
        expect(getTrustedMainWindow()).toBeNull()
        expect(isTrustedSender({ sender: mainContents })).toBe(false)
    })
})
