/**
 * preview-md-media.ts
 * 批次 B：媒体 / 代码块类 mkdocs-material / pymdownx 语法扩展（markdown-it 原生插件）。
 *
 * 覆盖 3 项语法：
 * 1. **Grid cards**（`<div class="grid cards" markdown>`）：
 *    识别带 `markdown` 属性的 `<div class="grid cards">` / `<div class="grid">` 容器，
 *    把容器内部内容交给 markdown-it **递归解析**（列表、图标、`---` 分隔线、行内代码、链接、
 *    嵌套容器等），输出与原类名一致的 `<div class="grid cards">…</div>`；
 *    未带 `markdown` 属性的普通 HTML 容器保持原样直通（由 html_block 规则处理）；
 *    未闭合容器优雅回退（只把开标签作为原始 HTML 输出，后续 Markdown 继续正常解析）。
 * 2. **代码块增强**（pymdownx.highlight / inlinehilite）：
 *    围栏 info 属性 `linenums` / `hl_lines` / `title`；行内 `#!lang code`。
 *    实现方式：在 install 内**包装** `md.renderer.rules.fence` 与 `code_inline` 的既有实现，
 *    不改 `md.options.highlight`（PF-1 的守卫实现必须保持），增强只在识别到属性时生效，
 *    普通围栏完全走原渲染器（零行为变化）。
 * 3. **Material 图标**（`:material-account:`）：
 *    inline 规则只匹配 `:material-*:` / `:octicons-*:` 短代码（emoji 由 markdown-it-emoji 的
 *    core 规则处理，本规则正则带前缀约束，不会抢 emoji 的 `:smile:`）；
 *    图标 path 数据内嵌于 `mdi-icons-data.ts`；未知图标降级为可见文本，不报错、不吞后续文本。
 *
 * 安全 / 健壮性约定：
 * - 所有文本 / 属性输出经 `md.utils.escapeHtml` 转义；
 * - 未知语言、未知图标、畸形 info、未闭合容器均不抛异常；
 * - 与 KaTeX / emoji / highlight.js / admonition / tabbed set 共存（纯增量规则）；
 * - 输出结构兼容 `DOMPurify.sanitize(html, { USE_PROFILES: { html, svg, svgFilters, mathMl } })`
 *   （div/span/svg/path/class/title/aria-hidden/viewBox/fill 均在白名单内，见单测）。
 */
import MarkdownIt from 'markdown-it'
import type { Env, MarkdownItOptions, Renderer, StateBlock, StateInline, Token } from 'markdown-it'
import { MDI_ICON_PATHS, OCTICON_ICON_PATHS } from './mdi-icons-data'

/** markdown-it 实例类型（`MarkdownIt` 默认导出是构造器值，实例类型用 InstanceType 表达） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/** 与 markdown-it 缩进代码块判定一致的缩进阈值（相对当前块缩进 ≥ 4 列即缩进代码） */
const CONTENT_INDENT = 4
/** 递归嵌套深度在 env 上的键名（防御恶意深层嵌套导致栈溢出） */
const ENV_NESTING_DEPTH = '__mdxMediaNestingDepth'
/** 深度保护兜底阈值（markdown-it 的 maxNesting 默认值同样是 100） */
const DEFAULT_MAX_NESTING = 100
/** hl_lines 区间展开上限（防止 `1-999999999` 之类输入构造超大 Set） */
const MAX_HL_RANGE_SPAN = 10000
/** icon / fence 等短代码扫描窗口（限制单次正则输入长度，避免长文档上的 O(n²) 扫描） */
const SHORTCODE_SCAN_WINDOW = 160

/* ============================== 一、Grid cards（md-in-html） ============================== */

/** grid 容器产出的 token 类型（open/close 成对） */
const MDX_GRID_OPEN = 'mdx_grid_open'
const MDX_GRID_CLOSE = 'mdx_grid_close'

