/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：AI IPC 载荷校验（主进程侧，失败抛
 * `AiProviderError(AI_INVALID_PAYLOAD)`）
 *
 * 校验口径（IPC 入口统一守卫，避免把非法/超长载荷传进 Provider 或写盘链路）：
 * - 结构：必须是纯对象（排除 null / 数组）；
 * - 枚举：role / provider / localProvider 白名单（shared/constants/ai.ts 单一真源）；
 * - 长度：消息条数/总字符数、上下文、模型数量/名称/id、模型名、baseUrl、API Key、写盘内容分别限长；
 * - 字符：单行字段（模型/baseUrl/路径/模型 id）用 `hasControlChars` 拒绝控制字符；
 * - 密钥：只做「非空 + 长度上限 + 无换行/控制字符」校验，**不在任何日志中输出**。
 *
 * 说明：所有校验失败都抛错，由 IPC handler 统一 catch → `{ ok:false, code, message }`；
 * 本模块不直接向渲染层返回结构，便于单测对「抛错类型」直接断言。
 */
import {
    AI_API_KEY_MAX_CHARS,
    AI_APPLY_CONTENT_MAX_CHARS,
    AI_BASE_URL_MAX_CHARS,
    AI_CHAT_CONTEXT_MAX_CHARS,
    AI_CHAT_MESSAGES_MAX,
    AI_CHAT_MESSAGE_MAX_CHARS,
    AI_CHAT_TOTAL_MAX_CHARS,
    AI_DRAFT_PATH_MAX_CHARS,
    AI_MODEL_ID_MAX_CHARS,
    AI_MODEL_ID_PATTERN,
    AI_MODEL_NAME_MAX_CHARS,
    AI_MODEL_MAX_CHARS,
    AI_MODELS_MAX,
    isAiLocalProviderId,
    isAiProviderKind
} from '../../shared/constants/ai'
import type {
    AiApplyIngestRequest,
    AiChatContext,
    AiChatMessage,
    AiChatRequest,
    AiChatRole,
    AiIngestRequest,
    AiModelConfig,
    AiSaveConfigRequest
} from '../../shared/types/ai'
import { hasControlChars, isPlainObject } from '../../shared/utils/validate'
import { AiProviderError } from './errors'

/** 合法对话角色白名单 */
const CHAT_ROLES: readonly AiChatRole[] = ['system', 'user', 'assistant']

/** 非法载荷统一抛出（消息可读、无敏感信息） */
function invalid(message: string): never {
    throw new AiProviderError('AI_INVALID_PAYLOAD', message)
}

/** 读取对象字段（调用方已确认 payload 为纯对象） */
function readField(payload: Record<string, unknown>, key: string): unknown {
    return payload[key]
}

/** 校验「单行字符串」：类型 + 去空白 + 长度 + 控制字符（空串是否允许由调用方决定） */
function readSingleLineString(
    value: unknown,
    label: string,
    maxChars: number,
    options: { allowEmpty?: boolean } = {}
): string {
    if (typeof value !== 'string') {
        invalid(`${label}必须是字符串`)
    }
    const trimmed = value.trim()
    if (trimmed.length === 0 && options.allowEmpty !== true) {
        invalid(`${label}不能为空`)
    }
    if (trimmed.length > maxChars) {
        invalid(`${label}长度不能超过 ${maxChars} 个字符`)
    }
    if (hasControlChars(trimmed)) {
        invalid(`${label}不能包含控制字符或换行`)
    }
    return trimmed
}

/**
 * 校验并归一化接口基址：只接受 http/https、无凭据、无控制字符、长度受限。
 *
 * @param value 载荷中的 baseUrl（允许空串，表示使用 Provider 默认基址）
 * @returns 去尾部 `/` 的基址（空串原样返回）
 */
