// @vitest-environment jsdom
/**
 * Convert 工具组件行为单测（P2/P3 修复）：
 * - TimestampConvert：空输入不再产出 1970-01-01，提示「请输入时间戳」（P3）；
 * - BaseConvert：输入防抖 200ms 与 10000 字符上限（P2）。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setLocale } from '@renderer/common/i18n'

import TimestampConvert from '@renderer/components/PluginTools/Convert/TimestampConvert.vue'
import BaseConvert from '@renderer/components/PluginTools/Convert/BaseConvert.vue'

function installClipboardMock() {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        configurable: true
    })
    return writeText
}

describe('TimestampConvert 空输入提示（P3）', () => {
    beforeEach(() => {
        setLocale('zh-CN')
        installClipboardMock()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mountTimestamp() {
        return mount(TimestampConvert, { props: { workAreaWidth: '1000px' } })
    }

    it('空输入点击转换：提示「请输入时间戳」，不再静默产出 1970-01-01', async () => {
        const wrapper = mountTimestamp()
        const convertButton = wrapper.findAll('button').find((button) => button.text() === '转换')
        expect(convertButton).toBeDefined()

        await convertButton!.trigger('click')
        await nextTick()

        expect(wrapper.find('.error-text').text()).toBe('请输入时间戳')
        expect(wrapper.find('[data-testid="ts-to-local-result"]').text()).toBe('')
        expect(wrapper.text()).not.toContain('1970-01-01')
        wrapper.unmount()
    })

    it('仅空白字符输入同样按空输入处理', async () => {
        const wrapper = mountTimestamp()
        await wrapper.findAll('input.value-input')[0].setValue('   ')
        const convertButton = wrapper.findAll('button').find((button) => button.text() === '转换')
        await convertButton!.trigger('click')
        await nextTick()

        expect(wrapper.find('.error-text').text()).toBe('请输入时间戳')
        wrapper.unmount()
    })

    it('合法时间戳仍正常转换', async () => {
        const wrapper = mountTimestamp()
        await wrapper.findAll('input.value-input')[0].setValue('1700000000')
        const convertButton = wrapper.findAll('button').find((button) => button.text() === '转换')
        await convertButton!.trigger('click')
        await nextTick()

        expect(wrapper.find('.error-text').exists()).toBe(false)
        expect(wrapper.find('[data-testid="ts-to-local-result"]').text()).toMatch(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
        )
        wrapper.unmount()
    })
})

describe('BaseConvert 防抖与输入上限（P2）', () => {
    beforeEach(() => {
        setLocale('zh-CN')
        installClipboardMock()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('输入防抖：击键后立即不转换，200ms 后转换一次', async () => {
        vi.useFakeTimers()
        const wrapper = mount(BaseConvert, { props: { workAreaWidth: '1000px' } })

        // 初始转换（setup 时同步执行）：255（十进制）→ 二进制
        expect(wrapper.find('[data-testid="base-result"]').text()).toBe('11111111')

        await wrapper.find('.value-area').setValue('10')
        // 防抖窗口内结果尚未更新
        expect(wrapper.find('[data-testid="base-result"]').text()).toBe('11111111')

        vi.advanceTimersByTime(200)
        await nextTick()
        expect(wrapper.find('[data-testid="base-result"]').text()).toBe('1010')
        wrapper.unmount()
    })

    it('超过 10000 字符上限：提示并停止转换', async () => {
        vi.useFakeTimers()
        const wrapper = mount(BaseConvert, { props: { workAreaWidth: '1000px' } })

        await wrapper.find('.value-area').setValue('1'.repeat(10001))
        vi.advanceTimersByTime(200)
        await nextTick()

        expect(wrapper.find('.error-text').text()).toContain('10000 字符上限')
        expect(wrapper.find('[data-testid="base-result"]').text()).toBe('')
        wrapper.unmount()
    })
})
