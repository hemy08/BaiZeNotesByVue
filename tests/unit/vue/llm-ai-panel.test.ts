// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki AI 输入面板（`LlmAiPanel` + `LlmAiMessageList`）。
 *
 * 覆盖：
 * 1. 空态引导、输入区初始状态、上下文引用 chips（当前文档 / 选中文本 / 截断）；
 * 2. 多模型选择（体验升级批次 A）：经 `AI.GET_CONFIG` 读取模型列表、按配置顺序渲染、
 *    默认选中 defaultModelId、切换后发送载荷携带真实模型 id；
 * 3. 未启用/无模型：展示「未配置模型」占位、禁用发送、可见配置提示；
 * 4. 配置读取失败降级：「默认模型」占位、仍允许发送且载荷不带 modelId；
 * 5. 配置刷新时机：SYSTEM_SETTING_UPDATE 广播 / 折叠恢复展开 / 发送前静默刷新；
 * 6. 发送与停止、错误转发、复制/应用占位/清空、收起态渲染与恢复宽度事件。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import LlmAiPanel from '../../../src/renderer/src/components/llm-wiki/LlmAiPanel.vue'
import {
    LLM_AI_TRANSPORT_INJECTION_KEY,
    type LlmAiSendPayload,
    type LlmAiTransport
} from '../../../src/renderer/src/components/llm-wiki/llm-ai-transport'
import { IPC } from '../../../src/shared/ipc-channels'
import { getConfigStore } from '../../../src/renderer/src/common/useConfigStore'
import { t } from '../../../src/renderer/src/common/i18n'

/** 测试用模型列表（顺序有意打乱默认模型，验证按 models 顺序渲染 + defaultModelId 选中） */
const AI_MODELS = [
    {
        id: 'model-local',
        name: '本地 Qwen',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: 'qwen2.5:7b'
    },
    {
        id: 'model-remote',
        name: 'DeepSeek',
        provider: 'remote',
        localProvider: 'lmstudio',
        baseUrl: 'https://api.example.com/v1',
        model: 'deepseek-chat',
        apiKeyConfigured: true
    }
]

/** 已配置快照（enabled + 两个模型 + 默认远端模型） */
function configuredSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        enabled: true,
        models: AI_MODELS,
        defaultModelId: 'model-remote',
        apiKeyStorage: 'safe',
        ...overrides
    }
}

let invokeMock: ReturnType<typeof vi.fn>
let ipcOnMock: ReturnType<typeof vi.fn>
let ipcRemoveListenerMock: ReturnType<typeof vi.fn>

/** 用给定 AI.GET_CONFIG 返回（值或实现）替换 electron 桥 */
function stubAiConfig(result: unknown): void {
    invokeMock = vi.fn().mockResolvedValue(result)
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: invokeMock,
            on: ipcOnMock,
            removeListener: ipcRemoveListenerMock
        }
    })
}

/** 挂载面板（默认使用给定 transport；不传则走「尚未接入」占位实现） */
function mountPanel(props: Record<string, unknown> = {}) {
    return mount(LlmAiPanel, { props })
}

/** 挂载并等待首次模型配置读取完成 */
async function mountPanelReady(props: Record<string, unknown> = {}) {
    const wrapper = mountPanel(props)
    await flushPromises()
    return wrapper
}

/** 在输入框输入内容并按 Enter（或组合键）发送 */
async function typeAndSend(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
    const textarea = wrapper.find('textarea')
    await textarea.setValue(text)
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
}

/** 取指定通道的 IPC 监听回调（用于模拟主进程广播） */
function getIpcListener(channel: string): (event?: unknown, payload?: unknown) => void {
    const call = ipcOnMock.mock.calls.find((args) => args[0] === channel)
    expect(call, `${channel} 监听应已注册`).toBeTruthy()
    return call![1] as (event?: unknown, payload?: unknown) => void
}

