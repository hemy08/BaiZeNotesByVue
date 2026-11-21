/**
 * 写作统计核心库（纯函数，零依赖：不 import Monaco / Vue / Electron / DOM）
 *
 * 用途：为状态栏、写作模式、编辑器底部信息栏提供「字数 / 段落 / 句子 / 阅读时间」统计，
 * 并统一「什么算有效写作内容」的口径，避免各处各写一套正则导致数字互相矛盾。
 *
 * 口径约定（与 `stripMarkdownForStats` 的剔除规则一一对应）：
 * 1. 有效字数只统计 Markdown **正文文字**：标题/列表/引用/表格等标记字符、
 *    围栏代码块与行内代码（含内容）、链接目标、HTML 标签/注释、强调与删除线标记一律剔除；
 * 2. 围栏代码块（``` / ~~~）与行内代码属于「代码」而非「写作正文」，整段剔除；
 * 3. HTML 标签本身剔除，标签之间的文字保留；HTML 注释整段剔除；
 * 4. 字符按 **Unicode 码点** 计数（Emoji 记 1；ZWJ 组合序列按组成码点逐个计）；
 * 5. `totalChars` 不计换行符（行数不虚增字数），但计入空格与标点；
 *    `charsNoSpaces` 进一步剔除所有空白字符；
 * 6. `paragraphs` = 剔除标记后的非空行数（与插件工具「字数统计」的段落口径一致）；
 * 7. `readingMinutes` = 中文字符 / 中文阅读速度 + 英文数字词 / 英文阅读速度，向上取整，
 *    无内容时为 0。
 *
 * 性能：文本剔除与统计均为**单次线性扫描**（O(n)），不使用带量词嵌套/回溯风险的正则；
 * 对病态输入另设扫描预算与失败缓存（详见 `stripInlineMarkers`），保证最坏情况仍是 O(n)；
 * 输入超过 `MAX_STATS_INPUT_CHARS` 时截断统计，避免超大文档阻塞 UI 线程。
 */

/** 阅读速度配置（可只覆盖其中一项） */
export interface WritingStatsOptions {
    /** 中文阅读速度（字/分钟），默认 300；非有限正数时回落默认值 */
    chineseCharsPerMinute?: number
    /** 英文/数字词阅读速度（词/分钟），默认 200；非有限正数时回落默认值 */
    latinWordsPerMinute?: number
}

/** 写作统计结果（全文与选区共用同一结构） */
export interface WritingStats {
    /** 有效字符数：剔除 Markdown 标记/代码块后，含空格与标点、不计换行，按 Unicode 码点计 */
    totalChars: number
    /** 有效字符数（不计任何空白字符） */
    charsNoSpaces: number
    /** 中文字/日文假名/韩文字符数（含 CJK 扩展 A 与兼容表意文字） */
    cjkChars: number
    /** 英文单词 / 数字词数量（`well-known`、`3.14` 视为一个词） */
    latinWords: number
    /** 段落数（剔除标记后的非空行数） */
    paragraphs: number
    /** 句子数（以句末标点计界；末尾无标点的残句也计一句） */
    sentences: number
    /** 预计阅读时间（分钟，向上取整；无内容为 0） */
    readingMinutes: number
}

/** 默认中文阅读速度（字/分钟） */
export const DEFAULT_CHINESE_READING_SPEED = 300
/** 默认英文阅读速度（词/分钟） */
export const DEFAULT_LATIN_READING_SPEED = 200
/** 单次统计允许分析的最大字符数（UTF-16 码元）；超出部分截断，避免超大文档阻塞 UI */
export const MAX_STATS_INPUT_CHARS = 1024 * 1024

/* ==================== 字符分类 ==================== */

/** CJK 码点区间：[起, 止]（含端点） */
const CJK_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
    [0x3400, 0x4dbf], // CJK 统一表意文字扩展 A（生僻汉字）
    [0x4e00, 0x9fff], // CJK 统一表意文字基本区（常用汉字）
    [0xf900, 0xfaff], // CJK 兼容表意文字
    [0x3040, 0x30ff], // 日文平假名 / 片假名
    [0xac00, 0xd7af] // 韩文音节
]

/** 是否 CJK（中文/日韩）字符 */
function isCjkCodePoint(codePoint: number): boolean {
    for (const range of CJK_CODE_POINT_RANGES) {
        if (codePoint >= range[0] && codePoint <= range[1]) {
            return true
        }
    }
    return false
}

