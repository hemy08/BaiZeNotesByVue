/**
 * 1.5.7 LLM Wiki L2：MCP 只读工具实现（7 个）
 *
 * ## 工具清单（实施计划 §4.6.2）
 * | 工具 | 作用 |
 * | --- | --- |
 * | `search_wiki` | wiki/ 全文检索（分页 limit 默认 20 / 最大 100） |
 * | `read_page` | 读取 wiki/ 页面（Markdown 原文 + 解析后的 front matter） |
 * | `list_pages` | wiki/ 目录/页面树（分页） |
 * | `read_schema` | 读取工作区根 `schema.md`（LLM Wiki 约定） |
 * | `list_tags` | wiki/ 标签与计数（分页） |
 * | `get_backlinks` | 双链/反链（入链 + 出链） |
 * | `read_raw` | 读取 raw/ 原始资料（只读） |
 *
 * ## 只读边界（硬约束，测试守护）
 * 1. **不提供任何写操作**：本文件不调用 writeFile/rename/unlink 等写 API，也不暴露写工具；
 * 2. **不接受绝对路径**：所有 path 参数必须是工作区相对路径；绝对路径、盘符、UNC、
 *    `..` 越界、NUL 一律拒绝；
 * 3. **目录白名单**：`read_page`/`get_backlinks` 只允许 `wiki/` 内文件，`read_raw` 只允许
 *    `raw/` 内文件；`read_schema` 只读固定文件 `schema.md`；
 * 4. **Path Guard**：解析出的绝对路径再做「必须位于工作区根内 + 非符号链接 + realpath
 *    不逃逸 + security.isPathAllowed 受信根校验」；
 * 5. **大小上限**：单文件读取 ≤2 MiB（与索引/搜索服务同口径），超限返回 FILE_TOO_LARGE；
 * 6. **工作区根唯一真源**：只取主进程 `appState.rootPath`，工具参数不能指定根。
 *
 * ## 失败口径
 * 可预期失败（无工作区/参数非法/路径越界/文件不存在/超限）返回 `isError: true` 的工具结果
 * （文本为 `{ ok:false, code, error }` JSON），不抛异常、不向 Agent 泄漏堆栈；
 * 未知工具由 protocol 层按 JSON-RPC error 处理。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import {
    LLM_WIKI_RAW_DIR_NAME,
    LLM_WIKI_SCHEMA_FILE_NAME,
    LLM_WIKI_WIKI_DIR_NAME
} from '../../shared/constants/workspace-mode'
import type { WorkspaceIndexSnapshot } from '../../shared/types/workspace-index'
import { parseFrontMatter } from '../../shared/utils/front-matter'
import { isPathWithin, normalizeSlashes } from '../../shared/utils/path'
import { appState } from '../utils/app-state'
import { decodeFileContent } from '../utils/file-utils/file-encoding'
import { logger } from '../utils/logger'
import { isPathAllowed, normalizeLocalPath } from '../utils/security'
import { buildWorkspaceIndex, findBacklinks } from '../utils/workspace-index'
import { searchWorkspace } from '../utils/workspace-search'
import {
    MCP_DEFAULT_PAGE_LIMIT,
    MCP_DEFAULT_TAG_LIMIT,
    MCP_MAX_PAGE_LIMIT,
    MCP_MAX_RELATIVE_PATH_LENGTH,
    MCP_MAX_SEARCH_MATCHES,
    MCP_MAX_SEARCH_QUERY_LENGTH,
    MCP_MAX_TAG_LIMIT,
    MCP_MAX_TEXT_FILE_BYTES,
    MCP_WORKSPACE_CACHE_TTL_MS
} from './constants'

/* ============================ 类型 ============================ */

/** 单个工具的 JSON Schema 输入定义（MCP tools/list 的 inputSchema） */
export interface McpToolInputSchema {
    type: 'object'
    properties: Record<string, unknown>
    required?: readonly string[]
    additionalProperties: false
}

/** 工具定义（tools/list 返回项） */
export interface McpToolDefinition {
    name: string
    title: string
    description: string
    inputSchema: McpToolInputSchema
}

/** 工具结果文本块（MCP content block） */
export interface McpToolTextContent {
    type: 'text'
    text: string
}

/** tools/call 结果 */
export interface McpToolCallResult {
    content: McpToolTextContent[]
    isError?: boolean
}

/** 工具级错误码（作为 isError 结果的 code 字段） */
export type McpToolErrorCode =
    | 'NO_WORKSPACE'
    | 'INVALID_ARGUMENTS'
    | 'PATH_DENIED'
    | 'NOT_FOUND'
    | 'FILE_TOO_LARGE'
    | 'UNSUPPORTED_FILE_TYPE'
    | 'INTERNAL_ERROR'