/** 开标签整行匹配：`<div ...>`（属性里不允许出现 `>`，出现即视为非容器、优雅回退） */
const GRID_OPEN_TAG_PATTERN = /^<div\b([^>]*)>$/i
/** 闭合标签整行匹配：`</div>`（允许前后空白） */
const GRID_CLOSE_LINE_PATTERN = /^<\/div\s*>$/i
/** 行内任意 div 开 / 闭标签（用于闭合扫描时统计嵌套深度） */
const DIV_OPEN_TAG_PATTERN = /<div\b[^>]*>/gi
const DIV_CLOSE_TAG_PATTERN = /<\/div\s*>/gi
/** 围栏代码块起止行（闭合扫描时跳过围栏内部的 `<div>` 文本，避免误计数） */
const FENCE_LINE_PATTERN = /^[ \t]*(`{3,}|~{3,})(.*)$/
/** 围栏闭合行（允许行尾空白） */
const FENCE_CLOSE_PATTERN = /^[ \t]*(`{3,}|~{3,})[ \t]*$/

/**
 * 解析开始标签的属性串（如 `class="grid cards" markdown`）。
 * 支持双引号 / 单引号 / 无引号 / 裸属性（裸属性值为空串）；属性名小写化。
 */
function parseTagAttributes(rawAttributes: string): Map<string, string> {
    const attributes = new Map<string, string>()
    const attributePattern =
        /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
    for (const match of rawAttributes.matchAll(attributePattern)) {
        const name = match[1].toLowerCase()
        const value = match[2] ?? match[3] ?? match[4] ?? ''
        if (!attributes.has(name)) {
            attributes.set(name, value)
        }
    }
    return attributes
}

/**
 * 判断某一行是否为「带 markdown 属性的 grid 容器」开始标签。
 * 命中条件：整行只有 `<div ...>`；属性含 `markdown`；class 列表里含 `grid`。
 * @returns class 列表；不匹配返回 null
 */
function matchGridContainerOpenTag(lineText: string): { classes: string[] } | null {
    const trimmed = lineText.trim()
    const tagMatch = GRID_OPEN_TAG_PATTERN.exec(trimmed)
    if (!tagMatch) {
        return null
    }
    const rawAttributes = tagMatch[1]
    // `<div ... />` 不是合法容器（HTML 的 div 不能自闭合）
    if (rawAttributes.trim().endsWith('/')) {
        return null
    }
    const attributes = parseTagAttributes(rawAttributes)
    if (!attributes.has('markdown')) {
        return null
    }
    const classes = (attributes.get('class') ?? '').split(/\s+/).filter(Boolean)
    if (!classes.includes('grid')) {
        return null
    }
    return { classes }
}

/** 在 `from` 位置起查找长度恰为 `length` 的反引号 run，返回起始下标；未找到返回 -1 */
function findBacktickRun(line: string, from: number, length: number): number {
    let index = from
    while (index < line.length) {
        if (line[index] !== '`') {
            index += 1
            continue
        }
        const runStart = index
        while (index < line.length && line[index] === '`') {
            index += 1
        }
        if (index - runStart === length) {
            return runStart
        }
    }
    return -1
}

/**
 * 去掉一行中的行内代码 span（反引号包裹，支持 `` ` `` / ``` `` ``` 多反引号）。
 * 仅用于闭合扫描时的标签计数：卡片描述里写 `` `<div>` `` 不应被当成真实标签，
 * 否则嵌套深度会被算错、导致容器找不到闭合标签。
 */
function stripInlineCodeSpans(line: string): string {
    if (!line.includes('`')) {
        return line
    }
    let result = ''
    let index = 0
    while (index < line.length) {
        if (line[index] !== '`') {
            result += line[index]
            index += 1
            continue
        }
        const runStart = index
        while (index < line.length && line[index] === '`') {
            index += 1
        }
        const runLength = index - runStart
        const closingIndex = findBacktickRun(line, index, runLength)
        if (closingIndex < 0) {
            result += line.slice(runStart)
            break
        }
        index = closingIndex + runLength
    }
    return result
}

/**
 * 从开标签下一行开始扫描匹配的 `</div>`，忽略：
 * - 围栏代码块内部的 div 文本（含 `</div>` 的高亮样例）；
 * - 行内代码 span（`` `<div>` ``）与 HTML 注释里的 div 文本；
 * 并按嵌套 div 深度配对（支持容器内嵌普通 div / 嵌套 grid 容器）。
 * @returns 闭合标签所在行号；未找到返回 -1（交由上层优雅回退）
 */