/** 是否空白字符（含全角空格；换行由调用方单独处理） */
function isWhitespaceCodePoint(codePoint: number): boolean {
    return (
        codePoint === 0x20 ||
        (codePoint >= 0x09 && codePoint <= 0x0d) ||
        codePoint === 0xa0 ||
        codePoint === 0x1680 ||
        (codePoint >= 0x2000 && codePoint <= 0x200a) ||
        codePoint === 0x2028 ||
        codePoint === 0x2029 ||
        codePoint === 0x202f ||
        codePoint === 0x205f ||
        codePoint === 0x3000 ||
        codePoint === 0xfeff
    )
}

/** 是否英文字母或阿拉伯数字（构成英文/数字词的最小字符） */
function isLatinWordCodePoint(codePoint: number): boolean {
    return (
        (codePoint >= 0x30 && codePoint <= 0x39) ||
        (codePoint >= 0x41 && codePoint <= 0x5a) ||
        (codePoint >= 0x61 && codePoint <= 0x7a)
    )
}

function isDigitCodePoint(codePoint: number): boolean {
    return codePoint >= 0x30 && codePoint <= 0x39
}

/** 词内连接符：撇号 / 连字符（`well-known`、`don't` 视为一个词） */
function isWordConnectorCodePoint(codePoint: number): boolean {
    return codePoint === 0x27 || codePoint === 0x2019 || codePoint === 0x2d
}

/**
 * 词内标点判定：连接符后必须紧跟词字符；小数点仅当两侧都是数字时保留在词内（`3.14` 记一个词）。
 * 不满足时该标点结束当前词。
 */
function isWordInternalPunctuation(
    codePoint: number,
    previousCodePoint: number,
    nextCodePoint: number
): boolean {
    if (codePoint === 0x2e) {
        return isDigitCodePoint(previousCodePoint) && isDigitCodePoint(nextCodePoint)
    }
    return isWordConnectorCodePoint(codePoint) && isLatinWordCodePoint(nextCodePoint)
}

/** 是否句末标点（`.` 需额外满足「后为空白/结束且前一位不是数字」，由调用方传入上下文） */
function isSentenceTerminator(
    codePoint: number,
    previousCodePoint: number,
    nextCodePoint: number
): boolean {
    switch (codePoint) {
        case 0x3002: // 。
        case 0xff01: // ！
        case 0xff1f: // ？
        case 0x2026: // …
        case 0x21: // !
        case 0x3f: // ?
            return true
        case 0x2e: {
            // 英文句点：小数、域名、缩写内部不计句界（后一位必须是空白或文本结束）
            if (isDigitCodePoint(previousCodePoint)) {
                return false
            }
            return nextCodePoint === -1 || isWhitespaceCodePoint(nextCodePoint)
        }
        default:
            return false
    }
}

/** 是否标点/符号（用于句子判定：句界之后的标点不应再算作「有新句子内容」） */
function isPunctuationCodePoint(codePoint: number): boolean {
    if (
        (codePoint >= 0x21 && codePoint <= 0x2f) ||
        (codePoint >= 0x3a && codePoint <= 0x40) ||
        (codePoint >= 0x5b && codePoint <= 0x60) ||
        (codePoint >= 0x7b && codePoint <= 0x7e)
    ) {
        return true
    }
    // CJK 标点（、。《》「」等）
    if (codePoint >= 0x3001 && codePoint <= 0x303f) {
        return true
    }
    // 通用标点（破折号/引号/省略号等）
    if (codePoint >= 0x2000 && codePoint <= 0x206f) {
        return true
    }
    // 全角 ASCII 变体（，：；（）等）
    if (
        (codePoint >= 0xff01 && codePoint <= 0xff0f) ||
        (codePoint >= 0xff1a && codePoint <= 0xff20) ||
        (codePoint >= 0xff3b && codePoint <= 0xff40) ||
        (codePoint >= 0xff5b && codePoint <= 0xff65)
    ) {
        return true
    }
    return codePoint === 0xb7 || codePoint === 0x2022
}

/* ==================== Markdown 剔除 ==================== */

