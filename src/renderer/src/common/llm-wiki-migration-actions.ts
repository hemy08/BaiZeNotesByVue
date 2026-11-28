/**
 * 1.5.7 LLM Wiki 迁移批次：迁移动作（渲染层）
 *
 * ## 职责边界
 * - 只做三件事：调用主进程白名单通道（`IPC.LLM_WIKI.*`：状态检测 / 扫描 / 迁移 / 回滚）、
 *   把返回值做**运行时结构归一化**、读取 AI 配置判断编译是否可用；不复制主进程的
 *   扫描/复制/回滚逻辑；
 * - 供迁移弹窗 `MigrationWizardDialog.vue` 与 `useWorkspaceModeSwitch` 共用（三处模式切换
 *   入口统一走同一套动作）；
 * - **编译不新增 IPC**：编译选择经 EventBus `LLM_WIKI_COMPILE_REQUEST` 交接给 M2 批量
 *   编译批次（状态检测复用 `IPC.LLM_WIKI.GET_STATUS`，不新增其它通道）。
 *
 * ## 失败口径（LOG-08 禁止静默失败）
 * - 受限 ipcRenderer 不可用 / invoke 抛异常 / 返回结构非法：统一返回 `ok=false` 的结构化结果
 *   （`error` 为可读文案），由弹窗内联展示并允许重试，不抛异常、不弹全局错误框打断流程；
 * - 主进程返回的逐项 `skipped` / `failed` 原样归一化，供弹窗展示明细。
 */
import { IPC } from '../../../shared/ipc-channels'
import type {
    LlmWikiFormatStat,
    LlmWikiLinkImpact,
    LlmWikiLinkImpactSummary,
    LlmWikiMigratableFormatId,
    LlmWikiMigrateRequest,
    LlmWikiMigrateResult,
    LlmWikiMigratedFile,
    LlmWikiMigrationIssue,
    LlmWikiRollbackFailure,
    LlmWikiRollbackResult,
    LlmWikiScanResult,
    LlmWikiWorkspaceStatus
} from '../../../shared/types/ipc'
import { readLlmAiModelCatalog } from '../components/llm-wiki/llm-ai-config'
import { t } from './i18n'
import { logger } from './logger'

/** 可迁移格式 id 白名单（与 shared 契约保持同步的运行时集合，用于结果归一化） */
export const LLM_WIKI_MIGRATION_FORMAT_IDS: readonly LlmWikiMigratableFormatId[] = [
    'markdown',
    'image',
    'pdf',
    'html',
    'text'
]

/** 编译范围（M1 只记录/交接；M2 批量编译队列消费） */
export type LlmWikiCompileScope = 'all' | 'directory' | 'batch'

/** 编译请求交接载荷（EventBus `LLM_WIKI_COMPILE_REQUEST` 的 payload，M2 批次消费） */
export interface LlmWikiCompileRequest {
    scope: LlmWikiCompileScope
    /** scope=directory 时的目录（工作区相对路径，POSIX 分隔符，无首尾斜杠） */
    directory?: string
    /** scope=batch 时的每批文件数 */
    batchSize?: number
}

/** AI 编译可用性检测结果（`AI.GET_CONFIG` 归一化） */
export interface LlmWikiAiCompileStatus {
    /** 是否已配置可用模型（enabled=true 且 models.length>0） */
    configured: boolean
    /** 配置读取是否失败（失败按未配置处理，提示用户可稍后配置） */
    readFailed: boolean
}

/** 渲染层受限 ipcRenderer 的最小结构（便于单测注入替身，不直接依赖 Electron 类型） */
interface RendererIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 取受限 ipcRenderer；非 Electron 环境（测试桩/旧 preload）返回 null */
function getIpcRenderer(): RendererIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const bridge = (window as { electron?: { ipcRenderer?: RendererIpcRendererLike } }).electron
    const ipcRenderer = bridge?.ipcRenderer
    return ipcRenderer && typeof ipcRenderer.invoke === 'function' ? ipcRenderer : null
}

