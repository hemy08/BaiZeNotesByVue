/**
 * 1.5.7 LLM Wiki 迁移批次：传统工作区 → LLM Wiki 文件迁移服务（主进程）
 *
 * ## 职责
 * - `scanLlmWikiMigratableFiles()`：只读扫描当前工作区，按文件格式统计可迁移文件数量/字节
 *   （**不读文件内容**，仅目录遍历 + stat），并扫描 Markdown 中指向「可迁移文件」的链接
 *   （`[[Wiki 链接]]` / 相对 Markdown 与图片引用），供弹窗在「移动到 raw」时预警断链；
 * - `migrateLlmWikiFiles()`：用户确认后把所选格式的文件**复制/移动**到 `<root>/raw/`
 *   （保持原相对目录结构；同名冲突跳过并记录；逐项结构化失败）；
 * - `rollbackLlmWikiMigration()`：按操作日志回滚最近一次迁移（move → 移回原路径；
 *   copy → 删除复制体；**回滚前做目标指纹冲突检测**，被修改/缺失的逐项报告、不误删误移）。
 *
 * ## 操作日志（可审计 + 崩溃可恢复）
 * - 位置：`app.getPath('userData')/migrations/<timestamp>.json`（**不写工作区**）；
 * - 内容：迁移方式、工作区根、格式范围、文件映射（原路径/目标路径/字节数/**目标指纹
 *   size + mtimeMs**）、跳过与失败明细、时间、状态（in-progress / applied / rolled-back）；
 *   **绝不记录文件内容**；
 * - 迁移开始即写入 `in-progress` 日志，每 25 个成功条目持久化一次，结束后更新为 `applied`；
 *   应用崩溃/关闭后残留的 `in-progress` 日志仍可回滚已记录条目，再次执行 MIGRATE 即幂等重试；
 * - 回滚成功后把同一日志状态更新为 `rolled-back`（tmp + rename 原子替换）。
 *
 * ## 安全边界（专用迁移授权，不放宽普通 raw 只读守卫语义）
 * 1. 工作区根只取主进程 `appState.rootPath`（渲染层不传根；单测可注入）；
 * 2. 源路径：归一化绝对路径 + 必须位于工作区内 + 非符号链接 + realpath 不逃逸；
 * 3. 目标路径：词法上必须位于 `<root>/raw/` 子树，且目标父目录 realpath 仍在 raw/ 内
 *    （阻断 raw/ 内预置符号链接目录的逃逸）；
 * 4. 复制/移动**绝不覆盖**已存在文件（copyFile 使用 COPYFILE_EXCL；move 先 lstat 预检，
 *    跨盘 EXDEV 回退「独占复制 + 删除源文件」并在失败时清理半成品）；
 * 5. 回滚同样逐项复核日志中的源/目标路径（防止日志被篡改后越界写盘）；
 * 6. 所有可预期失败返回结构化结果，不向渲染层抛异常/堆栈；日志不含文件内容（SEC-16）。
 *
 * ## 忽略口径（扫描/迁移一致）
 * - 目录：`raw/`、`wiki/`、隐藏目录（`.` 开头）、依赖/VCS/IDE/凭据目录（node_modules/.git 等）；
 * - 文件：`schema.md` 约定文件；符号链接一律跳过（防逃逸与目录环）；
 * - 上限：最多统计/迁移 20000 个文件、递归深度 32（超出置 truncated，可再次执行继续迁移）。
 */
import { promises as fs, constants as fsConstants } from 'fs'
import type { Dirent } from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { appState } from './app-state'
import { logger } from './logger'
import { isSameOrWithin, normalizeLocalPath } from './security'
import { LLM_WIKI_RAW_DIR_NAME } from '../../shared/constants/workspace-mode'
import type {
    LlmWikiFormatStat,
    LlmWikiLinkImpact,
    LlmWikiLinkImpactSummary,
    LlmWikiMigratableFormatId,
    LlmWikiMigrateRequest,
    LlmWikiMigrateResult,
    LlmWikiMigratedFile,
    LlmWikiMigrationIssue,
    LlmWikiMigrationMode,
    LlmWikiRollbackFailure,
    LlmWikiRollbackRequest,
    LlmWikiRollbackResult,
    LlmWikiScanResult
} from '../../shared/types/ipc'

// ============================ 常量（单一真源，供扫描/迁移/测试共用） ============================

/** 可迁移格式 id（固定顺序：弹窗按此顺序渲染格式多选） */
export const LLM_WIKI_MIGRATION_FORMAT_IDS: readonly LlmWikiMigratableFormatId[] = [
    'markdown',
    'image',
    'pdf',
    'html',
    'text'
]

/** 格式 → 扩展名白名单（小写带点；大小写不敏感比较） */
export const LLM_WIKI_MIGRATION_FORMAT_EXTENSIONS: Readonly<
    Record<LlmWikiMigratableFormatId, readonly string[]>
> = {
    markdown: ['.md', '.markdown'],
    image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'],
    pdf: ['.pdf'],
    html: ['.html', '.htm'],
    text: ['.txt']
}

/** 扫描/迁移跳过的目录名（命中任意层级即跳过；隐藏目录另由 `isHiddenDirectoryName` 处理） */
export const LLM_WIKI_MIGRATION_SKIPPED_DIR_NAMES: ReadonlySet<string> = new Set([
    // LLM Wiki 约定目录：raw/ 是迁移目标、wiki/ 是编译产物，均不参与再次迁移
    LLM_WIKI_RAW_DIR_NAME,
    'wiki',
    // 依赖 / VCS / IDE
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.bzr',
    '.idea',
    '.vscode',
    // 敏感凭据目录（即使工作区误选到用户主目录也不扫描）
    '.ssh',
    '.gnupg',
    '.aws',
    '.azure',
    '.kube',
    '.docker'
])

/** 跳过的文件名（LLM Wiki 工作区约定文件，绝不迁移/不覆盖） */
export const LLM_WIKI_MIGRATION_SKIPPED_FILE_NAMES: ReadonlySet<string> = new Set(['schema.md'])

/** 单次扫描/迁移的文件数上限（超大工作区安全降级） */
export const LLM_WIKI_MIGRATION_MAX_FILES = 20_000
/** 目录递归深度上限（防异常目录结构/挂载点环） */
export const LLM_WIKI_MIGRATION_MAX_DEPTH = 32
/** 链接影响扫描：参与解析的 Markdown 文件数上限 */
export const LLM_WIKI_MIGRATION_MAX_LINK_FILES = 5000
/** 链接影响扫描：单个 Markdown 文件参与解析的大小上限（1 MiB，超出跳过该文件） */
export const LLM_WIKI_MIGRATION_MAX_LINK_FILE_BYTES = 1024 * 1024
/** 链接影响明细返回上限（total 仍是完整计数） */
export const LLM_WIKI_MIGRATION_MAX_LINK_ITEMS = 200
/** 目标指纹 mtime 比较容差（毫秒；同机同盘写入后立即读取，容差仅为浮点安全余量） */
export const LLM_WIKI_MIGRATION_MTIME_TOLERANCE_MS = 2
/** 迁移过程中日志持久化间隔（每 N 个成功条目落盘一次，兼顾崩溃可恢复与写放大） */
export const LLM_WIKI_MIGRATION_LOG_FLUSH_INTERVAL = 25
/** 操作日志目录名（位于 Electron userData 下，不写工作区） */
export const LLM_WIKI_MIGRATION_LOG_DIR_NAME = 'migrations'
/** 操作日志格式版本 */
export const LLM_WIKI_MIGRATION_LOG_VERSION = 1

