/**
 * 工作区索引服务（主进程纯服务，1.5.1 本地知识库基座，2026-11-21）
 *
 * ## 职责
 * - `buildWorkspaceIndex(rootPath)`：扫描指定工作区根下的 `.md/.markdown/.txt`，
 *   解析 front matter（标题 / 标签）、正文行内 `#tag` 与 Wiki 链接 `[[...]]`，
 *   输出可跨进程传输的 `WorkspaceIndexSnapshot`；
 * - `findBacklinks()`：按链接 `resolvedPath` 反查来源行/列（反链面板）；
 * - `findLinkIssues()`：缺失 + 歧义链接合并清单（链接检查面板）；
 * - `findFilesByTag()`：按标签查文件（标签面板）；
 * - task-12（B5/E10）：为每个文件生成正文纯文本摘要 `excerpt`（≤240 字符），
 *   并聚合 Markdown 图片/附件引用为 `attachments`（含存在性、来源文件）。
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
 * 6. 附件解析只做「词法相对路径 + 工作区 containment + `stat` 存在性检查」，
 *    不读取附件内容、不解析符号链接真实目标；`../` 越界与协议/绝对路径一律忽略。
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
 * - 行/列 1-based，行号相对整个文件（含 front matter 行）；
 * - 摘要（task-12）：front matter 之后的正文，去掉围栏代码块与 Markdown 标记
 *   （标题/列表/引用/强调/链接/图片/表格/HTML），压缩空白后按 Unicode 码点截断到 240；
 * - 附件（task-12）：`![alt](path)` 与 `[text](path)` 中扩展名属于附件集合的本地相对路径，
 *   按源文件目录解析为绝对路径，按绝对路径聚合 `referencedBy`，缺失者 `exists === false`。
 *
 * ## 已知限制
 * - 仅支持围栏代码块（``` / ~~~）与行内代码，不识别四空格缩进代码块与 setext 标题；
 * - Wiki 链接不解析 `![[embed]]` 嵌入语义、不展开别名/heading 跳转；
 * - 文件数达到上限后按目录名/文件名排序截断（快照无 truncated 字段，属既定 API）；
 * - 摘要会整块丢弃围栏代码块内容；不解析 reference 式链接定义（`[label]: url`）与
 *   HTML `<img>`；附件引用不解析 `<...>` 之外含未编码空格的路径、不跟随 `?query`/`#fragment`；
 * - 附件存在性按 `stat`（跟随符号链接）判定，符号链接断链/指向目录按缺失处理。
 */
import * as fs from 'fs'
import type { Dirent, Stats } from 'fs'
import * as path from 'path'
import { parseFrontMatter } from '../../shared/utils/front-matter'
import { decodeFileContent } from './file-utils/file-encoding'
import {
    getExtension,
    isPathWithin,
    normalizePathForCompare,
    normalizeSlashes
} from '../../shared/utils/path'
import type {
    WorkspaceAttachment,
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

/**
 * 附件引用识别的扩展名集合（小写、不含点；task-12）。
 *
 * 只收录「非索引文本」的图片/文档/压缩包/音视频等常见附件：`.md/.markdown/.txt`
 * 属于笔记正文，不当作附件；清单可按 B5 需求继续扩充，不影响已有行为。
 */
export const WORKSPACE_ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set([
    // 图片
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'bmp',
    'ico',
    'tif',
    'tiff',
    'avif',
    'heic',
    'heif',
    // 文档
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'csv',
    'rtf',
    'odt',
    'ods',
    'odp',
    'epub',
    // 压缩包 / 安装包
    'zip',
    'rar',
    '7z',
    'tar',
    'gz',
    'tgz',
    'bz2',
    'xz',
    'dmg',
    'exe',
    'msi',
    'apk',
    // 音视频
    'mp3',
    'wav',
    'ogg',
    'flac',
    'mp4',
    'webm',
    'mov',
    'mkv'
])

/** 摘要最大字符数（按 Unicode 码点计，避免截断代理对；task-12 / E10） */
export const WORKSPACE_INDEX_EXCERPT_MAX_LENGTH = 240

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

/* --------------------- task-12：摘要 / 附件引用解析用模式 --------------------- */

/**
 * Markdown 行内图片/链接：`![alt](dest)` / `[text](dest)`。
 *
 * 分组：1=`!` 或空串（区分图片与普通链接）；2=链接文字；3=目标原文（可含尖括号与标题）。
 * 目标允许一层配对的圆括号（如 `a(1).png`），避免被首个 `)` 截断；不支持嵌套两层以上。
 * 同一模式同时供摘要（保留文字、丢弃图片）与附件引用（取目标）使用，保证口径一致。
 */
const MARKDOWN_INLINE_LINK_PATTERN =
    /(!?)\[([^[\]\r\n]*)\]\(([^()\r\n]*(?:\([^()\r\n]*\)[^()\r\n]*)*)\)/g

/** 外部协议前缀（http/https/data/app/file/mailto 等，含 Windows 盘符 `C:`）：附件解析一律忽略 */
const EXTERNAL_PROTOCOL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/

/** HTML 注释（摘要时整段丢弃） */
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g

/** HTML 标签（摘要时丢弃标签、保留文字） */
const HTML_TAG_PATTERN = /<[^<>\r\n]+>/g

/** Markdown reference 式链接 `[text][label]`（摘要时保留文字；不解析定义行） */
const MD_REFERENCE_LINK_PATTERN = /\[([^[\]\r\n]*)\]\[[^[\]\r\n]*\]/g

/** Wiki 链接 `[[target|alias]]`（摘要时取展示文字） */
const MD_WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]+)\]\]/g

