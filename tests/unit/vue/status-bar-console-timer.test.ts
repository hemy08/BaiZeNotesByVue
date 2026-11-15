// @vitest-environment jsdom
/**
 * PF-13：StatusBar 控制台消息自动复位定时器清理防回归。
 *
 * 背景：状态栏每收到一条非 loading 消息就创建一个 5s setTimeout 用于自动复位，
 * 改造前既未保存句柄、也未在卸载时清理：
 *   - 新消息到达时旧 timer 仍会触发（短会话内 timer 持续堆积）；
 *   - 组件卸载后 5s 内的 timer 仍持有组件闭包，阻碍回收。
 * 修复后全局只保留最新一个 timer：新消息先 clearTimeout 旧 timer，卸载时统一清理。
 *
 * 隔离策略：StatusBar 只把 monaco-editor 的 Position 当类型用，mock 掉避免加载重型依赖；
 * 通过 stub 的 window.electron.ipcRenderer.on 捕获 STATUS_BAR_UPDATE 回调，用 fake timers
 * 断言 getTimerCount() 与 5 秒自动复位行为。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// StatusBar 仅把 monaco-editor 的 Position 当作类型使用，mock 掉避免加载重型依赖
vi.mock('monaco-editor', () => ({}))

import StatusBar from '@renderer/components/StatusBar.vue'
import { IPC } from '../../../src/shared/ipc-channels'

const RESET_DELAY_MS = 5000

let handlers: Map<string, (...args: unknown[]) => void>
let wrapper: VueWrapper | null = null

beforeEach(() => {
    handlers = new Map()
    const on = vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        handlers.set(channel, handler)
    })
    vi.stubGlobal('electron', {
        ipcRenderer: { on, removeListener: vi.fn(), send: vi.fn(), invoke: vi.fn() }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

function mountStatusBar(): VueWrapper {
    wrapper = mount(StatusBar, { attachTo: document.body })
    return wrapper
}

/** 模拟主进程推送一条状态栏消息 */
function pushConsoleUpdate(payload: Record<string, unknown>): void {
    const handler = handlers.get(IPC.EVENTS.STATUS_BAR_UPDATE)
    expect(handler, 'STATUS_BAR_UPDATE 监听器未注册').toBeTruthy()
    handler!(null, payload)
}

describe('StatusBar console auto-reset timer cleanup (PF-13)', () => {
    it('keeps only the newest auto-reset timer when two messages arrive in a row', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()
        expect(vi.getTimerCount()).toBe(0)

        pushConsoleUpdate({ message: '第一条', type: 'success' })
        await w.vm.$nextTick()
        expect(vi.getTimerCount()).toBe(1)
        expect(w.find('.console-message').text()).toBe('第一条')

        pushConsoleUpdate({ message: '第二条', type: 'success' })
        await w.vm.$nextTick()
        // 旧 timer 已被 clearTimeout：全局只保留最后一个待触发 timer
        expect(vi.getTimerCount()).toBe(1)
        expect(w.find('.console-message').text()).toBe('第二条')
    })

    it('skips timer creation for loading messages and clears the previous timer', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()

        pushConsoleUpdate({ message: '保存完成', type: 'success' })
        await w.vm.$nextTick()
        expect(vi.getTimerCount()).toBe(1)

        // loading 状态不会自动清除，也不需要自动复位 timer
        pushConsoleUpdate({ message: '正在导出...', type: 'loading' })
        await w.vm.$nextTick()
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(10000)
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('正在导出...')
    })

    it('clears the pending timer when the component unmounts', () => {
        vi.useFakeTimers()
        const w = mountStatusBar()

        pushConsoleUpdate({ message: '保存完成', type: 'success' })
        expect(vi.getTimerCount()).toBe(1)

        w.unmount()
        wrapper = null

        // 卸载后无残留 timer（否则 timer 闭包会持有已卸载组件）
        expect(vi.getTimerCount()).toBe(0)
        expect(() => vi.advanceTimersByTime(RESET_DELAY_MS * 2)).not.toThrow()
    })

    it('still auto-resets the message after 5 seconds (behavior preserved)', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()

        pushConsoleUpdate({ message: '保存完成', type: 'success' })
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('保存完成')

        vi.advanceTimersByTime(RESET_DELAY_MS)
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('就绪')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('does not let a stale timer reset a newer message', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()

        pushConsoleUpdate({ message: '第一条', type: 'success' })
        await w.vm.$nextTick()

        // 4 秒后新消息到达：旧 timer（本应在第 5 秒触发）被清理
        vi.advanceTimersByTime(4000)
        pushConsoleUpdate({ message: '第二条', type: 'success' })
        await w.vm.$nextTick()

        // 推进到旧 timer 原本的触发点：新消息必须保留
        vi.advanceTimersByTime(RESET_DELAY_MS - 4000)
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('第二条')
        expect(vi.getTimerCount()).toBe(1)

        // 再推进 4 秒到新消息自己的 5s 复位点：回到「就绪」
        vi.advanceTimersByTime(4000)
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('就绪')
        expect(vi.getTimerCount()).toBe(0)
    })
})
