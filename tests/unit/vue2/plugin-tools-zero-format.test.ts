// @vitest-environment jsdom
/**
 * 插件工具 0% 组件补测（第二批，语句覆盖 0% 盲区）：
 * 1. `PluginTools/MiscTools/Calculator.vue`（34 语句/9 函数）——按键布局与显示名映射、
 *    追加/退格/清空、求值与连续运算、除零错误提示、输入长度上限；
 * 2. `PluginTools/TextTools/TextDiff.vue`（29 语句/3 函数）——并排行号渲染、
 *    相等/新增/删除三类行、输入过大降级提示、重新比对清除提示；
 * 3. `PluginTools/FormatTools/JsonTool.vue`（27 语句/12 函数）——三标签页分派、
 *    格式化/压缩/转义/去转义、非法 JSON 错误提示与切换标签清错、复制输出；
 * 4. `PluginTools/FormatTools/XmlFormatter.vue`（24 语句/5 函数）——格式/压缩标签页、
 *    缩进选择、非法 XML 错误提示、复制输出。
 *
 * 依赖边界：纯函数库（calculator-lib / text-diff-lib / json-tool-lib）与
 * xml-format-lib 均跑真实实现（其分支已由 tests/unit/plugins/* 覆盖），
 * 仅剪贴板封装做契约 mock；本文件只验证组件自身的状态与事件接线。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

const clipboardMocks = vi.hoisted(() => ({
    copyTextToClipboard: vi.fn().mockResolvedValue(true)
}))

vi.mock('@renderer/common/clipboard', () => clipboardMocks)

import { setLocale } from '@renderer/common/i18n'
import Calculator from '@renderer/components/PluginTools/MiscTools/Calculator.vue'
import TextDiff from '@renderer/components/PluginTools/TextTools/TextDiff.vue'
import JsonTool from '@renderer/components/PluginTools/FormatTools/JsonTool.vue'
import XmlFormatter from '@renderer/components/PluginTools/FormatTools/XmlFormatter.vue'

let wrapper: VueWrapper | null = null

beforeEach(() => {
    setLocale('zh-CN')
    clipboardMocks.copyTextToClipboard.mockClear()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
})

/** 按可见文本找按钮并点击（按键区按钮文本即显示名，如 × / ÷） */
async function clickButtonByText(w: VueWrapper, text: string): Promise<void> {
    const button = w.findAll('button').find((item) => item.text() === text)
    expect(button, `未找到按钮：${text}`).toBeTruthy()
    await button!.trigger('click')
}