/** 加粗/斜体/删除线标记（摘要时去标记、保留文字；下划线斜体要求词边界） */
const MD_BOLD_PATTERN = /\*\*([^*\r\n]+)\*\*/g
const MD_ITALIC_STAR_PATTERN = /\*([^*\r\n]+)\*/g
const MD_BOLD_UNDERSCORE_PATTERN = /__([^_\r\n]+)__/g
const MD_ITALIC_UNDERSCORE_PATTERN = /(^|[\s(])_([^_\r\n]+)_(?=$|[\s).,;:!?])/g
const MD_STRIKETHROUGH_PATTERN = /~~([^~\r\n]+)~~/g

/** 水平分割线行（摘要时整行丢弃） */
const MD_HORIZONTAL_RULE_PATTERN = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/

/** 引用块前缀 `>`（摘要时去掉标记） */
const MD_BLOCKQUOTE_PREFIX_PATTERN = /^\s{0,3}(?:>\s?)+/

/** 标题前缀 `#` ~ `######`（摘要时去掉标记；`#标题` 无空格不算标题） */
const MD_HEADING_PREFIX_PATTERN = /^\s{0,3}#{1,6}\s+/

/** 标题尾部的闭合 `#` 序列（`# 标题 ##` → `标题`） */
const MD_HEADING_TRAILING_PATTERN = /(?:\s+#+)\s*$/

/** 列表项前缀（无序 / 有序 / 任务列表复选框；摘要时去掉标记） */
const MD_LIST_MARKER_PATTERN = /^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/

/** 表格分隔行单元格（`---` / `:---:` / `---:`；摘要时整行丢弃） */
const MD_TABLE_SEPARATOR_CELL_PATTERN = /^:?-{3,}:?$/

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

/**
 * 单条 Markdown 图片/链接的原始附件目标（task-12）。
 *
 * 收集阶段只保存目标原文（已去尖括号/标题），解析为工作区绝对路径在扫描完成后统一进行
 * （需要工作区根与来源文件目录）；非附件扩展名/外链在解析阶段过滤。
 */
interface RawAttachmentReference {
    /** 目标原文（可能含 URL 编码，如 `images/a%20b.png`） */
    target: string
}

/** 单文件解析结果（front matter / 标题 / 标签 / 原始链接 / 摘要 / 附件引用） */
interface ParsedFileContent {
    /** front matter title 或第一个 H1；未命中时为空串（由调用方回退文件名） */
    title: string
    /** 标签清单（已去重） */
    tags: string[]
    /** 原始链接清单 */
    links: RawLink[]
    /** 正文纯文本摘要（≤240 字符；空正文为空串） */
    excerpt: string
    /** 原始附件引用清单（正文出现顺序） */
    attachmentReferences: RawAttachmentReference[]
}

/** 扫描条目：文件元数据 + 待解析的原始链接/附件引用 */
interface ScannedEntry {
    file: WorkspaceIndexFile
    rawLinks: RawLink[]
    rawAttachmentReferences: RawAttachmentReference[]
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

/* ============================ 摘要生成（task-12 / E10） ============================ */

/** 按 Unicode 码点截断（不切断代理对，保证输出仍是合法字符串） */
function truncateToCodePoints(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text
    }
    const codePoints = Array.from(text)
    return codePoints.length <= maxLength ? text : codePoints.slice(0, maxLength).join('')
}

/** 去掉围栏代码块（含围栏标记行与块内代码），返回保留下来的正文行 */
function stripFencedCodeBlocks(body: string): string[] {
    const kept: string[] = []
    let fence: FenceMarker | null = null
    for (const line of body.split(/\r\n|\r|\n/)) {
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
            fence = marker
            continue
        }
        kept.push(line)
    }
    return kept
}

