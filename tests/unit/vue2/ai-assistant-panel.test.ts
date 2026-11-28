// @vitest-environment jsdom
/**
 * 1.5.7 体验升级 B：AI 助手独立面板单测（`system-setting/AiAssistantPanel.vue`）
 * （1.5.7 体验微调后该面板由菜单「设置 → AI 助手」独立对话框复用，不再作为系统设置页签）
 *
 * 覆盖点（对应需求验收）：
 * 1. 模型管理：列表渲染（名称 / 类型 / 模型名 / 默认标记 / 远程密钥已配置标记）、空态引导；
 * 2. 添加模型（本地 / 远程）：保存载荷断言（完整 models + defaultModelId + modelApiKey）；
 * 3. 编辑 / 删除 / 设为默认：保存载荷与默认模型回落规则；
 * 4. 密钥：已配置掩码 + 清除按钮 → `modelApiKey.clearApiKey` 载荷；保存后不回显明文；
 * 5. 表单校验：名称 / 模型名必填，远程需 baseUrl 与首次添加需密钥（不发起保存）；
 * 6. 测试连接：`AI.CHAT` 以 `{ messages: [], modelId }` 调用，成功/失败结果内联展示；
 * 7. 启用开关 / 存储形态提示 / 隐私提示；保存失败与结构非法降级；
 * 8. MCP：状态展示（运行中/已停止 + 端口/URL/token + 7 个只读工具 + 安全说明）、
 *    启停（携带端口配置）、固定端口应用与校验、复制令牌、重置令牌（regenerateToken）；
 * 9. 受限 ipcRenderer 不可用时的整页降级。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import AiAssistantPanel from '@renderer/components/dialogs/complex/system-setting/AiAssistantPanel.vue'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'
import type {
    AiConfigSnapshot,
    AiModelConfig,
    AiSaveConfigRequest
} from '../../../src/shared/types/ai'
import type { McpServerStatus } from '../../../src/shared/types/ipc'

/** 构造模型配置（默认本地 Ollama；局部覆盖） */
function model(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
    return {
        id: `ai-model-${Math.random().toString(36).slice(2, 10)}`,
        name: '本地 Qwen',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: 'qwen2.5',
        ...overrides
    }
}

/** 构造配置快照（默认关闭 + 无模型 + 安全存储） */
function snapshot(overrides: Partial<AiConfigSnapshot> = {}): AiConfigSnapshot {
    return {
        enabled: false,
        models: [],
        defaultModelId: null,
        apiKeyStorage: 'safe',
        ...overrides
    }
}

/** 已停止的 MCP 状态（含新增必填字段 preferredPort） */
function stoppedStatus(preferredPort: number | null = null): McpServerStatus {
    return {
        enabled: false,
        running: false,
        port: 0,
        token: '',
        url: '',
        toolCount: 7,
        preferredPort
    }
}

/** 运行中的 MCP 状态（固定端口/令牌便于断言展示） */
const RUNNING_TOKEN = 'a'.repeat(64)
function runningStatus(overrides: Partial<McpServerStatus> = {}): McpServerStatus {
    return {
        enabled: true,
        running: true,
        port: 3847,
        token: RUNNING_TOKEN,
        url: 'http://127.0.0.1:3847/mcp',
        toolCount: 7,
        preferredPort: 3847,
        ...overrides
    }
}

/** 状态化 IPC 桩的可选行为覆盖（用于失败/降级用例） */
interface StubOverrides {
    getConfig?: () => unknown
    saveConfig?: (payload: AiSaveConfigRequest, next: AiConfigSnapshot) => unknown
    chat?: (payload: unknown) => unknown
    getMcpStatus?: () => unknown
    setMcpEnabled?: (payload: unknown) => unknown
}

/** 主进程 AI 配置存储的轻量替身：按保存载荷增量更新快照与密钥状态 */
class FakeAiConfigStore {
    snapshot: AiConfigSnapshot
    keys = new Set<string>()

    constructor(initial: AiConfigSnapshot) {
        this.snapshot = initial
        for (const item of initial.models) {
            if (item.apiKeyConfigured === true) this.keys.add(item.id)
        }
    }

