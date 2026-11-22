/**
 * 1.5.2 E1 剪藏（剪贴板 → 新笔记 / 插入当前笔记）—— shared 纯数据 + 纯函数（唯一真源）
 *
 * 设计约束（ARCH-05）：
 * - 本模块属 `src/shared` 叶子层：不依赖 Node / Electron / Vue / DOM，不做任何 IO；
 * - 只负责「目录/文件名 / 来源元数据提取 / YAML 安全转义 / 笔记模板」等可被主进程、
 *   渲染层与单测共同复用的纯逻辑；
 * - 时间口径与 E6 一致：一律使用**本地时间**（文件名与 front matter 中的日期时间同源，
 *   避免跨时区用户看到文件名与内容不一致）。
 *
 * 与 E6 `daily-entries.ts` 的分工（单一真源，二选一落地）：
 * - E1 不复用 `DAILY_ENTRY_DIRECTORIES` / `buildEntryFileName` 扩展 `clip` 分支，而是由本模块
 *   提供 `CLIP_CAPTURE_DIR` / `clipEntryFileName` / `clipEntryTemplate`，避免 E6 入口类型被
 *   剪藏专用正文语义污染；日期时间格式化仍复用 `daily-entries.ts` 的既有纯函数（单一真源）；
 * - 两处 `inbox` 目录名一致性由单测守护（`CLIP_CAPTURE_DIR === DAILY_ENTRY_DIRECTORIES.inbox`）。
 *
 * 安全边界：
 * - 标题 / 来源 URL / front matter 全部经本模块纯函数归一化与 YAML 双引号转义，禁止字符串裸拼；
 * - 来源 URL 仅接受绝对 http/https（`sanitizeClipSourceUrl`），不允许 javascript:/data: 等协议；
 * - 正文长度上限 `CLIP_CONTENT_MAX_BYTES` 由主进程写盘前强制校验（本模块只提供判定纯函数）。
 */
import { formatEntryDate, formatEntryDateTime, formatEntryTime } from './daily-entries'

/** 剪藏笔记落盘目录（工作区根下一级目录，与 E6 快速收件箱共用 inbox/，不新增可配置路径） */
export const CLIP_CAPTURE_DIR = 'inbox'

/** 剪藏正文（Markdown）长度上限（UTF-8 字节，512 KiB）：主进程写盘前校验 */
export const CLIP_CONTENT_MAX_BYTES = 512 * 1024

/** 剪藏标题最大长度（按 Unicode 码点计，120）：front matter 与文件名安全 */
export const CLIP_TITLE_MAX_LENGTH = 120

/** 纯文本首行回退标题的最大长度（按 Unicode 码点计，60） */
export const CLIP_TEXT_TITLE_MAX_LENGTH = 60

/** 剪藏正文为空时的占位内容（不让用户得到一篇完全空白的笔记） */
export const CLIP_EMPTY_CONTENT_PLACEHOLDER = '> （未从剪贴板提取到可用正文）'

/** 来源 URL 最大长度（防御异常超长 payload；正常网页地址远小于该值） */
const CLIP_SOURCE_URL_MAX_LENGTH = 2048

/** 来源元数据（全部可选：缺标题/来源时由模板与渲染层按约定降级） */
export interface ClipSourceMetadata {
    /** 标题（来源 `<title>` → 首个 `<h1>` → 纯文本首行） */
    title?: string
    /** 来源地址（仅绝对 http/https；来自 `<base href>` 或片段首个绝对链接） */
    sourceUrl?: string
}

/** front matter / 笔记内容构建参数 */
export interface ClipFrontMatterOptions extends ClipSourceMetadata {
    /** 捕获时间（缺省取当前时间；主进程传入同一次 now，保证文件名与内容一致） */
    capturedAt?: Date
}

/** 剪藏笔记模板载荷（主进程 handler 已做长度校验后传入） */
export interface ClipNotePayload {
    /** Markdown 正文（可缺省：空正文给占位内容） */
    content?: string
    /** 可选标题（模板内部会再次归一化） */
    title?: string
    /** 可选来源 URL（模板内部会再次校验协议） */
    sourceUrl?: string
}