/** 是否为 Markdown 表格分隔行（`| --- | :---: |` 等；摘要时整行丢弃） */
function isTableSeparatorLine(line: string): boolean {
    const cells = line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0)
    if (cells.length === 0) {
        return false
    }
    return cells.every((cell) => MD_TABLE_SEPARATOR_CELL_PATTERN.test(cell))
}

/** 清理单行行首 Markdown 结构标记（标题/引用/列表/表格分隔），返回剩余文字 */
function cleanExcerptLine(line: string): string {
    if (MD_HORIZONTAL_RULE_PATTERN.test(line) || isTableSeparatorLine(line)) {
        return ''
    }
    let text = line.replace(MD_BLOCKQUOTE_PREFIX_PATTERN, '')
    if (MD_HEADING_PREFIX_PATTERN.test(text)) {
        text = text.replace(MD_HEADING_PREFIX_PATTERN, '').replace(MD_HEADING_TRAILING_PATTERN, '')
    }
    text = text.replace(MD_LIST_MARKER_PATTERN, '')
    // 表格竖线转空格：保留单元格文字、避免 `|` 混入摘要
    if (text.includes('|')) {
        text = text.replace(/\|/g, ' ')
    }
    return text
}

/** 把 Wiki 链接内层 `target|alias` / `target#heading` 转为摘要展示文字 */
function getWikiLinkDisplayText(inner: string): string {
    const pipeIndex = inner.indexOf('|')
    if (pipeIndex >= 0) {
        return inner.slice(pipeIndex + 1).trim()
    }
    const hashIndex = inner.indexOf('#')
    return (hashIndex >= 0 ? inner.slice(0, hashIndex) : inner).trim()
}

/**
 * 去掉单行文本中的 Markdown 行内标记（摘要用）。
 *
 * 处理顺序：图片整段丢弃 → 普通/reference 链接保留文字 → Wiki 链接取展示文字 →
 * HTML 标签丢弃 → 加粗/斜体/删除线保留文字 → 行内代码去反引号保留内容。
 * 必须在行级表格竖线归一化**之前**调用，否则 `[[target|alias]]` 的 `|` 会被误当表格分隔符。
 */
