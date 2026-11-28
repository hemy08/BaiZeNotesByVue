/**
 * 1.5.7 LLM Wiki L3：AI Provider / AI ingest 共享常量（主进程与渲染层唯一真源）
 *
 * 本文件是纯数据/纯常量叶子模块（ARCH-05）：不 import Node/Electron/Vue/DOM，
 * 供主进程（`src/main/ai/**`）与渲染层（设置页 AI 分组 / diff 审批 UI）共同引用，
 * 避免两侧各自写一份默认值/白名单（GEN-03 单一真源）。
 *
 * 1.5.7 体验升级批次 C：配置结构由「单模型」升级为「多模型列表 + 默认模型」，
 * 每个远程模型的 API Key 以模型 id 为键独立加密存储（见 `main/ai/config-store.ts`）；
 * 旧单模型配置（`AI_CONFIG_VERSION = 1`）由主进程一次性迁移（版本升至 2）。
 *
 * 契约类型见 `src/shared/types/ai.ts`；本文件只提供运行期常量与类型守卫。
 */
import type {
    AiKeyStorage,
    AiLocalProviderId,
    AiModelConfig,
    AiProviderKind,
    AiStoredConfig
} from '../types/ai'
// 1.5.7 LLM Wiki L1：`wiki/` 目录名唯一真源（raw/、wiki/ 目录名都在 workspace-mode.ts）
import { LLM_WIKI_WIKI_DIR_NAME } from './workspace-mode'

/* ============================================================================
 * 一、配置默认值（默认「关闭 + 空模型列表」，未启用时主进程不发起任何请求）
 * ========================================================================== */

/**
 * AI 独立配置文件版本（结构升级时递增，读取时按版本做兼容/迁移/回落）。
 *
 * - 1：1.5.7 L3 单模型结构（enabled/provider/localProvider/baseUrl/model + 单密钥）；
 * - 2：1.5.7 体验升级批次 C 多模型结构（enabled/models[]/defaultModelId + 每模型密钥）。
 */
export const AI_CONFIG_VERSION = 2

/** AI 独立配置文件文件名（位于 `~/.baizenotes/config/` 下；密钥经 safeStorage 加密后存于此） */
export const AI_CONFIG_FILE_NAME = 'ai-config.json'

/** `wiki/` 目录名（AI ingest 目标目录；复用 L1 共享常量，不另写一份） */
export const AI_WIKI_DIR_NAME = LLM_WIKI_WIKI_DIR_NAME

/** 本地 Provider 白名单（Ollama / LM Studio） */
export const AI_LOCAL_PROVIDER_IDS = ['ollama', 'lmstudio'] as const

/** Provider 形态白名单（本地 / 远程 BYOK） */
export const AI_PROVIDER_KINDS = ['local', 'remote'] as const

/** 各 Provider 默认模型名占位（仅 UI 提示，不作为默认配置值——模型需用户显式填写） */
export const AI_MODEL_PLACEHOLDERS: Readonly<Record<AiProviderKind, string>> = {
    local: 'qwen2.5',
    remote: 'deepseek-chat'
}

/**
 * 本地 Provider 默认接口基址（用户 baseUrl 留空时生效）：
 * - Ollama：`http://127.0.0.1:11434`（原生 /api/chat，本地回环，不支持改端口时用户显式填写）；
 * - LM Studio：`http://127.0.0.1:1234/v1`（OpenAI 兼容 /chat/completions）。
 */
export const AI_LOCAL_DEFAULT_BASE_URLS: Readonly<Record<AiLocalProviderId, string>> = {
    ollama: 'http://127.0.0.1:11434',
    lmstudio: 'http://127.0.0.1:1234/v1'
}

/** 远程 BYOK 的 baseUrl 提示（空串表示必须由用户填写，不预置服务商地址） */
export const AI_REMOTE_BASE_URL_PLACEHOLDER = 'https://api.openai.com/v1'