/** 错误文案：尚未打开工作区 */
export const LLM_WIKI_MIGRATION_ERROR_NO_WORKSPACE = '尚未打开工作区，无法扫描或迁移文件。'
/** 错误文案：工作区根路径不合法 */
export const LLM_WIKI_MIGRATION_ERROR_INVALID_ROOT = '当前工作区路径不合法，无法扫描或迁移文件。'
/** 错误文案：工作区根不可访问 */
export const LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE =
    '当前工作区目录不存在或不可访问，无法扫描或迁移文件。'
/** 错误文案：迁移请求载荷非法 */
export const LLM_WIKI_MIGRATION_ERROR_INVALID_PAYLOAD =
    '迁移参数不合法：需要合法的迁移方式（copy / move）与至少一种文件格式。'
/** 错误文案：raw/ 目录不可用或不是工作区内的真实目录 */
export const LLM_WIKI_MIGRATION_ERROR_RAW_UNAVAILABLE =
    'raw/ 目录不可用或不是工作区内的真实目录，已拒绝迁移。'
/** 错误文案前缀：创建 raw/ 目录失败 */
export const LLM_WIKI_MIGRATION_ERROR_CREATE_RAW_FAILED = '创建 raw/ 目录失败：'
/** 错误文案：迁移日志目录不可用（回滚依赖日志） */
export const LLM_WIKI_MIGRATION_ERROR_LOG_UNAVAILABLE = '迁移操作日志目录不可用，无法回滚。'
/** 错误文案：未找到可回滚的迁移记录 */
export const LLM_WIKI_MIGRATION_ERROR_NO_LOG = '未找到可回滚的迁移记录。'
/** 错误文案：指定的迁移日志不存在 */
export const LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND = '未找到指定的迁移日志。'
/** 错误文案：迁移日志损坏 */
export const LLM_WIKI_MIGRATION_ERROR_LOG_INVALID = '迁移操作日志已损坏，无法回滚。'
/** 错误文案：日志对应的工作区与当前工作区不一致 */
export const LLM_WIKI_MIGRATION_ERROR_LOG_ROOT_MISMATCH =
    '该迁移日志对应的不是当前工作区，已拒绝回滚。'
/** 错误文案：回滚参数非法 */
export const LLM_WIKI_MIGRATION_ERROR_INVALID_ROLLBACK_PAYLOAD =
    '回滚参数不合法：logId 必须是非空字符串（缺省回滚最近一次迁移）。'

/** 逐项失败/跳过原因（UI 直接展示，均为可读中文短句） */
export const LLM_WIKI_MIGRATION_REASON = {
    sourceInvalid: '源路径不合法（不在工作区内或路径形态异常）',
    sourceSymlink: '源文件是符号链接，已拒绝迁移',
    sourceNotFile: '源路径不是普通文件',
    sourceEscape: '源文件真实路径越界（符号链接逃逸）',
    targetInvalid: '目标路径不在 raw/ 目录内，已拒绝迁移',
    targetEscape: '目标目录真实路径越界（raw/ 内含符号链接）',
    targetExists: '目标已存在同名文件（不覆盖，已跳过）',
    sourceMissing: '源文件不存在或已被移动',
    targetMissing: 'raw/ 中目标文件不存在（可能已被删除）',
    targetNotRegular: 'raw/ 中目标不是普通文件（目录或符号链接）',
    targetModified: '文件在迁移后被修改，已跳过回滚（避免误删/误移）',
    restoreConflict: '原位置已存在同名文件（不覆盖）',
    logPathInvalid: '操作日志中的路径不合法（越界或形态异常）',
    unknown: '未知错误'
} as const

// ============================ 类型 ============================

/** 迁移服务可注入依赖（生产缺省取 appState / userData；单测注入临时目录与固定时间） */
export interface LlmWikiMigrationDeps {
    /** 工作区根（缺省 `appState.rootPath`；生产不传，单测可注入） */
    rootPath?: string
    /** 操作日志目录（缺省 `userData/migrations`；传 `null` 表示日志不可用，单测验证降级） */
    logDir?: string | null
    /** 时间源（日志 id / createdAt；单测固定） */
    now?: () => Date
}

/** 扫描到的单个可迁移文件（内部结构；导出仅为单测注入链接影响扫描用） */
export interface MigratableFile {
    /** 绝对路径（已归一化） */
    absolutePath: string
    /** 相对工作区根路径（POSIX 分隔符） */
    relativePath: string
    /** 格式分类 */
    format: LlmWikiMigratableFormatId
    /** 字节数 */
    bytes: number
}

/** 目录遍历结果 */
interface CollectResult {
    files: MigratableFile[]
    truncated: boolean
}

/** 工作区根解析结果（成功 = 词法根 + 真实根均可用） */
type RootResolution = { ok: true; root: string; realRoot: string } | { ok: false; error: string }

/** 单项迁移结果 */
type MigrateItemResult =
    | {
          status: 'copied' | 'moved'
          file: LlmWikiMigratedFile
          targetSize: number
          targetMtimeMs: number
      }
    | { status: 'skipped'; reason: string }
    | { status: 'failed'; reason: string }

/** 迁移操作日志状态：in-progress（进行中/崩溃残留）/ applied（已完成）/ rolled-back（已回滚） */
export type LlmWikiMigrationLogStatus = 'in-progress' | 'applied' | 'rolled-back'

/** 迁移操作日志中的单个文件映射（回滚依据；不含文件内容） */
export interface LlmWikiMigrationLogEntry {
    /** 相对工作区根路径（POSIX 分隔符） */
    relativePath: string
    /** 原文件绝对路径 */
    sourcePath: string
    /** raw/ 下目标绝对路径 */
    targetPath: string
    /** 字节数（仅元数据） */
    bytes: number
    /** 目标文件大小指纹（回滚前冲突检测；-1 = 未知，跳过该维度校验） */
    targetSize: number
    /** 目标文件 mtime 指纹（毫秒；-1 = 未知，跳过该维度校验） */
    targetMtimeMs: number
    /** 动作（与迁移方式一致；冗余记录便于审计） */
    action: LlmWikiMigrationMode
}

/** 迁移操作日志记录（userData/migrations/<timestamp>.json） */
export interface LlmWikiMigrationLogRecord {
    version: number
    /** 日志 id（= 文件名去 .json） */
    id: string
    /** 创建时间（ISO 字符串） */
    createdAt: string
    /** 最近更新时间（ISO 字符串） */
    updatedAt?: string
    /** 迁移方式 */
    mode: LlmWikiMigrationMode
    /** 工作区根（归一化绝对路径） */
    rootPath: string
    /** 本次迁移的格式范围 */
    formats: LlmWikiMigratableFormatId[]
    /** 文件映射（已成功迁移的条目） */
    entries: LlmWikiMigrationLogEntry[]
    /** 跳过明细 */
    skipped: LlmWikiMigrationIssue[]
    /** 失败明细 */
    failed: LlmWikiMigrationIssue[]
    /** 日志状态 */
    status: LlmWikiMigrationLogStatus
    /** 回滚时间（status=rolled-back 时存在） */
    rolledBackAt?: string
}

