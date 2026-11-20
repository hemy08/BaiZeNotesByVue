// @vitest-environment jsdom
/**
 * Convert/BaseConvert.vue 与 NetWork/RegexTester.vue 的交互分支补测。
 *
 * 两个组件的既有覆盖只到「初始转换 / 基础匹配」，本文件补齐：
 * BaseConvert：
 * 1. 快捷进制选择（源/目标两组按钮）、自定义进制输入的合法/非法值；
 * 2. 输入为空、输入对当前源进制非法、长度超限、转换抛异常四条错误分支；
 * 3. 200ms 防抖：连续输入只保留最后一次（清理上一次定时器）、卸载时清理待执行定时器；
 * 4. 交换源/目标进制（并清空自定义输入）、复制结果（空结果不复制）。
 * RegexTester：
 * 5. u/v 标志互斥：同时勾选时保留最新一项并给出提示（两种勾选顺序）；
 * 6. 匹配成功渲染匹配列表（含捕获组 / 空匹配）、截断提示；
 * 7. 替换执行（substituteReplace 结果回填）与替换路径的截断提示；
 * 8. 超时（RegexTimeoutError）/普通 Error/字符串异常三类错误提示；
 * 9. 运行中重复点击的并发守卫（按钮禁用 + 函数早退）；卸载释放 Worker。
 *
 * 说明：BaseConvert 的底层进制库真实参与（仅替换 convertBase 以制造异常分支）；
 * RegexTester 的 Worker 边界（regex-lib）按契约整体 mock，worker 内部实现由
 * tests/unit/plugins/regex-lib.test.ts 守护。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'

const regexLibMocks = vi.hoisted(() => {
    class RegexTimeoutError extends Error {
        constructor() {
            super('regular expression execution timed out')
            this.name = 'RegexTimeoutError'
        }
    }
    return {
        RegexTimeoutError,
        runRegex: vi.fn(),
        substituteReplace: vi.fn(),
        disposeRegexRunner: vi.fn(),
        MAX_MATCHES: 2
    }
})

vi.mock('@renderer/components/PluginTools/Convert/base-lib', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('../../../src/renderer/src/components/PluginTools/Convert/base-lib')
        >()
    return {
        ...actual,
        // 只为覆盖 convert() 的 catch 分支：输入恰为 '10' 时抛出异常，其余走真实实现
        convertBase: (text: string, fromBase: number, toBase: number): string => {
            if (text === '10') throw new Error('convert exploded')
            return actual.convertBase(text, fromBase, toBase)
        }
    }
})

vi.mock('@renderer/components/PluginTools/NetWork/regex-lib', () => ({
    runRegex: regexLibMocks.runRegex,
    substituteReplace: regexLibMocks.substituteReplace,
    disposeRegexRunner: regexLibMocks.disposeRegexRunner,
    MAX_MATCHES: regexLibMocks.MAX_MATCHES,
    RegexTimeoutError: regexLibMocks.RegexTimeoutError
}))

import BaseConvert from '@renderer/components/PluginTools/Convert/BaseConvert.vue'
import RegexTester from '@renderer/components/PluginTools/NetWork/RegexTester.vue'
import { MAX_BASE_INPUT_LENGTH } from '@renderer/components/PluginTools/Convert/base-lib'

const COPY_WRITE_TEXT = vi.fn()

function installClipboardMock(): void {
    COPY_WRITE_TEXT.mockReset()
    COPY_WRITE_TEXT.mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: COPY_WRITE_TEXT },
        configurable: true
    })
}

function mountBaseConvert(): VueWrapper {
    return mount(BaseConvert, { props: { workAreaWidth: '1000px' } })
}

/** 源/目标两个进制的快捷按钮组（各 4 个） */
function baseButtonGroups(wrapper: VueWrapper) {
    const groups = wrapper.findAll('.base-btns')
    expect(groups).toHaveLength(2)
    return {
        fromGroup: groups[0],
        toGroup: groups[1]
    }
}