    /** 应用一次保存补丁并返回快照（与主进程口径一致：密钥状态由主进程维护） */
    save(payload: AiSaveConfigRequest): AiConfigSnapshot {
        const next: AiConfigSnapshot = {
            ...this.snapshot,
            models: this.snapshot.models.map((item) => ({ ...item }))
        }
        if (payload.enabled !== undefined) next.enabled = payload.enabled
        if (payload.models !== undefined) {
            next.models = payload.models.map((item) => ({ ...item }))
            for (const modelId of [...this.keys]) {
                if (!next.models.some((item) => item.id === modelId)) this.keys.delete(modelId)
            }
        }
        if (payload.defaultModelId !== undefined) next.defaultModelId = payload.defaultModelId
        if (payload.modelApiKey) {
            if (payload.modelApiKey.clearApiKey === true) {
                this.keys.delete(payload.modelApiKey.modelId)
            } else if (typeof payload.modelApiKey.apiKey === 'string') {
                this.keys.add(payload.modelApiKey.modelId)
            }
        }
        if (
            next.defaultModelId !== null &&
            !next.models.some((item) => item.id === next.defaultModelId)
        ) {
            next.defaultModelId = next.models[0]?.id ?? null
        }
        next.models = next.models.map((item) => ({
            ...item,
            apiKeyConfigured: this.keys.has(item.id)
        }))
        this.snapshot = next
        return next
    }
}

let wrappers: VueWrapper[] = []
let invoke: ReturnType<typeof vi.fn>
let aiStore: FakeAiConfigStore
let mcpState: McpServerStatus
let overrides: StubOverrides

/** 记录挂载实例，afterEach 统一卸载 */
function mountPanel(): VueWrapper {
    const wrapper = mount(AiAssistantPanel, {
        global: { stubs: { teleport: true } },
        attachTo: document.body
    }) as VueWrapper
    wrappers.push(wrapper)
    return wrapper
}

/** 只取某个通道的 invoke 调用 */
function callsOf(channel: string): unknown[][] {
    return invoke.mock.calls.filter((call) => call[0] === channel)
}

/** 取最近一次保存载荷 */
function lastSavePayload(): AiSaveConfigRequest {
    const calls = callsOf(IPC.AI.SAVE_CONFIG)
    expect(calls.length).toBeGreaterThan(0)
    return calls[calls.length - 1][1] as AiSaveConfigRequest
}

/** 切换 MCP 固定端口模式并填入端口 */
async function setFixedMcpPort(wrapper: VueWrapper, value: string): Promise<void> {
    await wrapper.find('#mcp-port-auto').setValue(false)
    await wrapper.find('#mcp-port-input').setValue(value)
}

/** 打开添加模型表单 */
async function openAddForm(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('.ai-add-model-btn').trigger('click')
    await flushPromises()
}

/** 打开第 index 个模型的编辑表单 */
async function openEditForm(wrapper: VueWrapper, index = 0): Promise<void> {
    await wrapper.findAll('.ai-model-item')[index].find('.ai-edit-model-btn').trigger('click')
    await flushPromises()
}