/** 非首尾的连续空白（标题压缩为单空格，避免换行/制表符进入 YAML 与文件名） */
const WHITESPACE_RUN_PATTERN = /\s+/g

/** 单个码点是否为 C0/C1 控制字符（NUL/DEL 以及 U+0080~U+009F） */
function isControlCode(codePoint: number): boolean {
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
}

/**
 * 逐字符控制字符处理（仓库约定：用逐字符判断代替控制字符正则，避免 ESLint
 * `no-control-regex` 告警，见 `shared/utils/validate.ts` 的同类实现）。
 *
 * @param value 原始字符串
 * @param replacement 控制字符替换文本（标题用单空格、URL 用空串）
 */
function replaceControlCharacters(value: string, replacement: string): string {
    let output = ''
    for (const character of value) {
        output += isControlCode(character.codePointAt(0) ?? 0) ? replacement : character
    }
    return output
}

/** 逐字符移除控制字符（YAML 显式转义后剩余的 C0/C1 控制字符） */
function stripControlCharacters(value: string): string {
    return replaceControlCharacters(value, '')
}

/** 统计 UTF-8 字节数（shared 层不能依赖 TextEncoder/DOM，手写按码点累计） */
export function utf8ByteLength(text: string): number {
    let bytes = 0
    for (const character of text) {
        const codePoint = character.codePointAt(0) ?? 0
        bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    }
    return bytes
}

/** 按 Unicode 码点截断（避免从代理对中间切断产生乱码） */
function truncateToLength(value: string, maxLength: number): string {
    const characters = Array.from(value)
    if (characters.length <= maxLength) {
        return value
    }
    return characters.slice(0, maxLength).join('').trimEnd()
}

/**
 * 归一化剪藏标题：剥离控制字符 → 压缩连续空白 → trim → 截断到 `CLIP_TITLE_MAX_LENGTH`。
 *
 * @returns 归一化后的标题；入参非字符串/清洗后为空时返回 undefined
 */
export function sanitizeClipTitle(raw: unknown): string | undefined {
    if (typeof raw !== 'string') {
        return undefined
    }
    const normalized = replaceControlCharacters(raw, ' ')
        .replace(WHITESPACE_RUN_PATTERN, ' ')
        .trim()
    if (!normalized) {
        return undefined
    }
    return truncateToLength(normalized, CLIP_TITLE_MAX_LENGTH)
}

/**
 * 校验并归一化来源 URL：仅接受绝对 http/https 地址。
 *
 * @returns 归一化 URL；非字符串/含控制字符/协议不安全/超长时返回 undefined
 */
export function sanitizeClipSourceUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string') {
        return undefined
    }
    // URL 中的控制字符不代表任何合法位置：直接移除而不是替换为空格
    const value = replaceControlCharacters(raw, '').trim()
    if (!value || value.length > CLIP_SOURCE_URL_MAX_LENGTH) {
        return undefined
    }
    if (!/^https?:\/\/[^\s]+$/i.test(value)) {
        return undefined
    }
    return value
}

/** 常用 HTML 命名实体 → 文本（只覆盖标题/链接中常见的少量实体，避免引入解析库） */
const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
}

/** 码点 → 文本（越界/非法码点返回 null，调用方保留原实体文本） */
function codePointToText(codePoint: number): string | null {
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
        return null
    }
    try {
        return String.fromCodePoint(codePoint)
    } catch {
        return null
    }
}

/**
 * 解码 HTML 实体（命名实体 + 十进制/十六进制数字实体）。
 *
 * 说明：仅用于「从剪贴板 HTML 中提取标题/URL」这类展示性文本，不做完整 HTML 解析；
 * 未知实体原样保留，避免误删用户内容。
 */
function decodeHtmlEntities(value: string): string {
    return value.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
            return codePointToText(Number.parseInt(entity.slice(2), 16)) ?? match
        }
        if (entity.startsWith('#')) {
            return codePointToText(Number.parseInt(entity.slice(1), 10)) ?? match
        }
        const named = NAMED_HTML_ENTITIES[entity.toLowerCase()]
        return named ?? match
    })
}