/** 创建日志文件的返回（id + 绝对路径，供迁移过程中增量更新） */
interface MigrationLogHandle {
    id: string
    filePath: string
}

// ============================ 通用工具 ============================

/** 从底层异常中提取可读原因（Error.message / 字符串化） */
function describeError(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
        return error.message
    }
    return String(error)
}

/** 是否隐藏目录（`.` 开头；`..` 不会出现在 readdir 结果中） */
function isHiddenDirectoryName(name: string): boolean {
    return name.startsWith('.')
}

/** 文件名 → 可迁移格式 id（未命中返回 null；大小写不敏感） */
export function formatLlmWikiMigratableFile(fileName: string): LlmWikiMigratableFormatId | null {
    const lower = fileName.toLowerCase()
    for (const formatId of LLM_WIKI_MIGRATION_FORMAT_IDS) {
        const extensions = LLM_WIKI_MIGRATION_FORMAT_EXTENSIONS[formatId]
        if (extensions.some((extension) => lower.endsWith(extension))) {
            return formatId
        }
    }
    return null
}

/** 目录名是否属于扫描跳过项（隐藏目录 / 约定目录 / 依赖与凭据目录） */
export function isSkippedLlmWikiMigrationDirectory(name: string): boolean {
    return isHiddenDirectoryName(name) || LLM_WIKI_MIGRATION_SKIPPED_DIR_NAMES.has(name)
}

/** 文件名是否属于跳过项（schema.md 约定文件；大小写不敏感） */
export function isSkippedLlmWikiMigrationFile(name: string): boolean {
    return LLM_WIKI_MIGRATION_SKIPPED_FILE_NAMES.has(name.toLowerCase())
}

/** 真实路径解析（失败返回 null，调用方按不可用处理） */
async function safeRealpath(target: string): Promise<string | null> {
    try {
        return await fs.realpath(target)
    } catch {
        return null
    }
}

/** 相对路径统一为 POSIX 分隔符（跨平台展示/日志一致） */
function toRelativePosixPath(root: string, target: string): string {
    return path.relative(root, target).split(path.sep).join('/')
}

/** 两个规范化路径是否指向同一位置（大小写口径与 Path Guard 一致） */
function isSamePath(left: string, right: string): boolean {
    return isSameOrWithin(left, right) && isSameOrWithin(right, left)
}

/** 路径比较键（Windows 大小写不敏感，与 Path Guard 同口径） */
function pathCompareKey(target: string): string {
    return process.platform === 'win32' ? target.toLowerCase() : target
}

/** 取工作区根（词法根 + realpath）；失败返回结构化错误文案 */
async function resolveWorkspaceRoot(rawRoot: unknown): Promise<RootResolution> {
    if (typeof rawRoot !== 'string' || rawRoot.trim().length === 0) {
        return { ok: false, error: LLM_WIKI_MIGRATION_ERROR_NO_WORKSPACE }
    }
    const root = normalizeLocalPath(rawRoot)
    if (root === null) {
        return { ok: false, error: LLM_WIKI_MIGRATION_ERROR_INVALID_ROOT }
    }
    try {
        const stats = await fs.stat(root)
        if (!stats.isDirectory()) {
            return { ok: false, error: LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE }
        }
    } catch (error) {
        logger.warn('[LLM Wiki 迁移] 工作区根不可访问：', root, error)
        return { ok: false, error: LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE }
    }
    const realRoot = await safeRealpath(root)
    if (realRoot === null) {
        logger.warn('[LLM Wiki 迁移] 工作区根真实路径不可解析：', root)
        return { ok: false, error: LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE }
    }
    return { ok: true, root, realRoot }
}

/** 取迁移根（deps.rootPath 优先；缺省 appState.rootPath） */
function resolveRootInput(deps: LlmWikiMigrationDeps): string | undefined {
    return deps.rootPath !== undefined ? deps.rootPath : appState.rootPath
}

/** 解析迁移日志目录（deps.logDir：undefined=userData/migrations；null=不可用） */
function resolveMigrationLogDir(deps: LlmWikiMigrationDeps): string | null {
    if (deps.logDir === null) {
        return null
    }
    if (typeof deps.logDir === 'string' && deps.logDir.trim().length > 0) {
        return deps.logDir
    }
    try {
        return path.join(app.getPath('userData'), LLM_WIKI_MIGRATION_LOG_DIR_NAME)
    } catch (error) {
        logger.warn('[LLM Wiki 迁移] 无法解析 userData 日志目录：', error)
        return null
    }
}

/** 取当前时间（单测注入固定时间源） */
function resolveNow(deps: LlmWikiMigrationDeps): Date {
    return deps.now ? deps.now() : new Date()
}

// ============================ 扫描：文件清单 ============================

/**
 * 递归收集工作区内可迁移文件（跳过忽略目录/隐藏目录/schema.md/符号链接，不读内容）。
 * 目录读取/单文件 stat 失败按跳过处理并记录 WARN，不中断整体扫描。
 */
async function collectMigratableFiles(root: string, realRoot: string): Promise<CollectResult> {
    const files: MigratableFile[] = []
    let truncated = false

    const walk = async (dirPath: string, depth: number): Promise<void> => {
        if (truncated) {
            return
        }
        let entries: Dirent[]
        try {
            entries = await fs.readdir(dirPath, { withFileTypes: true })
        } catch (error) {
            logger.warn('[LLM Wiki 迁移] 读取目录失败，已跳过：', dirPath, error)
            return
        }
        entries.sort((left, right) => left.name.localeCompare(right.name))
        for (const entry of entries) {
            if (truncated) {
                return
            }
            const fullPath = path.join(dirPath, entry.name)
            // 符号链接一律跳过：防逃逸出工作区与目录环
            if (entry.isSymbolicLink()) {
                continue
            }
            if (entry.isDirectory()) {
                if (isSkippedLlmWikiMigrationDirectory(entry.name)) {
                    continue
                }
                if (depth >= LLM_WIKI_MIGRATION_MAX_DEPTH) {
                    truncated = true
                    return
                }
                const realDirectory = await safeRealpath(fullPath)
                if (realDirectory === null || !isSameOrWithin(realDirectory, realRoot)) {
                    logger.warn('[LLM Wiki 迁移] 目录真实路径越界，已跳过：', fullPath)
                    continue
                }
                await walk(fullPath, depth + 1)
                continue
            }
            if (!entry.isFile() || isSkippedLlmWikiMigrationFile(entry.name)) {
                continue
            }
            const format = formatLlmWikiMigratableFile(entry.name)
            if (format === null) {
                continue
            }
            if (files.length >= LLM_WIKI_MIGRATION_MAX_FILES) {
                truncated = true
                return
            }
            let stats: Awaited<ReturnType<typeof fs.stat>>
            try {
                stats = await fs.stat(fullPath)
            } catch (error) {
                logger.warn('[LLM Wiki 迁移] 读取文件信息失败，已跳过：', fullPath, error)
                continue
            }
            if (!stats.isFile()) {
                continue
            }
            files.push({
                absolutePath: fullPath,
                relativePath: toRelativePosixPath(root, fullPath),
                format,
                bytes: stats.size
            })
        }
    }

    await walk(root, 0)
    return { files, truncated }
}

