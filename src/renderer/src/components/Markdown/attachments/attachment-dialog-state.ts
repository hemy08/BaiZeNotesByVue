/**
 * B5 附件管理对话框状态与纯查询辅助（1.5.1 本地知识库基座，2026-11-21）
 *
 * 与 A3 文档历史 / A4 Markdown lint / P0-8 写作风格检查 / B1-B4 知识库查询同构：
 * 对话框由 `attachments/index.ts` 的 `openAttachmentDialog()` 在独立 Vue 应用实例中
 * 挂载，显隐状态放在模块单例里，供宿主与对话框共同消费（避免宿主 / 组件双向 prop 传递）。
 *
 * 边界：
 * - 本模块只依赖 Vue 的 reactive 与 `shared/types` 纯类型，不涉及 IPC / DOM / 日志，
 *   便于单测直接断言纯函数；
 * - 数据真源仍是主进程工作区索引快照（`FILE.GET_WORKSPACE_INDEX`）；
 *   `attachments` / `stats.attachmentCount` / `stats.missingAttachmentCount` 是 task-12
 *   新增的**可选**字段，旧主进程/旧快照可能完全没有该字段，故全部转换函数都做
 *   防御性兼容：不支持时返回 `supported: false`，由 UI 展示「索引版本不支持附件信息」。
 * - 2026-11-22 起增加 B5 扩展（只读孤儿审计 / 批量移入回收站 / 附件重命名）的纯转换与
 *   格式化辅助：主进程 `FILE.GET_ATTACHMENT_AUDIT` / `TRASH_ATTACHMENTS` /
 *   `RENAME_ATTACHMENT` 的返回值统一在这里归一化（异常/旧版本载荷按 failed /
 *   unsupported 返回，不抛异常），组件只消费归一化结果。
 */
import { reactive } from 'vue'
import type { AttachmentAuditEntry } from '../../../../../shared/types/ipc'
import type {
    WorkspaceAttachment,
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../../../../shared/types/workspace-index'

/** 附件管理对话框状态 */
export interface AttachmentDialogState {
    /** 显隐（由 openAttachmentDialogState / closeAttachmentDialogState 驱动） */
    visible: boolean
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const attachmentDialogState = reactive<AttachmentDialogState>({
    visible: false
})

/** 打开附件管理对话框（只切状态；宿主挂载由入口 index.ts 负责） */
export function openAttachmentDialogState(): void {
    attachmentDialogState.visible = true
}

/** 关闭附件管理对话框（只切显隐，不销毁宿主） */
export function closeAttachmentDialogState(): void {
    attachmentDialogState.visible = false
}

/**
 * 快照是否携带附件清单字段（task-12 新增能力）。
 *
 * 旧主进程返回的旧快照没有 `attachments` 字段——必须与「有字段但为空数组」区分：
 * - 不支持：`supported === false`，UI 展示「索引版本不支持附件信息」；
 * - 支持但为空：`supported === true && total === 0`，UI 展示「没有引用任何附件」。
 */
export function supportsAttachmentIndex(snapshot: WorkspaceIndexSnapshot | null): boolean {
    return snapshot !== null && Array.isArray(snapshot.attachments)
}

/**
 * 附件分组结果（缺失在前、正常在后，组内保持快照顺序）。
 *
 * `total` 与 `referenceTotal` 均基于**去重后的合法条目**重新统计，不直接信任
 * `stats.attachmentCount`（旧快照/异常载荷可能缺字段或与清单不一致）。
 */
export interface AttachmentGroup {
    /** 快照是否支持附件清单字段（false = 旧索引版本，整组为空） */
    supported: boolean
    /** 缺失附件（exists === false；含引用路径越界/文件已被删除等） */
    missing: WorkspaceAttachment[]
    /** 正常附件（exists === true） */
    available: WorkspaceAttachment[]
    /** 去重后的附件条目总数（缺失 + 正常） */
    total: number
    /** 全部附件的引用来源总数（同一来源文件对同一附件只计一次） */
    referenceTotal: number
}

/** 路径比较键：统一分隔符 + 小写（Windows 路径大小写不敏感，与索引服务口径一致） */
export function normalizeAttachmentPathKey(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase()
}

/** 防御性归一化单条附件：结构非法返回 null（不让异常载荷进入 UI） */
function normalizeAttachment(raw: unknown): WorkspaceAttachment | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return null
    }
    const record = raw as Record<string, unknown>
    if (typeof record.path !== 'string' || record.path.length === 0) {
        return null
    }
    const referencedBy = Array.isArray(record.referencedBy)
        ? dedupeReferencePaths(
              record.referencedBy.filter(
                  (item): item is string => typeof item === 'string' && item.length > 0
              )
          )
        : []
    return {
        path: record.path,
        relativePath:
            typeof record.relativePath === 'string' && record.relativePath.length > 0
                ? record.relativePath
                : record.path,
        // 缺失判定取严格 true：任何非 true（含旧结构缺字段）都按缺失提示，
        // 避免把不存在的文件误标为正常、给用户错误预期。
        exists: record.exists === true,
        referencedBy
    }
}