beforeEach(() => {
    ipcOnMock = vi.fn()
    ipcRemoveListenerMock = vi.fn()
    // 设置对话框状态为全局单例：每个用例前确保关闭，避免 watch 触发顺序受上个用例影响
    getConfigStore().hideDialog('systemSettings')
    stubAiConfig(configuredSnapshot())
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('LlmAiPanel：初始渲染（空态 / 模型列表 / 上下文空态）', () => {
    it('渲染标题、模型下拉（按 models 顺序、默认选中 defaultModelId）、空态引导与输入区', async () => {
        const wrapper = await mountPanelReady()

        expect(wrapper.find('.llm-ai-panel-title').text()).toBe(t('editorUi.llmWikiPanel.title'))
        expect(wrapper.find('.llm-ai-message-empty-title').text()).toBe(
            t('editorUi.llmWikiPanel.emptyTitle')
        )
        expect(wrapper.find('.llm-ai-message-empty-hint').text()).toBe(
            t('editorUi.llmWikiPanel.emptyHint')
        )

        // 模型选择：经 AI.GET_CONFIG 读取（invoke 调用一次），按 models 顺序渲染 name
        expect(invokeMock).toHaveBeenCalled()
        expect(invokeMock.mock.calls[0][0]).toBe(IPC.AI.GET_CONFIG)
        const select = wrapper.find('.llm-ai-panel-model-select')
        expect(select.attributes('data-model-state')).toBe('ready')
        expect(select.attributes('disabled')).toBeUndefined()
        const options = select.findAll('option')
        expect(options).toHaveLength(2)
        expect(options[0].text()).toBe('本地 Qwen')
        expect(options[1].text()).toBe('DeepSeek')
        // 默认选中 defaultModelId（不是第一项）
        expect((select.element as HTMLSelectElement).value).toBe('model-remote')
        // 正常态不展示配置提示行
        expect(wrapper.find('.llm-ai-panel-model-note').exists()).toBe(false)

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

    it('上下文 chips：当前文档 + 选中文本（长选区截断）', async () => {
        const longSelection =
            '这是一段很长的选中文本内容用于验证上下文 chip 的截断展示逻辑，长度需要明显超过四十个字符才能命中截断分支展示省略号'
        const wrapper = await mountPanelReady({
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

describe('LlmAiPanel：多模型选择（AI.GET_CONFIG）', () => {
    it('切换模型后发送载荷携带所选真实模型 id', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复')
        const wrapper = await mountPanelReady({ transport })

        // 默认选中远端模型（defaultModelId）
        await typeAndSend(wrapper, '第一问')
        const firstPayload = transport.mock.calls[0][0] as LlmAiSendPayload
        expect(firstPayload.modelId).toBe('model-remote')

        // 切换到第一个模型后再发：载荷随之变化
        await wrapper.find('.llm-ai-panel-model-select').setValue('model-local')
        await typeAndSend(wrapper, '第二问')
        const secondPayload = transport.mock.calls[1][0] as LlmAiSendPayload
        expect(secondPayload.modelId).toBe('model-local')
    })

    it('AI 未启用（enabled=false）：展示「未配置模型」占位并禁用发送', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('不应调用')
        stubAiConfig(configuredSnapshot({ enabled: false }))
        const wrapper = await mountPanelReady({ transport })

        const select = wrapper.find('.llm-ai-panel-model-select')
        expect(select.attributes('data-model-state')).toBe('unconfigured')
        expect(select.attributes('disabled')).toBeDefined()
        expect(select.findAll('option')).toHaveLength(1)
        expect(select.find('option').text()).toBe(t('editorUi.llmWikiPanel.modelUnconfigured'))
        // 可见配置提示（提示到设置页配置）
        const note = wrapper.find('.llm-ai-panel-model-note')
        expect(note.exists()).toBe(true)
        expect(note.text()).toBe(t('editorUi.llmWikiPanel.modelUnconfiguredHint'))

        // 有输入也不可发送
        const textarea = wrapper.find('textarea')
        await textarea.setValue('已配置前先发一条')
        expect(wrapper.find('.llm-ai-send').attributes('disabled')).toBeDefined()
        await textarea.trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(transport).not.toHaveBeenCalled()
    })

    it('AI 已启用但模型列表为空：同样按未配置处理并禁用发送', async () => {
        stubAiConfig(configuredSnapshot({ models: [], defaultModelId: null }))
        const wrapper = await mountPanelReady()

        expect(wrapper.find('.llm-ai-panel-model-select').attributes('data-model-state')).toBe(
            'unconfigured'
        )
        expect(wrapper.find('.llm-ai-panel-model-select').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.llm-ai-panel-model-select').find('option').text()).toBe(
            t('editorUi.llmWikiPanel.modelUnconfigured')
        )
    })

    it('配置读取失败降级：「默认模型」占位、仍可发送且载荷不带 modelId', async () => {
        invokeMock = vi.fn().mockRejectedValue(new Error('ipc unavailable'))
        vi.stubGlobal('electron', {
            ipcRenderer: {
                invoke: invokeMock,
                on: ipcOnMock,
                removeListener: ipcRemoveListenerMock
            }
        })
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('降级回复')
        const wrapper = await mountPanelReady({ transport })

        const select = wrapper.find('.llm-ai-panel-model-select')
        expect(select.attributes('data-model-state')).toBe('error')
        expect(select.attributes('disabled')).toBeDefined()
        expect(select.find('option').text()).toBe(t('editorUi.llmWikiPanel.modelFallback'))
        // 读取失败提示可见
        expect(wrapper.find('.llm-ai-panel-model-note').text()).toBe(
            t('editorUi.llmWikiPanel.modelLoadFailedHint')
        )

        // 仍允许发送（主进程回退 defaultModelId）：载荷不带 modelId 字段
        await typeAndSend(wrapper, '请总结')
        expect(transport).toHaveBeenCalledTimes(1)
        const payload = transport.mock.calls[0][0] as LlmAiSendPayload
        expect(payload.message).toBe('请总结')
        expect('modelId' in payload).toBe(false)
        expect(wrapper.find('.llm-ai-message--assistant').text()).toContain('降级回复')
    })

    it('收到 SYSTEM_SETTING_UPDATE 广播后重新读取模型列表', async () => {
        const wrapper = await mountPanelReady()
        expect(wrapper.findAll('.llm-ai-panel-model-select option')).toHaveLength(2)

        // 设置页保存后模型列表变化（主进程广播通用设置更新 → 面板重读 AI 配置）
        invokeMock.mockResolvedValue(
            configuredSnapshot({
                models: [
                    {
                        id: 'model-new',
                        name: '新模型',
                        provider: 'local',
                        localProvider: 'ollama',
                        baseUrl: '',
                        model: 'qwen3:8b'
                    }
                ],
                defaultModelId: 'model-new'
            })
        )
        getIpcListener(IPC.SETTING.SYSTEM_SETTING_UPDATE)({}, {})
        await flushPromises()

        const options = wrapper.findAll('.llm-ai-panel-model-select option')
        expect(options).toHaveLength(1)
        expect(options[0].text()).toBe('新模型')
        expect(
            (wrapper.find('.llm-ai-panel-model-select').element as HTMLSelectElement).value
        ).toBe('model-new')
    })

    it('系统设置对话框关闭后重新读取模型列表（AI 配置保存不广播系统设置）', async () => {
        const configStore = getConfigStore()
        configStore.showDialog('systemSettings')
        const wrapper = await mountPanelReady()
        expect(wrapper.findAll('.llm-ai-panel-model-select option')).toHaveLength(2)

        // 设置页新增模型后经 AI.SAVE_CONFIG 保存（无广播）；关闭设置对话框 → 面板重读
        invokeMock.mockResolvedValue(
            configuredSnapshot({
                models: [
                    {
                        id: 'model-added',
                        name: '设置页新增模型',
                        provider: 'local',
                        localProvider: 'ollama',
                        baseUrl: '',
                        model: 'qwen3:14b'
                    }
                ],
                defaultModelId: 'model-added'
            })
        )
        configStore.hideDialog('systemSettings')
        await flushPromises()

        const options = wrapper.findAll('.llm-ai-panel-model-select option')
        expect(options).toHaveLength(1)
        expect(options[0].text()).toBe('设置页新增模型')
    })

    it('折叠恢复展开时重新读取模型列表', async () => {
        const wrapper = await mountPanelReady({ collapsed: true })
        expect(wrapper.find('.llm-ai-panel-header').exists()).toBe(false)
        const callCountAfterMount = invokeMock.mock.calls.length

        await wrapper.setProps({ collapsed: false })
        await flushPromises()

        expect(invokeMock.mock.calls.length).toBeGreaterThan(callCountAfterMount)
        expect(wrapper.find('.llm-ai-panel-model-select').attributes('data-model-state')).toBe(
            'ready'
        )
    })

    it('发送前静默刷新配置：新配置下已移除的选中模型回落到新的默认模型', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复')
        // 首帧：默认选中 model-local（列表只有该项）
        stubAiConfig(
            configuredSnapshot({
                models: [AI_MODELS[0]],
                defaultModelId: 'model-local'
            })
        )
        const wrapper = await mountPanelReady({ transport })

        // 设置页把模型改成另一个（默认模型变化）：发送前重读应切换选择
        invokeMock.mockResolvedValue(
            configuredSnapshot({
                models: [
                    {
                        id: 'model-new',
                        name: '新模型',
                        provider: 'remote',
                        localProvider: 'lmstudio',
                        baseUrl: 'https://api.example.com/v1',
                        model: 'new-model'
                    }
                ],
                defaultModelId: 'model-new'
            })
        )
        await typeAndSend(wrapper, '发送前刷新')

        expect(transport).toHaveBeenCalledTimes(1)
        const payload = transport.mock.calls[0][0] as LlmAiSendPayload
        expect(payload.modelId).toBe('model-new')
    })

    it('发送前刷新发现未配置模型：不发送、保留输入并展示未配置提示', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('不应调用')
        const wrapper = await mountPanelReady({ transport })
        expect(wrapper.find('.llm-ai-panel-model-select').attributes('data-model-state')).toBe(
            'ready'
        )

        // 发送前重读为「未配置」→ 本次发送作废，输入保留
        invokeMock.mockResolvedValue(configuredSnapshot({ enabled: false }))
        await typeAndSend(wrapper, '配置已被关闭')

        expect(transport).not.toHaveBeenCalled()
        expect(wrapper.find('.llm-ai-panel-model-select').attributes('data-model-state')).toBe(
            'unconfigured'
        )
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('配置已被关闭')
    })

    it('发送前静默刷新失败：保留已有模型列表与选择，照常发送（不降级为未配置）', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复')
        const wrapper = await mountPanelReady({ transport })
        expect(wrapper.find('.llm-ai-panel-model-select').attributes('data-model-state')).toBe(
            'ready'
        )

        // 发送前重读取失败（临时 IPC 异常）：不应清空列表/选择
        invokeMock.mockRejectedValue(new Error('temporary ipc failure'))
        await typeAndSend(wrapper, '临时故障时发送')

        expect(transport).toHaveBeenCalledTimes(1)
        const payload = transport.mock.calls[0][0] as LlmAiSendPayload
        expect(payload.modelId).toBe('model-remote')
        expect(wrapper.find('.llm-ai-panel-model-select').attributes('data-model-state')).toBe(
            'ready'
        )
        expect(
            (wrapper.find('.llm-ai-panel-model-select').element as HTMLSelectElement).value
        ).toBe('model-remote')
    })

    it('展开态点击「恢复默认面板宽度」按钮上抛 reset-width 事件', async () => {
        const wrapper = await mountPanelReady()
        await wrapper.find('.llm-ai-panel-reset-width').trigger('click')
        expect(wrapper.emitted('reset-width')).toHaveLength(1)
    })
})

describe('LlmAiPanel：输入与发送（注入 mock transport）', () => {
    it('Enter 发送：调用 transport 并携带消息/模型/历史/上下文，回复渲染为助手气泡', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('这是 AI 回复')
        const wrapper = await mountPanelReady({
            transport,
            documentName: 'notes.md',
            selectionText: '选中的片段'
        })

        await typeAndSend(wrapper, '  请总结当前文档  ')

        expect(transport).toHaveBeenCalledTimes(1)
        const payload = transport.mock.calls[0][0] as LlmAiSendPayload
        expect(payload.message).toBe('请总结当前文档')
        expect(payload.modelId).toBe('model-remote')
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
        const wrapper = await mountPanelReady({ transport })
        const textarea = wrapper.find('textarea')
        await textarea.setValue('第一行')
        await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
        await flushPromises()
        expect(transport).not.toHaveBeenCalled()
    })

    it('IME 组合输入中的 Enter 不发送', async () => {
        const transport = vi.fn<LlmAiTransport>().mockResolvedValue('回复')
        const wrapper = await mountPanelReady({ transport })
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
        const wrapper = await mountPanelReady()
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
        const wrapper = await mountPanelReady({ transport })

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
        const wrapper = await mountPanelReady({ transport })
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
        const wrapper = await mountPanelReady({ transport })
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
        await flushPromises()
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
        const wrapper = await mountPanelReady({ transport })
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
        const wrapper = await mountPanelReady({ transport })
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
        const wrapper = await mountPanelReady({ transport })
        await typeAndSend(wrapper, '第一轮对话')
        expect(wrapper.findAll('.llm-ai-message')).toHaveLength(2)

        await wrapper.find('.llm-ai-panel-clear').trigger('click')
        await nextTick()

        expect(wrapper.findAll('.llm-ai-message')).toHaveLength(0)
        expect(wrapper.find('.llm-ai-message-empty-title').exists()).toBe(true)
    })

    it('收起态不渲染面板内容（展开入口在工作区右侧边栏，由 WorkSpace 渲染）', async () => {
        const wrapper = await mountPanelReady({ collapsed: true })
        expect(wrapper.find('.llm-ai-panel').attributes('data-collapsed')).toBe('true')
        expect(wrapper.find('.llm-ai-panel-header').exists()).toBe(false)
        expect(wrapper.find('textarea').exists()).toBe(false)
        expect(wrapper.find('.llm-ai-panel-collapse').exists()).toBe(false)
        // 面板自身不再渲染 48px 折叠侧栏（入口已移到 WorkSpace 右侧边栏）
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(false)
        expect(wrapper.find('.llm-ai-panel-expand').exists()).toBe(false)

        // 展开后内容恢复渲染（收起/展开由父组件 WorkSpace 驱动）
        await wrapper.setProps({ collapsed: false })
        await flushPromises()
        expect(wrapper.find('.llm-ai-panel').attributes('data-collapsed')).toBe('false')
        expect(wrapper.find('.llm-ai-panel-header').exists()).toBe(true)
    })

    it('展开态点击折叠按钮上抛 toggle-collapse', async () => {
        const wrapper = await mountPanelReady()
        await wrapper.find('.llm-ai-panel-collapse').trigger('click')
        expect(wrapper.emitted('toggle-collapse')).toHaveLength(1)
    })

    it('卸载时退订 SYSTEM_SETTING_UPDATE 广播（订阅/退订成对）', async () => {
        const wrapper = await mountPanelReady()
        expect(ipcOnMock).toHaveBeenCalledWith(
            IPC.SETTING.SYSTEM_SETTING_UPDATE,
            expect.any(Function)
        )
        wrapper.unmount()
        expect(ipcRemoveListenerMock).toHaveBeenCalledWith(
            IPC.SETTING.SYSTEM_SETTING_UPDATE,
            expect.any(Function)
        )
    })
})