/** 汇总各格式统计（固定包含全部 5 类；total = 各 count 之和） */
export function summarizeLlmWikiMigrationFormats(
    files: readonly Pick<MigratableFile, 'format' | 'bytes'>[]
): LlmWikiFormatStat[] {
    return LLM_WIKI_MIGRATION_FORMAT_IDS.map((id) => {
        let count = 0
        let bytes = 0
        for (const file of files) {
            if (file.format !== id) {
                continue
            }
            count += 1
            bytes += file.bytes
        }
        return { id, count, bytes }
    })
}

// ============================ 扫描：Markdown 链接影响 ============================

/** Markdown 中提取出的单个链接目标 */
export interface ExtractedMarkdownLink {
    /** 行号（1-based） */
    line: number
    /** 列号（1-based，仅用于同一行内排序） */
    column: number
    /** 原始目标文本（已去除尖括号包裹，未解码） */
    target: string
    /** 是否为 `[[Wiki 链接]]` 语法 */
    wiki: boolean
}

/** 去掉 Markdown 围栏代码块内容（保留行数，行号不偏移） */
function stripFencedCodeBlocks(content: string): string {
    const lines = content.split('\n')
    let fence: string | null = null
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
        if (fence === null && match) {
            fence = match[1][0]
            lines[index] = ''
            continue
        }
        if (fence !== null) {
            if (match && match[1][0] === fence) {
                fence = null
            }
            lines[index] = ''
        }
    }
    return lines.join('\n')
}

/**
 * 提取 Markdown 文本中的链接目标（纯函数，便于单测）：
 * - `[[Wiki 链接]]`（保留 `|别名` / `#锚点` 原文，由解析阶段规范化）；
 * - 行内链接/图片 `[text](target)`（含 `<target>` 包裹与可选标题）；
 * - 围栏代码块内容不参与解析；行号/列号保持原文位置。
 */
export function extractMarkdownLinkTargets(content: string): ExtractedMarkdownLink[] {
    const stripped = stripFencedCodeBlocks(content)
    // 预计算换行位置，任意匹配位置 O(log n) 求行号（避免多次正则扫描时游标互相干扰）
    const newlinePositions: number[] = []
    for (let index = 0; index < stripped.length; index += 1) {
        if (stripped.charCodeAt(index) === 10) {
            newlinePositions.push(index)
        }
    }
    const locate = (matchIndex: number): { line: number; column: number } => {
        let low = 0
        let high = newlinePositions.length
        while (low < high) {
            const middle = (low + high) >> 1
            if (newlinePositions[middle]! < matchIndex) {
                low = middle + 1
            } else {
                high = middle
            }
        }
        const line = low + 1
        const lineStart = low === 0 ? 0 : newlinePositions[low - 1]! + 1
        return { line, column: matchIndex - lineStart + 1 }
    }
    const patterns: Array<{ regex: RegExp; wiki: boolean }> = [
        { regex: /\[\[([^\]\n]+)\]\]/g, wiki: true },
        {
            regex: /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g,
            wiki: false
        }
    ]
    const results: ExtractedMarkdownLink[] = []
    for (const { regex, wiki } of patterns) {
        for (const match of stripped.matchAll(regex)) {
            const rawTarget = (match[1] ?? '').trim()
            if (rawTarget.length === 0) {
                continue
            }
            const position = locate(match.index ?? 0)
            results.push({
                line: position.line,
                column: position.column,
                target:
                    rawTarget.startsWith('<') && rawTarget.endsWith('>')
                        ? rawTarget.slice(1, -1)
                        : rawTarget,
                wiki
            })
        }
    }
    results.sort((left, right) => left.line - right.line || left.column - right.column)
    return results
}

/** 解析链接目标的规范化路径（去掉锚点/查询串 + URL 解码；无法解析返回 null） */
function normalizeMarkdownLinkPathPart(rawTarget: string): string | null {
    let target = rawTarget.trim()
    const hashIndex = target.indexOf('#')
    if (hashIndex >= 0) {
        target = target.slice(0, hashIndex)
    }
    const queryIndex = target.indexOf('?')
    if (queryIndex >= 0) {
        target = target.slice(0, queryIndex)
    }
    if (target.length === 0) {
        return null
    }
    try {
        target = decodeURIComponent(target)
    } catch {
        // 非法转义按原文处理
    }
    // 绝对路径 / 远程 URL / 协议链接不参与影响扫描（迁移不会让它们失效）
    if (
        target.startsWith('/') ||
        target.startsWith('\\') ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)
    ) {
        return null
    }
    return target
}

/** Wiki 链接目标（去掉 `|别名` 与 `#锚点`；空返回 null） */
function normalizeWikiLinkTarget(rawTarget: string): string | null {
    const withoutAlias = rawTarget.split('|')[0]
    const withoutAnchor = withoutAlias.split('#')[0].trim()
    return withoutAnchor.length > 0 ? withoutAnchor : null
}

/** 链接目标查找索引（路径 + 文件名去扩展名两种口径，兼容 Wiki 链接写法） */
interface LinkTargetIndex {
    byPath: Map<string, MigratableFile>
    byBaseName: Map<string, MigratableFile>
}

/** 构建链接目标索引 */
function buildLinkTargetIndex(files: readonly MigratableFile[]): LinkTargetIndex {
    const byPath = new Map<string, MigratableFile>()
    const byBaseName = new Map<string, MigratableFile>()
    for (const file of files) {
        byPath.set(pathCompareKey(path.normalize(file.absolutePath)), file)
        const baseName = path.basename(file.absolutePath)
        const dotIndex = baseName.lastIndexOf('.')
        const stem = (dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName).toLowerCase()
        if (!byBaseName.has(stem)) {
            byBaseName.set(stem, file)
        }
    }
    return { byPath, byBaseName }
}

/** 按路径口径查找链接目标（先精确路径，再补常见扩展名） */
function lookupLinkTargetByPath(
    sourceAbsolute: string,
    target: string,
    index: LinkTargetIndex
): MigratableFile | null {
    const baseDirectory = path.dirname(sourceAbsolute)
    const candidate = path.resolve(baseDirectory, target)
    const direct = index.byPath.get(pathCompareKey(path.normalize(candidate)))
    if (direct) {
        return direct
    }
    const extensionCandidates = ['.md', '.markdown', '.txt', '.html', '.htm']
    for (const extension of extensionCandidates) {
        const found = index.byPath.get(pathCompareKey(path.normalize(candidate + extension)))
        if (found) {
            return found
        }
    }
    return null
}