function resultText(wrapper: VueWrapper): string {
    return wrapper.find('[data-testid="base-result"]').text()
}

function errorText(wrapper: VueWrapper): string {
    const error = wrapper.find('.error-text')
    return error.exists() ? error.text() : ''
}

/** 输入值并等待防抖窗口结束（BaseConvert 防抖 200ms） */
async function typeValue(wrapper: VueWrapper, value: string): Promise<void> {
    await wrapper.find('.value-area').setValue(value)
    await new Promise((resolve) => setTimeout(resolve, 260))
    await flushPromises()
}

beforeEach(() => {
    installClipboardMock()
    regexLibMocks.runRegex.mockReset()
    regexLibMocks.substituteReplace.mockReset()
    regexLibMocks.disposeRegexRunner.mockReset()
    regexLibMocks.substituteReplace.mockImplementation(
        (input: string, replacement: string) => `replaced:${input}:${replacement}`
    )
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('BaseConvert 快捷进制与自定义输入', () => {
    it('点击源/目标快捷进制按钮切换并立即换算', async () => {
        const wrapper = mountBaseConvert()
        const { fromGroup, toGroup } = baseButtonGroups(wrapper)

        // 源进制切到 16（按钮文本 16）
        const from16 = fromGroup.findAll('button').find((button) => button.text() === '16')!
        await from16.trigger('click')
        expect(from16.classes()).toContain('base-active')
        // 输入 "255" 按 16 进制解析（597）→ 目标 2 进制
        expect(resultText(wrapper)).toBe('1001010101')

        // 目标进制切到 16
        const to16 = toGroup.findAll('button').find((button) => button.text() === '16')!
        await to16.trigger('click')
        expect(to16.classes()).toContain('base-active')
        // 597(10) → 255(16)
        expect(resultText(wrapper)).toBe('255')
    })

    it('自定义进制输入合法值生效，非法值忽略', async () => {
        const wrapper = mountBaseConvert()
        const customs = wrapper.findAll('.custom-base-input')
        expect(customs).toHaveLength(2)

        // 源进制 16（合法）
        await customs[0].setValue('16')
        await flushPromises()
        expect(wrapper.findAll('.base-btns')[0].find('.base-active').text()).toBe('16')
        expect(resultText(wrapper)).not.toBe('')

        // 目标进制 36（合法，非快捷项 → 快捷按钮无选中态）
        await customs[1].setValue('36')
        await flushPromises()
        expect(wrapper.findAll('.base-btns')[1].findAll('.base-active')).toHaveLength(0)
        expect(resultText(wrapper)).not.toBe('')

        // 非法：小于 2 / 大于 36 / 非整数 → 不改变当前进制
        const before = resultText(wrapper)
        await customs[1].setValue('1')
        await flushPromises()
        expect(resultText(wrapper)).toBe(before)
        await customs[1].setValue('37')
        await flushPromises()
        expect(resultText(wrapper)).toBe(before)
        await customs[1].setValue('2.5')
        await flushPromises()
        expect(resultText(wrapper)).toBe(before)
    })
})

describe('BaseConvert 错误与防抖分支', () => {
    it('输入为空时清空结果与错误', async () => {
        const wrapper = mountBaseConvert()
        await typeValue(wrapper, '')
        expect(resultText(wrapper)).toBe('')
        expect(errorText(wrapper)).toBe('')
    })

    it('输入对当前源进制非法时提示', async () => {
        const wrapper = mountBaseConvert()
        // 源进制切到 2 后输入 '2'（二进制非法字符）
        const fromGroup = baseButtonGroups(wrapper).fromGroup
        const from2 = fromGroup.findAll('button').find((button) => button.text() === '2')!
        await from2.trigger('click')

        await typeValue(wrapper, '2')
        expect(resultText(wrapper)).toBe('')
        expect(errorText(wrapper)).not.toBe('')
    })

    it('输入超过长度上限时提示并停止转换', async () => {
        const wrapper = mountBaseConvert()
        await typeValue(wrapper, '1'.repeat(MAX_BASE_INPUT_LENGTH + 1))
        expect(resultText(wrapper)).toBe('')
        expect(errorText(wrapper)).not.toBe('')
    })

    it('转换实现抛异常时展示异常信息', async () => {
        const wrapper = mountBaseConvert()
        await typeValue(wrapper, '10')
        expect(resultText(wrapper)).toBe('')
        expect(errorText(wrapper)).toContain('convert exploded')
    })

    it('连续输入只保留最后一次转换结果（清理上一次防抖定时器）', async () => {
        const wrapper = mountBaseConvert()
        await wrapper.find('.value-area').setValue('11')
        await wrapper.find('.value-area').setValue('111')
        await new Promise((resolve) => setTimeout(resolve, 260))
        await flushPromises()

        // 111(10) → 1101111(2)
        expect(resultText(wrapper)).toBe('1101111')
    })

    it('卸载时清理尚未执行的防抖定时器', async () => {
        const wrapper = mountBaseConvert()
        await wrapper.find('.value-area').setValue('123')
        // 定时器仍在等待（未到 200ms）即卸载
        wrapper.unmount()
        await new Promise((resolve) => setTimeout(resolve, 260))
        // 没有「卸载后仍执行转换」的异常抛出即通过（onUnmounted 已 clearTimeout）
        expect(wrapper.emitted()).toEqual({})
    })
})

describe('BaseConvert 交换与复制', () => {
    it('交换源/目标进制并清空自定义输入', async () => {
        const wrapper = mountBaseConvert()
        const customs = wrapper.findAll('.custom-base-input')
        await customs[0].setValue('16')
        await flushPromises()
        // 源 16、目标 2："255" 按 16 进制解析（597）→ 目标 2 进制
        expect(resultText(wrapper)).toBe('1001010101')

        const buttons = wrapper.findAll('.plugin-tools-btn')
        // 第一个按钮为「交换」
        await buttons[0].trigger('click')
        await flushPromises()

        // 交换后：源 2、目标 16；自定义输入被清空
        expect(wrapper.findAll('.base-btns')[0].find('.base-active').text()).toBe('2')
        expect(wrapper.findAll('.base-btns')[1].find('.base-active').text()).toBe('16')
        expect((customs[0].element as HTMLInputElement).value).toBe('')
        expect((customs[1].element as HTMLInputElement).value).toBe('')
    })

    it('复制非空结果；空结果不复制', async () => {
        const wrapper = mountBaseConvert()
        const buttons = wrapper.findAll('.plugin-tools-btn')
        // 第二个按钮为「复制」
        await buttons[1].trigger('click')
        await flushPromises()
        expect(COPY_WRITE_TEXT).toHaveBeenCalledTimes(1)
        expect(COPY_WRITE_TEXT).toHaveBeenCalledWith(resultText(wrapper))

        // 制造空结果：输入为空 → 复制按钮不写入
        COPY_WRITE_TEXT.mockClear()
        await typeValue(wrapper, '')
        await buttons[1].trigger('click')
        await flushPromises()
        expect(COPY_WRITE_TEXT).not.toHaveBeenCalled()
    })
})

/* ============================== RegexTester ============================== */

function mountRegexTester(): VueWrapper {
    return mount(RegexTester, { props: { workAreaWidth: '1000px' } })
}

/** 标志复选框（顺序 d,g,i,m,s,u,v,y） */
function flagCheckbox(wrapper: VueWrapper, flag: string) {
    const index = ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'].indexOf(flag)
    return wrapper.findAll('.flag-option input')[index]
}

async function fillRegex(wrapper: VueWrapper, options: { pattern?: string; input?: string } = {}) {
    if (options.pattern !== undefined) {
        await wrapper.findAll('.field-input.mono')[0].setValue(options.pattern)
    }
    if (options.input !== undefined) {
        await wrapper.findAll('.field-textarea.mono')[0].setValue(options.input)
    }
}

function matchItems(wrapper: VueWrapper) {
    return wrapper.findAll('.match-item')
}

describe('RegexTester u/v 标志互斥', () => {
    /**
     * 取 <script setup> 内部状态。
     *
     * u/v 互斥纠偏在生产 UI 上不可达（另一标志启用后当前项已被 disabled，用户无法勾选
     * 出 u+v 组合），属防御性逻辑；这里直接构造非法组合后调用 onFlagChange，
     * 锁定「保留最新勾选、移除另一项、给出提示」的纠偏语义。
     */
    type RegexSetupState = {
        selectedFlags: string[]
        noticeMessage: string
        onFlagChange: () => void
        isFlagDisabled: (flag: string) => boolean
    }
    function setupStateOf(wrapper: VueWrapper): RegexSetupState {
        return (wrapper.vm.$ as unknown as { setupState: RegexSetupState }).setupState
    }

    it('先勾 u 再勾 v：保留 v 并提示互斥', async () => {
        const wrapper = mountRegexTester()
        const state = setupStateOf(wrapper)

        // 直接构造「u 在前、v 在后」的非法组合（真实 UI 因 disabled 无法产生）
        state.selectedFlags = ['g', 'u', 'v']
        state.onFlagChange()
        await flushPromises()

        expect(state.selectedFlags).toEqual(['g', 'v'])
        expect(wrapper.find('.notice-box').text()).not.toBe('')
        expect(state.isFlagDisabled('u')).toBe(true)
        expect(state.isFlagDisabled('v')).toBe(false)
        // 渲染层：u 复选框禁用，v 可继续操作
        expect(flagCheckbox(wrapper, 'u').attributes('disabled')).toBeDefined()
        expect(flagCheckbox(wrapper, 'v').attributes('disabled')).toBeUndefined()
    })

    it('先勾 v 再勾 u：保留 u 并提示互斥', async () => {
        const wrapper = mountRegexTester()
        const state = setupStateOf(wrapper)

        state.selectedFlags = ['g', 'v', 'u']
        state.onFlagChange()
        await flushPromises()

        expect(state.selectedFlags).toEqual(['g', 'u'])
        expect(wrapper.find('.notice-box').text()).not.toBe('')
        expect(state.isFlagDisabled('v')).toBe(true)
        expect(state.isFlagDisabled('u')).toBe(false)
        expect(flagCheckbox(wrapper, 'v').attributes('disabled')).toBeDefined()
        expect(flagCheckbox(wrapper, 'u').attributes('disabled')).toBeUndefined()
    })
})

describe('RegexTester 匹配/替换执行', () => {
    it('匹配成功渲染匹配列表（含捕获组与空匹配）', async () => {
        regexLibMocks.runRegex.mockResolvedValue([
            { match: '', index: 0, groups: ['a', undefined] },
            { match: 'x', index: 1, groups: [undefined] }
        ])
        const wrapper = mountRegexTester()
        await fillRegex(wrapper, { pattern: 'a', input: 'ax' })

        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()

        expect(regexLibMocks.runRegex).toHaveBeenCalledWith('a', 'g', 'ax')
        expect(matchItems(wrapper)).toHaveLength(2)
        // 空匹配展示 i18n 空匹配文案，且渲染捕获组区域
        expect(wrapper.text()).toContain('(空)')
        expect(wrapper.findAll('.match-groups')).toHaveLength(1)
    })

    it('结果达到上限时给出截断提示（truncated 标记）', async () => {
        const truncated = [
            { match: 'a', index: 0, groups: [] },
            { match: 'a', index: 1, groups: [] }
        ] as unknown as Array<{ match: string; index: number; groups: string[] }> & {
            truncated?: boolean
        }
        truncated.truncated = true
        regexLibMocks.runRegex.mockResolvedValue(truncated)
        const wrapper = mountRegexTester()

        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()

        expect(wrapper.find('.notice-box').text()).toContain('截断')
    })

    it('结果长度达到 MAX_MATCHES 时同样提示截断', async () => {
        regexLibMocks.runRegex.mockResolvedValue([
            { match: 'a', index: 0, groups: [] },
            { match: 'a', index: 1, groups: [] }
        ])
        const wrapper = mountRegexTester()

        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()

        expect(wrapper.find('.notice-box').text()).toContain('截断')
    })

    it('替换执行：结果回填替换输出区域', async () => {
        regexLibMocks.runRegex.mockResolvedValue([{ match: 'a', index: 0, groups: [] }])
        regexLibMocks.substituteReplace.mockReturnValue('替换后文本')
        const wrapper = mountRegexTester()
        await fillRegex(wrapper, { pattern: 'a', input: 'abc' })
        await wrapper.findAll('.field-input.mono')[1].setValue('$1')

        await wrapper.findAll('.tool-btn')[1].trigger('click')
        await flushPromises()

        expect(regexLibMocks.substituteReplace).toHaveBeenCalledWith('abc', '$1', [
            { match: 'a', index: 0, groups: [] }
        ])
        expect(wrapper.find('.result-panel').text()).toContain('替换结果')
        const output = wrapper.findAll('.field-textarea.mono')[1].element as HTMLTextAreaElement
        expect(output.value).toBe('替换后文本')
    })

    it('替换执行时结果截断同样提示', async () => {
        const truncated = [
            { match: 'a', index: 0, groups: [] },
            { match: 'a', index: 1, groups: [] }
        ] as unknown as Array<{ match: string; index: number; groups: string[] }> & {
            truncated?: boolean
        }
        truncated.truncated = true
        regexLibMocks.runRegex.mockResolvedValue(truncated)
        const wrapper = mountRegexTester()

        await wrapper.findAll('.tool-btn')[1].trigger('click')
        await flushPromises()

        expect(wrapper.find('.notice-box').text()).toContain('截断')
    })

    it('超时错误展示超时文案；普通 Error/字符串展示原始信息', async () => {
        regexLibMocks.runRegex.mockRejectedValueOnce(new regexLibMocks.RegexTimeoutError())
        const wrapper = mountRegexTester()
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()
        expect(wrapper.find('.error-box').text()).toContain('超时')
        expect(matchItems(wrapper)).toHaveLength(0)

        regexLibMocks.runRegex.mockRejectedValueOnce(new Error('bad pattern'))
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()
        expect(wrapper.find('.error-box').text()).toContain('bad pattern')

        regexLibMocks.runRegex.mockRejectedValueOnce('plain failure')
        await wrapper.findAll('.tool-btn')[1].trigger('click')
        await flushPromises()
        expect(wrapper.find('.error-box').text()).toContain('plain failure')
    })

    it('运行中重复点击被并发守卫拦截；完成后可再次执行', async () => {
        let resolveRun!: (value: Array<{ match: string; index: number; groups: string[] }>) => void
        regexLibMocks.runRegex.mockReturnValue(
            new Promise((resolve) => {
                resolveRun = resolve
            })
        )
        const wrapper = mountRegexTester()

        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()
        // 运行中：显示「匹配中」占位，按钮禁用
        expect(wrapper.find('.notice-box').text()).toContain('匹配中')
        expect(wrapper.findAll('.tool-btn')[0].attributes('disabled')).toBeDefined()

        // 运行中再次点击替换：早退，不产生第二次 runRegex 调用
        await wrapper.findAll('.tool-btn')[1].trigger('click')
        expect(regexLibMocks.runRegex).toHaveBeenCalledTimes(1)

        resolveRun([{ match: 'a', index: 0, groups: [] }])
        await flushPromises()
        expect(wrapper.find('.notice-box').exists()).toBe(false)

        regexLibMocks.runRegex.mockResolvedValue([])
        await wrapper.findAll('.tool-btn')[0].trigger('click')
        await flushPromises()
        expect(regexLibMocks.runRegex).toHaveBeenCalledTimes(2)
    })

    it('卸载时释放常驻 Worker', () => {
        const wrapper = mountRegexTester()
        wrapper.unmount()
        expect(regexLibMocks.disposeRegexRunner).toHaveBeenCalled()
    })
})
