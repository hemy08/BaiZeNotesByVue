// @vitest-environment jsdom
/**
 * 正则测试异步 API 单元测试（P1-1 防回归：主线程灾难性回溯冻结修复）
 *
 * 被测模块：
 *   - src/renderer/src/components/PluginTools/NetWork/regex-lib.ts（主线程异步 API：
 *     Worker 池 + 3 秒时间预算 + 超时 terminate 重建）；
 *   - .../regex-worker.ts（worker 协议 handleRegexRequest，纯函数直接覆盖）；
 *   - .../RegexTester.vue（「匹配中 / 超时」状态与按钮禁用）。
 *
 * Worker 隔离策略：vitest（jsdom）无真实 Worker，用 vi.stubGlobal('Worker', MockRegexWorker)
 * 注入协议级桩——postMessage 内调用真实 handleRegexRequest 回填 onmessage，从而在不启动
 * 真实线程的前提下覆盖「主线程 ↔ worker」完整链路；超时路径用 vi.useFakeTimers 推进预算。
 * （参考既有 worker mock 风格：tests/unit/monaco-worker-setup.test.ts 的 ?worker mock 构造器。）
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
    runRegex,
    substituteReplace,
    disposeRegexRunner,
    MAX_MATCHES,
    REGEX_EXEC_TIMEOUT_MS,
    RegexTimeoutError
} from '@renderer/components/PluginTools/NetWork/regex-lib'
import {
    handleRegexRequest,
    type RegexWorkerRequest
} from '@renderer/components/PluginTools/NetWork/regex-worker'
import RegexTester from '@renderer/components/PluginTools/NetWork/RegexTester.vue'

/**
 * Worker 全局桩：
 *   - 默认同步响应（postMessage 内执行真实 handleRegexRequest 并回填 onmessage）；
 *   - noResponse：不响应（验证「匹配中」状态与超时 terminate）；
 *   - forceError：统一回传指定错误（验证错误通道透传）；
 *   - respondLast：手动补发最近一次请求的响应（验证状态恢复）。
 */
class MockRegexWorker {
    static noResponse = false
    static forceError: string | null = null
    static instances: MockRegexWorker[] = []

    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    readonly posted: RegexWorkerRequest[] = []
    terminated = false

    constructor() {
        MockRegexWorker.instances.push(this)
    }

    postMessage(request: RegexWorkerRequest): void {
        this.posted.push(request)
        if (MockRegexWorker.noResponse) return
        const payload =
            MockRegexWorker.forceError !== null
                ? { id: request.id, error: MockRegexWorker.forceError }
                : handleRegexRequest(request)
        this.onmessage?.({ data: payload } as unknown as MessageEvent)
    }

    /** 手动补发最近一次请求的响应（验证「匹配中」→ 完成的状态恢复） */
    respondLast(): void {
        const request = this.posted[this.posted.length - 1]
        if (!request) return
        this.onmessage?.({ data: handleRegexRequest(request) } as unknown as MessageEvent)
    }

    terminate(): void {
        this.terminated = true
    }

    static reset(): void {
        MockRegexWorker.noResponse = false
        MockRegexWorker.forceError = null
        MockRegexWorker.instances = []
    }
}

beforeEach(() => {
    MockRegexWorker.reset()
    vi.stubGlobal('Worker', MockRegexWorker)
})

afterEach(() => {
    // 释放常驻 worker，避免桩实例跨用例串扰；恢复真实计时器
    disposeRegexRunner()
    vi.useRealTimers()
})

afterAll(() => {
    vi.unstubAllGlobals()
})