/** 允许按纯文本读取的文件扩展名（页面/原始资料同口径） */
const WORKSPACE_TEXT_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt']

/** Windows 下路径比较大小写不敏感（与仓库其余路径判定口径一致） */
const WIN32_CASE_INSENSITIVE = process.platform === 'win32'

/* ============================ 工具 schema 定义 ============================ */

/** search_wiki / list_pages 共用的分页字段 */
const PAGE_PROPERTIES = {
    limit: {
        type: 'integer',
        minimum: 1,
        maximum: MCP_MAX_PAGE_LIMIT,
        default: MCP_DEFAULT_PAGE_LIMIT,
        description: `Maximum number of items to return (default ${MCP_DEFAULT_PAGE_LIMIT}, max ${MCP_MAX_PAGE_LIMIT}).`
    },
    offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Zero-based offset for pagination.'
    }
} as const

/** 7 个只读工具的 MCP 定义（名称/说明/输入 schema；顺序即 tools/list 输出顺序） */
export const MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
    {
        name: 'search_wiki',
        title: 'Search wiki pages',
        description:
            'Full-text search over wiki/ pages of the current BaiZe Notes workspace. Returns paginated matches with workspace-relative path, 1-based line/column and a short line preview. Read-only: raw/ and other workspace folders are never returned.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    minLength: 1,
                    maxLength: MCP_MAX_SEARCH_QUERY_LENGTH,
                    description: 'Text or regular expression to search for.'
                },
                caseSensitive: {
                    type: 'boolean',
                    default: false,
                    description: 'Match case-sensitively.'
                },
                wholeWord: {
                    type: 'boolean',
                    default: false,
                    description: 'Only match whole words.'
                },
                useRegex: {
                    type: 'boolean',
                    default: false,
                    description: 'Treat query as a JavaScript regular expression.'
                },
                ...PAGE_PROPERTIES
            },
            required: ['query'],
            additionalProperties: false
        }
    },
    {
        name: 'read_page',
        title: 'Read a wiki page',
        description:
            'Read one page from the workspace wiki/ directory. Returns the raw Markdown content plus parsed front matter. The path must be workspace-relative and stay inside wiki/ (absolute paths and .. traversal are rejected). Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    minLength: 1,
                    maxLength: MCP_MAX_RELATIVE_PATH_LENGTH,
                    description: 'Workspace-relative path of the page, e.g. "wiki/topics/topic.md".'
                }
            },
            required: ['path'],
            additionalProperties: false
        }
    },
    {
        name: 'list_pages',
        title: 'List wiki pages',
        description:
            'List pages under wiki/ as a paginated flat tree (relative path, title, tags, excerpt, size, mtime). Optionally filter by a sub directory of wiki/. Use it to explore the wiki before reading pages.',
        inputSchema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    maxLength: MCP_MAX_RELATIVE_PATH_LENGTH,
                    description:
                        'Optional sub directory under wiki/ (e.g. "topics"); omit for the whole wiki/.'
                },
                ...PAGE_PROPERTIES
            },
            additionalProperties: false
        }
    },
    {
        name: 'read_schema',
        title: 'Read wiki schema',
        description:
            'Read schema.md at the workspace root: the authoring conventions (raw/ is read-only, front matter format) this wiki follows. Returns exists=false when the workspace was not initialized as an LLM Wiki workspace.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
        }
    },
    {
        name: 'list_tags',
        title: 'List wiki tags',
        description:
            'List tags with file counts across wiki/ pages, sorted by count descending then tag name. Paginated. Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'integer',
                    minimum: 1,
                    maximum: MCP_MAX_TAG_LIMIT,
                    default: MCP_DEFAULT_TAG_LIMIT,
                    description: `Maximum number of tags to return (default ${MCP_DEFAULT_TAG_LIMIT}, max ${MCP_MAX_TAG_LIMIT}).`
                },
                offset: {
                    type: 'integer',
                    minimum: 0,
                    default: 0,
                    description: 'Zero-based offset for pagination.'
                }
            },
            additionalProperties: false
        }
    },
    {
        name: 'get_backlinks',
        title: 'Get wiki backlinks',
        description:
            'Get the wiki-link graph around one wiki page: incoming backlinks (pages that link to it) and outgoing links parsed from the page. The path must be workspace-relative inside wiki/. Read-only.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    minLength: 1,
                    maxLength: MCP_MAX_RELATIVE_PATH_LENGTH,
                    description: 'Workspace-relative path of the page, e.g. "wiki/topics/topic.md".'
                }
            },
            required: ['path'],
            additionalProperties: false
        }
    },
    {
        name: 'read_raw',
        title: 'Read raw source material',
        description:
            'Read a source file under raw/ (the read-only evidence layer of an LLM Wiki workspace). Only .md/.markdown/.txt files are supported. The path must be workspace-relative inside raw/. Never writes.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    minLength: 1,
                    maxLength: MCP_MAX_RELATIVE_PATH_LENGTH,
                    description:
                        'Workspace-relative path under raw/, e.g. "raw/2026-11-28-source.md".'
                }
            },
            required: ['path'],
            additionalProperties: false
        }
    }
]

