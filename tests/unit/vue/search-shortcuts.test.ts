// @vitest-environment node
/**
 * A2/A9 全局快捷键单测（2026-11-21）
 *
 * 覆盖：Ctrl+Shift+F（工作区搜索）/ Ctrl+Shift+P（命令面板）/ Ctrl+P（Quick Open）
 * 的识别、非目标按键不消费、输入法组合期忽略、macOS Cmd 兼容、注册/清理函数。
 */
import { describe, it, expect, vi } from 'vitest'

import {
    matchSearchShortcut,
    registerSearchShortcuts,
    type SearchShortcutEventTarget,
    type SearchShortcutHandlers
} from '../../../src/renderer/src/components/search/search-shortcuts'

/** 最小键盘事件构造器 */
function keyEvent(
    key: string,
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {},
    extra: { isComposing?: boolean; keyCode?: number } = {}
) {
    return {
        key,
        ctrlKey: modifiers.ctrl === true,
        metaKey: modifiers.meta === true,
        shiftKey: modifiers.shift === true,
        altKey: modifiers.alt === true,
        isComposing: extra.isComposing,
        keyCode: extra.keyCode
    }
}

describe('matchSearchShortcut：快捷键识别', () => {
    it('Ctrl+Shift+F → 工作区搜索', () => {
        expect(matchSearchShortcut(keyEvent('F', { ctrl: true, shift: true }))).toBe(
            'workspace-search'
        )
        expect(matchSearchShortcut(keyEvent('f', { ctrl: true, shift: true }))).toBe(
            'workspace-search'
        )
    })

    it('Ctrl+Shift+P → 命令面板；Ctrl+P → Quick Open', () => {
        expect(matchSearchShortcut(keyEvent('P', { ctrl: true, shift: true }))).toBe(
            'command-palette'
        )
        expect(matchSearchShortcut(keyEvent('p', { ctrl: true }))).toBe('quick-open')
    })

    it('macOS Cmd（metaKey）等价命中', () => {
        expect(matchSearchShortcut(keyEvent('f', { meta: true, shift: true }))).toBe(
            'workspace-search'
        )
        expect(matchSearchShortcut(keyEvent('p', { meta: true }))).toBe('quick-open')
    })

    it('无主修饰键 / Alt 组合 / 其它按键不命中', () => {
        expect(matchSearchShortcut(keyEvent('p'))).toBeNull()
        expect(matchSearchShortcut(keyEvent('f', { shift: true }))).toBeNull()
        expect(matchSearchShortcut(keyEvent('p', { ctrl: true, alt: true }))).toBeNull()
        expect(matchSearchShortcut(keyEvent('x', { ctrl: true, shift: true }))).toBeNull()
        expect(matchSearchShortcut(keyEvent('f', { ctrl: true }))).toBeNull()
    })

    it('输入法组合期间不响应（isComposing / keyCode 229）', () => {
        expect(matchSearchShortcut(keyEvent('p', { ctrl: true }, { isComposing: true }))).toBeNull()
        expect(matchSearchShortcut(keyEvent('p', { ctrl: true }, { keyCode: 229 }))).toBeNull()
    })
})

describe('registerSearchShortcuts：注册/清理', () => {
    /** 事件目标替身：记录注册的监听器并暴露触发方法 */
    function makeTarget(): {
        target: SearchShortcutEventTarget
        trigger: (event: unknown) => void
        listeners: Set<(event: KeyboardEvent) => void>
    } {
        const listeners = new Set<(event: KeyboardEvent) => void>()
        return {
            listeners,
            target: {
                addEventListener: (type, listener) => {
                    expect(type).toBe('keydown')
                    listeners.add(listener)
                },
                removeEventListener: (type, listener) => {
                    expect(type).toBe('keydown')
                    listeners.delete(listener)
                }
            },
            trigger: (event: unknown) => {
                for (const listener of [...listeners]) {
                    listener(event as KeyboardEvent)
                }
            }
        }
    }

    /** 处理回调替身 + 对应 handlers 对象（便于断言调用次数） */
    function makeHandlers(): {
        handlers: SearchShortcutHandlers
        openWorkspaceSearch: ReturnType<typeof vi.fn>
        openCommandPalette: ReturnType<typeof vi.fn>
        openQuickOpen: ReturnType<typeof vi.fn>
    } {
        const openWorkspaceSearch = vi.fn()
        const openCommandPalette = vi.fn()
        const openQuickOpen = vi.fn()
        return {
            handlers: { openWorkspaceSearch, openCommandPalette, openQuickOpen },
            openWorkspaceSearch,
            openCommandPalette,
            openQuickOpen
        }
    }

    /** 键盘事件替身（含 preventDefault/stopPropagation 记录） */
    function makeKeyboardEvent(key: string, modifiers: Record<string, boolean> = {}) {
        return {
            key,
            ctrlKey: modifiers.ctrl === true,
            metaKey: modifiers.meta === true,
            shiftKey: modifiers.shift === true,
            altKey: modifiers.alt === true,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        }
    }

    it('命中快捷键时调用对应回调并阻止默认行为', () => {
        const { target, trigger } = makeTarget()
        const { handlers, openWorkspaceSearch, openCommandPalette, openQuickOpen } = makeHandlers()
        registerSearchShortcuts(target, handlers)

        const searchEvent = makeKeyboardEvent('f', { ctrl: true, shift: true })
        trigger(searchEvent)
        expect(openWorkspaceSearch).toHaveBeenCalledTimes(1)
        expect(searchEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(searchEvent.stopPropagation).toHaveBeenCalledTimes(1)

        trigger(makeKeyboardEvent('p', { ctrl: true, shift: true }))
        expect(openCommandPalette).toHaveBeenCalledTimes(1)

        trigger(makeKeyboardEvent('p', { ctrl: true }))
        expect(openQuickOpen).toHaveBeenCalledTimes(1)
    })

    it('未命中时不调用回调、不阻止默认行为', () => {
        const { target, trigger } = makeTarget()
        const { handlers, openQuickOpen } = makeHandlers()
        registerSearchShortcuts(target, handlers)

        const event = makeKeyboardEvent('p')
        trigger(event)
        expect(openQuickOpen).not.toHaveBeenCalled()
        expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('返回的清理函数移除监听（重复清理安全）', () => {
        const { target, trigger, listeners } = makeTarget()
        const { handlers, openQuickOpen } = makeHandlers()
        const dispose = registerSearchShortcuts(target, handlers)
        expect(listeners.size).toBe(1)

        dispose()
        expect(listeners.size).toBe(0)
        trigger(makeKeyboardEvent('p', { ctrl: true }))
        expect(openQuickOpen).not.toHaveBeenCalled()

        expect(() => dispose()).not.toThrow()
    })
})