describe('正则测试异步 API（regex-lib，P1-1 Worker 隔离）', () => {
    it('g 全局多匹配：返回每条匹配的文本与位置', async () => {
        const result = await runRegex('\\w+', 'g', 'hello world')
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ match: 'hello', index: 0 })
        expect(result[1]).toMatchObject({ match: 'world', index: 6 })
    })

    it('捕获组内容正确（数字组与命名组）', async () => {
        const result = await runRegex('(\\w)(\\d)', 'g', 'a1b2')
        expect(result).toHaveLength(2)
        expect(result[0].match).toBe('a1')
        expect(result[0].groups).toEqual(['a', '1'])
        expect(result[0].index).toBe(0)
        expect(result[1].groups).toEqual(['b', '2'])

        const named = await runRegex('(?<word>\\w+)', 'g', 'hi you')
        expect(named[0].namedGroups).toEqual({ word: 'hi' })
    })

    it('零宽匹配不卡死：lastIndex 手动推进', async () => {
        const result = await runRegex('', 'g', 'abc')
        expect(result).toHaveLength(4) // 位置 0/1/2/3 各一个空匹配
        expect(result.map((m) => m.index)).toEqual([0, 1, 2, 3])
    })

    it('unicode 模式下零宽匹配跳过代理对', async () => {
        // '𝄞' 为代理对（2 个 UTF-16 码元），u 下空匹配只在码元 0 与 2
        const result = await runRegex('', 'gu', '𝄞')
        expect(result).toHaveLength(2)
        expect(result.map((m) => m.index)).toEqual([0, 2])
    })

    it('语法 / 长度 / 标志错误在主线程前置校验，不创建 worker', async () => {
        await expect(runRegex('(', 'g', 'abc')).rejects.toThrow(/括号|分组|语法/)
        await expect(runRegex('[a-', 'g', 'abc')).rejects.toThrow(/字符类/)
        await expect(runRegex('a', 'uv', 'a')).rejects.toThrow(/互斥|不能同时/)
        await expect(runRegex('a', 'gg', 'a')).rejects.toThrow(/修饰符/)
        await expect(runRegex('a', 'g', 'a'.repeat(200_001))).rejects.toThrow(/超出限制|最长/)
        expect(MockRegexWorker.instances).toHaveLength(0)
    })

    it('匹配数超 5000 截断且 truncated 标志跨线程传递', async () => {
        const result = await runRegex('', 'g', 'x'.repeat(MAX_MATCHES + 10))
        expect(result.length).toBe(MAX_MATCHES)
        expect(result.truncated).toBe(true)
    })

    it('常驻复用同一 worker；disposeRegexRunner 终止并允许重建', async () => {
        await runRegex('a', 'g', 'a')
        await runRegex('b', 'g', 'b')
        expect(MockRegexWorker.instances).toHaveLength(1)
        expect(MockRegexWorker.instances[0].terminated).toBe(false)

        disposeRegexRunner()
        expect(MockRegexWorker.instances[0].terminated).toBe(true)

        const result = await runRegex('a', 'g', 'a')
        expect(result).toHaveLength(1)
        expect(MockRegexWorker.instances).toHaveLength(2)
    })

    it('worker 回传错误时以该信息拒绝（错误通道透传）', async () => {
        MockRegexWorker.forceError = '分组未闭合，请检查左右括号。'
        const caught = await runRegex('a', 'g', 'a').catch((e) => e)
        expect(caught).toBeInstanceOf(Error)
        expect((caught as Error).message).toContain('分组未闭合')
        expect(MockRegexWorker.instances[0].terminated).toBe(false)
    })

    it('超时：时间预算耗尽后终止 worker、拒绝调用并重建（灾难性回溯防护核心）', async () => {
        vi.useFakeTimers()
        MockRegexWorker.noResponse = true
        const pendingError = runRegex('(a+)+$', 'g', 'a'.repeat(100)).catch((e) => e)
        await vi.advanceTimersByTimeAsync(REGEX_EXEC_TIMEOUT_MS)
        const caught = await pendingError
        expect(caught).toBeInstanceOf(RegexTimeoutError)
        expect((caught as Error).message).toMatch(/超时|中止|回溯/)
        expect(MockRegexWorker.instances).toHaveLength(1)
        expect(MockRegexWorker.instances[0].terminated).toBe(true)

        // 超时后自动重建：下一调用创建新 worker 并正常完成
        MockRegexWorker.noResponse = false
        const result = await runRegex('a', 'g', 'aaa')
        expect(result).toHaveLength(3)
        expect(MockRegexWorker.instances).toHaveLength(2)
        expect(MockRegexWorker.instances[1].terminated).toBe(false)
    })

    it('替换：$1 捕获组展开', async () => {
        const matches = await runRegex('(\\w+)', 'g', 'hello world')
        expect(substituteReplace('hello world', '[$1]', matches)).toBe('[hello] [world]')
    })

    it('替换：$$ 输出字面 $，$& 输出完整匹配', async () => {
        expect(substituteReplace('a', '$$', await runRegex('a', 'g', 'a'))).toBe('$')
        expect(substituteReplace('ab', '<$&>', await runRegex('a', 'g', 'ab'))).toBe('<a>b')
    })

    it('替换：零宽匹配逐位置插入且不吞字符', async () => {
        expect(substituteReplace('abc', 'x', await runRegex('', 'g', 'abc'))).toBe('xaxbxcx')
    })
})

