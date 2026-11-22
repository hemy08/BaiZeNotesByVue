/**
 * A2 全工作区搜索/替换服务（主进程，2026-11-21，默认开启）
 *
 * ## 职责
 * - `searchWorkspace()`：只搜索主进程持有的工作区根（`appState.rootPath`），渲染层不传根；
 * - `replaceWorkspace()`：对搜索命中的文件做替换并写盘（渲染层只传文件路径，主进程重新校验）。
 *
 * ## 安全边界（不信任渲染层入参）
 * 1. 工作区根只取 `appState.rootPath`（由主进程目录选择/启动恢复设置），非法即 NO_WORKSPACE；
 * 2. 递归扫描跳过依赖/VCS/敏感目录（`node_modules`、`.git` 等）与**符号链接**
 *    （防符号链接逃逸与目录环），子目录进入前再做 realpath 逃逸校验；
 * 3. 只读取 `.md/.markdown/.txt`；单文件超过 2 MiB 跳过；匹配总数 500、
 *    扫描文件数 2 万、文件清单 2000 上限，超限置 `truncated`；
 * 4. 替换前逐路径校验「绝对路径 + 位于工作区根内 + 非忽略目录 + 文本扩展名 +
 *    非符号链接 + realpath 不逃逸」，**全部校验通过后才写盘**；写盘前重新读取文件，
 *    单处替换位置失效返回 FILE_CHANGED（不误删内容）；
 * 5. 所有可预期失败返回结构化 `{ ok: false, code }`，不向渲染层抛异常/堆栈。
 *
 * ## 与目录树扫描的区别
 * 目录树（directory-tree-scan.ts）用于 UI 展示（含图片/PDF，不读正文）；本服务面向全文检索，
 * 只读取文本正文，且上限与忽略目录口径更严格（额外排除 `.ssh/.gnupg` 等敏感目录），
 * 因此独立实现、互不影响。敏感目录清单只在本文件维护（特性内单真源）。
 */
import * as fs from 'fs'
import type { Dirent } from 'fs'
import * as path from 'path'
import { appState } from './app-state'
import { logger } from './logger'
import { isPathWithin, normalizeSlashes } from '../../shared/utils/path'
import type {
    WorkspaceFileEntry,
    WorkspaceReplaceFileResult,
    WorkspaceReplaceResult,
    WorkspaceSearchFileResult,
    WorkspaceSearchMatch,
    WorkspaceSearchResult
} from '../../shared/types/ipc'

/** 允许全文搜索/替换的文本扩展名（小写带点，大小写不敏感比较） */
export const WORKSPACE_SEARCH_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt']

/** 扫描时跳过的目录名（依赖/VCS/IDE/凭据类目录；命中任意层级即跳过） */
export const WORKSPACE_SEARCH_IGNORED_DIRS: ReadonlySet<string> = new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.bzr',
    '.idea',
    '.vscode',
    // 敏感凭据目录：即使工作区误选到用户主目录也不读取
    '.ssh',
    '.gnupg',
    '.aws',
    '.azure',
    '.kube',
    '.docker'
])

/** 匹配结果总上限（跨文件累计） */
export const MAX_WORKSPACE_SEARCH_MATCHES = 500
/** 单个文件参与搜索的大小上限（2 MiB，超过跳过） */
export const MAX_WORKSPACE_SEARCH_FILE_BYTES = 2 * 1024 * 1024
/** Quick Open 文件清单上限 */
export const MAX_WORKSPACE_FILE_LIST = 2000
/** 单次搜索最多扫描的文本文件数（防超大工作区长时间占用主进程） */
export const MAX_WORKSPACE_SEARCH_SCANNED_FILES = 20_000
/** 目录递归深度上限（防异常目录结构/挂载点环） */
export const MAX_WORKSPACE_SCAN_DEPTH = 32
/** 查询文本长度上限 */
export const MAX_WORKSPACE_SEARCH_QUERY_LENGTH = 512
/** 单次替换请求最多涉及的文件数 */
export const MAX_WORKSPACE_REPLACE_FILES = 500
/** 替换文本长度上限 */
export const MAX_WORKSPACE_REPLACE_TEXT_LENGTH = 4096
/** 搜索结果行预览最大字符数 */
export const WORKSPACE_SEARCH_PREVIEW_MAX = 200

