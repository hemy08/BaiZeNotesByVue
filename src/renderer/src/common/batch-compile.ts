/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译队列「纯逻辑 + 编译记录存储」。
 *
 * ## 职责边界
 * - 本模块是**纯逻辑层**：不依赖 Vue / DOM / IPC / 文件系统（localStorage 经可注入的
 *   `BatchCompileRecordStorage` 适配，默认解析 `window.localStorage`），因此可在 node
 *   环境下直接单测；
 * - 只负责「编译范围解析 / 目标过滤 / 分批 / 增量判定 / 人工修改冲突判定 / 编译记录」；
 *   实际执行（AI.INGEST / AI.APPLY_INGEST / 目录树事件 / READ_HTML）由
 *   `components/llm-wiki/batch-compile-runtime.ts` + `batch-compile-queue.ts` 承担；
 * - 复用既有共享真源：可编译扩展名（`shared/constants/ai.ts`）、front matter 解析
 *   （`shared/utils/front-matter.ts`）、FNV-1a 哈希（`shared/utils/hash.ts`）、编译范围
 *   归一化（`common/llm-wiki-migration-actions.ts`），不另写一份。
 *
 * ## 增量编译与人工修改保护口径
 * - 编译记录（localStorage，键 `baize:llm-wiki:compile-records:v1`）按「工作区根 + wiki
 *   目标页相对路径」记录「上次 AI 生成并应用成功的内容哈希 + 来源 raw 路径 + 时间」；
 *   **仅记录 AI 生成且审批应用成功的产物**，用户手写页面永远没有记录；
 * - 目标页状态判定（`classifyBatchCompilePageState`）：
 *   `missing` 无页面 → 正常编译；`verified` 有记录且页面哈希与记录一致、来源一致 →
 *   安全（增量模式跳过）；`manual-edit` 记录存在但页面哈希不一致（人工改过）→ 冲突；
 *   `manual-create` 无记录（人工创建或旧版本产物）→ 冲突；`source-mismatch` 记录来源与
 *   本次 raw 不一致 → 冲突；`unverified` 页面读取失败 → 冲突（不可安全覆盖）。
 *
 * ## 为什么前端也要解析目录树
 * `raw/` 被工作区索引排除，无法用 `FILE.GET_WORKSPACE_INDEX` 列出；复用既有
 * `FILE_MANAGER.FILE_SYSTEM_DATA` 整树事件（不新增 IPC），按本模块纯函数解析出
 * `raw/` 下可编译文件与 `wiki/` 下既有页面。
 */
import type { FileItem } from '../../../shared/types/file'
import { AI_RAW_FILE_EXTENSIONS, AI_WIKI_FILE_EXTENSIONS } from '../../../shared/constants/ai'
import {
    LLM_WIKI_RAW_DIR_NAME,
    LLM_WIKI_WIKI_DIR_NAME
} from '../../../shared/constants/workspace-mode'
import { fnv1a32 } from '../../../shared/utils/hash'
import { parseFrontMatter } from '../../../shared/utils/front-matter'
import type { LlmWikiCompileRequest, LlmWikiCompileScope } from './llm-wiki-migration-actions'
import {
    LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT,
    normalizeCompileBatchSize,
    normalizeCompileDirectoryInput
} from './llm-wiki-migration-actions'

/* ============================================================================
 * 一、编译请求 / 范围
 * ========================================================================== */

/** 归一化后的编译请求（EventBus 载荷 → 队列可直接消费） */
export interface NormalizedBatchCompileRequest {
    /** 编译范围：全量 / 指定目录 / 分批 */
    scope: LlmWikiCompileScope
    /** scope=directory 时的目录（raw/ 下的工作区相对路径，POSIX，无首尾斜杠） */
    directory: string | null
    /** 每批文件数（scope=batch 时生效；其余范围按逐文件审批） */
    batchSize: number
    /** 原始载荷是否非法/被降级（UI 可提示「已按全量编译处理」） */
    degraded: boolean
}