/**
 * 旧单模型配置迁移后生成的模型 id / 显示名（稳定值：迁移幂等，多次读取结果一致）。
 *
 * 旧结构只可能包含一个模型，因此固定 id 不会与用户新增模型冲突（用户 id 由渲染层生成，
 * 需满足 {@link AI_MODEL_ID_PATTERN} 且不能使用保留前缀时也不会撞上该值）。
 */
export const AI_LEGACY_MODEL_ID = 'legacy-default-model'

/** 旧单模型配置迁移后生成的模型显示名 */
export const AI_LEGACY_MODEL_NAME = '默认模型'

/** AI 配置默认值（主进程/渲染层兜底共用：默认关闭 + 空模型列表） */
export const AI_DEFAULT_CONFIG: AiStoredConfig = {
    enabled: false,
    models: [],
    defaultModelId: null
}

/* ============================================================================
 * 二、请求限额（主进程 IPC 校验与 Provider 超时；渲染层输入校验共用）
 * ========================================================================== */

/** 对话请求默认超时（毫秒） */
export const AI_REQUEST_TIMEOUT_MS = 60_000

/** 连接测试超时（毫秒；比对话短，避免设置页长时间等待） */
export const AI_TEST_TIMEOUT_MS = 15_000

/** 单次对话消息数量上限（含 system/user/assistant） */
export const AI_CHAT_MESSAGES_MAX = 50

/** 单条消息内容字符串上限（字符数） */
export const AI_CHAT_MESSAGE_MAX_CHARS = 32_000

/** 全部消息内容总长度上限（字符数，防超长载荷占用主进程内存） */
export const AI_CHAT_TOTAL_MAX_CHARS = 64_000

/** 对话上下文（标题/选中文本）单字段字符上限 */
export const AI_CHAT_CONTEXT_MAX_CHARS = 4_000

/** 模型数量上限（多模型列表；防止配置文件/设置页无限膨胀） */
export const AI_MODELS_MAX = 20

/** 模型 id 长度上限（字符数；渲染层生成并保持稳定，主进程按该 id 绑定密钥） */
export const AI_MODEL_ID_MAX_CHARS = 64

/** 模型显示名称长度上限（字符数） */
export const AI_MODEL_NAME_MAX_CHARS = 64

/** 模型名长度上限（字符数） */
export const AI_MODEL_MAX_CHARS = 128

/** 接口基址长度上限（字符数） */
export const AI_BASE_URL_MAX_CHARS = 2_048

/** API Key 长度上限（字符数；过短/过长直接拒绝，不落盘） */
export const AI_API_KEY_MAX_CHARS = 512

/**
 * 模型 id 白名单：字母/数字开头，后续允许字母/数字/下划线/点/冒号/连字符。
 * 兼容 ULID（字母数字）、UUID（含连字符）与渲染层自定义稳定 id。
 */
export const AI_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/

/** AI ingest 读取原始资料的大小上限（字节；超出截断后送模型并在提示词中标注） */
export const AI_INGEST_RAW_MAX_BYTES = 256 * 1024

/** 送模型的原始资料正文字符上限（超出截断，避免超出上下文窗口） */
export const AI_INGEST_PROMPT_MAX_CHARS = 12_000

/** `raw/` 扫描的文件数量上限（防止超大工作区扫描过慢） */
export const AI_RAW_SCAN_MAX_FILES = 500

/** `raw/` 扫描的目录递归深度上限 */
export const AI_RAW_SCAN_MAX_DEPTH = 3

/** `wiki/` 既有页面扫描数量上限（用于匹配 source 关联页面） */
export const AI_WIKI_SCAN_MAX_FILES = 500

/** 可参与 ingest 的原始资料扩展名白名单（小写，含点） */
export const AI_RAW_FILE_EXTENSIONS = ['.md', '.markdown', '.txt'] as const

/** `wiki/` 页面扩展名白名单（小写，含点；apply 目标只接受这些扩展名） */
export const AI_WIKI_FILE_EXTENSIONS = ['.md', '.markdown'] as const