/* 常用字符码（内层扫描用 charCodeAt，避免大量单字符字符串比较） */
const CHAR_TAB = 0x09
const CHAR_LF = 0x0a
const CHAR_CR = 0x0d
const CHAR_SPACE = 0x20
const CHAR_BANG = 0x21
const CHAR_HASH = 0x23
const CHAR_STAR = 0x2a
const CHAR_PLUS = 0x2b
const CHAR_HYPHEN = 0x2d
const CHAR_DOT = 0x2e
const CHAR_SLASH = 0x2f
const CHAR_ZERO = 0x30
const CHAR_NINE = 0x39
const CHAR_COLON = 0x3a
const CHAR_LEFT_ANGLE = 0x3c
const CHAR_EQUALS = 0x3d
const CHAR_GREATER = 0x3e
const CHAR_QUESTION = 0x3f
const CHAR_A_UPPER = 0x41
const CHAR_Z_UPPER = 0x5a
const CHAR_LEFT_BRACKET = 0x5b
const CHAR_BACKSLASH = 0x5c
const CHAR_RIGHT_BRACKET = 0x5d
const CHAR_CARET = 0x5e
const CHAR_UNDERSCORE = 0x5f
const CHAR_BACKTICK = 0x60
const CHAR_A_LOWER = 0x61
const CHAR_Z_LOWER = 0x7a
const CHAR_PIPE = 0x7c
const CHAR_RIGHT_PAREN = 0x29
const CHAR_LEFT_PAREN = 0x28
const CHAR_UPPER_X = 0x58
const CHAR_LOWER_X = 0x78
const CHAR_TILDE = 0x7e

/** 行首块级标记剥离结果；`null` 表示整行无需计入正文（水平线/引用定义等） */
type BlockMarkerResult = string | null

/** 去掉行首一个空白字符（空格/制表符），返回新字符串（无变化时返回原串） */
function trimLeadingWhitespace(text: string): string {
    let cursor = 0
    while (cursor < text.length) {
        const code = text.charCodeAt(cursor)
        if (code !== CHAR_SPACE && code !== CHAR_TAB) {
            break
        }
        cursor++
    }
    return cursor === 0 ? text : text.slice(cursor)
}

/**
 * 剥离行首引用标记（可多级）：`> 引用`、`> > 嵌套`、缩进 ≤3 个空格的引用。
 * 只去掉标记本身，正文原样返回。
 */
function stripLeadingBlockquoteMarkers(line: string): string {
    let cursor = 0
    for (;;) {
        let probe = cursor
        let spaces = 0
        while (probe < line.length && spaces < 3 && line.charCodeAt(probe) === CHAR_SPACE) {
            probe++
            spaces++
        }
        if (probe >= line.length || line.charCodeAt(probe) !== CHAR_GREATER) {
            break
        }
        probe++
        if (probe < line.length) {
            const afterCode = line.charCodeAt(probe)
            if (afterCode === CHAR_SPACE || afterCode === CHAR_TAB) {
                probe++
            }
        }
        cursor = probe
    }
    return cursor === 0 ? line : line.slice(cursor)
}

/** 围栏代码块标记：字符（` 或 ~）与围栏长度 */
interface FenceMarker {
    char: number
    length: number
}

/** 识别围栏代码块起始行；不是起始行返回 null */
function getFenceOpener(line: string): FenceMarker | null {
    let cursor = 0
    while (cursor < 3 && cursor < line.length && line.charCodeAt(cursor) === CHAR_SPACE) {
        cursor++
    }
    const char = line.charCodeAt(cursor)
    if (char !== CHAR_BACKTICK && char !== CHAR_TILDE) {
        return null
    }
    let run = 0
    while (line.charCodeAt(cursor + run) === char) {
        run++
    }
    if (run < 3) {
        return null
    }
    return { char, length: run }
}

/** 是否围栏代码块结束行（同字符、长度不小于起始围栏、其后只有空白） */
function isFenceClosingLine(line: string, marker: FenceMarker): boolean {
    let cursor = 0
    while (cursor < 3 && cursor < line.length && line.charCodeAt(cursor) === CHAR_SPACE) {
        cursor++
    }
    let run = 0
    while (line.charCodeAt(cursor + run) === marker.char) {
        run++
    }
    if (run < marker.length) {
        return false
    }
    let rest = cursor + run
    while (rest < line.length) {
        const code = line.charCodeAt(rest)
        if (code !== CHAR_SPACE && code !== CHAR_TAB) {
            return false
        }
        rest++
    }
    return true
}

/** 水平线：仅由 3 个及以上的 `-` / `*` / `_`（允许中间夹空白）构成 */
function isThematicBreakLine(text: string): boolean {
    let markerCode = 0
    let markerCount = 0
    for (let cursor = 0; cursor < text.length; cursor++) {
        const code = text.charCodeAt(cursor)
        if (code === CHAR_SPACE || code === CHAR_TAB) {
            continue
        }
        if (code !== CHAR_HYPHEN && code !== CHAR_STAR && code !== CHAR_UNDERSCORE) {
            return false
        }
        if (markerCode === 0) {
            markerCode = code
        } else if (markerCode !== code) {
            return false
        }
        markerCount++
    }
    return markerCount >= 3
}