export function sanitizeAiBaseUrl(value: unknown): string {
    if (typeof value !== 'string') {
        invalid('接口基址（baseUrl）必须是字符串')
    }
    const trimmed = value.trim()
    if (trimmed.length === 0) {
        return ''
    }
    if (trimmed.length > AI_BASE_URL_MAX_CHARS) {
        invalid(`接口基址（baseUrl）长度不能超过 ${AI_BASE_URL_MAX_CHARS} 个字符`)
    }
    if (hasControlChars(trimmed)) {
        invalid('接口基址（baseUrl）不能包含控制字符或换行')
    }
    let parsed: URL
    try {
        parsed = new URL(trimmed)
    } catch {
        invalid('接口基址（baseUrl）不是合法的 URL')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        invalid('接口基址（baseUrl）只支持 http/https 协议')
    }
    // 拒绝 URL 内嵌凭据（避免密钥出现在 URL/日志里）：BYOK 密钥只走 Authorization 头
    if (parsed.username.length > 0 || parsed.password.length > 0) {
        invalid('接口基址（baseUrl）不能包含用户名/密码等凭据')
    }
    if (parsed.hash.length > 0) {
        invalid('接口基址（baseUrl）不能包含 URL 片段（#）')
    }
    return trimmed.replace(/\/+$/, '')
}

/** 校验模型名（非空 + 长度 + 无控制字符） */
export function sanitizeAiModel(value: unknown): string {
    return readSingleLineString(value, '模型名（model）', AI_MODEL_MAX_CHARS)
}

/**
 * 校验 API Key（非空 + 长度 + 无控制字符/换行）。
 * 密钥值只在内存/加密文件间流转，调用点禁止写日志。
 */
export function sanitizeAiApiKey(value: unknown): string {
    if (typeof value !== 'string') {
        invalid('API Key 必须是字符串')
    }
    const trimmed = value.trim()
    if (trimmed.length === 0) {
        invalid('API Key 不能为空（如需清除请使用「清除密钥」）')
    }
    if (trimmed.length > AI_API_KEY_MAX_CHARS) {
        invalid(`API Key 长度不能超过 ${AI_API_KEY_MAX_CHARS} 个字符`)
    }
    if (hasControlChars(trimmed)) {
        invalid('API Key 不能包含控制字符或换行')
    }
    return trimmed
}

/**
 * 校验模型 id（渲染层生成并保持稳定；主进程按该 id 绑定密钥）。
 *
 * 白名单同时限制长度与字符集（字母/数字开头，后续允许 `_ . : -`），
 * 空串/非法字符/超长一律拒绝。
 */
export function sanitizeAiModelId(value: unknown): string {
    const trimmed = readSingleLineString(value, '模型 id', AI_MODEL_ID_MAX_CHARS)
    if (!AI_MODEL_ID_PATTERN.test(trimmed)) {
        invalid('模型 id 只能包含字母、数字、下划线、点、冒号与连字符，且需以字母/数字开头')
    }
    return trimmed
}

/** 校验可选文本（上下文标题/选中文本）：未出现 → undefined；非法 → 抛错 */
function readOptionalContextText(value: unknown, label: string): string | undefined {
    if (value === undefined || value === null) {
        return undefined
    }
    if (typeof value !== 'string') {
        invalid(`${label}必须是字符串`)
    }
    if (value.length > AI_CHAT_CONTEXT_MAX_CHARS) {
        invalid(`${label}长度不能超过 ${AI_CHAT_CONTEXT_MAX_CHARS} 个字符`)
    }
    return value
}

/** 校验对话上下文（可选对象） */
function normalizeChatContext(value: unknown): AiChatContext | undefined {
    if (value === undefined || value === null) {
        return undefined
    }
    if (!isPlainObject(value)) {
        invalid('对话上下文（context）必须是对象')
    }
    const title = readOptionalContextText(readField(value, 'title'), '上下文标题（title）')
    const selection = readOptionalContextText(
        readField(value, 'selection'),
        '上下文选中文本（selection）'
    )
    if (title === undefined && selection === undefined) {
        return undefined
    }
    return { title, selection }
}