/** 只读工具数量（设置页状态展示与测试断言共用；= tools/list 实际条数） */
export const MCP_TOOL_COUNT = MCP_TOOL_DEFINITIONS.length

/* ============================ 通用工具 ============================ */

/** 结构化成功结果（text 为 JSON 载荷，Agent 可直接解析） */
function successResult(payload: unknown): McpToolCallResult {
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

/** 结构化工具失败结果（isError=true，不抛异常、不泄漏堆栈） */
function failureResult(code: McpToolErrorCode, message: string): McpToolCallResult {
    return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, code, error: message }) }],
        isError: true
    }
}

/** 工作区上下文（根路径来自主进程 appState，工具参数不可指定） */
interface WorkspaceContext {
    root: string
}

/** 解析当前工作区根（空/非法/不存在时返回 null） */
function resolveWorkspaceContext(): WorkspaceContext | null {
    const raw = appState.rootPath
    if (typeof raw !== 'string') {
        return null
    }
    const root = normalizeLocalPath(raw)
    return root === null ? null : { root }
}

/** 归一化工作区相对路径参数：非字符串/绝对路径/盘符/UNC/`..`/NUL 一律 null */
function normalizeRelativePathArgument(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null
    }
    const trimmed = raw.trim()
    if (
        trimmed.length === 0 ||
        trimmed.length > MCP_MAX_RELATIVE_PATH_LENGTH ||
        trimmed.includes('\u0000')
    ) {
        return null
    }
    const slashed = normalizeSlashes(trimmed)
    // 绝对路径 / 盘符 / UNC / 设备命名空间 / 前导斜杠：工具只接受工作区相对路径
    if (
        slashed.startsWith('/') ||
        /^[A-Za-z]:/.test(slashed) ||
        /^[\\/]{2}/.test(trimmed) ||
        /^[\\/]{2}[.?!]/.test(trimmed)
    ) {
        return null
    }
    const normalized = path.posix.normalize(slashed)
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
        return null
    }
    if (normalized.split('/').some((segment) => segment.length === 0 || segment === '..')) {
        return null
    }
    return normalized
}

/** 参数对象归一化（undefined/null → 空对象；数组/非对象 → null） */
function readArguments(raw: unknown): Record<string, unknown> | null {
    if (raw === undefined || raw === null) {
        return {}
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        return null
    }
    return raw as Record<string, unknown>
}

/** 校验参数中不含未声明的键（严格 schema：拒绝而不是忽略，避免 Agent 误用） */
function findUnknownArgument(
    args: Record<string, unknown>,
    allowed: readonly string[]
): string | null {
    for (const key of Object.keys(args)) {
        if (!allowed.includes(key)) {
            return key
        }
    }
    return null
}

/** 读取可选布尔参数（缺失 → 默认 false；非布尔 → null 表示非法） */
function readOptionalBoolean(args: Record<string, unknown>, key: string): boolean | null {
    const raw = args[key]
    if (raw === undefined) {
        return false
    }
    return typeof raw === 'boolean' ? raw : null
}

/** 读取分页参数（缺失用默认；超上限钳制到上限；非法返回 null） */
function readPageOptions(
    args: Record<string, unknown>,
    defaultLimit: number,
    maxLimit: number
): { limit: number; offset: number } | null {
    const rawLimit = args.limit
    const rawOffset = args.offset
    let limit = defaultLimit
    if (rawLimit !== undefined) {
        if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit) || rawLimit < 1) {
            return null
        }
        limit = Math.min(rawLimit, maxLimit)
    }
    let offset = 0
    if (rawOffset !== undefined) {
        if (typeof rawOffset !== 'number' || !Number.isInteger(rawOffset) || rawOffset < 0) {
            return null
        }
        offset = rawOffset
    }
    return { limit, offset }
}

/** 文本读取成功结果 */
interface ReadTextSuccess {
    ok: true
    content: string
    encoding: string
}

/** 文本读取失败结果 */
interface ReadTextFailure {
    ok: false
    code: McpToolErrorCode
    message: string
}

/** 已通过目录白名单 + Path Guard + 大小校验的工作区文本文件 */
interface ResolvedWorkspaceTextFile {
    ok: true
    root: string
    absolutePath: string
    relativePath: string
    size: number
    mtimeMs: number
}

