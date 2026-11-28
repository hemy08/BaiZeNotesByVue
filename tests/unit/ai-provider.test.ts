/**
 * 1.5.7 LLM Wiki L3：AI Provider 单测（`src/main/ai/providers/**` + factory）
 *
 * 全部使用注入的 fetch 替身，不发起真实网络请求；覆盖：
 * 1. 本地 Ollama：成功 / 401 鉴权失败 / 404 模型不存在 / 429 限流 / 非 JSON / 空内容 /
 *    网络不可达 / 超时 / 外部取消 / 连接测试（模型存在、列表为空、模型缺失三种）；
 * 2. OpenAI 兼容（远程 BYOK 与本地 LM Studio 共用）：成功（含 Authorization 头）/
 *    401 / 模型不存在 / 连接测试（模型存在、列表为空、缺少配置模型、/models 404/405 可达性回退）；
 * 3. 工厂：默认基址解析、模型/基址/远程密钥缺失 → AI_NOT_CONFIGURED（不发请求）；
 * 4. 错误消息不含密钥（安全断言）。
 */
import { describe, it, expect, vi } from 'vitest'
import type { AiFetchLike, AiHttpResponseLike } from '../../src/main/ai/providers/types'
import { createOllamaProvider } from '../../src/main/ai/providers/ollama'
import { createOpenAiCompatibleProvider } from '../../src/main/ai/providers/openai-compatible'
import { createAiProvider, resolveAiModel } from '../../src/main/ai/providers/factory'
import { AiProviderError } from '../../src/main/ai/errors'
import type { AiModelConfig, AiStoredConfig } from '../../src/shared/types/ai'
import { AI_DEFAULT_CONFIG } from '../../src/shared/constants/ai'

/** 构造模型配置（默认本地 Ollama） */
function makeModel(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
    return {
        id: 'model-a',
        name: '模型 A',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: 'qwen2.5',
        ...overrides
    }
}

/** 构造多模型配置 */
function makeConfig(overrides: Partial<AiStoredConfig> = {}): AiStoredConfig {
    return { enabled: true, models: [makeModel()], defaultModelId: 'model-a', ...overrides }
}

/** 构造 fetch 响应替身 */
function response(status: number, body: unknown): AiHttpResponseLike {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: '',
        text: async () => text
    }
}

/** 断言抛出的 AiProviderError code（返回错误便于进一步断言消息） */
async function expectProviderError(
    action: () => Promise<unknown>,
    code: string
): Promise<AiProviderError> {
    try {
        await action()
    } catch (error) {
        expect(error).toBeInstanceOf(AiProviderError)
        const providerError = error as AiProviderError
        expect(providerError.code).toBe(code)
        return providerError
    }
    throw new Error(`期望抛出 AiProviderError(${code})，但调用成功返回`)
}

/** 永不返回、仅在 signal 中止时拒绝的 fetch 替身（模拟慢服务） */
const hangingFetch: AiFetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
        })
    })