/** 默认编译请求（全量、逐文件审批） */
export function createDefaultBatchCompileRequest(): NormalizedBatchCompileRequest {
    return {
        scope: 'all',
        directory: null,
        batchSize: LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT,
        degraded: false
    }
}

/** 是否为普通对象（运行时结构守卫） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 归一化 EventBus `LLM_WIKI_COMPILE_REQUEST` 载荷。
 *
 * 宽容策略（不阻塞编译入口）：
 * - 非对象 → 回退「全量编译」并标记 degraded（不抛异常）；
 * - scope=directory 但目录非法 → 回退「全量编译」并标记 degraded；
 * - scope=batch 但每批数量非法 → 用默认值 10 并标记 degraded；
 * - 合法值原样保留（目录统一 `/` 分隔、去首尾斜杠；批次 1–500 整数）。
 */
export function normalizeBatchCompileRequest(payload: unknown): NormalizedBatchCompileRequest {
    const fallback = createDefaultBatchCompileRequest()
    if (!isRecord(payload)) {
        return { ...fallback, degraded: payload !== undefined && payload !== null }
    }
    const rawScope = payload.scope
    const scope: LlmWikiCompileScope =
        rawScope === 'all' || rawScope === 'directory' || rawScope === 'batch' ? rawScope : 'all'
    let degraded = scope !== rawScope && rawScope !== undefined
    if (scope === 'directory') {
        const directory =
            typeof payload.directory === 'string'
                ? normalizeCompileDirectoryInput(payload.directory)
                : null
        if (directory === null) {
            return { ...fallback, degraded: true }
        }
        return { scope, directory, batchSize: fallback.batchSize, degraded }
    }
    if (scope === 'batch') {
        const batchSize = normalizeCompileBatchSize(payload.batchSize)
        if (batchSize === null) {
            degraded = true
        }
        return {
            scope,
            directory: null,
            batchSize: batchSize ?? fallback.batchSize,
            degraded
        }
    }
    return { ...fallback, degraded }
}

/** 原始 EventBus 载荷 → 统一形状（供队列/宿主使用，语义等价于 LlmWikiCompileRequest） */
export function toLlmWikiCompileRequest(
    request: NormalizedBatchCompileRequest
): LlmWikiCompileRequest {
    if (request.scope === 'directory' && request.directory) {
        return { scope: 'directory', directory: request.directory }
    }
    if (request.scope === 'batch') {
        return { scope: 'batch', batchSize: request.batchSize }
    }
    return { scope: 'all' }
}

/* ============================================================================
 * 二、工作区目录树解析（raw/ 可编译文件 + wiki/ 既有页面）
 * ========================================================================== */

/** `raw/` 下可作为编译输入的原始资料文件 */
export interface BatchCompileRawFile {
    /** 工作区相对路径（`raw/...`，POSIX 分隔符） */
    relativePath: string
    /** 绝对路径（读取/传给 AI.INGEST 用；AI.INGEST 只接受工作区相对路径，故仅本地展示/选片用） */
    absolutePath: string
    /** 文件名（含扩展名） */
    name: string
}

/** `wiki/` 下既有页面（人工修改保护与增量判定用） */
export interface BatchCompileWikiPage {
    /** 工作区相对路径（`wiki/...`，POSIX 分隔符） */
    relativePath: string
    /** 绝对路径（READ_HTML 读取用） */
    absolutePath: string
    /** 文件名（含扩展名） */
    name: string
}

/** 解析后的工作区编译视图 */
export interface BatchCompileWorkspaceTree {
    /** 工作区根绝对路径（目录树根节点 path） */
    rootPath: string
    /** `raw/` 目录绝对路径；null = 工作区未初始化 raw/ */
    rawRootPath: string | null
    /** `wiki/` 目录绝对路径；null = 工作区未初始化 wiki/ */
    wikiRootPath: string | null
    /** raw/ 下可编译文件（`.md/.markdown/.txt`，按 relativePath 升序） */
    rawFiles: BatchCompileRawFile[]
    /** wiki/ 下既有页面（`.md/.markdown`，按 relativePath 升序） */
    wikiPages: BatchCompileWikiPage[]
}