/** 文件解析失败结果 */
interface ResolveFileFailure {
    ok: false
    code: McpToolErrorCode
    message: string
}

/**
 * 解析并校验「工作区相对路径 → 受信文本文件」。
 *
 * 校验链（任一失败即拒绝）：
 * 1. 工作区根只取 appState.rootPath，非法/未打开 → NO_WORKSPACE；
 * 2. path 参数必须是相对路径（绝对路径/盘符/UNC/`..`/NUL → INVALID_ARGUMENTS）；
 * 3. 必须位于 requiredDirectory/ 下（否则 PATH_DENIED）；
 * 4. 扩展名必须属于 .md/.markdown/.txt（否则 UNSUPPORTED_FILE_TYPE）；
 * 5. `path.resolve` 后仍在工作区根内 + security.isPathAllowed（Path Guard 受信根）；
 * 6. lstat 必须是普通文件且非符号链接（realpath 不逃逸出工作区根）；
 * 7. 文件大小 ≤2 MiB（超限 FILE_TOO_LARGE）。
 */
async function resolveWorkspaceTextFile(
    rawPath: unknown,
    requiredDirectory: string
): Promise<ResolvedWorkspaceTextFile | ResolveFileFailure> {
    const context = resolveWorkspaceContext()
    if (context === null) {
        return {
            ok: false,
            code: 'NO_WORKSPACE',
            message: '当前未打开工作区：请先在白泽笔记中打开一个工作区。'
        }
    }
    const relativePath = normalizeRelativePathArgument(rawPath)
    if (relativePath === null) {
        return {
            ok: false,
            code: 'INVALID_ARGUMENTS',
            message:
                'path 必须是工作区相对路径（不能是绝对路径/盘符/UNC，不能包含 ..，长度 ≤4096）。'
        }
    }
    if (!relativePath.startsWith(`${requiredDirectory}/`)) {
        return {
            ok: false,
            code: 'PATH_DENIED',
            message: `只能访问 ${requiredDirectory}/ 目录内的文件（收到：${relativePath}）。`
        }
    }
    const extension = path.posix.extname(relativePath).toLowerCase()
    if (!WORKSPACE_TEXT_EXTENSIONS.includes(extension)) {
        return {
            ok: false,
            code: 'UNSUPPORTED_FILE_TYPE',
            message: '只支持 .md / .markdown / .txt 文本文件。'
        }
    }
    const absolutePath = path.resolve(context.root, relativePath)
    if (
        !isPathWithin(absolutePath, context.root, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })
    ) {
        return { ok: false, code: 'PATH_DENIED', message: '目标路径不在当前工作区根内。' }
    }
    // Path Guard（security.isPathAllowed）：受信根白名单 + 符号链接/junction 逃逸校验
    if (!isPathAllowed(absolutePath)) {
        return {
            ok: false,
            code: 'PATH_DENIED',
            message: 'Path Guard 已拒绝该路径（不在受信根内或存在符号链接逃逸）。'
        }
    }
    let stats
    try {
        stats = await fs.lstat(absolutePath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return {
                ok: false,
                code: 'NOT_FOUND',
                message: `文件不存在：${relativePath}`
            }
        }
        return {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: `读取文件状态失败：${String((error as Error)?.message ?? error)}`
        }
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
        return { ok: false, code: 'PATH_DENIED', message: '目标不是普通文件（或为符号链接）。' }
    }
    try {
        const [realRoot, realFile] = await Promise.all([
            fs.realpath(context.root),
            fs.realpath(absolutePath)
        ])
        if (!isPathWithin(realFile, realRoot, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })) {
            return { ok: false, code: 'PATH_DENIED', message: '目标路径 realpath 不在工作区根内。' }
        }
    } catch {
        return { ok: false, code: 'PATH_DENIED', message: '无法解析目标路径的真实路径。' }
    }
    if (stats.size > MCP_MAX_TEXT_FILE_BYTES) {
        return {
            ok: false,
            code: 'FILE_TOO_LARGE',
            message: `文件超过 ${MCP_MAX_TEXT_FILE_BYTES} 字节上限，已拒绝读取。`
        }
    }
    return {
        ok: true,
        root: context.root,
        absolutePath,
        relativePath: normalizeSlashes(relativePath),
        size: stats.size,
        mtimeMs: stats.mtimeMs
    }
}

