// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L5 / T5.2：AI 输入面板（`LlmAiPanel` + `LlmAiMessageList`）UI 骨架。
 *
 * 覆盖：
 * 1. 空态引导、模型选择占位、输入区初始状态；
 * 2. 上下文引用 chips（当前文档 / 选中文本 / 空态 / 选区截断）；
 * 3. 输入与发送：Enter 发送、Shift+Enter 换行、IME 组合输入不发送、
 *    注入 mock transport 的调用载荷（消息/模型/历史/上下文）；
 * 4. 默认 transport 占位提示「AI 功能尚未接入（L3 批次提供）」；
 * 5. 停止（迟到响应被丢弃）、transport 失败提示；
 * 6. 结果操作：复制可用、应用到编辑器占位禁用、清空对话；
 * 7. 折叠态侧栏与展开事件、窄窗口禁用展开。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import LlmAiPanel from '../../../src/renderer/src/components/llm-wiki/LlmAiPanel.vue'
import {
    LLM_AI_TRANSPORT_INJECTION_KEY,
    type LlmAiSendPayload,
    type LlmAiTransport
} from '../../../src/renderer/src/components/llm-wiki/llm-ai-transport'
import { t } from '../../../src/renderer/src/common/i18n'

/** 挂载面板（默认使用给定 transport；不传则走「尚未接入」占位实现） */
function mountPanel(props: Record<string, unknown> = {}) {
    return mount(LlmAiPanel, { props })
}