/** 是否为普通对象（运行时结构守卫基础） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取有限数字（非有限/负数回落 0） */
function readCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/** 读取可读字符串（空串/非字符串回落 undefined） */
function readText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** 错误对象 → 可读原因（用于把 IPC 失败原因透给用户） */
function describeError(error: unknown): string | undefined {
    if (error instanceof Error) {
        return error.message
    }
    return typeof error === 'string' && error.trim().length > 0 ? error.trim() : undefined
}

/**
 * IPC 不可用 / 通道异常时的统一可读文案：
 * - 传入 `reason`（具体失败原因）时显示原因，便于用户判断是旧版本、未重启还是主进程异常；
 * - 未传原因时回退通用文案。
 */
function ipcUnavailableMessage(reason?: string): string {
    return reason
        ? t('dialogRenderer.migrationWizard.ipcUnavailableReason', { reason })
        : t('dialogRenderer.migrationWizard.ipcUnavailable')
}

/** 归一化单个格式统计（非法 id 丢弃；缺失格式补 0，保证 5 类齐全） */
function normalizeFormatStats(raw: unknown): LlmWikiFormatStat[] {
    const byId = new Map<LlmWikiMigratableFormatId, { count: number; bytes: number }>()
    if (Array.isArray(raw)) {
        for (const item of raw) {
            if (!isRecord(item)) {
                continue
            }
            const id = LLM_WIKI_MIGRATION_FORMAT_IDS.find((candidate) => candidate === item.id)
            if (id === undefined || byId.has(id)) {
                continue
            }
            byId.set(id, { count: readCount(item.count), bytes: readCount(item.bytes) })
        }
    }
    return LLM_WIKI_MIGRATION_FORMAT_IDS.map((id) => {
        const entry = byId.get(id)
        return { id, count: entry?.count ?? 0, bytes: entry?.bytes ?? 0 }
    })
}

/** 归一化链接影响条目 */
function normalizeLinkImpact(raw: unknown): LlmWikiLinkImpact | null {
    if (!isRecord(raw)) {
        return null
    }
    const format = LLM_WIKI_MIGRATION_FORMAT_IDS.find((candidate) => candidate === raw.format)
    const file = readText(raw.file)
    const targetFile = readText(raw.targetFile)
    const target = readText(raw.target)
    if (format === undefined || file === undefined || targetFile === undefined) {
        return null
    }
    return {
        file,
        line: Math.max(1, Math.trunc(readCount(raw.line))),
        target: target ?? '',
        targetFile,
        format
    }
}

/** 归一化链接影响汇总 */
function normalizeLinkImpactSummary(raw: unknown): LlmWikiLinkImpactSummary {
    if (!isRecord(raw)) {
        return { total: 0, items: [] }
    }
    const items: LlmWikiLinkImpact[] = []
    if (Array.isArray(raw.items)) {
        for (const item of raw.items) {
            const normalized = normalizeLinkImpact(item)
            if (normalized) {
                items.push(normalized)
            }
        }
    }
    const total = Math.max(readCount(raw.total), items.length)
    return { total, items }
}

/** 归一化扫描结果（结构非法时按安全失败处理） */
export function normalizeLlmWikiScanResult(raw: unknown): LlmWikiScanResult {
    if (!isRecord(raw)) {
        return {
            ok: false,
            formats: normalizeFormatStats([]),
            total: 0,
            links: { total: 0, items: [] },
            error: ipcUnavailableMessage()
        }
    }
    const formats = normalizeFormatStats(raw.formats)
    const total = formats.reduce((sum, item) => sum + item.count, 0)
    const error = readText(raw.error)
    return {
        ok: raw.ok === true,
        formats,
        total,
        links: normalizeLinkImpactSummary(raw.links),
        ...(raw.truncated === true ? { truncated: true } : {}),
        ...(error ? { error } : {})
    }
}