/** B2 指标：慢搜索日志阈值（仅观测；不改变搜索结果/上限） */
export const SLOW_WORKSPACE_SEARCH_LOG_MS = 500

/** Windows 下路径比较大小写不敏感（与 app 其余路径判定口径一致） */
const WIN32_CASE_INSENSITIVE = process.platform === 'win32'
/** 设备命名空间前缀（\\?\ / \\.\ 等一律拒绝，防绕过路径校验） */
const DEVICE_NAMESPACE_PATTERN = /^[\\/]{2}[.?!]/
/** 整词匹配使用的「单词字符」（Unicode 字母/数字 + 下划线 + $，与常见编辑器口径接近） */
const WORD_CHAR_PATTERN = /[\p{L}\p{N}_$]/u

/** 工作区根（词法绝对路径 + realpath 物理路径） */
interface WorkspaceRoots {
    /** path.resolve 后的工作区根（用于词法 containment 判定） */
    lexical: string
    /** fs.realpath 后的工作区根（用于符号链接逃逸判定） */
    real: string
}

/** 单行内的匹配区间（行内 0-based 偏移；groups 为正则捕获组） */
interface MatchRange {
    index: number
    length: number
    groups: string[]
}

/** 已编译的查询匹配器 */
interface CompiledMatcher {
    /** 在单行内查找全部匹配（整词过滤已内置） */
    find: (line: string) => MatchRange[]
}

/** 查询条件（搜索与替换共用的归一化结果） */
interface NormalizedCriteria {
    query: string
    caseSensitive: boolean
    wholeWord: boolean
    useRegex: boolean
}

/** 路径校验通过的目标文件 */
interface ReplaceTarget {
    filePath: string
    relativePath: string
}

/** 写盘前的替换计划（先在内存计算，全部成功后再统一写盘） */
interface ReplacePlan extends ReplaceTarget {
    content: string
    replacements: number
}

/** 归一化的搜索选项 */
interface NormalizedSearchOptions extends NormalizedCriteria {
    listFilesOnly: boolean
    maxResults: number
}

/* ============================ 通用工具 ============================ */

/** 归一化相对路径用于展示（统一正斜杠） */
function toRelativePathDisplay(root: string, filePath: string): string {
    return normalizeSlashes(path.relative(root, filePath))
}

/** 是否文本扩展名（大小写不敏感） */
function isSearchableTextFile(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase()
    return WORKSPACE_SEARCH_EXTENSIONS.includes(extension)
}

/** 路径段中是否命中忽略目录（用于替换入参的补充校验） */
function hasIgnoredDirectorySegment(relativePath: string): boolean {
    return relativePath
        .split(/[\\/]+/)
        .some((segment) => segment.length > 0 && WORKSPACE_SEARCH_IGNORED_DIRS.has(segment))
}

/**
 * 解析工作区根（唯一真源 appState.rootPath）。
 * 非法/不存在/不是目录时返回 null（上层返回 NO_WORKSPACE）。
 */
function resolveWorkspaceRoots(): WorkspaceRoots | null {
    const raw = appState.rootPath
    if (typeof raw !== 'string') {
        return null
    }
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed.includes('\u0000')) {
        return null
    }
    if (!path.isAbsolute(trimmed) || DEVICE_NAMESPACE_PATTERN.test(trimmed)) {
        return null
    }
    const lexical = path.resolve(trimmed)
    // 拒绝文件系统根（盘符根 / POSIX 根）作为工作区搜索根（范围过大且不属于「打开的工作区」）
    if (lexical === path.parse(lexical).root) {
        return null
    }
    try {
        const stats = fs.statSync(lexical)
        if (!stats.isDirectory()) {
            return null
        }
        return { lexical, real: fs.realpathSync(lexical) }
    } catch {
        return null
    }
}