/** 解析单条链接的受影响目标文件（无影响返回 null） */
function resolveLinkImpactTarget(
    sourceFile: MigratableFile,
    link: ExtractedMarkdownLink,
    index: LinkTargetIndex
): MigratableFile | null {
    if (link.wiki) {
        const wikiTarget = normalizeWikiLinkTarget(link.target)
        if (wikiTarget === null) {
            return null
        }
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(wikiTarget)) {
            return null
        }
        const direct = lookupLinkTargetByPath(sourceFile.absolutePath, wikiTarget, index)
        if (direct) {
            return direct
        }
        const stem = wikiTarget.split('/').pop() ?? wikiTarget
        const withoutExtension = stem.replace(/\.(md|markdown|txt)$/i, '')
        return index.byBaseName.get(withoutExtension.toLowerCase()) ?? null
    }
    const pathPart = normalizeMarkdownLinkPathPart(link.target)
    if (pathPart === null) {
        return null
    }
    return lookupLinkTargetByPath(sourceFile.absolutePath, pathPart, index)
}

/**
 * 扫描 Markdown 链接影响：解析所有 Markdown 文件（大小/数量有上限）中的链接，
 * 统计目标落在「可迁移文件集合」内的链接（迁移方式为 move 时这些链接将失效）。
 *
 * @returns total（完整计数）+ items（最多 200 条，含文件/行号/目标）
 */
export async function scanLlmWikiLinkImpacts(
    files: readonly MigratableFile[]
): Promise<LlmWikiLinkImpactSummary> {
    const markdownFiles = files.filter((file) => file.format === 'markdown')
    const index = buildLinkTargetIndex(files)
    const items: LlmWikiLinkImpact[] = []
    let total = 0
    let scannedFiles = 0
    for (const sourceFile of markdownFiles) {
        if (scannedFiles >= LLM_WIKI_MIGRATION_MAX_LINK_FILES) {
            break
        }
        if (sourceFile.bytes > LLM_WIKI_MIGRATION_MAX_LINK_FILE_BYTES) {
            continue
        }
        scannedFiles += 1
        let content: string
        try {
            content = await fs.readFile(sourceFile.absolutePath, 'utf-8')
        } catch (error) {
            logger.warn(
                '[LLM Wiki 迁移] 读取 Markdown 失败，已跳过链接扫描：',
                sourceFile.absolutePath,
                error
            )
            continue
        }
        for (const link of extractMarkdownLinkTargets(content)) {
            const impacted = resolveLinkImpactTarget(sourceFile, link, index)
            if (impacted === null) {
                continue
            }
            total += 1
            if (items.length < LLM_WIKI_MIGRATION_MAX_LINK_ITEMS) {
                items.push({
                    file: sourceFile.relativePath,
                    line: link.line,
                    target: link.target.slice(0, 200),
                    targetFile: impacted.relativePath,
                    format: impacted.format
                })
            }
        }
    }
    return { total, items }
}

// ============================ 扫描主入口 ============================

/**
 * `LLM_WIKI.SCAN_FILES` 业务实现：只读统计当前工作区可迁移文件 + Markdown 链接影响。
 */
export async function scanLlmWikiMigratableFiles(
    deps: LlmWikiMigrationDeps = {}
): Promise<LlmWikiScanResult> {
    const emptyLinks: LlmWikiLinkImpactSummary = { total: 0, items: [] }
    const resolution = await resolveWorkspaceRoot(resolveRootInput(deps))
    if (!resolution.ok) {
        return {
            ok: false,
            formats: summarizeLlmWikiMigrationFormats([]),
            total: 0,
            links: emptyLinks,
            error: resolution.error
        }
    }
    const collected = await collectMigratableFiles(resolution.root, resolution.realRoot)
    const formats = summarizeLlmWikiMigrationFormats(collected.files)
    const total = formats.reduce((sum, item) => sum + item.count, 0)
    const links = await scanLlmWikiLinkImpacts(collected.files)
    return {
        ok: true,
        formats,
        total,
        links,
        ...(collected.truncated ? { truncated: true } : {})
    }
}

// ============================ 迁移 ============================

/** 归一化迁移请求载荷（非法返回 null；formats 去重且只保留白名单 id） */
export function normalizeLlmWikiMigrateRequest(payload: unknown): LlmWikiMigrateRequest | null {
    if (!payload || typeof payload !== 'object') {
        return null
    }
    const record = payload as { mode?: unknown; formats?: unknown }
    if (record.mode !== 'copy' && record.mode !== 'move') {
        return null
    }
    if (!Array.isArray(record.formats)) {
        return null
    }
    const formats: LlmWikiMigratableFormatId[] = []
    for (const raw of record.formats) {
        if (typeof raw !== 'string') {
            continue
        }
        const formatId = LLM_WIKI_MIGRATION_FORMAT_IDS.find((id) => id === raw)
        if (formatId && !formats.includes(formatId)) {
            formats.push(formatId)
        }
    }
    if (formats.length === 0) {
        return null
    }
    return { mode: record.mode, formats }
}

/** 归一化回滚请求载荷（非法返回 null；缺省 = 回滚最近一次未回滚迁移） */
export function normalizeLlmWikiRollbackRequest(payload: unknown): LlmWikiRollbackRequest | null {
    if (payload === undefined || payload === null) {
        return {}
    }
    if (typeof payload !== 'object') {
        return null
    }
    const record = payload as { logId?: unknown }
    if (record.logId === undefined || record.logId === null) {
        return {}
    }
    if (typeof record.logId !== 'string' || record.logId.trim().length === 0) {
        return null
    }
    return { logId: record.logId.trim() }
}

/**
 * 读取目标文件指纹（copy 后 / rename 后立即读取；失败返回 -1 表示未知，回滚时跳过该维度）。
 */
async function readTargetFingerprint(
    targetPath: string
): Promise<{ targetSize: number; targetMtimeMs: number }> {
    try {
        const stats = await fs.stat(targetPath)
        return { targetSize: stats.size, targetMtimeMs: stats.mtimeMs }
    } catch {
        return { targetSize: -1, targetMtimeMs: -1 }
    }
}

/**
 * 单个文件迁移。
 *
 * 校验顺序（任一失败即返回 failed/skipped，不抛异常）：
 * 源路径合法 → 在工作区内 → 非符号链接 → realpath 不逃逸 → 目标在 raw/ 内 →
 * 目标父目录真实路径仍在 raw/ 内 → 同名冲突跳过 → 复制（EXCL）/移动（预检后 rename）。
 */