/** 归一化成功迁移文件条目 */
function normalizeMigratedFile(raw: unknown): LlmWikiMigratedFile | null {
    if (!isRecord(raw)) {
        return null
    }
    const relativePath = readText(raw.relativePath)
    if (relativePath === undefined) {
        return null
    }
    return {
        path: readText(raw.path) ?? '',
        relativePath,
        targetPath: readText(raw.targetPath) ?? '',
        bytes: readCount(raw.bytes)
    }
}

/** 归一化逐项跳过/失败条目 */
function normalizeIssue(raw: unknown): LlmWikiMigrationIssue | null {
    if (!isRecord(raw)) {
        return null
    }
    const path = readText(raw.path)
    if (path === undefined) {
        return null
    }
    return {
        path,
        reason: readText(raw.reason) ?? t('dialogRenderer.migrationWizard.unknownError')
    }
}

/** 归一化条目数组 */
function normalizeMigratedFiles(raw: unknown): LlmWikiMigratedFile[] {
    if (!Array.isArray(raw)) {
        return []
    }
    return raw
        .map((item) => normalizeMigratedFile(item))
        .filter((item): item is LlmWikiMigratedFile => item !== null)
}

/** 归一化问题数组 */
function normalizeIssues(raw: unknown): LlmWikiMigrationIssue[] {
    if (!Array.isArray(raw)) {
        return []
    }
    return raw
        .map((item) => normalizeIssue(item))
        .filter((item): item is LlmWikiMigrationIssue => item !== null)
}

/** 归一化迁移结果（结构非法/未被信任发送方拒绝时按安全失败处理） */
export function normalizeLlmWikiMigrateResult(raw: unknown): LlmWikiMigrateResult {
    if (!isRecord(raw)) {
        return {
            ok: false,
            mode: null,
            moved: [],
            copied: [],
            skipped: [],
            failed: [],
            logId: null,
            error: ipcUnavailableMessage()
        }
    }
    const mode = raw.mode === 'copy' || raw.mode === 'move' ? raw.mode : null
    const error = readText(raw.error)
    return {
        ok: raw.ok === true,
        mode,
        moved: normalizeMigratedFiles(raw.moved),
        copied: normalizeMigratedFiles(raw.copied),
        skipped: normalizeIssues(raw.skipped),
        failed: normalizeIssues(raw.failed),
        logId: readText(raw.logId) ?? null,
        ...(raw.truncated === true ? { truncated: true } : {}),
        ...(error ? { error } : {})
    }
}

/** 归一化回滚失败条目 */
function normalizeRollbackFailure(raw: unknown): LlmWikiRollbackFailure | null {
    if (!isRecord(raw)) {
        return null
    }
    const path = readText(raw.path)
    if (path === undefined) {
        return null
    }
    return {
        path,
        reason: readText(raw.reason) ?? t('dialogRenderer.migrationWizard.unknownError')
    }
}

/** 归一化回滚结果 */
export function normalizeLlmWikiRollbackResult(raw: unknown): LlmWikiRollbackResult {
    if (!isRecord(raw)) {
        return { ok: false, restored: 0, failed: [], error: ipcUnavailableMessage() }
    }
    const failed: LlmWikiRollbackFailure[] = Array.isArray(raw.failed)
        ? raw.failed
              .map((item) => normalizeRollbackFailure(item))
              .filter((item): item is LlmWikiRollbackFailure => item !== null)
        : []
    const mode = raw.mode === 'copy' || raw.mode === 'move' ? raw.mode : undefined
    const error = readText(raw.error)
    const logId = readText(raw.logId)
    return {
        ok: raw.ok === true,
        ...(mode ? { mode } : {}),
        restored: readCount(raw.restored),
        failed,
        ...(logId ? { logId } : {}),
        ...(error ? { error } : {})
    }
}

