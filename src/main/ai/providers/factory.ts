/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：Provider 工厂（按模型配置选择本地/远程实现）
 *
 * 职责：
 * 1. `resolveAiModel(config, modelId?)`：从多模型配置中解析本次要用的模型——
 *    - 显式 `modelId`：必须存在于 `models`，否则抛 `AI_MODEL_NOT_FOUND`；
 *    - 缺省：使用 `defaultModelId`（无默认/列表为空 → `AI_NOT_CONFIGURED`）；
 * 2. `createAiProvider(model, apiKey)`：把「单个模型配置 + 该模型的运行时 API Key」
 *    转换为具体 Provider 实例，并在配置不完整时提前返回结构化 `AI_NOT_CONFIGURED`
 *    （不发请求、不抛裸异常）：
 *    - 本地 Ollama：原生 `/api/chat`；
 *    - 本地 LM Studio：OpenAI 兼容 `/chat/completions`（通常无需密钥）；
 *    - 远程 BYOK：OpenAI 兼容接口（**必须**配置 baseUrl + apiKey + model）。
 *
 * 密钥解析（模型 id → 密钥）由 `main/ai/runtime.ts` 负责（`store.getRuntimeApiKey(model.id)`），
 * 本模块只接收已解密的密钥字符串，不感知存储细节。
 */
import type { AiModelConfig, AiStoredConfig } from '../../../shared/types/ai'
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

/** 设置页引导文案（统一定位到「系统设置 → 功能 → AI 助手」） */
const SETTINGS_HINT = '可在「系统设置 → 功能 → AI 助手」中配置'

/**
 * 从多模型配置中解析本次使用的模型。
 *
 * @param config 非敏感 AI 配置（可为脏数据，内部会归一化）
 * @param modelId 显式指定的模型 id（缺省 = defaultModelId）
 * @throws AiProviderError
 * - AI_NOT_CONFIGURED：模型列表为空 / 未设置默认模型；
 * - AI_MODEL_NOT_FOUND：显式指定的 modelId 不存在。
 */
export function resolveAiModel(config: AiStoredConfig, modelId?: string): AiModelConfig {
    const normalized = normalizeAiStoredConfig(config)
    if (normalized.models.length === 0) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            `尚未添加任何 AI 模型：请先在「系统设置 → 功能 → AI 助手」中添加模型`
        )
    }
    if (typeof modelId === 'string' && modelId.length > 0) {
        const found = normalized.models.find((model) => model.id === modelId)
        if (!found) {
            throw new AiProviderError(
                'AI_MODEL_NOT_FOUND',
                `未找到指定的模型（id=${modelId}）：请检查模型是否已被删除，或在设置中重新选择`
            )
        }
        return found
    }
    const defaultModelId = normalized.defaultModelId
    if (defaultModelId === null) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            `未设置默认模型：请先在「系统设置 → 功能 → AI 助手」中设置默认模型`
        )
    }
    const defaultModel = normalized.models.find((model) => model.id === defaultModelId)
    if (!defaultModel) {
        throw new AiProviderError(
            'AI_MODEL_NOT_FOUND',
            `默认模型不存在（id=${defaultModelId}）：请重新设置`
        )
    }
    return defaultModel
}

/**
 * 按单个模型配置创建 Provider 实例。
 *
 * @param model 单个模型配置（可为脏数据，内部按字段归一化）
 * @param apiKey 该模型的运行时 API Key（远程 BYOK 必填；本地可为 null）
 * @param deps 可选依赖（fetch 替身）
 * @throws AiProviderError AI_NOT_CONFIGURED：启用但配置不完整（baseUrl/model/远程密钥缺失）
 */
export function createAiProvider(
    model: AiModelConfig,
    apiKey: string | null,
    deps: CreateAiProviderDeps = {}
): AiProvider {
    const baseUrl = resolveAiBaseUrl(model)
    if (baseUrl.length === 0) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            model.provider === 'remote'
                ? `AI 配置不完整：远程 BYOK 需先填写接口基址（baseUrl），${SETTINGS_HINT}`
                : `AI 配置不完整：未找到本地 Provider 的接口基址，${SETTINGS_HINT}`
        )
    }
    const modelName = typeof model.model === 'string' ? model.model.trim() : ''
    if (modelName.length === 0) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            `AI 配置不完整：请先在「系统设置 → 功能 → AI 助手」中为该模型填写模型名（model）`
        )
    }
    if (model.provider === 'remote') {
        if (apiKey === null || apiKey.length === 0) {
            throw new AiProviderError(
                'AI_NOT_CONFIGURED',
                'AI 配置不完整：远程 BYOK 需先配置 API Key（密钥经系统安全存储加密保存，不会明文落盘）'
            )
        }
        return createOpenAiCompatibleProvider({
            baseUrl,
            model: modelName,
            apiKey,
            serviceName: SERVICE_NAME_REMOTE,
            fetchImpl: deps.fetchImpl
        })
    }
    if (model.localProvider === 'lmstudio') {
        return createOpenAiCompatibleProvider({
            baseUrl,
            model: modelName,
            apiKey,
            serviceName: SERVICE_NAME_LOCAL_LM_STUDIO,
            fetchImpl: deps.fetchImpl
        })
    }
    return createOllamaProvider({ baseUrl, model: modelName, fetchImpl: deps.fetchImpl })
}
