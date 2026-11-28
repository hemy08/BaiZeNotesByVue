// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L3：设置页「AI 助手」分组单测（FeaturesPanel.vue）
 *
 * 覆盖：
 * 1. 渲染：默认本地 Ollama、关闭；远程形态显示 API Key 输入；密钥状态与存储形态展示；
 * 2. 保存：AI.SAVE_CONFIG 携带表单值；输入新密钥时随保存提交并清空输入框；
 * 3. 清除密钥：AI.SAVE_CONFIG({ clearApiKey: true })；
 * 4. 测试连接：先保存当前表单，再以空 messages 调 AI.CHAT 并展示成功/失败结果；
 * 5. 环境不可用：受限 ipcRenderer 缺失时整组禁用并提示；
 * 6. 结构与既有分组不冲突（MCP 分组仍在，AI 分组位于其后）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import FeaturesPanel from '@renderer/components/dialogs/complex/system-setting/FeaturesPanel.vue'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { IPC } from '../../../src/shared/ipc-channels'
import { t } from '@renderer/common/i18n'

/** 构造设置草稿（默认值 + 局部覆盖） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
}

/** 默认 AI 配置快照（关闭 + 本地 Ollama） */
function defaultAiSnapshot(overrides: Record<string, unknown> = {}) {
    return {
        enabled: false,
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: '',
        apiKeyConfigured: false,
        apiKeyStorage: 'safe',
        ...overrides
    }
}

let invoke: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 挂载设置页功能面板 */
function mountPanel(settings: SystemDialogSettings = draft()): VueWrapper {
    const wrapper = mount(FeaturesPanel, {
        props: { settings },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

beforeEach(() => {
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.AI.GET_CONFIG) {
            return defaultAiSnapshot()
        }
        if (channel === IPC.AI.SAVE_CONFIG) {
            const payload = (invoke.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>
            return {
                ok: true,
                config: defaultAiSnapshot({
                    enabled: payload.enabled === true,
                    provider: typeof payload.provider === 'string' ? payload.provider : 'local',
                    baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl : '',
                    model: typeof payload.model === 'string' ? payload.model : '',
                    apiKeyConfigured:
                        typeof payload.apiKey === 'string' || payload.clearApiKey !== true
                })
            }
        }
        if (channel === IPC.AI.CHAT) {
            return { ok: true, content: '连接成功（模型：qwen2.5）', model: 'qwen2.5' }
        }
        if (channel === IPC.MCP.GET_STATUS) {
            return {
                enabled: false,
                running: false,
                port: 0,
                token: '',
                url: '',
                toolCount: 7
            }
        }
        return undefined
    })
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('FeaturesPanel：AI 助手分组渲染', () => {
    it('默认渲染本地 Ollama + 关闭状态，MCP 分组保留且 AI 分组位于其后', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(IPC.AI.GET_CONFIG)
        expect(wrapper.find('#ai-enabled').exists()).toBe(true)
        expect((wrapper.find('#ai-enabled').element as HTMLInputElement).checked).toBe(false)
        expect((wrapper.find('#ai-provider').element as HTMLSelectElement).value).toBe('local')
        expect((wrapper.find('#ai-local-provider').element as HTMLSelectElement).value).toBe(
            'ollama'
        )
        expect(wrapper.find('#ai-base-url').exists()).toBe(true)
        expect(wrapper.find('#ai-model').exists()).toBe(true)
        // 本地形态不显示远程 API Key 输入
        expect(wrapper.find('[data-testid="ai-api-key-row"]').exists()).toBe(false)
        // MCP 分组仍在（不破坏 L2 结构），且 AI 分组 DOM 在其后
        expect(wrapper.find('[data-testid="mcp-server-status"]').exists()).toBe(true)
        const groups = wrapper.findAll('.settings-group')
        const mcpGroupIndex = groups.findIndex((group) =>
            group.classes().includes('mcp-server-group')
        )
        const aiGroupIndex = groups.findIndex((group) =>
            group.classes().includes('ai-assistant-group')
        )
        expect(mcpGroupIndex).toBeGreaterThanOrEqual(0)
        expect(aiGroupIndex).toBeGreaterThan(mcpGroupIndex)
    })

    it('远程形态显示 API Key 输入与密钥状态（已配置 + 安全存储）', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.GET_CONFIG) {
                return defaultAiSnapshot({
                    enabled: true,
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat',
                    apiKeyConfigured: true,
                    apiKeyStorage: 'safe'
                })
            }
            return undefined
        })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-api-key-row"]').exists()).toBe(true)
        const keyInput = wrapper.find('#ai-api-key')
        expect(keyInput.attributes('type')).toBe('password')
        const status = wrapper.find('[data-testid="ai-key-status"]').text()
        expect(status).toContain(t('dialogRenderer.systemSetting.features.aiApiKeyConfigured'))
        expect(status).toContain(t('dialogRenderer.systemSetting.features.aiApiKeyStorageSafe'))
    })

    it('safeStorage 不可用（memory）时显示「仅会话内存」提示', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.GET_CONFIG) {
                return defaultAiSnapshot({
                    enabled: true,
                    provider: 'remote',
                    apiKeyConfigured: true,
                    apiKeyStorage: 'memory'
                })
            }
            return undefined
        })
        const wrapper = mountPanel()
        await flushPromises()
        const status = wrapper.find('[data-testid="ai-key-status"]').text()
        expect(status).toContain(t('dialogRenderer.systemSetting.features.aiApiKeyStorageMemory'))
        expect(wrapper.text()).toContain(
            t('dialogRenderer.systemSetting.features.aiKeyUnavailable')
        )
    })
})