/** 审批写盘的内容长度上限（字符数；超出拒绝，防止误用该通道写超大文件） */
export const AI_APPLY_CONTENT_MAX_CHARS = 512 * 1024

/** diff 返回的最大行数（超出截断并置 `diffTruncated=true`，UI 需提示） */
export const AI_DIFF_MAX_LINES = 2_000

/** diff 计算的最大总行数（旧+新；超出降级为「整体新增/删除」摘要，避免 O(n²) 卡顿） */
export const AI_DIFF_COMPUTE_MAX_LINES = 4_000

/** 目标文件路径（工作区相对路径）长度上限（字符数） */
export const AI_DRAFT_PATH_MAX_CHARS = 512

/* ============================================================================
 * 二点五、运行中模型查询（1.5.7「查询当前运行的模型」）
 * ========================================================================== */

/** 单模型「运行状态查询命令」长度上限（字符数；命令由用户显式配置，越短越可控） */
export const AI_STATUS_COMMAND_MAX_CHARS = 500

/** 运行状态查询命令执行超时（毫秒；与连接测试同档，避免设置页长时间等待） */
export const AI_STATUS_COMMAND_TIMEOUT_MS = 15_000

/** 运行状态查询命令 stdout+stderr 缓冲上限（字节；超出由 child_process 截断并报错） */
export const AI_STATUS_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024

/** 运行状态查询返回渲染层的输出文本上限（字符数；stdout+stderr 合并后截断） */
export const AI_STATUS_COMMAND_OUTPUT_MAX_CHARS = 64 * 1024

/** 内置查询的空结果输出（主进程统一文案，渲染层直接展示；避免 UI 误报「有模型」） */
export const AI_RUNNING_MODELS_EMPTY_OUTPUT = '未检测到运行中的模型'

/* ============================================================================
 * 三、类型守卫/归一化（shared 纯函数：主进程校验与渲染层展示共用）
 * ========================================================================== */

/** 是否为合法 Provider 形态（未知值回落 false，调用方按默认值处理） */
export function isAiProviderKind(value: unknown): value is AiProviderKind {
    return typeof value === 'string' && (AI_PROVIDER_KINDS as readonly string[]).includes(value)
}

/** 是否为合法本地 Provider 标识 */
export function isAiLocalProviderId(value: unknown): value is AiLocalProviderId {
    return typeof value === 'string' && (AI_LOCAL_PROVIDER_IDS as readonly string[]).includes(value)
}

/** 是否为合法密钥存储形态 */
export function isAiKeyStorage(value: unknown): value is AiKeyStorage {
    return value === 'safe' || value === 'memory'
}

/** 是否为合法模型 id（长度 + 字符集白名单；空/非字符串 false） */
export function isAiModelId(value: unknown): value is string {
    return typeof value === 'string' && AI_MODEL_ID_PATTERN.test(value)
}

/** 判断值是否为「纯对象」（不引入外部依赖，保持本模块可独立测试） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 归一化「运行状态查询命令」（读取历史配置/保存时共用）：
 * - 非字符串 / 空白 → 空串（视为未配置，走内置查询）；
 * - 控制字符（含换行/Tab）统一替换为空格并折叠空白——历史文件可能被手工编辑，
 *   归一化阶段就消除多行命令，避免把带换行的命令交给 shell；
 * - 截断到 {@link AI_STATUS_COMMAND_MAX_CHARS}（保存链路由 validation 严格拒绝超长）。
 */
function normalizeStatusCommand(value: unknown): string {
    if (typeof value !== 'string') {
        return ''
    }
    let cleaned = ''
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        cleaned += code <= 0x1f || code === 0x7f ? ' ' : value[index]
    }
    return cleaned.replace(/\s+/g, ' ').trim().slice(0, AI_STATUS_COMMAND_MAX_CHARS)
}