function stripInlineMarkdown(text: string): string {
    let result = text.replace(
        MARKDOWN_INLINE_LINK_PATTERN,
        (_matched, imageFlag: string, label: string) => (imageFlag === '!' ? '' : ` ${label} `)
    )
    result = result.replace(MD_REFERENCE_LINK_PATTERN, (_matched, label: string) => ` ${label} `)
    result = result.replace(MD_WIKI_LINK_PATTERN, (_matched, inner: string) => {
        const display = getWikiLinkDisplayText(inner)
        return display.length > 0 ? ` ${display} ` : ''
    })
    result = result.replace(HTML_TAG_PATTERN, ' ')
    result = result.replace(MD_BOLD_PATTERN, '$1')
    result = result.replace(MD_BOLD_UNDERSCORE_PATTERN, '$1')
    result = result.replace(MD_STRIKETHROUGH_PATTERN, '$1')
    result = result.replace(MD_ITALIC_STAR_PATTERN, '$1')
    result = result.replace(MD_ITALIC_UNDERSCORE_PATTERN, '$1$2')
    // 行内代码：去掉反引号、保留内容；未配对的散落反引号一并清除
    return result.replace(INLINE_CODE_PATTERN, (matched) => matched.slice(1, -1)).replace(/`/g, '')
}

/**
 * 生成正文纯文本摘要（task-12 / E10）。
 *
 * 处理顺序：
 * 1. 输入为 `parseFrontMatter()` 的 body（front matter 已剔除）；
 * 2. 去 HTML 注释；整块丢弃围栏代码块（含块内代码）；
 * 3. 逐行先去行内标记（{@link stripInlineMarkdown}），再去行级结构标记：
 *    水平分割线/表格分隔行整行丢弃，引用/标题/列表/任务项去前缀，表格竖线转空格；
 * 4. 压缩连续空白为单个空格并 trim，最后按 Unicode 码点截断到 240 字符。
 *
 * @param body front matter 之后的正文
 * @returns 摘要（空正文返回空串；长度按码点 ≤ {@link WORKSPACE_INDEX_EXCERPT_MAX_LENGTH}）
 */
function buildExcerpt(body: string): string {
    if (body.length === 0) {
        return ''
    }
    const lines = stripFencedCodeBlocks(body.replace(HTML_COMMENT_PATTERN, ' '))
    const text = lines.map((line) => cleanExcerptLine(stripInlineMarkdown(line))).join('\n')
    const compressed = text.replace(/\s+/g, ' ').trim()
    return truncateToCodePoints(compressed, WORKSPACE_INDEX_EXCERPT_MAX_LENGTH)
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
 * 从 Markdown 行内链接的圆括号内容中提取目标路径（task-12）。
 *
 * 支持两种写法：`(<path with space>)` 尖括号形式（原样返回内部路径）与普通形式
 * `(path "title")`（去掉可选 title，取首个空白之前的部分）。
 *
 * @returns 目标原文（未做 URL 解码）；为空返回 null
 */
function extractMarkdownLinkDestination(rawDestination: string): string | null {
    let destination = rawDestination.trim()
    if (destination.startsWith('<')) {
        const end = destination.indexOf('>')
        if (end < 0) {
            return null
        }
        destination = destination.slice(1, end).trim()
        return destination.length > 0 ? destination : null
    }
    const spaceIndex = destination.search(/\s/)
    if (spaceIndex >= 0) {
        destination = destination.slice(0, spaceIndex)
    }
    return destination.length > 0 ? destination : null
}

/**
 * 收集单行正文中的 Markdown 图片/附件引用候选（task-12；调用方已屏蔽行内代码）。
 *
 * 这里只收集目标原文（图片与普通链接一视同仁），扩展名过滤/路径解析/存在性检查
 * 统一在扫描完成后的附件解析阶段进行，便于按工作区根与来源文件目录解析。
 */
function collectAttachmentReferences(line: string, references: RawAttachmentReference[]): void {
    if (!line.includes('](')) {
        return
    }
    MARKDOWN_INLINE_LINK_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = MARKDOWN_INLINE_LINK_PATTERN.exec(line)) !== null) {
        const destination = extractMarkdownLinkDestination(match[3])
        if (destination === null) {
            continue
        }
        references.push({ target: destination })
    }
}

/**
 * 解析单个文件的 front matter / 标题 / 标签 / Wiki 链接 / 摘要 / 附件引用。
 *
 * 行号以整个文件为基准（front matter 行计入）；围栏代码块与行内代码内的内容一律忽略
 * （摘要另行整块丢弃围栏代码，见 {@link buildExcerpt}）。
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
    const attachmentReferences: RawAttachmentReference[] = []
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
        collectAttachmentReferences(maskedLine, attachmentReferences)
    }
    return {
        title,
        tags,
        links,
        excerpt: buildExcerpt(parsed.body),
        attachmentReferences
    }
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
        // 与文件打开/编码转换共用同一解码真源：GBK/UTF-16 等文件按探测编码解码，
        // 避免 Wiki 链接行列按 UTF-8 错误解码而错位（B4 重命名更新依赖该行列）。
        content = decodeFileContent(await fs.promises.readFile(filePath)).content
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
            excerpt: parsedContent.excerpt,
            tags: parsedContent.tags,
            links: [],
            size: stats.size,
            mtimeMs: stats.mtimeMs
        },
        rawLinks: parsedContent.links,
        rawAttachmentReferences: parsedContent.attachmentReferences
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

/* ============================ 附件引用解析（task-12 / B5） ============================ */

/**
 * 把 Markdown 链接目标归一化为本地相对路径（task-12）。
 *
 * 依次处理：去协议/盘符（http/https/data/app/file/C: 等一律忽略）→ 反斜杠归一化 →
 * 去 `#fragment` 与 `?query` → 安全 URL 解码 → 拒绝空目标、NUL、绝对路径与 UNC。
 *
 * @returns 本地相对路径；外部引用/绝对路径/非法解码返回 null
 */
function decodeAttachmentPath(rawTarget: string): string | null {
    let value = rawTarget.trim()
    if (value.length === 0) {
        return null
    }
    // 协议 / 盘符开头一律视为外部引用（`C:` 与 `http:` 同属「带 scheme」形态）
    if (EXTERNAL_PROTOCOL_PATTERN.test(value)) {
        return null
    }
    value = normalizeSlashes(value)
    // 片段（#anchor）与查询串（?raw=1）不属于本地文件路径
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
    // 空目标、NUL、POSIX 绝对路径 / UNC（`//server/...`）一律忽略
    if (value.length === 0 || value.includes('\u0000') || value.startsWith('/')) {
        return null
    }
    return value
}

/**
 * 解析单条附件引用为工作区内的绝对路径（task-12）。
 *
 * 相对源文件所在目录词法解析，拒绝 `../` 越界与工作区外路径；扩展名必须属于
 * {@link WORKSPACE_ATTACHMENT_EXTENSIONS}。此函数不做 IO（存在性在聚合阶段统一检查）。
 *
 * @returns 绝对路径 + 相对工作区根展示路径；非附件/外链/越界返回 null
 */
function resolveAttachmentReference(
    root: IndexedRoot,
    sourceRelativePath: string,
    rawTarget: string
): { absolutePath: string; relativePath: string } | null {
    const target = decodeAttachmentPath(rawTarget)
    if (target === null || !WORKSPACE_ATTACHMENT_EXTENSIONS.has(getExtension(target))) {
        return null
    }
    const sourceDirectory = getParentRelativePath(sourceRelativePath)
    const combined = path.posix.normalize(
        sourceDirectory.length > 0 ? `${sourceDirectory}/${target}` : target
    )
    if (combined === '.' || combined === '..' || combined.startsWith('../')) {
        return null
    }
    const absolutePath = path.resolve(root.lexical, combined)
    const withinRoot = isPathWithin(absolutePath, root.lexical, {
        win32CaseInsensitive: WIN32_CASE_INSENSITIVE
    })
    if (!withinRoot) {
        return null
    }
    return {
        absolutePath,
        relativePath: normalizeSlashes(path.relative(root.lexical, absolutePath))
    }
}

/** 附件是否存在且为普通文件（stat 跟随符号链接；权限/竞态错误按缺失处理） */
async function attachmentFileExists(absolutePath: string): Promise<boolean> {
    try {
        const stats = await fs.promises.stat(absolutePath)
        return stats.isFile()
    } catch {
        return false
    }
}

/** 附件聚合中间态（referencedBy 去重需额外键集合，不进入跨进程契约） */
interface PendingAttachment {
    path: string
    relativePath: string
    referencedBy: string[]
    referencedKeys: Set<string>
}

/**
 * 聚合全部文件的附件引用（task-12 / B5 附件管理）。
 *
 * - 按绝对路径聚合（Windows 下大小写不敏感），同一附件只输出一条；
 * - `referencedBy` 去重，顺序与快照 `files` 顺序（relativePath 升序）一致；
 * - 逐条 `stat` 检查存在性，缺失附件保留（`exists === false`）；
 * - 输出按 `relativePath` 升序、同路径按绝对路径升序，保证快照确定性。
 */
async function buildAttachmentIndex(
    root: IndexedRoot,
    entries: readonly ScannedEntry[]
): Promise<WorkspaceAttachment[]> {
    const pending = new Map<string, PendingAttachment>()
    for (const entry of entries) {
        for (const reference of entry.rawAttachmentReferences) {
            const resolved = resolveAttachmentReference(
                root,
                entry.file.relativePath,
                reference.target
            )
            if (resolved === null) {
                continue
            }
            const key = normalizePathForCompare(resolved.absolutePath, WIN32_CASE_INSENSITIVE)
            let item = pending.get(key)
            if (item === undefined) {
                item = {
                    path: resolved.absolutePath,
                    relativePath: resolved.relativePath,
                    referencedBy: [],
                    referencedKeys: new Set()
                }
                pending.set(key, item)
            }
            const sourceKey = normalizePathForCompare(entry.file.path, WIN32_CASE_INSENSITIVE)
            if (item.referencedKeys.has(sourceKey)) {
                continue
            }
            item.referencedKeys.add(sourceKey)
            item.referencedBy.push(entry.file.path)
        }
    }
    const attachments: WorkspaceAttachment[] = []
    for (const item of pending.values()) {
        attachments.push({
            path: item.path,
            relativePath: item.relativePath,
            exists: await attachmentFileExists(item.path),
            referencedBy: item.referencedBy
        })
    }
    attachments.sort(
        (left, right) =>
            left.relativePath.localeCompare(right.relativePath) ||
            left.path.localeCompare(right.path)
    )
    return attachments
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
        attachments: [],
        stats: {
            fileCount: 0,
            linkCount: 0,
            missingCount: 0,
            ambiguousCount: 0,
            attachmentCount: 0,
            missingAttachmentCount: 0
        }
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
        const attachments = await buildAttachmentIndex(root, state.entries)
        const missingAttachmentCount = attachments.filter(
            (attachment) => attachment.exists !== true
        ).length
        return {
            rootPath: root.lexical,
            generatedAt: Date.now(),
            files,
            tags: buildTagIndex(files),
            missingLinks,
            attachments,
            stats: {
                fileCount: files.length,
                linkCount,
                missingCount,
                ambiguousCount,
                attachmentCount: attachments.length,
                missingAttachmentCount
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