/** 子目录/文件真实路径是否仍位于工作区 realpath 内（阻断符号链接/junction 逃逸） */
function isRealPathInsideWorkspace(targetPath: string, roots: WorkspaceRoots): boolean {
    try {
        const real = fs.realpathSync(targetPath)
        return isPathWithin(real, roots.real, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })
    } catch {
        // 无法解析（权限/竞态删除）按不可信处理
        return false
    }
}

/** 读取文件状态（失败返回 null，调用方按跳过/拒绝处理） */
async function statIfRegularFile(
    filePath: string
): Promise<{ size: number; isFile: boolean; isSymbolicLink: boolean } | null> {
    try {
        const stats = await fs.promises.lstat(filePath)
        return {
            size: stats.size,
            isFile: stats.isFile(),
            isSymbolicLink: stats.isSymbolicLink()
        }
    } catch {
        return null
    }
}

/** 生成单行预览（超长截断并加省略号） */
function buildPreview(line: string): string {
    return line.length > WORKSPACE_SEARCH_PREVIEW_MAX
        ? `${line.slice(0, WORKSPACE_SEARCH_PREVIEW_MAX)}…`
        : line
}

/** 指定位置是否为单词字符（越界视为非单词字符） */
function isWordCharAt(line: string, index: number): boolean {
    if (index < 0 || index >= line.length) {
        return false
    }
    return WORD_CHAR_PATTERN.test(line[index])
}

/** 匹配区间是否满足整词条件（左右均不是单词字符） */
function isWholeWordRange(line: string, index: number, length: number): boolean {
    return !isWordCharAt(line, index - 1) && !isWordCharAt(line, index + length)
}

/* ============================ 查询与匹配 ============================ */

/**
 * 编译查询匹配器。
 * 返回 null 表示查询非法：`INVALID_QUERY`（空/超长/非字符串）或 `INVALID_REGEX`（正则语法错误）。
 */
function compileMatcher(
    criteria: NormalizedCriteria
): { ok: true; matcher: CompiledMatcher } | { ok: false; code: 'INVALID_QUERY' | 'INVALID_REGEX' } {
    const { query, caseSensitive, wholeWord, useRegex } = criteria
    if (typeof query !== 'string') {
        return { ok: false, code: 'INVALID_QUERY' }
    }
    const trimmed = query.trim()
    if (trimmed.length === 0 || trimmed.length > MAX_WORKSPACE_SEARCH_QUERY_LENGTH) {
        return { ok: false, code: 'INVALID_QUERY' }
    }
    if (!useRegex) {
        const needle = caseSensitive ? trimmed : trimmed.toLowerCase()
        return {
            ok: true,
            matcher: {
                find: (line: string): MatchRange[] => {
                    const haystack = caseSensitive ? line : line.toLowerCase()
                    const ranges: MatchRange[] = []
                    let from = 0
                    while (from <= haystack.length - needle.length) {
                        const index = haystack.indexOf(needle, from)
                        if (index < 0) {
                            break
                        }
                        if (!wholeWord || isWholeWordRange(line, index, needle.length)) {
                            ranges.push({ index, length: needle.length, groups: [] })
                        }
                        from = index + Math.max(needle.length, 1)
                    }
                    return ranges
                }
            }
        }
    }
    let regex: RegExp
    try {
        regex = new RegExp(trimmed, caseSensitive ? 'gm' : 'gim')
    } catch {
        return { ok: false, code: 'INVALID_REGEX' }
    }
    return {
        ok: true,
        matcher: {
            find: (line: string): MatchRange[] => {
                const ranges: MatchRange[] = []
                regex.lastIndex = 0
                let match: RegExpExecArray | null
                // 防御零宽匹配死循环：零宽命中时手动推进 lastIndex
                let guard = 0
                while ((match = regex.exec(line)) !== null && guard < 100_000) {
                    guard += 1
                    if (match[0].length === 0) {
                        regex.lastIndex += 1
                        continue
                    }
                    if (!wholeWord || isWholeWordRange(line, match.index, match[0].length)) {
                        ranges.push({
                            index: match.index,
                            length: match[0].length,
                            groups: match
                                .slice(1)
                                .map((group) => (typeof group === 'string' ? group : ''))
                        })
                    }
                }
                return ranges
            }
        }
    }
}