/** 读取已校验文件并解码（复用主进程编码探测真源，GBK/UTF-16 等文件同样可读） */
async function readWorkspaceTextFile(
    file: ResolvedWorkspaceTextFile
): Promise<ReadTextSuccess | ReadTextFailure> {
    try {
        const buffer = await fs.readFile(file.absolutePath)
        if (buffer.length > MCP_MAX_TEXT_FILE_BYTES) {
            return {
                ok: false,
                code: 'FILE_TOO_LARGE',
                message: `文件超过 ${MCP_MAX_TEXT_FILE_BYTES} 字节上限，已拒绝读取。`
            }
        }
        const decoded = decodeFileContent(buffer)
        return { ok: true, content: decoded.content, encoding: decoded.encoding }
    } catch (error) {
        return {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: `读取文件失败：${String((error as Error)?.message ?? error)}`
        }
    }
}

/** 是否 wiki/ 目录下的页面（relativePath 口径，统一 `/` 分隔） */
function isWikiPage(relativePath: string): boolean {
    return relativePath.startsWith(`${LLM_WIKI_WIKI_DIR_NAME}/`)
}

/** 去掉 wiki/ 前缀后的页内相对路径 */
function toWikiRelativePath(relativePath: string): string {
    return relativePath.slice(LLM_WIKI_WIKI_DIR_NAME.length + 1)
}

/** 取相对路径的父目录（根目录文件返回空串） */
function getParentDirectory(relativePath: string): string {
    const slashIndex = relativePath.lastIndexOf('/')
    return slashIndex <= 0 ? '' : relativePath.slice(0, slashIndex)
}

/* ============================ 工作区快照缓存 ============================ */

let cachedSnapshot: WorkspaceIndexSnapshot | null = null
let cachedRootPath = ''
let cachedAt = 0
let inFlightBuild: Promise<WorkspaceIndexSnapshot> | null = null

/** 清空 MCP 工作区快照缓存（工作区切换/测试隔离用；根变化本身也会触发重建） */
export function invalidateMcpWorkspaceCache(): void {
    cachedSnapshot = null
    cachedRootPath = ''
    cachedAt = 0
    inFlightBuild = null
}

/**
 * 获取工作区索引快照（带 TTL 缓存，避免单次 Agent 会话内重复全量扫描）。
 * 与 FILE.GET_WORKSPACE_INDEX 的 5s TTL 缓存口径一致，但独立实现（MCP 层不 import ipc 层）。
 */
async function getWorkspaceSnapshot(root: string): Promise<WorkspaceIndexSnapshot> {
    if (
        cachedSnapshot !== null &&
        cachedRootPath === root &&
        Date.now() - cachedAt < MCP_WORKSPACE_CACHE_TTL_MS
    ) {
        return cachedSnapshot
    }
    if (inFlightBuild === null || cachedRootPath !== root) {
        cachedRootPath = root
        inFlightBuild = buildWorkspaceIndex(root).finally(() => {
            inFlightBuild = null
        })
    }
    const snapshot = await inFlightBuild
    cachedSnapshot = snapshot
    cachedRootPath = root
    cachedAt = Date.now()
    return snapshot
}

/* ============================ 工具实现 ============================ */

/** `search_wiki` 参数（归一化后） */
interface SearchWikiArguments {
    query: string
    caseSensitive: boolean
    wholeWord: boolean
    useRegex: boolean
    limit: number
    offset: number
}

/** 解析 `search_wiki` 参数（非法返回 null） */
function parseSearchWikiArguments(args: Record<string, unknown>): SearchWikiArguments | null {
    const query = args.query
    if (
        typeof query !== 'string' ||
        query.trim().length === 0 ||
        query.length > MCP_MAX_SEARCH_QUERY_LENGTH
    ) {
        return null
    }
    const caseSensitive = readOptionalBoolean(args, 'caseSensitive')
    const wholeWord = readOptionalBoolean(args, 'wholeWord')
    const useRegex = readOptionalBoolean(args, 'useRegex')
    const page = readPageOptions(args, MCP_DEFAULT_PAGE_LIMIT, MCP_MAX_PAGE_LIMIT)
    if (caseSensitive === null || wholeWord === null || useRegex === null || page === null) {
        return null
    }
    return { query: query.trim(), caseSensitive, wholeWord, useRegex, ...page }
}

/**
 * `search_wiki`：wiki/ 全文检索。
 *
 * 复用主进程 `searchWorkspace()`（L1 已把 raw/ 加入其忽略目录，且只搜工作区根），
 * 再过滤出 wiki/ 下的命中并按 limit/offset 分页。工作区级上限（500 匹配）可能截断，
 * 结果中通过 `truncated` 明确告知 Agent。
 */