function findGridCloseLine(state: StateBlock, startLine: number, endLine: number): number {
    let depth = 0
    let fenceMarker = ''
    let fenceLength = 0
    let inHtmlComment = false
    for (let line = startLine + 1; line < endLine; line += 1) {
        const rawLine = state.src.slice(state.bMarks[line], state.eMarks[line])
        // 围栏代码块内部：只找围栏闭合行，其余行不参与 div 计数
        if (fenceMarker !== '') {
            const closeMatch = FENCE_CLOSE_PATTERN.exec(rawLine)
            if (
                closeMatch &&
                closeMatch[1][0] === fenceMarker &&
                closeMatch[1].length >= fenceLength
            ) {
                fenceMarker = ''
            }
            continue
        }
        const fenceMatch = FENCE_LINE_PATTERN.exec(rawLine)
        if (fenceMatch) {
            const marker = fenceMatch[1][0]
            const info = fenceMatch[2]
            // 与 markdown-it fence 规则一致：反引号围栏的 info 中不能再出现反引号
            if (!(marker === '`' && info.includes('`'))) {
                fenceMarker = marker
                fenceLength = fenceMatch[1].length
                continue
            }
        }
        // 多行 HTML 注释：注释内部不参与 div 计数
        let scanLine = rawLine
        if (inHtmlComment) {
            const commentEnd = scanLine.indexOf('-->')
            if (commentEnd < 0) {
                continue
            }
            inHtmlComment = false
            scanLine = scanLine.slice(commentEnd + 3)
        }
        scanLine = scanLine.replace(/<!--[\s\S]*?-->/g, '')
        const commentStart = scanLine.indexOf('<!--')
        if (commentStart >= 0) {
            inHtmlComment = true
            scanLine = scanLine.slice(0, commentStart)
        }
        const trimmed = rawLine.trim()
        if (depth === 0 && GRID_CLOSE_LINE_PATTERN.test(trimmed)) {
            return line
        }
        const tagLine = stripInlineCodeSpans(scanLine)
        const openCount = (tagLine.match(DIV_OPEN_TAG_PATTERN) ?? []).length
        const closeCount = (tagLine.match(DIV_CLOSE_TAG_PATTERN) ?? []).length
        depth = Math.max(0, depth + openCount - closeCount)
    }
    return -1
}

/** 读取（必要时创建）当前解析的 env：用于嵌套深度计数 */
function ensureEnv(state: StateBlock): Env {
    if (!state.env) {
        state.env = {}
    }
    return state.env
}

/** 当前解析状态（含递归子解析）的嵌套深度 */
function getNestingDepth(state: StateBlock): number {
    const depth = state.env?.[ENV_NESTING_DEPTH]
    return typeof depth === 'number' ? depth : 0
}

/** 当前嵌套深度是否已超限（超限时 grid 容器回退为普通 HTML 直通，避免栈溢出） */
function isNestingTooDeep(state: StateBlock): boolean {
    const maxNesting = state.md.options.maxNesting ?? DEFAULT_MAX_NESTING
    return getNestingDepth(state) >= maxNesting
}

/**
 * 读取 [beginLine, endLine) 行区间并去掉外层缩进（按 open 标签所在列）。
 * 使用 markdown-it 官方 `state.getLines()`：按列展开 Tab、行数与原文一一对应，
 * 因此内容 token 的源码行号可以可靠回填为整篇文档的绝对行号。
 */
function getDedentedContent(state: StateBlock, beginLine: number, endLine: number): string {
    if (endLine <= beginLine) {
        return ''
    }
    const indent = state.sCount[beginLine - 1] ?? state.blkIndent
    return state.getLines(beginLine, endLine, indent, false)
}

/**
 * 递归解析容器内部 Markdown，并把内容 token 的 map 回填为整篇文档的绝对行号。
 * 递归深度计入 env，超过 maxNesting 时由上层判定回退。
 */
