/**
 * P1/N-05：IPC 发送方授权校验（ipc-security.ts）单元测试
 *
 * 覆盖：
 * - isTrustedSender：主窗口 webContents 严格匹配（对象引用/数字 id 兜底）、
 *   非法 sender、空事件、主窗口已销毁；
 * - registerTrustedDialogWindow / unregisterTrustedDialogWindow：
 *   对话框窗口登记、closed 自动注销、显式注销；
 * - assertTrustedSender：合法放行、非法 console.warn（带通道名）、
 *   scope 'dialog' 仅接受已登记对话框窗口、显式 mainWindow 参数；
 * - withSenderCheck：on 通道拒绝返回 undefined、handle 通道拒绝返回统一错误对象、
 *   合法时透传业务返回值与参数；
 * - isUntrustedSenderResult / resetTrustedSenderRegistry。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    assertTrustedSender,
    getTrustedMainWindow,
    isTrustedDialogSender,
    isTrustedSender,
    isUntrustedSenderResult,
    registerTrustedDialogWindow,
    resetTrustedSenderRegistry,
    setTrustedMainWindow,
    unregisterTrustedDialogWindow,
    withSenderCheck,
    UNTRUSTED_SENDER_RESULT
} from '../../src/main/utils/ipc-security'

interface FakeContents {
    id?: number
    getURL?: () => string
}

interface FakeWindow {
    webContents: FakeContents
    destroyed?: boolean
    listeners: Map<string, Array<() => void>>
    isDestroyed?: () => boolean
    once?: (event: string, listener: () => void) => void
    on?: (event: string, listener: () => void) => void
    close?: () => void
}

function makeWindow(contents: FakeContents, options: { withEvents?: boolean } = {}): FakeWindow {
    const listeners = new Map<string, Array<() => void>>()
    const window: FakeWindow = {
        webContents: contents,
        destroyed: false,
        listeners,
        isDestroyed: () => window.destroyed === true
    }
    if (options.withEvents !== false) {
        window.once = (event, listener) => {
            const list = listeners.get(event) ?? []
            list.push(listener)
            listeners.set(event, list)
        }
        window.on = window.once
        window.close = () => {
            window.destroyed = true
            for (const listener of listeners.get('closed') ?? []) {
                listener()
            }
        }
    }
    return window
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    resetTrustedSenderRegistry()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
    resetTrustedSenderRegistry()
})

describe('isTrustedSender（主窗口发送方判定）', () => {
    it('should accept the exact main window webContents', () => {
        const contents = { id: 1 }
        const mainWindow = makeWindow(contents)
        setTrustedMainWindow(mainWindow as never)
        expect(getTrustedMainWindow()).toBe(mainWindow)
        expect(isTrustedSender({ sender: contents })).toBe(true)
    })

    it('should accept a different wrapper object with the same webContents id', () => {
        const mainWindow = makeWindow({ id: 7 })
        setTrustedMainWindow(mainWindow as never)
        expect(isTrustedSender({ sender: { id: 7 } })).toBe(true)
    })

    it('should reject other senders, empty events and unknown senders', () => {
        const mainWindow = makeWindow({ id: 1 })
        setTrustedMainWindow(mainWindow as never)
        expect(isTrustedSender({ sender: { id: 2 } })).toBe(false)
        expect(isTrustedSender({})).toBe(false)
        expect(isTrustedSender(null)).toBe(false)
        expect(isTrustedSender(undefined)).toBe(false)
    })

    it('should reject when the main window is destroyed or never registered', () => {
        expect(isTrustedSender({ sender: { id: 1 } })).toBe(false)
        const mainWindow = makeWindow({ id: 1 })
        mainWindow.destroyed = true
        setTrustedMainWindow(mainWindow as never)
        expect(isTrustedSender({ sender: mainWindow.webContents })).toBe(false)
    })

    it('should accept an explicitly passed main window', () => {
        const contents = { id: 3 }
        const mainWindow = makeWindow(contents)
        expect(isTrustedSender({ sender: contents }, mainWindow as never)).toBe(true)
    })
})

describe('对话框窗口 sender 登记', () => {
    it('should trust a registered dialog window and reject unregistered ones', () => {
        const dialog = makeWindow({ id: 11 })
        expect(isTrustedDialogSender({ sender: dialog.webContents })).toBe(false)
        registerTrustedDialogWindow(dialog as never)
        expect(isTrustedDialogSender({ sender: dialog.webContents })).toBe(true)
        expect(isTrustedDialogSender({ sender: { id: 11 } })).toBe(true)
        expect(isTrustedDialogSender({ sender: { id: 12 } })).toBe(false)
    })

    it('should unregister a dialog window explicitly', () => {
        const dialog = makeWindow({ id: 11 })
        registerTrustedDialogWindow(dialog as never)
        unregisterTrustedDialogWindow(dialog as never)
        expect(isTrustedDialogSender({ sender: dialog.webContents })).toBe(false)
    })

    it('should unregister automatically when the dialog window is closed', () => {
        const dialog = makeWindow({ id: 11 })
        registerTrustedDialogWindow(dialog as never)
        expect(isTrustedDialogSender({ sender: dialog.webContents })).toBe(true)
        dialog.close?.()
        expect(isTrustedDialogSender({ sender: dialog.webContents })).toBe(false)
    })

    it('should tolerate windows without webContents or event APIs', () => {
        expect(() => registerTrustedDialogWindow(null)).not.toThrow()
        expect(() => registerTrustedDialogWindow({} as never)).not.toThrow()
        const dialog = makeWindow({ id: 13 }, { withEvents: false })
        registerTrustedDialogWindow(dialog as never)
        expect(isTrustedDialogSender({ sender: dialog.webContents })).toBe(true)
    })

    it('should not access the destroyed window when the closed listener fires', () => {
        // 回归：Electron 的 'closed' 事件触发时 BrowserWindow 已销毁，
        // 此时访问 window.webContents 会抛 "Object has been destroyed"，
        // 曾导致主进程未捕获异常（新建文件对话框关闭时弹窗）。
        const contents = { id: 21 }
        let destroyed = false
        let closedHandler: (() => void) | null = null
        const dialog = {
            get webContents(): FakeContents {
                if (destroyed) {
                    throw new TypeError('Object has been destroyed')
                }
                return contents
            },
            isDestroyed: () => destroyed,
            once: (event: string, listener: () => void): void => {
                if (event === 'closed') {
                    closedHandler = listener
                }
            }
        }
        registerTrustedDialogWindow(dialog as never)
        expect(isTrustedDialogSender({ sender: contents })).toBe(true)

        destroyed = true
        expect(closedHandler).not.toBeNull()
        expect(() => closedHandler?.()).not.toThrow()
        expect(isTrustedDialogSender({ sender: contents })).toBe(false)
    })

    it('should tolerate explicit unregister of an already destroyed window', () => {
        const contents = { id: 22 }
        let destroyed = false
        const dialog = {
            get webContents(): FakeContents {
                if (destroyed) {
                    throw new TypeError('Object has been destroyed')
                }
                return contents
            },
            isDestroyed: () => destroyed
        }
        registerTrustedDialogWindow(dialog as never)
        destroyed = true
        expect(() => unregisterTrustedDialogWindow(dialog as never)).not.toThrow()
        // 显式注销无法读取已销毁窗口时，登记表不应误删其它窗口条目
        expect(isTrustedDialogSender({ sender: contents })).toBe(true)
    })
})

describe('assertTrustedSender', () => {
    it('should pass silently for the main window sender', () => {
        const contents = { id: 1 }
        setTrustedMainWindow(makeWindow(contents) as never)
        expect(assertTrustedSender({ sender: contents }, { channel: 'ch' })).toBe(true)
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('should warn with channel name and reject an untrusted sender', () => {
        setTrustedMainWindow(makeWindow({ id: 1 }) as never)
        expect(
            assertTrustedSender(
                { sender: { id: 2, getURL: () => 'https://evil.example.com' } },
                { channel: 'baize:file:save-content-to-disk' }
            )
        ).toBe(false)
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const message = String(warnSpy.mock.calls[0][0])
        expect(message).toContain('[Security]')
        expect(message).toContain('baize:file:save-content-to-disk')
        expect(message).toContain('https://evil.example.com')
    })

    it('should only accept registered dialog windows in dialog scope', () => {
        const mainContents = { id: 1 }
        setTrustedMainWindow(makeWindow(mainContents) as never)
        const dialog = makeWindow({ id: 2 })
        expect(assertTrustedSender({ sender: mainContents }, { scope: 'dialog' })).toBe(false)
        registerTrustedDialogWindow(dialog as never)
        expect(assertTrustedSender({ sender: dialog.webContents }, { scope: 'dialog' })).toBe(true)
    })

    it('should use an explicitly passed main window and tolerate missing channel', () => {
        const contents = { id: 5 }
        const mainWindow = makeWindow(contents)
        expect(assertTrustedSender({ sender: contents }, { mainWindow: mainWindow as never })).toBe(
            true
        )
        expect(assertTrustedSender({ sender: { id: 6 } })).toBe(false)
        // 无 URL 时回退到 webContents id 作为诊断信息
        expect(String(warnSpy.mock.calls[0][0])).toContain('webContents#6')
    })
})

describe('withSenderCheck（监听器包装器）', () => {
    it('should run an on-listener for a trusted sender and pass args through', () => {
        const contents = { id: 1 }
        setTrustedMainWindow(makeWindow(contents) as never)
        // 显式声明业务函数签名：withSenderCheck 返回 TListener，
        // 若用 vi.fn(() => 'ok')（0 参）作为 T，guarded 在类型上就变成不可传参（TS2554）。
        const business = vi.fn<(event: unknown, ...args: unknown[]) => string>(() => 'ok')
        const guarded = withSenderCheck('baize:test:on', business)
        expect(guarded({ sender: contents } as never, 'a', 1)).toBe('ok')
        expect(business).toHaveBeenCalledWith({ sender: contents }, 'a', 1)
    })

    it('should reject an on-listener without executing business logic', () => {
        setTrustedMainWindow(makeWindow({ id: 1 }) as never)
        const business = vi.fn<(...args: unknown[]) => void>()
        const guarded = withSenderCheck('baize:test:on', business)
        expect(guarded({ sender: { id: 2 } } as never, 'a')).toBeUndefined()
        expect(business).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should return the unified error object for a rejected handle listener', async () => {
        setTrustedMainWindow(makeWindow({ id: 1 }) as never)
        const business = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true)
        const guarded = withSenderCheck('baize:test:handle', business, { kind: 'handle' })
        const result = guarded({ sender: { id: 2 } } as never, 'name')
        expect(result).toEqual(UNTRUSTED_SENDER_RESULT)
        expect(isUntrustedSenderResult(result)).toBe(true)
        expect(business).not.toHaveBeenCalled()
    })

    it('should pass a trusted handle listener result through', async () => {
        const contents = { id: 1 }
        setTrustedMainWindow(makeWindow(contents) as never)
        const business = vi.fn<(...args: unknown[]) => Promise<{ success: boolean }>>(async () => ({
            success: true
        }))
        const guarded = withSenderCheck('baize:test:handle', business, {
            kind: 'handle'
        })
        await expect(guarded({ sender: contents } as never)).resolves.toEqual({ success: true })
        expect(isUntrustedSenderResult({ success: true })).toBe(false)
    })
})