/** HTML 片段 → 纯文本（去标签 + 解码实体 + 压缩空白），用于 `<title>` / `<h1>` 取值 */
function htmlFragmentToText(fragment: string): string {
    return decodeHtmlEntities(fragment.replace(/<[^>]*>/g, ' '))
        .replace(WHITESPACE_RUN_PATTERN, ' ')
        .trim()
}

/** `<title>` 取值 */
const HTML_TITLE_PATTERN = /<title\b[^>]*>([\s\S]*?)<\/title>/i
/** 首个 `<h1>` 取值 */
const HTML_H1_PATTERN = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
/** `<base href>` 取值（双引号/单引号/无引号三种写法） */
const HTML_BASE_HREF_PATTERN = /<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
/** 片段首个绝对 http(s) 链接（href 属性，双引号/单引号/无引号三种写法） */
const HTML_ABSOLUTE_LINK_PATTERN =
    /\bhref\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)'|(https?:\/\/[^\s>]+))/i

/** 取正则捕获组中第一个命中的分组值 */
function firstMatchedGroup(match: RegExpMatchArray): string {
    return match[1] ?? match[2] ?? match[3] ?? ''
}

/**
 * 从剪贴板 HTML / 纯文本提取来源元数据（剪藏 front matter 与来源引用行的共同真源）。
 *
 * 取值规则（按优先级）：
 * 1. 标题：`<title>` → 首个 `<h1>` → 纯文本首个非空行（截断 60 字）；
 * 2. 来源 URL：`<base href>` → 片段首个绝对 http(s) 链接（仅这两个来源，纯文本不扫描）。
 *
 * @param html 剪贴板 `text/html`（可为空/不可用）
 * @param text 剪贴板 `text/plain`（可为空/不可用）
 * @returns 只包含成功提取字段的对象（无来源信息时返回空对象 `{}`）
 */
export function extractClipMetadata(
    html?: string | null,
    text?: string | null
): ClipSourceMetadata {
    const metadata: ClipSourceMetadata = {}
    const htmlSource = typeof html === 'string' ? html : ''
    const textSource = typeof text === 'string' ? text : ''

    let title: string | undefined
    const titleMatch = htmlSource.match(HTML_TITLE_PATTERN)
    if (titleMatch) {
        title = sanitizeClipTitle(htmlFragmentToText(titleMatch[1]))
    }
    if (!title) {
        const headingMatch = htmlSource.match(HTML_H1_PATTERN)
        if (headingMatch) {
            title = sanitizeClipTitle(htmlFragmentToText(headingMatch[1]))
        }
    }
    if (!title && textSource) {
        const firstLine = textSource
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map((line) => line.replace(WHITESPACE_RUN_PATTERN, ' ').trim())
            .find((line) => line.length > 0)
        if (firstLine) {
            title = sanitizeClipTitle(truncateToLength(firstLine, CLIP_TEXT_TITLE_MAX_LENGTH))
        }
    }
    if (title) {
        metadata.title = title
    }

    let sourceUrl: string | undefined
    const baseMatch = htmlSource.match(HTML_BASE_HREF_PATTERN)
    if (baseMatch) {
        sourceUrl = sanitizeClipSourceUrl(decodeHtmlEntities(firstMatchedGroup(baseMatch)))
    }
    if (!sourceUrl) {
        const linkMatch = htmlSource.match(HTML_ABSOLUTE_LINK_PATTERN)
        if (linkMatch) {
            sourceUrl = sanitizeClipSourceUrl(decodeHtmlEntities(firstMatchedGroup(linkMatch)))
        }
    }
    if (sourceUrl) {
        metadata.sourceUrl = sourceUrl
    }

    return metadata
}

/**
 * YAML 双引号标量转义（front matter 值安全，禁止字符串裸拼）：
 * `\` `"` 换行 回车 制表 换页 垂直制表 NUL 显式转义，其余 C0/C1 控制字符移除。
 */