async function migrateSingleFile(
    file: MigratableFile,
    context: {
        root: string
        realRoot: string
        rawDir: string
        realRawDir: string
        mode: LlmWikiMigrationMode
    }
): Promise<MigrateItemResult> {
    const source = normalizeLocalPath(file.absolutePath)
    if (source === null || !isSameOrWithin(source, context.root)) {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.sourceInvalid }
    }
    let sourceStats: Awaited<ReturnType<typeof fs.lstat>>
    try {
        sourceStats = await fs.lstat(source)
    } catch {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.sourceMissing }
    }
    if (sourceStats.isSymbolicLink()) {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.sourceSymlink }
    }
    if (!sourceStats.isFile()) {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.sourceNotFile }
    }
    const realSource = await safeRealpath(source)
    if (realSource === null || !isSameOrWithin(realSource, context.realRoot)) {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.sourceEscape }
    }

    // 目标路径：raw/ 下保持原相对目录结构（词法校验 + 真实路径校验双保险）
    const target = path.join(context.rawDir, ...file.relativePath.split('/'))
    if (!isSameOrWithin(target, context.rawDir) || isSamePath(target, context.rawDir)) {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.targetInvalid }
    }
    const targetDirectory = path.dirname(target)
    try {
        await fs.mkdir(targetDirectory, { recursive: true })
    } catch (error) {
        return {
            status: 'failed',
            reason: `创建目标目录失败：${describeError(error)}`
        }
    }
    const realTargetDirectory = await safeRealpath(targetDirectory)
    if (realTargetDirectory === null || !isSameOrWithin(realTargetDirectory, context.realRawDir)) {
        return { status: 'failed', reason: LLM_WIKI_MIGRATION_REASON.targetEscape }
    }
    // 同名冲突：跳过（绝不覆盖）
    try {
        await fs.lstat(target)
        return { status: 'skipped', reason: LLM_WIKI_MIGRATION_REASON.targetExists }
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            return { status: 'failed', reason: `检查目标文件失败：${describeError(error)}` }
        }
    }

    const migratedFile: LlmWikiMigratedFile = {
        path: source,
        relativePath: file.relativePath,
        targetPath: target,
        bytes: sourceStats.size
    }

    if (context.mode === 'copy') {
        try {
            await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL)
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
                return { status: 'skipped', reason: LLM_WIKI_MIGRATION_REASON.targetExists }
            }
            return { status: 'failed', reason: `复制失败：${describeError(error)}` }
        }
        const fingerprint = await readTargetFingerprint(target)
        return { status: 'copied', file: migratedFile, ...fingerprint }
    }

    // 移动：rename 原子且同盘高效；跨盘（EXDEV）回退「独占复制 + 删除源文件」
    try {
        await fs.rename(source, target)
    } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'EEXIST' || code === 'EPERM') {
            // 预检后仍被占用/已存在：按同名冲突跳过（不覆盖）
            return { status: 'skipped', reason: LLM_WIKI_MIGRATION_REASON.targetExists }
        }
        if (code !== 'EXDEV') {
            return { status: 'failed', reason: `移动失败：${describeError(error)}` }
        }
        try {
            await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL)
        } catch (copyError) {
            return { status: 'failed', reason: `跨盘移动复制失败：${describeError(copyError)}` }
        }
        try {
            await fs.unlink(source)
        } catch (unlinkError) {
            // 删除源文件失败：回滚刚复制的目标文件，保持「要么都成功、要么不迁移」
            try {
                await fs.unlink(target)
            } catch {
                logger.warn('[LLM Wiki 迁移] 跨盘移动清理复制体失败：', target)
            }
            return {
                status: 'failed',
                reason: `跨盘移动删除源文件失败：${describeError(unlinkError)}`
            }
        }
    }
    const fingerprint = await readTargetFingerprint(target)
    return { status: 'moved', file: migratedFile, ...fingerprint }
}

// ============================ 操作日志 ============================

/** 生成日志文件名时间戳（`YYYYMMDD-HHmmss-SSS`；Windows 文件名安全） */
export function formatLlmWikiMigrationLogTimestamp(date: Date): string {
    const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
        `-${pad(date.getMilliseconds(), 3)}`
    )
}

/** 日志 id 只允许安全字符（防止路径穿越，同时兼容显式指定日志） */
const SAFE_LOG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** 安全解析日志 id → 日志文件绝对路径（越界/非法形态返回 null） */
function resolveMigrationLogFilePath(logDir: string, logId: string): string | null {
    if (!SAFE_LOG_ID_PATTERN.test(logId)) {
        return null
    }
    const filePath = path.join(logDir, `${logId}.json`)
    return isSameOrWithin(filePath, logDir) ? filePath : null
}

/**
 * 创建 `in-progress` 操作日志（独占创建避免覆盖同名日志；失败返回 null，不阻断迁移结果）。
 * 迁移开始即落盘，应用崩溃/关闭后仍可据此回滚已记录条目或幂等重试。
 */
async function createMigrationLogFile(
    logDir: string | null,
    record: Omit<LlmWikiMigrationLogRecord, 'id'>,
    now: Date
): Promise<MigrationLogHandle | null> {
    if (logDir === null) {
        return null
    }
    try {
        await fs.mkdir(logDir, { recursive: true })
    } catch (error) {
        logger.warn('[LLM Wiki 迁移] 创建日志目录失败：', logDir, error)
        return null
    }
    const base = formatLlmWikiMigrationLogTimestamp(now)
    for (let index = 0; index < 100; index += 1) {
        const id = index === 0 ? base : `${base}-${index}`
        const filePath = path.join(logDir, `${id}.json`)
        const payload: LlmWikiMigrationLogRecord = { ...record, id }
        try {
            await fs.writeFile(filePath, JSON.stringify(payload, null, 2), {
                encoding: 'utf-8',
                flag: 'wx'
            })
            return { id, filePath }
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
                continue
            }
            logger.warn('[LLM Wiki 迁移] 写入操作日志失败：', filePath, error)
            return null
        }
    }
    logger.warn('[LLM Wiki 迁移] 操作日志同名过多，已放弃写入：', logDir)
    return null
}

/** 原子更新操作日志（tmp + rename；失败只告警，不影响迁移/回滚结果） */
async function updateMigrationLogFile(
    handle: MigrationLogHandle,
    record: LlmWikiMigrationLogRecord
): Promise<void> {
    const tempPath = `${handle.filePath}.tmp`
    try {
        await fs.writeFile(tempPath, JSON.stringify(record, null, 2), 'utf-8')
        await fs.rename(tempPath, handle.filePath)
    } catch (error) {
        logger.warn('[LLM Wiki 迁移] 更新操作日志失败：', handle.filePath, error)
        try {
            await fs.unlink(tempPath)
        } catch {
            // 清理临时文件失败不影响主流程
        }
    }
}

/** 读取并结构校验迁移日志（缺失/损坏返回 null） */
async function readMigrationLog(
    logDir: string,
    logId: string
): Promise<LlmWikiMigrationLogRecord | null> {
    const filePath = resolveMigrationLogFilePath(logDir, logId)
    if (filePath === null) {
        return null
    }
    let raw: string
    try {
        raw = await fs.readFile(filePath, 'utf-8')
    } catch {
        return null
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') {
        return null
    }
    const record = parsed as Partial<LlmWikiMigrationLogRecord>
    const status = record.status
    if (
        record.version !== LLM_WIKI_MIGRATION_LOG_VERSION ||
        (record.mode !== 'copy' && record.mode !== 'move') ||
        typeof record.rootPath !== 'string' ||
        !Array.isArray(record.entries) ||
        (status !== 'applied' && status !== 'rolled-back' && status !== 'in-progress')
    ) {
        return null
    }
    const entries: LlmWikiMigrationLogEntry[] = []
    for (const rawEntry of record.entries) {
        if (!rawEntry || typeof rawEntry !== 'object') {
            continue
        }
        const entry = rawEntry as Partial<LlmWikiMigrationLogEntry>
        if (
            typeof entry.relativePath !== 'string' ||
            typeof entry.sourcePath !== 'string' ||
            typeof entry.targetPath !== 'string'
        ) {
            continue
        }
        entries.push({
            relativePath: entry.relativePath,
            sourcePath: entry.sourcePath,
            targetPath: entry.targetPath,
            bytes: typeof entry.bytes === 'number' ? entry.bytes : 0,
            targetSize: typeof entry.targetSize === 'number' ? entry.targetSize : -1,
            targetMtimeMs: typeof entry.targetMtimeMs === 'number' ? entry.targetMtimeMs : -1,
            action: entry.action === 'move' ? 'move' : 'copy'
        })
    }
    return {
        version: record.version,
        id: logId,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
        mode: record.mode,
        rootPath: record.rootPath,
        formats: Array.isArray(record.formats)
            ? record.formats.filter(
                  (format): format is LlmWikiMigratableFormatId =>
                      LLM_WIKI_MIGRATION_FORMAT_IDS.find((id) => id === format) !== undefined
              )
            : [],
        entries,
        skipped: Array.isArray(record.skipped) ? (record.skipped as LlmWikiMigrationIssue[]) : [],
        failed: Array.isArray(record.failed) ? (record.failed as LlmWikiMigrationIssue[]) : [],
        status
    }
}

