/**
 * 工作区索引服务（主进程纯服务，1.5.1 本地知识库基座，2026-11-21）
 *
 * ## 职责
 * - `buildWorkspaceIndex(rootPath)`：扫描指定工作区根下的 `.md/.markdown/.txt`，
 *   解析 front matter（标题 / 标签）、正文行内 `#tag` 与 Wiki 链接 `[[...]]`，
 *   输出可跨进程传输的 `WorkspaceIndexSnapshot`；
 * - `findBacklinks()`：按链接 `resolvedPath` 反查来源行/列（反链面板）；
 * - `findLinkIssues()`：缺失 + 歧义链接合并清单（链接检查面板）；
 * - `findFilesByTag()`：按标签查文件（标签面板）。
 *
 * ## 边界与安全口径
 * 1. **根由调用方传入**（主进程 IPC 取 `appState.rootPath`），本服务不读 `appState`、
 *    不依赖 Electron，可在纯 Node 单测中运行；
 * 2. 只做词法拼接 + 目录 realpath containment 校验：扫描阶段**跳过符号链接**
 *    （防目录环与逃逸），任何子目录在进入前校验 realpath 仍位于工作区内；
 * 3. 只扫描 `.md/.markdown/.txt`；单文件 > 2 MiB 跳过；最多 20000 个文件、深度 32；
 *    忽略依赖/VCS/IDE/凭据类目录（清单与 `workspace-search.ts` 保持同口径）；
 * 4. 单文件/单目录的读取失败一律静默跳过（不抛整体异常）；根为空/非法/不存在时
 *    返回空快照（`rootPath === ''`），整体异常兜底同样降级为空快照；
 * 5. 不新增依赖：front matter 解析复用 shared 层 `parseFrontMatter`（纯函数），
 *    路径比较复用 `shared/utils/path.ts` 的纯函数。
 *
 * ## 解析口径（与 task-9 冻结要求一致）
 * - 标题：front matter `title` > 第一个 H1 > 去掉扩展名的文件名；
 * - 标签：front matter `tags`（数组 / 字符串 / 逗号分隔）+ 正文行内 `#tag`；
 *   排除 heading 行、围栏代码块与行内代码；大小写不敏感去重，保留首次出现写法；
 * - Wiki 链接：`[[target]]`、`[[target|alias]]`、`[[target#heading]]`；忽略围栏代码块
 *   与行内代码；`target` 解析优先级（首个命中即返回，阶段内多个候选=ambiguous）：
 *   ① 工作区根相对路径（无扩展名时依次补 `.md`/`.markdown`/`.txt`）；
 *   ② 相对源文件所在目录；
 *   ③ 全库 basename（去扩展名）唯一匹配，再 title 唯一匹配；
 * - 行/列 1-based，行号相对整个文件（含 front matter 行）。
 *
 * ## 已知限制
 * - 仅支持围栏代码块（``` / ~~~）与行内代码，不识别四空格缩进代码块与 setext 标题；
 * - Wiki 链接不解析 `![[embed]]` 嵌入语义、不展开别名/heading 跳转；
 * - 文件数达到上限后按目录名/文件名排序截断（快照无 truncated 字段，属既定 API）。
 */
import * as fs from 'fs'
import type { Dirent, Stats } from 'fs'
import * as path from 'path'
import { parseFrontMatter } from '../../shared/utils/front-matter'
import {
    getExtension,
    isPathWithin,
    normalizePathForCompare,
    normalizeSlashes
} from '../../shared/utils/path'
import type {
    WorkspaceIndexBacklink,
    WorkspaceIndexFile,
    WorkspaceIndexLink,
    WorkspaceIndexLinkIssue,
    WorkspaceIndexSnapshot,
    WorkspaceIndexTag
} from '../../shared/types/workspace-index'

/* ============================ 常量 ============================ */

/** 允许索引的文本扩展名（小写带点，大小写不敏感比较；与 workspace-search 同口径） */
export const WORKSPACE_INDEX_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt']