function parseNestedContent(state: StateBlock, content: string, sourceStartLine: number): void {
    if (content.length === 0) {
        return
    }
    const env = ensureEnv(state)
    const tokenStart = state.tokens.length
    const depth = getNestingDepth(state)
    env[ENV_NESTING_DEPTH] = depth + 1
    try {
        state.md.block.parse(content, state.md, state.env, state.tokens)
    } finally {
        env[ENV_NESTING_DEPTH] = depth
    }
    for (let index = tokenStart; index < state.tokens.length; index += 1) {
        const map = state.tokens[index].map
        if (map) {
            map[0] += sourceStartLine
            map[1] += sourceStartLine
        }
    }
}

/**
 * grid cards block rule。
 * 命中 `<div class="grid cards" markdown>` 后：
 * - 找到配对 `</div>`：输出容器 token + 递归解析的内部 token + 闭合 token；
 * - 找不到（未闭合）：只把开标签作为原始 HTML 输出，后续 Markdown 继续正常解析；
 * - 嵌套过深：返回 false，交回默认 html_block 直通。
 */
function gridCardsBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    // 缩进 ≥ 4 列时属于缩进代码块，不当作 HTML 容器
    if (state.sCount[startLine] - state.blkIndent >= CONTENT_INDENT) {
        return false
    }
    const rawLine = state.src.slice(state.bMarks[startLine], state.eMarks[startLine])
    const lineText = state.src.slice(
        state.bMarks[startLine] + state.tShift[startLine],
        state.eMarks[startLine]
    )
    const container = matchGridContainerOpenTag(lineText)
    if (!container) {
        return false
    }
    if (silent) {
        return true
    }
    if (isNestingTooDeep(state)) {
        return false
    }
    const closeLine = findGridCloseLine(state, startLine, endLine)
    if (closeLine < 0) {
        // 优雅回退：仅原样输出开标签（html:true 下浏览器/消毒器可自愈），不吞后续 Markdown
        const fallbackToken = state.push('html_block', '', 0)
        fallbackToken.content = rawLine + '\n'
        fallbackToken.map = [startLine, startLine + 1]
        fallbackToken.block = true
        state.line = startLine + 1
        return true
    }

    const openToken = state.push(MDX_GRID_OPEN, 'div', 1)
    openToken.block = true
    openToken.map = [startLine, closeLine + 1]
    openToken.meta = { classes: container.classes }

    const content = getDedentedContent(state, startLine + 1, closeLine)
    parseNestedContent(state, content, startLine + 1)

    const closeToken = state.push(MDX_GRID_CLOSE, 'div', -1)
    closeToken.block = true
    state.line = closeLine + 1
    return true
}

/** 过滤 class 列表：只保留安全字符，并保证含 `grid`（兜底） */
function sanitizeGridClasses(rawClasses: unknown): string {
    const source = Array.isArray(rawClasses) ? rawClasses : []
    const classes = source.filter(
        (item): item is string => typeof item === 'string' && /^[A-Za-z0-9_-]+$/.test(item)
    )
    if (!classes.includes('grid')) {
        classes.unshift('grid')
    }
    return classes.join(' ')
}

/* ============================== 二、代码块增强 ============================== */

/** 围栏 info 属性解析（`linenums="1" hl_lines="2 3" title="main.py"`） */
const FENCE_ATTR_PATTERN = /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g
/** 行内高亮：`#!python code`（#! 后为语言，空白后为代码；无代码时不触发，避免误伤 shebang） */
const INLINE_HIGHLIGHT_PATTERN = /^#!([A-Za-z][A-Za-z0-9_+#.-]*)[ \t]+([\s\S]+)$/

/** 高亮回调（markdown-it `options.highlight` 的三参形态） */
type HighlightFn = (str: string, lang: string, attrs: string) => string

/** 围栏增强信息（未识别到任何增强属性时返回 null） */
interface FenceEnhancement {
    language: string
    langAttrs: string
    title: string
    /** 行号起始值；null 表示不显示行号 */
    linenumsStart: number | null
    /** 需要高亮（`hll`）的行号集合，1 基 */
    highlightedLines: Set<number>
}

/** 取 options.highlight（运行时可能为 undefined；不修改它，只调用） */
function getHighlightFn(options: Required<MarkdownItOptions>): HighlightFn | null {
    const highlight = options.highlight
    return typeof highlight === 'function' ? highlight : null
}