describe('Calculator.vue 计算器面板', () => {
    function displayValue(w: VueWrapper): string {
        return w.find('[data-testid="calc-display"]').text()
    }

    it('初始渲染空表达式，workAreaWidth prop 生效', () => {
        wrapper = mount(Calculator, { props: { workAreaWidth: '520px' } })

        expect(wrapper.find('.header-display-center').text()).toContain('计算器')
        expect(displayValue(wrapper)).toBe('')
        expect((wrapper.find('.plugin-tools-theme').element as HTMLElement).style.width).toBe(
            '520px'
        )
        // 4 列 5 行按键 + 清空/退格共 22 个按钮
        expect(wrapper.findAll('.key')).toHaveLength(22)
        expect(wrapper.findAll('.key-op')).toHaveLength(6)
        expect(wrapper.findAll('.key-equal')).toHaveLength(1)
    })

    it('按键显示名映射：× / ÷ / 等号中文，乘除键追加表达式字符', async () => {
        wrapper = mount(Calculator)

        expect(wrapper.find('.key-equal').text()).toBe('=')
        await clickButtonByText(wrapper, '×')
        await clickButtonByText(wrapper, '÷')
        expect(displayValue(wrapper)).toBe('*/')
    })

    it('数字与运算符追加、等号求值并支持连续运算', async () => {
        wrapper = mount(Calculator)

        await clickButtonByText(wrapper, '1')
        await clickButtonByText(wrapper, '+')
        await clickButtonByText(wrapper, '2')
        await clickButtonByText(wrapper, '=')
        expect(displayValue(wrapper)).toBe('3')

        // 结果作为新表达式起点继续运算
        await clickButtonByText(wrapper, '×')
        await clickButtonByText(wrapper, '4')
        await clickButtonByText(wrapper, '=')
        expect(displayValue(wrapper)).toBe('12')
    })

    it('精度归一：0.1+0.2 显示为 0.3（toPrecision(12)）', async () => {
        wrapper = mount(Calculator)
        for (const key of ['0', '.', '1', '+', '0', '.', '2', '=']) {
            await clickButtonByText(wrapper, key)
        }
        expect(displayValue(wrapper)).toBe('0.3')
    })

    it('空表达式按等号不进入求值（不报错）', async () => {
        wrapper = mount(Calculator)
        await clickButtonByText(wrapper, '=')
        expect(displayValue(wrapper)).toBe('')
        expect(wrapper.find('.error-text').exists()).toBe(false)
    })

    it('除零错误展示错误提示，继续按键后自动清除', async () => {
        wrapper = mount(Calculator)
        await clickButtonByText(wrapper, '1')
        await clickButtonByText(wrapper, '÷')
        await clickButtonByText(wrapper, '0')
        await clickButtonByText(wrapper, '=')
        expect(wrapper.find('.error-text').text()).toContain('除零')

        await clickButtonByText(wrapper, '2')
        expect(wrapper.find('.error-text').exists()).toBe(false)
        expect(displayValue(wrapper)).toBe('1/02')
    })

    it('退格删除最后一个字符，清空按钮复位表达式与错误', async () => {
        wrapper = mount(Calculator)
        await clickButtonByText(wrapper, '1')
        await clickButtonByText(wrapper, '2')
        // 清空/退格按钮带 key-clear 类，按类定位避免文案歧义
        await wrapper.findAll('.key-clear')[1].trigger('click')
        expect(displayValue(wrapper)).toBe('1')

        await wrapper.findAll('.key-clear')[0].trigger('click')
        expect(displayValue(wrapper)).toBe('')
    })

    it('表达式长度上限 200：超出后按键不再追加', async () => {
        wrapper = mount(Calculator)
        for (let index = 0; index < 205; index += 1) {
            await clickButtonByText(wrapper, '0')
        }
        expect(displayValue(wrapper).length).toBe(200)
    })
})

