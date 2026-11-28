/**
 * 1.5.7 LLM Wiki L3：AI Provider 公共类型与工具（fetch 抽象 / 超时取消 / HTTP 错误归一化）
 *
 * ## 为什么注入 fetch
 * - 生产：`globalThis.fetch`（Electron 43 = Node 22 主进程自带，无新增依赖）；
 * - 单测：注入可控替身，覆盖成功 / 401 / 404（模型不存在）/ 429 / 超时 / 取消 / 网络错误
 *   等分支，不发起真实网络请求（计划 §5.2.1「复用现有 HTTP 能力」）。
 *
 * ## 超时与取消
 * - 默认超时 60s（`AI_REQUEST_TIMEOUT_MS`），连接测试 15s（`AI_TEST_TIMEOUT_MS`）；
 * - 每次请求创建独立 `AbortController`：计时器到点 → `abort()` 并归类为 AI_TIMEOUT；
 *   外部 `signal` 中止 → 归类为 AI_CANCELED；
 * - 超时/取消都保证 `clearTimeout` + 移除外部监听（无句柄泄漏）。
 *
 * ## 错误归一化（不泄露密钥）
 * - `redirect: 'error'`：禁止跟随重定向，防止 Authorization 头被转发到第三方；
 * - HTTP 状态映射：401/403 → AI_AUTH_ERROR，404（且响应提示模型缺失）→ AI_MODEL_NOT_FOUND，
 *   429 → AI_RATE_LIMITED，其余非 2xx → AI_HTTP_ERROR；
 * - 网络层异常（连接被拒/DNS/证书）→ AI_NETWORK_ERROR；
 * - 错误消息只包含「服务名 + 状态码」，不含请求 URL 查询串/Authorization/消息正文。
 */
import type { AiChatMessage } from '../../../shared/types/ai'
import { AI_REQUEST_TIMEOUT_MS, AI_TEST_TIMEOUT_MS } from '../../../shared/constants/ai'
import { AiProviderError, sanitizeErrorMessage } from '../errors'

/** 单次响应体最大字节数（防止异常服务返回超大内容占满内存） */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** fetch 响应最小结构（单测替身友好，不依赖 DOM lib 的完整 Response 类型） */
export interface AiHttpResponseLike {
    ok: boolean
    status: number
    statusText?: string
    text: () => Promise<string>
}

/** fetch 请求参数最小结构 */
export interface AiHttpRequestInitLike {
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: string
    signal: AbortSignal
    redirect: 'error'
}

/** fetch 最小签名（默认实现包装 globalThis.fetch） */
export type AiFetchLike = (url: string, init: AiHttpRequestInitLike) => Promise<AiHttpResponseLike>

/** 单次请求的可选参数（超时/外部取消信号） */
export interface AiRequestOptions {
    /** 超时毫秒（缺省用请求默认值） */
    timeoutMs?: number
    /** 外部取消信号（渲染层请求取消/进程退出时可用） */
    signal?: AbortSignal
}

/** Provider 对话返回 */
export interface AiProviderChatResult {
    /** 助手回复正文（已 trim） */
    content: string
    /** 本次实际使用的模型名 */
    model: string
}

/** Provider 连接测试返回 */
export interface AiProviderTestResult {
    /** 本次实际使用的模型名 */
    model: string
    /** 往返耗时（毫秒） */
    latencyMs: number
}

/** AI Provider 统一接口（本地 Ollama / LM Studio，远程 OpenAI 兼容） */
export interface AiProvider {
    /** Provider 标识（诊断/日志用，如 `ollama` / `openai-compatible`） */
    readonly id: string
    /** 非流式对话：返回助手回复正文 */
    chat: (messages: AiChatMessage[], options?: AiRequestOptions) => Promise<AiProviderChatResult>
    /** 连接测试：验证基址可达 + 模型可用（失败抛 AiProviderError） */
    testConnection: (options?: AiRequestOptions) => Promise<AiProviderTestResult>
}

/** 默认 fetch 实现（Electron 主进程 Node 22 自带 globalThis.fetch） */
export function defaultAiFetch(): AiFetchLike {
    return (url, init) =>
        (globalThis.fetch as unknown as AiFetchLike)(url, {
            method: init.method,
            headers: init.headers,
            body: init.body,
            signal: init.signal,
            redirect: init.redirect
        })
}

/** 拼接接口路径：基址已包含该 endpoint 时直接复用，否则追加（避免重复 /v1 等） */
export function joinAiEndpoint(baseUrl: string, endpoint: string): string {
    const base = baseUrl.replace(/\/+$/, '')
    const suffix = endpoint.replace(/^\/+/, '')
    if (base.toLowerCase().endsWith(`/${suffix.toLowerCase()}`)) {
        return base
    }
    return `${base}/${suffix}`
}

/**
 * 读取响应体文本并做大小上限校验。
 *
 * @throws AiProviderError AI_INVALID_RESPONSE（响应体过大）
 */