/**
 * 归一化「工作区 LLM Wiki 状态」检测结果（`LLM_WIKI.GET_STATUS`）。
 *
 * 四个字段必须全为布尔：结构非法（旧 preload / 非受信返回对象 / 字段缺失）返回 null，
 * 由调用方按「状态未知」保守处理（弹迁移弹窗），避免把非法结构误判为已初始化而跳过问询。
 */
export function normalizeLlmWikiWorkspaceStatus(raw: unknown): LlmWikiWorkspaceStatus | null {
    if (!isRecord(raw)) {
        return null
    }
    if (
        typeof raw.initialized !== 'boolean' ||
        typeof raw.hasRaw !== 'boolean' ||
        typeof raw.hasWiki !== 'boolean' ||
        typeof raw.hasSchema !== 'boolean'
    ) {
        return null
    }
    return {
        initialized: raw.initialized,
        hasRaw: raw.hasRaw,
        hasWiki: raw.hasWiki,
        hasSchema: raw.hasSchema
    }
}

/**
 * 检测当前工作区是否已初始化 LLM Wiki（只读，不读文件内容）。
 *
 * @returns 归一化状态；受限 ipcRenderer 不可用 / invoke 异常 / 结构非法 → null
 *          （调用方按「状态未知」保守回退到迁移弹窗，失败不阻断模式切换入口）
 */
export async function getLlmWikiWorkspaceStatus(): Promise<LlmWikiWorkspaceStatus | null> {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[LlmWiki迁移] 受限 ipcRenderer 不可用，无法检测工作区 LLM Wiki 状态')
        return null
    }
    try {
        const raw = await ipcRenderer.invoke(IPC.LLM_WIKI.GET_STATUS)
        const status = normalizeLlmWikiWorkspaceStatus(raw)
        if (status === null) {
            logger.error('[LlmWiki迁移] 工作区 LLM Wiki 状态返回结构非法，按状态未知处理')
        }
        return status
    } catch (error) {
        logger.error('[LlmWiki迁移] 检测工作区 LLM Wiki 状态 IPC 调用异常：', error)
        return null
    }
}

/**
 * 扫描当前工作区可迁移文件（只读统计 + Markdown 链接影响）。
 * 失败返回 `ok=false` + 可读错误文案，供弹窗内联提示并重试。
 */
export async function scanWorkspaceMigratableFiles(): Promise<LlmWikiScanResult> {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[LlmWiki迁移] 受限 ipcRenderer 不可用，无法扫描可迁移文件')
        return {
            ok: false,
            formats: normalizeFormatStats([]),
            total: 0,
            links: { total: 0, items: [] },
            error: t('dialogRenderer.migrationWizard.ipcUnavailableBridge')
        }
    }
    try {
        const raw = await ipcRenderer.invoke(IPC.LLM_WIKI.SCAN_FILES)
        return normalizeLlmWikiScanResult(raw)
    } catch (error) {
        logger.error('[LlmWiki迁移] 扫描可迁移文件 IPC 调用异常：', error)
        return {
            ok: false,
            formats: normalizeFormatStats([]),
            total: 0,
            links: { total: 0, items: [] },
            error: ipcUnavailableMessage(describeError(error))
        }
    }
}

/** 执行复制/移动迁移（用户确认后调用；失败返回结构化结果，不抛异常） */
export async function runWorkspaceMigration(
    request: LlmWikiMigrateRequest
): Promise<LlmWikiMigrateResult> {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[LlmWiki迁移] 受限 ipcRenderer 不可用，无法执行迁移')
        return {
            ok: false,
            mode: request.mode,
            moved: [],
            copied: [],
            skipped: [],
            failed: [],
            logId: null,
            error: t('dialogRenderer.migrationWizard.ipcUnavailableBridge')
        }
    }
    try {
        const raw = await ipcRenderer.invoke(IPC.LLM_WIKI.MIGRATE, request)
        const result = normalizeLlmWikiMigrateResult(raw)
        if (!result.ok) {
            logger.error('[LlmWiki迁移] 迁移失败：', result.error ?? t('common.unknown'))
        }
        return result
    } catch (error) {
        logger.error('[LlmWiki迁移] 迁移 IPC 调用异常：', error)
        return {
            ok: false,
            mode: request.mode,
            moved: [],
            copied: [],
            skipped: [],
            failed: [],
            logId: null,
            error: ipcUnavailableMessage(describeError(error))
        }
    }
}