/** 去重引用来源（按路径比较键，保留首次出现顺序） */
function dedupeReferencePaths(referencedBy: readonly string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const sourcePath of referencedBy) {
        const key = normalizeAttachmentPathKey(sourcePath)
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        result.push(sourcePath)
    }
    return result
}

/**
 * 从索引快照构建附件分组（B5 主视图）。
 *
 * - 旧快照（无 `attachments` 字段）：`supported: false`，三组均为空；
 * - 空快照/无引用：`supported: true, total: 0`；
 * - 防御性合并：同一绝对路径（Windows 大小写不敏感）只保留一条，`referencedBy` 合并去重；
 * - 纯函数，不修改入参，组内顺序与快照一致（快照已按 relativePath 升序）。
 */
export function buildAttachmentGroups(snapshot: WorkspaceIndexSnapshot | null): AttachmentGroup {
    const empty: AttachmentGroup = {
        supported: false,
        missing: [],
        available: [],
        total: 0,
        referenceTotal: 0
    }
    if (!supportsAttachmentIndex(snapshot)) {
        return empty
    }
    const attachments = snapshot?.attachments ?? []
    const merged = new Map<string, WorkspaceAttachment>()
    for (const raw of attachments) {
        const attachment = normalizeAttachment(raw)
        if (attachment === null) {
            continue
        }
        const key = normalizeAttachmentPathKey(attachment.path)
        const existing = merged.get(key)
        if (existing === undefined) {
            merged.set(key, attachment)
            continue
        }
        // 同一附件重复出现（异常载荷/跨目录写法差异）：保留首次条目的路径与存在性
        // （快照保证同一路径只有一条，正常数据不会走到这里），只合并引用来源并去重。
        existing.referencedBy = dedupeReferencePaths([
            ...existing.referencedBy,
            ...attachment.referencedBy
        ])
    }
    const missing: WorkspaceAttachment[] = []
    const available: WorkspaceAttachment[] = []
    let referenceTotal = 0
    for (const attachment of merged.values()) {
        if (attachment.exists) {
            available.push(attachment)
        } else {
            missing.push(attachment)
        }
        referenceTotal += attachment.referencedBy.length
    }
    return {
        supported: true,
        missing,
        available,
        total: missing.length + available.length,
        referenceTotal
    }
}

/** 附件引用来源的展示结构（绝对路径 + 相对工作区路径 + 来源文件标题） */
export interface AttachmentReferenceView {
    /** 来源文件绝对路径（快照路径字段，可作 title 悬浮提示） */
    path: string
    /** 相对工作区根的展示路径（快照 files 命中时用其 relativePath，否则回退路径本身） */
    relativePath: string
    /** 来源文件展示标题（快照未命中时回退文件名） */
    title: string
}

/** 取路径最后一段（兼容 `/` 与 `\`，用于快照 files 未命中时的兜底标题） */
function basenameOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const index = normalized.lastIndexOf('/')
    return index >= 0 ? normalized.slice(index + 1) : normalized
}

/**
 * 绝对路径 → 相对工作区根的展示路径（仅前缀匹配时裁剪；不匹配时原样返回）。
 * 快照 `files` 未命中来源文件时（例如来源文件已被删除/移出索引）使用。
 */