/** 归一化查询条件（布尔字段严格按 === true 处理，字符串必须为 string） */
function normalizeCriteria(raw: Record<string, unknown>): NormalizedCriteria {
    return {
        query: typeof raw.query === 'string' ? raw.query : '',
        caseSensitive: raw.caseSensitive === true,
        wholeWord: raw.wholeWord === true,
        useRegex: raw.useRegex === true
    }
}

/** 归一化搜索选项（maxResults 钳制到 [1, 实现上限]） */
function normalizeSearchOptions(raw: Record<string, unknown>): NormalizedSearchOptions {
    const maxResultsRaw = raw.maxResults
    const maxResults =
        typeof maxResultsRaw === 'number' && Number.isFinite(maxResultsRaw)
            ? Math.min(Math.max(Math.trunc(maxResultsRaw), 1), MAX_WORKSPACE_SEARCH_MATCHES)
            : MAX_WORKSPACE_SEARCH_MATCHES
    return {
        ...normalizeCriteria(raw),
        listFilesOnly: raw.listFilesOnly === true,
        maxResults
    }
}

/* ============================ 搜索 ============================ */

/** 搜索遍历状态（跨递归累计 + 提前终止标记） */
interface SearchWalkState {
    files: WorkspaceSearchFileResult[]
    matchCount: number
    truncated: boolean
    scannedFiles: number
    maxResults: number
}

/** 单个文件内收集匹配（超限时置 truncated 并保留已收集部分） */
async function searchSingleFile(
    filePath: string,
    roots: WorkspaceRoots,
    state: SearchWalkState,
    matcher: CompiledMatcher
): Promise<void> {
    const stats = await statIfRegularFile(filePath)
    // 符号链接/非普通文件/空文件/超过大小上限：跳过（不读正文）
    if (!stats || !stats.isFile || stats.isSymbolicLink || stats.size === 0) {
        return
    }
    if (stats.size > MAX_WORKSPACE_SEARCH_FILE_BYTES) {
        logger.debug(`[WorkspaceSearch] 跳过超过大小上限的文件：${filePath}`)
        return
    }
    let content: string
    try {
        content = await fs.promises.readFile(filePath, 'utf-8')
    } catch (error) {
        logger.warn('[WorkspaceSearch] 读取文件失败，已跳过：', filePath, error)
        return
    }
    const lines = content.split(/\r\n|\r|\n/)
    const matches: WorkspaceSearchMatch[] = []
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (line.length === 0) {
            continue
        }
        for (const range of matcher.find(line)) {
            if (state.matchCount >= state.maxResults) {
                state.truncated = true
                break
            }
            matches.push({ line: index + 1, column: range.index + 1, preview: buildPreview(line) })
            state.matchCount += 1
        }
        if (state.truncated) {
            break
        }
    }
    if (matches.length > 0) {
        state.files.push({
            filePath,
            relativePath: toRelativePathDisplay(roots.lexical, filePath),
            matches
        })
    }
}