/** Setext 标题下划线：整行只有 `=`（`---` 已按水平线处理） */
function isSetextUnderlineLine(text: string): boolean {
    let equalsCount = 0
    for (let cursor = 0; cursor < text.length; cursor++) {
        const code = text.charCodeAt(cursor)
        if (code === CHAR_SPACE || code === CHAR_TAB) {
            continue
        }
        if (code !== CHAR_EQUALS) {
            return false
        }
        equalsCount++
    }
    return equalsCount > 0
}

/** 表格分隔行：仅由 `|`、`-`、`:` 与空白构成，且同时含 `|` 与 `-` */
function isTableSeparatorLine(text: string): boolean {
    let hasDash = false
    let hasPipe = false
    for (let cursor = 0; cursor < text.length; cursor++) {
        const code = text.charCodeAt(cursor)
        if (code === CHAR_SPACE || code === CHAR_TAB) {
            continue
        }
        if (code === CHAR_PIPE) {
            hasPipe = true
        } else if (code === CHAR_HYPHEN) {
            hasDash = true
        } else if (code !== CHAR_COLON) {
            return false
        }
    }
    return hasDash && hasPipe
}

/** 链接引用定义行：`[id]: https://...`（整行剔除，目标 URL 不计入字数） */
function isReferenceDefinitionLine(text: string): boolean {
    if (text.charCodeAt(0) !== CHAR_LEFT_BRACKET) {
        return false
    }
    const close = text.indexOf(']')
    if (close < 0) {
        return false
    }
    return text.charCodeAt(close + 1) === CHAR_COLON
}

/** 去掉标题行末尾的闭合 `###`（仅当 `#` 前是空白或行首时视为闭合标记） */
function stripTrailingHeadingHashes(text: string): string {
    let end = text.length
    while (end > 0) {
        const code = text.charCodeAt(end - 1)
        if (code !== CHAR_SPACE && code !== CHAR_TAB) {
            break
        }
        end--
    }
    const hashEnd = end
    while (end > 0 && text.charCodeAt(end - 1) === CHAR_HASH) {
        end--
    }
    if (end === hashEnd) {
        return text.slice(0, hashEnd)
    }
    if (end === 0) {
        return ''
    }
    const beforeHash = text.charCodeAt(end - 1)
    if (beforeHash === CHAR_SPACE || beforeHash === CHAR_TAB) {
        return text.slice(0, end).trimEnd()
    }
    return text.slice(0, hashEnd)
}

/**
 * 剥离 ATX 标题标记（`#` ~ `######`）；不是标题行返回 null。
 * 标题文字保留（标题正文属于写作内容）。
 */
function stripAtxHeadingMarker(text: string): string | null {
    let cursor = 0
    while (cursor < text.length && text.charCodeAt(cursor) === CHAR_HASH) {
        cursor++
    }
    if (cursor === 0 || cursor > 6) {
        return null
    }
    if (cursor < text.length) {
        const afterCode = text.charCodeAt(cursor)
        if (afterCode !== CHAR_SPACE && afterCode !== CHAR_TAB) {
            return null
        }
        while (
            cursor < text.length &&
            (text.charCodeAt(cursor) === CHAR_SPACE || text.charCodeAt(cursor) === CHAR_TAB)
        ) {
            cursor++
        }
    }
    return stripTrailingHeadingHashes(text.slice(cursor))
}

/**
 * 剥离列表标记（无序 `-` / `*` / `+`，有序 `1.` / `1)`，最多 9 位序号）；
 * 不是列表行返回 null。空列表项返回空串。
 */
function stripListMarker(text: string): string | null {
    if (!text) {
        return null
    }
    const firstCode = text.charCodeAt(0)
    if (firstCode === CHAR_HYPHEN || firstCode === CHAR_STAR || firstCode === CHAR_PLUS) {
        if (text.length === 1) {
            return ''
        }
        const secondCode = text.charCodeAt(1)
        if (secondCode !== CHAR_SPACE && secondCode !== CHAR_TAB) {
            return null
        }
        let cursor = 1
        while (
            cursor < text.length &&
            (text.charCodeAt(cursor) === CHAR_SPACE || text.charCodeAt(cursor) === CHAR_TAB)
        ) {
            cursor++
        }
        return text.slice(cursor)
    }
    let cursor = 0
    while (cursor < text.length && cursor < 9) {
        const code = text.charCodeAt(cursor)
        if (code < CHAR_ZERO || code > CHAR_NINE) {
            break
        }
        cursor++
    }
    if (cursor === 0 || cursor >= text.length) {
        return null
    }
    const separatorCode = text.charCodeAt(cursor)
    if (separatorCode !== CHAR_DOT && separatorCode !== CHAR_RIGHT_PAREN) {
        return null
    }
    cursor++
    if (cursor >= text.length) {
        return ''
    }
    const afterCode = text.charCodeAt(cursor)
    if (afterCode !== CHAR_SPACE && afterCode !== CHAR_TAB) {
        return null
    }
    while (
        cursor < text.length &&
        (text.charCodeAt(cursor) === CHAR_SPACE || text.charCodeAt(cursor) === CHAR_TAB)
    ) {
        cursor++
    }
    return text.slice(cursor)
}