/**
 * 查找最近一次未回滚的迁移日志（包含崩溃残留的 in-progress：其已记录条目可回滚）。
 */
async function findLatestRollbackableMigrationLog(
    logDir: string
): Promise<LlmWikiMigrationLogRecord | null> {
    let names: string[]
    try {
        names = await fs.readdir(logDir)
    } catch (error) {
        logger.warn('[LLM Wiki 迁移] 读取日志目录失败：', logDir, error)
        return null
    }
    const ids = names
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .filter((id) => SAFE_LOG_ID_PATTERN.test(id))
        .sort()
        .reverse()
    for (const id of ids) {
        const record = await readMigrationLog(logDir, id)
        if (record === null || record.status === 'rolled-back') {
            continue
        }
        return record
    }
    return null
}

// ============================ 迁移主流程 ============================

/**
 * `LLM_WIKI.MIGRATE` 业务实现：把所选格式的文件复制/移动到 raw/。
 *
 * @returns 结构化结果（`ok=false` 仅用于整批前置条件失败：无工作区/根非法/载荷非法/
 *          raw 不可用；单文件失败进 `failed`，同名冲突进 `skipped`）
 */
export async function migrateLlmWikiFiles(
    payload: unknown,
    deps: LlmWikiMigrationDeps = {}
): Promise<LlmWikiMigrateResult> {
    const emptyFailure = (error: string, mode: LlmWikiMigrationMode | null = null) =>
        ({
            ok: false,
            mode,
            moved: [],
            copied: [],
            skipped: [],
            failed: [],
            logId: null,
            error
        }) satisfies LlmWikiMigrateResult

    const request = normalizeLlmWikiMigrateRequest(payload)
    if (request === null) {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_INVALID_PAYLOAD)
    }
    const resolution = await resolveWorkspaceRoot(resolveRootInput(deps))
    if (!resolution.ok) {
        return emptyFailure(resolution.error, request.mode)
    }
    const rawDir = path.join(resolution.root, LLM_WIKI_RAW_DIR_NAME)
    try {
        await fs.mkdir(rawDir, { recursive: true })
    } catch (error) {
        return emptyFailure(
            `${LLM_WIKI_MIGRATION_ERROR_CREATE_RAW_FAILED}${describeError(error)}`,
            request.mode
        )
    }
    const realRawDir = await safeRealpath(rawDir)
    if (realRawDir === null || !isSameOrWithin(realRawDir, resolution.realRoot)) {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_RAW_UNAVAILABLE, request.mode)
    }

    const collected = await collectMigratableFiles(resolution.root, resolution.realRoot)
    const selected = collected.files.filter((file) => request.formats.includes(file.format))

    const now = resolveNow(deps)
    const logRecord: LlmWikiMigrationLogRecord = {
        version: LLM_WIKI_MIGRATION_LOG_VERSION,
        id: '',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        mode: request.mode,
        rootPath: resolution.root,
        formats: [...request.formats],
        entries: [],
        skipped: [],
        failed: [],
        status: 'in-progress'
    }
    const logHandle = await createMigrationLogFile(resolveMigrationLogDir(deps), logRecord, now)

    const moved: LlmWikiMigratedFile[] = []
    const copied: LlmWikiMigratedFile[] = []
    const skipped: LlmWikiMigrationIssue[] = []
    const failed: LlmWikiMigrationIssue[] = []

    for (const file of selected) {
        const result = await migrateSingleFile(file, {
            root: resolution.root,
            realRoot: resolution.realRoot,
            rawDir,
            realRawDir: realRawDir,
            mode: request.mode
        })
        if (result.status === 'skipped') {
            skipped.push({ path: file.relativePath, reason: result.reason })
            continue
        }
        if (result.status === 'failed') {
            failed.push({ path: file.relativePath, reason: result.reason })
            continue
        }
        if (result.status === 'moved') {
            moved.push(result.file)
        } else {
            copied.push(result.file)
        }
        logRecord.entries.push({
            relativePath: result.file.relativePath,
            sourcePath: result.file.path,
            targetPath: result.file.targetPath,
            bytes: result.file.bytes,
            targetSize: result.targetSize,
            targetMtimeMs: result.targetMtimeMs,
            action: request.mode
        })
        // 崩溃可恢复：每 N 个成功条目把已完成映射落盘一次
        if (
            logHandle !== null &&
            logRecord.entries.length % LLM_WIKI_MIGRATION_LOG_FLUSH_INTERVAL === 0
        ) {
            logRecord.updatedAt = resolveNow(deps).toISOString()
            await updateMigrationLogFile(logHandle, { ...logRecord, id: logHandle.id })
        }
    }

    const finishedAt = resolveNow(deps).toISOString()
    let logId: string | null = null
    if (logHandle !== null) {
        logId = logHandle.id
        logRecord.id = logHandle.id
        logRecord.updatedAt = finishedAt
        logRecord.skipped = skipped
        logRecord.failed = failed
        logRecord.status = 'applied'
        await updateMigrationLogFile(logHandle, logRecord)
    }

    logger.info(
        `[LLM Wiki 迁移] 完成：mode=${request.mode} copied=${copied.length} ` +
            `moved=${moved.length} skipped=${skipped.length} failed=${failed.length} log=${logId ?? '无'}`
    )
    return {
        ok: true,
        mode: request.mode,
        moved,
        copied,
        skipped,
        failed,
        logId,
        ...(collected.truncated ? { truncated: true } : {})
    }
}

// ============================ 回滚 ============================

/** 目标文件是否在迁移后被修改（size / mtime 指纹冲突；未知指纹不判冲突） */
function isTargetFingerprintConflict(
    entry: LlmWikiMigrationLogEntry,
    stats: { size: number; mtimeMs: number }
): boolean {
    if (entry.targetSize >= 0 && stats.size !== entry.targetSize) {
        return true
    }
    if (
        entry.targetMtimeMs >= 0 &&
        Math.abs(stats.mtimeMs - entry.targetMtimeMs) > LLM_WIKI_MIGRATION_MTIME_TOLERANCE_MS
    ) {
        return true
    }
    return false
}