async function searchWiki(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, [
        'query',
        'caseSensitive',
        'wholeWord',
        'useRegex',
        'limit',
        'offset'
    ])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const parsed = parseSearchWikiArguments(args)
    if (parsed === null) {
        return failureResult(
            'INVALID_ARGUMENTS',
            `query 必须是 1~${MCP_MAX_SEARCH_QUERY_LENGTH} 字符的字符串；limit/offset 必须为合法整数。`
        )
    }
    const result = await searchWorkspace({
        query: parsed.query,
        caseSensitive: parsed.caseSensitive,
        wholeWord: parsed.wholeWord,
        useRegex: parsed.useRegex,
        maxResults: MCP_MAX_SEARCH_MATCHES
    })
    if (!result.ok) {
        return failureResult(
            result.code === 'NO_WORKSPACE' ? 'NO_WORKSPACE' : 'INVALID_ARGUMENTS',
            result.code === 'NO_WORKSPACE'
                ? '当前未打开工作区：请先在白泽笔记中打开一个工作区。'
                : `检索失败：${result.code}`
        )
    }
    const matches: Array<{
        path: string
        line: number
        column: number
        preview: string
    }> = []
    for (const file of result.files) {
        if (!isWikiPage(file.relativePath)) {
            continue
        }
        for (const match of file.matches) {
            matches.push({
                path: normalizeSlashes(file.relativePath),
                line: match.line,
                column: match.column,
                preview: match.preview
            })
        }
    }
    const page = matches.slice(parsed.offset, parsed.offset + parsed.limit)
    return successResult({
        ok: true,
        query: parsed.query,
        total: matches.length,
        offset: parsed.offset,
        limit: parsed.limit,
        hasMore: parsed.offset + page.length < matches.length,
        truncated: result.truncated === true,
        results: page
    })
}

/** `read_page`：读取 wiki/ 页面（Markdown + front matter） */
async function readPage(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, ['path'])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const resolved = await resolveWorkspaceTextFile(args.path, LLM_WIKI_WIKI_DIR_NAME)
    if (!resolved.ok) {
        return failureResult(resolved.code, resolved.message)
    }
    const read = await readWorkspaceTextFile(resolved)
    if (!read.ok) {
        return failureResult(read.code, read.message)
    }
    const parsed = parseFrontMatter(read.content)
    const titleValue = parsed.data.title
    return successResult({
        ok: true,
        path: resolved.relativePath,
        title:
            typeof titleValue === 'string'
                ? titleValue
                : typeof titleValue === 'number'
                  ? String(titleValue)
                  : '',
        hasFrontMatter: parsed.present,
        frontMatter: parsed.present ? parsed.data : null,
        body: parsed.body,
        content: read.content,
        encoding: read.encoding,
        size: resolved.size,
        mtimeMs: resolved.mtimeMs
    })
}

/** `list_pages`：wiki/ 页面树（分页 + 可选子目录过滤） */
async function listPages(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, ['directory', 'limit', 'offset'])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const page = readPageOptions(args, MCP_DEFAULT_PAGE_LIMIT, MCP_MAX_PAGE_LIMIT)
    if (page === null) {
        return failureResult('INVALID_ARGUMENTS', 'limit/offset 必须为合法整数。')
    }
    let directoryPrefix = ''
    const rawDirectory = args.directory
    if (rawDirectory !== undefined && rawDirectory !== null) {
        if (
            typeof rawDirectory !== 'string' ||
            (rawDirectory.trim().length > 0 && normalizeRelativePathArgument(rawDirectory) === null)
        ) {
            return failureResult(
                'INVALID_ARGUMENTS',
                'directory 必须是 wiki/ 下的相对子目录（不能是绝对路径或包含 ..）。'
            )
        }
        const normalizedDirectory = rawDirectory.trim()
        if (normalizedDirectory.length > 0) {
            directoryPrefix = `${normalizeRelativePathArgument(normalizedDirectory)}/`
        }
    }
    const context = resolveWorkspaceContext()
    if (context === null) {
        return failureResult('NO_WORKSPACE', '当前未打开工作区：请先在白泽笔记中打开一个工作区。')
    }
    const snapshot = await getWorkspaceSnapshot(context.root)
    const wikiPages = snapshot.files.filter((file) => isWikiPage(file.relativePath))
    const filtered = wikiPages.filter(
        (file) =>
            directoryPrefix.length === 0 ||
            file.relativePath.startsWith(`${LLM_WIKI_WIKI_DIR_NAME}/${directoryPrefix}`)
    )
    const pageItems = filtered.slice(page.offset, page.offset + page.limit).map((file) => ({
        path: normalizeSlashes(file.relativePath),
        title: file.title,
        tags: file.tags,
        excerpt: file.excerpt ?? '',
        size: file.size,
        mtimeMs: file.mtimeMs
    }))
    const directories = [
        ...new Set(
            wikiPages.map((file) => getParentDirectory(toWikiRelativePath(file.relativePath)))
        )
    ].sort((left, right) => left.localeCompare(right))
    return successResult({
        ok: true,
        directory: directoryPrefix.length > 0 ? directoryPrefix.slice(0, -1) : '',
        total: filtered.length,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.offset + pageItems.length < filtered.length,
        directories,
        pages: pageItems
    })
}