/** 剥离任务列表复选框（`[ ]` / `[x]` / `[X]`）；不是复选框返回 null */
function stripTaskCheckbox(text: string): string | null {
    if (
        text.length < 3 ||
        text.charCodeAt(0) !== CHAR_LEFT_BRACKET ||
        text.charCodeAt(2) !== CHAR_RIGHT_BRACKET
    ) {
        return null
    }
    const stateCode = text.charCodeAt(1)
    if (stateCode !== CHAR_SPACE && stateCode !== CHAR_LOWER_X && stateCode !== CHAR_UPPER_X) {
        return null
    }
    let cursor = 3
    if (cursor >= text.length) {
        return ''
    }
    const afterCode = text.charCodeAt(cursor)
    if (afterCode !== CHAR_SPACE && afterCode !== CHAR_TAB) {
        return null
    }
    while (
        cursor < text.length &&
        (text.charCodeAt(cursor) === CHAR_SPACE || text.charCodeAt(cursor) === CHAR_TAB)
    ) {
        cursor++
    }
    return text.slice(cursor)
}

/**
 * 剥离行首块级 Markdown 标记：缩进、标题 `#`、列表、任务复选框；
 * 水平线 / Setext 下划线 / 表格分隔行 / 链接引用定义返回 null（整行不计入正文）。
 * 最多循环 8 轮处理 `> - [x] 内容` 这类嵌套标记，保证有界（不会死循环）。
 */
function stripBlockMarkers(line: string): BlockMarkerResult {
    let text = trimLeadingWhitespace(line)
    for (let guard = 0; guard < 8; guard++) {
        if (
            isThematicBreakLine(text) ||
            isSetextUnderlineLine(text) ||
            isTableSeparatorLine(text) ||
            isReferenceDefinitionLine(text)
        ) {
            return null
        }
        const heading = stripAtxHeadingMarker(text)
        if (heading !== null) {
            text = trimLeadingWhitespace(heading)
            continue
        }
        const list = stripListMarker(text)
        if (list !== null) {
            text = trimLeadingWhitespace(list)
            continue
        }
        const task = stripTaskCheckbox(text)
        if (task !== null) {
            text = trimLeadingWhitespace(task)
            continue
        }
        break
    }
    return text
}

/** 行内剔除结果 */
interface InlineStripResult {
    /** 剔除标记后的行内文本 */
    text: string
    /** 行内 HTML 注释未在本行闭合（状态延续到后续行） */
    commentOpen: boolean
}

/**
 * 查找行内链接目标 `(url "title")` 的结束位置（`(` 在 openIndex）。
 *
 * 支持括号嵌套与反斜杠转义；`scanBudget` 为本次扫描预算（调用方按行长度递减），
 * 预算耗尽或未闭合时返回 -1，从而保证极端输入下整体仍是 O(n)。
 */
function findLinkTargetEnd(line: string, openIndex: number, scanBudget: number): number {
    if (scanBudget <= 0) {
        return -1
    }
    let depth = 1
    let cursor = openIndex + 1
    while (cursor < line.length) {
        const code = line.charCodeAt(cursor)
        if (code === CHAR_BACKSLASH) {
            cursor += 2
        } else if (code === CHAR_LEFT_PAREN) {
            depth++
            cursor++
        } else if (code === CHAR_RIGHT_PAREN) {
            depth--
            if (depth === 0) {
                return cursor
            }
            cursor++
        } else {
            cursor++
        }
    }
    return -1
}

/**
 * 行内标记剔除（单次线性扫描）：
 * - 行内代码（反引号）连同内容剔除；未闭合时把该行剩余内容视为代码；
 * - HTML 标签/自动链接剔除（标签间文字保留）；HTML 注释整段剔除并跨行传递状态；
 * - 图片 `![alt](src)` 保留 alt、剔除目标；行内链接 `[text](url)` 保留文字、剔除目标；
 *   引用式链接 `[text][id]`、脚注引用 `[^1]` 剔除目标/标记；普通方括号标记剔除；
 * - 强调/删除线/表格分隔标记（`*` `_` `~` `|`）剔除；反斜杠转义保留被转义字符。
 *
 * 性能保护：链接目标扫描共用一份按行长度计算的预算；`<` / `]` 的查找一旦确认
 * 「本行之后不可能再闭合」即置位失败缓存，避免 `]]](](` 之类的病态输入退化为 O(n²)。
 */