/**
 * 归一化单个模型配置（未知/非法字段回落；结构不可用时返回 null，由调用方丢弃该条）。
 *
 * 说明：本函数只做「结构 + 枚举 + 长度」归一化，**不校验 baseUrl 协议**（协议/凭据等
 * 安全校验在 IPC 保存链路的 `main/ai/validation.ts` 中执行）——读取历史文件时容忍
 * 非标准值，避免一条坏数据导致整个配置文件不可用。
 */
export function normalizeAiModelConfig(input: unknown): AiModelConfig | null {
    if (!isRecord(input)) {
        return null
    }
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    if (!isAiModelId(id)) {
        return null
    }
    const provider = isAiProviderKind(input.provider) ? input.provider : 'local'
    const localProvider = isAiLocalProviderId(input.localProvider) ? input.localProvider : 'ollama'
    const modelRaw = typeof input.model === 'string' ? input.model.trim() : ''
    const nameRaw = typeof input.name === 'string' ? input.name.trim() : ''
    const name = (nameRaw.length > 0 ? nameRaw : modelRaw).slice(0, AI_MODEL_NAME_MAX_CHARS)
    const statusCommand = normalizeStatusCommand(input.statusCommand)
    return {
        id,
        name,
        provider,
        localProvider,
        baseUrl: typeof input.baseUrl === 'string' ? input.baseUrl.trim() : '',
        model: modelRaw.slice(0, AI_MODEL_MAX_CHARS),
        ...(statusCommand.length > 0 ? { statusCommand } : {})
    }
}

/**
 * 归一化非敏感 AI 配置（未知/非法字段回落默认值；不抛异常）。
 *
 * 主进程读取配置文件、渲染层读取返回快照时都走该函数，保证两侧对「非法值」的
 * 回落口径一致（与 CFG-10 的「白名单/范围归一化」口径相同）：
 * - 模型列表：逐项归一化，非法条目丢弃、按 id 去重（保留首个）、数量截断到上限；
 * - 默认模型：仅保留确实存在于列表中的 id；指向不存在模型时回落首个模型 / null。
 */
export function normalizeAiStoredConfig(input: unknown): AiStoredConfig {
    const record = isRecord(input) ? input : {}
    const models: AiModelConfig[] = []
    const seenIds = new Set<string>()
    if (Array.isArray(record.models)) {
        for (const item of record.models) {
            if (models.length >= AI_MODELS_MAX) {
                break
            }
            const model = normalizeAiModelConfig(item)
            if (model === null || seenIds.has(model.id)) {
                continue
            }
            seenIds.add(model.id)
            models.push(model)
        }
    }
    const defaultRaw = record.defaultModelId
    let defaultModelId: string | null = null
    if (typeof defaultRaw === 'string' && defaultRaw.trim().length > 0) {
        const candidate = defaultRaw.trim()
        defaultModelId = seenIds.has(candidate) ? candidate : (models[0]?.id ?? null)
    }
    return {
        enabled: record.enabled === true,
        models,
        defaultModelId
    }
}

/** 占位注释：本模块全部导出均为纯常量/纯函数，不读取任何进程级全局状态。 */

/**
 * 解析实际使用的接口基址：用户 baseUrl 非空时使用用户值（去掉结尾 `/`），
 * 否则按 Provider 取默认值（本地 Ollama/LM Studio）；远程 BYOK 无默认值 → 空串。
 */
export function resolveAiBaseUrl(
    model: Pick<AiModelConfig, 'provider' | 'localProvider' | 'baseUrl'>
): string {
    const trimmed = typeof model.baseUrl === 'string' ? model.baseUrl.trim() : ''
    if (trimmed.length > 0) {
        return trimmed.replace(/\/+$/, '')
    }
    if (model.provider === 'local' && isAiLocalProviderId(model.localProvider)) {
        return AI_LOCAL_DEFAULT_BASE_URLS[model.localProvider]
    }
    return ''
}