/** 扫描时跳过的目录名（依赖/VCS/IDE/凭据类目录；命中任意层级即跳过） */
export const WORKSPACE_INDEX_IGNORED_DIRS: ReadonlySet<string> = new Set([
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

/** 单次索引最多包含的文件数（防超大工作区长时间占用主进程） */
export const MAX_WORKSPACE_INDEX_FILES = 20_000

/** 单个文件参与索引的大小上限（2 MiB，超过跳过） */
export const MAX_WORKSPACE_INDEX_FILE_BYTES = 2 * 1024 * 1024

/** 目录递归深度上限（防异常目录结构/挂载点环） */
export const MAX_WORKSPACE_INDEX_SCAN_DEPTH = 32

/** Windows 下路径比较大小写不敏感（与仓库其余路径判定口径一致） */
const WIN32_CASE_INSENSITIVE = process.platform === 'win32'

/** 设备命名空间前缀（\\?\ / \\.\ 等一律拒绝，防绕过路径校验） */
const DEVICE_NAMESPACE_PATTERN = /^[\\/]{2}[.?!]/

/** Wiki 链接：`[[...]]`（单行内匹配，原文含方括号） */
const WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]+)\]\]/g

/** 行内标签：`#tag`（要求前面不是单词字符/#/路径分隔符，防误吞 URL 锚点与 `C#`） */
const INLINE_TAG_PATTERN = /(^|[^\p{L}\p{N}_#/&])#([\p{L}_][\p{L}\p{N}_/-]*)/gu

/** 围栏代码块起始/闭合行（前导最多 3 空格，连写 3 个及以上 ` 或 ~） */
const FENCE_LINE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/

/** Markdown 标题行（排除 heading 里的 `#` 被当作行内标签） */
const HEADING_LINE_PATTERN = /^\s{0,3}#{1,6}(?:\s|$)/

/** 第一个 H1（`# 标题`；允许结尾闭合 # 序列，如 `# 标题 #`） */
const H1_PATTERN = /^\s{0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/

/** 行内代码片段（Backtick 数量成对匹配；用于扫描前等长替换为空格） */
const INLINE_CODE_PATTERN = /(`+)[\s\S]*?\1/g

/* ============================ 内部类型 ============================ */

/** 工作区根（词法绝对路径 + realpath 物理路径） */
interface IndexedRoot {
    /** `path.resolve` 后的工作区根（用于拼接扫描路径与 relativePath） */
    lexical: string
    /** `fs.realpath` 后的工作区根（用于子目录符号链接逃逸判定） */
    real: string
}

/** 单条 Wiki 链接的原始解析结果（目标解析在扫描完成后统一进行） */
interface RawLink {
    /** 归一化目标（已去掉别名与 `#heading`） */
    target: string
    /** 链接原文（含 `[[` `]]`） */
    raw: string
    /** 行（1-based） */
    line: number
    /** 列（1-based） */
    column: number
}

/** 单文件解析结果（front matter / 标题 / 标签 / 原始链接） */
interface ParsedFileContent {
    /** front matter title 或第一个 H1；未命中时为空串（由调用方回退文件名） */
    title: string
    /** 标签清单（已去重） */
    tags: string[]
    /** 原始链接清单 */
    links: RawLink[]
}

/** 扫描条目：文件元数据 + 待解析的原始链接 */
interface ScannedEntry {
    file: WorkspaceIndexFile
    rawLinks: RawLink[]
}

/** 目录递归状态 */
interface WalkState {
    entries: ScannedEntry[]
    /** 是否已因文件数上限提前结束 */
    reachedFileLimit: boolean
}

/** 全库查找表（键统一小写；值为同键文件列表，长度 > 1 即歧义候选） */
interface FileLookup {
    byRelativePath: Map<string, WorkspaceIndexFile[]>
    byBasename: Map<string, WorkspaceIndexFile[]>
    byTitle: Map<string, WorkspaceIndexFile[]>
}

/** Wiki 链接目标解析结果 */
type LinkResolution =
    | { status: 'resolved'; file: WorkspaceIndexFile }
    | { status: 'missing' }
    | { status: 'ambiguous' }

/** 围栏代码块标记 */
interface FenceMarker {
    /** 围栏字符：` 或 ~ */
    char: string
    /** 连续字符数量（闭合要求 >= 起笔数量） */
    length: number
    /** 标记行除围栏外是否只剩空白（闭合行判定用） */
    bare: boolean
}

/* ============================ 通用工具 ============================ */

/** 统计文本中的换行数量（兼容 CRLF/CR/LF） */
function countLineBreaks(text: string): number {
    const matches = text.match(/\r\n|\r|\n/g)
    return matches === null ? 0 : matches.length
}

/** 是否允许索引的文本扩展名（大小写不敏感） */
function isIndexableTextFile(fileName: string): boolean {
    return WORKSPACE_INDEX_EXTENSIONS.includes(`.${getExtension(fileName)}`)
}

/** 取去掉扩展名的文件名（无扩展名时原样返回） */
function getFileStem(fileName: string): string {
    const extension = getExtension(fileName)
    return extension.length === 0
        ? fileName
        : fileName.slice(0, fileName.length - extension.length - 1)
}

/**
 * 解析 front matter 之后正文在原文件中的起始偏移。
 *
 * 优先用「正文是原文后缀」反推（对 BOM/CRLF 最稳，不依赖 endOffset 的具体语义）；
 * 无法反推时回退到解析器给出的 `endOffset`。
 */
function resolveBodyStartOffset(
    content: string,
    parsed: { present: boolean; body: string; endOffset: number }
): number {
    if (parsed.present !== true) {
        return 0
    }
    if (
        typeof parsed.body === 'string' &&
        parsed.body.length <= content.length &&
        content.endsWith(parsed.body)
    ) {
        return content.length - parsed.body.length
    }
    if (typeof parsed.endOffset === 'number' && Number.isFinite(parsed.endOffset)) {
        return Math.min(Math.max(Math.trunc(parsed.endOffset), 0), content.length)
    }
    return 0
}

/** 读取围栏代码块标记（非围栏行返回 null） */
function readFenceMarker(line: string): FenceMarker | null {
    const match = FENCE_LINE_PATTERN.exec(line)
    if (match === null) {
        return null
    }
    return {
        char: match[1][0],
        length: match[1].length,
        bare: match[2].trim().length === 0
    }
}

/** 把行内代码等长替换为空格（保留列偏移，同时避免代码内容被当作标签/链接） */
function maskInlineCode(line: string): string {
    INLINE_CODE_PATTERN.lastIndex = 0
    return line.replace(INLINE_CODE_PATTERN, (matched) => ' '.repeat(matched.length))
}

/** 归一化标签并去重（大小写不敏感；返回 false 表示已存在或为空） */
function addTag(tags: string[], seenTags: Set<string>, candidate: string): void {
    const normalized = candidate.trim().replace(/^#+/, '').trim()
    if (normalized.length === 0) {
        return
    }
    const key = normalized.toLowerCase()
    if (seenTags.has(key)) {
        return
    }
    seenTags.add(key)
    tags.push(normalized)
}

/* ============================ front matter / 标题 / 标签 / 链接解析 ============================ */

/** 读取 front matter `title`（字符串；数字转为字符串；其余忽略） */
function readFrontMatterTitle(data: Record<string, unknown>): string {
    const value = data.title
    if (typeof value === 'string') {
        return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value)
    }
    return ''
}

/**
 * 读取 front matter `tags`：
 * - 字符串：按中英文逗号拆分为多个标签；
 * - 数组：逐项处理（字符串项同样按逗号拆分，数字项转字符串）；
 * - 其余类型（布尔/null/嵌套对象）忽略。
 */
function readFrontMatterTags(data: Record<string, unknown>): string[] {
    const result: string[] = []
    const value = data.tags
    if (typeof value === 'string') {
        result.push(...value.split(/[,，]/))
        return result
    }
    if (!Array.isArray(value)) {
        return result
    }
    for (const item of value) {
        if (typeof item === 'string') {
            result.push(...item.split(/[,，]/))
        } else if (typeof item === 'number' && Number.isFinite(item)) {
            result.push(String(item))
        }
    }
    return result
}

/** 收集单行正文中的行内标签（调用方已排除 heading 行并屏蔽行内代码） */
function collectInlineTags(line: string, tags: string[], seenTags: Set<string>): void {
    INLINE_TAG_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = INLINE_TAG_PATTERN.exec(line)) !== null) {
        addTag(tags, seenTags, match[2])
    }
}

/** 收集单行正文中的 Wiki 链接（调用方已屏蔽行内代码） */
function collectWikiLinks(line: string, lineNumber: number, links: RawLink[]): void {
    WIKI_LINK_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKI_LINK_PATTERN.exec(line)) !== null) {
        const inner = match[1]
        const pipeIndex = inner.indexOf('|')
        // 别名只影响展示：target 取 `|` 之前的内容
        const targetSection = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner
        // heading 只影响跳转锚点：target 取 `#` 之前的内容
        const hashIndex = targetSection.indexOf('#')
        const target = (hashIndex >= 0 ? targetSection.slice(0, hashIndex) : targetSection).trim()
        // 空目标（如 [[#heading]]）视为指向当前文件，不产生可解析链接
        if (target.length === 0) {
            continue
        }
        links.push({ target, raw: match[0], line: lineNumber, column: match.index + 1 })
    }
}