/** 在输入框输入内容并按 Enter（或组合键）发送 */
async function typeAndSend(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
    const textarea = wrapper.find('textarea')
    await textarea.setValue(text)
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('LlmAiPanel：初始渲染（空态 / 模型占位 / 上下文空态）', () => {
    it('渲染标题、模型选择占位、空态引导与输入区', () => {
        const wrapper = mountPanel()

        expect(wrapper.find('.llm-ai-panel-title').text()).toBe(t('editorUi.llmWikiPanel.title'))
        expect(wrapper.find('.llm-ai-message-empty-title').text()).toBe(
            t('editorUi.llmWikiPanel.emptyTitle')
        )
        expect(wrapper.find('.llm-ai-message-empty-hint').text()).toBe(
            t('editorUi.llmWikiPanel.emptyHint')
        )

        // 模型选择：默认「默认模型」+ 本地/远程两条占位数据
        const select = wrapper.find('.llm-ai-panel-model-select')
        expect((select.element as HTMLSelectElement).value).toBe('default')
        const options = select.findAll('option')
        expect(options).toHaveLength(3)
        expect(options[0].text()).toBe(t('editorUi.llmWikiPanel.modelDefault'))
        expect(options[1].text()).toBe(t('editorUi.llmWikiPanel.modelLocalMock'))
        expect(options[2].text()).toBe(t('editorUi.llmWikiPanel.modelRemoteMock'))

        // 输入框 + 发送按钮（无输入时禁用）
        expect(wrapper.find('textarea').attributes('placeholder')).toBe(
            t('editorUi.llmWikiPanel.inputPlaceholder')
        )
        expect(wrapper.find('.llm-ai-send').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.llm-ai-stop').exists()).toBe(false)
        // 无上下文时展示空态
        expect(wrapper.find('.llm-ai-panel-context-empty').text()).toBe(
            t('editorUi.llmWikiPanel.contextEmpty')
        )
    })

    it('上下文 chips：当前文档 + 选中文本（长选区截断）', () => {
        const longSelection =
            '这是一段很长的选中文本内容用于验证上下文 chip 的截断展示逻辑，长度需要明显超过四十个字符才能命中截断分支展示省略号'
        const wrapper = mountPanel({
            documentName: 'wiki/索引.md',
            selectionText: longSelection
        })

        const documentChip = wrapper.find('[data-context="document"]')
        expect(documentChip.exists()).toBe(true)
        expect(documentChip.text()).toContain(t('editorUi.llmWikiPanel.contextDocument'))
        expect(documentChip.text()).toContain('wiki/索引.md')

        const selectionChip = wrapper.find('[data-context="selection"]')
        expect(selectionChip.exists()).toBe(true)
        expect(selectionChip.text()).toContain(t('editorUi.llmWikiPanel.contextSelection'))
        // 超过 40 字符截断为「…」结尾
        expect(selectionChip.text()).toContain('…')
        expect(wrapper.find('.llm-ai-panel-context-empty').exists()).toBe(false)
    })
})

describe('LlmAiPanel：输入与发送（注入 mock transport）', () => {
    it('Enter 发送：调用 transport 并携带消息/模型/历史/上下文，回复渲染为助手气泡', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('这是 AI 回复')
        const wrapper = mountPanel({
            transport,
            documentName: 'notes.md',
            selectionText: '选中的片段'
        })

        await typeAndSend(wrapper, '  请总结当前文档  ')

        expect(transport).toHaveBeenCalledTimes(1)
        const payload = transport.mock.calls[0][0] as LlmAiSendPayload
        expect(payload.message).toBe('请总结当前文档')
        expect(payload.modelId).toBe('default')
        expect(payload.history).toHaveLength(1)
        expect(payload.history[0]).toMatchObject({ role: 'user', content: '请总结当前文档' })
        expect(payload.context).toEqual({
            documentName: 'notes.md',
            selectionText: '选中的片段'
        })

        // 用户消息 + 助手回复
        const messages = wrapper.findAll('.llm-ai-message')
        expect(messages).toHaveLength(2)
        expect(messages[0].attributes('data-role')).toBe('user')
        expect(messages[1].attributes('data-role')).toBe('assistant')
        expect(wrapper.find('.llm-ai-message--assistant').text()).toContain('这是 AI 回复')
        // 发送后清空输入
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    })

    it('Shift+Enter 不发送（换行由浏览器默认行为处理）', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复')
        const wrapper = mountPanel({ transport })
        const textarea = wrapper.find('textarea')
        await textarea.setValue('第一行')
        await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
        await flushPromises()
        expect(transport).not.toHaveBeenCalled()
    })

    it('IME 组合输入中的 Enter 不发送', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复')
        const wrapper = mountPanel({ transport })
        const textarea = wrapper.find('textarea')
        await textarea.setValue('拼音输入中')

        const composingEnter = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true
        })
        // jsdom 对 isComposing 的构造支持不统一：直接定义属性，稳定覆盖 IME 分支
        Object.defineProperty(composingEnter, 'isComposing', { value: true })
        textarea.element.dispatchEvent(composingEnter)
        await flushPromises()

        expect(transport).not.toHaveBeenCalled()
    })

    it('默认 transport 返回「AI 功能尚未接入（L3 批次提供）」占位提示', async () => {
        const wrapper = mountPanel()
        await typeAndSend(wrapper, '你好')

        const assistantMessage = wrapper.find('.llm-ai-message--assistant')
        expect(assistantMessage.exists()).toBe(true)
        expect(assistantMessage.text()).toContain(t('editorUi.llmWikiPanel.notConnected'))
    })

    it('发送中展示停止按钮；停止后迟到回复被丢弃', async () => {
        let resolveTransport: (value: string) => void = () => undefined
        const transport = vi.fn<LlmAiTransport>(
            () =>
                new Promise<string>((resolve) => {
                    resolveTransport = resolve
                })
        )
        const wrapper = mountPanel({ transport })

        const textarea = wrapper.find('textarea')
        await textarea.setValue('生成一段内容')
        await textarea.trigger('keydown', { key: 'Enter' })
        await flushPromises()

        // 生成中：停止按钮可见、发送按钮消失、展示「正在生成…」占位气泡
        expect(wrapper.find('.llm-ai-stop').exists()).toBe(true)
        expect(wrapper.find('.llm-ai-send').exists()).toBe(false)
        expect(wrapper.find('.llm-ai-message--pending').exists()).toBe(true)

        await wrapper.find('.llm-ai-stop').trigger('click')
        await flushPromises()
        expect(wrapper.find('.llm-ai-send').exists()).toBe(true)
        expect(wrapper.find('.llm-ai-message--pending').exists()).toBe(false)

        // 迟到的 transport 结果不再进入对话
        resolveTransport('迟到的回复')
        await flushPromises()
        expect(wrapper.text()).not.toContain('迟到的回复')
        expect(wrapper.findAll('.llm-ai-message')).toHaveLength(1)
    })

    it('transport 失败时展示可读错误提示', async () => {
        const transport = vi.fn<LlmAiTransport>().mockRejectedValue(new Error('network down'))
        const wrapper = mountPanel({ transport })
        await typeAndSend(wrapper, '触发失败')

        expect(wrapper.find('.llm-ai-message--assistant').text()).toContain(
            t('editorUi.llmWikiPanel.transportError')
        )
        expect(wrapper.find('.llm-ai-panel-status').text()).toBe(
            t('editorUi.llmWikiPanel.inputHint')
        )
    })

    it('transport 返回空字符串时回落「未返回内容」提示', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('   ')
        const wrapper = mountPanel({ transport })
        await typeAndSend(wrapper, '空回复')

        expect(wrapper.find('.llm-ai-message--assistant').text()).toContain(
            t('editorUi.llmWikiPanel.emptyReply')
        )
    })

    it('未传 props.transport 时使用 provide 注入的 transport（L3 联调注入方式）', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('注入实现的回复')
        const wrapper = mount(LlmAiPanel, {
            global: {
                provide: { [LLM_AI_TRANSPORT_INJECTION_KEY]: transport }
            }
        })
        await typeAndSend(wrapper, '你好')
        expect(transport).toHaveBeenCalledTimes(1)
        expect(wrapper.find('.llm-ai-message--assistant').text()).toContain('注入实现的回复')
    })
})