describe('Ollama Provider（本地）', () => {
    it('chat 成功：POST /api/chat，stream=false，返回 message.content', async () => {
        const fetchImpl = vi
            .fn<AiFetchLike>()
            .mockResolvedValue(
                response(200, { message: { role: 'assistant', content: '  你好，白泽  ' } })
            )
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl
        })
        const result = await provider.chat([{ role: 'user', content: 'hi' }])
        expect(result).toEqual({ content: '你好，白泽', model: 'qwen2.5' })
        const [url, init] = fetchImpl.mock.calls[0]
        expect(url).toBe('http://127.0.0.1:11434/api/chat')
        expect(init.method).toBe('POST')
        expect(init.redirect).toBe('error')
        expect(JSON.parse(init.body as string)).toEqual({
            model: 'qwen2.5',
            messages: [{ role: 'user', content: 'hi' }],
            stream: false
        })
    })

    it('401 → AI_AUTH_ERROR', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(response(401, { error: 'denied' }))
        })
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_AUTH_ERROR'
        )
    })

    it('404（模型不存在）→ AI_MODEL_NOT_FOUND', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'missing-model',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockResolvedValue(response(404, { error: "model 'missing-model' not found" }))
        })
        const error = await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_MODEL_NOT_FOUND'
        )
        expect(error.message).toContain('未找到模型')
    })

    it('429 → AI_RATE_LIMITED', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(response(429, { error: 'busy' }))
        })
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_RATE_LIMITED'
        )
    })

    it('非 JSON 响应 → AI_INVALID_RESPONSE', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(response(200, 'not-json'))
        })
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_INVALID_RESPONSE'
        )
    })

    it('空内容 → AI_EMPTY_RESPONSE', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockResolvedValue(response(200, { message: { content: '   ' } }))
        })
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_EMPTY_RESPONSE'
        )
    })

    it('网络不可达（fetch 抛 TypeError）→ AI_NETWORK_ERROR', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'))
        })
        const error = await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_NETWORK_ERROR'
        )
        expect(error.message).toContain('网络不可达')
    })

    it('超时（timeoutMs 到点）→ AI_TIMEOUT', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: hangingFetch
        })
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }], { timeoutMs: 20 }),
            'AI_TIMEOUT'
        )
    })

    it('外部取消（signal 已中止）→ AI_CANCELED', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: hangingFetch
        })
        const controller = new AbortController()
        controller.abort()
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }], { signal: controller.signal }),
            'AI_CANCELED'
        )
    })

    it('连接测试：GET /api/tags 且模型存在 → 返回模型与耗时（已校验模型）', async () => {
        const fetchImpl = vi
            .fn<AiFetchLike>()
            .mockResolvedValue(response(200, { models: [{ name: 'qwen2.5:latest' }] }))
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl
        })
        const result = await provider.testConnection()
        expect(result.model).toBe('qwen2.5')
        expect(result.latencyMs).toBeGreaterThanOrEqual(0)
        expect(result.modelChecked).toBe(true)
        expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags')
    })

    it('连接测试：服务可达但未安装任何模型（models 为空）→ AI_MODEL_NOT_FOUND（不再误报成功）', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(response(200, { models: [] }))
        })
        const error = await expectProviderError(
            () => provider.testConnection(),
            'AI_MODEL_NOT_FOUND'
        )
        expect(error.message).toContain('未安装任何模型')
        expect(error.message).toContain('ollama pull qwen2.5')
        expect(error.message).toContain('当前配置模型：qwen2.5')
    })

    it('连接测试：本地无该模型 → AI_MODEL_NOT_FOUND（提示 ollama pull）', async () => {
        const provider = createOllamaProvider({
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockResolvedValue(response(200, { models: [{ name: 'llama3:latest' }] }))
        })
        const error = await expectProviderError(
            () => provider.testConnection(),
            'AI_MODEL_NOT_FOUND'
        )
        expect(error.message).toContain('ollama pull')
    })
})