function stripInlineMarkers(line: string): InlineStripResult {
    if (!line) {
        return { text: '', commentOpen: false }
    }
    const parts: string[] = []
    const length = line.length
    let cursor = 0
    let scanBudget = length * 2 + 64
    let noAngleCloseRemaining = false
    let noBracketCloseRemaining = false

    while (cursor < length) {
        const code = line.charCodeAt(cursor)

        // 1) 反斜杠转义：保留被转义字符本身（`\*` 记作 `*` 而不是强调标记）
        if (code === CHAR_BACKSLASH) {
            const escaped = line[cursor + 1]
            if (escaped !== undefined) {
                parts.push(escaped)
                cursor += 2
            } else {
                cursor += 1
            }
            continue
        }

        // 2) 行内代码：连同内容一起剔除
        if (code === CHAR_BACKTICK) {
            let runEnd = cursor + 1
            while (runEnd < length && line.charCodeAt(runEnd) === CHAR_BACKTICK) {
                runEnd++
            }
            const fence = line.slice(cursor, runEnd)
            const close = line.indexOf(fence, runEnd)
            if (close < 0) {
                // 未闭合：该行剩余内容都按代码处理（直接结束本行扫描）
                break
            }
            cursor = close + fence.length
            continue
        }

        // 3) HTML 注释 / 标签 / 自动链接
        if (code === CHAR_LEFT_ANGLE) {
            if (line.startsWith('<!--', cursor)) {
                const commentEnd = line.indexOf('-->', cursor + 4)
                if (commentEnd < 0) {
                    return { text: parts.join(''), commentOpen: true }
                }
                cursor = commentEnd + 3
                continue
            }
            const nextCode = line.charCodeAt(cursor + 1)
            const looksLikeTag =
                nextCode === CHAR_SLASH ||
                nextCode === CHAR_BANG ||
                nextCode === CHAR_QUESTION ||
                (nextCode >= CHAR_A_UPPER && nextCode <= CHAR_Z_UPPER) ||
                (nextCode >= CHAR_A_LOWER && nextCode <= CHAR_Z_LOWER)
            if (looksLikeTag) {
                if (noAngleCloseRemaining) {
                    parts.push('<')
                    cursor += 1
                    continue
                }
                const angleEnd = line.indexOf('>', cursor + 1)
                if (angleEnd < 0) {
                    noAngleCloseRemaining = true
                    parts.push('<')
                    cursor += 1
                    continue
                }
                cursor = angleEnd + 1
                continue
            }
            parts.push('<')
            cursor += 1
            continue
        }

        // 4) 图片标记 `!`：`![alt](src)` → 只剔除 `!`，方括号分支保留 alt、剔除目标
        if (code === CHAR_BANG && line.charCodeAt(cursor + 1) === CHAR_LEFT_BRACKET) {
            cursor += 1
            continue
        }

        // 5) 左方括号：脚注引用整段剔除，其余只剔除方括号标记（链接文字保留）
        if (code === CHAR_LEFT_BRACKET) {
            if (!noBracketCloseRemaining && line.charCodeAt(cursor + 1) === CHAR_CARET) {
                const footnoteEnd = line.indexOf(']', cursor + 2)
                if (footnoteEnd < 0) {
                    noBracketCloseRemaining = true
                } else {
                    cursor = footnoteEnd + 1
                    continue
                }
            }
            cursor += 1
            continue
        }

        // 6) 右方括号：链接目标 / 引用式目标整段剔除
        if (code === CHAR_RIGHT_BRACKET) {
            if (line.charCodeAt(cursor + 1) === CHAR_LEFT_PAREN) {
                const targetEnd = findLinkTargetEnd(line, cursor + 1, scanBudget)
                if (targetEnd >= 0) {
                    scanBudget -= targetEnd - cursor
                    cursor = targetEnd + 1
                    continue
                }
                // 未闭合目标：只剔除 `]`，剩余内容按普通文本统计（同时耗尽预算防退化）
                scanBudget = 0
                cursor += 1
                continue
            }
            if (!noBracketCloseRemaining && line.charCodeAt(cursor + 1) === CHAR_LEFT_BRACKET) {
                const referenceEnd = line.indexOf(']', cursor + 2)
                if (referenceEnd < 0) {
                    noBracketCloseRemaining = true
                } else {
                    cursor = referenceEnd + 1
                    continue
                }
            }
            cursor += 1
            continue
        }

        // 7) 强调 / 删除线 / 表格分隔标记：不计入有效字符
        if (
            code === CHAR_STAR ||
            code === CHAR_UNDERSCORE ||
            code === CHAR_TILDE ||
            code === CHAR_PIPE
        ) {
            cursor += 1
            continue
        }

        // 8) 普通字符（含代理对的两个码元）原样保留
        parts.push(line[cursor])
        cursor += 1
    }

    return { text: parts.join(''), commentOpen: false }
}