function toRelativeDisplayPath(rootPath: string, filePath: string): string {
    if (rootPath.length === 0) {
        return filePath
    }
    const normalizedRoot = rootPath.replace(/\\/g, '/')
    const normalizedPath = filePath.replace(/\\/g, '/')
    const rootKey = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`
    if (
        normalizeAttachmentPathKey(normalizedPath).startsWith(normalizeAttachmentPathKey(rootKey))
    ) {
        return normalizedPath.slice(rootKey.length)
    }
    return filePath
}

/**
 * 解析某个附件的引用来源清单（B5 「引用来源数 / 来源文件列表（可展开）」数据源）。
 *
 * - 来源文件绝对路径按大小写不敏感映射到快照 `files`，拿到相对路径与标题；
 * - 快照未命中时回退「裁剪工作区前缀的相对路径 + 文件名」，保证旧/异常数据也能展示；
 * - 去重（Windows 大小写不敏感），保持 `referencedBy` 原顺序；纯函数，不修改入参。
 */
export function resolveAttachmentReferences(
    snapshot: WorkspaceIndexSnapshot | null,
    attachment: WorkspaceAttachment
): AttachmentReferenceView[] {
    const sourceFilesByKey = new Map<string, WorkspaceIndexFile>()
    for (const file of snapshot?.files ?? []) {
        sourceFilesByKey.set(normalizeAttachmentPathKey(file.path), file)
    }
    const rootPath = snapshot?.rootPath ?? ''
    const seen = new Set<string>()
    const views: AttachmentReferenceView[] = []
    for (const sourcePath of attachment.referencedBy) {
        if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
            continue
        }
        const key = normalizeAttachmentPathKey(sourcePath)
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        const sourceFile = sourceFilesByKey.get(key)
        views.push({
            path: sourcePath,
            relativePath: sourceFile?.relativePath ?? toRelativeDisplayPath(rootPath, sourcePath),
            title: sourceFile?.title ?? basenameOf(sourcePath)
        })
    }
    return views
}

/** 附件的引用来源数（去重后；用于行内「N 处引用」文案，纯函数） */
export function countAttachmentReferences(attachment: WorkspaceAttachment): number {
    return dedupeReferencePaths(attachment.referencedBy).length
}

/* ============================================================================
 * B5 扩展：孤儿附件审计 / 批量移入回收站 / 附件重命名（2026-11-22）
 *
 * 与上方只读分组查询同构：本模块只做**纯数据转换**，不发起 IPC、不触碰 DOM，
 * 主进程返回值统一在这里做防御性归一化（异常/旧版本载荷按 failed / unsupported
 * 返回，绝不抛出），UI 层只消费归一化后的结构。
 * ========================================================================== */

/** 是否普通对象（排除 null / 数组；异常 IPC 载荷一律不走 happy path） */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 有限非负数归一化（size / mtimeMs / 数量等；异常值回退 0） */
function toFiniteNonNegative(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/** 有限非负整数归一化（trashed 等计数；异常值回退 0） */
function toFiniteNonNegativeInt(value: unknown): number {
    return Math.floor(toFiniteNonNegative(value))
}

/** 审计失败码白名单（与 shared/types/ipc.ts 的 AttachmentAuditFailure 对齐） */
export const ATTACHMENT_AUDIT_FAILURE_CODES = [
    'NO_WORKSPACE',
    'INVALID_PAYLOAD',
    'AUDIT_ERROR',
    'UNTRUSTED_SENDER'
] as const

export type AttachmentAuditFailureCode = (typeof ATTACHMENT_AUDIT_FAILURE_CODES)[number]

/**
 * 归一化后的孤儿审计视图（UI 只消费本结构）。
 *
 * - `status: 'ok'`：主进程支持审计（`orphans` 为合法数组，空数组表示没有孤儿）；
 * - `status: 'unsupported'`：`ok: true` 但缺少 `orphans` 字段——旧主进程/旧版本兼容，
 *   UI 展示「主进程版本不支持孤儿审计」，不误报成「没有孤儿」；
 * - `status: 'failed'`：安全失败（`ok: false`）或载荷异常，`code` 供 UI 区分
 *   「无工作区 / 审计异常 / IPC 不可用」。
 */
export interface AttachmentAuditView {
    status: 'ok' | 'failed' | 'unsupported'
    /** 失败码（failed 时非空；透传主进程白名单外的异常码统一记 AUDIT_ERROR） */
    code: AttachmentAuditFailureCode | null
    /** 主进程附带的安全错误说明（不含正文，仅用于日志/悬浮提示） */
    message: string | null
    /** 孤儿候选（已按绝对路径去重，保持主进程返回顺序） */
    orphans: AttachmentAuditEntry[]
    /** 被引用的附件数量（合法数字，异常回退 0） */
    referencedCount: number
    /** 扫描到的附件总数（合法数字，异常回退 0） */
    totalCount: number
    /** 是否因上限截断 */
    truncated: boolean
}

/** 防御性归一化单条孤儿审计条目：结构非法返回 null（不让异常载荷进入 UI） */
export function normalizeAttachmentAuditEntry(raw: unknown): AttachmentAuditEntry | null {
    if (!isPlainRecord(raw)) {
        return null
    }
    if (typeof raw.path !== 'string' || raw.path.length === 0) {
        return null
    }
    return {
        path: raw.path,
        relativePath:
            typeof raw.relativePath === 'string' && raw.relativePath.length > 0
                ? raw.relativePath
                : raw.path,
        size: toFiniteNonNegative(raw.size),
        mtimeMs: toFiniteNonNegative(raw.mtimeMs)
    }
}

/**
 * 归一化 `FILE.GET_ATTACHMENT_AUDIT` 返回值。
 *
 * 兼容矩阵：
 * - 主进程不可用 / invoke 抛错 / 返回 null → failed(INVALID_PAYLOAD)，由 UI 提示审计失败；
 * - `{ ok: false, code }` → failed(code)，code 不在白名单时统一 AUDIT_ERROR；
 * - `{ ok: true }` 但无 `orphans` 数组（旧主进程）→ unsupported（不误报空审计）；
 * - `{ ok: true, orphans: [] }` → ok + 空数组（UI 展示「没有发现孤儿附件」）。
 */
export function normalizeAttachmentAuditResult(raw: unknown): AttachmentAuditView {
    const failed = (
        code: AttachmentAuditFailureCode,
        message: string | null = null
    ): AttachmentAuditView => ({
        status: 'failed',
        code,
        message,
        orphans: [],
        referencedCount: 0,
        totalCount: 0,
        truncated: false
    })
    if (!isPlainRecord(raw) || typeof raw.ok !== 'boolean') {
        return failed('INVALID_PAYLOAD')
    }
    if (raw.ok === false) {
        const code = ATTACHMENT_AUDIT_FAILURE_CODES.includes(raw.code as AttachmentAuditFailureCode)
            ? (raw.code as AttachmentAuditFailureCode)
            : 'AUDIT_ERROR'
        return failed(code, typeof raw.message === 'string' ? raw.message : null)
    }
    if (!Array.isArray(raw.orphans)) {
        // 旧主进程没有新增字段：明确标记 unsupported，避免把「未知」当「无孤儿」误导用户
        return {
            status: 'unsupported',
            code: null,
            message: null,
            orphans: [],
            referencedCount: 0,
            totalCount: 0,
            truncated: false
        }
    }
    const merged = new Map<string, AttachmentAuditEntry>()
    for (const item of raw.orphans) {
        const entry = normalizeAttachmentAuditEntry(item)
        if (entry === null) {
            continue
        }
        const key = normalizeAttachmentPathKey(entry.path)
        if (!merged.has(key)) {
            merged.set(key, entry)
        }
    }
    return {
        status: 'ok',
        code: null,
        message: null,
        orphans: Array.from(merged.values()),
        referencedCount: toFiniteNonNegativeInt(raw.referencedCount),
        totalCount: toFiniteNonNegativeInt(raw.totalCount),
        truncated: raw.truncated === true
    }
}

/** 孤儿附件列表的合计字节数（确认文案「总大小」用；纯函数） */
export function sumAttachmentSizes(entries: readonly { size: number }[]): number {
    let total = 0
    for (const entry of entries) {
        total += toFiniteNonNegative(entry.size)
    }
    return total
}

/** 附件大小展示：B / KB / MB / GB / TB，非有限值回退 `—`（纯函数） */
export function formatAttachmentSize(size: number): string {
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
        return '—'
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
    if (size < 1024) {
        return `${Math.round(size)} B`
    }
    let value = size
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

/** 附件修改时间展示：本地时区 `YYYY-MM-DD HH:mm`，非有限/非正值回退 `—`（纯函数） */
export function formatAttachmentMtime(mtimeMs: number): string {
    if (typeof mtimeMs !== 'number' || !Number.isFinite(mtimeMs) || mtimeMs <= 0) {
        return '—'
    }
    const date = new Date(mtimeMs)
    if (Number.isNaN(date.getTime())) {
        return '—'
    }
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours()
    )}:${pad(date.getMinutes())}`
}