describe('TextDiff.vue 文本比对面板', () => {
    function textareas(w: VueWrapper) {
        return w.findAll('.tool-textarea')
    }

    it('初始渲染工作区宽度与空结果区', () => {
        wrapper = mount(TextDiff, { props: { workAreaWidth: '600px' } })
        expect((wrapper.find('.plugin-tools-theme').element as HTMLElement).style.width).toBe(
            '600px'
        )
        expect(textareas(wrapper)).toHaveLength(2)
        expect(wrapper.find('.diff-grid').exists()).toBe(false)
    })

    it('相同文本比对：全部为 equal 行并显示左右行号', async () => {
        wrapper = mount(TextDiff)
        await textareas(wrapper)[0].setValue('第一行\n第二行')
        await textareas(wrapper)[1].setValue('第一行\n第二行')
        await wrapper.find('.tool-btn').trigger('click')

        expect(wrapper.findAll('.diff-row')).toHaveLength(2)
        expect(wrapper.findAll('.diff-row-equal')).toHaveLength(2)
        expect(wrapper.findAll('.diff-lineno').map((node) => node.text())).toEqual([
            '1',
            '1',
            '2',
            '2'
        ])
    })

    it('删除行标 -、新增行标 +，并分别只在对应侧渲染内容', async () => {
        wrapper = mount(TextDiff)
        await textareas(wrapper)[0].setValue('keep\nremoved')
        await textareas(wrapper)[1].setValue('keep\nadded')
        await wrapper.find('.tool-btn').trigger('click')

        expect(wrapper.findAll('.diff-row')).toHaveLength(3)
        expect(wrapper.findAll('.diff-row-equal')).toHaveLength(1)
        expect(wrapper.findAll('.diff-row-remove')).toHaveLength(1)
        expect(wrapper.findAll('.diff-row-add')).toHaveLength(1)

        const removeRow = wrapper.find('.diff-row-remove')
        expect(removeRow.find('.diff-mark').text()).toBe('-')
        expect(removeRow.findAll('.diff-line')[0].text()).toBe('removed')
        expect(removeRow.findAll('.diff-line')[1].text()).toBe('')

        const addRow = wrapper.find('.diff-row-add')
        expect(addRow.find('.diff-mark').text()).toBe('+')
        expect(addRow.findAll('.diff-line')[0].text()).toBe('')
        expect(addRow.findAll('.diff-line')[1].text()).toBe('added')
    })

    it('输入过大（DIFF_TOO_LARGE）时只显示提示，不渲染明细', async () => {
        wrapper = mount(TextDiff)
        const bigLeft = Array.from({ length: 2001 }, () => 'a').join('\n')
        const bigRight = Array.from({ length: 2001 }, () => 'b').join('\n')
        await textareas(wrapper)[0].setValue(bigLeft)
        await textareas(wrapper)[1].setValue(bigRight)
        await wrapper.find('.tool-btn').trigger('click')

        expect(wrapper.find('.notice-box').text()).toContain('过大')
        expect(wrapper.find('.diff-grid').exists()).toBe(false)
    })

    it('重新比对清除上一次的过大提示', async () => {
        wrapper = mount(TextDiff)
        const bigLeft = Array.from({ length: 2001 }, () => 'a').join('\n')
        const bigRight = Array.from({ length: 2001 }, () => 'b').join('\n')
        await textareas(wrapper)[0].setValue(bigLeft)
        await textareas(wrapper)[1].setValue(bigRight)
        await wrapper.find('.tool-btn').trigger('click')
        expect(wrapper.find('.notice-box').exists()).toBe(true)

        await textareas(wrapper)[0].setValue('a')
        await textareas(wrapper)[1].setValue('b')
        await wrapper.find('.tool-btn').trigger('click')
        expect(wrapper.find('.notice-box').exists()).toBe(false)
        expect(wrapper.findAll('.diff-row')).toHaveLength(2)
    })
})

