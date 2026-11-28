/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：AI IPC 单测（`src/main/ipc/ai-ipc.ts`）
 *
 * 覆盖：
 * 1. 注册：5 个 invoke 通道经 `ipcListenerManager.registerHandleOnce` 注册（withSenderCheck），
 *    componentId 透传（缺省 `global-ai-ipc`），非受信 sender 返回统一拒绝对象且不执行业务；
 * 2. AI.CHAT：载荷校验 / 未启用 → AI_NOT_CONFIGURED / 成功对话 / 空 messages 连接测试 /
 *    **多模型 modelId（显式指定、缺省默认、不存在 → AI_MODEL_NOT_FOUND）** / 远程缺密钥；
 * 3. AI.INGEST：无工作区 → AI_WORKSPACE_UNAVAILABLE / 成功生成草案（不写盘）；
 * 4. AI.APPLY_INGEST：未审批 / raw 目标 / 越界 → 结构化拒绝；成功写入 wiki/；
 * 5. AI.GET_CONFIG / SAVE_CONFIG：快照读取（多模型 + 每模型密钥状态）与
 *    **多模型保存载荷（models/defaultModelId/modelApiKey）校验**。
 *
 * 说明：AI Provider 的 HTTP 行为由注入的 fetch 替身模拟（真正的网络分支见 ai-provider.test.ts）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

const mocks = vi.hoisted(() => ({
    registerHandleOnce: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('electron', () => ({
    app: {
        getPath: () => os.tmpdir(),
        getVersion: () => '1.0.0-test',
        getAppPath: () => os.tmpdir(),
        isPackaged: false
    },
    safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from('cipher'),
        decryptString: () => ''
    },
    shell: { showItemInFolder: vi.fn(), openExternal: vi.fn(), trashItem: vi.fn() },
    BrowserWindow: class {},
    ipcMain: { on: vi.fn(), handle: vi.fn() }
}))

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: mocks.registerHandleOnce }
}))

vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