/** 校验单条对话消息 */
function normalizeChatMessage(value: unknown, index: number): AiChatMessage {
    if (!isPlainObject(value)) {
        invalid(`第 ${index + 1} 条对话消息必须是对象`)
    }
    const role = readField(value, 'role')
    if (typeof role !== 'string' || !(CHAT_ROLES as readonly string[]).includes(role)) {
        invalid(`第 ${index + 1} 条对话消息的 role 非法（仅支持 system/user/assistant）`)
    }
    const content = readField(value, 'content')
    if (typeof content !== 'string') {
        invalid(`第 ${index + 1} 条对话消息的 content 必须是字符串`)
    }
    if (content.length > AI_CHAT_MESSAGE_MAX_CHARS) {
        invalid(`第 ${index + 1} 条对话消息内容超过 ${AI_CHAT_MESSAGE_MAX_CHARS} 个字符上限`)
    }
    return { role: role as AiChatRole, content }
}

/**
 * 校验 `AI.CHAT` 载荷。
 *
 * `messages: []` 合法（连接测试语义），但非空时每条消息都必须合法；
 * 全部消息内容总长度受 {@link AI_CHAT_TOTAL_MAX_CHARS} 限制。
 */
export function normalizeAiChatRequest(payload: unknown): AiChatRequest {
    if (payload === undefined || payload === null) {
        invalid('AI.CHAT 缺少载荷（期望 { messages, context? }）')
    }
    if (!isPlainObject(payload)) {
        invalid('AI.CHAT 载荷必须是对象')
    }
    const rawMessages = readField(payload, 'messages')
    if (!Array.isArray(rawMessages)) {
        invalid('AI.CHAT 的 messages 必须是数组')
    }
    if (rawMessages.length > AI_CHAT_MESSAGES_MAX) {
        invalid(`AI.CHAT 的 messages 最多 ${AI_CHAT_MESSAGES_MAX} 条`)
    }
    const messages: AiChatMessage[] = rawMessages.map((item, index) =>
        normalizeChatMessage(item, index)
    )
    const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0)
    if (totalChars > AI_CHAT_TOTAL_MAX_CHARS) {
        invalid(`AI.CHAT 消息内容总长度不能超过 ${AI_CHAT_TOTAL_MAX_CHARS} 个字符`)
    }
    const context = normalizeChatContext(readField(payload, 'context'))
    const modelId = readOptionalModelId(readField(payload, 'modelId'))
    return {
        messages,
        ...(context ? { context } : {}),
        ...(modelId ? { modelId } : {})
    }
}

/** 校验可选的模型 id（缺省 = 使用默认模型） */
function readOptionalModelId(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined
    }
    return sanitizeAiModelId(value)
}

/** 校验 `AI.INGEST` 载荷（缺省 rawPath 表示扫描 raw/ 自动选择） */
export function normalizeAiIngestRequest(payload: unknown): AiIngestRequest {
    if (payload === undefined || payload === null) {
        return {}
    }
    if (!isPlainObject(payload)) {
        throw new AiProviderError('AI_INVALID_PAYLOAD', 'AI.INGEST 载荷必须是对象')
    }
    const rawPath = readField(payload, 'rawPath')
    if (rawPath === undefined || rawPath === null) {
        return {}
    }
    if (typeof rawPath !== 'string') {
        throw new AiProviderError('AI_INVALID_PAYLOAD', 'rawPath 必须是字符串')
    }
    const trimmed = rawPath.trim()
    if (trimmed.length === 0) {
        return {}
    }
    if (trimmed.length > AI_DRAFT_PATH_MAX_CHARS) {
        throw new AiProviderError(
            'AI_INVALID_PAYLOAD',
            `rawPath 长度不能超过 ${AI_DRAFT_PATH_MAX_CHARS} 个字符`
        )
    }
    return { rawPath: trimmed }
}

/**
 * 校验 `AI.APPLY_INGEST` 载荷。
 *
 * 只校验「结构/长度/审批标记」；目标路径的目录白名单（wiki/）、符号链接、工作区越界、
 * raw 只读守卫等安全校验由 `main/ai/apply.ts` 在解析工作区根后执行（含 Path Guard）。
 */