/** 重命名输入框默认值：当前文件名去掉最后一个扩展名（纯函数） */
export function defaultRenameBaseName(filePath: string): string {
    const baseName = basenameOf(filePath)
    const dotIndex = baseName.lastIndexOf('.')
    if (dotIndex <= 0) {
        return baseName
    }
    return baseName.slice(0, dotIndex)
}

/** 重命名输入校验结果（reason 供 UI 选择可见提示键） */
export interface AttachmentRenameInput {
    valid: boolean
    /** 提交给主进程的新名称（已 trim；无效时为 trim 后原值，便于回填输入框） */
    newName: string
    reason: 'empty' | 'invalid' | null
}

/**
 * 校验内联重命名输入（纯函数）。
 *
 * 只做「空 / 路径分隔符 / 控制字符 / . 与 ..」这类明显非法输入的提示，
 * 名称冲突、保留字、大小写等最终仍由主进程校验（返回 ALREADY_EXISTS / INVALID_NAME）。
 * 与既有 `RenameFileFolderDialog` 的约定一致：输入为**不含扩展名**的新名称。
 */
export function prepareAttachmentRename(rawInput: string): AttachmentRenameInput {
    const newName = typeof rawInput === 'string' ? rawInput.trim() : ''
    if (newName.length === 0) {
        return { valid: false, newName, reason: 'empty' }
    }
    // 控制字符（含 NUL）无法安全落盘；路径分隔符会导致改名逃逸到其它目录。
    // 不用正则字符类做控制字符范围判断，避免 no-control-regex 规则命中，逐字符比较更直白。
    const hasControlChar = Array.from(newName).some((char) => {
        const code = char.codePointAt(0) ?? 0
        return code < 0x20 || code === 0x7f
    })
    if (newName === '.' || newName === '..' || /[\\/]/.test(newName) || hasControlChar) {
        return { valid: false, newName, reason: 'invalid' }
    }
    return { valid: true, newName, reason: null }
}