/** 解析 `linenums` 值：裸属性 = 1；非法/非正数回退 1；数值上限防超大行号 */
function parseLinenumsStart(rawValue: string): number {
    const trimmed = rawValue.trim()
    if (trimmed.length === 0) {
        return 1
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1
    }
    return Math.min(parsed, 1000000)
}

/** 解析 `hl_lines`：支持 `2 3`、`2,3`、`5-7`、`1 3 5-7` 等写法 */
function parseHighlightedLines(rawValue: string): Set<number> {
    const lines = new Set<number>()
    for (const part of rawValue.split(/[\s,]+/).filter(Boolean)) {
        const rangeMatch = /^(\d+)-(\d+)$/.exec(part)
        if (rangeMatch) {
            const first = Number.parseInt(rangeMatch[1], 10)
            const second = Number.parseInt(rangeMatch[2], 10)
            const from = Math.min(first, second)
            const to = Math.max(first, second)
            if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > MAX_HL_RANGE_SPAN) {
                continue
            }
            for (let line = from; line <= to; line += 1) {
                lines.add(line)
            }
            continue
        }
        const single = /^\d+$/.test(part) ? Number.parseInt(part, 10) : Number.NaN
        if (Number.isFinite(single) && single > 0) {
            lines.add(single)
        }
    }
    return lines
}

/** 围栏 info 中「只有属性、没有语言」时用于识别的裸属性名 */
const KNOWN_BARE_FENCE_ATTRS = new Set(['linenums', 'hl_lines', 'title'])

/**
 * 拆分围栏 info：语言 + 属性串。
 * 常规写法语言在前（`python linenums="1"`）；也兼容「只有属性、没有语言」的写法
 * （`linenums="1" title="notes.txt"`，此时语言视为空串，内容按转义文本输出）。
 */
function splitFenceInfo(info: string): { language: string; langAttrs: string } {
    const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(info)
    if (!match) {
        return { language: '', langAttrs: info }
    }
    const first = match[1]
    const rest = match[2] ?? ''
    const looksLikeAttribute =
        first.includes('=') || KNOWN_BARE_FENCE_ATTRS.has(first.toLowerCase())
    if (looksLikeAttribute) {
        return { language: '', langAttrs: info }
    }
    return { language: first, langAttrs: rest }
}

/**
 * 解析围栏 info，识别增强属性。
 * 语言取 info 第一个空白分隔 token（与 markdown-it 默认 fence 渲染器一致），其余作为属性串。
 * @returns 未识别到 linenums / hl_lines / title 时返回 null（走原渲染器）
 */
function parseFenceEnhancement(md: MarkdownItInstance, token: Token): FenceEnhancement | null {
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    if (info.length === 0) {
        return null
    }
    const { language, langAttrs } = splitFenceInfo(info)
    const attributes = new Map<string, string>()
    for (const match of langAttrs.matchAll(FENCE_ATTR_PATTERN)) {
        const name = match[1].toLowerCase()
        if (!attributes.has(name)) {
            attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '')
        }
    }
    const title = (attributes.get('title') ?? '').trim()
    const hasLinenums = attributes.has('linenums')
    const highlightedLines = parseHighlightedLines(attributes.get('hl_lines') ?? '')
    if (title.length === 0 && !hasLinenums && highlightedLines.size === 0) {
        return null
    }
    return {
        language,
        langAttrs,
        title,
        linenumsStart: hasLinenums ? parseLinenumsStart(attributes.get('linenums') ?? '') : null,
        highlightedLines
    }
}

