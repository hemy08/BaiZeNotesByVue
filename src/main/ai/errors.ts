/**
 * 1.5.7 LLM Wiki L3：主进程 AI 错误归一化
 *
 * 设计目标（LOG-07 / LOG-08）：
 * - Provider/网络/配置/写盘错误统一收敛为 `AiProviderError`（含 `AiErrorCode`），
 *   IPC 层再转换为渲染层可见的结构化失败 `{ ok:false, code, message }`；
 * - **错误消息不含密钥、Authorization 头、请求正文**（SEC-16）；Provider 内部只拼接
 *   「服务名 / 状态码 / 模型名 / 基址主机」等非敏感信息；
 * - 不向渲染层抛堆栈：IPC handler 统一 catch 后返回失败结构。
 */
import type { AiErrorCode, AiFailure } from '../../shared/types/ai'

/** 已知错误消息最大长度（超出截断，避免异常信息把 UI 撑破） */
const MAX_MESSAGE_LENGTH = 400

/** 统一 AI 错误（携带结构化错误码；消息已脱敏，可安全返回渲染层） */
export class AiProviderError extends Error {
    readonly code: AiErrorCode

    constructor(code: AiErrorCode, message: string) {
        super(message)
        this.name = 'AiProviderError'
        this.code = code
    }
}

/** 运行时判定：是否为统一 AI 错误（跨 re-export/多实例也成立） */
export function isAiProviderError(value: unknown): value is AiProviderError {
    return (
        value instanceof AiProviderError ||
        (typeof value === 'object' &&
            value !== null &&
            (value as { name?: unknown }).name === 'AiProviderError' &&
            typeof (value as { code?: unknown }).code === 'string')
    )
}

/**
 * 清洗错误消息：去除换行/控制字符并截断。
 * 不在此做密钥脱敏（调用点本就不允许把密钥放进消息），仅做展示安全清洗。
 * 逐字符过滤而不是控制字符正则——避免 ESLint `no-control-regex` 告警（与
 * `shared/utils/validate.ts#hasControlChars` 同口径）。
 */
export function sanitizeErrorMessage(message: unknown): string {
    const text = typeof message === 'string' ? message : String(message ?? '')
    let cleaned = ''
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index)
        if (code <= 0x1f || code === 0x7f) {
            cleaned += ' '
        } else {
            cleaned += text[index]
        }
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim()
    return cleaned.length > MAX_MESSAGE_LENGTH
        ? `${cleaned.slice(0, MAX_MESSAGE_LENGTH)}…`
        : cleaned
}

/** 把任意异常转为可安全返回渲染层的失败结构（未知异常按 AI_HTTP_ERROR 归一化） */
export function toAiFailure(
    error: unknown,
    fallbackCode: AiErrorCode = 'AI_HTTP_ERROR'
): AiFailure {
    if (isAiProviderError(error)) {
        return { ok: false, code: error.code, message: sanitizeErrorMessage(error.message) }
    }
    const message =
        error instanceof Error ? sanitizeErrorMessage(error.message) : sanitizeErrorMessage(error)
    return {
        ok: false,
        code: fallbackCode,
        message: message.length > 0 ? message : 'AI 请求失败'
    }
}

/** 构造失败结构（简化调用点） */
export function aiFailure(code: AiErrorCode, message: string): AiFailure {
    return { ok: false, code, message: sanitizeErrorMessage(message) }
}