/** 孤儿附件的选择键（路径比较键，Windows 大小写不敏感） */
export function orphanSelectionKey(entry: { path: string }): string {
    return normalizeAttachmentPathKey(entry.path)
}

/** 切换某一行的选中状态（返回新 Set，纯函数，便于单测） */
export function toggleOrphanSelected(
    selected: ReadonlySet<string>,
    key: string,
    checked: boolean
): Set<string> {
    const next = new Set(selected)
    if (checked) {
        next.add(key)
    } else {
        next.delete(key)
    }
    return next
}

/** 全选：把当前孤儿列表的选择键全部加入（返回新 Set） */
export function selectAllOrphanKeys(keys: readonly string[]): Set<string> {
    return new Set(keys)
}

/** 刷新/清理后剔除已不存在的选择键（返回新 Set，避免残留不可见选中项） */
export function pruneSelectedKeys(
    selected: ReadonlySet<string>,
    validKeys: readonly string[]
): Set<string> {
    const valid = new Set(validKeys)
    const next = new Set<string>()
    for (const key of selected) {
        if (valid.has(key)) {
            next.add(key)
        }
    }
    return next
}

/** 是否全部选中（列表为空时返回 false，避免「全选」复选框空列表误勾） */
export function isAllOrphanSelected(
    selected: ReadonlySet<string>,
    keys: readonly string[]
): boolean {
    return keys.length > 0 && keys.every((key) => selected.has(key))
}

/** 移入回收站的单条失败原因白名单（与 shared/types/ipc.ts 对齐） */
export const ATTACHMENT_TRASH_FAILURE_REASONS = [
    'PATH_DENIED',
    'NOT_FILE',
    'STILL_REFERENCED',
    'TRASH_FAILED',
    'LIMIT_EXCEEDED'
] as const