/** `read_schema`：读取工作区根的 schema.md */
async function readSchema(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, [])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const context = resolveWorkspaceContext()
    if (context === null) {
        return failureResult('NO_WORKSPACE', '当前未打开工作区：请先在白泽笔记中打开一个工作区。')
    }
    const absolutePath = path.resolve(context.root, LLM_WIKI_SCHEMA_FILE_NAME)
    if (
        !isPathWithin(absolutePath, context.root, {
            win32CaseInsensitive: WIN32_CASE_INSENSITIVE
        }) ||
        !isPathAllowed(absolutePath)
    ) {
        return failureResult('PATH_DENIED', 'schema.md 路径未通过 Path Guard 校验。')
    }
    let stats
    try {
        stats = await fs.lstat(absolutePath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return successResult({
                ok: true,
                exists: false,
                path: LLM_WIKI_SCHEMA_FILE_NAME,
                hint: '当前工作区尚未初始化 LLM Wiki（schema.md 不存在）：可在白泽笔记「文件 → 初始化 LLM Wiki」生成。'
            })
        }
        return failureResult(
            'INTERNAL_ERROR',
            `读取 schema.md 状态失败：${String((error as Error)?.message ?? error)}`
        )
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
        return failureResult('PATH_DENIED', 'schema.md 不是普通文件（或为符号链接）。')
    }
    if (stats.size > MCP_MAX_TEXT_FILE_BYTES) {
        return failureResult(
            'FILE_TOO_LARGE',
            `schema.md 超过 ${MCP_MAX_TEXT_FILE_BYTES} 字节上限，已拒绝读取。`
        )
    }
    const resolved: ResolvedWorkspaceTextFile = {
        ok: true,
        root: context.root,
        absolutePath,
        relativePath: LLM_WIKI_SCHEMA_FILE_NAME,
        size: stats.size,
        mtimeMs: stats.mtimeMs
    }
    const read = await readWorkspaceTextFile(resolved)
    if (!read.ok) {
        return failureResult(read.code, read.message)
    }
    return successResult({
        ok: true,
        exists: true,
        path: LLM_WIKI_SCHEMA_FILE_NAME,
        content: read.content,
        encoding: read.encoding,
        size: resolved.size,
        mtimeMs: resolved.mtimeMs
    })
}

/** `list_tags`：wiki/ 标签与计数（分页） */
async function listTags(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, ['limit', 'offset'])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const page = readPageOptions(args, MCP_DEFAULT_TAG_LIMIT, MCP_MAX_TAG_LIMIT)
    if (page === null) {
        return failureResult('INVALID_ARGUMENTS', 'limit/offset 必须为合法整数。')
    }
    const context = resolveWorkspaceContext()
    if (context === null) {
        return failureResult('NO_WORKSPACE', '当前未打开工作区：请先在白泽笔记中打开一个工作区。')
    }
    const snapshot = await getWorkspaceSnapshot(context.root)
    const tagMap = new Map<string, { tag: string; count: number; files: string[] }>()
    for (const file of snapshot.files) {
        if (!isWikiPage(file.relativePath)) {
            continue
        }
        for (const tag of file.tags) {
            const key = tag.toLowerCase()
            const item = tagMap.get(key)
            if (item === undefined) {
                tagMap.set(key, {
                    tag,
                    count: 1,
                    files: [normalizeSlashes(file.relativePath)]
                })
            } else {
                item.count += 1
                item.files.push(normalizeSlashes(file.relativePath))
            }
        }
    }
    const tags = [...tagMap.values()].sort(
        (left, right) => right.count - left.count || left.tag.localeCompare(right.tag)
    )
    const pageItems = tags.slice(page.offset, page.offset + page.limit)
    return successResult({
        ok: true,
        total: tags.length,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.offset + pageItems.length < tags.length,
        tags: pageItems
    })
}