/** 目录树解析结果 */
export type BatchCompileTreeParseResult =
    | { ok: true; tree: BatchCompileWorkspaceTree }
    | { ok: false; code: 'INVALID_TREE' | 'NO_WORKSPACE' }

/** 取小写扩展名（含点；无扩展名返回空串） */
function getLowerExtension(fileName: string): string {
    const index = fileName.lastIndexOf('.')
    if (index <= 0 || index === fileName.length - 1) {
        return ''
    }
    return fileName.slice(index).toLowerCase()
}

/** 相对路径计算（统一 `/`；大小写不敏感前缀匹配，输出保留原大小写） */
export function toWorkspaceRelativePath(rootPath: string, absolutePath: string): string {
    const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
    const target = absolutePath.replace(/\\/g, '/')
    if (root.length === 0) {
        return target.replace(/^\/+/, '')
    }
    if (target.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
        return target.slice(root.length + 1)
    }
    return target.replace(/^\/+/, '')
}

/** 目录树节点是否为合法文件/文件夹节点（运行时结构守卫） */
function isFileItemLike(value: unknown): value is FileItem {
    if (!isRecord(value)) {
        return false
    }
    return typeof value.path === 'string' && typeof value.name === 'string'
}

/** 递归收集目录子树下的文件（主进程已按扩展名白名单下发；这里再按需过滤） */
function collectTreeFiles(
    folder: FileItem,
    rootPath: string,
    extensions: readonly string[],
    out: Array<{ relativePath: string; absolutePath: string; name: string }>
): void {
    const children = Array.isArray(folder.children) ? folder.children : []
    for (const child of children) {
        if (!isFileItemLike(child)) {
            continue
        }
        if (child.isDirectory === true || child.type === 'folder') {
            collectTreeFiles(child, rootPath, extensions, out)
            continue
        }
        const extension = getLowerExtension(child.name)
        if (!extensions.includes(extension)) {
            continue
        }
        out.push({
            relativePath: toWorkspaceRelativePath(rootPath, child.path),
            absolutePath: child.path,
            name: child.name
        })
    }
}

/** 在根节点 children 中查找指定名字的目录节点（大小写不敏感） */
function findTopFolder(root: FileItem, folderName: string): FileItem | null {
    const children = Array.isArray(root.children) ? root.children : []
    for (const child of children) {
        if (!isFileItemLike(child)) {
            continue
        }
        if (child.isDirectory !== true && child.type !== 'folder') {
            continue
        }
        if (child.name.toLowerCase() === folderName.toLowerCase()) {
            return child
        }
    }
    return null
}

/**
 * 解析主进程目录树载荷（`FILE_MANAGER.FILE_SYSTEM_DATA` 的 JSON 字符串或已解析数组）。
 *
 * 返回 raw/ 下可编译文件与 wiki/ 下既有页面；目录缺失按空清单处理（工作区可能尚未
 * 初始化 raw/ 或尚未产生 wiki 页面）。非法载荷/无工作区返回结构化失败，不抛异常。
 */