/** 取环境安全（已转义）的语言 class；非法语言名直接忽略 */
function buildLanguageClass(options: Required<MarkdownItOptions>, language: string): string {
    if (!/^[A-Za-z0-9_+#.-]+$/.test(language)) {
        return ''
    }
    return `${options.langPrefix}${language}`
}

/**
 * 把 highlight.js 输出（可能含跨行 span）按行切分，并在每行内补齐未闭合标签，
 * 保证逐行包裹 `<span class="line">` 后 HTML 结构仍然合法。
 * @returns 行 HTML 数组（保留行内已转义文本）
 */
function splitHighlightedLines(html: string): string[] {
    const lines: string[] = []
    const openTags: string[] = []
    let current = ''
    let index = 0
    while (index < html.length) {
        const char = html[index]
        if (char === '<') {
            const tagEnd = html.indexOf('>', index)
            if (tagEnd < 0) {
                current += html.slice(index)
                break
            }
            const tag = html.slice(index, tagEnd + 1)
            if (/^<\s*\//.test(tag)) {
                openTags.pop()
                current += tag
            } else if (/\/\s*>$/.test(tag) || /^<\s*(br|hr|img|input|wbr)\b/i.test(tag)) {
                current += tag
            } else {
                openTags.push(tag)
                current += tag
            }
            index = tagEnd + 1
            continue
        }
        if (char === '\n') {
            current += closeOpenTags(openTags)
            lines.push(current)
            current = openTags.join('')
            index += 1
            continue
        }
        let next = index + 1
        while (next < html.length && html[next] !== '<' && html[next] !== '\n') {
            next += 1
        }
        current += html.slice(index, next)
        index = next
    }
    lines.push(current)
    return lines
}

/** 生成当前行末需要补的闭合标签（逆序） */
function closeOpenTags(openTags: string[]): string {
    let result = ''
    for (let index = openTags.length - 1; index >= 0; index -= 1) {
        const nameMatch = /^<\s*([A-Za-z][\w:-]*)/.exec(openTags[index])
        if (nameMatch) {
            result += `</${nameMatch[1]}>`
        }
    }
    return result
}

/** `<code>` 的 class：hljs + language-* + token 原有 class（attr_list 等扩展） */
function buildCodeClass(languageClass: string, token: Token): string {
    const classes = ['hljs']
    if (languageClass.length > 0) {
        classes.push(languageClass)
    }
    const existing = token.attrGet('class')
    if (typeof existing === 'string') {
        for (const part of existing.split(/\s+/)) {
            if (part.length > 0 && !classes.includes(part)) {
                classes.push(part)
            }
        }
    }
    return classes.join(' ')
}

/**
 * 渲染增强围栏（title / linenums / hl_lines）。
 * 结构与 mkdocs-material 对齐：`<div class="highlight">` + 可选 `<span class="filename">`
 * + `<pre><code class="hljs language-x">`，行级包裹 `<span class="line">`，
 * 行号 `<span class="lineno" aria-hidden="true">`（CSS `user-select: none`，复制时不混入文本）。
 */
function renderEnhancedFence(
    md: MarkdownItInstance,
    token: Token,
    options: Required<MarkdownItOptions>,
    info: FenceEnhancement
): string {
    const escapeHtml = md.utils.escapeHtml
    const highlight = getHighlightFn(options)
    let highlighted = ''
    if (highlight) {
        try {
            highlighted = highlight(token.content, info.language, info.langAttrs)
        } catch {
            highlighted = ''
        }
    }
    if (!highlighted) {
        highlighted = escapeHtml(token.content)
    }

    const languageClass = buildLanguageClass(options, info.language)
    const codeClass = buildCodeClass(languageClass, token)
    const filenameHtml =
        info.title.length > 0 ? `<span class="filename">${escapeHtml(info.title)}</span>` : ''

    const needsLineWrapping = info.linenumsStart !== null || info.highlightedLines.size > 0
    if (!needsLineWrapping) {
        return (
            `<div class="highlight">${filenameHtml}` +
            `<pre><code class="${codeClass}">${highlighted}</code></pre></div>\n`
        )
    }

    const codeLines = splitHighlightedLines(highlighted)
    // fence 的 token.content 以换行结尾（markdown-it getLines 行为），会多切出一个空行；
    // 只去掉这一个尾部空行，代码块内部真正的空行仍保留。
    if (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
        codeLines.pop()
    }
    const linesHtml = codeLines
        .map((lineHtml, index) => {
            const lineNumber = index + 1
            const lineClasses = ['line']
            if (info.highlightedLines.has(lineNumber)) {
                lineClasses.push('hll')
            }
            const linenoHtml =
                info.linenumsStart !== null
                    ? `<span class="lineno" aria-hidden="true">${info.linenumsStart + index}</span>`
                    : ''
            return `<span class="${lineClasses.join(' ')}">${linenoHtml}${lineHtml}</span>`
        })
        .join('')
    return (
        `<div class="highlight">${filenameHtml}` +
        `<pre><code class="${codeClass}">${linesHtml}</code></pre></div>\n`
    )
}

/**
 * 安装围栏增强：包装既有 `md.renderer.rules.fence`。
 * - 未识别到增强属性：**原样调用**原渲染器（highlight.js PF-1 行为、类名、转义完全不变）；
 * - 识别到增强属性：自行渲染（仍需高亮时调用 `options.highlight`，不修改它）；
 * - 任何异常：回退原渲染器，保证不因畸形 info 崩掉整篇渲染。
 */
function installFenceEnhancements(md: MarkdownItInstance): void {
    const originalFence = md.renderer.rules.fence
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const enhancement = parseFenceEnhancement(md, token)
        if (!enhancement) {
            return originalFence
                ? originalFence(tokens, idx, options, env, self)
                : `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>\n`
        }
        try {
            return renderEnhancedFence(md, token, options, enhancement)
        } catch {
            return originalFence
                ? originalFence(tokens, idx, options, env, self)
                : `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>\n`
        }
    }
}

