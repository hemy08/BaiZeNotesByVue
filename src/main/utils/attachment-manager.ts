/**
 * B5 附件管理主进程服务（1.5.1，2026-11-22）
 *
 * ## 职责
 * - `auditAttachments()`：只读扫描工作区内的附件全集，与工作区索引的引用集合做差集，
 *   输出「保守排除后的孤儿候选」（相对路径 / 大小 / mtime / 引用数），不删除任何文件；
 * - `trashAttachments()`：批量把孤儿附件移入**系统回收站**（`shell.trashItem`），
 *   删除前重新构建索引复核引用，逐项返回结构化结果；
 * - `renameAttachment()`：附件重命名的两阶段事务——改名前构建引用更新计划，
 *   改名成功后按原编码/BOM 写回 Markdown 引用；改名失败不改引用。
 *
 * ## 边界与安全口径
 * 1. **根由调用方传入**（IPC 层只传 `appState.rootPath`，渲染层不能指定根）；本服务
 *    不读 `appState`、可在纯 Node 单测中运行（`shell.trashItem` 为唯一 Electron 依赖，
 *    且支持 options 注入桩）；
 * 2. 附件全集扫描复用工作区索引的口径：忽略目录（{@link WORKSPACE_INDEX_IGNORED_DIRS}）、
 *    目录深度上限（{@link MAX_WORKSPACE_INDEX_SCAN_DEPTH}）、符号链接一律跳过、
 *    子目录 realpath 必须仍在工作区内（防目录环/junction 逃逸）；
 * 3. 附件扩展名集合复用 {@link WORKSPACE_ATTACHMENT_EXTENSIONS}（不含 `.md/.markdown/.txt`，
 *    笔记正文永远不是附件）；附件扫描只 stat 元数据，**不读取附件内容**；
 * 4. 孤儿判定保守化（B5-R7 / B5-R8）：
 *    - `truncated`（附件数达上限提前结束）→ 不给出孤儿清单（分析不完整）；
 *    - 引用分析不完整（磁盘上存在工作区索引未解析的 `.md/.markdown/.txt`、任一目录
 *      `readdir` 失败、索引文件数达上限、索引根不可用）→ `orphans = []` + `truncated = true`，
 *      宁可少报也不误删；
 *    - 附件扩展名之外的引用（HTML `<img>`、reference 式链接、代码块内引用）不在索引口径内，
 *      属于已知限制（见「已知限制」）。
 * 5. 删除边界（B5-R1～B5-R3）：仅工作区内、普通文件、非符号链接、附件扩展名、非笔记正文；
 *    仍被任何 Markdown 引用的附件一律拒绝；单次最多 {@link MAX_ATTACHMENT_TRASH_BATCH} 个、
 *    累计大小不超过 {@link MAX_ATTACHMENT_TRASH_TOTAL_BYTES}；**禁止** `fs.unlink/rm`
 *    永久删除，只经 `shell.trashItem`（不可用/失败 → 结构化 `TRASH_FAILED`）；
 * 6. 重命名边界（B5-R4～B5-R6）：新名经 `isSafeFileName` + 路径分隔符/绝对路径/设备名/
 *    扩展名变更校验；目标必须工作区内且不存在（大小写改名除外）；引用更新保留
 *    `./`、尖括号、`#fragment`/`?query`、百分号编码风格，复用 `decodeFileContent` /
 *    `encodeFileContent` 按原编码写回并保留 BOM，不更新围栏代码块/行内代码内的引用。
 *
 * ## 已知限制
 * - 孤儿判定不解析 HTML `<img>` 与 reference 式链接定义（与索引同口径）；
 * - 引用更新不改写「仅出现在代码块/行内代码」的文本（属正文示例，不是引用）；
 * - 引用更新不校验来源文件在外部的并发修改（mtime 竞态窗口内写回）；
 * - 重命名只改文件名、不移动目录（`newName` 不允许路径分隔符）。
 */
import { promises as fs } from 'fs'
import type { Dirent, Stats } from 'fs'
import * as path from 'path'
import { shell } from 'electron'
import type {
    AttachmentAuditEntry,
    AttachmentAuditResult,
    AttachmentRenameResult,
    AttachmentTrashFailure,
    AttachmentTrashResult
} from '../../shared/types/ipc'
import type { WorkspaceIndexSnapshot } from '../../shared/types/workspace-index'
import {
    getExtension,
    isPathWithin,
    normalizePathForCompare,
    normalizeSlashes
} from '../../shared/utils/path'
import { decodeFileContent, encodeFileContent } from './file-utils/file-encoding'
import { logger } from './logger'
// 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读——附件移入回收站/重命名不得变更 raw/ 内容
import { assertWorkspaceWritable, isSafeFileName, PathAccessDeniedError } from './security'
import {
    MAX_WORKSPACE_INDEX_FILES,
    MAX_WORKSPACE_INDEX_SCAN_DEPTH,
    WORKSPACE_ATTACHMENT_EXTENSIONS,
    WORKSPACE_INDEX_EXTENSIONS,
    WORKSPACE_INDEX_IGNORED_DIRS,
    buildWorkspaceIndex
} from './workspace-index'

/* ============================ 常量 ============================ */

/** 单次移入回收站的最多文件数（与 B5 方案「单次 100 个」一致） */
export const MAX_ATTACHMENT_TRASH_BATCH = 100

/** 单次移入回收站的累计大小上限（500 MiB，超出部分逐项 `LIMIT_EXCEEDED`） */
export const MAX_ATTACHMENT_TRASH_TOTAL_BYTES = 500 * 1024 * 1024

/** 单次附件审计最多收录的附件数（超限即 truncated，不给出孤儿清单） */
export const MAX_ATTACHMENT_SCAN_FILES = MAX_WORKSPACE_INDEX_FILES

/** 单次附件重命名最多更新的来源 Markdown 文件数（超限整体中止，避免半更新） */
export const MAX_ATTACHMENT_REFERENCE_FILES = 200

