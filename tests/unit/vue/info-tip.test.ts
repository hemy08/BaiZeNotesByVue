// @vitest-environment jsdom
/**
 * 1.5.6 UI 简洁化：统一解释性提示组件 InfoTip
 * 覆盖：ⓘ 触发按钮/aria、悬停延迟显示与移出延迟隐藏、focus/blur、点击切换、
 * Esc/外部关闭、默认插槽与 text、Teleport 到 body、位置计算（翻转/钳制）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import InfoTip from '../../../src/renderer/src/components/common/InfoTip.vue'

const flush = async (): Promise<void> => {
    await nextTick()
    await nextTick()
}

function findPopover(): HTMLElement | null {
    return document.body.querySelector('.info-tip__popover')
}

function mountTip(attach = true) {
    return mount(InfoTip, {
        attachTo: attach ? document.body : undefined,
        props: { text: '这是一段说明文字' }
    })
}

afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
})

describe('InfoTip 统一解释性提示', () => {
    it('渲染 ⓘ 触发按钮，使用默认 aria-label（说明）', () => {
        const wrapper = mountTip()
        const trigger = wrapper.find('.info-tip__trigger')
        expect(trigger.exists()).toBe(true)
        expect(trigger.attributes('aria-label')).toBe('说明')
        expect(trigger.attributes('type')).toBe('button')
        expect(trigger.attributes('aria-expanded')).toBe('false')
        wrapper.unmount()
    })

    it('悬停延迟后显示 tooltip（Teleport 到 body，role=tooltip）', async () => {
        vi.useFakeTimers()
        const wrapper = mountTip()
        await wrapper.find('.info-tip__trigger').trigger('mouseenter')
        expect(findPopover()).toBeNull()
        vi.advanceTimersByTime(150)
        await flush()
        const popover = findPopover()
        expect(popover).not.toBeNull()
        expect(popover?.getAttribute('role')).toBe('tooltip')
        expect(popover?.textContent).toContain('这是一段说明文字')
        expect(wrapper.find('.info-tip__trigger').attributes('aria-expanded')).toBe('true')
        wrapper.unmount()
    })

    it('鼠标移出后延迟隐藏（进入浮层可保持）', async () => {
        vi.useFakeTimers()
        const wrapper = mountTip()
        await wrapper.find('.info-tip__trigger').trigger('mouseenter')
        vi.advanceTimersByTime(150)
        await flush()
        expect(findPopover()).not.toBeNull()
        await wrapper.find('.info-tip__trigger').trigger('mouseleave')
        vi.advanceTimersByTime(200)
        await flush()
        expect(findPopover()).toBeNull()
        wrapper.unmount()
    })

    it('键盘 focus 显示、blur 隐藏', async () => {
        const wrapper = mountTip()
        await wrapper.find('.info-tip__trigger').trigger('focus')
        await flush()
        expect(findPopover()).not.toBeNull()
        await wrapper.find('.info-tip__trigger').trigger('blur')
        await flush()
        expect(findPopover()).toBeNull()
        wrapper.unmount()
    })

    it('点击切换显示状态（触屏/固定场景）', async () => {
        const wrapper = mountTip()
        const trigger = wrapper.find('.info-tip__trigger')
        await trigger.trigger('click')
        await flush()
        expect(findPopover()).not.toBeNull()
        await trigger.trigger('click')
        await flush()
        expect(findPopover()).toBeNull()
        wrapper.unmount()
    })

    it('Esc 关闭浮层', async () => {
        const wrapper = mountTip()
        const trigger = wrapper.find('.info-tip__trigger')
        await trigger.trigger('click')
        await flush()
        expect(findPopover()).not.toBeNull()
        await trigger.trigger('keydown', { key: 'Escape' })
        await flush()
        expect(findPopover()).toBeNull()
        wrapper.unmount()
    })

    it('外部 pointerdown 关闭浮层', async () => {
        const wrapper = mountTip()
        await wrapper.find('.info-tip__trigger').trigger('click')
        await flush()
        expect(findPopover()).not.toBeNull()
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        await flush()
        expect(findPopover()).toBeNull()
        wrapper.unmount()
    })

    it('aria-controls 指向浮层 id，显示时 aria-expanded=true', async () => {
        const wrapper = mountTip()
        const trigger = wrapper.find('.info-tip__trigger')
        const controls = trigger.attributes('aria-controls')
        expect(controls).toBeTruthy()
        await trigger.trigger('click')
        await flush()
        expect(findPopover()?.id).toBe(controls)
        wrapper.unmount()
    })

    it('默认插槽可渲染富文本说明', async () => {
        const wrapper = mount(InfoTip, {
            attachTo: document.body,
            slots: { default: '<strong class="tip-rich">富文本说明</strong>' }
        })
        await wrapper.find('.info-tip__trigger').trigger('click')
        await flush()
        expect(findPopover()?.querySelector('.tip-rich')).not.toBeNull()
        wrapper.unmount()
    })

    it('自定义 ariaLabel 覆盖默认值', () => {
        const wrapper = mount(InfoTip, {
            attachTo: document.body,
            props: { text: '说明', ariaLabel: '关于界面密度' }
        })
        expect(wrapper.find('.info-tip__trigger').attributes('aria-label')).toBe('关于界面密度')
        wrapper.unmount()
    })

    it('空间不足时自动翻转/钳制位置（mock 触发点与浮层矩形）', async () => {
        const wrapper = mountTip()
        const trigger = wrapper.find('.info-tip__trigger').element as HTMLButtonElement
        // 触发点在视口顶部 → 上方空间不足，应翻转到下方
        trigger.getBoundingClientRect = () =>
            ({ top: 4, bottom: 22, left: 900, width: 18, height: 18, right: 918 }) as DOMRect
        await wrapper.find('.info-tip__trigger').trigger('click')
        await flush()
        // 浮层默认 jsdom 矩形为 0 尺寸：上方放不下 → placement=bottom（top 从锚点底部+8 开始）
        const popover = findPopover()
        expect(popover).not.toBeNull()
        expect(Number.parseFloat(popover!.style.top)).toBeGreaterThan(22)
        wrapper.unmount()
    })
})