export type AttachmentTrashFailureReason = (typeof ATTACHMENT_TRASH_FAILURE_REASONS)[number]

/** 归一化后的单条移入回收站失败项 */
export interface AttachmentTrashFailureView {
    path: string
    reason: AttachmentTrashFailureReason
}

/**
 * 归一化后的批量移入回收站视图。
 *
 * - `ok: true` 且 `failed` 为空 → 全部成功；
 * - `ok: true` 且 `failed` 非空 → 部分失败（已成功项不回滚，逐项展示原因）；
 * - `ok: false` → 整体失败（含无工作区/IPC 不可用/载荷异常），`code` 供 UI 提示。
 */
export interface AttachmentTrashView {
    ok: boolean
    trashed: number
    failed: AttachmentTrashFailureView[]
    code: string | null
    message: string | null
}

/** 移入回收站整体失败码白名单（与 shared/types/ipc.ts 对齐） */
export const ATTACHMENT_TRASH_FAILURE_CODES = [
    'NO_WORKSPACE',
    'INVALID_PAYLOAD',
    'TRASH_ERROR',
    'UNTRUSTED_SENDER'
] as const

/** 防御性归一化单条移入回收站失败项：结构非法返回 null */
export function normalizeAttachmentTrashFailure(raw: unknown): AttachmentTrashFailureView | null {
    if (!isPlainRecord(raw) || typeof raw.path !== 'string' || raw.path.length === 0) {
        return null
    }
    const reason = ATTACHMENT_TRASH_FAILURE_REASONS.includes(
        raw.reason as AttachmentTrashFailureReason
    )
        ? (raw.reason as AttachmentTrashFailureReason)
        : 'TRASH_FAILED'
    return { path: raw.path, reason }
}

/**
 * 归一化 `FILE.TRASH_ATTACHMENTS` 返回值。
 *
 * 主进程不可用 / invoke 抛错 / 返回 null → 整体失败（code TRASH_ERROR），
 * UI 只展示可见失败提示，不抛出异常。
 */
export function normalizeAttachmentTrashResult(raw: unknown): AttachmentTrashView {
    const failed = (code: string, message: string | null = null): AttachmentTrashView => ({
        ok: false,
        trashed: 0,
        failed: [],
        code,
        message
    })
    if (!isPlainRecord(raw) || typeof raw.ok !== 'boolean') {
        return failed('TRASH_ERROR')
    }
    if (raw.ok === false) {
        const code = ATTACHMENT_TRASH_FAILURE_CODES.includes(
            raw.code as (typeof ATTACHMENT_TRASH_FAILURE_CODES)[number]
        )
            ? (raw.code as string)
            : 'TRASH_ERROR'
        return failed(code, typeof raw.message === 'string' ? raw.message : null)
    }
    const failures: AttachmentTrashFailureView[] = []
    if (Array.isArray(raw.failed)) {
        for (const item of raw.failed) {
            const view = normalizeAttachmentTrashFailure(item)
            if (view !== null) {
                failures.push(view)
            }
        }
    }
    return {
        ok: true,
        trashed: toFiniteNonNegativeInt(raw.trashed),
        failed: failures,
        code: null,
        message: null
    }
}

/** 附件重命名失败码白名单（与 shared/types/ipc.ts 对齐） */
export const ATTACHMENT_RENAME_FAILURE_CODES = [
    'NO_WORKSPACE',
    'INVALID_PAYLOAD',
    'PATH_DENIED',
    'INVALID_NAME',
    'ALREADY_EXISTS',
    'NOT_FILE',
    'RENAME_FAILED',
    'UNTRUSTED_SENDER'
] as const

export type AttachmentRenameFailureCode = (typeof ATTACHMENT_RENAME_FAILURE_CODES)[number]

/** 归一化后的附件重命名视图（成功时含写回失败清单，供 UI 提示手动处理） */
export type AttachmentRenameView =
    | {
          ok: true
          newPath: string
          updatedFiles: number
          replacements: number
          failedFiles: string[]
      }
    | { ok: false; code: AttachmentRenameFailureCode; message: string | null }