describe('JsonTool.vue JSON 工具面板', () => {
    function inputTextarea(w: VueWrapper) {
        return w.findAll('.tool-textarea')[0]
    }
    function outputTextarea(w: VueWrapper) {
        return w.findAll('.tool-textarea')[1]
    }
    function outputValue(w: VueWrapper): string {
        return (outputTextarea(w).element as HTMLTextAreaElement).value
    }

    it('默认格式化标签页：合法 JSON 输出 2 空格缩进', async () => {
        wrapper = mount(JsonTool, { props: { workAreaWidth: '560px' } })
        expect(wrapper.findAll('.tab-btn')).toHaveLength(3)
        expect(wrapper.find('.tab-btn-active').text()).toBe('格式化')

        await inputTextarea(wrapper).setValue('{"b":1,"a":[1,2]}')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(outputValue(wrapper)).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}')
    })

    it('非法 JSON 展示含位置信息的错误，切换标签页清空错误', async () => {
        wrapper = mount(JsonTool)
        await inputTextarea(wrapper).setValue('{a:1}')
        await wrapper.findAll('.tool-btn')[0].trigger('click')

        expect(wrapper.find('.error-box').text()).toContain('第 1 行')
        // 失败时输出保持为空
        expect(outputValue(wrapper)).toBe('')

        await wrapper.findAll('.tab-btn')[1].trigger('click')
        expect(wrapper.find('.error-box').exists()).toBe(false)
        expect(wrapper.find('.tab-btn-active').text()).toBe('压缩')
    })

    it('压缩标签页输出无空白 JSON', async () => {
        wrapper = mount(JsonTool)
        await wrapper.findAll('.tab-btn')[1].trigger('click')
        await inputTextarea(wrapper).setValue('{ "a" : 1 ,\n  "b" : [ 1, 2 ] }')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(outputValue(wrapper)).toBe('{"a":1,"b":[1,2]}')
    })

    it('转义/去转义标签页：两个按钮分派到对应纯函数', async () => {
        wrapper = mount(JsonTool)
        await wrapper.findAll('.tab-btn')[2].trigger('click')
        expect(wrapper.findAll('.tool-btn')).toHaveLength(3) // 转义、去转义、复制

        await inputTextarea(wrapper).setValue('a"b\nc')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(outputValue(wrapper)).toBe('a\\"b\\nc')

        await wrapper.findAll('.tool-btn')[1].trigger('click')
        expect(outputValue(wrapper)).toBe('a"b\nc')
    })

    it('复制按钮把输出写入剪贴板', async () => {
        wrapper = mount(JsonTool)
        await inputTextarea(wrapper).setValue('{"a":1}')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        const buttons = wrapper.findAll('.tool-btn')
        await buttons[buttons.length - 1].trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith('{\n  "a": 1\n}')
    })
})

describe('XmlFormatter.vue XML 格式化面板', () => {
    function inputTextarea(w: VueWrapper) {
        return w.findAll('.tool-textarea')[0]
    }
    function outputTextarea(w: VueWrapper) {
        return w.findAll('.tool-textarea')[1]
    }
    function outputValue(w: VueWrapper): string {
        return (outputTextarea(w).element as HTMLTextAreaElement).value
    }

    it('默认格式标签页：2 空格缩进格式化', async () => {
        wrapper = mount(XmlFormatter, { props: { workAreaWidth: '560px' } })
        expect(wrapper.findAll('.tab-btn')).toHaveLength(2)
        expect(wrapper.find('.tab-btn-active').text()).toBe('格式化')
        expect((wrapper.find('.indent-select').element as HTMLSelectElement).value).toBe('2')

        await inputTextarea(wrapper).setValue('<root><a>1</a></root>')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(outputValue(wrapper)).toBe('<root>\n  <a>1</a>\n</root>')
    })

    it('缩进选择 4 空格后格式化按 4 空格缩进', async () => {
        wrapper = mount(XmlFormatter)
        await wrapper.find('.indent-select').setValue('4')
        await inputTextarea(wrapper).setValue('<root><a>1</a></root>')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(outputValue(wrapper)).toBe('<root>\n    <a>1</a>\n</root>')
    })

    it('非法 XML 展示错误提示；切换压缩页清错并压缩', async () => {
        wrapper = mount(XmlFormatter)
        await inputTextarea(wrapper).setValue('<root><a></root>')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(wrapper.find('.error-box').exists()).toBe(true)
        expect(outputValue(wrapper)).toBe('')

        await wrapper.findAll('.tab-btn')[1].trigger('click')
        expect(wrapper.find('.error-box').exists()).toBe(false)
        expect(wrapper.find('.indent-row').exists()).toBe(false)

        await inputTextarea(wrapper).setValue('<root>\n  <a>1</a>\n</root>')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        expect(outputValue(wrapper)).toBe('<root><a>1</a></root>')
    })

    it('复制按钮把输出写入剪贴板', async () => {
        wrapper = mount(XmlFormatter)
        await inputTextarea(wrapper).setValue('<root><a>1</a></root>')
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        const buttons = wrapper.findAll('.tool-btn')
        await buttons[buttons.length - 1].trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith(
            '<root>\n  <a>1</a>\n</root>'
        )
    })
})