beforeEach(() => {
    overrides = {}
    aiStore = new FakeAiConfigStore(snapshot())
    mcpState = stoppedStatus()
    invoke = vi.fn(async (channel: string, payload?: unknown) => {
        if (channel === IPC.AI.GET_CONFIG) {
            return overrides.getConfig ? overrides.getConfig() : aiStore.snapshot
        }
        if (channel === IPC.AI.SAVE_CONFIG) {
            const next = aiStore.save(payload as AiSaveConfigRequest)
            return overrides.saveConfig
                ? overrides.saveConfig(payload as AiSaveConfigRequest, next)
                : { ok: true, config: next }
        }
        if (channel === IPC.AI.CHAT) {
            return overrides.chat
                ? overrides.chat(payload)
                : { ok: true, content: '连接成功（模型：qwen2.5）', model: 'qwen2.5' }
        }
        if (channel === IPC.MCP.GET_STATUS) {
            return overrides.getMcpStatus ? overrides.getMcpStatus() : mcpState
        }
        if (channel === IPC.MCP.SET_ENABLED) {
            if (overrides.setMcpEnabled) {
                return overrides.setMcpEnabled(payload)
            }
            const request = payload as {
                enabled: boolean
                port?: number | null
                regenerateToken?: boolean
            }
            if (request.enabled) {
                const preferredPort =
                    request.port !== undefined ? request.port : mcpState.preferredPort
                mcpState = runningStatus({
                    port: preferredPort ?? 3847,
                    token: request.regenerateToken ? 'new-token' : RUNNING_TOKEN,
                    url: `http://127.0.0.1:${preferredPort ?? 3847}/mcp`,
                    preferredPort
                })
            } else {
                mcpState = stoppedStatus(mcpState.preferredPort)
            }
            return { ok: true, status: mcpState }
        }
        return undefined
    })
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('AiAssistantPanel：模型列表与空态', () => {
    it('挂载即读取 AI 配置与 MCP 状态，空态展示引导与存储形态提示', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        expect(callsOf(IPC.AI.GET_CONFIG)).toHaveLength(1)
        expect(callsOf(IPC.MCP.GET_STATUS)).toHaveLength(1)
        expect(wrapper.find('[data-testid="ai-models-empty"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="ai-models-empty"]').text()).toContain(
            t('dialogRenderer.aiAssistant.modelsEmptyTitle')
        )
        expect(wrapper.find('.ai-add-model-btn').text()).toBe(
            t('dialogRenderer.aiAssistant.addModel')
        )
        expect(wrapper.find('[data-testid="ai-api-key-storage"]').text()).toBe(
            t('dialogRenderer.aiAssistant.storageSafe')
        )
        // 隐私提示常显（远程数据发送说明）
        expect(wrapper.text()).toContain(t('dialogRenderer.aiAssistant.privacyNote'))
        expect((wrapper.find('#ai-assistant-enabled').element as HTMLInputElement).checked).toBe(
            false
        )
    })

    it('列表渲染名称/类型/模型名/默认标记/远程密钥已配置标记', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                enabled: true,
                apiKeyStorage: 'memory',
                models: [
                    model({ id: 'model-local', name: '本地 Qwen', model: 'qwen2.5' }),
                    model({
                        id: 'model-remote',
                        name: 'DeepSeek',
                        provider: 'remote',
                        baseUrl: 'https://api.example.com/v1',
                        model: 'deepseek-chat',
                        apiKeyConfigured: true
                    })
                ],
                defaultModelId: 'model-local'
            })
        )
        const wrapper = mountPanel()
        await flushPromises()

        const items = wrapper.findAll('.ai-model-item')
        expect(items).toHaveLength(2)
        expect(items[0].text()).toContain('本地 Qwen')
        expect(items[0].text()).toContain('qwen2.5')
        expect(items[0].text()).toContain(
            `${t('dialogRenderer.aiAssistant.formProviderLocal')} · Ollama`
        )
        expect(items[0].find('[data-testid="ai-default-badge"]').text()).toBe(
            t('dialogRenderer.aiAssistant.defaultBadge')
        )
        expect(items[1].text()).toContain(t('dialogRenderer.aiAssistant.formProviderRemote'))
        expect(items[1].find('[data-testid="ai-key-configured-badge"]').exists()).toBe(true)
        // 空态不再展示
        expect(wrapper.find('[data-testid="ai-models-empty"]').exists()).toBe(false)
        // apiKeyStorage=memory 形态提示
        expect(wrapper.find('[data-testid="ai-api-key-storage"]').text()).toBe(
            t('dialogRenderer.aiAssistant.storageMemory')
        )
    })
})