export function parseBatchCompileWorkspaceTree(payload: unknown): BatchCompileTreeParseResult {
    let parsed: unknown = payload
    if (typeof payload === 'string') {
        if (payload.trim().length === 0) {
            return { ok: false, code: 'INVALID_TREE' }
        }
        try {
            parsed = JSON.parse(payload)
        } catch {
            return { ok: false, code: 'INVALID_TREE' }
        }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    const root = parsed[0]
    if (!isFileItemLike(root)) {
        return { ok: false, code: 'INVALID_TREE' }
    }
    const rootPath = root.path
    const rawFolder = findTopFolder(root, LLM_WIKI_RAW_DIR_NAME)
    const wikiFolder = findTopFolder(root, LLM_WIKI_WIKI_DIR_NAME)
    const rawFiles: BatchCompileRawFile[] = []
    const wikiPages: BatchCompileWikiPage[] = []
    if (rawFolder) {
        collectTreeFiles(rawFolder, rootPath, AI_RAW_FILE_EXTENSIONS, rawFiles)
    }
    if (wikiFolder) {
        collectTreeFiles(wikiFolder, rootPath, AI_WIKI_FILE_EXTENSIONS, wikiPages)
    }
    rawFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    wikiPages.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    return {
        ok: true,
        tree: {
            rootPath,
            rawRootPath: rawFolder ? rawFolder.path : null,
            wikiRootPath: wikiFolder ? wikiFolder.path : null,
            rawFiles,
            wikiPages
        }
    }
}

/* ============================================================================
 * 三、编译目标过滤与分批
 * ========================================================================== */

/**
 * 按编译范围过滤 raw/ 文件清单。
 * - all：全部；
 * - directory：`raw/<directory>/` 前缀（大小写不敏感，Windows 友好）；
 * - batch：全部（分批只影响审批粒度，不改变目标集合）。
 */
export function resolveBatchCompileTargets(
    rawFiles: readonly BatchCompileRawFile[],
    request: NormalizedBatchCompileRequest
): BatchCompileRawFile[] {
    if (request.scope !== 'directory' || !request.directory) {
        return [...rawFiles]
    }
    const prefix = `${LLM_WIKI_RAW_DIR_NAME}/${request.directory}/`.toLowerCase()
    return rawFiles.filter((file) => file.relativePath.toLowerCase().startsWith(prefix))
}

/**
 * 把目标清单切成批次（batchSize 已归一化为 1–500 的整数；兜底按 1 处理）。
 * 全量/指定目录范围同样经本函数切批（批次大小 1 = 逐文件审批），保证执行链路统一。
 */
export function chunkBatchCompileTargets(
    files: readonly BatchCompileRawFile[],
    batchSize: number
): BatchCompileRawFile[][] {
    const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 1
    const chunks: BatchCompileRawFile[][] = []
    for (let index = 0; index < files.length; index += size) {
        chunks.push(files.slice(index, index + size))
    }
    return chunks
}

/* ============================================================================
 * 四、wiki 页面索引（front matter source / 内容哈希）
 * ========================================================================== */

/** 单个 wiki 页面的索引项 */
export interface BatchCompileWikiPageIndexEntry {
    /** 页面工作区相对路径（`wiki/...`） */
    relativePath: string
    /** 页面绝对路径 */
    absolutePath: string
    /** front matter `source`（已归一化的工作区相对路径；缺失/非法为 null） */
    source: string | null
    /** 页面内容哈希（读取失败为 null） */
    contentHash: string | null
    /** 读取是否失败（失败时不可判定人工修改，按冲突处理） */
    unreadable: boolean
}

/** 内容哈希（长度 + FNV-1a 32 位；用于变更检测，非密码学用途） */
export function hashBatchCompileContent(content: string): string {
    return `${content.length}-${fnv1a32(content).toString(36)}`
}

/**
 * 归一化工作区相对路径（front matter source 用）：
 * 反斜杠转 `/`、去 `./` 前缀与首尾斜杠；空串/含 `..` 段返回 null。
 */
export function normalizeBatchCompileSourcePath(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
    if (normalized.length === 0) {
        return null
    }
    if (normalized.split('/').some((segment) => segment === '..')) {
        return null
    }
    return normalized
}

/**
 * 从 wiki 页面内容读取 front matter `source`（取首个合法标量；数组取首个字符串）。
 * 无 front matter / 无 source 字段 / 非法值 → null（按「人工创建」处理）。
 */
export function readBatchCompilePageSource(content: string): string | null {
    let parsed
    try {
        parsed = parseFrontMatter(content)
    } catch {
        return null
    }
    if (!parsed.present) {
        return null
    }
    const source = parsed.data.source
    if (Array.isArray(source)) {
        for (const item of source) {
            const normalized = normalizeBatchCompileSourcePath(item)
            if (normalized !== null) {
                return normalized
            }
        }
        return null
    }
    return normalizeBatchCompileSourcePath(source)
}

/**
 * 构建 wiki 页面索引（纯函数；内容读取由调用方完成，读取失败传 content=null）。
 */
export function buildBatchCompileWikiPageIndex(
    inputs: readonly { page: BatchCompileWikiPage; content: string | null }[]
): BatchCompileWikiPageIndexEntry[] {
    return inputs.map((input) => {
        const content = input.content
        return {
            relativePath: input.page.relativePath,
            absolutePath: input.page.absolutePath,
            source: content === null ? null : readBatchCompilePageSource(content),
            contentHash: content === null ? null : hashBatchCompileContent(content),
            unreadable: content === null
        }
    })
}

/** 按目标页面相对路径查找索引项（大小写不敏感，Windows 友好） */
export function findBatchCompileWikiPageByPath(
    index: readonly BatchCompileWikiPageIndexEntry[],
    targetPath: string
): BatchCompileWikiPageIndexEntry | null {
    const normalized = normalizeBatchCompileSourcePath(targetPath)
    if (normalized === null) {
        return null
    }
    const target = normalized.toLowerCase()
    return index.find((entry) => entry.relativePath.toLowerCase() === target) ?? null
}

/** 按 raw 来源路径查找关联 wiki 页面（`source` 与 raw 相对路径一致，取排序首个） */
export function findBatchCompileWikiPageBySource(
    index: readonly BatchCompileWikiPageIndexEntry[],
    sourcePath: string
): BatchCompileWikiPageIndexEntry | null {
    const normalized = normalizeBatchCompileSourcePath(sourcePath)
    if (normalized === null) {
        return null
    }
    const source = normalized.toLowerCase()
    return (
        index.find((entry) => entry.source !== null && entry.source.toLowerCase() === source) ??
        null
    )
}

/* ============================================================================
 * 五、页面状态判定（增量跳过 / 人工修改冲突）
 * ========================================================================== */

/** 目标 wiki 页面相对本次编译的状态 */
export type BatchCompilePageState =
    /** 无既有页面（新页面，无冲突） */
    | 'missing'
    /** 有编译记录且页面内容与记录一致、来源一致（安全更新；增量模式可跳过） */
    | 'verified'
    /** 有记录但页面内容被改过（人工修改冲突） */
    | 'manual-edit'
    /** 无编译记录（人工创建或旧版本产物；冲突） */
    | 'manual-create'
    /** 有记录但记录的来源与本次 raw 不一致（冲突） */
    | 'source-mismatch'
    /** 页面读取失败，无法判定（冲突） */
    | 'unverified'

/** 编译记录（localStorage 持久化；仅记录 AI 生成并审批应用成功的产物） */
export interface BatchCompileCompileRecord {
    /** 目标 wiki 页面工作区相对路径（`wiki/...`） */
    targetPath: string
    /** 来源 raw 文件工作区相对路径（`raw/...`） */
    sourcePath: string
    /** 上次写入内容的哈希（`hashBatchCompileContent`） */
    contentHash: string
    /** 上次写入时间（毫秒时间戳） */
    updatedAt: number
}

/** 冲突原因（页面存在且不可安全覆盖时的归类） */
export type BatchCompileConflictReason =
    'manual-edit' | 'manual-create' | 'source-mismatch' | 'unverified'

/** 页面状态 → 冲突原因（verified/missing 返回 null） */
export function toBatchCompileConflictReason(
    state: BatchCompilePageState
): BatchCompileConflictReason | null {
    if (state === 'verified' || state === 'missing') {
        return null
    }
    return state
}

/**
 * 判定目标页面状态：
 * - 无页面 → missing；
 * - 页面读取失败 → unverified（冲突）；
 * - 无编译记录 → manual-create（人工创建/旧版本产物，冲突）；
 * - 记录内容哈希与页面不一致 → manual-edit（冲突）；
 * - 记录来源与本次 raw 不一致 → source-mismatch（冲突）；
 * - 否则 verified（可安全更新）。
 */
export function classifyBatchCompilePageState(params: {
    page: BatchCompileWikiPageIndexEntry | null
    record: BatchCompileCompileRecord | null
    sourcePath: string
}): BatchCompilePageState {
    const { page, record, sourcePath } = params
    if (page === null) {
        return 'missing'
    }
    if (page.unreadable || page.contentHash === null) {
        return 'unverified'
    }
    if (record === null) {
        return 'manual-create'
    }
    if (record.contentHash !== page.contentHash) {
        return 'manual-edit'
    }
    const recordSource = normalizeBatchCompileSourcePath(record.sourcePath)
    const currentSource = normalizeBatchCompileSourcePath(sourcePath)
    if (recordSource === null || currentSource === null || recordSource !== currentSource) {
        return 'source-mismatch'
    }
    return 'verified'
}

/**
 * 增量模式是否直接跳过该目标（仅「已有编译记录 + 页面内容未被修改 + 来源一致」）。
 * `mode=all`（重新编译全部）时不跳过任何目标。
 */
export function shouldSkipBatchCompileTarget(
    state: BatchCompilePageState,
    mode: 'incremental' | 'all'
): boolean {
    return mode === 'incremental' && state === 'verified'
}

/* ============================================================================
 * 六、编译记录存储（localStorage，可注入 storage 便于单测/隐私模式降级）
 * ========================================================================== */

/** 编译记录 localStorage 键（版本化；结构变更时递增） */
export const BATCH_COMPILE_RECORD_STORAGE_KEY = 'baize:llm-wiki:compile-records:v1'

/** 编译记录快照版本 */
export const BATCH_COMPILE_RECORD_VERSION = 1

/** 最多保留的工作区数（防 localStorage 无限膨胀；超出淘汰最久未更新的工作区） */
export const BATCH_COMPILE_RECORD_MAX_WORKSPACES = 5

/** 单个工作区最多保留的页面记录数（超出淘汰最久未更新的页面） */
export const BATCH_COMPILE_RECORD_MAX_PAGES = 1000

/** 单个工作区的记录集合 */
export interface BatchCompileWorkspaceRecords {
    /** 工作区根绝对路径（展示/排重用） */
    rootPath: string
    /** 目标页相对路径 → 编译记录 */
    pages: Record<string, BatchCompileCompileRecord>
}

/** 编译记录持久化快照（版本 + 工作区映射） */
export interface BatchCompileRecordSnapshot {
    version: number
    workspaces: Record<string, BatchCompileWorkspaceRecords>
}

/** min 结构：localStorage 子集（便于单测注入内存替身） */
export interface BatchCompileRecordStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

/** 编译记录存储操作接口（工作区根为作用域，避免多工作区互相污染） */
export interface BatchCompileRecordStore {
    /** 读取某目标页面的编译记录 */
    get(rootPath: string, targetPath: string): BatchCompileCompileRecord | null
    /** 写入/覆盖编译记录（仅 AI 生成且应用成功时调用） */
    set(rootPath: string, record: BatchCompileCompileRecord): void
    /** 删除某目标页面的记录 */
    remove(rootPath: string, targetPath: string): void
    /** 读取工作区全部记录（增量/冲突预检用） */
    getAll(rootPath: string): BatchCompileCompileRecord[]
}

/** 空快照 */
function createEmptyRecordSnapshot(): BatchCompileRecordSnapshot {
    return { version: BATCH_COMPILE_RECORD_VERSION, workspaces: {} }
}

/** 归一化单条编译记录（非法返回 null） */
function normalizeCompileRecord(
    raw: unknown,
    fallbackTargetPath: string
): BatchCompileCompileRecord | null {
    if (!isRecord(raw)) {
        return null
    }
    const sourcePath = normalizeBatchCompileSourcePath(raw.sourcePath)
    const targetPath = normalizeBatchCompileSourcePath(raw.targetPath) ?? fallbackTargetPath
    const contentHash = typeof raw.contentHash === 'string' ? raw.contentHash.trim() : ''
    const updatedAt =
        typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
            ? Math.max(0, Math.trunc(raw.updatedAt))
            : 0
    if (sourcePath === null || contentHash.length === 0 || targetPath.length === 0) {
        return null
    }
    return { targetPath, sourcePath, contentHash, updatedAt }
}

/**
 * 归一化持久化快照（localStorage 损坏/旧结构/非法项安全降级，不抛异常）：
 * 非法工作区/记录直接丢弃；已不存在页面的记录不在此处理（读取时按需查）。
 */
export function normalizeBatchCompileRecordSnapshot(raw: unknown): BatchCompileRecordSnapshot {
    if (!isRecord(raw)) {
        return createEmptyRecordSnapshot()
    }
    const rawWorkspaces = isRecord(raw.workspaces) ? raw.workspaces : {}
    const workspaces: Record<string, BatchCompileWorkspaceRecords> = {}
    for (const [key, value] of Object.entries(rawWorkspaces)) {
        if (!isRecord(value)) {
            continue
        }
        const rootPath = typeof value.rootPath === 'string' ? value.rootPath : ''
        if (rootPath.length === 0) {
            continue
        }
        const rawPages = isRecord(value.pages) ? value.pages : {}
        const pages: Record<string, BatchCompileCompileRecord> = {}
        for (const [pageKey, pageValue] of Object.entries(rawPages)) {
            const record = normalizeCompileRecord(pageValue, pageKey)
            if (record !== null) {
                pages[record.targetPath] = record
            }
        }
        workspaces[key] = { rootPath, pages }
    }
    return { version: BATCH_COMPILE_RECORD_VERSION, workspaces }
}

/** 工作区键：根路径归一化（`/` 分隔、小写）后的 FNV-1a 32 位 base36（Windows 大小写不敏感） */
export function resolveBatchCompileWorkspaceKey(rootPath: string): string {
    const normalized = rootPath.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    return fnv1a32(normalized).toString(36)
}

/** 解析默认 localStorage（不可用/隐私模式返回 null） */
export function resolveBatchCompileLocalStorage(): BatchCompileRecordStorage | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        const storage = window.localStorage
        if (
            !storage ||
            typeof storage.getItem !== 'function' ||
            typeof storage.setItem !== 'function'
        ) {
            return null
        }
        return storage
    } catch {
        return null
    }
}