/**
 * 把 Markdown 原文转成「仅含写作正文」的纯文本（供统计使用，也可单独用于预览/调试）。
 *
 * 剔除规则：
 * - 围栏代码块（``` / ~~~，含内容）整块剔除；
 * - 行内 HTML 注释（可跨行）整段剔除；HTML 标签/自动链接剔除、标签之间文字保留；
 * - 行内代码（含内容）、链接/图片目标、引用式链接目标、脚注引用整段剔除；
 * - 标题 `#`、列表 `-`/`1.`、任务复选框、引用 `>`、表格竖线、强调/删除线标记剔除；
 * - 水平线、Setext 下划线、表格分隔行、链接引用定义整行剔除；
 * - 空行不输出；保留下来的每一行代表一个段落，行间以 `\n` 连接。
 */
export function stripMarkdownForStats(markdown: string): string {
    if (typeof markdown !== 'string' || markdown.length === 0) {
        return ''
    }
    // 统一换行（CRLF / 孤立 CR → LF）；仅当存在 CR 时才重建字符串
    const normalized = markdown.indexOf('\r') >= 0 ? markdown.replace(/\r\n?/g, '\n') : markdown
    const lines = normalized.split('\n')
    const outputLines: string[] = []
    let fence: FenceMarker | null = null
    let inHtmlComment = false

    for (const rawLine of lines) {
        const quoteStripped = stripLeadingBlockquoteMarkers(rawLine)

        // 围栏代码块内部：只检测结束围栏，内容整段剔除
        if (fence) {
            if (isFenceClosingLine(quoteStripped, fence)) {
                fence = null
            }
            continue
        }
        const opener = getFenceOpener(quoteStripped)
        if (opener) {
            fence = opener
            continue
        }

        // 跨行 HTML 注释：找到结束标记后只保留其后的正文
        let content = quoteStripped
        if (inHtmlComment) {
            const commentEnd = content.indexOf('-->')
            if (commentEnd < 0) {
                continue
            }
            content = content.slice(commentEnd + 3)
            inHtmlComment = false
        }

        const blockText = stripBlockMarkers(content)
        if (blockText === null) {
            continue
        }
        const inline = stripInlineMarkers(blockText)
        if (inline.commentOpen) {
            inHtmlComment = true
        }
        const text = inline.text.trim()
        if (text) {
            outputLines.push(text)
        }
    }

    return outputLines.join('\n')
}

/* ==================== 纯文本统计 ==================== */

/** 空统计结果（每次返回新对象，避免调用方共享可变状态） */
function createEmptyStats(): WritingStats {
    return {
        totalChars: 0,
        charsNoSpaces: 0,
        cjkChars: 0,
        latinWords: 0,
        paragraphs: 0,
        sentences: 0,
        readingMinutes: 0
    }
}

/** 对外暴露的空统计工厂（状态栏/会话状态初始化用） */
export const createEmptyWritingStats = createEmptyStats

/** 归一化阅读速度：非有限正数回落默认值（防止 0 / 负数 / NaN / Infinity 导致除零或 NaN） */
function normalizeReadingSpeed(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** 按阅读速度计算阅读分钟数（向上取整；无内容为 0） */
function computeReadingMinutes(
    cjkChars: number,
    latinWords: number,
    chineseCharactersPerMinute: number,
    latinWordsPerMinute: number
): number {
    const rawMinutes = cjkChars / chineseCharactersPerMinute + latinWords / latinWordsPerMinute
    if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) {
        return 0
    }
    return Math.max(1, Math.ceil(rawMinutes))
}

/**
 * 对「已剔除 Markdown 标记的纯文本」做统计（单次线性扫描，O(n)）。
 *
 * 本函数不做 Markdown 解析；外部一般不需要直接调用，统计入口请用
 * `computeWritingStats` / `computeSelectionStats`。
 */