/** 递归搜索目录（符号链接与忽略目录一律跳过；子目录做 realpath 逃逸校验） */
async function walkSearchDirectory(
    dirPath: string,
    roots: WorkspaceRoots,
    state: SearchWalkState,
    matcher: CompiledMatcher,
    depth: number
): Promise<void> {
    if (state.truncated) {
        return
    }
    let entries: Dirent[]
    try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    } catch (error) {
        logger.warn('[WorkspaceSearch] 读取目录失败，已跳过：', dirPath, error)
        return
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
        if (state.truncated) {
            return
        }
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isSymbolicLink()) {
            // 符号链接一律跳过：防止逃逸出工作区与目录环
            continue
        }
        if (entry.isDirectory()) {
            if (WORKSPACE_SEARCH_IGNORED_DIRS.has(entry.name)) {
                continue
            }
            if (depth >= MAX_WORKSPACE_SCAN_DEPTH) {
                state.truncated = true
                return
            }
            if (!isRealPathInsideWorkspace(fullPath, roots)) {
                continue
            }
            await walkSearchDirectory(fullPath, roots, state, matcher, depth + 1)
            continue
        }
        if (!entry.isFile() || !isSearchableTextFile(entry.name)) {
            continue
        }
        if (state.scannedFiles >= MAX_WORKSPACE_SEARCH_SCANNED_FILES) {
            state.truncated = true
            return
        }
        state.scannedFiles += 1
        await searchSingleFile(fullPath, roots, state, matcher)
    }
}

/** 空搜索结果（失败分支共用；避免每处重复字面量） */
function failedSearchResult(code: WorkspaceSearchResult['code']): WorkspaceSearchResult {
    return { ok: false, code, files: [], truncated: false, matchCount: 0, scannedFiles: 0 }
}

/** Quick Open：只列出工作区文本文件（不读正文） */
async function listWorkspaceTextFiles(roots: WorkspaceRoots): Promise<WorkspaceSearchResult> {
    const fileList: WorkspaceFileEntry[] = []
    let truncated = false

    const walk = async (dirPath: string, depth: number): Promise<void> => {
        if (truncated) {
            return
        }
        let entries: Dirent[]
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
        } catch (error) {
            logger.warn('[WorkspaceSearch] 列出目录失败，已跳过：', dirPath, error)
            return
        }
        entries.sort((left, right) => left.name.localeCompare(right.name))
        for (const entry of entries) {
            if (truncated) {
                return
            }
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isSymbolicLink()) {
                continue
            }
            if (entry.isDirectory()) {
                if (WORKSPACE_SEARCH_IGNORED_DIRS.has(entry.name)) {
                    continue
                }
                if (depth >= MAX_WORKSPACE_SCAN_DEPTH) {
                    truncated = true
                    return
                }
                if (!isRealPathInsideWorkspace(fullPath, roots)) {
                    continue
                }
                await walk(fullPath, depth + 1)
                continue
            }
            if (!entry.isFile() || !isSearchableTextFile(entry.name)) {
                continue
            }
            if (fileList.length >= MAX_WORKSPACE_FILE_LIST) {
                truncated = true
                return
            }
            fileList.push({
                filePath: fullPath,
                relativePath: toRelativePathDisplay(roots.lexical, fullPath)
            })
        }
    }

    await walk(roots.lexical, 0)
    return {
        ok: true,
        files: [],
        fileList,
        truncated,
        matchCount: 0,
        scannedFiles: fileList.length
    }
}

/**
 * 搜索工作区文本文件内容（FILE.SEARCH_WORKSPACE 的主进程实现）。
 *
 * @param rawOptions 渲染层入参（类型未知，内部归一化；只接受查询条件，不接受根路径）
 * @returns 结构化结果；所有可预期失败以 `ok:false + code` 返回，不抛异常
 */