/** `get_backlinks`：入链 + 出链（双链图） */
async function getBacklinks(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, ['path'])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const resolved = await resolveWorkspaceTextFile(args.path, LLM_WIKI_WIKI_DIR_NAME)
    if (!resolved.ok) {
        return failureResult(resolved.code, resolved.message)
    }
    const context = resolveWorkspaceContext()
    if (context === null) {
        return failureResult('NO_WORKSPACE', '当前未打开工作区：请先在白泽笔记中打开一个工作区。')
    }
    const snapshot = await getWorkspaceSnapshot(context.root)
    const normalizedTarget = normalizeSlashes(resolved.relativePath).toLowerCase()
    const targetFile =
        snapshot.files.find(
            (file) => normalizeSlashes(file.relativePath).toLowerCase() === normalizedTarget
        ) ??
        snapshot.files.find((file) => {
            const relative = normalizeSlashes(file.relativePath).toLowerCase()
            return (
                relative === normalizedTarget ||
                relative.replace(/\.md$/i, '') === normalizedTarget.replace(/\.md$/i, '')
            )
        })
    if (targetFile === undefined) {
        return failureResult(
            'NOT_FOUND',
            `工作区索引中未找到该页面：${resolved.relativePath}（可能尚未被索引或不是文本页面）。`
        )
    }
    const backlinks = findBacklinks(snapshot, targetFile.path).map((backlink) => ({
        path: normalizeSlashes(backlink.sourceRelativePath),
        title: backlink.sourceTitle,
        line: backlink.line,
        column: backlink.column
    }))
    const links = targetFile.links.map((link) => ({
        target: link.target,
        raw: link.raw,
        line: link.line,
        column: link.column,
        status: link.status,
        resolvedPath:
            typeof link.resolvedPath === 'string'
                ? normalizeSlashes(path.relative(context.root, link.resolvedPath))
                : undefined
    }))
    return successResult({
        ok: true,
        path: normalizeSlashes(targetFile.relativePath),
        title: targetFile.title,
        backlinks,
        backlinkCount: backlinks.length,
        links
    })
}

/** `read_raw`：读取 raw/ 原始资料（只读） */
async function readRaw(args: Record<string, unknown>): Promise<McpToolCallResult> {
    const unknownArgument = findUnknownArgument(args, ['path'])
    if (unknownArgument !== null) {
        return failureResult('INVALID_ARGUMENTS', `不支持的参数：${unknownArgument}`)
    }
    const resolved = await resolveWorkspaceTextFile(args.path, LLM_WIKI_RAW_DIR_NAME)
    if (!resolved.ok) {
        return failureResult(resolved.code, resolved.message)
    }
    const read = await readWorkspaceTextFile(resolved)
    if (!read.ok) {
        return failureResult(read.code, read.message)
    }
    return successResult({
        ok: true,
        path: resolved.relativePath,
        content: read.content,
        encoding: read.encoding,
        size: resolved.size,
        mtimeMs: resolved.mtimeMs
    })
}

/* ============================ 执行入口 ============================ */

/** 工具名 → 执行函数（固定 7 个只读工具；未知工具不在此表） */
const TOOL_EXECUTORS: Readonly<
    Record<string, (args: Record<string, unknown>) => Promise<McpToolCallResult>>
> = {
    search_wiki: searchWiki,
    read_page: readPage,
    list_pages: listPages,
    read_schema: readSchema,
    list_tags: listTags,
    get_backlinks: getBacklinks,
    read_raw: readRaw
}

/** 工具定义列表（供 protocol 的 tools/list 使用） */
export function listMcpTools(): readonly McpToolDefinition[] {
    return MCP_TOOL_DEFINITIONS
}

/** 是否为已登记的只读工具名 */
export function isMcpToolName(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(TOOL_EXECUTORS, name)
}

/**
 * 执行 MCP 工具（唯一入口，导出便于单测直接断言）。
 *
 * @param name 工具名（必须是 7 个只读工具之一；未知工具返回 isError 结果，protocol 层另按
 *             JSON-RPC error 处理）
 * @param rawArgs JSON-RPC params.arguments（类型未知，内部严格归一化）
 * @returns MCP tools/call 结果（文本为 JSON；可预期失败 isError=true，不抛异常）
 */
export async function executeMcpTool(name: string, rawArgs: unknown): Promise<McpToolCallResult> {
    const executor = TOOL_EXECUTORS[name]
    if (executor === undefined) {
        return failureResult('INVALID_ARGUMENTS', `未知工具：${name}`)
    }
    const args = readArguments(rawArgs)
    if (args === null) {
        return failureResult('INVALID_ARGUMENTS', 'arguments 必须是 JSON 对象。')
    }
    // 审计日志：只记录工具名（不记录路径内容/令牌/正文，见 LOG 规范）
    logger.info(`[MCP] tools/call 调用只读工具：${name}`)
    try {
        return await executor(args)
    } catch (error) {
        logger.error(`[MCP] 工具执行异常：${name}`, error)
        return failureResult(
            'INTERNAL_ERROR',
            `工具执行异常：${String((error as Error)?.message ?? error)}`
        )
    }
}