describe('AiAssistantPanel：添加 / 编辑 / 删除 / 默认模型保存载荷', () => {
    it('添加本地模型：保存 models + defaultModelId（首个模型自动成为默认）', async () => {
        const wrapper = mountPanel()
        await flushPromises()
        await openAddForm(wrapper)

        await wrapper.find('#ai-model-form-name').setValue('本地 Qwen')
        await wrapper.find('#ai-model-form-model').setValue('qwen2.5')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        await flushPromises()

        const payload = lastSavePayload()
        expect(payload.models).toEqual([
            {
                id: expect.any(String),
                name: '本地 Qwen',
                provider: 'local',
                localProvider: 'ollama',
                baseUrl: '',
                model: 'qwen2.5'
            }
        ])
        expect(payload.defaultModelId).toBe((payload.models as AiModelConfig[])[0].id)
        expect(payload.modelApiKey).toBeUndefined()
        // 成功后表单关闭、列表出现模型并带默认标记
        expect(wrapper.find('[data-testid="ai-model-form"]').exists()).toBe(false)
        expect(wrapper.findAll('.ai-model-item')).toHaveLength(1)
        expect(wrapper.find('[data-testid="ai-default-badge"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="ai-success"]').text()).toBe(
            t('dialogRenderer.aiAssistant.saved')
        )
    })

    it('添加远程模型：携带 baseUrl 与 modelApiKey，保存后展示密钥已配置标记', async () => {
        const wrapper = mountPanel()
        await flushPromises()
        await openAddForm(wrapper)

        await wrapper.find('#ai-model-form-name').setValue('DeepSeek')
        await wrapper.find('#ai-model-form-provider').setValue('remote')
        await wrapper.find('#ai-model-form-base-url').setValue('https://api.example.com/v1')
        await wrapper.find('#ai-model-form-api-key').setValue('sk-test-key')
        await wrapper.find('#ai-model-form-model').setValue('deepseek-chat')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        await flushPromises()

        const payload = lastSavePayload()
        expect(payload.models).toEqual([
            {
                id: expect.any(String),
                name: 'DeepSeek',
                provider: 'remote',
                localProvider: 'ollama',
                baseUrl: 'https://api.example.com/v1',
                model: 'deepseek-chat'
            }
        ])
        expect(payload.modelApiKey).toEqual({
            modelId: (payload.models as AiModelConfig[])[0].id,
            apiKey: 'sk-test-key'
        })
        expect(wrapper.find('[data-testid="ai-key-configured-badge"]').exists()).toBe(true)
    })

    it('表单校验：名称 / 模型名必填，远程需基址、首次添加需密钥（不发起保存）', async () => {
        const wrapper = mountPanel()
        await flushPromises()
        await openAddForm(wrapper)

        // 名称缺失
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        expect(wrapper.find('[data-testid="ai-form-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.formNameRequired')
        )
        // 模型名缺失
        await wrapper.find('#ai-model-form-name').setValue('新模型')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        expect(wrapper.find('[data-testid="ai-form-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.formModelRequired')
        )
        // 远程基址缺失
        await wrapper.find('#ai-model-form-model').setValue('deepseek-chat')
        await wrapper.find('#ai-model-form-provider').setValue('remote')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        expect(wrapper.find('[data-testid="ai-form-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.formBaseUrlRequired')
        )
        // 远程首次添加密钥缺失
        await wrapper.find('#ai-model-form-base-url').setValue('https://api.example.com/v1')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        expect(wrapper.find('[data-testid="ai-form-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.formApiKeyRequired')
        )
        expect(callsOf(IPC.AI.SAVE_CONFIG)).toHaveLength(0)
    })

    it('编辑模型：保存同一 id 的更新字段，未输入新密钥时不提交 modelApiKey', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                models: [model({ id: 'model-local', name: '旧名称', model: 'qwen2' })],
                defaultModelId: 'model-local'
            })
        )
        const wrapper = mountPanel()
        await flushPromises()
        await openEditForm(wrapper)

        await wrapper.find('#ai-model-form-name').setValue('新名称')
        await wrapper.find('#ai-model-form-model').setValue('qwen2.5')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        await flushPromises()

        const payload = lastSavePayload()
        expect(payload.models).toEqual([
            {
                id: 'model-local',
                name: '新名称',
                provider: 'local',
                localProvider: 'ollama',
                baseUrl: '',
                model: 'qwen2.5'
            }
        ])
        expect(payload.defaultModelId).toBe('model-local')
        expect(payload.modelApiKey).toBeUndefined()
        expect(wrapper.find('.ai-model-item').text()).toContain('新名称')
    })

    it('删除默认模型：保存剩余列表并回落首个剩余模型为默认', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                models: [
                    model({ id: 'model-a', name: '模型 A' }),
                    model({ id: 'model-b', name: '模型 B' })
                ],
                defaultModelId: 'model-a'
            })
        )
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.findAll('.ai-model-item')[0].find('.ai-delete-model-btn').trigger('click')
        await flushPromises()

        const payload = lastSavePayload()
        expect((payload.models as AiModelConfig[]).map((item) => item.id)).toEqual(['model-b'])
        expect(payload.defaultModelId).toBe('model-b')
        expect(wrapper.findAll('.ai-model-item')).toHaveLength(1)
        expect(wrapper.find('[data-testid="ai-default-badge"]').exists()).toBe(true)
    })

    it('设为默认：保存 defaultModelId 并移动默认标记', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                models: [
                    model({ id: 'model-a', name: '模型 A' }),
                    model({ id: 'model-b', name: '模型 B' })
                ],
                defaultModelId: 'model-a'
            })
        )
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.findAll('.ai-model-item')[1].find('.ai-set-default-btn').trigger('click')
        await flushPromises()

        expect(lastSavePayload()).toEqual({ defaultModelId: 'model-b' })
        const items = wrapper.findAll('.ai-model-item')
        expect(items[0].find('[data-testid="ai-default-badge"]').exists()).toBe(false)
        expect(items[1].find('[data-testid="ai-default-badge"]').exists()).toBe(true)
    })
})