describe('OpenAI 兼容 Provider（远程 BYOK / 本地 LM Studio）', () => {
    it('chat 成功：POST /chat/completions，带 Bearer 密钥，解析 choices[0].message.content', async () => {
        const fetchImpl = vi
            .fn<AiFetchLike>()
            .mockResolvedValue(
                response(200, { choices: [{ message: { role: 'assistant', content: ' pong ' } }] })
            )
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat',
            apiKey: 'sk-test-key',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl
        })
        const result = await provider.chat([{ role: 'user', content: 'ping' }])
        expect(result).toEqual({ content: 'pong', model: 'deepseek-chat' })
        const [url, init] = fetchImpl.mock.calls[0]
        expect(url).toBe('https://api.example.com/v1/chat/completions')
        expect(init.headers.Authorization).toBe('Bearer sk-test-key')
        expect(init.redirect).toBe('error')
    })

    it('无密钥（本地 LM Studio）不发送 Authorization 头', async () => {
        const fetchImpl = vi
            .fn<AiFetchLike>()
            .mockResolvedValue(response(200, { choices: [{ message: { content: 'ok' } }] }))
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'http://127.0.0.1:1234/v1',
            model: 'local-model',
            apiKey: null,
            serviceName: '本地 LM Studio',
            fetchImpl
        })
        await provider.chat([{ role: 'user', content: 'hi' }])
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined()
    })

    it('401 → AI_AUTH_ERROR（消息不含密钥）', async () => {
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat',
            apiKey: 'sk-secret-should-not-leak',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(response(401, { error: 'bad key' }))
        })
        const error = await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_AUTH_ERROR'
        )
        expect(error.message).not.toContain('sk-secret-should-not-leak')
        expect(JSON.stringify(error.message)).not.toContain('sk-secret-should-not-leak')
    })

    it('404 且响应提示模型缺失 → AI_MODEL_NOT_FOUND', async () => {
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://api.example.com/v1',
            model: 'no-such-model',
            apiKey: 'sk-key',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(
                response(404, {
                    error: { message: 'The model `no-such-model` does not exist' }
                })
            )
        })
        await expectProviderError(
            () => provider.chat([{ role: 'user', content: 'hi' }]),
            'AI_MODEL_NOT_FOUND'
        )
    })

    it('连接测试：GET /models 且模型存在 → 成功（已校验模型）', async () => {
        const fetchImpl = vi
            .fn<AiFetchLike>()
            .mockResolvedValue(response(200, { data: [{ id: 'deepseek-chat' }] }))
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat',
            apiKey: 'sk-key',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl
        })
        const result = await provider.testConnection()
        expect(result.model).toBe('deepseek-chat')
        expect(result.modelChecked).toBe(true)
        expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.com/v1/models')
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-key')
    })

    it('连接测试：服务可达但模型列表为空 → AI_MODEL_NOT_FOUND（不再误报成功）', async () => {
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'http://127.0.0.1:1234/v1',
            model: 'qwen2.5',
            apiKey: null,
            serviceName: '本地 LM Studio',
            fetchImpl: vi.fn<AiFetchLike>().mockResolvedValue(response(200, { data: [] }))
        })
        const error = await expectProviderError(
            () => provider.testConnection(),
            'AI_MODEL_NOT_FOUND'
        )
        expect(error.message).toContain('未加载任何模型')
        expect(error.message).toContain('当前配置模型：qwen2.5')
    })

    it('连接测试：/models 不存在（404）时按可达通过（标记未校验模型）', async () => {
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://self-hosted.example.com/v1',
            model: 'any-model',
            apiKey: 'sk-key',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockResolvedValue(response(404, { error: 'route not found' }))
        })
        const result = await provider.testConnection()
        expect(result.model).toBe('any-model')
        expect(result.modelChecked).toBe(false)
    })

    it('连接测试：/models 方法不允许（405）时同样按可达通过（标记未校验模型）', async () => {
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://self-hosted.example.com/v1',
            model: 'any-model',
            apiKey: 'sk-key',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockResolvedValue(response(405, { error: 'Method Not Allowed' }))
        })
        const result = await provider.testConnection()
        expect(result.model).toBe('any-model')
        expect(result.modelChecked).toBe(false)
    })

    it('连接测试：/models 返回模型列表但缺少配置模型 → AI_MODEL_NOT_FOUND', async () => {
        const provider = createOpenAiCompatibleProvider({
            baseUrl: 'https://api.example.com/v1',
            model: 'missing-model',
            apiKey: 'sk-key',
            serviceName: '远程 OpenAI 兼容接口',
            fetchImpl: vi
                .fn<AiFetchLike>()
                .mockResolvedValue(response(200, { data: [{ id: 'other-model' }] }))
        })
        await expectProviderError(() => provider.testConnection(), 'AI_MODEL_NOT_FOUND')
    })
})

