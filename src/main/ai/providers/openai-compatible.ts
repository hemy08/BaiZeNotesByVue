/**
 * 1.5.7 LLM Wiki L3：OpenAI 兼容 Provider（远程 BYOK + 本地 LM Studio 共用）
 *
 * - 对话：`POST {baseUrl}/chat/completions`，请求体 `{ model, messages, stream: false }`，
 *   `Authorization: Bearer <apiKey>`（无密钥的本地 LM Studio 不发送该头）；
 *   响应 `{ choices: [{ message: { content } }] }`（兼容部分服务的 `choices[0].text`）；
 * - 连接测试：`GET {baseUrl}/models`（校验基址可达 + 模型存在于列表）；
 *   部分自建服务不实现 /models（404/405）时按「可达」通过并标记 `modelChecked: false`，
 *   避免误报（结果文案会明确「未校验模型」）；
 *   **1.5.7 缺陷修复**：`/models` 返回 200 但模型列表为空（服务可达但未加载任何模型）时
 *   返回 AI_MODEL_NOT_FOUND，不再误报连接成功；
 * - 默认基址：LM Studio `http://127.0.0.1:1234/v1`；远程 BYOK 由用户填写（建议 https）；
 * - 安全：`redirect: 'error'` 禁止跟随重定向（防 Bearer 头被转发到第三方）；
 *   错误消息只含服务名 + 状态码，不含密钥/URL 查询串。
 */
import type { AiChatMessage } from '../../../shared/types/ai'
import type {
    AiFetchLike,
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

/** 构造 OpenAI 兼容 Provider 的依赖 */
export interface OpenAiCompatibleProviderOptions {
    /** 接口基址（已解析默认值；通常以 /v1 结尾；不带尾部 `/`） */
    baseUrl: string
    /** 模型名（非空） */
    model: string
    /** API Key（本地 LM Studio 可为 null；远程 BYOK 必填，由 factory 校验） */
    apiKey: string | null
    /** 服务显示名（错误消息/日志用，如 `远程 OpenAI 兼容接口` / `本地 LM Studio`） */
    serviceName: string
    /** fetch 实现（单测注入替身） */
    fetchImpl?: AiFetchLike
}

/** 从 chat/completions 响应中提取助手正文 */
function readOpenAiChatContent(payload: unknown, serviceName: string): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new AiProviderError(
            'AI_INVALID_RESPONSE',
            `${serviceName} 响应结构非法（期望 JSON 对象）`
        )
    }
    const record = payload as Record<string, unknown>
    if (record.error !== undefined) {
        const errorRecord =
            record.error && typeof record.error === 'object' && !Array.isArray(record.error)
                ? (record.error as Record<string, unknown>)
                : null
        const message =
            errorRecord && typeof errorRecord.message === 'string'
                ? errorRecord.message
                : String(record.error)
        throw new AiProviderError(
            'AI_HTTP_ERROR',
            `${serviceName} 返回错误：${message.slice(0, 200)}`
        )
    }
    const choices = record.choices
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new AiProviderError('AI_INVALID_RESPONSE', `${serviceName} 响应缺少 choices`)
    }
    const first = choices[0]
    if (!first || typeof first !== 'object' || Array.isArray(first)) {
        throw new AiProviderError('AI_INVALID_RESPONSE', `${serviceName} 响应 choices 结构非法`)
    }
    const choice = first as Record<string, unknown>
    const message = choice.message
    let content: unknown
    if (message && typeof message === 'object' && !Array.isArray(message)) {
        content = (message as Record<string, unknown>).content
    }
    if (typeof content !== 'string' && typeof choice.text === 'string') {
        content = choice.text
    }
    if (typeof content !== 'string') {
        throw new AiProviderError('AI_INVALID_RESPONSE', `${serviceName} 响应缺少回复内容`)
    }
    const trimmed = content.trim()
    if (trimmed.length === 0) {
        throw new AiProviderError('AI_EMPTY_RESPONSE', `${serviceName} 返回了空内容，请稍后重试`)
    }
    return trimmed
}

