/**
 * 1.5.7 LLM Wiki L3：本地 Ollama Provider（原生 HTTP API）
 *
 * - 对话：`POST {baseUrl}/api/chat`，请求体 `{ model, messages, stream: false }`，
 *   响应 `{ message: { role, content }, model? }`（非流式；流式本期不做）；
 * - 连接测试：`GET {baseUrl}/api/tags` 列出本地已拉取模型，并校验配置的模型是否可用
 *   （缺失时返回 AI_MODEL_NOT_FOUND，提示先 `ollama pull <model>`）；
 *   **1.5.7 缺陷修复**：模型列表为空（服务可达但未安装任何模型）同样返回
 *   AI_MODEL_NOT_FOUND，不再把「HTTP 200 + 空列表」误报为连接成功；
 * - 默认基址 `http://127.0.0.1:11434`（shared/constants/ai.ts 单一真源），仅本地回环；
 * - 超时/取消/错误归一化全部复用 providers/types.ts 的守卫与映射。
 */
import type { AiChatMessage } from '../../../shared/types/ai'
import type {
    AiFetchLike,
    AiHttpResponseLike,
    AiProvider,
    AiProviderChatResult,
    AiProviderTestResult,
    AiRequestOptions
} from './types'
import {
    AI_CONNECTION_TEST_TIMEOUT_MS,
    defaultAiFetch,
    joinAiEndpoint,
    mapAiHttpError,
    readAiJsonBody,
    readAiResponseText,
    runAiRequestGuarded
} from './types'
import { AiProviderError } from '../errors'

/** Provider 显示名（错误消息/日志用） */
const SERVICE_NAME = '本地 Ollama'

/** 构造 Ollama Provider 的依赖 */
export interface OllamaProviderOptions {
    /** 接口基址（已解析默认值；不带尾部 `/`） */
    baseUrl: string
    /** 模型名（非空） */
    model: string
    /** fetch 实现（单测注入替身） */
    fetchImpl?: AiFetchLike
}

/** 从 /api/chat 响应中提取助手正文（结构非法抛 AI_INVALID_RESPONSE） */
function readOllamaChatContent(payload: unknown): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new AiProviderError('AI_INVALID_RESPONSE', 'Ollama 响应结构非法（期望 JSON 对象）')
    }
    const record = payload as Record<string, unknown>
    if (record.error !== undefined) {
        throw new AiProviderError(
            'AI_HTTP_ERROR',
            `${SERVICE_NAME} 返回错误：${String(record.error).slice(0, 200)}`
        )
    }
    const message = record.message
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new AiProviderError('AI_INVALID_RESPONSE', 'Ollama 响应缺少 message 字段')
    }
    const content = (message as Record<string, unknown>).content
    if (typeof content !== 'string') {
        throw new AiProviderError('AI_INVALID_RESPONSE', 'Ollama 响应缺少 message.content')
    }
    const trimmed = content.trim()
    if (trimmed.length === 0) {
        throw new AiProviderError('AI_EMPTY_RESPONSE', 'Ollama 返回了空内容，请稍后重试')
    }
    return trimmed
}

/** 读取 /api/tags 响应中的模型名列表（结构非法返回空数组，仅用于提示） */
function readOllamaModelNames(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return []
    }
    const models = (payload as Record<string, unknown>).models
    if (!Array.isArray(models)) {
        return []
    }
    const names: string[] = []
    for (const item of models) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue
        }
        const name = (item as Record<string, unknown>).name
        if (typeof name === 'string' && name.length > 0) {
            names.push(name)
        }
    }
    return names
}

/** 模型名匹配（Ollama 的 tags 名称可能带 `:latest` 后缀） */
function modelMatches(configured: string, candidate: string): boolean {
    if (configured === candidate) {
        return true
    }
    const normalizedConfigured = configured.includes(':') ? configured : `${configured}:latest`
    return normalizedConfigured === candidate
}

/**
 * 创建本地 Ollama Provider。
 *
 * @param options 基址/模型/fetch 实现
 */
export function createOllamaProvider(options: OllamaProviderOptions): AiProvider {
    const fetchImpl = options.fetchImpl ?? defaultAiFetch()
    const chatUrl = joinAiEndpoint(options.baseUrl, 'api/chat')
    const tagsUrl = joinAiEndpoint(options.baseUrl, 'api/tags')

    return {
        id: 'ollama',

        async chat(
            messages: AiChatMessage[],
            requestOptions: AiRequestOptions = {}
        ): Promise<AiProviderChatResult> {
            const payload = JSON.stringify({
                model: options.model,
                messages,
                stream: false
            })
            const response = await runAiRequestGuarded(SERVICE_NAME, requestOptions, (signal) =>
                fetchImpl(chatUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    signal,
                    redirect: 'error'
                })
            )
            if (!response.ok) {
                const bodyText = await readAiResponseText(response).catch(() => '')
                throw mapAiHttpError(SERVICE_NAME, response, bodyText)
            }
            const body = await readAiJsonBody(response)
            return { content: readOllamaChatContent(body), model: options.model }
        },

        async testConnection(requestOptions: AiRequestOptions = {}): Promise<AiProviderTestResult> {
            const startedAt = Date.now()
            const response: AiHttpResponseLike = await runAiRequestGuarded(
                SERVICE_NAME,
                { timeoutMs: requestOptions.timeoutMs ?? AI_CONNECTION_TEST_TIMEOUT_MS },
                (signal) =>
                    fetchImpl(tagsUrl, {
                        method: 'GET',
                        headers: { Accept: 'application/json' },
                        signal,
                        redirect: 'error'
                    })
            )
            if (!response.ok) {
                const bodyText = await readAiResponseText(response).catch(() => '')
                throw mapAiHttpError(SERVICE_NAME, response, bodyText)
            }
            const body = await readAiJsonBody(response)
            const names = readOllamaModelNames(body)
            // 1.5.7 缺陷修复：Ollama 服务可达但未安装任何模型（/api/tags 返回空列表）时，
            // 既不能证明配置模型可用、也无法拉取模型，必须报错而不是误报「连接成功」。
            if (names.length === 0) {
                throw new AiProviderError(
                    'AI_MODEL_NOT_FOUND',
                    `${SERVICE_NAME} 服务可达，但未安装任何模型：请先执行 ollama pull ${options.model}（当前配置模型：${options.model}）`
                )
            }
            if (!names.some((name) => modelMatches(options.model, name))) {
                throw new AiProviderError(
                    'AI_MODEL_NOT_FOUND',
                    `${SERVICE_NAME} 未找到模型「${options.model}」：请先执行 ollama pull ${options.model}`
                )
            }
            return {
                model: options.model,
                latencyMs: Date.now() - startedAt,
                modelChecked: true
            }
        }
    }
}
