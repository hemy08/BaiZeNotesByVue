/**
 * A2 工作区搜索/替换 —— 渲染层纯函数工具（2026-11-21）
 *
 * 只做「渲染层 UI 状态 ↔ IPC 契约」的纯数据转换与过滤，不访问 IPC/DOM/Vue 响应式，
 * 便于单测直接覆盖（组件与 composable 只做接线）：
 * - 搜索条件 → FILE.SEARCH_WORKSPACE 请求载荷；
 * - 主进程返回的原始 IPC 结果 → 防御性归一化（丢弃畸形项，非法响应转为结构化失败）；
 * - 单处/全部替换请求载荷构造；
 * - Quick Open 文件清单的本地过滤（子串优先、子序列兜底）；
 * - 列表键盘导航索引计算。
 */
import type {
    WorkspaceFileEntry,
    WorkspaceReplaceOptions,
    WorkspaceReplaceResult,
    WorkspaceSearchFileResult,
    WorkspaceSearchMatch,
    WorkspaceSearchOptions,
    WorkspaceSearchResult
} from '../../../../shared/types/ipc'

/** 渲染层搜索条件（UI 三个复选框） */
export interface WorkspaceSearchCriteria {
    /** 区分大小写 */
    caseSensitive: boolean
    /** 整词匹配 */
    wholeWord: boolean
    /** 正则搜索 */
    useRegex: boolean
}

/** 默认搜索条件（全部关闭：不区分大小写、非整词、非正则） */
export const DEFAULT_WORKSPACE_SEARCH_CRITERIA: WorkspaceSearchCriteria = {
    caseSensitive: false,
    wholeWord: false,
    useRegex: false
}

/** 工作区搜索输入防抖间隔（毫秒）：用户停止输入后自动搜索 */
export const WORKSPACE_SEARCH_DEBOUNCE_MS = 300

/** 构造搜索请求载荷（query 原样传递，主进程负责长度/空值校验与错误码） */
export function buildWorkspaceSearchOptions(
    query: string,
    criteria: WorkspaceSearchCriteria,
    extra: { listFilesOnly?: boolean; maxResults?: number } = {}
): WorkspaceSearchOptions {
    const options: WorkspaceSearchOptions = {
        query,
        caseSensitive: criteria.caseSensitive === true,
        wholeWord: criteria.wholeWord === true,
        useRegex: criteria.useRegex === true
    }
    if (extra.listFilesOnly === true) {
        options.listFilesOnly = true
    }
    if (typeof extra.maxResults === 'number' && Number.isFinite(extra.maxResults)) {
        options.maxResults = extra.maxResults
    }
    return options
}

/** 构造单处替换请求载荷（line/column 均 1-based，来自搜索结果） */
export function buildReplaceOneOptions(params: {
    query: string
    criteria: WorkspaceSearchCriteria
    replacement: string
    filePath: string
    line: number
    column: number
}): WorkspaceReplaceOptions {
    return {
        query: params.query,
        caseSensitive: params.criteria.caseSensitive === true,
        wholeWord: params.criteria.wholeWord === true,
        useRegex: params.criteria.useRegex === true,
        replacement: params.replacement,
        filePaths: [params.filePath],
        line: params.line,
        column: params.column
    }
}

/** 构造全部替换请求载荷（对给定文件列表做全部匹配替换） */
export function buildReplaceAllOptions(params: {
    query: string
    criteria: WorkspaceSearchCriteria
    replacement: string
    filePaths: readonly string[]
}): WorkspaceReplaceOptions {
    return {
        query: params.query,
        caseSensitive: params.criteria.caseSensitive === true,
        wholeWord: params.criteria.wholeWord === true,
        useRegex: params.criteria.useRegex === true,
        replacement: params.replacement,
        filePaths: [...params.filePaths]
    }
}

/** 原始 IPC 返回值是否为对象 */
function asRecord(raw: unknown): Record<string, unknown> | null {
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
}

/** 归一化单个文件条目（畸形返回 null） */
function normalizeFileEntry(raw: unknown): WorkspaceFileEntry | null {
    const record = asRecord(raw)
    if (!record) {
        return null
    }
    const { filePath, relativePath } = record
    if (typeof filePath !== 'string' || filePath.length === 0) {
        return null
    }
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
        return null
    }
    return { filePath, relativePath }
}

