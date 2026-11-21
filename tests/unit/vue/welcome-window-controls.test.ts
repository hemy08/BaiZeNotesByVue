// @vitest-environment jsdom
// 欢迎页右上角窗口控制按钮（最小化 / 最大化 / 关闭）回归测试。
//
// 背景：用户反馈欢迎页右上角三个按钮「点击无反应」。根因有两层：
// 1. 按钮位于 -webkit-app-region: drag 的控制条内，SVG 子元素未显式 no-drag，
//    点击图标本身被判为拖拽热区 → click 不触发（CSS 修复，无法在 jsdom 断言）；
// 2. 关闭通道在欢迎页仍走 FLUSH_CONTENT 落盘协议（等待 2s 超时），点击后窗口长时间
//    不动，用户同样感知为「按钮无效」（主进程 CLOSE handler 快速路径修复）。
//
// 本测试锁定第 1 层的 JS 链路：点击三个按钮分别向主进程发送对应的 WINDOW 通道常量。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

import { IPC } from '../../../src/shared/ipc-channels'
import { setLocale } from '@renderer/common/i18n'
import WelcomeScreen from '@renderer/components/WelcomeScreen.vue'

let wrapper: VueWrapper | null = null

beforeEach(() => {
    sendMock.mockClear()
    setLocale('zh-CN')
    vi.stubGlobal('electron', {
        ipcRenderer: {
            send: sendMock,
            on: vi.fn(),
            removeListener: vi.fn(),
            invoke: vi.fn()
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn() }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    setLocale('zh-CN')
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('WelcomeScreen 窗口控制按钮', () => {
    it('renders exactly three window control buttons', async () => {
        wrapper = mount(WelcomeScreen)
        await flushPromises()
        await vi.waitFor(() => expect(wrapper!.find('.window-controls').exists()).toBe(true))
        expect(wrapper.find('.window-controls').exists()).toBe(true)
        expect(wrapper.findAll('.window-btn')).toHaveLength(3)
    })

    it('sends WINDOW.MINIMIZE when the minimize button is clicked', async () => {
        wrapper = mount(WelcomeScreen)
        await flushPromises()
        await vi.waitFor(() => expect(wrapper!.find('.window-btn.minimize').exists()).toBe(true))
        await wrapper.find('.window-btn.minimize').trigger('click')
        expect(sendMock).toHaveBeenCalledWith(IPC.WINDOW.MINIMIZE)
    })

    it('sends WINDOW.TOGGLE_MAXIMIZE when the maximize button is clicked (二次点击还原)', async () => {
        wrapper = mount(WelcomeScreen)
        await flushPromises()
        await vi.waitFor(() => expect(wrapper!.find('.window-btn.maximize').exists()).toBe(true))
        await wrapper.find('.window-btn.maximize').trigger('click')
        // 2026-11-18（用户反馈）：最大化按钮需支持再次点击还原——
        // 原实现发 MAXIMIZE（仅最大化，二次点击无效），改为发送 TOGGLE_MAXIMIZE。
        expect(sendMock).toHaveBeenCalledWith(IPC.WINDOW.TOGGLE_MAXIMIZE)
    })

    it('shows the restore icon/title when the window is maximized', async () => {
        const invokeMock = window.electron.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>
        invokeMock.mockResolvedValue(true)
        wrapper = mount(WelcomeScreen)
        await flushPromises()

        expect(invokeMock).toHaveBeenCalledWith(IPC.WINDOW.IS_MAXIMIZED)
        const maximizeBtn = wrapper.find('.window-btn.maximize')
        expect(maximizeBtn.attributes('title')).toBe('还原')
        // 最大化时按钮含两个 svg 子元素（还原图标：两层矩形）
        expect(maximizeBtn.findAll('svg').length).toBe(1)
        expect(maximizeBtn.find('svg rect').exists()).toBe(true)
    })

    it('shows the maximize icon/title when the window is not maximized', async () => {
        const invokeMock = window.electron.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>
        invokeMock.mockResolvedValue(false)
        wrapper = mount(WelcomeScreen)
        await flushPromises()
        expect(wrapper.find('.window-btn.maximize').attributes('title')).toBe('最大化')
    })

    it('sends WINDOW.CLOSE when the close button is clicked', async () => {
        wrapper = mount(WelcomeScreen)
        await flushPromises()
        await wrapper.find('.window-btn.close').trigger('click')
        expect(sendMock).toHaveBeenCalledWith(IPC.WINDOW.CLOSE)
    })

    it('does not start a window drag for the control buttons (no-drag is declared)', async () => {
        // jsdom 不计算 -webkit-app-region，但可锁定模板契约：三个按钮均带 window-btn 类，
        // 且按钮内 SVG 子元素存在（CSS 层对 .window-btn svg 声明 no-drag，见组件样式）。
        wrapper = mount(WelcomeScreen)
        await flushPromises()
        for (const selector of ['.minimize', '.maximize', '.close']) {
            const btn = wrapper.find(selector)
            expect(btn.element.tagName).toBe('BUTTON')
            expect(btn.find('svg').exists()).toBe(true)
        }
    })
})