export async function readAiResponseText(response: AiHttpResponseLike): Promise<string> {
    let text: string
    try {
        text = await response.text()
    } catch (error) {
        throw new AiProviderError(
            'AI_INVALID_RESPONSE',
            `读取 Provider 响应失败：${sanitizeErrorMessage(error)}`
        )
    }
    if (typeof text !== 'string') {
        throw new AiProviderError('AI_INVALID_RESPONSE', 'Provider 响应体不是文本')
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
        throw new AiProviderError('AI_INVALID_RESPONSE', 'Provider 响应体过大，已拒绝解析')
    }
    return text
}

/** 解析 JSON 响应体（失败抛 AI_INVALID_RESPONSE） */
export async function readAiJsonBody(response: AiHttpResponseLike): Promise<unknown> {
    const text = await readAiResponseText(response)
    try {
        return JSON.parse(text)
    } catch {
        throw new AiProviderError('AI_INVALID_RESPONSE', 'Provider 返回的不是合法 JSON')
    }
}

/** 从响应体/状态推断「模型不存在」细分错误码（404 时区分模型与路径错误） */
function looksLikeModelMissing(bodyText: string): boolean {
    const text = bodyText.toLowerCase()
    return (
        text.includes('model') &&
        (text.includes('not found') ||
            text.includes('not exist') ||
            text.includes('does not exist') ||
            text.includes('unknown') ||
            text.includes('missing')) &&
        !text.includes('route not found') &&
        !text.includes('404 page not found')
    )
}

/**
 * 把非 2xx 响应归一化为 `AiProviderError`。
 *
 * @param service 服务显示名（如 `Ollama` / `OpenAI 兼容接口`；日志/提示用，不含密钥）
 * @param response fetch 响应
 * @param bodyText 已读取的响应体（用于识别模型缺失；可为空）
 */
export function mapAiHttpError(
    service: string,
    response: AiHttpResponseLike,
    bodyText: string
): AiProviderError {
    const status = response.status
    if (status === 401 || status === 403) {
        return new AiProviderError(
            'AI_AUTH_ERROR',
            `${service} 鉴权失败（HTTP ${status}）：请检查 API Key 是否正确、是否具备该模型权限`
        )
    }
    if (status === 404) {
        if (looksLikeModelMissing(bodyText)) {
            return new AiProviderError(
                'AI_MODEL_NOT_FOUND',
                `${service} 未找到模型（HTTP 404）：请检查模型名是否正确（本地 Ollama 需先 ollama pull）`
            )
        }
        return new AiProviderError(
            'AI_HTTP_ERROR',
            `${service} 接口路径不存在（HTTP 404）：请检查接口基址（baseUrl）是否正确`
        )
    }
    if (status === 429) {
        return new AiProviderError(
            'AI_RATE_LIMITED',
            `${service} 请求被限流或额度不足（HTTP 429）：请稍后重试或检查账户额度`
        )
    }
    return new AiProviderError(
        'AI_HTTP_ERROR',
        `${service} 请求失败（HTTP ${status}${response.statusText ? ` ${response.statusText}` : ''}）`
    )
}

/**
 * 在超时/取消守卫中执行一次 HTTP 请求。
 *
 * @param service 服务显示名（错误消息用）
 * @param options 超时/外部取消信号
 * @param run 实际请求逻辑（收到内部 AbortSignal）
 */
export async function runAiRequestGuarded<T>(
    service: string,
    options: AiRequestOptions,
    run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
    const timeoutMs =
        typeof options.timeoutMs === 'number' && options.timeoutMs > 0
            ? options.timeoutMs
            : AI_REQUEST_TIMEOUT_MS
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
    }, timeoutMs)
    const external = options.signal
    const onExternalAbort = (): void => {
        controller.abort()
    }
    if (external) {
        if (external.aborted) {
            clearTimeout(timer)
            throw new AiProviderError('AI_CANCELED', `${service} 请求已取消`)
        }
        external.addEventListener('abort', onExternalAbort, { once: true })
    }
    try {
        return await run(controller.signal)
    } catch (error) {
        if (error instanceof AiProviderError) {
            throw error
        }
        if (controller.signal.aborted) {
            throw timedOut
                ? new AiProviderError(
                      'AI_TIMEOUT',
                      `${service} 请求超时（>${Math.round(timeoutMs / 1000)}s），已中止`
                  )
                : new AiProviderError('AI_CANCELED', `${service} 请求已取消`)
        }
        throw new AiProviderError(
            'AI_NETWORK_ERROR',
            `${service} 网络不可达：${sanitizeErrorMessage(error)}`
        )
    } finally {
        clearTimeout(timer)
        external?.removeEventListener('abort', onExternalAbort)
    }
}

/** 连接测试默认超时 */
export const AI_CONNECTION_TEST_TIMEOUT_MS = AI_TEST_TIMEOUT_MS