export async function searchWorkspace(rawOptions: unknown): Promise<WorkspaceSearchResult> {
    const startedAt = Date.now()
    try {
        const roots = resolveWorkspaceRoots()
        if (!roots) {
            return failedSearchResult('NO_WORKSPACE')
        }
        const raw =
            rawOptions && typeof rawOptions === 'object'
                ? (rawOptions as Record<string, unknown>)
                : {}
        const options = normalizeSearchOptions(raw)
        if (options.listFilesOnly) {
            return await listWorkspaceTextFiles(roots)
        }
        const compiled = compileMatcher(options)
        if (!compiled.ok) {
            return failedSearchResult(compiled.code)
        }
        const state: SearchWalkState = {
            files: [],
            matchCount: 0,
            truncated: false,
            scannedFiles: 0,
            maxResults: options.maxResults
        }
        await walkSearchDirectory(roots.lexical, roots, state, compiled.matcher, 0)
        const elapsedMs = Date.now() - startedAt
        // B2 指标：只记录聚合耗时，不记录查询词/文件内容；慢搜索用于判断是否需要持久索引
        if (elapsedMs >= SLOW_WORKSPACE_SEARCH_LOG_MS) {
            logger.info(
                `[B2] 工作区按需搜索较慢：${elapsedMs}ms / 扫描 ${state.scannedFiles} 文件 / 命中 ${state.matchCount} / truncated=${state.truncated}`
            )
        }
        return {
            ok: true,
            files: state.files,
            truncated: state.truncated,
            matchCount: state.matchCount,
            scannedFiles: state.scannedFiles,
            elapsedMs
        }
    } catch (error) {
        logger.error('[WorkspaceSearch] 工作区搜索异常：', error)
        return failedSearchResult('INTERNAL_ERROR')
    }
}

/* ============================ 替换 ============================ */

/** 失败替换结果（统一构造，避免遗漏字段） */
function failedReplaceResult(
    code: WorkspaceReplaceResult['code'],
    files: WorkspaceReplaceFileResult[] = []
): WorkspaceReplaceResult {
    return {
        ok: false,
        code,
        files,
        totalReplacements: files.reduce((sum, file) => sum + file.replacements, 0)
    }
}

/**
 * 展开替换文本中的回填占位（`$$` → `$`、`$&` → 完整匹配、`$1`~`$99` → 捕获组）。
 * 未知占位原样保留，避免误吞用户输入。
 */
export function expandReplacementText(
    template: string,
    matchedText: string,
    groups: readonly string[]
): string {
    return template.replace(/\$(\$|&|\d{1,2})/g, (placeholder, token: string) => {
        if (token === '$') {
            return '$'
        }
        if (token === '&') {
            return matchedText
        }
        const groupIndex = Number(token)
        if (groupIndex >= 1 && groupIndex <= groups.length) {
            return groups[groupIndex - 1] ?? ''
        }
        return placeholder
    })
}

/** 把单行内的若干匹配区间替换为替换文本（从右向左拼接，保证偏移不互相影响） */
function replaceRangesInLine(
    line: string,
    ranges: readonly MatchRange[],
    replacement: string
): string {
    let result = line
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
        const range = ranges[index]
        const matchedText = line.slice(range.index, range.index + range.length)
        const replacementText = expandReplacementText(replacement, matchedText, range.groups)
        result =
            result.slice(0, range.index) +
            replacementText +
            result.slice(range.index + range.length)
    }
    return result
}

/** 检测内容的主要行尾（替换后按原行尾拼回，避免把 CRLF 文件整体改成 LF） */
function detectLineEnding(content: string): '\r\n' | '\r' | '\n' {
    if (content.includes('\r\n')) {
        return '\r\n'
    }
    if (content.includes('\r')) {
        return '\r'
    }
    return '\n'
}

/**
 * 在文件内容上计算替换结果（不写盘）。
 *
 * @param content 文件当前内容（调用方已重新读取）
 * @param matcher 查询匹配器
 * @param replacement 替换文本
 * @param single 单处替换目标（line 1-based；column 1-based，缺省取该行首个匹配）
 * @returns 新内容与实际替换次数；单处替换未命中返回 replacements=0（由调用方判 FILE_CHANGED）
 */
