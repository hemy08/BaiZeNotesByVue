// @vitest-environment jsdom
/**
 * 插件工具 0% 组件补测（语句覆盖 0% 盲区，来自 coverage-final.json 清单）：
 * 1. `PluginTools/TextTools/WordCount.vue`（17 语句/5 函数）——字数统计面板：
 *    初始统计、150ms 输入防抖、清空按钮、卸载清理防抖定时器；
 * 2. `PluginTools/Convert/RmbCase.vue`（14 语句/2 函数）——人民币大写转换：
 *    挂载即转换、正常转换、异常提示、复制结果、回车触发；
 * 3. `PluginTools/TextTools/ChineseTextTool.vue`（16 语句/3 函数）——繁简/拼音：
 *    标签页切换、四个转换目标分派、复制输出、workAreaWidth prop 生效。
 *
 * 依赖边界：纯函数库（word-count-lib 真实；rmb-lib / chinese-lib 以契约 mock
 * 控制异常与异步分支）与剪贴板封装（mock 后断言调用）均属边界外依赖，
 * 本文件只验证组件自身的状态与事件接线。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const clipboardMocks = vi.hoisted(() => ({
    copyTextToClipboard: vi.fn().mockResolvedValue(true)
}))

vi.mock('@renderer/common/clipboard', () => clipboardMocks)

const rmbMocks = vi.hoisted(() => ({
    rmbToUpper: vi.fn((value: string | number) => {
        if (String(value) === 'abc') {
            throw new Error('金额格式错误')
        }
        return `大写(${String(value)})`
    })
}))

vi.mock('../../../src/renderer/src/components/PluginTools/Convert/rmb-lib', () => rmbMocks)

const chineseMocks = vi.hoisted(() => ({
    toTraditional: vi.fn((text: string) => `繁:${text}`),
    toSimplified: vi.fn((text: string) => `简:${text}`),
    getPinyin: vi.fn(async (text: string) => `拼音:${text}`),
    getFirstLetter: vi.fn(async (text: string) => `首字母:${text}`)
}))

vi.mock(
    '../../../src/renderer/src/components/PluginTools/TextTools/chinese-lib',
    () => chineseMocks
)

import { setLocale } from '@renderer/common/i18n'
import WordCount from '@renderer/components/PluginTools/TextTools/WordCount.vue'
import RmbCase from '@renderer/components/PluginTools/Convert/RmbCase.vue'
import ChineseTextTool from '@renderer/components/PluginTools/TextTools/ChineseTextTool.vue'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    vi.restoreAllMocks()
    setLocale('zh-CN')
    document.body.innerHTML = ''
})

describe('WordCount.vue 字数统计面板', () => {
    beforeEach(() => {
        setLocale('zh-CN')
        clipboardMocks.copyTextToClipboard.mockClear()
        vi.useFakeTimers()
    })

    function statValues(w: VueWrapper): string[] {
        return w.findAll('.stat-value').map((item) => item.text())
    }

    it('初始渲染统计卡片与全零统计，workAreaWidth prop 生效', () => {
        wrapper = mount(WordCount, { props: { workAreaWidth: '640px' } })

        expect(wrapper.find('.header-display-center').text()).toContain('字数')
        expect(wrapper.findAll('.stat-card')).toHaveLength(8)
        expect(statValues(wrapper)).toEqual(['0', '0', '0', '0', '0', '0', '0', '0'])
        expect((wrapper.find('.plugin-tools-theme').element as HTMLElement).style.width).toBe(
            '640px'
        )
        expect((wrapper.find('.tool-textarea').element as HTMLTextAreaElement).value).toBe('')
    })

    it('输入后 150ms 防抖再统计（防抖前不更新）', async () => {
        wrapper = mount(WordCount)
        await wrapper.find('.tool-textarea').setValue('你好世界\nhello 123')

        // 防抖未到期：统计仍为零
        expect(statValues(wrapper)[0]).toBe('0')

        await vi.advanceTimersByTimeAsync(150)
        await nextTick()

        const values = statValues(wrapper)
        expect(values[0]).toBe('4') // 汉字
        expect(values[2]).toBe('5') // 英文字母
        expect(values[3]).toBe('3') // 数字
        expect(values[5]).toBe('14') // 总字符（含换行）
        expect(values[6]).toBe('12') // 去空白：4 汉字 + 5 字母 + 3 数字
        expect(values[7]).toBe('2') // 段落
    })

    it('清空按钮同时清空输入与统计结果', async () => {
        wrapper = mount(WordCount)
        const textarea = wrapper.find('.tool-textarea')
        await textarea.setValue('白泽笔记')
        await vi.advanceTimersByTimeAsync(150)
        await nextTick()
        expect(statValues(wrapper)[0]).toBe('4')

        await wrapper.find('.tool-btn').trigger('click')
        await flushPromises()

        expect((wrapper.find('.tool-textarea').element as HTMLTextAreaElement).value).toBe('')
        expect(statValues(wrapper)).toEqual(['0', '0', '0', '0', '0', '0', '0', '0'])
    })

    it('连续输入只按最后一次内容统计（前一次防抖计时被清除）', async () => {
        wrapper = mount(WordCount)
        const textarea = wrapper.find('.tool-textarea')

        await textarea.setValue('第一次')
        await nextTick()
        expect(vi.getTimerCount()).toBe(1)
        await textarea.setValue('第二次输入')
        await nextTick()
        // 重新调度不会叠加计时器
        expect(vi.getTimerCount()).toBe(1)

        await vi.advanceTimersByTimeAsync(150)
        await nextTick()

        const values = statValues(wrapper)
        expect(values[0]).toBe('5') // 第二次输入的汉字数
        expect(values[5]).toBe('5') // 第二次输入总字符数（第一次内容不参与统计）
    })

    it('卸载时清理挂起的防抖定时器', async () => {
        wrapper = mount(WordCount)
        await wrapper.find('.tool-textarea').setValue('尚未到防抖')
        expect(vi.getTimerCount()).toBeGreaterThan(0)

        wrapper.unmount()
        wrapper = null

        expect(vi.getTimerCount()).toBe(0)
    })
})

describe('RmbCase.vue 人民币大写转换', () => {
    beforeEach(() => {
        setLocale('zh-CN')
        clipboardMocks.copyTextToClipboard.mockClear()
        rmbMocks.rmbToUpper.mockClear()
    })

    function resultText(w: VueWrapper): string {
        return w.find('[data-testid="rmb-result"]').text()
    }

    it('挂载即以默认金额执行转换并展示结果', () => {
        wrapper = mount(RmbCase)

        expect(rmbMocks.rmbToUpper).toHaveBeenCalledWith('100.5')
        expect(resultText(wrapper)).toBe('大写(100.5)')
        expect(wrapper.find('.error-text').exists()).toBe(false)
    })

    it('点击转换按钮按输入更新结果', async () => {
        wrapper = mount(RmbCase)
        await wrapper.find('.value-input').setValue('888.88')
        const convertButton = wrapper.findAll('.plugin-tools-btn')[0]
        await convertButton.trigger('click')

        expect(rmbMocks.rmbToUpper).toHaveBeenLastCalledWith('888.88')
        expect(resultText(wrapper)).toBe('大写(888.88)')
    })

    it('回车触发转换', async () => {
        wrapper = mount(RmbCase)
        await wrapper.find('.value-input').setValue('12')
        await wrapper.find('.value-input').trigger('keyup.enter')

        expect(rmbMocks.rmbToUpper).toHaveBeenLastCalledWith('12')
        expect(resultText(wrapper)).toBe('大写(12)')
    })

    it('转换异常时清空结果并展示错误提示', async () => {
        wrapper = mount(RmbCase)
        await wrapper.find('.value-input').setValue('abc')
        await wrapper.findAll('.plugin-tools-btn')[0].trigger('click')

        expect(resultText(wrapper)).toBe('')
        expect(wrapper.find('.error-text').text()).toContain('金额格式错误')
    })

    it('复制按钮仅在有结果时写入剪贴板', async () => {
        wrapper = mount(RmbCase)
        const copyButton = wrapper.findAll('.plugin-tools-btn')[1]
        await copyButton.trigger('click')

        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledTimes(1)
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith('大写(100.5)')

        // 转换失败结果为空后，复制不再触发
        await wrapper.find('.value-input').setValue('abc')
        await wrapper.findAll('.plugin-tools-btn')[0].trigger('click')
        await copyButton.trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledTimes(1)
    })
})

describe('ChineseTextTool.vue 繁简/拼音工具', () => {
    beforeEach(() => {
        setLocale('zh-CN')
        clipboardMocks.copyTextToClipboard.mockClear()
        chineseMocks.toTraditional.mockClear()
        chineseMocks.toSimplified.mockClear()
        chineseMocks.getPinyin.mockClear()
        chineseMocks.getFirstLetter.mockClear()
    })

    function outputValue(w: VueWrapper): string {
        return (w.findAll('.tool-textarea')[1].element as HTMLTextAreaElement).value
    }

    function inputSet(w: VueWrapper, value: string): Promise<void> {
        return w.findAll('.tool-textarea')[0].setValue(value)
    }

    it('默认繁简标签页：转繁体与转简体分派到对应纯函数', async () => {
        wrapper = mount(ChineseTextTool, { props: { workAreaWidth: '520px' } })

        expect(wrapper.findAll('.tab-btn')).toHaveLength(2)
        expect(wrapper.find('.tab-btn-active').text()).toBe('繁简互转')
        expect((wrapper.find('.plugin-tools-theme').element as HTMLElement).style.width).toBe(
            '520px'
        )

        await inputSet(wrapper, '汉字')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(chineseMocks.toTraditional).toHaveBeenCalledWith('汉字')
        expect(outputValue(wrapper)).toBe('繁:汉字')

        await wrapper.findAll('.tool-btn')[1].trigger('click')
        expect(chineseMocks.toSimplified).toHaveBeenCalledWith('汉字')
        expect(outputValue(wrapper)).toBe('简:汉字')
    })

    it('切换到拼音标签页后分派转拼音与首字母（异步结果）', async () => {
        wrapper = mount(ChineseTextTool)
        await inputSet(wrapper, '白泽')

        await wrapper.findAll('.tab-btn')[1].trigger('click')
        expect(wrapper.find('.tab-btn-active').text()).toBe('汉字转拼音')

        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()
        expect(chineseMocks.getPinyin).toHaveBeenCalledWith('白泽')
        expect(outputValue(wrapper)).toBe('拼音:白泽')

        await wrapper.findAll('.tool-btn')[1].trigger('click')
        await flushPromises()
        expect(chineseMocks.getFirstLetter).toHaveBeenCalledWith('白泽')
        expect(outputValue(wrapper)).toBe('首字母:白泽')
    })

    it('复制按钮把输出写入剪贴板', async () => {
        wrapper = mount(ChineseTextTool)
        await inputSet(wrapper, '测试')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        // 最后一个 .tool-btn 是复制按钮
        const buttons = wrapper.findAll('.tool-btn')
        await buttons[buttons.length - 1].trigger('click')

        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith('繁:测试')
    })
})