export function analyzePlainTextForStats(
    plainText: string,
    options?: WritingStatsOptions
): WritingStats {
    const chineseSpeed = normalizeReadingSpeed(
        options?.chineseCharsPerMinute,
        DEFAULT_CHINESE_READING_SPEED
    )
    const latinSpeed = normalizeReadingSpeed(
        options?.latinWordsPerMinute,
        DEFAULT_LATIN_READING_SPEED
    )

    let totalChars = 0
    let charsNoSpaces = 0
    let cjkChars = 0
    let latinWords = 0
    let paragraphs = 0
    let sentences = 0

    let inLatinWord = false
    let lineHasContent = false
    let hasTextSinceBoundary = false
    let previousCodePoint = -1

    const length = plainText.length
    let cursor = 0
    while (cursor < length) {
        const codePoint = plainText.codePointAt(cursor) ?? 0
        const width = codePoint > 0xffff ? 2 : 1
        const nextCodePoint =
            cursor + width < length ? (plainText.codePointAt(cursor + width) ?? -1) : -1

        // 换行：只用于段落分隔，不计入字符数
        if (codePoint === CHAR_LF || codePoint === CHAR_CR) {
            if (lineHasContent) {
                paragraphs++
                lineHasContent = false
            }
            inLatinWord = false
            previousCodePoint = codePoint
            cursor += width
            continue
        }

        totalChars++
        const whitespace = isWhitespaceCodePoint(codePoint)
        if (!whitespace) {
            charsNoSpaces++
            lineHasContent = true
        }

        if (isCjkCodePoint(codePoint)) {
            cjkChars++
            inLatinWord = false
            hasTextSinceBoundary = true
        } else if (isLatinWordCodePoint(codePoint)) {
            if (!inLatinWord) {
                latinWords++
                inLatinWord = true
            }
            hasTextSinceBoundary = true
        } else if (
            inLatinWord &&
            isWordInternalPunctuation(codePoint, previousCodePoint, nextCodePoint)
        ) {
            // `well-known` / `don't` / `3.14`：词内标点，词保持打开
        } else {
            inLatinWord = false
            if (!whitespace) {
                if (isSentenceTerminator(codePoint, previousCodePoint, nextCodePoint)) {
                    if (hasTextSinceBoundary) {
                        sentences++
                        hasTextSinceBoundary = false
                    }
                } else if (!isPunctuationCodePoint(codePoint)) {
                    // 引号/括号/逗号等标点不算「句子内容」；Emoji 等符号算内容
                    hasTextSinceBoundary = true
                }
            }
        }

        previousCodePoint = codePoint
        cursor += width
    }

    if (lineHasContent) {
        paragraphs++
    }
    if (hasTextSinceBoundary) {
        // 末尾没有句末标点的残句也计一句
        sentences++
    }

    return {
        totalChars,
        charsNoSpaces,
        cjkChars,
        latinWords,
        paragraphs,
        sentences,
        readingMinutes: computeReadingMinutes(cjkChars, latinWords, chineseSpeed, latinSpeed)
    }
}

/** 输入上限保护：超限截断（不切断代理对），保证统计耗时有界 */
function limitStatsInput(text: string): string {
    if (text.length <= MAX_STATS_INPUT_CHARS) {
        return text
    }
    let end = MAX_STATS_INPUT_CHARS
    const lastCodeUnit = text.charCodeAt(end - 1)
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
        // 截断点落在高代理项上，向前退一个码元避免拆散代理对
        end--
    }
    return text.slice(0, end)
}

/**
 * 统计 Markdown 原文的写作数据（剔除标记/代码后按正文口径统计）。
 *
 * @param markdown Markdown 原文（空串返回全 0）
 * @param options 阅读速度配置（可选）
 */
export function computeWritingStats(markdown: string, options?: WritingStatsOptions): WritingStats {
    if (typeof markdown !== 'string' || markdown.length === 0) {
        return createEmptyStats()
    }
    return analyzePlainTextForStats(stripMarkdownForStats(limitStatsInput(markdown)), options)
}

/**
 * 选区统计：与全文统计**同一口径**（选区文本仍来自 Monaco 模型，是 Markdown 原文，
 * 因此同样剔除 Markdown 标记/代码块后再统计），保证「全文 X 字」与「选中 Y 字」可互相校验。
 *
 * @param selectedText 选区内的 Markdown 原文（空串返回全 0）
 * @param options 阅读速度配置（可选）
 */
export function computeSelectionStats(
    selectedText: string,
    options?: WritingStatsOptions
): WritingStats {
    return computeWritingStats(selectedText, options)
}