/**
 * 解析单个文件的 front matter / 标题 / 标签 / Wiki 链接。
 *
 * 行号以整个文件为基准（front matter 行计入）；围栏代码块与行内代码内的内容一律忽略。
 */
function parseFileContent(content: string): ParsedFileContent {
    const parsed = parseFrontMatter(content)
    const tags: string[] = []
    const seenTags = new Set<string>()
    for (const tag of readFrontMatterTags(parsed.data)) {
        addTag(tags, seenTags, tag)
    }
    let title = readFrontMatterTitle(parsed.data)
    const bodyStartOffset = resolveBodyStartOffset(content, parsed)
    const lineOffset = countLineBreaks(content.slice(0, bodyStartOffset))
    const links: RawLink[] = []
    const lines = parsed.body.split(/\r\n|\r|\n/)
    /** 当前围栏代码块状态（null 表示不在围栏内） */
    let fence: FenceMarker | null = null
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const marker = readFenceMarker(line)
        if (fence !== null) {
            // 围栏内：只有同字符、长度不短于起笔且无其余内容的行才闭合围栏
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
            fence = marker
            continue
        }
        const maskedLine = maskInlineCode(line)
        if (title.length === 0) {
            const heading = H1_PATTERN.exec(maskedLine)
            if (heading !== null) {
                title = heading[1].trim()
            }
        }
        if (!HEADING_LINE_PATTERN.test(line)) {
            collectInlineTags(maskedLine, tags, seenTags)
        }
        collectWikiLinks(maskedLine, lineOffset + index + 1, links)
    }
    return { title, tags, links }
}