function escapeYamlDoubleQuoted(value: string): string {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
        .replace(/\f/g, '\\f')
        .replace(/\v/g, '\\v')
    // 显式转义后仍残留的 C0/C1 控制字符（如 U+0001/U+0000）直接移除：
    // YAML 双引号标量不允许裸控制字符，而这类字符不承载任何可展示语义。
    return stripControlCharacters(escaped)
}

/** 把任意字符串包装为 YAML 双引号标量 */
function yamlScalar(value: string): string {
    return `"${escapeYamlDoubleQuoted(value)}"`
}

/** 无标题时的兜底标题（来源信息缺失时 front matter 仍有可用标题） */
function defaultClipTitle(capturedAt: Date): string {
    return `Clip ${formatEntryDate(capturedAt)} ${formatEntryDateTime(capturedAt).slice(11)}`
}

/** 归一化捕获时间：非合法 Date 时回退当前时间（防御异常入参） */
function normalizeCapturedAt(value: Date | undefined): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value
    }
    return new Date()
}

/**
 * 构建剪藏笔记 front matter（YAML）：`date` / `createdAt` / `source: clip` / `title`，
 * 有来源 URL 时追加 `sourceUrl`；所有值经双引号转义（引号/换行/冒号/反斜杠等）。
 *
 * 标题在此处只做 trim + 长度截断（保留换行等字符，交由 YAML 双引号转义安全输出）；
 * 主进程/渲染层入参已先经 `sanitizeClipTitle` 归一化，这里是纯函数的防御性兜底。
 *
 * @param meta 来源元数据 + 捕获时间（缺省当前时间）
 */
export function buildClipFrontMatter(meta: ClipFrontMatterOptions = {}): string {
    const capturedAt = normalizeCapturedAt(meta.capturedAt)
    const rawTitle = typeof meta.title === 'string' ? meta.title.trim() : ''
    const title = rawTitle
        ? truncateToLength(rawTitle, CLIP_TITLE_MAX_LENGTH)
        : defaultClipTitle(capturedAt)
    const sourceUrl = sanitizeClipSourceUrl(meta.sourceUrl)
    const lines = [
        '---',
        `date: ${yamlScalar(formatEntryDate(capturedAt))}`,
        `createdAt: ${yamlScalar(formatEntryDateTime(capturedAt))}`,
        `source: ${yamlScalar('clip')}`,
        `title: ${yamlScalar(title)}`
    ]
    if (sourceUrl) {
        lines.push(`sourceUrl: ${yamlScalar(sourceUrl)}`)
    }
    lines.push('---')
    return lines.join('\n')
}

/**
 * 构建剪藏笔记完整内容：front matter + 空行 + 正文（正文为空时给占位内容）。
 *
 * @param markdown 已转换/清洗的 Markdown 正文
 * @param meta 来源元数据 + 捕获时间
 */
export function buildClipNoteContent(markdown: string, meta: ClipFrontMatterOptions = {}): string {
    const frontMatter = buildClipFrontMatter(meta)
    const body = typeof markdown === 'string' ? markdown.replace(/\r\n?/g, '\n').trim() : ''
    return `${frontMatter}\n\n${body || CLIP_EMPTY_CONTENT_PLACEHOLDER}\n`
}

/**
 * 剪藏笔记文件名（主进程生成，不接受渲染层传入文件名）：
 * `YYYY-MM-DD-HHmmss-clip.md`（放在 `inbox/` 下，与快速收件箱文件区分）。
 *
 * @returns 文件名；非法 Date 返回 null（主进程 handler 已先做时间生成，正常不可达）
 */
export function clipEntryFileName(now: Date): string | null {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        return null
    }
    return `${formatEntryDate(now)}-${formatEntryTime(now)}-clip.md`
}

/**
 * 剪藏笔记模板内容（主进程 handler 唯一入口）：front matter + 正文。
 *
 * @param now 捕获时间（文件名与 front matter 使用同一次 now）
 * @param payload 正文 + 可选标题/来源 URL（模板内部再次归一化/转义）
 */
export function clipEntryTemplate(now: Date, payload: ClipNotePayload): string {
    return buildClipNoteContent(payload.content ?? '', {
        title: payload.title,
        sourceUrl: payload.sourceUrl,
        capturedAt: now
    })
}
