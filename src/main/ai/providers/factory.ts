/**
 * 1.5.7 LLM Wiki L3：Provider 工厂（按配置选择本地/远程实现）
 *
 * 职责：把「非敏感配置 + 运行时 API Key」转换为具体 Provider 实例，并在配置不完整时
 * 提前返回结构化 AI_NOT_CONFIGURED（不发请求、不抛裸异常）：
 * - 本地 Ollama：原生 `/api/chat`；
 * - 本地 LM Studio：OpenAI 兼容 `/chat/completions`（通常无需密钥）；
 * - 远程 BYOK：OpenAI 兼容接口（**必须**配置 baseUrl + apiKey + model）。
 */
import type { AiStoredConfig } from '../../../shared/types/ai'
import { normalizeAiStoredConfig, resolveAiBaseUrl } from '../../../shared/constants/ai'
import { AiProviderError } from '../errors'
import type { AiFetchLike, AiProvider } from './types'
import { createOllamaProvider } from './ollama'
import { createOpenAiCompatibleProvider } from './openai-compatible'

/** 创建 Provider 的可选依赖（单测注入 fetch 替身） */
export interface CreateAiProviderDeps {
    fetchImpl?: AiFetchLike
}

/** 服务显示名（错误消息/日志用；不含基址与密钥） */
const SERVICE_NAME_LOCAL_LM_STUDIO = '本地 LM Studio'
const SERVICE_NAME_REMOTE = '远程 OpenAI 兼容接口'

/**
 * 按配置创建 Provider 实例。
 *
 * @param config 非敏感 AI 配置（可为脏数据，内部会归一化）
 * @param apiKey 运行时 API Key（远程 BYOK 必填；本地可为 null）
 * @param deps 可选依赖（fetch 替身）
 * @throws AiProviderError AI_NOT_CONFIGURED：启用但配置不完整（baseUrl/model/远程密钥缺失）
 */
export function createAiProvider(
    config: AiStoredConfig,
    apiKey: string | null,
    deps: CreateAiProviderDeps = {}
): AiProvider {
    const normalized = normalizeAiStoredConfig(config)
    const baseUrl = resolveAiBaseUrl(normalized)
    if (baseUrl.length === 0) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            normalized.provider === 'remote'
                ? 'AI 配置不完整：远程 BYOK 需先填写接口基址（baseUrl），可在「系统设置 → 功能 → AI 助手」中配置'
                : 'AI 配置不完整：未找到本地 Provider 的接口基址，可在「系统设置 → 功能 → AI 助手」中配置'
        )
    }
    if (normalized.model.length === 0) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            'AI 配置不完整：请先在「系统设置 → 功能 → AI 助手」中填写模型名（model）'
        )
    }
    if (normalized.provider === 'remote') {
        if (apiKey === null || apiKey.length === 0) {
            throw new AiProviderError(
                'AI_NOT_CONFIGURED',
                'AI 配置不完整：远程 BYOK 需先配置 API Key（密钥经系统安全存储加密保存，不会明文落盘）'
            )
        }
        return createOpenAiCompatibleProvider({
            baseUrl,
            model: normalized.model,
            apiKey,
            serviceName: SERVICE_NAME_REMOTE,
            fetchImpl: deps.fetchImpl
        })
    }
    if (normalized.localProvider === 'lmstudio') {
        return createOpenAiCompatibleProvider({
            baseUrl,
            model: normalized.model,
            apiKey,
            serviceName: SERVICE_NAME_LOCAL_LM_STUDIO,
            fetchImpl: deps.fetchImpl
        })
    }
    return createOllamaProvider({ baseUrl, model: normalized.model, fetchImpl: deps.fetchImpl })
}