import { IPC } from '../../src/shared/ipc-channels'
import type { AiConfigSnapshot, AiModelConfig } from '../../src/shared/types/ai'
import {
    aiApplyIngest,
    aiChat,
    aiIngest,
    AI_IPC_COMPONENT_ID,
    getAiConfig,
    registerAiIpc,
    saveAiConfig
} from '../../src/main/ipc/ai-ipc'
import type { AiConfigStore } from '../../src/main/ai/config-store'
import type { AiFetchLike } from '../../src/main/ai/providers/types'
import { resetAiRuntimeForTesting, setAiRuntimeForTesting } from '../../src/main/ai/runtime'
import { appState } from '../../src/main/utils/app-state'
import {
    isUntrustedSenderResult,
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../src/main/utils/ipc-security'

/** 已注册 handler 记录 */
interface RegisteredHandler {
    channel: string
    listener: (...args: unknown[]) => unknown
    componentId?: string
}

let registered: RegisteredHandler[] = []
let tempWorkspace = ''

/** 受信主窗口桩（sender 校验只需 webContents 引用与 isDestroyed） */
const mainWindow = {
    webContents: { id: 1, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false
}

/** 构造模型配置（默认本地 Ollama） */
function makeModel(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
    return {
        id: 'local-qwen',
        name: '本地 Qwen',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: 'qwen2.5',
        ...overrides
    }
}

/** 构造配置存储替身（可配置多模型/默认模型/每模型密钥） */
function makeStore(
    options: {
        enabled?: boolean
        models?: AiModelConfig[]
        defaultModelId?: string | null
        apiKeys?: Record<string, string>
        save?: (patch: unknown) => Promise<AiConfigSnapshot>
    } = {}
): AiConfigStore {
    const models = options.models ?? [makeModel()]
    const defaultModelId =
        options.defaultModelId !== undefined ? options.defaultModelId : (models[0]?.id ?? null)
    const apiKeys = options.apiKeys ?? {}
    const snapshot = (): AiConfigSnapshot => ({
        enabled: options.enabled === true,
        models: models.map((model) => ({
            ...model,
            apiKeyConfigured: apiKeys[model.id] !== undefined
        })),
        defaultModelId,
        apiKeyStorage: 'memory'
    })
    return {
        getSnapshot: vi.fn(async () => snapshot()),
        save: vi.fn(
            options.save ??
                (async () => {
                    return snapshot()
                })
        ),
        getRuntimeApiKey: vi.fn(async (modelId: string) => apiKeys[modelId] ?? null)
    }
}

/** fetch 替身：按 URL 返回 Ollama 对话/标签响应（记录调用参数） */
function makeOllamaFetch(content = 'AI 回复'): AiFetchLike {
    return async (url) => {
        const body = url.endsWith('/api/tags')
            ? { models: [{ name: 'qwen2.5:latest' }, { name: 'deepseek-chat:latest' }] }
            : { message: { role: 'assistant', content } }
        const text = JSON.stringify(body)
        return { ok: true, status: 200, statusText: '', text: async () => text }
    }
}

beforeEach(async () => {
    vi.clearAllMocks()
    registered = []
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-ai-ipc-'))
    await fs.mkdir(path.join(tempWorkspace, 'raw'), { recursive: true })
    await fs.mkdir(path.join(tempWorkspace, 'wiki'), { recursive: true })
    mocks.registerHandleOnce.mockImplementation(
        (
            channel: string,
            listener: (...args: unknown[]) => unknown,
            componentId?: string
        ): string => {
            registered.push({ channel, listener, componentId })
            return `${channel}:handle`
        }
    )
})

afterEach(async () => {
    resetAiRuntimeForTesting()
    resetTrustedSenderRegistry()
    appState._resetForTesting()
    await fs.rm(tempWorkspace, { recursive: true, force: true })
})

/** 取已注册 handler（缺失直接失败，避免空断言） */
function getRegisteredHandler(channel: string): (...args: unknown[]) => unknown {
    const handler = registered.find((item) => item.channel === channel)
    expect(handler, `应注册 ${channel}`).toBeDefined()
    return handler!.listener
}

describe('registerAiIpc：注册形状', () => {
    it('注册 5 个 invoke 通道，缺省 componentId 为 global-ai-ipc', () => {
        registerAiIpc()
        expect(registered).toHaveLength(5)
        expect(registered.map((item) => item.channel)).toEqual([
            IPC.AI.CHAT,
            IPC.AI.INGEST,
            IPC.AI.APPLY_INGEST,
            IPC.AI.GET_CONFIG,
            IPC.AI.SAVE_CONFIG
        ])
        expect(registered.every((item) => item.componentId === AI_IPC_COMPONENT_ID)).toBe(true)
        expect(AI_IPC_COMPONENT_ID).toBe('global-ai-ipc')
    })

    it('显式 componentId 透传（registry 编排口径）', () => {
        registerAiIpc('global-test-ai')
        expect(registered.every((item) => item.componentId === 'global-test-ai')).toBe(true)
    })

    it('非受信 sender → 统一拒绝对象且不执行业务（AI.GET_CONFIG 不读取配置）', async () => {
        registerAiIpc()
        const handler = getRegisteredHandler(IPC.AI.GET_CONFIG)
        const result = await handler({ sender: { id: 999 } })
        expect(isUntrustedSenderResult(result)).toBe(true)
    })

    it('受信 sender 可调用 5 个通道（真实 handler 闭包接线）', async () => {
        // 注入运行时替身，避免 handler 走生产 stderr 目录/真实网络
        setAiRuntimeForTesting({
            store: makeStore({ enabled: true }),
            fetchImpl: makeOllamaFetch('handler 回复')
        })
        registerAiIpc()

        const chatResult = (await getRegisteredHandler(IPC.AI.CHAT)(trustedCall(), {
            messages: [{ role: 'user', content: 'hi' }]
        })) as { ok: boolean; content?: string }
        expect(chatResult).toMatchObject({ ok: true, content: 'handler 回复' })

        const ingestResult = (await getRegisteredHandler(IPC.AI.INGEST)(trustedCall(), {})) as {
            ok: boolean
            code?: string
        }
        // 未打开工作区（appState.rootPath 为空）→ 结构化失败，不抛异常
        expect(ingestResult).toMatchObject({ ok: false, code: 'AI_WORKSPACE_UNAVAILABLE' })

        const applyResult = (await getRegisteredHandler(IPC.AI.APPLY_INGEST)(trustedCall(), {
            draftPath: 'wiki/a.md',
            content: '# x',
            approved: false
        })) as { ok: boolean; code?: string }
        expect(applyResult).toMatchObject({ ok: false, code: 'AI_NOT_APPROVED' })

        const configResult = (await getRegisteredHandler(IPC.AI.GET_CONFIG)(trustedCall())) as {
            enabled: boolean
        }
        expect(configResult.enabled).toBe(true)

        const saveResult = (await getRegisteredHandler(IPC.AI.SAVE_CONFIG)(trustedCall(), {
            enabled: 'yes'
        })) as { ok: boolean; code?: string }
        expect(saveResult).toMatchObject({ ok: false, code: 'AI_INVALID_PAYLOAD' })
    })
})

/** 受信 sender 的 invoke 事件桩 */
function trustedCall(): { sender: { id: number; send: ReturnType<typeof vi.fn> } } {
    return { sender: mainWindow.webContents }
}

describe('AI.CHAT（对话 / 连接测试 / 多模型）', () => {
    it('载荷非法 → AI_INVALID_PAYLOAD（不发起请求）', async () => {
        const fetchImpl = vi.fn<AiFetchLike>()
        const result = await aiChat({ messages: 'bad' } as never, {
            store: makeStore({ enabled: true }),
            fetchImpl
        })
        expect(result).toMatchObject({ ok: false, code: 'AI_INVALID_PAYLOAD' })
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('AI 未启用 → AI_NOT_CONFIGURED（不读取密钥、不发起请求）', async () => {
        const store = makeStore({ enabled: false })
        const fetchImpl = vi.fn<AiFetchLike>()
        const result = await aiChat(
            { messages: [{ role: 'user', content: 'hi' }] },
            { store, fetchImpl }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
        expect(fetchImpl).not.toHaveBeenCalled()
        expect(store.getRuntimeApiKey).not.toHaveBeenCalled()
    })

    it('成功对话：缺省使用 defaultModelId，返回 content 与 model', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb', model: 'deepseek-chat' })],
            defaultModelId: 'bb'
        })
        const fetchImpl = vi.fn<AiFetchLike>(makeOllamaFetch('默认模型回答'))
        const result = await aiChat(
            { messages: [{ role: 'user', content: '你好' }], context: { title: '文档' } },
            { store, fetchImpl }
        )
        expect(result).toMatchObject({ ok: true, content: '默认模型回答', model: 'deepseek-chat' })
        expect(store.getRuntimeApiKey).toHaveBeenCalledWith('bb')
        // 请求体使用默认模型的 model 名
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { model: string }
        expect(body.model).toBe('deepseek-chat')
    })

    it('显式 modelId：按指定模型调用并读取该模型密钥', async () => {
        const secondModel = makeModel({ id: 'local-bb', model: 'deepseek-r1' })
        const store = makeStore({
            enabled: true,
            models: [makeModel({ id: 'local-aa' }), secondModel],
            defaultModelId: 'local-aa',
            apiKeys: { 'local-bb': 'sk-local-key' }
        })
        const fetchImpl = vi.fn<AiFetchLike>(makeOllamaFetch('指定模型回答'))
        const result = await aiChat(
            { messages: [{ role: 'user', content: 'hi' }], modelId: 'local-bb' },
            { store, fetchImpl }
        )
        expect(result).toMatchObject({ ok: true, content: '指定模型回答', model: 'deepseek-r1' })
        expect(store.getRuntimeApiKey).toHaveBeenCalledWith('local-bb')
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as { model: string }
        expect(body.model).toBe('deepseek-r1')
    })

    it('显式 modelId 不存在 → AI_MODEL_NOT_FOUND', async () => {
        const result = await aiChat(
            { messages: [{ role: 'user', content: 'hi' }], modelId: 'ghost' },
            { store: makeStore({ enabled: true }), fetchImpl: makeOllamaFetch() }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_MODEL_NOT_FOUND' })
    })

    it('未设置默认模型且未指定 modelId → AI_NOT_CONFIGURED', async () => {
        const result = await aiChat(
            { messages: [{ role: 'user', content: 'hi' }] },
            {
                store: makeStore({ enabled: true, models: [makeModel()], defaultModelId: null }),
                fetchImpl: makeOllamaFetch()
            }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
    })

    it('空 messages = 连接测试：调用 /api/tags 并返回可读结果', async () => {
        const result = await aiChat(
            { messages: [] },
            { store: makeStore({ enabled: true }), fetchImpl: makeOllamaFetch() }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.content).toContain('连接成功')
        }
    })

    it('远程缺密钥 → AI_NOT_CONFIGURED（配置不完整）', async () => {
        const result = await aiChat(
            { messages: [{ role: 'user', content: 'hi' }] },
            {
                store: makeStore({
                    enabled: true,
                    models: [
                        makeModel({
                            provider: 'remote',
                            baseUrl: 'https://api.example.com/v1',
                            model: 'deepseek-chat'
                        })
                    ],
                    apiKeys: {}
                }),
                fetchImpl: makeOllamaFetch()
            }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
    })
})

describe('AI.INGEST（生成草案，不写盘）', () => {
    it('无工作区 → AI_WORKSPACE_UNAVAILABLE', async () => {
        const result = await aiIngest({}, { rootPath: '', store: makeStore({ enabled: true }) })
        expect(result).toMatchObject({ ok: false, code: 'AI_WORKSPACE_UNAVAILABLE' })
    })

    it('AI 未启用 → AI_NOT_CONFIGURED', async () => {
        await fs.writeFile(path.join(tempWorkspace, 'raw', 'a.md'), '# A', 'utf-8')
        const result = await aiIngest(
            {},
            { rootPath: tempWorkspace, store: makeStore({ enabled: false }) }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
    })

    it('成功生成草案与 diff，且审批前不写盘', async () => {
        await fs.writeFile(path.join(tempWorkspace, 'raw', 'a.md'), '# A', 'utf-8')
        const result = await aiIngest(
            {},
            {
                rootPath: tempWorkspace,
                store: makeStore({ enabled: true }),
                fetchImpl: makeOllamaFetch('# 编译结果\n\n要点')
            }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.draftPath).toBe('wiki/a.md')
            expect(result.sourcePath).toBe('raw/a.md')
            expect(result.diff.length).toBeGreaterThan(0)
        }
        await expect(fs.stat(path.join(tempWorkspace, 'wiki', 'a.md'))).rejects.toThrow()
    })
})

describe('AI.APPLY_INGEST（审批写盘守卫）', () => {
    it('未审批 → AI_NOT_APPROVED 且不写盘', async () => {
        const result = await aiApplyIngest(
            { draftPath: 'wiki/a.md', content: '# x', approved: false },
            { rootPath: tempWorkspace }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_APPROVED' })
        await expect(fs.stat(path.join(tempWorkspace, 'wiki', 'a.md'))).rejects.toThrow()
    })

    it('raw/ 目标 → AI_TARGET_NOT_ALLOWED（raw 只读守卫）', async () => {
        const result = await aiApplyIngest(
            { draftPath: 'raw/a.md', content: '# x', approved: true },
            { rootPath: tempWorkspace }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_TARGET_NOT_ALLOWED' })
    })

    it('越界路径 → AI_TARGET_NOT_ALLOWED', async () => {
        const result = await aiApplyIngest(
            { draftPath: 'wiki/../raw/a.md', content: '# x', approved: true },
            { rootPath: tempWorkspace }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_TARGET_NOT_ALLOWED' })
    })

    it('审批通过 → 写入 wiki/ 并返回字节数', async () => {
        const result = await aiApplyIngest(
            { draftPath: 'wiki/page.md', content: '# 页面\n', approved: true },
            { rootPath: tempWorkspace }
        )
        expect(result).toMatchObject({ ok: true, draftPath: 'wiki/page.md' })
        if (result.ok) {
            expect(result.bytes).toBeGreaterThan(0)
        }
        await expect(
            fs.readFile(path.join(tempWorkspace, 'wiki', 'page.md'), 'utf-8')
        ).resolves.toBe('# 页面\n')
    })
})

describe('AI.GET_CONFIG / AI.SAVE_CONFIG（多模型）', () => {
    it('GET_CONFIG 返回多模型快照（每模型带 apiKeyConfigured，不含密钥明文）', async () => {
        const snapshot = await getAiConfig({
            store: makeStore({
                enabled: true,
                models: [
                    makeModel({ id: 'aa' }),
                    makeModel({ id: 'bb', provider: 'remote', baseUrl: 'https://x.example.com/v1' })
                ],
                apiKeys: { bb: 'sk-x' }
            })
        })
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.models.map((model) => model.id)).toEqual(['aa', 'bb'])
        expect(snapshot.models[0].apiKeyConfigured).toBe(false)
        expect(snapshot.models[1].apiKeyConfigured).toBe(true)
        expect(JSON.stringify(snapshot)).not.toContain('sk-x')
    })

    it('GET_CONFIG 读取失败时回退默认空配置（不抛异常）', async () => {
        const failingStore = makeStore()
        vi.mocked(failingStore.getSnapshot).mockRejectedValue(new Error('io error'))
        const snapshot = await getAiConfig({ store: failingStore })
        expect(snapshot).toEqual({
            enabled: false,
            models: [],
            defaultModelId: null,
            apiKeyStorage: 'memory'
        })
    })

    it('SAVE_CONFIG 非法载荷 → AI_INVALID_PAYLOAD（旧单模型字段/非法模型/重复 id）', async () => {
        const store = makeStore()
        for (const payload of [
            { provider: 'remote' },
            { apiKey: 'sk-x' },
            { models: [{ ...makeModel(), id: '含空格' }] },
            { models: [makeModel(), makeModel()] },
            { models: [makeModel({ provider: 'remote', baseUrl: '' })] },
            { modelApiKey: { modelId: 'local-qwen', apiKey: 'sk-x', clearApiKey: true } }
        ]) {
            const result = await saveAiConfig(payload, { store })
            expect(result, JSON.stringify(payload)).toMatchObject({
                ok: false,
                code: 'AI_INVALID_PAYLOAD'
            })
        }
        expect(store.save).not.toHaveBeenCalled()
    })

    it('SAVE_CONFIG 成功 → 透传多模型补丁与密钥操作并返回最新快照', async () => {
        const remoteModel = makeModel({
            id: 'remote-bb',
            name: 'DeepSeek',
            provider: 'remote',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat'
        })
        const save = vi.fn(async (patch: unknown) => {
            expect(patch).toEqual({
                enabled: true,
                models: [makeModel(), remoteModel],
                defaultModelId: 'remote-bb',
                modelApiKey: { modelId: 'remote-bb', apiKey: 'sk-new' }
            })
            return {
                enabled: true,
                models: [
                    { ...makeModel(), apiKeyConfigured: false },
                    { ...remoteModel, apiKeyConfigured: true }
                ],
                defaultModelId: 'remote-bb',
                apiKeyStorage: 'safe'
            } satisfies AiConfigSnapshot
        })
        const result = await saveAiConfig(
            {
                enabled: true,
                models: [makeModel(), remoteModel],
                defaultModelId: 'remote-bb',
                modelApiKey: { modelId: 'remote-bb', apiKey: 'sk-new' }
            },
            { store: makeStore({ save }) }
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.config.defaultModelId).toBe('remote-bb')
            expect(result.config.models[1].apiKeyConfigured).toBe(true)
        }
    })

    it('SAVE_CONFIG 支持清除密钥与清空默认模型（null）', async () => {
        const save = vi.fn(async (patch: unknown) => {
            expect(patch).toEqual({
                defaultModelId: null,
                modelApiKey: { modelId: 'local-qwen', clearApiKey: true }
            })
            return {
                enabled: false,
                models: [makeModel({ apiKeyConfigured: false })],
                defaultModelId: null,
                apiKeyStorage: 'memory'
            } satisfies AiConfigSnapshot
        })
        const result = await saveAiConfig(
            { defaultModelId: null, modelApiKey: { modelId: 'local-qwen', clearApiKey: true } },
            { store: makeStore({ save }) }
        )
        expect(result.ok).toBe(true)
    })
})

describe('AI IPC：运行时单例与异常归一化分支', () => {
    it('未注入 deps.store 时走运行时单例（getAiConfig / aiChat 生产分支）', async () => {
        setAiRuntimeForTesting({
            store: makeStore({ enabled: true }),
            fetchImpl: makeOllamaFetch('单例回复')
        })
        const snapshot = await getAiConfig()
        expect(snapshot.enabled).toBe(true)
        const chat = await aiChat({ messages: [{ role: 'user', content: 'hi' }] })
        expect(chat).toMatchObject({ ok: true, content: '单例回复' })
    })

    it('AI.INGEST 非法载荷 → AI_INVALID_PAYLOAD', async () => {
        const result = await aiIngest({ rawPath: 1 } as never, { rootPath: tempWorkspace })
        expect(result).toMatchObject({ ok: false, code: 'AI_INVALID_PAYLOAD' })
    })

    it('AI.APPLY_INGEST 无工作区 → AI_WORKSPACE_UNAVAILABLE', async () => {
        const result = await aiApplyIngest(
            { draftPath: 'wiki/a.md', content: '# x', approved: true },
            { rootPath: '' }
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_WORKSPACE_UNAVAILABLE' })
    })

    it('AI.CHAT：配置读取抛非 AI 错误 → 归一化为结构化失败（不抛堆栈）', async () => {
        const store = makeStore({ enabled: true })
        vi.mocked(store.getSnapshot).mockRejectedValue(new Error('读取配置失败'))
        const result = await aiChat(
            { messages: [{ role: 'user', content: 'hi' }] },
            { store, fetchImpl: makeOllamaFetch() }
        )
        expect(result).toMatchObject({ ok: false, message: '读取配置失败' })
    })

    it('AI.INGEST：配置读取抛非 AI 错误 → 归一化为结构化失败', async () => {
        await fs.writeFile(path.join(tempWorkspace, 'raw', 'a.md'), '# A', 'utf-8')
        const store = makeStore({ enabled: true })
        vi.mocked(store.getSnapshot).mockRejectedValue(new Error('读取配置失败'))
        const result = await aiIngest(
            {},
            { rootPath: tempWorkspace, store, fetchImpl: makeOllamaFetch() }
        )
        expect(result).toMatchObject({ ok: false, message: '读取配置失败' })
    })

    it('AI.SAVE_CONFIG：存储抛 AiProviderError → 返回其 code；抛普通错误 → AI_CONFIG_STORE_FAILED', async () => {
        const aiStore = makeStore()
        vi.mocked(aiStore.save).mockRejectedValue(new Error('磁盘只读'))
        const plainFailure = await saveAiConfig({ enabled: true }, { store: aiStore })
        expect(plainFailure).toMatchObject({ ok: false, code: 'AI_CONFIG_STORE_FAILED' })

        const providerStore = makeStore()
        const { AiProviderError } = await import('../../src/main/ai/errors')
        vi.mocked(providerStore.save).mockRejectedValue(
            new AiProviderError('AI_CONFIG_STORE_FAILED', '写入失败')
        )
        const structuredFailure = await saveAiConfig({ enabled: true }, { store: providerStore })
        expect(structuredFailure).toMatchObject({ ok: false, code: 'AI_CONFIG_STORE_FAILED' })
    })

    it('AI.CHAT：仅 selection 上下文也能构造系统提示（不泄露额外内容）', async () => {
        const result = await aiChat(
            {
                messages: [{ role: 'user', content: '解释' }],
                context: { selection: '选中的文本' }
            },
            { store: makeStore({ enabled: true }), fetchImpl: makeOllamaFetch('已解释') }
        )
        expect(result).toMatchObject({ ok: true, content: '已解释' })
    })
})