/* ============================ 根解析与目录扫描 ============================ */

/** 解析并校验工作区根（空/相对/设备命名空间/根目录/不存在一律返回 null） */
async function resolveIndexedRoot(rawRootPath: string): Promise<IndexedRoot | null> {
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
        const stats = await fs.promises.stat(lexical)
        if (!stats.isDirectory()) {
            return null
        }
        return { lexical, real: await fs.promises.realpath(lexical) }
    } catch {
        return null
    }
}

/** 子目录真实路径是否仍位于工作区 realpath 内（阻断符号链接/junction 逃逸） */
async function isRealPathInsideRoot(candidatePath: string, realRoot: string): Promise<boolean> {
    try {
        const real = await fs.promises.realpath(candidatePath)
        return isPathWithin(real, realRoot, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })
    } catch {
        // 无法解析（权限/竞态删除）按不可信处理
        return false
    }
}

/** 读取并解析单个可索引文件（错误/超限/非普通文件一律静默跳过） */
async function readIndexedFile(root: IndexedRoot, filePath: string): Promise<ScannedEntry | null> {
    let stats: Stats
    try {
        stats = await fs.promises.lstat(filePath)
    } catch {
        return null
    }
    // 符号链接（竞态）与非普通文件跳过
    if (!stats.isFile() || stats.isSymbolicLink()) {
        return null
    }
    if (stats.size > MAX_WORKSPACE_INDEX_FILE_BYTES) {
        return null
    }
    let content: string
    try {
        content = await fs.promises.readFile(filePath, 'utf-8')
    } catch {
        return null
    }
    let parsedContent: ParsedFileContent
    try {
        parsedContent = parseFileContent(content)
    } catch {
        // 单文件解析异常（front matter 等）静默跳过，不影响整体索引
        return null
    }
    const name = path.basename(filePath)
    return {
        file: {
            path: filePath,
            relativePath: normalizeSlashes(path.relative(root.lexical, filePath)),
            name,
            title: parsedContent.title.length > 0 ? parsedContent.title : getFileStem(name),
            tags: parsedContent.tags,
            links: [],
            size: stats.size,
            mtimeMs: stats.mtimeMs
        },
        rawLinks: parsedContent.links
    }
}