describe('AiAssistantPanel：密钥掩码 / 清除 / 启用开关 / 测试连接', () => {
    it('远程已配置密钥：编辑显示掩码与清除按钮，清除提交 clearApiKey 载荷', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                models: [
                    model({
                        id: 'model-remote',
                        name: 'DeepSeek',
                        provider: 'remote',
                        baseUrl: 'https://api.example.com/v1',
                        model: 'deepseek-chat',
                        apiKeyConfigured: true
                    })
                ],
                defaultModelId: 'model-remote'
            })
        )
        const wrapper = mountPanel()
        await flushPromises()
        await openEditForm(wrapper)

        const masked = wrapper.find('[data-testid="ai-key-masked"]')
        expect(masked.exists()).toBe(true)
        expect(masked.text()).toContain('••••••••')
        expect(wrapper.find('#ai-model-form-api-key').attributes('type')).toBe('password')

        await wrapper.find('.ai-clear-key-btn').trigger('click')
        await flushPromises()

        expect(lastSavePayload()).toEqual({
            modelApiKey: { modelId: 'model-remote', clearApiKey: true }
        })
        expect(wrapper.find('[data-testid="ai-key-masked"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="ai-key-configured-badge"]').exists()).toBe(false)
    })

    it('启用开关：立即保存 enabled 并展示成功提示', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('#ai-assistant-enabled').setValue(true)
        await flushPromises()

        expect(lastSavePayload()).toEqual({ enabled: true })
        expect(wrapper.find('[data-testid="ai-success"]').text()).toBe(
            t('dialogRenderer.aiAssistant.saved')
        )
    })

    it('测试连接成功：AI.CHAT 以空 messages + modelId 调用，行内展示成功结果', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                models: [model({ id: 'model-local', model: 'qwen2.5' })],
                defaultModelId: 'model-local'
            })
        )
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.ai-test-model-btn').trigger('click')
        await flushPromises()

        expect(callsOf(IPC.AI.CHAT)).toEqual([
            [IPC.AI.CHAT, { messages: [], modelId: 'model-local' }]
        ])
        expect(wrapper.find('[data-testid="ai-test-result"]').text()).toContain(
            t('dialogRenderer.aiAssistant.testSuccess', { detail: '连接成功（模型：qwen2.5）' })
        )
    })

    it('测试连接失败：行内展示结构化失败原因', async () => {
        aiStore = new FakeAiConfigStore(
            snapshot({
                models: [model({ id: 'model-local' })],
                defaultModelId: 'model-local'
            })
        )
        overrides.chat = () => ({
            ok: false,
            code: 'AI_NOT_CONFIGURED',
            message: 'AI 助手未启用或缺少可用模型'
        })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.ai-test-model-btn').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-test-result"]').text()).toContain(
            'AI 助手未启用或缺少可用模型'
        )
    })

    it('保存失败：展示结构化失败原因且表单保持打开', async () => {
        overrides.saveConfig = () => ({
            ok: false,
            code: 'AI_CONFIG_STORE_FAILED',
            message: '配置写入失败'
        })
        const wrapper = mountPanel()
        await flushPromises()
        await openAddForm(wrapper)
        await wrapper.find('#ai-model-form-name').setValue('本地 Qwen')
        await wrapper.find('#ai-model-form-model').setValue('qwen2.5')
        await wrapper.find('[data-testid="ai-model-form"]').trigger('submit')
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.saveFailed', { error: '配置写入失败' })
        )
        expect(wrapper.find('[data-testid="ai-model-form"]').exists()).toBe(true)
    })

    it('读取配置旧结构（缺 models 数组）：展示读取失败提示，不崩溃', async () => {
        overrides.getConfig = () => ({
            enabled: true,
            provider: 'local',
            localProvider: 'ollama',
            baseUrl: '',
            model: 'qwen2.5',
            apiKeyConfigured: false,
            apiKeyStorage: 'safe'
        })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.loadFailed', { error: t('common.unknown') })
        )
        expect(wrapper.find('[data-testid="ai-models-empty"]').exists()).toBe(true)
    })
})