/** 回滚单个日志条目：copy → 删除复制体；move → 移回原路径（逐项复核路径与目标指纹） */
async function rollbackLogEntry(
    entry: LlmWikiMigrationLogEntry,
    mode: LlmWikiMigrationMode,
    context: { root: string; realRoot: string; rawDir: string; realRawDir: string }
): Promise<LlmWikiRollbackFailure | null> {
    const source = normalizeLocalPath(entry.sourcePath)
    const target = normalizeLocalPath(entry.targetPath)
    if (
        source === null ||
        target === null ||
        !isSameOrWithin(source, context.root) ||
        !isSameOrWithin(target, context.rawDir) ||
        isSamePath(target, context.rawDir)
    ) {
        return { path: entry.relativePath, reason: LLM_WIKI_MIGRATION_REASON.logPathInvalid }
    }
    let targetStats: Awaited<ReturnType<typeof fs.lstat>>
    try {
        targetStats = await fs.lstat(target)
    } catch {
        return { path: entry.relativePath, reason: LLM_WIKI_MIGRATION_REASON.targetMissing }
    }
    if (targetStats.isSymbolicLink() || !targetStats.isFile()) {
        return { path: entry.relativePath, reason: LLM_WIKI_MIGRATION_REASON.targetNotRegular }
    }
    // 回滚冲突检测：迁移后目标被修改过则跳过（避免误删/误移用户后来的改动）
    if (isTargetFingerprintConflict(entry, targetStats)) {
        return { path: entry.relativePath, reason: LLM_WIKI_MIGRATION_REASON.targetModified }
    }
    if (mode === 'copy') {
        try {
            await fs.unlink(target)
        } catch (error) {
            return {
                path: entry.relativePath,
                reason: `删除复制体失败：${describeError(error)}`
            }
        }
        await pruneEmptyDirectories(path.dirname(target), context.rawDir)
        return null
    }

    // move：原位置已被占用则跳过（绝不覆盖用户后来创建的文件）
    try {
        await fs.lstat(source)
        return { path: entry.relativePath, reason: LLM_WIKI_MIGRATION_REASON.restoreConflict }
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            return {
                path: entry.relativePath,
                reason: `检查原位置失败：${describeError(error)}`
            }
        }
    }
    const sourceDirectory = path.dirname(source)
    try {
        await fs.mkdir(sourceDirectory, { recursive: true })
    } catch (error) {
        return {
            path: entry.relativePath,
            reason: `创建原目录失败：${describeError(error)}`
        }
    }
    const realSourceDirectory = await safeRealpath(sourceDirectory)
    if (realSourceDirectory === null || !isSameOrWithin(realSourceDirectory, context.realRoot)) {
        return { path: entry.relativePath, reason: LLM_WIKI_MIGRATION_REASON.targetEscape }
    }
    try {
        await fs.rename(target, source)
    } catch (error) {
        return {
            path: entry.relativePath,
            reason: `移回原位置失败：${describeError(error)}`
        }
    }
    await pruneEmptyDirectories(path.dirname(target), context.rawDir)
    return null
}

/** 自底向上删除 raw/ 下的空目录（非空/出错即停止；仅清理 best-effort，不影响回滚判定） */
async function pruneEmptyDirectories(startDir: string, stopDir: string): Promise<void> {
    let current = startDir
    for (let depth = 0; depth < 64; depth += 1) {
        if (isSamePath(current, stopDir) || !isSameOrWithin(current, stopDir)) {
            return
        }
        try {
            await fs.rmdir(current)
        } catch {
            return
        }
        current = path.dirname(current)
    }
}

/**
 * `LLM_WIKI.ROLLBACK_MIGRATION` 业务实现：按操作日志回滚最近一次（或指定 id 的）迁移。
 *
 * - move：把 raw/ 中文件移回原路径（原位置已存在同名文件则逐项报告、不覆盖）；
 * - copy：删除 raw/ 中的复制体；
 * - 回滚前用日志中的目标指纹（size + mtime）检测冲突：被修改/缺失的条目不回滚、逐项报告；
 * - 回滚成功后日志状态标记为 rolled-back（避免重复回滚）。
 */
export async function rollbackLlmWikiMigration(
    payload: unknown,
    deps: LlmWikiMigrationDeps = {}
): Promise<LlmWikiRollbackResult> {
    const emptyFailure = (error: string) =>
        ({ ok: false, restored: 0, failed: [], error }) satisfies LlmWikiRollbackResult

    const request = normalizeLlmWikiRollbackRequest(payload)
    if (request === null) {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_INVALID_ROLLBACK_PAYLOAD)
    }
    const resolution = await resolveWorkspaceRoot(resolveRootInput(deps))
    if (!resolution.ok) {
        return emptyFailure(resolution.error)
    }
    const logDir = resolveMigrationLogDir(deps)
    if (logDir === null) {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_LOG_UNAVAILABLE)
    }

    let log: LlmWikiMigrationLogRecord | null
    if (request.logId) {
        if (!SAFE_LOG_ID_PATTERN.test(request.logId)) {
            return emptyFailure(LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND)
        }
        log = await readMigrationLog(logDir, request.logId)
        if (log === null) {
            return emptyFailure(LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND)
        }
    } else {
        log = await findLatestRollbackableMigrationLog(logDir)
        if (log === null) {
            return emptyFailure(LLM_WIKI_MIGRATION_ERROR_NO_LOG)
        }
    }
    if (log.status === 'rolled-back') {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_LOG_INVALID)
    }
    const logRoot = normalizeLocalPath(log.rootPath)
    if (logRoot === null || !isSamePath(logRoot, resolution.root)) {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_LOG_ROOT_MISMATCH)
    }
    const rawDir = path.join(resolution.root, LLM_WIKI_RAW_DIR_NAME)
    const realRawDir = await safeRealpath(rawDir)
    if (realRawDir === null || !isSameOrWithin(realRawDir, resolution.realRoot)) {
        return emptyFailure(LLM_WIKI_MIGRATION_ERROR_RAW_UNAVAILABLE)
    }

    const failed: LlmWikiRollbackFailure[] = []
    let restored = 0
    for (const entry of log.entries) {
        const failure = await rollbackLogEntry(entry, log.mode, {
            root: resolution.root,
            realRoot: resolution.realRoot,
            rawDir,
            realRawDir
        })
        if (failure === null) {
            restored += 1
        } else {
            failed.push(failure)
        }
    }
    // 仅在无冲突时标记整份日志已回滚；有冲突时保留 applied，便于用户处理冲突后重试剩余条目
    if (failed.length === 0) {
        log.status = 'rolled-back'
        log.rolledBackAt = resolveNow(deps).toISOString()
        const logFilePath = resolveMigrationLogFilePath(logDir, log.id)
        if (logFilePath !== null) {
            await updateMigrationLogFile({ id: log.id, filePath: logFilePath }, log)
        }
    }
    logger.info(
        `[LLM Wiki 迁移] 回滚完成：log=${log.id} mode=${log.mode} ` +
            `restored=${restored} failed=${failed.length}`
    )
    return {
        ok: failed.length === 0,
        mode: log.mode,
        restored,
        failed,
        logId: log.id
    }
}