/** 读取 /models 响应中的模型 id 列表（结构非法返回空数组） */
function readModelIds(payload: unknown): string[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return []
    }
    const data = (payload as Record<string, unknown>).data
    if (!Array.isArray(data)) {
        return []
    }
    const ids: string[] = []
    for (const item of data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue
        }
        const id = (item as Record<string, unknown>).id
        if (typeof id === 'string' && id.length > 0) {
            ids.push(id)
        }
    }
    return ids
}

/**
 * 创建 OpenAI 兼容 Provider（远程 BYOK / 本地 LM Studio）。
 *
 * @param options 基址 / 模型 / 密钥 / 服务名 / fetch 实现
 */
export function createOpenAiCompatibleProvider(
    options: OpenAiCompatibleProviderOptions
): AiProvider {
    const fetchImpl = options.fetchImpl ?? defaultAiFetch()
    const chatUrl = joinAiEndpoint(options.baseUrl, 'chat/completions')
    const modelsUrl = joinAiEndpoint(options.baseUrl, 'models')

    /** 构造请求头：有密钥才带 Authorization（本地 LM Studio 通常无需密钥） */
    function buildHeaders(contentType: boolean): Record<string, string> {
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (contentType) {
            headers['Content-Type'] = 'application/json'
        }
        if (options.apiKey !== null && options.apiKey.length > 0) {
            headers.Authorization = `Bearer ${options.apiKey}`
        }
        return headers
    }

    return {
        id: 'openai-compatible',

        async chat(
            messages: AiChatMessage[],
            requestOptions: AiRequestOptions = {}
        ): Promise<AiProviderChatResult> {
            const body = JSON.stringify({ model: options.model, messages, stream: false })
            const response = await runAiRequestGuarded(
                options.serviceName,
                requestOptions,
                (signal) =>
                    fetchImpl(chatUrl, {
                        method: 'POST',
                        headers: buildHeaders(true),
                        body,
                        signal,
                        redirect: 'error'
                    })
            )
            if (!response.ok) {
                const bodyText = await readAiResponseText(response).catch(() => '')
                throw mapAiHttpError(options.serviceName, response, bodyText)
            }
            const payload = await readAiJsonBody(response)
            return {
                content: readOpenAiChatContent(payload, options.serviceName),
                model: options.model
            }
        },

        async testConnection(requestOptions: AiRequestOptions = {}): Promise<AiProviderTestResult> {
            const startedAt = Date.now()
            const response = await runAiRequestGuarded(
                options.serviceName,
                { timeoutMs: requestOptions.timeoutMs ?? AI_CONNECTION_TEST_TIMEOUT_MS },
                (signal) =>
                    fetchImpl(modelsUrl, {
                        method: 'GET',
                        headers: buildHeaders(false),
                        signal,
                        redirect: 'error'
                    })
            )
            // 部分自建 OpenAI 兼容服务不实现 /models：按「可达」通过，交给真实对话验证；
            // 但必须标记 modelChecked=false，让 IPC 层文案明确「只验证了服务可达、未校验模型」。
            if (response.status === 404 || response.status === 405) {
                return {
                    model: options.model,
                    latencyMs: Date.now() - startedAt,
                    modelChecked: false
                }
            }
            if (!response.ok) {
                const bodyText = await readAiResponseText(response).catch(() => '')
                throw mapAiHttpError(options.serviceName, response, bodyText)
            }
            const payload = await readAiJsonBody(response)
            const ids = readModelIds(payload)
            // 1.5.7 缺陷修复：服务可达但未加载/下载任何模型（模型列表为空）时必须报错，
            // 不能因为 HTTP 200 就返回「连接成功」（本地 LM Studio 未加载模型即属此场景）。
            if (ids.length === 0) {
                throw new AiProviderError(
                    'AI_MODEL_NOT_FOUND',
                    `${options.serviceName} 服务可达，但未加载任何模型：请先在本地服务中加载/下载模型（当前配置模型：${options.model}）`
                )
            }
            if (!ids.includes(options.model)) {
                throw new AiProviderError(
                    'AI_MODEL_NOT_FOUND',
                    `${options.serviceName} 未返回模型「${options.model}」：请检查模型名是否为服务端可用 id`
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