describe('AiAssistantPanel：MCP 状态展示与配置', () => {
    it('停止态：徽标 + 只读工具清单 + 安全说明，不展示令牌行', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        const status = wrapper.find('[data-testid="mcp-server-status"]').text()
        expect(status).toContain(t('dialogRenderer.aiAssistant.mcpStopped'))
        expect(status).not.toContain(t('dialogRenderer.aiAssistant.mcpPort'))
        const tools = wrapper.findAll('.mcp-tool-item')
        expect(tools).toHaveLength(7)
        expect(tools.map((item) => item.text())).toEqual([
            'search_wiki',
            'read_page',
            'list_pages',
            'read_schema',
            'list_tags',
            'get_backlinks',
            'read_raw'
        ])
        expect(wrapper.find('.mcp-security-note').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpSecurityNote')
        )
        expect(wrapper.find('.mcp-restart-hint').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpRestartHint')
        )
        expect(wrapper.find('.mcp-token-row').exists()).toBe(false)
        expect((wrapper.find('#mcp-server-enabled').element as HTMLInputElement).checked).toBe(
            false
        )
    })

    it('运行态：展示端口 / URL / 令牌，复制与重置令牌按钮可用，端口配置同步首选端口', async () => {
        mcpState = runningStatus()
        const wrapper = mountPanel()
        await flushPromises()

        const status = wrapper.find('[data-testid="mcp-server-status"]').text()
        expect(status).toContain(t('dialogRenderer.aiAssistant.mcpRunning'))
        expect(status).toContain('3847')
        expect(status).toContain('http://127.0.0.1:3847/mcp')
        expect(wrapper.find('.mcp-token-value').text()).toBe(RUNNING_TOKEN)
        expect(wrapper.find('.mcp-copy-token').exists()).toBe(true)
        expect(wrapper.find('.mcp-regenerate-token').exists()).toBe(true)
        // preferredPort=3847：自动勾选关闭、端口输入回填
        expect((wrapper.find('#mcp-port-auto').element as HTMLInputElement).checked).toBe(false)
        expect((wrapper.find('#mcp-port-input').element as HTMLInputElement).value).toBe('3847')
    })

    it('启用：开关立即调用 SET_ENABLED（自动端口 = null），成功后展示运行态与令牌', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('#mcp-server-enabled').setValue(true)
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([
            [IPC.MCP.SET_ENABLED, { enabled: true, port: null }]
        ])
        expect(wrapper.find('[data-testid="mcp-server-status"]').text()).toContain(
            t('dialogRenderer.aiAssistant.mcpRunning')
        )
        expect(wrapper.find('.mcp-token-value').text()).toBe(RUNNING_TOKEN)
        expect((wrapper.find('#mcp-server-enabled').element as HTMLInputElement).checked).toBe(true)
    })

    it('停用：调用 SET_ENABLED({ enabled:false }) 并回到已停止', async () => {
        mcpState = runningStatus()
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('#mcp-server-enabled').setValue(false)
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([[IPC.MCP.SET_ENABLED, { enabled: false }]])
        expect(wrapper.find('[data-testid="mcp-server-status"]').text()).toContain(
            t('dialogRenderer.aiAssistant.mcpStopped')
        )
        expect(wrapper.find('.mcp-token-row').exists()).toBe(false)
    })

    it('固定端口：停止时仅记录（不发 IPC），启用时随 SET_ENABLED 提交端口', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        await setFixedMcpPort(wrapper, '4100')
        await wrapper.find('.mcp-apply-port-btn').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="mcp-success"]').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpPortPending')
        )
        expect(callsOf(IPC.MCP.SET_ENABLED)).toHaveLength(0)

        await wrapper.find('#mcp-server-enabled').setValue(true)
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([
            [IPC.MCP.SET_ENABLED, { enabled: true, port: 4100 }]
        ])
        expect(wrapper.find('[data-testid="mcp-server-status"]').text()).toContain('4100')
    })

    it('运行中应用端口：按新端口重启并回填首选端口', async () => {
        mcpState = runningStatus()
        const wrapper = mountPanel()
        await flushPromises()

        await setFixedMcpPort(wrapper, '4200')
        await wrapper.find('.mcp-apply-port-btn').trigger('click')
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([
            [IPC.MCP.SET_ENABLED, { enabled: true, port: 4200 }]
        ])
        expect(wrapper.find('[data-testid="mcp-server-status"]').text()).toContain('4200')
    })

    it('非法端口：展示校验提示且不发起 IPC', async () => {
        const wrapper = mountPanel()
        await flushPromises()
        await setFixedMcpPort(wrapper, '0')
        await wrapper.find('.mcp-apply-port-btn').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="mcp-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpPortInvalid')
        )
        expect(callsOf(IPC.MCP.SET_ENABLED)).toHaveLength(0)
    })

    it('重置令牌：调用 SET_ENABLED({ enabled:true, regenerateToken:true }) 并更新令牌展示', async () => {
        mcpState = runningStatus()
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.mcp-regenerate-token').trigger('click')
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([
            [IPC.MCP.SET_ENABLED, { enabled: true, regenerateToken: true }]
        ])
        expect(wrapper.find('.mcp-token-value').text()).toBe('new-token')
        expect(wrapper.find('[data-testid="mcp-success"]').text()).toBe(
            t('dialogRenderer.aiAssistant.saved')
        )
    })

    it('复制令牌：写入系统剪贴板并显示「已复制」', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true
        })
        mcpState = runningStatus()
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.mcp-copy-token').trigger('click')
        await flushPromises()

        expect(writeText).toHaveBeenCalledWith(RUNNING_TOKEN)
        expect(wrapper.find('.mcp-copy-token').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpTokenCopied')
        )
    })

    it('启停失败（ok=false）：开关回退并展示主进程原因', async () => {
        overrides.setMcpEnabled = () => ({
            ok: false,
            error: '端口 3847 被占用',
            status: stoppedStatus()
        })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('#mcp-server-enabled').setValue(true)
        await flushPromises()

        expect((wrapper.find('#mcp-server-enabled').element as HTMLInputElement).checked).toBe(
            false
        )
        expect(wrapper.find('[data-testid="mcp-error"]').text()).toContain('端口 3847 被占用')
        expect(wrapper.find('[data-testid="mcp-server-status"]').text()).toContain(
            t('dialogRenderer.aiAssistant.mcpStopped')
        )
    })

    it('MCP 状态结构非法：展示降级提示，不渲染脏数据', async () => {
        overrides.getMcpStatus = () => ({ ok: true })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="mcp-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpUnavailable')
        )
        expect(wrapper.find('.mcp-token-value').exists()).toBe(false)
    })
})

describe('AiAssistantPanel：环境降级', () => {
    it('受限 ipcRenderer 不可用：AI 与 MCP 均展示不可用提示并禁用操作', async () => {
        vi.stubGlobal('electron', undefined)
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="ai-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.unavailable')
        )
        expect((wrapper.find('.ai-add-model-btn').element as HTMLButtonElement).disabled).toBe(true)
        expect(wrapper.find('[data-testid="mcp-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpUnavailable')
        )
        expect((wrapper.find('#mcp-server-enabled').element as HTMLInputElement).disabled).toBe(
            true
        )
    })
})
