/**
 * AI 助手设置页签 —— 纯函数与类型（1.5.7 体验升级 B）
 *
 * 从 `AiAssistantPanel.vue` 抽出的「不依赖 Vue / DOM」的逻辑，便于单测与复用：
 * - 模型表单草稿（新增 / 编辑）与输入校验（名称/模型名必填，远程需基址与密钥）；
 * - 主进程返回快照的运行时归一化（结构非法返回 null，组件不渲染脏数据）；
 * - 保存载荷模型列表构造（剔除仅快照字段 `apiKeyConfigured`，密钥状态由主进程唯一维护）。
 *
 * 契约真源：`src/shared/types/ai.ts`；白名单/类型守卫真源：`src/shared/constants/ai.ts`
 * （GEN-03：渲染层不另写一份枚举判断）。
 */
import type {
    AiConfigSnapshot,
    AiLocalProviderId,
    AiModelConfig,
    AiProviderKind
} from '../../../../../../shared/types/ai'
import {
    isAiKeyStorage,
    isAiLocalProviderId,
    isAiProviderKind
} from '../../../../../../shared/constants/ai'

/** 模型表单草稿（新增与编辑共用；`apiKey` 仅远程模型可填，保存后清空不回显） */
export interface AiModelFormDraft {
    mode: 'add' | 'edit'
    /** 模型 id（编辑时为既有 id；新增时为空串，提交时生成） */
    id: string
    name: string
    provider: AiProviderKind
    localProvider: AiLocalProviderId
    baseUrl: string
    model: string
    /** 用户新输入的远程 API Key（明文只存在于表单状态，保存成功后清空） */
    apiKey: string
    /** 主进程是否已保存该模型的密钥（只读展示掩码与「清除密钥」按钮） */
    apiKeyConfigured: boolean
}

/** 表单校验失败的字段（组件层映射为对应 i18n 文案，纯函数不依赖词典） */
export type AiModelFormField = 'name' | 'model' | 'baseUrl' | 'apiKey'

/**
 * 生成模型唯一 id（渲染层生成、保存后保持稳定，用于默认模型与密钥绑定）。
 *
 * 优先 `crypto.randomUUID()`；旧运行环境 / 测试桩不可用时回退「时间戳 + 随机串」，
 * 保证同一会话内不重复（不引入第三方 uuid 依赖）。
 */
export function createAiModelId(): string {
    const cryptoObject = typeof globalThis === 'undefined' ? undefined : globalThis.crypto
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
        return `ai-model-${cryptoObject.randomUUID()}`
    }
    return `ai-model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 新建「添加模型」表单草稿：默认本地 Ollama（与共享默认值口径一致） */
export function createAddModelFormDraft(): AiModelFormDraft {
    return {
        mode: 'add',
        id: '',
        name: '',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: '',
        apiKey: '',
        apiKeyConfigured: false
    }
}

/** 由既有模型生成「编辑模型」表单草稿（密钥不回显，apiKey 恒为空串） */
export function createEditModelFormDraft(model: AiModelConfig): AiModelFormDraft {
    return {
        mode: 'edit',
        id: model.id,
        name: model.name,
        provider: model.provider,
        localProvider: model.localProvider,
        baseUrl: model.baseUrl,
        model: model.model,
        apiKey: '',
        apiKeyConfigured: model.apiKeyConfigured === true
    }
}

/**
 * 表单输入校验（按界面顺序返回第一个非法字段；null = 通过）。
 *
 * 规则：显示名称 / 模型名必填；远程模型必须填接口基址，且首次添加（无已保存密钥）
 * 必须填 API Key。范围/长度等强制校验由主进程 IPC 校验兜底（本函数只做界面引导）。
 */
export function validateAiModelForm(form: AiModelFormDraft): AiModelFormField | null {
    if (form.name.trim().length === 0) {
        return 'name'
    }
    if (form.model.trim().length === 0) {
        return 'model'
    }
    if (form.provider === 'remote') {
        if (form.baseUrl.trim().length === 0) {
            return 'baseUrl'
        }
        if (form.apiKey.trim().length === 0 && !form.apiKeyConfigured) {
            return 'apiKey'
        }
    }
    return null
}

/** 单条模型配置的运行时归一化（字段类型不符返回 null，由快照归一化丢弃该条） */
export function normalizeAiModelConfig(raw: unknown): AiModelConfig | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.trim().length === 0) {
        return null
    }
    if (typeof record.name !== 'string') {
        return null
    }
    if (!isAiProviderKind(record.provider) || !isAiLocalProviderId(record.localProvider)) {
        return null
    }
    return {
        id: record.id,
        name: record.name,
        provider: record.provider,
        localProvider: record.localProvider,
        baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
        model: typeof record.model === 'string' ? record.model : '',
        apiKeyConfigured: record.apiKeyConfigured === true
    }
}

/**
 * `AI.GET_CONFIG` / `AI.SAVE_CONFIG` 返回快照的运行时归一化。
 *
 * 契约要求 `models` 为数组、`enabled` 为布尔、`apiKeyStorage` 为安全存储枚举，
 * 任一不符返回 null（组件展示可读的读取失败提示，不渲染旧结构脏数据）。
 * `defaultModelId` 只保留「确实存在于 models 中」的 id，否则回落 null（防悬空默认）。
 */
export function normalizeAiConfigSnapshot(raw: unknown): AiConfigSnapshot | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (typeof record.enabled !== 'boolean' || !Array.isArray(record.models)) {
        return null
    }
    if (!isAiKeyStorage(record.apiKeyStorage)) {
        return null
    }
    const models = record.models
        .map((item) => normalizeAiModelConfig(item))
        .filter((item): item is AiModelConfig => item !== null)
    const defaultModelId =
        typeof record.defaultModelId === 'string' &&
        models.some((model) => model.id === record.defaultModelId)
            ? record.defaultModelId
            : null
    return {
        enabled: record.enabled,
        models,
        defaultModelId,
        apiKeyStorage: record.apiKeyStorage
    }
}

/**
 * 保存载荷用模型列表：剔除仅快照返回的 `apiKeyConfigured`。
 *
 * 密钥状态只能由主进程按 `modelApiKey` 操作维护，渲染层不得回传状态位（避免伪造
 * 「已配置密钥」）；其余字段原样保留（未知字段由主进程归一化丢弃）。
 */
export function toAiModelsPayload(models: readonly AiModelConfig[]): AiModelConfig[] {
    return models.map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        localProvider: model.localProvider,
        baseUrl: model.baseUrl,
        model: model.model
    }))
}
