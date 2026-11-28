/**
 * LLM Wiki AI 面板 · 模型配置读取（1.5.7 体验升级批次 A：多模型选择）。
 *
 * ## 职责边界
 * - 只经既有 `AI.GET_CONFIG` invoke 读取配置快照（`src/shared/types/ai.ts` 的
 *   `AiConfigSnapshot`），不新增 IPC、不写配置、不接触密钥明文；
 * - 把主进程契约归一化为面板所需的最小信息：是否启用 / 模型选项列表 / 默认模型 id；
 * - **容错**：invoke 不可用（测试/异常环境）、调用抛错、返回结构非法时返回
 *   `{ status: 'error' }`，由面板降级为「默认模型」并允许发送（主进程回退 defaultModelId），
 *   绝不把配置读取失败升级为面板崩溃或发送阻断。
 *
 * ## 契约兼容
 * 1.5.7 多模型契约升级前，主进程可能返回不带 `models` 的旧快照：此时按「未配置模型」
 * 归一化（空列表），面板展示未配置占位并禁用发送——网络/结构问题不会误发给旧配置。
 */
import type { AiConfigSnapshot } from '../../../../shared/types/ai'
import { IPC } from '../../../../shared/ipc-channels'

/** 单个可选模型（面板下拉项：id 用于请求，name 用于展示） */
export interface LlmAiModelOption {
    id: string
    name: string
}

/** 面板消费的模型目录（配置快照归一化结果） */
export interface LlmAiModelCatalog {
    /** AI 能力是否已启用（未启用 = 面板展示未配置占位并禁用发送） */
    enabled: boolean
    /** 可选模型列表（按配置顺序，id 唯一且非空） */
    models: LlmAiModelOption[]
    /** 默认模型 id（必须存在于 models；无模型时为 null） */
    defaultModelId: string | null
}

/** 配置读取结果：ready = 拿到可用目录；error = 读取失败（面板降级为默认模型） */
export type LlmAiConfigReadResult =
    { status: 'ready'; catalog: LlmAiModelCatalog } | { status: 'error' }

/** 可注入的 IPC invoke 签名（默认取 preload 暴露的受限 invoke；测试可注入） */
export type LlmAiConfigInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>

interface ElectronBridgeLike {
    ipcRenderer?: {
        invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
}

/** 解析默认 invoke（preload 缺失/被裁剪时返回 null，由调用方走降级） */
function resolveDefaultInvoke(): LlmAiConfigInvoke | null {
    if (typeof window === 'undefined') {
        return null
    }
    const bridge = (window as unknown as { electron?: ElectronBridgeLike }).electron
    const invoke = bridge?.ipcRenderer?.invoke
    return typeof invoke === 'function' ? invoke.bind(bridge?.ipcRenderer) : null
}

/**
 * 归一化单个模型项：id/name 必须为非空字符串；`name` 缺省时回落 id（保证下拉可读）。
 * 非法项返回 null（由调用方过滤，不让坏数据进入 UI）。
 */
function normalizeModelOption(value: unknown): LlmAiModelOption | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const record = value as { id?: unknown; name?: unknown }
    if (typeof record.id !== 'string' || record.id.trim().length === 0) {
        return null
    }
    const id = record.id.trim()
    const name =
        typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : id
    return { id, name }
}

/**
 * 归一化 `AI.GET_CONFIG` 返回值（`AiConfigSnapshot`）。
 * 返回 null 表示「结构非法」（非对象），由调用方降级；结构合法但缺字段时按安全默认值归一化。
 */
export function normalizeLlmAiConfigSnapshot(value: unknown): LlmAiModelCatalog | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    const snapshot = value as Partial<AiConfigSnapshot>
    const rawModels = Array.isArray(snapshot.models) ? snapshot.models : []
    const seen = new Set<string>()
    const models: LlmAiModelOption[] = []
    for (const raw of rawModels) {
        const option = normalizeModelOption(raw)
        if (!option || seen.has(option.id)) {
            continue
        }
        seen.add(option.id)
        models.push(option)
    }
    const rawDefault = typeof snapshot.defaultModelId === 'string' ? snapshot.defaultModelId : null
    const defaultModelId = rawDefault && seen.has(rawDefault) ? rawDefault : (models[0]?.id ?? null)
    return {
        enabled: snapshot.enabled === true,
        models,
        defaultModelId
    }
}

/**
 * 读取 AI 模型目录。
 * @param invokeOverride 测试/联调可注入 invoke（默认使用受限 ipcRenderer）
 */
export async function readLlmAiModelCatalog(
    invokeOverride?: LlmAiConfigInvoke
): Promise<LlmAiConfigReadResult> {
    const invoke = invokeOverride ?? resolveDefaultInvoke()
    if (!invoke) {
        return { status: 'error' }
    }
    let raw: unknown
    try {
        raw = await invoke(IPC.AI.GET_CONFIG)
    } catch {
        return { status: 'error' }
    }
    const catalog = normalizeLlmAiConfigSnapshot(raw)
    return catalog ? { status: 'ready', catalog } : { status: 'error' }
}