describe('模型解析（resolveAiModel，多模型 + 默认模型）', () => {
    it('缺省使用 defaultModelId', () => {
        const config = makeConfig({
            models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb', model: 'deepseek-chat' })],
            defaultModelId: 'bb'
        })
        expect(resolveAiModel(config).id).toBe('bb')
    })

    it('显式 modelId 优先于 defaultModelId', () => {
        const config = makeConfig({
            models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb' })],
            defaultModelId: 'bb'
        })
        expect(resolveAiModel(config, 'aa').id).toBe('aa')
    })

    it('显式 modelId 不存在 → AI_MODEL_NOT_FOUND', () => {
        try {
            resolveAiModel(makeConfig(), 'ghost')
            throw new Error('应抛错')
        } catch (error) {
            expect(error).toBeInstanceOf(AiProviderError)
            expect((error as AiProviderError).code).toBe('AI_MODEL_NOT_FOUND')
        }
    })

    it('模型列表为空 → AI_NOT_CONFIGURED', () => {
        expect(() => resolveAiModel({ ...AI_DEFAULT_CONFIG, enabled: true })).toThrowError(
            AiProviderError
        )
        try {
            resolveAiModel({ ...AI_DEFAULT_CONFIG, enabled: true })
        } catch (error) {
            expect((error as AiProviderError).code).toBe('AI_NOT_CONFIGURED')
            expect((error as AiProviderError).message).toContain('模型')
        }
    })

    it('未设置默认模型（defaultModelId=null）→ AI_NOT_CONFIGURED', () => {
        const config = makeConfig({ models: [makeModel()], defaultModelId: null })
        try {
            resolveAiModel(config)
            throw new Error('应抛错')
        } catch (error) {
            expect((error as AiProviderError).code).toBe('AI_NOT_CONFIGURED')
            expect((error as AiProviderError).message).toContain('默认模型')
        }
    })

    it('defaultModelId 指向不存在的模型 → 归一化回落首个模型', () => {
        const config = makeConfig({
            models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb' })],
            defaultModelId: 'ghost'
        })
        expect(resolveAiModel(config).id).toBe('aa')
    })
})

describe('Provider 工厂（createAiProvider，单模型维度）', () => {
    it('本地默认基址：Ollama 使用 127.0.0.1:11434', () => {
        const provider = createAiProvider(makeModel(), null, {
            fetchImpl: vi.fn<AiFetchLike>()
        })
        expect(provider.id).toBe('ollama')
    })

    it('本地 LM Studio 默认基址：走 OpenAI 兼容实现', () => {
        const provider = createAiProvider(
            makeModel({ localProvider: 'lmstudio', model: 'llama3' }),
            null,
            { fetchImpl: vi.fn<AiFetchLike>() }
        )
        expect(provider.id).toBe('openai-compatible')
    })

    it('缺少模型名 → AI_NOT_CONFIGURED（不发请求）', () => {
        try {
            createAiProvider(makeModel({ model: '' }), null)
            throw new Error('应抛错')
        } catch (error) {
            expect((error as AiProviderError).code).toBe('AI_NOT_CONFIGURED')
            expect((error as AiProviderError).message).toContain('模型')
        }
    })

    it('远程缺 baseUrl → AI_NOT_CONFIGURED', () => {
        try {
            createAiProvider(makeModel({ provider: 'remote', model: 'deepseek-chat' }), 'sk-key')
            throw new Error('应抛错')
        } catch (error) {
            expect((error as AiProviderError).code).toBe('AI_NOT_CONFIGURED')
            expect((error as AiProviderError).message).toContain('基址')
        }
    })

    it('远程缺 API Key → AI_NOT_CONFIGURED（提示密钥安全存储）', () => {
        try {
            createAiProvider(
                makeModel({
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat'
                }),
                null
            )
            throw new Error('应抛错')
        } catch (error) {
            expect((error as AiProviderError).code).toBe('AI_NOT_CONFIGURED')
            expect((error as AiProviderError).message).toContain('API Key')
        }
    })

    it('用户自填 baseUrl 优先于默认值（去尾部斜杠）', async () => {
        const fetchImpl = vi
            .fn<AiFetchLike>()
            .mockResolvedValue(response(200, { message: { content: 'ok' } }))
        const provider = createAiProvider(makeModel({ baseUrl: 'http://127.0.0.1:9999/' }), null, {
            fetchImpl
        })
        await provider.chat([{ role: 'user', content: 'hi' }])
        expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:9999/api/chat')
    })
})