/* ============================== 三、行内高亮与 Material 图标 ============================== */

/** 行内图标 token 类型 */
const MDX_ICON = 'mdx_icon'
/** 图标短代码：只匹配带 `material-` / `octicons-` 前缀的写法，绝不抢 emoji 的 `:smile:` */
const ICON_SHORTCODE_PATTERN = /^:(material|octicons)-([a-z0-9]+(?:-[a-z0-9]+)*):/

/**
 * 行内图标 inline 规则。
 * 注册在 `text` 规则之前：只有 `:` 开头且命中 `:material-*:` / `:octicons-*:` 时才消费，
 * 其它 `:...:`（含 emoji 短代码）原样留给 markdown-it-emoji 的 core 规则处理。
 */
function iconInlineRule(state: StateInline, silent: boolean): boolean {
    if (state.src.charCodeAt(state.pos) !== 0x3a /* ':' */) {
        return false
    }
    const isMaterial = state.src.startsWith(':material-', state.pos)
    const isOcticons = state.src.startsWith(':octicons-', state.pos)
    if (!isMaterial && !isOcticons) {
        return false
    }
    const windowEnd = Math.min(state.posMax, state.pos + SHORTCODE_SCAN_WINDOW)
    const match = ICON_SHORTCODE_PATTERN.exec(state.src.slice(state.pos, windowEnd))
    if (!match) {
        return false
    }
    if (silent) {
        return true
    }
    const token = state.push(MDX_ICON, '', 0)
    token.content = `${match[1]}-${match[2]}`
    token.meta = { prefix: match[1], name: match[2] }
    state.pos += match[0].length
    return true
}

/**
 * 渲染图标 token。
 * - 已知图标：`<span class="mkdocs-icon" title="material-account"><svg …><path d="…"/></svg></span>`；
 * - 未知图标：降级为可见短代码文本（`mkdocs-icon--missing`），不报错、不吞后续文本。
 */
function renderIcon(md: MarkdownItInstance, token: Token): string {
    const escapeHtml = md.utils.escapeHtml
    const meta = token.meta
    const prefix = typeof meta?.prefix === 'string' ? meta.prefix : ''
    const name = typeof meta?.name === 'string' ? meta.name : ''
    const shortcode = `${prefix}-${name}`
    let pathData: string | undefined
    if (prefix === 'material') {
        pathData = MDI_ICON_PATHS[name]
    } else if (prefix === 'octicons') {
        pathData = OCTICON_ICON_PATHS[name]
    }
    if (typeof pathData !== 'string' || pathData.length === 0) {
        return (
            `<span class="mkdocs-icon mkdocs-icon--missing" title="${escapeHtml(shortcode)}">` +
            `:${escapeHtml(shortcode)}:</span>`
        )
    }
    return (
        `<span class="mkdocs-icon" title="${escapeHtml(shortcode)}">` +
        '<svg class="md-icon" viewBox="0 0 24 24" width="1.2em" height="1.2em" ' +
        'fill="currentColor" aria-hidden="true">' +
        `<path d="${escapeHtml(pathData)}"/></svg></span>`
    )
}