describe('LlmAiPanel：结果操作与折叠', () => {
    it('助手回复提供复制（写剪贴板）与禁用占位的「应用到编辑器」', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        })
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('可复制的回复')
        const wrapper = mountPanel({ transport })
        await typeAndSend(wrapper, '请回复')

        // 应用到编辑器：占位禁用 + 待接入提示
        const applyButton = wrapper.find('.llm-ai-message-apply')
        expect(applyButton.exists()).toBe(true)
        expect(applyButton.attributes('disabled')).toBeDefined()
        expect(applyButton.attributes('title')).toBe(t('editorUi.llmWikiPanel.applyComingSoon'))

        // 复制：写入剪贴板并以状态区提示「已复制」
        await wrapper.find('.llm-ai-message-copy').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('可复制的回复')
        expect(wrapper.find('.llm-ai-panel-status').text()).toBe(t('editorUi.llmWikiPanel.copied'))
    })

    it('剪贴板不可用/写入失败时状态区提示复制失败', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
        })
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('复制失败的回复')
        const wrapper = mountPanel({ transport })
        await typeAndSend(wrapper, '请回复')

        await wrapper.find('.llm-ai-message-copy').trigger('click')
        await flushPromises()
        expect(wrapper.find('.llm-ai-panel-status').text()).toBe(
            t('editorUi.llmWikiPanel.copyFailed')
        )

        // 剪贴板 API 完全不可用：同样降级为可见失败提示，不抛错
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
        await wrapper.find('.llm-ai-message-copy').trigger('click')
        await flushPromises()
        expect(wrapper.find('.llm-ai-panel-status').text()).toBe(
            t('editorUi.llmWikiPanel.copyFailed')
        )
    })

    it('清空对话按钮清空消息并回到空态', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复内容')
        const wrapper = mountPanel({ transport })
        await typeAndSend(wrapper, '第一轮对话')
        expect(wrapper.findAll('.llm-ai-message')).toHaveLength(2)

        await wrapper.find('.llm-ai-panel-clear').trigger('click')
        await nextTick()

        expect(wrapper.findAll('.llm-ai-message')).toHaveLength(0)
        expect(wrapper.find('.llm-ai-message-empty-title').exists()).toBe(true)
    })

    it('折叠态渲染 48px 侧栏：点击展开上抛 toggle-collapse；不可展开时按钮禁用', async () => {
        const wrapper = mountPanel({ collapsed: true })
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(true)
        expect(wrapper.find('.llm-ai-panel-header').exists()).toBe(false)

        await wrapper.find('.llm-ai-panel-expand').trigger('click')
        expect(wrapper.emitted('toggle-collapse')).toHaveLength(1)

        const disabledWrapper = mountPanel({ collapsed: true, canExpand: false })
        const expandButton = disabledWrapper.find('.llm-ai-panel-expand')
        expect(expandButton.attributes('disabled')).toBeDefined()
        expect(expandButton.attributes('title')).toBe(
            t('editorUi.llmWikiPanel.narrowCollapsedHint')
        )
    })

    it('展开态点击折叠按钮上抛 toggle-collapse', async () => {
        const wrapper = mountPanel()
        await wrapper.find('.llm-ai-panel-collapse').trigger('click')
        expect(wrapper.emitted('toggle-collapse')).toHaveLength(1)
    })
})