describe('regex-worker 协议（handleRegexRequest）', () => {
    it('成功：返回 matches 信封且不置 truncated', () => {
        const response = handleRegexRequest({ id: 7, pattern: '\\w+', flags: 'g', text: 'a b' })
        expect(response.id).toBe(7)
        expect(response.error).toBeUndefined()
        expect(response.truncated).toBeUndefined()
        expect(response.matches).toHaveLength(2)
        expect(response.matches?.[0]).toMatchObject({ match: 'a', index: 0, groups: [] })
    })

    it('语法错误：返回中文错误信息而非抛出', () => {
        const response = handleRegexRequest({ id: 1, pattern: '(', flags: 'g', text: 'abc' })
        expect(response.matches).toBeUndefined()
        expect(response.error).toMatch(/括号|分组|语法/)
    })

    it('匹配数达上限：置 truncated 且数组截断', () => {
        const response = handleRegexRequest({
            id: 2,
            pattern: '',
            flags: 'g',
            text: 'x'.repeat(MAX_MATCHES + 5)
        })
        expect(response.truncated).toBe(true)
        expect(response.matches).toHaveLength(MAX_MATCHES)
    })
})

describe('RegexTester 组件（匹配中 / 超时状态）', () => {
    function mountTester() {
        return mount(RegexTester)
    }

    it('点击测试匹配：后台执行并渲染结果列表', async () => {
        const wrapper = mountTester()
        await wrapper.findAll('input.field-input')[0].setValue('\\w+')
        await wrapper.find('textarea.field-textarea').setValue('hello world')
        await wrapper.findAll('button.tool-btn')[0].trigger('click')
        await flushPromises()
        const items = wrapper.findAll('.match-item')
        expect(items).toHaveLength(2)
        expect(items[0].find('.match-value').text()).toBe('hello')
        wrapper.unmount()
    })

    it('Worker 未响应时显示「匹配中…」并禁用按钮，响应后恢复', async () => {
        MockRegexWorker.noResponse = true
        const wrapper = mountTester()
        await wrapper.findAll('input.field-input')[0].setValue('\\w+')
        await wrapper.find('textarea.field-textarea').setValue('hi you')
        await wrapper.findAll('button.tool-btn')[0].trigger('click')
        await nextTick()

        expect(wrapper.find('.notice-box').text()).toContain('匹配中')
        expect(wrapper.findAll('button.tool-btn')[0].attributes('disabled')).toBeDefined()
        expect(wrapper.findAll('button.tool-btn')[1].attributes('disabled')).toBeDefined()

        // 手动补发 worker 响应：状态恢复、结果渲染
        MockRegexWorker.instances[0].respondLast()
        await flushPromises()
        expect(wrapper.find('.notice-box').exists()).toBe(false)
        expect(wrapper.findAll('.match-item')).toHaveLength(2)
        expect(wrapper.findAll('button.tool-btn')[0].attributes('disabled')).toBeUndefined()
        wrapper.unmount()
    })

    it('超时：3 秒预算耗尽后显示 i18n 超时错误并恢复按钮', async () => {
        vi.useFakeTimers()
        MockRegexWorker.noResponse = true
        const wrapper = mountTester()
        await wrapper.findAll('input.field-input')[0].setValue('(a+)+$')
        await wrapper.find('textarea.field-textarea').setValue('a'.repeat(100))
        await wrapper.findAll('button.tool-btn')[0].trigger('click')
        await nextTick()
        expect(wrapper.find('.notice-box').text()).toContain('匹配中')

        await vi.advanceTimersByTimeAsync(REGEX_EXEC_TIMEOUT_MS)
        await nextTick()
        expect(wrapper.find('.error-box').text()).toContain('执行超时')
        expect(wrapper.find('.notice-box').exists()).toBe(false)
        expect(wrapper.findAll('button.tool-btn')[0].attributes('disabled')).toBeUndefined()
        wrapper.unmount()
    })
})
