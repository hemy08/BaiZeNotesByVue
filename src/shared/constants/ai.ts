/**
 * 1.5.7 LLM Wiki L3：AI Provider / AI ingest 共享常量（主进程与渲染层唯一真源）
 *
 * 本文件是纯数据/纯常量叶子模块（ARCH-05）：不 import Node/Electron/Vue/DOM，
 * 供主进程（`src/main/ai/**`）与渲染层（设置页 AI 分组 / diff 审批 UI）共同引用，
 * 避免两侧各自写一份默认值/白名单（GEN-03 单一真源）。
 *
 * 契约类型见 `src/shared/types/ai.ts`；本文件只提供运行期常量与类型守卫。
 */
import type { AiKeyStorage, AiLocalProviderId, AiProviderKind, AiStoredConfig } from '../types/ai'
// 1.5.7 LLM Wiki L1：`wiki/` 目录名唯一真源（raw/、wiki/ 目录名都在 workspace-mode.ts）
import { LLM_WIKI_WIKI_DIR_NAME } from './workspace-mode'

/* ============================================================================
 * 一、配置默认值（默认「本地 + Ollama + 关闭」，未启用时主进程不发起任何请求）
 * ========================================================================== */

/** AI 独立配置文件版本（结构升级时递增，读取时按版本做兼容/回落） */
export const AI_CONFIG_VERSION = 1

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

/** AI 配置默认值（主进程/渲染层兜底共用：默认关闭 + 本地 Ollama） */
export const AI_DEFAULT_CONFIG: AiStoredConfig = {
    enabled: false,
    provider: 'local',
    localProvider: 'ollama',
    baseUrl: '',
    model: ''
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

/** 模型名长度上限（字符数） */
export const AI_MODEL_MAX_CHARS = 128

/** 接口基址长度上限（字符数） */
export const AI_BASE_URL_MAX_CHARS = 2_048

/** API Key 长度上限（字符数；过短/过长直接拒绝，不落盘） */
export const AI_API_KEY_MAX_CHARS = 512

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

/**
 * 归一化非敏感 AI 配置（未知/非法字段回落默认值；不抛异常）。
 *
 * 主进程读取配置文件、渲染层读取返回快照时都走该函数，保证两侧对「非法值」的
 * 回落口径一致（与 CFG-10 的「白名单/范围归一化」口径相同）。
 */
export function normalizeAiStoredConfig(input: unknown): AiStoredConfig {
    const record =
        input && typeof input === 'object' && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {}
    return {
        enabled: record.enabled === true,
        provider: isAiProviderKind(record.provider) ? record.provider : AI_DEFAULT_CONFIG.provider,
        localProvider: isAiLocalProviderId(record.localProvider)
            ? record.localProvider
            : AI_DEFAULT_CONFIG.localProvider,
        baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl.trim() : '',
        model: typeof record.model === 'string' ? record.model.trim() : ''
    }
}

/** 占位注释：本模块全部导出均为纯常量/纯函数，不读取任何进程级全局状态。 */

/**
 * 解析实际使用的接口基址：用户 baseUrl 非空时使用用户值（去掉结尾 `/`），
 * 否则按 Provider 取默认值（本地 Ollama/LM Studio）；远程 BYOK 无默认值 → 空串。
 */
export function resolveAiBaseUrl(config: AiStoredConfig): string {
    const trimmed = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
    if (trimmed.length > 0) {
        return trimmed.replace(/\/+$/, '')
    }
    if (config.provider === 'local' && isAiLocalProviderId(config.localProvider)) {
        return AI_LOCAL_DEFAULT_BASE_URLS[config.localProvider]
    }
    return ''
}