function computeReplacedContent(
    content: string,
    matcher: CompiledMatcher,
    replacement: string,
    single?: { line: number; column?: number }
): { content: string; replacements: number } {
    const lineEnding = detectLineEnding(content)
    const lines = content.split(/\r\n|\r|\n/)
    let replacements = 0
    if (single) {
        const lineIndex = single.line - 1
        if (lineIndex < 0 || lineIndex >= lines.length) {
            return { content, replacements: 0 }
        }
        const ranges = matcher.find(lines[lineIndex])
        const requestedColumn = single.column
        const targetRanges =
            requestedColumn === undefined
                ? ranges.slice(0, 1)
                : ranges.filter((range) => range.index === requestedColumn - 1)
        if (targetRanges.length === 0) {
            return { content, replacements: 0 }
        }
        lines[lineIndex] = replaceRangesInLine(lines[lineIndex], targetRanges, replacement)
        replacements = targetRanges.length
        return { content: lines.join(lineEnding), replacements }
    }
    for (let index = 0; index < lines.length; index += 1) {
        const ranges = matcher.find(lines[index])
        if (ranges.length === 0) {
            continue
        }
        lines[index] = replaceRangesInLine(lines[index], ranges, replacement)
        replacements += ranges.length
    }
    return { content: lines.join(lineEnding), replacements }
}

/**
 * 校验渲染层传入的文件路径：必须为工作区根内的普通文本文件（词法校验；realpath/符号链接
 * 校验由调用方在异步阶段补充）。
 */
function resolveReplaceCandidate(input: unknown, roots: WorkspaceRoots): ReplaceTarget | null {
    if (typeof input !== 'string') {
        return null
    }
    const raw = input.trim()
    if (raw.length === 0 || raw.includes('\u0000') || !path.isAbsolute(raw)) {
        return null
    }
    if (DEVICE_NAMESPACE_PATTERN.test(raw)) {
        return null
    }
    const resolved = path.resolve(raw)
    if (resolved === roots.lexical) {
        return null
    }
    if (!isPathWithin(resolved, roots.lexical, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })) {
        return null
    }
    const relative = path.relative(roots.lexical, resolved)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return null
    }
    if (hasIgnoredDirectorySegment(relative)) {
        return null
    }
    if (!isSearchableTextFile(resolved)) {
        return null
    }
    return { filePath: resolved, relativePath: normalizeSlashes(relative) }
}

/** 异步补全校验：普通文件、非符号链接、realpath 不逃逸 */
async function verifyReplaceTarget(target: ReplaceTarget, roots: WorkspaceRoots): Promise<boolean> {
    const stats = await statIfRegularFile(target.filePath)
    if (!stats || !stats.isFile || stats.isSymbolicLink) {
        return false
    }
    return isRealPathInsideWorkspace(target.filePath, roots)
}

/** 解析替换选项中的单处替换位置（line/column 必须为正整数，否则 INVALID_INPUT） */
function readSingleTarget(raw: Record<string, unknown>): {
    single?: { line: number; column?: number }
    invalid: boolean
} {
    if (raw.line === undefined && raw.column === undefined) {
        return { invalid: false }
    }
    const line = raw.line
    if (typeof line !== 'number' || !Number.isInteger(line) || line < 1) {
        return { invalid: true }
    }
    const column = raw.column
    if (
        column !== undefined &&
        (typeof column !== 'number' || !Number.isInteger(column) || column < 1)
    ) {
        return { invalid: true }
    }
    return {
        single: { line, column: typeof column === 'number' ? column : undefined },
        invalid: false
    }
}

/**
 * 替换工作区文本文件内容（FILE.REPLACE_WORKSPACE 的主进程实现）。
 *
 * 流程：入参归一化 → 逐文件路径安全校验 → 重新读取并内存计算 → 全部成功才写盘。
 * 任一文件校验失败/内容已变化（单处替换位置失效）时不写任何文件。
 *
 * @param rawOptions 渲染层入参（类型未知；不接受根路径）
 */