/** 归一化 `FILE.RENAME_ATTACHMENT` 返回值（异常载荷按 RENAME_FAILED，不抛错） */
export function normalizeAttachmentRenameResult(raw: unknown): AttachmentRenameView {
    if (!isPlainRecord(raw) || typeof raw.ok !== 'boolean') {
        return { ok: false, code: 'RENAME_FAILED', message: null }
    }
    if (raw.ok === false) {
        const code = ATTACHMENT_RENAME_FAILURE_CODES.includes(
            raw.code as AttachmentRenameFailureCode
        )
            ? (raw.code as AttachmentRenameFailureCode)
            : 'RENAME_FAILED'
        return { ok: false, code, message: typeof raw.message === 'string' ? raw.message : null }
    }
    const failedFiles = Array.isArray(raw.failedFiles)
        ? raw.failedFiles.filter(
              (item): item is string => typeof item === 'string' && item.length > 0
          )
        : []
    return {
        ok: true,
        newPath: typeof raw.newPath === 'string' ? raw.newPath : '',
        updatedFiles: toFiniteNonNegativeInt(raw.updatedFiles),
        replacements: toFiniteNonNegativeInt(raw.replacements),
        failedFiles
    }
}

/** 文案描述符（建议 i18n 键 + 中文兜底；组件统一走 tOr(desc.key, desc.fallback)） */
export interface AttachmentMessageDescriptor {
    key: string
    fallback: string
}

const TRASH_REASON_MESSAGES: Record<AttachmentTrashFailureReason, AttachmentMessageDescriptor> = {
    PATH_DENIED: {
        key: 'editorUi.attachments.trashReasonPathDenied',
        fallback: '路径不受信任'
    },
    NOT_FILE: {
        key: 'editorUi.attachments.trashReasonNotFile',
        fallback: '不是普通文件'
    },
    STILL_REFERENCED: {
        key: 'editorUi.attachments.trashReasonStillReferenced',
        fallback: '仍被 Markdown 引用'
    },
    TRASH_FAILED: {
        key: 'editorUi.attachments.trashReasonTrashFailed',
        fallback: '系统回收站不可用'
    },
    LIMIT_EXCEEDED: {
        key: 'editorUi.attachments.trashReasonLimitExceeded',
        fallback: '超出单次数量或大小上限'
    }
}

/** 移入回收站的单条失败原因 → 展示文案（未知原因回退「系统回收站不可用」） */
export function describeAttachmentTrashFailure(reason: string): AttachmentMessageDescriptor {
    return (
        TRASH_REASON_MESSAGES[reason as AttachmentTrashFailureReason] ??
        TRASH_REASON_MESSAGES.TRASH_FAILED
    )
}

const RENAME_CODE_MESSAGES: Record<AttachmentRenameFailureCode, AttachmentMessageDescriptor> = {
    NO_WORKSPACE: {
        key: 'editorUi.attachments.noWorkspace',
        fallback: '尚未打开工作区，无法重命名附件'
    },
    INVALID_PAYLOAD: {
        key: 'editorUi.attachments.renameFailed',
        fallback: '重命名失败，请稍后重试'
    },
    PATH_DENIED: {
        key: 'editorUi.attachments.renamePathDenied',
        fallback: '路径不受信任，无法重命名'
    },
    INVALID_NAME: {
        key: 'editorUi.attachments.renameInvalidName',
        fallback: '文件名不合法（不能包含路径分隔符或特殊字符）'
    },
    ALREADY_EXISTS: {
        key: 'editorUi.attachments.renameConflict',
        fallback: '目标名称已存在，请换一个名称'
    },
    NOT_FILE: {
        key: 'editorUi.attachments.renameNotFile',
        fallback: '目标不是普通文件，无法重命名'
    },
    RENAME_FAILED: {
        key: 'editorUi.attachments.renameFailed',
        fallback: '重命名失败，请稍后重试'
    },
    UNTRUSTED_SENDER: {
        key: 'editorUi.attachments.renameFailed',
        fallback: '重命名失败，请稍后重试'
    }
}

/** 重命名失败码 → 展示文案（冲突 / 路径非法单独提示，未知码回退通用失败） */
export function describeAttachmentRenameFailure(code: string): AttachmentMessageDescriptor {
    return (
        RENAME_CODE_MESSAGES[code as AttachmentRenameFailureCode] ??
        RENAME_CODE_MESSAGES.RENAME_FAILED
    )
}