/** 递归扫描目录（跳过忽略目录/符号链接/超深目录，文件数达上限即停） */
async function walkDirectory(
    root: IndexedRoot,
    dirPath: string,
    depth: number,
    state: WalkState
): Promise<void> {
    let dirents: Dirent[]
    try {
        dirents = await fs.promises.readdir(dirPath, { withFileTypes: true })
    } catch {
        return
    }
    dirents.sort((left, right) => left.name.localeCompare(right.name))
    for (const dirent of dirents) {
        if (state.reachedFileLimit) {
            return
        }
        const fullPath = path.join(dirPath, dirent.name)
        if (dirent.isSymbolicLink()) {
            // 符号链接一律跳过：防止逃逸出工作区与目录环
            continue
        }
        if (dirent.isDirectory()) {
            if (WORKSPACE_INDEX_IGNORED_DIRS.has(dirent.name)) {
                continue
            }
            if (depth >= MAX_WORKSPACE_INDEX_SCAN_DEPTH) {
                continue
            }
            if (!(await isRealPathInsideRoot(fullPath, root.real))) {
                continue
            }
            await walkDirectory(root, fullPath, depth + 1, state)
            continue
        }
        if (!dirent.isFile() || !isIndexableTextFile(dirent.name)) {
            continue
        }
        if (state.entries.length >= MAX_WORKSPACE_INDEX_FILES) {
            state.reachedFileLimit = true
            return
        }
        const scanned = await readIndexedFile(root, fullPath)
        if (scanned !== null) {
            state.entries.push(scanned)
        }
    }
}

/* ============================ 链接目标解析 ============================ */

/** 向查找表追加文件（同键多个即为候选歧义） */
function appendLookup(
    lookupMap: Map<string, WorkspaceIndexFile[]>,
    key: string,
    file: WorkspaceIndexFile
): void {
    const existing = lookupMap.get(key)
    if (existing === undefined) {
        lookupMap.set(key, [file])
        return
    }
    existing.push(file)
}

/** 构建全库查找表（键统一小写：链接解析大小写不敏感，落盘路径仍保留真实大小写） */
function createFileLookup(files: readonly WorkspaceIndexFile[]): FileLookup {
    const lookup: FileLookup = {
        byRelativePath: new Map(),
        byBasename: new Map(),
        byTitle: new Map()
    }
    for (const file of files) {
        appendLookup(lookup.byRelativePath, file.relativePath.toLowerCase(), file)
        appendLookup(lookup.byBasename, getFileStem(file.name).toLowerCase(), file)
        if (file.title.length > 0) {
            appendLookup(lookup.byTitle, file.title.toLowerCase(), file)
        }
    }
    return lookup
}