/** 归一化单条匹配（行/列必须为正整数，预览字符串化） */
function normalizeSearchMatch(raw: unknown): WorkspaceSearchMatch | null {
    const record = asRecord(raw)
    if (!record) {
        return null
    }
    const { line, column, preview } = record
    if (typeof line !== 'number' || !Number.isInteger(line) || line < 1) {
        return null
    }
    if (typeof column !== 'number' || !Number.isInteger(column) || column < 1) {
        return null
    }
    return {
        line,
        column,
        preview: typeof preview === 'string' ? preview : ''
    }
}

/** 归一化单个文件的搜索结果（无有效匹配则丢弃该文件） */
function normalizeSearchFileResult(raw: unknown): WorkspaceSearchFileResult | null {
    const entry = normalizeFileEntry(raw)
    const record = asRecord(raw)
    if (!entry || !record || !Array.isArray(record.matches)) {
        return null
    }
    const matches: WorkspaceSearchMatch[] = []
    for (const item of record.matches) {
        const match = normalizeSearchMatch(item)
        if (match) {
            matches.push(match)
        }
    }
    if (matches.length === 0) {
        return null
    }
    return { ...entry, matches }
}

/** 搜索失败兜底结构（非法/畸形 IPC 响应统一按 SEARCH_FAILED 处理） */
export function failedWorkspaceSearchResult(
    code: WorkspaceSearchResult['code'] = 'SEARCH_FAILED'
): WorkspaceSearchResult {
    return { ok: false, code, files: [], truncated: false, matchCount: 0, scannedFiles: 0 }
}

/**
 * 防御性归一化 FILE.SEARCH_WORKSPACE 返回值（IPC 边界不信任运行时形状）。
 * 畸形响应统一转为 `{ ok: false, code: 'SEARCH_FAILED' }`，不抛异常。
 */
export function normalizeWorkspaceSearchResult(raw: unknown): WorkspaceSearchResult {
    const record = asRecord(raw)
    if (!record) {
        return failedWorkspaceSearchResult()
    }
    if (record.ok !== true) {
        const code = record.code
        const validCodes: ReadonlyArray<WorkspaceSearchResult['code']> = [
            'NO_WORKSPACE',
            'INVALID_QUERY',
            'INVALID_REGEX',
            'SEARCH_FAILED',
            'INTERNAL_ERROR'
        ]
        return failedWorkspaceSearchResult(
            typeof code === 'string' && (validCodes as readonly string[]).includes(code)
                ? (code as WorkspaceSearchResult['code'])
                : 'SEARCH_FAILED'
        )
    }
    const files: WorkspaceSearchFileResult[] = []
    if (Array.isArray(record.files)) {
        for (const item of record.files) {
            const file = normalizeSearchFileResult(item)
            if (file) {
                files.push(file)
            }
        }
    }
    const fileList: WorkspaceFileEntry[] = []
    if (Array.isArray(record.fileList)) {
        for (const item of record.fileList) {
            const entry = normalizeFileEntry(item)
            if (entry) {
                fileList.push(entry)
            }
        }
    }
    const matchCount =
        typeof record.matchCount === 'number' && Number.isFinite(record.matchCount)
            ? Math.max(0, Math.trunc(record.matchCount))
            : files.reduce((sum, file) => sum + file.matches.length, 0)
    const scannedFiles =
        typeof record.scannedFiles === 'number' && Number.isFinite(record.scannedFiles)
            ? Math.max(0, Math.trunc(record.scannedFiles))
            : 0
    const result: WorkspaceSearchResult = {
        ok: true,
        files,
        truncated: record.truncated === true,
        matchCount,
        scannedFiles
    }
    if (record.fileList !== undefined) {
        result.fileList = fileList
    }
    return result
}

/** 替换失败兜底结构 */
function failedWorkspaceReplaceResult(
    code: WorkspaceReplaceResult['code'] = 'INTERNAL_ERROR'
): WorkspaceReplaceResult {
    return { ok: false, code, files: [], totalReplacements: 0 }
}