describe('FeaturesPanel：AI 配置保存/清除/测试连接', () => {
    it('保存：AI.SAVE_CONFIG 携带表单值（provider/baseUrl/model/enabled），并显示已保存', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('#ai-enabled').setValue(true)
        await wrapper.find('#ai-provider').setValue('remote')
        await wrapper.find('#ai-base-url').setValue('https://api.example.com/v1')
        await wrapper.find('#ai-model').setValue('deepseek-chat')
        await wrapper.find('.ai-save-btn').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(IPC.AI.SAVE_CONFIG, {
            enabled: true,
            provider: 'remote',
            localProvider: 'ollama',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat'
        })
        expect(wrapper.find('[data-testid="ai-success"]').text()).toContain(
            t('dialogRenderer.systemSetting.features.aiSaved')
        )
    })

    it('输入新 API Key 后保存：密钥随载荷提交并清空输入框', async () => {
        const wrapper = mountPanel()
        await flushPromises()
        await wrapper.find('#ai-provider').setValue('remote')
        await wrapper.find('#ai-api-key').setValue('sk-new-key')
        await wrapper.find('.ai-save-btn').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(
            IPC.AI.SAVE_CONFIG,
            expect.objectContaining({ apiKey: 'sk-new-key' })
        )
        expect((wrapper.find('#ai-api-key').element as HTMLInputElement).value).toBe('')
    })

    it('清除密钥：AI.SAVE_CONFIG({ clearApiKey: true })', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.GET_CONFIG) {
                return defaultAiSnapshot({
                    enabled: true,
                    provider: 'remote',
                    apiKeyConfigured: true
                })
            }
            if (channel === IPC.AI.SAVE_CONFIG) {
                return { ok: true, config: defaultAiSnapshot({ provider: 'remote' }) }
            }
            return undefined
        })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.ai-clear-key-btn').trigger('click')
        await flushPromises()
        expect(invoke).toHaveBeenCalledWith(IPC.AI.SAVE_CONFIG, { clearApiKey: true })
        expect(wrapper.find('[data-testid="ai-key-status"]').text()).toContain(
            t('dialogRenderer.systemSetting.features.aiApiKeyNotConfigured')
        )
    })

    it('测试连接：先保存当前表单，再以空 messages 调 AI.CHAT 并展示成功结果', async () => {
        const wrapper = mountPanel()
        await flushPromises()
        await wrapper.find('#ai-model').setValue('qwen2.5')
        await wrapper.find('.ai-test-btn').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(
            IPC.AI.SAVE_CONFIG,
            expect.objectContaining({ model: 'qwen2.5' })
        )
        expect(invoke).toHaveBeenCalledWith(IPC.AI.CHAT, { messages: [] })
        expect(wrapper.find('[data-testid="ai-success"]').text()).toContain('连接成功')
    })

    it('测试连接失败：展示结构化失败原因（AI_NOT_CONFIGURED）', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.GET_CONFIG) {
                return defaultAiSnapshot()
            }
            if (channel === IPC.AI.SAVE_CONFIG) {
                return { ok: true, config: defaultAiSnapshot() }
            }
            if (channel === IPC.AI.CHAT) {
                return { ok: false, code: 'AI_NOT_CONFIGURED', message: 'AI 助手未启用' }
            }
            return undefined
        })
        const wrapper = mountPanel()
        await flushPromises()
        await wrapper.find('.ai-test-btn').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-error"]').text()).toContain('AI 助手未启用')
    })

    it('保存失败：展示结构化失败原因', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.AI.GET_CONFIG) {
                return defaultAiSnapshot()
            }
            if (channel === IPC.AI.SAVE_CONFIG) {
                return { ok: false, code: 'AI_CONFIG_STORE_FAILED', message: '写入失败' }
            }
            return undefined
        })
        const wrapper = mountPanel()
        await flushPromises()
        await wrapper.find('.ai-save-btn').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="ai-error"]').text()).toContain('写入失败')
    })

    it('受限 ipcRenderer 不可用：显示不可用提示并禁用保存/测试按钮', async () => {
        vi.stubGlobal('electron', undefined)
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-error"]').text()).toContain(
            t('dialogRenderer.systemSetting.features.aiUnavailable')
        )
        expect((wrapper.find('.ai-save-btn').element as HTMLButtonElement).disabled).toBe(true)
        expect((wrapper.find('.ai-test-btn').element as HTMLButtonElement).disabled).toBe(true)
    })
})