export async function replaceWorkspace(rawOptions: unknown): Promise<WorkspaceReplaceResult> {
    try {
        const roots = resolveWorkspaceRoots()
        if (!roots) {
            return failedReplaceResult('NO_WORKSPACE')
        }
        if (!rawOptions || typeof rawOptions !== 'object') {
            return failedReplaceResult('INVALID_INPUT')
        }
        const raw = rawOptions as Record<string, unknown>
        const replacement = raw.replacement
        if (
            typeof replacement !== 'string' ||
            replacement.length > MAX_WORKSPACE_REPLACE_TEXT_LENGTH
        ) {
            return failedReplaceResult('INVALID_INPUT')
        }
        const rawFilePaths = raw.filePaths
        if (
            !Array.isArray(rawFilePaths) ||
            rawFilePaths.length === 0 ||
            rawFilePaths.length > MAX_WORKSPACE_REPLACE_FILES
        ) {
            return failedReplaceResult('INVALID_INPUT')
        }
        const singleTarget = readSingleTarget(raw)
        if (singleTarget.invalid) {
            return failedReplaceResult('INVALID_INPUT')
        }
        const criteria = normalizeCriteria(raw)
        const compiled = compileMatcher(criteria)
        if (!compiled.ok) {
            return failedReplaceResult(
                compiled.code === 'INVALID_QUERY' ? 'INVALID_QUERY' : 'INVALID_REGEX'
            )
        }

        // 1) 词法校验 + 去重（任一非法路径整体拒绝，不做部分写入）
        const targets: ReplaceTarget[] = []
        const seen = new Set<string>()
        for (const filePath of rawFilePaths) {
            const candidate = resolveReplaceCandidate(filePath, roots)
            if (!candidate) {
                logger.warn('[WorkspaceSearch] 替换请求包含工作区外/非法路径，已整体拒绝')
                return failedReplaceResult('PATH_DENIED')
            }
            const key = normalizeSlashes(candidate.filePath).toLowerCase()
            if (seen.has(key)) {
                continue
            }
            seen.add(key)
            targets.push(candidate)
        }

        // 2) 异步安全校验 + 重新读取并计算替换（不写盘）
        const plans: ReplacePlan[] = []
        let changedTarget = false
        for (const target of targets) {
            if (!(await verifyReplaceTarget(target, roots))) {
                logger.warn(
                    '[WorkspaceSearch] 替换目标不是工作区内普通文件，已整体拒绝：',
                    target.relativePath
                )
                return failedReplaceResult('PATH_DENIED')
            }
            let content: string
            try {
                content = await fs.promises.readFile(target.filePath, 'utf-8')
            } catch (error) {
                logger.error('[WorkspaceSearch] 替换前读取文件失败：', target.filePath, error)
                return failedReplaceResult('WRITE_FAILED')
            }
            const result = computeReplacedContent(
                content,
                compiled.matcher,
                replacement,
                singleTarget.single
            )
            if (result.replacements === 0) {
                // 单处替换位置失效（文件已被外部修改/查询条件变化）：明确报错，避免误写
                if (singleTarget.single) {
                    changedTarget = true
                }
                continue
            }
            plans.push({
                filePath: target.filePath,
                relativePath: target.relativePath,
                content: result.content,
                replacements: result.replacements
            })
        }
        if (singleTarget.single && (changedTarget || plans.length === 0)) {
            return failedReplaceResult('FILE_CHANGED')
        }
        if (plans.length === 0) {
            return failedReplaceResult('NO_MATCH')
        }

        // 3) 写盘（逐个文件；失败时返回已写入部分，便于渲染层提示用户）
        const written: WorkspaceReplaceFileResult[] = []
        for (const plan of plans) {
            try {
                await fs.promises.writeFile(plan.filePath, plan.content, 'utf-8')
            } catch (error) {
                logger.error('[WorkspaceSearch] 替换写盘失败：', plan.filePath, error)
                return failedReplaceResult('WRITE_FAILED', written)
            }
            written.push({
                filePath: plan.filePath,
                relativePath: plan.relativePath,
                replacements: plan.replacements
            })
        }
        const totalReplacements = written.reduce((sum, file) => sum + file.replacements, 0)
        logger.info(
            '[WorkspaceSearch] 工作区替换完成：文件数=',
            written.length,
            '替换数=',
            totalReplacements
        )
        return { ok: true, files: written, totalReplacements }
    } catch (error) {
        logger.error('[WorkspaceSearch] 工作区替换异常：', error)
        return failedReplaceResult('INTERNAL_ERROR')
    }
}