/** 防御性归一化 FILE.REPLACE_WORKSPACE 返回值 */
export function normalizeWorkspaceReplaceResult(raw: unknown): WorkspaceReplaceResult {
    const record = asRecord(raw)
    if (!record) {
        return failedWorkspaceReplaceResult()
    }
    const files: WorkspaceReplaceResult['files'] = []
    if (Array.isArray(record.files)) {
        for (const item of record.files) {
            const entry = normalizeFileEntry(item)
            const replacements = asRecord(item)?.replacements
            if (!entry) {
                continue
            }
            files.push({
                ...entry,
                replacements:
                    typeof replacements === 'number' && Number.isFinite(replacements)
                        ? Math.max(0, Math.trunc(replacements))
                        : 0
            })
        }
    }
    if (record.ok !== true) {
        const code = record.code
        const validCodes: ReadonlyArray<WorkspaceReplaceResult['code']> = [
            'NO_WORKSPACE',
            'INVALID_QUERY',
            'INVALID_REGEX',
            'INVALID_INPUT',
            'PATH_DENIED',
            'FILE_CHANGED',
            'WRITE_FAILED',
            'NO_MATCH',
            'INTERNAL_ERROR'
        ]
        const result = failedWorkspaceReplaceResult(
            typeof code === 'string' && (validCodes as readonly string[]).includes(code)
                ? (code as WorkspaceReplaceResult['code'])
                : 'INTERNAL_ERROR'
        )
        result.files = files
        result.totalReplacements = files.reduce((sum, file) => sum + file.replacements, 0)
        return result
    }
    const totalReplacements =
        typeof record.totalReplacements === 'number' && Number.isFinite(record.totalReplacements)
            ? Math.max(0, Math.trunc(record.totalReplacements))
            : files.reduce((sum, file) => sum + file.replacements, 0)
    return { ok: true, files, totalReplacements }
}

/**
 * 子序列匹配（Quick Open 的兜底匹配：`wsp` 可命中 `workspace-search-panel.md`）。
 * 全部字符按顺序出现即视为命中（大小写不敏感）。
 */
export function isSubsequenceMatch(text: string, query: string): boolean {
    if (query.length === 0) {
        return true
    }
    let textIndex = 0
    for (const char of query) {
        const found = text.indexOf(char, textIndex)
        if (found < 0) {
            return false
        }
        textIndex = found + 1
    }
    return true
}

/**
 * Quick Open 文件清单过滤与排序：
 * 1. 空查询返回全部（保持原顺序）；
 * 2. 子串命中优先（越靠近路径末尾/文件名命中越靠前）；
 * 3. 子串不命中时用子序列匹配兜底；
 * 4. 同分按相对路径字典序（稳定、可测）。
 */
export function filterWorkspaceFileEntries(
    entries: readonly WorkspaceFileEntry[],
    query: string
): WorkspaceFileEntry[] {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) {
        return [...entries]
    }
    const scored: Array<{ entry: WorkspaceFileEntry; score: number }> = []
    for (const entry of entries) {
        const target = entry.relativePath.toLowerCase()
        const substringIndex = target.lastIndexOf(normalizedQuery)
        if (substringIndex >= 0) {
            // 命中越靠后（越接近文件名）得分越高；完全等于查询额外加分
            const score =
                1000 + (target.length - substringIndex) + (target === normalizedQuery ? 500 : 0)
            scored.push({ entry, score })
            continue
        }
        if (isSubsequenceMatch(target, normalizedQuery)) {
            scored.push({ entry, score: 100 })
        }
    }
    scored.sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score
        }
        return left.entry.relativePath.localeCompare(right.entry.relativePath)
    })
    return scored.map((item) => item.entry)
}

/**
 * 列表键盘导航索引计算（上下循环）：
 * - length <= 0 返回 -1（无可选项）；
 * - current 越界时按方向落到首/尾。
 */
export function moveListSelection(current: number, delta: number, length: number): number {
    if (length <= 0) {
        return -1
    }
    if (!Number.isInteger(current) || current < 0 || current >= length) {
        return delta >= 0 ? 0 : length - 1
    }
    return (current + delta + length) % length
}