/** 归一化链接目标为工作区相对路径（拒绝绝对路径与越出根目录的 `..`） */
function normalizeRelativePath(input: string): string | null {
    const cleaned = input.trim().replace(/^\.\/+/, '')
    if (cleaned.length === 0 || cleaned.includes('\u0000') || path.posix.isAbsolute(cleaned)) {
        return null
    }
    const normalized = path.posix.normalize(cleaned)
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
        return null
    }
    return normalized
}

/** 阶段①：按工作区根相对路径解析（无扩展名时按 `.md`→`.markdown`→`.txt` 补全） */
function resolveByRelativePath(candidatePath: string, lookup: FileLookup): LinkResolution {
    const normalized = normalizeRelativePath(candidatePath)
    if (normalized === null) {
        return { status: 'missing' }
    }
    const candidateKeys = [normalized]
    const extension = path.posix.extname(normalized).toLowerCase()
    if (!WORKSPACE_INDEX_EXTENSIONS.includes(extension)) {
        for (const extensionCandidate of WORKSPACE_INDEX_EXTENSIONS) {
            candidateKeys.push(normalized + extensionCandidate)
        }
    }
    for (const key of candidateKeys) {
        const matches = lookup.byRelativePath.get(key.toLowerCase())
        if (matches === undefined) {
            continue
        }
        if (matches.length === 1) {
            return { status: 'resolved', file: matches[0] }
        }
        return { status: 'ambiguous' }
    }
    return { status: 'missing' }
}

/** 取相对路径的父目录（根目录文件返回空串） */
function getParentRelativePath(relativePath: string): string {
    const slashIndex = relativePath.lastIndexOf('/')
    return slashIndex <= 0 ? '' : relativePath.slice(0, slashIndex)
}

/** 阶段③：全库 basename / title 唯一匹配（同一目标的多候选视为歧义） */
function resolveByBasenameOrTitle(rawTarget: string, lookup: FileLookup): LinkResolution {
    const trimmed = rawTarget.trim()
    const segments = trimmed.split('/')
    const lastSegment = segments[segments.length - 1] ?? ''
    const basenameMatches = lookup.byBasename.get(getFileStem(lastSegment).toLowerCase()) ?? []
    const titleMatches = new Set<WorkspaceIndexFile>()
    for (const key of [trimmed.toLowerCase(), lastSegment.toLowerCase()]) {
        for (const file of lookup.byTitle.get(key) ?? []) {
            titleMatches.add(file)
        }
    }
    if (basenameMatches.length === 1) {
        return { status: 'resolved', file: basenameMatches[0] }
    }
    if (titleMatches.size === 1) {
        return { status: 'resolved', file: [...titleMatches][0] }
    }
    if (basenameMatches.length > 1 || titleMatches.size > 1) {
        return { status: 'ambiguous' }
    }
    return { status: 'missing' }
}

/**
 * 解析单条 Wiki 链接目标（阶段顺序即优先级）：
 * ① 工作区根相对路径 → ② 相对源文件目录 → ③ 全库 basename/title 唯一匹配。
 */
function resolveLinkTarget(
    sourceFile: WorkspaceIndexFile,
    rawTarget: string,
    lookup: FileLookup
): LinkResolution {
    const target = rawTarget.trim().replace(/\\/g, '/')
    if (target.length === 0 || target.includes('\u0000')) {
        return { status: 'missing' }
    }
    // 盘符 / UNC / 协议开头的目标不属于工作区 Wiki 链接（防把系统路径当笔记解析）
    if (/^[A-Za-z]:/.test(target) || target.startsWith('//')) {
        return { status: 'missing' }
    }
    // 以 `/` 开头按工作区根相对解析
    if (target.startsWith('/')) {
        return resolveByRelativePath(target.replace(/^\/+/, ''), lookup)
    }
    const rootRelative = resolveByRelativePath(target, lookup)
    if (rootRelative.status !== 'missing') {
        return rootRelative
    }
    const sourceDirectory = getParentRelativePath(sourceFile.relativePath)
    if (sourceDirectory.length > 0) {
        const sibling = resolveByRelativePath(`${sourceDirectory}/${target}`, lookup)
        if (sibling.status !== 'missing') {
            return sibling
        }
    }
    return resolveByBasenameOrTitle(target, lookup)
}