/**
 * 回滚迁移（缺省回滚最近一次；显式 logId 回滚本次弹窗产生的日志）。
 * 失败返回结构化结果，不抛异常。
 */
export async function rollbackWorkspaceMigration(
    logId?: string | null
): Promise<LlmWikiRollbackResult> {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[LlmWiki迁移] 受限 ipcRenderer 不可用，无法回滚迁移')
        return {
            ok: false,
            restored: 0,
            failed: [],
            error: t('dialogRenderer.migrationWizard.ipcUnavailableBridge')
        }
    }
    try {
        const payload = logId ? { logId } : undefined
        const raw = await ipcRenderer.invoke(IPC.LLM_WIKI.ROLLBACK_MIGRATION, payload)
        const result = normalizeLlmWikiRollbackResult(raw)
        if (!result.ok) {
            logger.error('[LlmWiki迁移] 回滚失败：', result.error ?? t('common.unknown'))
        }
        return result
    } catch (error) {
        logger.error('[LlmWiki迁移] 回滚 IPC 调用异常：', error)
        return {
            ok: false,
            restored: 0,
            failed: [],
            error: ipcUnavailableMessage(describeError(error))
        }
    }
}

/**
 * 检测 AI 编译是否可用（已有 `AI.GET_CONFIG` 通道，不新增 IPC）：
 * `enabled === true && models.length > 0` 视为已配置（defaultModelId 缺省时由归一化回退首个模型）。
 * 读取失败按「未配置」处理（`readFailed=true`，弹窗提示可稍后配置）。
 */
export async function readLlmWikiAiCompileStatus(): Promise<LlmWikiAiCompileStatus> {
    const result = await readLlmAiModelCatalog()
    if (result.status === 'error') {
        return { configured: false, readFailed: true }
    }
    return {
        configured: result.catalog.enabled && result.catalog.models.length > 0,
        readFailed: false
    }
}

/** 编译批次数量合法范围（弹窗校验与主进程后续批次共用口径） */
export const LLM_WIKI_COMPILE_BATCH_SIZE_MIN = 1
/** 编译批次数量上限 */
export const LLM_WIKI_COMPILE_BATCH_SIZE_MAX = 500
/** 编译批次默认大小（方案确认：每批 10） */
export const LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT = 10

/**
 * 字节数格式化（B/KB/MB/GB；0/非法值 → `0 B`）。迁移范围按格式展示总大小用。
 */
export function formatLlmWikiMigrationBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B'
    }
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10
    return `${rounded} ${units[unitIndex]}`
}

/**
 * 归一化「指定目录编译」的目录输入：
 * 统一分隔符、去掉首尾斜杠；空串/`.`/`..`/绝对路径段返回 null（由弹窗内联报错）。
 */
export function normalizeCompileDirectoryInput(value: string): string | null {
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (normalized.length === 0) {
        return null
    }
    const segments = normalized.split('/')
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
        return null
    }
    return normalized
}

/**
 * 归一化「分批编译」的每批文件数：必须是 1–500 的整数；非法返回 null。
 */
export function normalizeCompileBatchSize(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (
        !Number.isInteger(numeric) ||
        numeric < LLM_WIKI_COMPILE_BATCH_SIZE_MIN ||
        numeric > LLM_WIKI_COMPILE_BATCH_SIZE_MAX
    ) {
        return null
    }
    return numeric
}