export function normalizeAiApplyIngestRequest(payload: unknown): AiApplyIngestRequest {
    if (!isPlainObject(payload)) {
        throw new AiProviderError('AI_INVALID_PAYLOAD', 'AI.APPLY_INGEST 载荷必须是对象')
    }
    const approved = readField(payload, 'approved')
    if (approved !== true) {
        throw new AiProviderError('AI_NOT_APPROVED', '未获得用户显式审批，已拒绝写入 wiki/')
    }
    const draftPath = readSingleLineString(
        readField(payload, 'draftPath'),
        '目标路径（draftPath）',
        AI_DRAFT_PATH_MAX_CHARS
    )
    const content = readField(payload, 'content')
    if (typeof content !== 'string' || content.length === 0) {
        throw new AiProviderError('AI_INVALID_PAYLOAD', '写入内容（content）必须是非空字符串')
    }
    if (content.length > AI_APPLY_CONTENT_MAX_CHARS) {
        throw new AiProviderError(
            'AI_INVALID_PAYLOAD',
            `写入内容（content）不能超过 ${AI_APPLY_CONTENT_MAX_CHARS} 个字符`
        )
    }
    return { draftPath, content, approved: true }
}

/**
 * 旧版单模型配置字段（1.5.7 L3）：多模型改造后废弃。
 *
 * 出现即拒绝（而不是静默忽略）——渲染层若仍是旧版保存逻辑，能立刻暴露为
 * AI_INVALID_PAYLOAD，避免用户配置被静默丢弃。
 */
const LEGACY_SINGLE_MODEL_FIELDS = [
    'provider',
    'localProvider',
    'baseUrl',
    'model',
    'apiKey',
    'clearApiKey'
] as const

/**
 * 校验单个模型配置（多模型列表项）。
 *
 * - id：白名单字符集 + 长度，且同批次内唯一（由调用方检查）；
 * - provider：local / remote 枚举；localProvider 仅本地模型严格校验，远程模型忽略并回落 ollama；
 * - baseUrl：http/https、无凭据、长度上限；本地模型允许空（使用 Provider 默认基址），
 *   远程模型必填；
 * - name / model：非空、长度上限、无控制字符（name 缺失时回落为模型名）。
 */
function normalizeAiModelConfigRequest(value: unknown, index: number): AiModelConfig {
    if (!isPlainObject(value)) {
        invalid(`第 ${index + 1} 个模型配置必须是对象`)
    }
    const label = `第 ${index + 1} 个模型`
    const id = sanitizeAiModelId(readField(value, 'id'))
    const providerRaw = readField(value, 'provider')
    if (!isAiProviderKind(providerRaw)) {
        invalid(`${label}的 Provider 形态（provider）非法（仅支持 local / remote）`)
    }
    const localProviderRaw = readField(value, 'localProvider')
    let localProvider: 'ollama' | 'lmstudio' = 'ollama'
    if (providerRaw === 'local') {
        if (!isAiLocalProviderId(localProviderRaw)) {
            invalid(`${label}的本地 Provider（localProvider）非法（仅支持 ollama / lmstudio）`)
        }
        localProvider = localProviderRaw
    } else if (isAiLocalProviderId(localProviderRaw)) {
        localProvider = localProviderRaw
    }
    const baseUrlRaw = readField(value, 'baseUrl')
    const baseUrl =
        baseUrlRaw === undefined || baseUrlRaw === null ? '' : sanitizeAiBaseUrl(baseUrlRaw)
    if (providerRaw === 'remote' && baseUrl.length === 0) {
        invalid(`${label}是远程模型，必须填写接口基址（baseUrl）`)
    }
    const model = readSingleLineString(
        readField(value, 'model'),
        `${label}的模型名（model）`,
        AI_MODEL_MAX_CHARS
    )
    const nameRaw = readField(value, 'name')
    const name =
        nameRaw === undefined || nameRaw === null || nameRaw === ''
            ? model.slice(0, AI_MODEL_NAME_MAX_CHARS)
            : readSingleLineString(nameRaw, `${label}的显示名称（name）`, AI_MODEL_NAME_MAX_CHARS)
    return { id, name, provider: providerRaw, localProvider, baseUrl, model }
}