/* ============================ 快照构建 ============================ */

/** 构建标签聚合清单（数量降序 → 标签名升序，保证快照确定性） */
function buildTagIndex(files: readonly WorkspaceIndexFile[]): WorkspaceIndexTag[] {
    const tagMap = new Map<string, WorkspaceIndexTag>()
    for (const file of files) {
        for (const tag of file.tags) {
            const key = tag.toLowerCase()
            const existing = tagMap.get(key)
            if (existing === undefined) {
                tagMap.set(key, { tag, count: 1, files: [file.path] })
            } else {
                existing.count += 1
                existing.files.push(file.path)
            }
        }
    }
    const tags = [...tagMap.values()]
    tags.sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    return tags
}

/** 空快照（根非法/不存在/整体异常时的统一降级返回） */
function createEmptySnapshot(rootPath = ''): WorkspaceIndexSnapshot {
    return {
        rootPath,
        generatedAt: Date.now(),
        files: [],
        tags: [],
        missingLinks: [],
        stats: { fileCount: 0, linkCount: 0, missingCount: 0, ambiguousCount: 0 }
    }
}

/**
 * 构建工作区索引快照。
 *
 * @param rootPath 工作区根（绝对路径；由主进程从 `appState.rootPath` 取得后传入）
 * @returns 快照；根为空/非法/不存在或整体异常时返回空快照（不抛异常）
 */
export async function buildWorkspaceIndex(rootPath: string): Promise<WorkspaceIndexSnapshot> {
    try {
        const root = await resolveIndexedRoot(rootPath)
        if (root === null) {
            return createEmptySnapshot()
        }
        const state: WalkState = { entries: [], reachedFileLimit: false }
        await walkDirectory(root, root.lexical, 0, state)
        // 确定性输出：文件按 relativePath 升序
        state.entries.sort((left, right) =>
            left.file.relativePath.localeCompare(right.file.relativePath)
        )
        const files = state.entries.map((entry) => entry.file)
        const lookup = createFileLookup(files)
        const missingLinks: WorkspaceIndexSnapshot['missingLinks'] = []
        let linkCount = 0
        let missingCount = 0
        let ambiguousCount = 0
        for (const entry of state.entries) {
            const links: WorkspaceIndexLink[] = entry.rawLinks.map((rawLink) => {
                const resolution = resolveLinkTarget(entry.file, rawLink.target, lookup)
                linkCount += 1
                if (resolution.status === 'resolved') {
                    return {
                        target: rawLink.target,
                        raw: rawLink.raw,
                        line: rawLink.line,
                        column: rawLink.column,
                        status: 'resolved',
                        resolvedPath: resolution.file.path
                    }
                }
                if (resolution.status === 'ambiguous') {
                    ambiguousCount += 1
                    return {
                        target: rawLink.target,
                        raw: rawLink.raw,
                        line: rawLink.line,
                        column: rawLink.column,
                        status: 'ambiguous'
                    }
                }
                missingCount += 1
                missingLinks.push({
                    sourcePath: entry.file.path,
                    sourceRelativePath: entry.file.relativePath,
                    target: rawLink.target,
                    line: rawLink.line,
                    column: rawLink.column
                })
                return {
                    target: rawLink.target,
                    raw: rawLink.raw,
                    line: rawLink.line,
                    column: rawLink.column,
                    status: 'missing'
                }
            })
            entry.file.links = links
        }
        return {
            rootPath: root.lexical,
            generatedAt: Date.now(),
            files,
            tags: buildTagIndex(files),
            missingLinks,
            stats: {
                fileCount: files.length,
                linkCount,
                missingCount,
                ambiguousCount
            }
        }
    } catch {
        // 兜底：整体异常不向调用方抛（IPC 层按快照是否为空/计数自行决定提示）
        return createEmptySnapshot()
    }
}