/** 单次附件重命名最多替换的引用处数（超限整体中止，避免半更新） */
export const MAX_ATTACHMENT_REFERENCE_REPLACEMENTS = 5000

/** Windows 下路径比较大小写不敏感（与仓库其余路径判定口径一致） */
const WIN32_CASE_INSENSITIVE = process.platform === 'win32'

/** 设备命名空间前缀（\\?\ / \\.\ 等一律拒绝，防绕过路径校验） */
const DEVICE_NAMESPACE_PATTERN = /^[\\/]{2}[.?!]/

/** Windows 保留设备名（不区分平台一律拒绝：跨平台代码保持一致口径） */
const WINDOWS_DEVICE_NAME_PATTERN = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/** Markdown 行内图片/链接：`![alt](dest)` / `[text](dest)`（与工作区索引同一模式） */
const MARKDOWN_INLINE_LINK_PATTERN =
    /(!?)\[([^[\]\r\n]*)\]\(([^()\r\n]*(?:\([^()\r\n]*\)[^()\r\n]*)*)\)/g

/** 围栏代码块起始/闭合行（前导最多 3 空格，连写 3 个及以上 ` 或 ~） */
const FENCE_LINE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/

/** 行内代码片段（Backtick 数量成对匹配；用于扫描前等长替换为空格） */
const INLINE_CODE_PATTERN = /(`+)[\s\S]*?\1/g

/** 外部协议前缀（http/https/data/app/file 等，含 Windows 盘符 `C:`）：一律忽略 */
const EXTERNAL_PROTOCOL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/

/* ============================ 类型 ============================ */

/** 工作区根（词法绝对路径 + realpath 物理路径） */
interface ResolvedWorkspaceRoot {
    /** `path.resolve` 后的工作区根（用于拼接扫描路径与 relativePath） */
    lexical: string
    /** `fs.realpath` 后的工作区根（用于子目录/文件符号链接逃逸判定） */
    real: string
}

/** 附件审计可选参数（测试/调用方覆盖上限；生产使用默认值） */
export interface AttachmentAuditOptions {
    /** 最多收录的附件数（默认 {@link MAX_ATTACHMENT_SCAN_FILES}） */
    maxFiles?: number
    /** 目录递归深度上限（默认 {@link MAX_WORKSPACE_INDEX_SCAN_DEPTH}） */
    maxDepth?: number
    /** 跳过的目录名集合（默认 {@link WORKSPACE_INDEX_IGNORED_DIRS}） */
    ignoredDirs?: ReadonlySet<string>
}

/** 附件移入回收站可选参数（测试注入桩；生产使用默认实现） */
export interface AttachmentTrashOptions {
    /** 回收站实现（默认 `shell.trashItem`；系统回收站不可用时应抛错） */
    trashItem?: (targetPath: string) => Promise<void>
    /** 单次批量上限（默认 {@link MAX_ATTACHMENT_TRASH_BATCH}） */
    maxBatch?: number
    /** 累计大小上限（默认 {@link MAX_ATTACHMENT_TRASH_TOTAL_BYTES}） */
    maxTotalBytes?: number
}

/** 附件重命名可选参数（测试注入桩/上限；生产使用默认实现） */
export interface AttachmentRenameOptions {
    /** 文件改名实现（默认 `fs.rename`） */
    renameFile?: (fromPath: string, toPath: string) => Promise<void>
    /** 来源 Markdown 读取实现（默认 `fs.readFile`） */
    readFile?: (targetPath: string) => Promise<Buffer>
    /** 来源 Markdown 写回实现（默认 `fs.writeFile`） */
    writeFile?: (targetPath: string, data: Buffer) => Promise<void>
    /** 最多更新的来源文件数（默认 {@link MAX_ATTACHMENT_REFERENCE_FILES}） */
    maxReferenceFiles?: number
    /** 最多替换的引用处数（默认 {@link MAX_ATTACHMENT_REFERENCE_REPLACEMENTS}） */
    maxReferenceReplacements?: number
}

/** 附件全集扫描中间态 */
interface AttachmentScanState {
    /** 已扫描到的附件（正常文件；符号链接/超深目录已跳过） */
    attachments: AttachmentAuditEntry[]
    /** 磁盘上存在的 Markdown/TXT 绝对路径（用于识别索引未解析的来源文件） */
    textSources: string[]
    /** 附件数达到上限提前结束 */
    truncated: boolean
    /** 任一目录 readdir 失败（引用分析可能不完整） */
    directoryReadFailed: boolean
}

/** 单个附件路径的变更前校验结果 */
type AttachmentInspection =
    { ok: true; path: string; size: number } | { ok: false; reason: 'PATH_DENIED' | 'NOT_FILE' }

/** Markdown 链接目标原文的拆分结果（保留原写法风格所需） */
interface RawDestinationParts {
    /** 目标路径原文（未解码；尖括号内内容或首个空白前内容） */
    destination: string
    /** 目标之前的原始空白（保留 `( path )` 写法） */
    leading: string
    /** 是否为 `<path>` 尖括号写法 */
    hasAngle: boolean
    /** 目标之后的原文（标题、闭括号后的空白等，原样保留） */
    trailing: string
}

/** 单个来源文件需要写回的引用更新 */
interface AttachmentReferenceUpdate {
    /** 来源 Markdown 绝对路径 */
    sourcePath: string
    /** 解码后的完整文本（BOM 已剥离） */
    content: string
    /** 原文件编码（decodeFileContent 归一化结果；写回保持原编码） */
    encoding: string
    /** 原文件 BOM 类型；null 表示无 BOM */
    bom: 'utf-8' | 'utf-16le' | 'utf-16be' | null
    /** 本文件替换处数 */
    replacementCount: number
}

/** 引用更新计划（改名前构建，改名成功后应用） */
interface AttachmentReferencePlan {
    updates: AttachmentReferenceUpdate[]
    /** 无法读取/解码/越界而跳过的来源文件（已改名后需手动处理） */
    failedFiles: string[]
}

/* ============================ 通用工具 ============================ */

/** 错误对象转可读文案（不向渲染层抛堆栈） */
function describeError(error: unknown): string {
    const message = (error as Error | undefined)?.message
    return typeof message === 'string' && message.length > 0 ? message : String(error)
}

/** 解析并校验工作区根（空/相对/设备命名空间/文件系统根/不存在一律返回 null） */
async function resolveWorkspaceRoot(rawRootPath: unknown): Promise<ResolvedWorkspaceRoot | null> {
    if (typeof rawRootPath !== 'string') {
        return null
    }
    const trimmed = rawRootPath.trim()
    if (trimmed.length === 0 || trimmed.includes('\u0000')) {
        return null
    }
    if (!path.isAbsolute(trimmed) || DEVICE_NAMESPACE_PATTERN.test(trimmed)) {
        return null
    }
    const lexical = path.resolve(trimmed)
    // 拒绝文件系统根（盘符根 / POSIX 根）：范围过大且不属于「打开的工作区」
    if (lexical === path.parse(lexical).root) {
        return null
    }
    try {
        const stats = await fs.stat(lexical)
        if (!stats.isDirectory()) {
            return null
        }
        return { lexical, real: await fs.realpath(lexical) }
    } catch {
        return null
    }
}

/** 子目录/文件真实路径是否仍位于工作区 realpath 内（阻断符号链接/junction 逃逸） */
async function isRealPathInsideRoot(candidatePath: string, realRoot: string): Promise<boolean> {
    try {
        const real = await fs.realpath(candidatePath)
        return isPathWithin(real, realRoot, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })
    } catch {
        // 无法解析（权限/竞态删除）按不可信处理
        return false
    }
}

/** 是否属于工作区索引的文本扩展名（`.md/.markdown/.txt`，附件判定前置排除） */
function isIndexableTextFile(filePath: string): boolean {
    return WORKSPACE_INDEX_EXTENSIONS.includes(`.${getExtension(filePath)}`)
}

/** 是否为附件扩展名（小写、不含点；集合见 workspace-index） */
function isAttachmentFileName(filePath: string): boolean {
    return WORKSPACE_ATTACHMENT_EXTENSIONS.has(getExtension(filePath))
}

/** 取相对路径的父目录（根目录文件返回空串） */
function getParentRelativePath(relativePath: string): string {
    const slashIndex = relativePath.lastIndexOf('/')
    return slashIndex <= 0 ? '' : relativePath.slice(0, slashIndex)
}

/** 两个路径是否指向同一文件（Windows 大小写不敏感，与仓库口径一致） */
function isSameNormalizedPath(left: string, right: string): boolean {
    return (
        normalizePathForCompare(left, WIN32_CASE_INSENSITIVE) ===
        normalizePathForCompare(right, WIN32_CASE_INSENSITIVE)
    )
}

/** lstat 的安全封装（不存在/权限异常返回 null） */
async function lstatOrNull(targetPath: string): Promise<Stats | null> {
    try {
        return await fs.lstat(targetPath)
    } catch {
        return null
    }
}

/* ============================ 附件审计 ============================ */

/**
 * 递归扫描目录，收集附件全集与磁盘上的文本来源。
 *
 * 口径与工作区索引一致：忽略目录、深度上限、符号链接一律跳过、子目录 realpath containment；
 * 扫描到附件数上限后置 `truncated` 提前结束（此时分析不完整，调用方不给出孤儿判定）。
 */
async function walkAttachmentDirectory(
    root: ResolvedWorkspaceRoot,
    dirPath: string,
    depth: number,
    options: Required<Pick<AttachmentAuditOptions, 'maxFiles' | 'maxDepth' | 'ignoredDirs'>>,
    state: AttachmentScanState
): Promise<void> {
    let dirents: Dirent[]
    try {
        dirents = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
        // 单目录读取失败：不中断整体扫描，但引用分析可能不完整（保守排除孤儿）
        state.directoryReadFailed = true
        return
    }
    dirents.sort((left, right) => left.name.localeCompare(right.name))
    for (const dirent of dirents) {
        if (state.truncated) {
            return
        }
        const fullPath = path.join(dirPath, dirent.name)
        if (dirent.isSymbolicLink()) {
            // 符号链接一律跳过：防止逃逸出工作区与目录环
            continue
        }
        if (dirent.isDirectory()) {
            if (options.ignoredDirs.has(dirent.name)) {
                continue
            }
            if (depth >= options.maxDepth) {
                continue
            }
            if (!(await isRealPathInsideRoot(fullPath, root.real))) {
                continue
            }
            await walkAttachmentDirectory(root, fullPath, depth + 1, options, state)
            continue
        }
        if (!dirent.isFile()) {
            continue
        }
        // 文本来源：用于识别「磁盘存在但索引未解析」的 Markdown（引用分析不完整）
        if (isIndexableTextFile(dirent.name)) {
            state.textSources.push(fullPath)
            continue
        }
        if (!isAttachmentFileName(dirent.name)) {
            continue
        }
        if (state.attachments.length >= options.maxFiles) {
            state.truncated = true
            return
        }
        const stats = await lstatOrNull(fullPath)
        // 竞态为符号链接/非普通文件时跳过（与索引文件的 lstat 防御一致）
        if (stats === null || stats.isSymbolicLink() || !stats.isFile()) {
            continue
        }
        state.attachments.push({
            path: fullPath,
            relativePath: normalizeSlashes(path.relative(root.lexical, fullPath)),
            size: stats.size,
            mtimeMs: stats.mtimeMs
        })
    }
}

/**
 * 收集「被引用且存在」的附件路径键集合（B5 方案口径：只信任 exists === true 的引用）。
 *
 * 键统一为 {@link normalizePathForCompare} 归一化结果（Windows 大小写不敏感）。
 */
function collectExistingReferencedKeys(snapshot: WorkspaceIndexSnapshot): Set<string> {
    const keys = new Set<string>()
    for (const attachment of snapshot.attachments ?? []) {
        if (attachment.exists !== true) {
            continue
        }
        keys.add(normalizePathForCompare(attachment.path, WIN32_CASE_INSENSITIVE))
    }
    return keys
}

/**
 * 收集全部被引用的附件路径键集合（含 `exists === false` 的引用）：
 * 删除前复核用——存在性可能是索引后变化的，引用存在即拒绝删除。
 */
function collectAllReferencedKeys(snapshot: WorkspaceIndexSnapshot): Set<string> {
    const keys = new Set<string>()
    for (const attachment of snapshot.attachments ?? []) {
        keys.add(normalizePathForCompare(attachment.path, WIN32_CASE_INSENSITIVE))
    }
    return keys
}

/** 引用分析是否不完整（不可据此判定孤儿） */
function isReferenceAnalysisIncomplete(
    state: AttachmentScanState,
    snapshot: WorkspaceIndexSnapshot
): boolean {
    if (state.directoryReadFailed) {
        return true
    }
    if (snapshot.rootPath === '') {
        return true
    }
    // 索引文件数达到上限：可能有文件未解析，引用集合不可信
    if (snapshot.files.length >= MAX_WORKSPACE_INDEX_FILES) {
        return true
    }
    // 磁盘上存在索引未解析的文本来源（超大/不可读/解析失败/编码失败等）
    const indexedFiles = new Set<string>()
    for (const file of snapshot.files) {
        indexedFiles.add(normalizePathForCompare(file.path, WIN32_CASE_INSENSITIVE))
    }
    return state.textSources.some(
        (sourcePath) =>
            !indexedFiles.has(normalizePathForCompare(sourcePath, WIN32_CASE_INSENSITIVE))
    )
}

/**
 * 只读附件孤儿审计（B5 阶段一）。
 *
 * 附件全集 = 工作区内附件扩展名的普通文件；引用集合 = 工作区索引 `attachments[].path`
 * 中 `exists === true` 的去重集合；孤儿 = 全集 - 引用集合。
 * 保守排除：附件数超限、目录读取失败、索引未解析文本来源、索引文件数超限时
 * `orphans = []` 且 `truncated = true`，宁可少报不误删。
 *
 * @param rawRootPath 工作区根绝对路径（IPC 层取 `appState.rootPath`）
 * @param options 上限/测试覆盖参数
 * @returns 结构化结果；根非法/不存在返回 `NO_WORKSPACE`，整体异常返回 `AUDIT_ERROR`
 */
export async function auditAttachments(
    rawRootPath: unknown,
    options: AttachmentAuditOptions = {}
): Promise<AttachmentAuditResult> {
    const root = await resolveWorkspaceRoot(rawRootPath)
    if (root === null) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    try {
        const scanOptions = {
            maxFiles: options.maxFiles ?? MAX_ATTACHMENT_SCAN_FILES,
            maxDepth: options.maxDepth ?? MAX_WORKSPACE_INDEX_SCAN_DEPTH,
            ignoredDirs: options.ignoredDirs ?? WORKSPACE_INDEX_IGNORED_DIRS
        }
        const state: AttachmentScanState = {
            attachments: [],
            textSources: [],
            truncated: false,
            directoryReadFailed: false
        }
        await walkAttachmentDirectory(root, root.lexical, 0, scanOptions, state)
        const snapshot = await buildWorkspaceIndex(root.lexical)
        const referencedKeys = collectExistingReferencedKeys(snapshot)
        const totalCount = state.attachments.length
        if (state.truncated || isReferenceAnalysisIncomplete(state, snapshot)) {
            // 保守排除：扫描/引用分析不完整时不给孤儿清单
            return {
                ok: true,
                orphans: [],
                referencedCount: referencedKeys.size,
                totalCount,
                truncated: true
            }
        }
        const orphans = state.attachments.filter(
            (entry) =>
                !referencedKeys.has(normalizePathForCompare(entry.path, WIN32_CASE_INSENSITIVE))
        )
        return {
            ok: true,
            orphans,
            referencedCount: referencedKeys.size,
            totalCount,
            truncated: false
        }
    } catch (error) {
        logger.error('[B5] 附件审计失败：', error)
        return { ok: false, code: 'AUDIT_ERROR' }
    }
}

/* ============================ 变更前路径校验 ============================ */

/**
 * 变更（回收站/重命名）前的单文件校验：
 * 必须为工作区内的绝对路径、附件扩展名、非笔记正文、普通文件、非符号链接，
 * 且 realpath 仍在工作区内（Junction 逃逸防护）。
 */
async function inspectAttachmentPath(
    root: ResolvedWorkspaceRoot,
    rawPath: string
): Promise<AttachmentInspection> {
    const trimmed = rawPath.trim()
    if (trimmed.length === 0 || trimmed.includes('\u0000')) {
        return { ok: false, reason: 'PATH_DENIED' }
    }
    if (!path.isAbsolute(trimmed) || DEVICE_NAMESPACE_PATTERN.test(trimmed)) {
        return { ok: false, reason: 'PATH_DENIED' }
    }
    const absolutePath = path.resolve(trimmed)
    if (
        !isPathWithin(absolutePath, root.lexical, {
            win32CaseInsensitive: WIN32_CASE_INSENSITIVE
        })
    ) {
        return { ok: false, reason: 'PATH_DENIED' }
    }
    // 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读——禁止把 raw/ 内附件
    // 移入回收站或重命名（属变更操作），返回既有结构化 PATH_DENIED 原因
    try {
        assertWorkspaceWritable(root.lexical, absolutePath)
    } catch (error) {
        if (error instanceof PathAccessDeniedError) {
            logger.warn('[B5] LLM Wiki 模式：已拒绝变更 raw/ 只读目录附件（T1.3）：', absolutePath)
            return { ok: false, reason: 'PATH_DENIED' }
        }
        throw error
    }
    // 笔记正文（.md/.markdown/.txt）与未知扩展名一律拒绝：附件管理只处理附件
    if (isIndexableTextFile(absolutePath) || !isAttachmentFileName(absolutePath)) {
        return { ok: false, reason: 'PATH_DENIED' }
    }
    const stats = await lstatOrNull(absolutePath)
    if (stats === null || stats.isSymbolicLink() || !stats.isFile()) {
        return { ok: false, reason: 'NOT_FILE' }
    }
    if (!(await isRealPathInsideRoot(absolutePath, root.real))) {
        return { ok: false, reason: 'PATH_DENIED' }
    }
    return { ok: true, path: absolutePath, size: stats.size }
}

/* ============================ 批量移入回收站 ============================ */

/**
 * 批量把附件移入系统回收站（B5 阶段二，可恢复清理）。
 *
 * 校验顺序：载荷（数组/非空/≤100/全字符串）→ 工作区根 → 重建索引（引用复核）→
 * 逐项路径/类型/引用/总量校验 → `shell.trashItem`。单条失败不整体回滚，
 * 逐项返回 `{ path, reason }`；禁止任何永久删除。
 *
 * @param rawRootPath 工作区根绝对路径
 * @param rawPaths 渲染层传入的路径数组（主进程重新校验，不信任）
 * @param options 回收站实现/上限（测试注入）
 * @returns 结构化结果；根非法返回 `NO_WORKSPACE`，载荷非法 `INVALID_PAYLOAD`，
 *          索引不可用/整体异常 `TRASH_ERROR`
 */
export async function trashAttachments(
    rawRootPath: unknown,
    rawPaths: unknown,
    options: AttachmentTrashOptions = {}
): Promise<AttachmentTrashResult> {
    const root = await resolveWorkspaceRoot(rawRootPath)
    if (root === null) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    const maxBatch = options.maxBatch ?? MAX_ATTACHMENT_TRASH_BATCH
    if (!Array.isArray(rawPaths) || rawPaths.length === 0 || rawPaths.length > maxBatch) {
        return { ok: false, code: 'INVALID_PAYLOAD' }
    }
    const requestedPaths: string[] = []
    for (const item of rawPaths) {
        if (typeof item !== 'string') {
            return { ok: false, code: 'INVALID_PAYLOAD' }
        }
        requestedPaths.push(item)
    }
    try {
        const snapshot = await buildWorkspaceIndex(root.lexical)
        if (snapshot.rootPath === '') {
            // 索引不可用则无法复核引用，拒绝任何删除（保守失败）
            return {
                ok: false,
                code: 'TRASH_ERROR',
                message: '工作区索引不可用，无法复核附件引用'
            }
        }
        const referencedKeys = collectAllReferencedKeys(snapshot)
        const trashItem =
            options.trashItem ??
            ((targetPath: string): Promise<void> => shell.trashItem(targetPath))
        const maxTotalBytes = options.maxTotalBytes ?? MAX_ATTACHMENT_TRASH_TOTAL_BYTES
        const failed: AttachmentTrashFailure[] = []
        let trashed = 0
        let totalBytes = 0
        for (const requestedPath of requestedPaths) {
            const inspected = await inspectAttachmentPath(root, requestedPath)
            if (!inspected.ok) {
                failed.push({ path: requestedPath, reason: inspected.reason })
                continue
            }
            const key = normalizePathForCompare(inspected.path, WIN32_CASE_INSENSITIVE)
            if (referencedKeys.has(key)) {
                // B5-R1：索引复核仍被引用的一律拒绝，防误删笔记图片
                failed.push({ path: inspected.path, reason: 'STILL_REFERENCED' })
                continue
            }
            if (totalBytes + inspected.size > maxTotalBytes) {
                failed.push({ path: inspected.path, reason: 'LIMIT_EXCEEDED' })
                continue
            }
            try {
                await trashItem(inspected.path)
                trashed += 1
                totalBytes += inspected.size
            } catch (error) {
                logger.warn(`[B5] 移入回收站失败：${inspected.path}`, error)
                failed.push({ path: inspected.path, reason: 'TRASH_FAILED' })
            }
        }
        return { ok: true, trashed, failed }
    } catch (error) {
        logger.error('[B5] 批量移入回收站失败：', error)
        return { ok: false, code: 'TRASH_ERROR' }
    }
}

/* ============================ 重命名：引用更新计划 ============================ */

/** 识别原文件 BOM（与 file-encoding 的 BOM 口径一致） */
function detectBom(buffer: Buffer): AttachmentReferenceUpdate['bom'] {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf-8'
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf-16le'
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf-16be'
    }
    return null
}

/** 原编码 + 原 BOM 写回（BOM 不重复添加；编码模块保证非 UTF-8 可转码） */
function encodeReferenceUpdate(update: AttachmentReferenceUpdate): Buffer {
    const encoded = encodeFileContent(update.content, update.encoding)
    if (update.bom === null) {
        return encoded
    }
    const bom =
        update.bom === 'utf-8'
            ? Buffer.from([0xef, 0xbb, 0xbf])
            : update.bom === 'utf-16le'
              ? Buffer.from([0xff, 0xfe])
              : Buffer.from([0xfe, 0xff])
    const alreadyHasBom =
        encoded.length >= bom.length && bom.every((byte, index) => encoded[index] === byte)
    return alreadyHasBom ? encoded : Buffer.concat([bom, encoded])
}

/** 把行内代码等长替换为空格（保留列偏移，同时避免代码内容被当作引用） */
function maskInlineCode(line: string): string {
    INLINE_CODE_PATTERN.lastIndex = 0
    return line.replace(INLINE_CODE_PATTERN, (matched) => ' '.repeat(matched.length))
}

/** 读取围栏代码块标记（非围栏行返回 null） */
function readFenceMarker(line: string): { char: string; length: number; bare: boolean } | null {
    const match = FENCE_LINE_PATTERN.exec(line)
    if (match === null) {
        return null
    }
    return { char: match[1][0], length: match[1].length, bare: match[2].trim().length === 0 }
}

/**
 * 拆分 Markdown 圆括号内的目标原文，保留可原样回写的辅助片段。
 *
 * 支持 `<path with space>` 尖括号形式与 `(path "title")` 普通形式；
 * 返回 `leading`/`trailing` 以便替换目标后保持其余写法不变。
 */
function parseRawDestination(rawDestination: string): RawDestinationParts | null {
    const leadingMatch = /^\s*/.exec(rawDestination)
    const leading = leadingMatch === null ? '' : leadingMatch[0]
    const rest = rawDestination.slice(leading.length)
    if (rest.length === 0) {
        return null
    }
    if (rest.startsWith('<')) {
        const end = rest.indexOf('>')
        if (end < 0) {
            return null
        }
        const destination = rest.slice(1, end).trim()
        if (destination.length === 0) {
            return null
        }
        return { destination, leading, hasAngle: true, trailing: rest.slice(end + 1) }
    }
    const trailingMatch = /\s/.exec(rest)
    // rest 已去掉前导空白，故非空 rest 的「首个空白」不可能在 0 位：destination 必非空
    const destination = trailingMatch === null ? rest : rest.slice(0, trailingMatch.index)
    return {
        destination,
        leading,
        hasAngle: false,
        trailing: trailingMatch === null ? '' : rest.slice(trailingMatch.index)
    }
}

/**
 * 把 Markdown 链接目标归一化为本地相对路径（与工作区索引同口径）：
 * 去协议/盘符 → 反斜杠归一化 → 去 `#fragment`/`?query` → 安全 URL 解码 →
 * 拒绝空目标/NUL/绝对路径/UNC。
 */
function decodeAttachmentDestination(rawTarget: string): string | null {
    let value = rawTarget.trim()
    if (EXTERNAL_PROTOCOL_PATTERN.test(value)) {
        return null
    }
    value = normalizeSlashes(value)
    const boundary = value.search(/[?#]/)
    if (boundary >= 0) {
        value = value.slice(0, boundary)
    }
    if (value.includes('%')) {
        try {
            value = decodeURIComponent(value)
        } catch {
            return null
        }
    }
    value = value.trim()
    if (value.length === 0 || value.includes('\u0000') || value.startsWith('/')) {
        return null
    }
    return value
}

/**
 * 把引用目标解析为工作区内的绝对路径（相对来源文件目录，拒绝 `../` 越界与工作区外路径）；
 * 非附件扩展名/外链/越界返回 null。
 */
function resolveAttachmentDestination(
    root: ResolvedWorkspaceRoot,
    sourcePath: string,
    rawDestination: string
): string | null {
    const target = decodeAttachmentDestination(rawDestination)
    if (target === null || !isAttachmentFileName(target)) {
        return null
    }
    const sourceRelativePath = normalizeSlashes(path.relative(root.lexical, sourcePath))
    const parentRelativePath = getParentRelativePath(sourceRelativePath)
    const combined = path.posix.normalize(
        parentRelativePath.length > 0 ? `${parentRelativePath}/${target}` : target
    )
    if (combined === '.' || combined === '..' || combined.startsWith('../')) {
        return null
    }
    const absolutePath = path.resolve(root.lexical, combined)
    if (
        !isPathWithin(absolutePath, root.lexical, {
            win32CaseInsensitive: WIN32_CASE_INSENSITIVE
        })
    ) {
        return null
    }
    return absolutePath
}

/**
 * 按原写法风格生成新的目标原文：
 * 保留 `<...>` 尖括号、`./` 前缀、`#fragment`/`?query` 后缀与百分号编码风格。
 */
function buildNewRawDestination(
    parts: RawDestinationParts,
    sourcePath: string,
    newPath: string
): string {
    const relative = normalizeSlashes(path.relative(path.dirname(sourcePath), newPath))
    const fragmentIndex = parts.destination.search(/[?#]/)
    const suffix = fragmentIndex >= 0 ? parts.destination.slice(fragmentIndex) : ''
    const pathOnly =
        fragmentIndex >= 0 ? parts.destination.slice(0, fragmentIndex) : parts.destination
    let target = relative
    if (pathOnly.startsWith('./') && !relative.startsWith('../')) {
        target = `./${relative}`
    }
    if (pathOnly.includes('%')) {
        // 原引用使用百分号编码（如 `a%20b.png`）时保持编码风格
        target = encodeURI(target).replace(/#/g, '%23').replace(/\?/g, '%3F')
    }
    const destination = `${target}${suffix}`
    return parts.hasAngle
        ? `${parts.leading}<${destination}>${parts.trailing}`
        : `${parts.leading}${destination}${parts.trailing}`
}

/**
 * 在单个来源 Markdown 中替换指向旧附件的引用（行内式 `![alt](path)` / `[text](path)`）。
 *
 * - 保留链接前缀与文字，只改圆括号内目标；
 * - 跳过围栏代码块与行内代码（B5 方案：不更新代码块内引用）；
 * - 行内多处替换按倒序应用，避免前列替换移动后列下标；
 * - `#fragment`/`?query` 保留（新目标仍指向同一附件的新文件名）。
 *
 * @returns 替换后的完整文本与替换处数（未命中时 content 原样返回）
 */
function replaceAttachmentReferences(
    content: string,
    sourcePath: string,
    root: ResolvedWorkspaceRoot,
    oldPath: string,
    newPath: string
): { content: string; count: number } {
    const oldKey = normalizePathForCompare(oldPath, WIN32_CASE_INSENSITIVE)
    // 按原有换行符切分：偶数下标为行内容、奇数下标为行分隔符，join 后原样还原 CRLF/LF/CR
    const segments = content.split(/(\r\n|\r|\n)/)
    let fence: { char: string; length: number } | null = null
    let count = 0
    for (let index = 0; index < segments.length; index += 2) {
        const line = segments[index]
        const marker = readFenceMarker(line)
        if (fence !== null) {
            if (
                marker !== null &&
                marker.char === fence.char &&
                marker.length >= fence.length &&
                marker.bare
            ) {
                fence = null
            }
            continue
        }
        if (marker !== null) {
            fence = { char: marker.char, length: marker.length }
            continue
        }
        const maskedLine = maskInlineCode(line)
        const replacements: Array<{ start: number; length: number; text: string }> = []
        MARKDOWN_INLINE_LINK_PATTERN.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = MARKDOWN_INLINE_LINK_PATTERN.exec(maskedLine)) !== null) {
            const parsed = parseRawDestination(match[3])
            if (parsed === null) {
                continue
            }
            const resolved = resolveAttachmentDestination(root, sourcePath, parsed.destination)
            if (resolved === null) {
                continue
            }
            if (normalizePathForCompare(resolved, WIN32_CASE_INSENSITIVE) !== oldKey) {
                continue
            }
            const newDestination = buildNewRawDestination(parsed, sourcePath, newPath)
            const replacement = `${match[1]}[${match[2]}](${newDestination})`
            if (replacement === match[0]) {
                continue
            }
            replacements.push({ start: match.index, length: match[0].length, text: replacement })
        }
        if (replacements.length === 0) {
            continue
        }
        let lineText = line
        for (let item = replacements.length - 1; item >= 0; item -= 1) {
            const replacement = replacements[item]
            lineText =
                lineText.slice(0, replacement.start) +
                replacement.text +
                lineText.slice(replacement.start + replacement.length)
        }
        segments[index] = lineText
        count += replacements.length
    }
    return { content: segments.join(''), count }
}

/**
 * 构建引用更新计划（**改名前**执行，不写盘）。
 *
 * 来源文件来自工作区索引 `attachments[].referencedBy`（工作区索引保证存在该字段；
 * 缺失说明无 Markdown 引用）；逐个读取/解码/替换，读取失败或编码失败的文件跳过并
 * 记入 `failedFiles`（改名后需手动处理，不强行覆盖）。
 */
async function buildReferenceUpdatePlan(
    root: ResolvedWorkspaceRoot,
    snapshot: WorkspaceIndexSnapshot,
    oldPath: string,
    newPath: string,
    options: AttachmentRenameOptions
): Promise<{ ok: true; plan: AttachmentReferencePlan } | { ok: false; message: string }> {
    const maxReferenceFiles = options.maxReferenceFiles ?? MAX_ATTACHMENT_REFERENCE_FILES
    const maxReferenceReplacements =
        options.maxReferenceReplacements ?? MAX_ATTACHMENT_REFERENCE_REPLACEMENTS
    const readFile = options.readFile ?? ((targetPath: string) => fs.readFile(targetPath))
    const plan: AttachmentReferencePlan = { updates: [], failedFiles: [] }
    const oldKey = normalizePathForCompare(oldPath, WIN32_CASE_INSENSITIVE)
    const entry = (snapshot.attachments ?? []).find(
        (attachment) => normalizePathForCompare(attachment.path, WIN32_CASE_INSENSITIVE) === oldKey
    )
    const sourcePaths = entry?.referencedBy ?? []
    const seenSources = new Set<string>()
    let plannedReplacements = 0
    for (const rawSourcePath of sourcePaths) {
        const sourcePath = path.resolve(rawSourcePath)
        const sourceKey = normalizePathForCompare(sourcePath, WIN32_CASE_INSENSITIVE)
        if (seenSources.has(sourceKey)) {
            continue
        }
        seenSources.add(sourceKey)
        if (sourceKey === oldKey) {
            continue
        }
        if (
            !isPathWithin(sourcePath, root.lexical, {
                win32CaseInsensitive: WIN32_CASE_INSENSITIVE
            }) ||
            !isIndexableTextFile(sourcePath)
        ) {
            plan.failedFiles.push(sourcePath)
            continue
        }
        let buffer: Buffer
        try {
            buffer = await readFile(sourcePath)
        } catch (error) {
            logger.warn(`[B5] 读取引用来源失败，跳过引用更新：${sourcePath}`, error)
            plan.failedFiles.push(sourcePath)
            continue
        }
        let decoded: { content: string; encoding: string }
        try {
            decoded = decodeFileContent(buffer)
        } catch (error) {
            logger.warn(`[B5] 解码引用来源失败，跳过引用更新：${sourcePath}`, error)
            plan.failedFiles.push(sourcePath)
            continue
        }
        const replaced = replaceAttachmentReferences(
            decoded.content,
            sourcePath,
            root,
            oldPath,
            newPath
        )
        if (replaced.count === 0) {
            continue
        }
        if (
            plan.updates.length >= maxReferenceFiles ||
            plannedReplacements + replaced.count > maxReferenceReplacements
        ) {
            // 引用面过大：整体中止（不重命名），避免「部分更新」导致的断链
            return { ok: false, message: '引用数量超过重命名上限，已中止重命名' }
        }
        plan.updates.push({
            sourcePath,
            content: replaced.content,
            encoding: decoded.encoding,
            bom: detectBom(buffer),
            replacementCount: replaced.count
        })
        plannedReplacements += replaced.count
    }
    return { ok: true, plan }
}

/* ============================ 重命名 ============================ */

/** 新文件名校验/归一化结果 */
type RenameTargetNameResult = { ok: true; fileName: string } | { ok: false; message: string }

/**
 * 校验并归一化新文件名：
 * - 拒绝路径分隔符/绝对路径/设备命名空间/控制字符（经 `isSafeFileName`）；
 * - 拒绝 Windows 保留设备名（跨平台一致）；
 * - 保持原扩展名：`newName` 含扩展名时必须与原扩展名一致（大小写不敏感），
 *   不含扩展名时自动补全原扩展名。
 */
function normalizeRenameTargetName(rawName: string, oldExtension: string): RenameTargetNameResult {
    if (rawName.includes('/') || rawName.includes('\\')) {
        return { ok: false, message: '文件名不能包含路径分隔符' }
    }
    if (rawName.includes('\u0000') || path.isAbsolute(rawName)) {
        return { ok: false, message: '文件名不能是绝对路径' }
    }
    if (!isSafeFileName(rawName)) {
        return { ok: false, message: '文件名不合法' }
    }
    // 保留设备名按第一个点之前的主干判断（`con.png` / `CON.tar.gz` 同样拒绝）
    const deviceNameCandidate = rawName
        .replace(/[. ]+$/, '')
        .split('.')[0]
        .toLowerCase()
    if (WINDOWS_DEVICE_NAME_PATTERN.test(deviceNameCandidate)) {
        return { ok: false, message: '文件名不能使用 Windows 保留设备名' }
    }
    const providedExtension = path.extname(rawName)
    if (
        providedExtension.length > 0 &&
        providedExtension.toLowerCase() !== oldExtension.toLowerCase()
    ) {
        return { ok: false, message: '重命名必须保持原扩展名' }
    }
    const stem =
        providedExtension.length > 0
            ? rawName.slice(0, rawName.length - providedExtension.length)
            : rawName
    if (stem.length === 0) {
        return { ok: false, message: '文件名不能为空' }
    }
    return { ok: true, fileName: `${stem}${oldExtension}` }
}

/** 重命名失败结果构造（避免重复字面量） */
function renameFailure(
    code: Exclude<Extract<AttachmentRenameResult, { ok: false }>['code'], 'UNTRUSTED_SENDER'>,
    message?: string
): AttachmentRenameResult {
    return message === undefined ? { ok: false, code } : { ok: false, code, message }
}

/**
 * 附件重命名 + Markdown 引用更新（B5 阶段三，两阶段事务）。
 *
 * 阶段 A（改名前）：校验旧路径/新名/目标冲突 → 构建索引 → 统计全部引用来源并生成
 * 引用替换计划（不写盘）；引用面超限整体中止。
 * 阶段 B（改名后）：`fs.rename` 成功后按计划逐个写回来源 Markdown（原编码 + BOM）；
 * 单个文件写回失败不中断，计入 `failedFiles`。改名失败则直接返回失败、**不改引用**。
 *
 * @param rawRootPath 工作区根绝对路径
 * @param rawOldPath 旧附件绝对路径（主进程重新校验）
 * @param rawNewName 新文件名（可含/不含扩展名；不允许路径分隔符）
 * @param options 改名/读写实现与上限（测试注入）
 * @returns 结构化结果；失败 code 见契约（INVALID_PAYLOAD/INVALID_NAME/ALREADY_EXISTS/
 *          NOT_FILE/PATH_DENIED/RENAME_FAILED/NO_WORKSPACE）
 */
export async function renameAttachment(
    rawRootPath: unknown,
    rawOldPath: unknown,
    rawNewName: unknown,
    options: AttachmentRenameOptions = {}
): Promise<AttachmentRenameResult> {
    const root = await resolveWorkspaceRoot(rawRootPath)
    if (root === null) {
        return renameFailure('NO_WORKSPACE')
    }
    if (typeof rawOldPath !== 'string' || typeof rawNewName !== 'string') {
        return renameFailure('INVALID_PAYLOAD')
    }
    if (rawOldPath.trim().length === 0) {
        return renameFailure('INVALID_PAYLOAD')
    }
    const newName = rawNewName.trim()
    if (newName.length === 0) {
        return renameFailure('INVALID_NAME')
    }
    try {
        const inspected = await inspectAttachmentPath(root, rawOldPath)
        if (!inspected.ok) {
            return renameFailure(inspected.reason)
        }
        const oldPath = inspected.path
        const oldBaseName = path.basename(oldPath)
        const oldExtension = path.extname(oldBaseName)
        const nameResult = normalizeRenameTargetName(newName, oldExtension)
        if (!nameResult.ok) {
            return renameFailure('INVALID_NAME', nameResult.message)
        }
        if (nameResult.fileName === oldBaseName) {
            return renameFailure('ALREADY_EXISTS', '目标文件名与原文件名相同')
        }
        const targetPath = path.join(path.dirname(oldPath), nameResult.fileName)
        if (
            !isPathWithin(targetPath, root.lexical, {
                win32CaseInsensitive: WIN32_CASE_INSENSITIVE
            })
        ) {
            return renameFailure('PATH_DENIED')
        }
        // 大小写改名（Windows）：归一化后同一路径，目标 lstat 命中的是原文件自身，允许
        const sameNormalizedTarget = isSameNormalizedPath(targetPath, oldPath)
        const targetStats = await lstatOrNull(targetPath)
        if (targetStats !== null && !sameNormalizedTarget) {
            return renameFailure('ALREADY_EXISTS', '目标文件已存在')
        }
        // 阶段 A：构建索引与引用更新计划（改名前，不写盘）
        const snapshot = await buildWorkspaceIndex(root.lexical)
        if (snapshot.rootPath === '') {
            return renameFailure('RENAME_FAILED', '工作区索引不可用，无法安全更新引用')
        }
        const planned = await buildReferenceUpdatePlan(root, snapshot, oldPath, targetPath, options)
        if (!planned.ok) {
            return renameFailure('RENAME_FAILED', planned.message)
        }
        // 阶段 B：先改名，成功后写回引用；改名失败不改引用
        const renameFile =
            options.renameFile ??
            ((fromPath: string, toPath: string): Promise<void> => fs.rename(fromPath, toPath))
        try {
            await renameFile(oldPath, targetPath)
        } catch (error) {
            logger.warn('[B5] 附件改名失败：', error)
            return renameFailure('RENAME_FAILED', describeError(error))
        }
        const writeFile =
            options.writeFile ??
            ((targetFilePath: string, data: Buffer): Promise<void> =>
                fs.writeFile(targetFilePath, data))
        const failedFiles = [...planned.plan.failedFiles]
        let updatedFiles = 0
        let replacements = 0
        for (const update of planned.plan.updates) {
            try {
                await writeFile(update.sourcePath, encodeReferenceUpdate(update))
                updatedFiles += 1
                replacements += update.replacementCount
            } catch (error) {
                logger.warn(`[B5] 引用写回失败：${update.sourcePath}`, error)
                failedFiles.push(update.sourcePath)
            }
        }
        return { ok: true, newPath: targetPath, updatedFiles, replacements, failedFiles }
    } catch (error) {
        logger.error('[B5] 附件重命名失败：', error)
        return renameFailure('RENAME_FAILED')
    }
}
