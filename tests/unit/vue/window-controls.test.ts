// @vitest-environment jsdom
/**
 * 第 3 批组件化（子任务 A1）：公共窗口控制组件 WindowControls 回归测试。
 *
 * 抽取自 WelcomeScreen.vue / BaiZeNotes.vue 两处重复实现，本测试锁定：
 * 1. 默认渲染三个按钮（最小化/最大化/关闭），`showMaximize=false` 时只渲染两个；
 * 2. 点击分别发送 MINIMIZE / TOGGLE_MAXIMIZE / CLOSE，并把 re-layout 事件上抛给父组件
 *    （父组件据此触发布局回调，最大化/最小化才上抛、关闭不上抛）；
 * 3. 最大化状态查询驱动「最大化 ↔ 还原」图标/title 切换；
 * 4. variant 变体类与按钮/svg 的 no-drag 模板契约（HTML 结构）保持。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const { sendMock, invokeMock } = vi.hoisted(() => ({
    sendMock: vi.fn(),
    invokeMock: vi.fn()
}))

import { IPC } from '../../../src/shared/ipc-channels'
import { setLocale } from '@renderer/common/i18n'
import WindowControls from '@renderer/components/common/WindowControls.vue'

let wrapper: VueWrapper | null = null

beforeEach(() => {
    sendMock.mockClear()
    invokeMock.mockReset()
    setLocale('zh-CN')
    vi.stubGlobal('electron', {
        ipcRenderer: {
            send: sendMock,
            invoke: invokeMock
        }
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

describe('WindowControls', () => {
    it('renders the three window buttons with the shared class contract', async () => {
        wrapper = mount(WindowControls)
        await flushPromises()
        expect(wrapper.find('.window-controls').exists()).toBe(true)
        expect(wrapper.findAll('.window-btn')).toHaveLength(3)
        for (const variant of [
            '.window-btn.minimize',
            '.window-btn.maximize',
            '.window-btn.close'
        ]) {
            const btn = wrapper.find(variant)
            expect(btn.element.tagName).toBe('BUTTON')
            expect(btn.find('svg').exists()).toBe(true)
        }
    })

    it('hides the maximize button when showMaximize=false (props contract)', async () => {
        wrapper = mount(WindowControls, { props: { showMaximize: false } })
        await flushPromises()
        expect(wrapper.findAll('.window-btn')).toHaveLength(2)
        expect(wrapper.find('.window-btn.maximize').exists()).toBe(false)
    })

    it('sends MINIMIZE / TOGGLE_MAXIMIZE / CLOSE and emits re-layout on window actions', async () => {
        wrapper = mount(WindowControls)
        await flushPromises()

        await wrapper.find('.window-btn.minimize').trigger('click')
        await wrapper.find('.window-btn.maximize').trigger('click')
        await wrapper.find('.window-btn.close').trigger('click')

        expect(sendMock).toHaveBeenCalledWith(IPC.WINDOW.MINIMIZE)
        expect(sendMock).toHaveBeenCalledWith(IPC.WINDOW.TOGGLE_MAXIMIZE)
        expect(sendMock).toHaveBeenCalledWith(IPC.WINDOW.CLOSE)
        // 最小化/最大化切换后通知父组件重新布局；关闭窗口无需布局
        expect(wrapper.emitted('re-layout')).toHaveLength(2)
    })

    it('shows restore icon/title when maximized and maximize icon/title otherwise', async () => {
        invokeMock.mockResolvedValue(true)
        wrapper = mount(WindowControls)
        await flushPromises()
        expect(invokeMock).toHaveBeenCalledWith(IPC.WINDOW.IS_MAXIMIZED)
        const maximizeBtn = wrapper.find('.window-btn.maximize')
        expect(maximizeBtn.attributes('title')).toBe('还原')
        expect(maximizeBtn.find('svg rect').exists()).toBe(true)

        wrapper.unmount()
        invokeMock.mockResolvedValue(false)
        wrapper = mount(WindowControls)
        await flushPromises()
        expect(wrapper.find('.window-btn.maximize').attributes('title')).toBe('最大化')
    })

    it('applies the variant class so parent components keep their own hover visuals', async () => {
        wrapper = mount(WindowControls, { props: { variant: 'welcome' } })
        await flushPromises()
        expect(wrapper.find('.window-controls').classes()).toContain('window-controls--welcome')

        wrapper.unmount()
        wrapper = mount(WindowControls)
        await flushPromises()
        expect(wrapper.find('.window-controls').classes()).toContain('window-controls--titlebar')
    })

    it('keeps the maximize title localized reactively (i18n keys unchanged)', async () => {
        invokeMock.mockResolvedValue(false)
        wrapper = mount(WindowControls)
        await flushPromises()
        expect(wrapper.find('.window-btn.minimize').attributes('title')).toBe('最小化')

        setLocale('en-US')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.window-btn.minimize').attributes('title')).toBe('Minimize')
        expect(wrapper.find('.window-btn.close').attributes('title')).toBe('Close')
    })
})