/**
 * 创建编译记录存储。
 *
 * @param storage localStorage 子集；null/不可用时降级为**仅本次会话内存**存储
 *                （与 AI 密钥 memory 形态同口径：功能可用但跨重启丢失记录 → 下次按
 *                人工创建冲突处理，不会静默覆盖）。
 */
export function createBatchCompileRecordStore(
    storage: BatchCompileRecordStorage | null
): BatchCompileRecordStore {
    let memorySnapshot: BatchCompileRecordSnapshot | null = null

    function readSnapshot(): BatchCompileRecordSnapshot {
        if (memorySnapshot !== null) {
            return memorySnapshot
        }
        if (storage === null) {
            memorySnapshot = createEmptyRecordSnapshot()
            return memorySnapshot
        }
        let parsed: unknown
        try {
            const raw = storage.getItem(BATCH_COMPILE_RECORD_STORAGE_KEY)
            parsed = raw === null ? null : JSON.parse(raw)
        } catch {
            parsed = null
        }
        return normalizeBatchCompileRecordSnapshot(parsed)
    }

    function writeSnapshot(snapshot: BatchCompileRecordSnapshot): void {
        if (storage === null) {
            memorySnapshot = snapshot
            return
        }
        try {
            storage.setItem(BATCH_COMPILE_RECORD_STORAGE_KEY, JSON.stringify(snapshot))
        } catch {
            // 配额不足/隐私模式：降级为内存快照，不打断编译（记录仅本次会话有效）
            memorySnapshot = snapshot
        }
    }

    /** 淘汰超额工作区（保留最近更新的 N 个） */
    function pruneWorkspaces(snapshot: BatchCompileRecordSnapshot): void {
        const keys = Object.keys(snapshot.workspaces)
        if (keys.length <= BATCH_COMPILE_RECORD_MAX_WORKSPACES) {
            return
        }
        const latest = (key: string): number => {
            const pages = snapshot.workspaces[key].pages
            return Object.values(pages).reduce((max, page) => Math.max(max, page.updatedAt), 0)
        }
        keys.sort((left, right) => latest(right) - latest(left))
        for (const key of keys.slice(BATCH_COMPILE_RECORD_MAX_WORKSPACES)) {
            delete snapshot.workspaces[key]
        }
    }

    /** 淘汰单工作区超额页面（保留最近更新的 N 条） */
    function prunePages(workspace: BatchCompileWorkspaceRecords): void {
        const entries = Object.entries(workspace.pages)
        if (entries.length <= BATCH_COMPILE_RECORD_MAX_PAGES) {
            return
        }
        entries.sort((left, right) => right[1].updatedAt - left[1].updatedAt)
        const kept: Record<string, BatchCompileCompileRecord> = {}
        for (const [key, record] of entries.slice(0, BATCH_COMPILE_RECORD_MAX_PAGES)) {
            kept[key] = record
        }
        workspace.pages = kept
    }

    function getWorkspace(
        snapshot: BatchCompileRecordSnapshot,
        rootPath: string
    ): BatchCompileWorkspaceRecords | null {
        const key = resolveBatchCompileWorkspaceKey(rootPath)
        return snapshot.workspaces[key] ?? null
    }

    /** 大小写不敏感查找页面记录键（Windows 路径大小写不敏感） */
    function findPageKey(
        workspace: BatchCompileWorkspaceRecords,
        targetPath: string
    ): string | null {
        if (Object.prototype.hasOwnProperty.call(workspace.pages, targetPath)) {
            return targetPath
        }
        const lower = targetPath.toLowerCase()
        for (const key of Object.keys(workspace.pages)) {
            if (key.toLowerCase() === lower) {
                return key
            }
        }
        return null
    }

    return {
        get(rootPath: string, targetPath: string): BatchCompileCompileRecord | null {
            const workspace = getWorkspace(readSnapshot(), rootPath)
            if (workspace === null) {
                return null
            }
            const normalized = normalizeBatchCompileSourcePath(targetPath)
            if (normalized === null) {
                return null
            }
            const key = findPageKey(workspace, normalized)
            return key === null ? null : workspace.pages[key]
        },
        set(rootPath: string, record: BatchCompileCompileRecord): void {
            const targetPath = normalizeBatchCompileSourcePath(record.targetPath)
            const sourcePath = normalizeBatchCompileSourcePath(record.sourcePath)
            if (targetPath === null || sourcePath === null) {
                return
            }
            const snapshot = readSnapshot()
            const key = resolveBatchCompileWorkspaceKey(rootPath)
            const workspace = snapshot.workspaces[key] ?? { rootPath, pages: {} }
            workspace.rootPath = rootPath
            workspace.pages[targetPath] = {
                targetPath,
                sourcePath,
                contentHash: record.contentHash,
                updatedAt:
                    Number.isFinite(record.updatedAt) && record.updatedAt >= 0
                        ? Math.trunc(record.updatedAt)
                        : 0
            }
            prunePages(workspace)
            snapshot.workspaces[key] = workspace
            pruneWorkspaces(snapshot)
            writeSnapshot(snapshot)
        },
        remove(rootPath: string, targetPath: string): void {
            const snapshot = readSnapshot()
            const workspace = getWorkspace(snapshot, rootPath)
            const normalized = normalizeBatchCompileSourcePath(targetPath)
            if (workspace === null || normalized === null) {
                return
            }
            const key = findPageKey(workspace, normalized)
            if (key === null) {
                return
            }
            delete workspace.pages[key]
            writeSnapshot(snapshot)
        },
        getAll(rootPath: string): BatchCompileCompileRecord[] {
            const workspace = getWorkspace(readSnapshot(), rootPath)
            return workspace === null ? [] : Object.values(workspace.pages)
        }
    }
}
