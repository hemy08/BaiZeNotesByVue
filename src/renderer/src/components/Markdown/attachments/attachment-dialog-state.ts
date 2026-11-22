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
 */
import { reactive } from 'vue'
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