/**
 * 校验 `AI.SAVE_CONFIG` 载荷：可选字段增量更新；未出现的字段保持原值。
 *
 * - `enabled`：布尔；未启用时仍允许保存配置（便于先配置后启用）；
 * - `models`：完整模型列表（全量替换），最多 {@link AI_MODELS_MAX} 个、id 唯一；
 * - `defaultModelId`：null = 清空；字符串必须为合法模型 id（是否存在于列表由存储层回落）；
 * - `modelApiKey`：单模型密钥保存/清除，与 models 同批次提交；与 models 一起提供时
 *   密钥绑定的模型必须在本批次列表中。
 *
 * @returns 只含出现字段的补丁对象
 */
export function normalizeAiSaveConfigRequest(payload: unknown): AiSaveConfigRequest {
    if (!isPlainObject(payload)) {
        throw new AiProviderError('AI_INVALID_PAYLOAD', 'AI.SAVE_CONFIG 载荷必须是对象')
    }
    for (const legacyField of LEGACY_SINGLE_MODEL_FIELDS) {
        if (readField(payload, legacyField) !== undefined) {
            invalid(
                `旧版单模型配置字段「${legacyField}」已废弃：请改用 models 数组 + modelApiKey（多模型配置）`
            )
        }
    }
    const patch: AiSaveConfigRequest = {}
    const enabled = readField(payload, 'enabled')
    if (enabled !== undefined) {
        if (typeof enabled !== 'boolean') {
            invalid('启用状态（enabled）必须是布尔值')
        }
        patch.enabled = enabled
    }

    const rawModels = readField(payload, 'models')
    let models: AiModelConfig[] | undefined
    if (rawModels !== undefined) {
        if (!Array.isArray(rawModels)) {
            invalid('模型列表（models）必须是数组')
        }
        if (rawModels.length > AI_MODELS_MAX) {
            invalid(`模型数量不能超过 ${AI_MODELS_MAX} 个`)
        }
        const normalizedModels: AiModelConfig[] = []
        const seenIds = new Set<string>()
        rawModels.forEach((item, index) => {
            const model = normalizeAiModelConfigRequest(item, index)
            if (seenIds.has(model.id)) {
                invalid(`模型 id 重复：${model.id}`)
            }
            seenIds.add(model.id)
            normalizedModels.push(model)
        })
        models = normalizedModels
        patch.models = normalizedModels
    }

    const defaultModelIdRaw = readField(payload, 'defaultModelId')
    if (defaultModelIdRaw !== undefined) {
        if (defaultModelIdRaw === null) {
            patch.defaultModelId = null
        } else if (typeof defaultModelIdRaw === 'string' && defaultModelIdRaw.trim().length === 0) {
            // 空串按「清空默认模型」处理（兼容表单未选择时的提交）
            patch.defaultModelId = null
        } else {
            patch.defaultModelId = sanitizeAiModelId(defaultModelIdRaw)
        }
    }

    const rawModelApiKey = readField(payload, 'modelApiKey')
    if (rawModelApiKey !== undefined) {
        if (!isPlainObject(rawModelApiKey)) {
            invalid('模型密钥操作（modelApiKey）必须是对象')
        }
        const modelId = sanitizeAiModelId(readField(rawModelApiKey, 'modelId'))
        const rawApiKey = readField(rawModelApiKey, 'apiKey')
        const rawClearApiKey = readField(rawModelApiKey, 'clearApiKey')
        if (rawClearApiKey !== undefined && typeof rawClearApiKey !== 'boolean') {
            invalid('清除密钥标记（clearApiKey）必须是布尔值')
        }
        const hasApiKey = rawApiKey !== undefined
        if (hasApiKey && rawClearApiKey === true) {
            invalid('不能同时保存与清除 API Key')
        }
        if (!hasApiKey && rawClearApiKey !== true) {
            invalid('模型密钥操作非法：需提供 apiKey 或 clearApiKey')
        }
        if (models !== undefined && !models.some((model) => model.id === modelId)) {
            invalid(`密钥绑定的模型不在本次保存的模型列表中：${modelId}`)
        }
        patch.modelApiKey = {
            modelId,
            ...(hasApiKey ? { apiKey: sanitizeAiApiKey(rawApiKey) } : {}),
            ...(rawClearApiKey === true ? { clearApiKey: true } : {})
        }
    }

    return patch
}