/* ============================ 查询 API ============================ */

/** 归一化查询路径（绝对路径走 path.resolve；相对路径按原样词法归一化） */
function normalizeQueryPath(targetPath: string): string {
    const trimmed = targetPath.trim()
    return path.isAbsolute(trimmed) ? path.resolve(trimmed) : trimmed
}

/** 两个路径是否指向同一文件（Windows 大小写不敏感，与仓库路径判定口径一致） */
function isSameNormalizedPath(left: string, right: string): boolean {
    return (
        normalizePathForCompare(left, WIN32_CASE_INSENSITIVE) ===
        normalizePathForCompare(right, WIN32_CASE_INSENSITIVE)
    )
}

/**
 * 查询指向 `targetPath` 的反向链接（按链接 `resolvedPath` 精确匹配）。
 *
 * @param snapshot `buildWorkspaceIndex()` 产出的快照
 * @param targetPath 目标文件绝对路径（相对路径按词法归一化比较）
 * @returns 来源文件/行/列；无命中返回空数组
 */
export function findBacklinks(
    snapshot: WorkspaceIndexSnapshot,
    targetPath: string
): WorkspaceIndexBacklink[] {
    const backlinks: WorkspaceIndexBacklink[] = []
    if (typeof targetPath !== 'string') {
        return backlinks
    }
    const normalizedTarget = normalizeQueryPath(targetPath)
    if (normalizedTarget.length === 0) {
        return backlinks
    }
    for (const file of snapshot.files) {
        for (const link of file.links) {
            if (link.status !== 'resolved' || typeof link.resolvedPath !== 'string') {
                continue
            }
            if (!isSameNormalizedPath(link.resolvedPath, normalizedTarget)) {
                continue
            }
            backlinks.push({
                sourcePath: file.path,
                sourceRelativePath: file.relativePath,
                sourceTitle: file.title,
                line: link.line,
                column: link.column
            })
        }
    }
    return backlinks
}

/**
 * 查询链接问题清单（缺失 + 歧义链接，展示顺序与快照 files/links 顺序一致）。
 *
 * @param snapshot `buildWorkspaceIndex()` 产出的快照
 */
export function findLinkIssues(snapshot: WorkspaceIndexSnapshot): WorkspaceIndexLinkIssue[] {
    const issues: WorkspaceIndexLinkIssue[] = []
    for (const file of snapshot.files) {
        for (const link of file.links) {
            if (link.status === 'resolved') {
                continue
            }
            issues.push({
                sourcePath: file.path,
                sourceRelativePath: file.relativePath,
                target: link.target,
                line: link.line,
                column: link.column,
                status: link.status
            })
        }
    }
    return issues
}

/** 归一化标签查询串（去空白、去前导 `#`、转小写用于大小写不敏感比较） */
function normalizeTagQuery(rawTag: string): string {
    return rawTag.trim().replace(/^#+/, '').trim().toLowerCase()
}

/**
 * 按标签查询文件（大小写不敏感，支持带 `#` 前缀）。
 *
 * @param snapshot `buildWorkspaceIndex()` 产出的快照
 * @param tag 标签名（可带 `#`）
 * @returns 命中文件（保持快照 files 顺序）；未知/空标签返回空数组
 */
export function findFilesByTag(
    snapshot: WorkspaceIndexSnapshot,
    tag: string
): WorkspaceIndexFile[] {
    if (typeof tag !== 'string') {
        return []
    }
    const normalizedTag = normalizeTagQuery(tag)
    if (normalizedTag.length === 0) {
        return []
    }
    return snapshot.files.filter((file) =>
        file.tags.some((fileTag) => fileTag.toLowerCase() === normalizedTag)
    )
}
