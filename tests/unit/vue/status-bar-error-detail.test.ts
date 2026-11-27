// @vitest-environment jsdom
/**
 * 状态栏错误详情交互单测（视觉升级 P1-B2 / T11，COMPONENTS.md §7.1）
 *
 * 覆盖：错误消息用 danger 状态点（不再用字符图标）+ 可点击打开详情；详情弹层
 * role=dialog / aria-label / 焦点移入；Esc 与点击外部关闭；关闭后焦点归还触发按钮；
 * 消息切换/自动复位时详情不残留。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

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

/** 推一条错误消息并等待渲染 */
async function pushErrorMessage(
    w: VueWrapper,
    message = '导出失败：目标文件被占用'
): Promise<void> {
    pushConsoleUpdate({ message, type: 'error' })
    await nextTick()
    await w.vm.$nextTick()
}

describe('StatusBar 错误状态点与详情弹层', () => {
    it('错误消息渲染 danger 状态点 + 可点击触发按钮（不再用字符图标）', async () => {
        const w = mountStatusBar()
        await pushErrorMessage(w)

        expect(w.find('#status-bar-console').classes()).toContain('error')
        expect(w.find('.console-dot').exists()).toBe(true)
        expect(w.find('.console-icon').exists()).toBe(false)
        expect(w.find('.console-message').text()).toBe('导出失败：目标文件被占用')

        const trigger = w.find('.console-trigger')
        expect(trigger.exists()).toBe(true)
        expect(trigger.attributes('aria-expanded')).toBe('false')
        expect(trigger.attributes('aria-haspopup')).toBe('dialog')
        expect(trigger.attributes('aria-label')).toBe('导出失败：目标文件被占用')
        expect(w.find('.status-error-popover').exists()).toBe(false)
    })

    it('点击状态点打开详情：role=dialog + 完整消息 + 焦点移入弹层', async () => {
        const w = mountStatusBar()
        await pushErrorMessage(w)
        await w.find('.console-trigger').trigger('click')
        await nextTick()

        const popover = w.find('.status-error-popover')
        expect(popover.exists()).toBe(true)
        expect(popover.attributes('role')).toBe('dialog')
        expect(popover.attributes('aria-label')).toBe('错误')
        expect(popover.find('.status-error-popover__message').text()).toBe(
            '导出失败：目标文件被占用'
        )
        expect(w.find('.console-trigger').attributes('aria-expanded')).toBe('true')
        expect(document.activeElement).toBe(popover.element)
    })

    it('Esc 关闭详情并把焦点归还触发按钮', async () => {
        const w = mountStatusBar()
        await pushErrorMessage(w)
        await w.find('.console-trigger').trigger('click')
        await nextTick()

        const popover = w.find('.status-error-popover')
        await popover.trigger('keydown', { key: 'Escape' })
        await nextTick()

        expect(w.find('.status-error-popover').exists()).toBe(false)
        expect(w.find('.console-trigger').attributes('aria-expanded')).toBe('false')
        expect(document.activeElement).toBe(w.find('.console-trigger').element)
    })

    it('点击外部关闭详情（不抢焦点）', async () => {
        const w = mountStatusBar()
        await pushErrorMessage(w)
        await w.find('.console-trigger').trigger('click')
        await nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(true)

        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(false)
    })

    it('再次点击状态点收起详情', async () => {
        const w = mountStatusBar()
        await pushErrorMessage(w)
        const trigger = w.find('.console-trigger')
        await trigger.trigger('click')
        await nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(true)
        await trigger.trigger('click')
        await nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(false)
    })

    it('错误消息变为成功消息后详情不再残留，字符图标恢复', async () => {
        const w = mountStatusBar()
        await pushErrorMessage(w)
        await w.find('.console-trigger').trigger('click')
        await nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(true)

        pushConsoleUpdate({ message: '保存完成', type: 'success' })
        await nextTick()
        await w.vm.$nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(false)
        expect(w.find('.console-icon').text()).toBe('✓')
        expect(w.find('.console-trigger').exists()).toBe(false)
    })

    it('错误消息 5 秒自动复位后详情同步关闭', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()
        pushConsoleUpdate({ message: '导出失败', type: 'error' })
        await w.vm.$nextTick()
        await w.find('.console-trigger').trigger('click')
        await w.vm.$nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(true)

        vi.advanceTimersByTime(RESET_DELAY_MS)
        await w.vm.$nextTick()
        expect(w.find('.status-error-popover').exists()).toBe(false)
        expect(w.find('.console-message').text()).toBe('就绪')
    })
})