/** 渲染 `<code>` 除 class 外的其它属性（保留 attr_list 等扩展写入的属性） */
function renderAttrsWithoutClass(renderer: Renderer, token: Token): string {
    if (!token.attrs) {
        return ''
    }
    const attrs = token.attrs.filter((attribute) => attribute[0] !== 'class')
    if (attrs.length === 0) {
        return ''
    }
    return renderer.renderAttrs({ attrs })
}

/** 行内高亮 `<code>` 的 class：`highlight language-x` + token 原有 class */
function buildInlineCodeClass(
    options: Required<MarkdownItOptions>,
    token: Token,
    language: string
): string {
    const classes = ['highlight']
    const languageClass = buildLanguageClass(options, language)
    if (languageClass.length > 0) {
        classes.push(languageClass)
    }
    const existing = token.attrGet('class')
    if (typeof existing === 'string') {
        for (const part of existing.split(/\s+/)) {
            if (part.length > 0 && !classes.includes(part)) {
                classes.push(part)
            }
        }
    }
    return classes.join(' ')
}

/**
 * 安装行内扩展：
 * 1. 行内高亮（pymdownx.inlinehilite）：`` `#!python print(1)` `` →
 *    `<code class="highlight language-python">…高亮片段…</code>`；
 *    无 `#!lang` 或语言后无代码时完全走原 code_inline 渲染器（普通行内代码行为不变）。
 * 2. Material 图标 inline 规则 + 渲染器。
 */
function installInlineExtensions(md: MarkdownItInstance): void {
    const originalCodeInline = md.renderer.rules.code_inline
    md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const match = INLINE_HIGHLIGHT_PATTERN.exec(token.content)
        if (!match) {
            return originalCodeInline
                ? originalCodeInline(tokens, idx, options, env, self)
                : `<code>${md.utils.escapeHtml(token.content)}</code>`
        }
        const language = match[1]
        const code = match[2]
        const highlight = getHighlightFn(options)
        let highlighted = ''
        if (highlight) {
            try {
                highlighted = highlight(code, language, '')
            } catch {
                highlighted = ''
            }
        }
        if (!highlighted) {
            highlighted = md.utils.escapeHtml(code)
        }
        const className = buildInlineCodeClass(options, token, language)
        return `<code class="${className}"${renderAttrsWithoutClass(self, token)}>${highlighted}</code>`
    }

    md.inline.ruler.before('text', 'mdx_icon', iconInlineRule)
    md.renderer.rules[MDX_ICON] = (tokens, idx) => renderIcon(md, tokens[idx])
}

/* ============================== 四、插件入口 ============================== */

/**
 * 安装媒体 / 代码块扩展插件（grid cards md-in-html、代码块增强、Material 图标）。
 * 只新增 block / inline 规则与渲染规则，不修改 `md.options.highlight`（PF-1 顺序不变）。
 */
export function installMdxMediaExtensions(md: InstanceType<typeof MarkdownIt>): void {
    // 每次解析开始时复位 env 上的嵌套深度计数（同一次 render 内递归自增，跨 render 互不影响）
    md.core.ruler.before('normalize', 'mdx_media_env_reset', (state) => {
        if (!state.env) {
            state.env = {}
        }
        state.env[ENV_NESTING_DEPTH] = 0
    })

    // grid 容器必须在 html_block 之前匹配；alt 与 html_block 对齐，允许正常打断段落
    md.block.ruler.before('html_block', 'mdx_grid_cards', gridCardsBlockRule, {
        alt: ['paragraph', 'reference', 'blockquote']
    })
    md.renderer.rules[MDX_GRID_OPEN] = (tokens, idx) => {
        const classes = sanitizeGridClasses(tokens[idx].meta?.classes)
        return `<div class="${classes}">`
    }
    md.renderer.rules[MDX_GRID_CLOSE] = () => '</div>\n'

    installFenceEnhancements(md)
    installInlineExtensions(md)
}
