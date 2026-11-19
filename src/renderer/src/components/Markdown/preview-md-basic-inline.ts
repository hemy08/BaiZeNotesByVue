/**
 * preview-md-basic-inline.ts
 * 批次 A「标准 Markdown 扩展」——行内语法域（结构优化第 5 批 5.5 由 preview-md-basic.ts 拆出）。
 *
 * 本文件负责的语法域（统一注册为一个「分派器」，插入在 markdown-it `text` 规则之前）：
 * 1. 高亮：`==高亮==` → `<mark>`；
 * 2. 插入/删除/critic：`^^插入^^` → `<ins>`、markdown-it 内建 `~~删除~~` 保持不变、
 *    `{++insert++}`/`{--delete--}`/`{~~old~>new~~}`/`{==highlight==}`/`{>>comment<<}`（隐藏注释）；
 * 3. 上标/下标：`^上标^` → `<sup>`、`~下标~` → `<sub>`（不干扰内建 `~~删除~~`）；
 * 4. 键盘按键：`++ctrl+alt+del++` → `<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>`；
 * 5. 脚注引用 `[^label]`（实现见 preview-md-basic-footnotes.ts）与行内属性列表
 *    `{ .class }`（实现见 preview-md-basic-attributes.ts）。
 *
 * 设计要点：
 * - 分派器只在 `{`/`+`/`=`/`^`/`~`/`[` 等终止符位置被调用，命中后才推进 `state.pos`，
 *   未命中一律返回 false，因此不会吞掉 emoji、KaTeX 公式、链接、内建 strikethrough 等既有语法；
 * - 所有用户文本输出前经默认 text 渲染器 / md.utils.escapeHtml 转义；
 * - 非法/未闭合语法一律返回 false 回退为普通文本，不抛异常、不吞后续 Markdown；
 * - KaTeX 渲染产物（MathML 源码文本）中的 `^`/`~` 等字符不做二次改写（isInsideRenderedMath）。
 */

import type { StateInline } from 'markdown-it'
import { parseFootnoteReference } from './preview-md-basic-footnotes'
import { parseInlineAttributeList } from './preview-md-basic-attributes'

/* ============================== 一、通用工具函数 ============================== */

/** 反转义 Markdown 反斜杠转义（仅处理本插件会消费的字符集，其余保持原样） */
function unescapeMarkdownSpecial(value: string): string {
    return value.replace(/\\([\\`*_{}[\]()#+\-.!~^=<>|:])/g, '$1')
}

/**
 * 行内闭合标记扫描：跳过反斜杠转义、拒绝跨行；单字符标记不允许连续出现
 * （`^`/`=`/`~` 后紧跟同字符视为更长标记，不作为闭合），避免把 `~~`/`===` 误切。
 * @returns 闭合标记起始位置；未找到返回 -1
 */
function findInlineClosingDelimiter(source: string, from: number, delimiter: string): number {
    let position = from
    while (position < source.length) {
        const char = source[position]
        if (char === '\\') {
            position += 2
            continue
        }
        if (char === '\n') {
            return -1
        }
        if (source.startsWith(delimiter, position)) {
            if (delimiter.length === 1 && source[position + 1] === delimiter) {
                position += 1
                continue
            }
            return position
        }
        position += 1
    }
    return -1
}

/** 行内包裹内容是否合法：非空、首尾无空白（pymdownx 的 no_space 语义）、无控制字符 */
function isValidWrappedContent(content: string): boolean {
    if (content.length === 0 || content.trim().length === 0) {
        return false
    }
    return !/^\s|\s$/.test(content)
}

/**
 * 上标/下标内容是否合法：Pandoc 风格「不含任何空白」。
 * 不允许内部空格除了对齐 pymdownx `no_space` 语义，也避免单个 `^` 跨词吞掉后续正文
 * （例如无定义的脚注原文 `[^missing] … [^2]` 中的两个 caret 不能被拼成上标）。
 */
function isValidCompactWrappedContent(content: string): boolean {
    return content.length > 0 && !/\s/.test(content)
}

/** 行内包裹 token：open → text（转义交给默认 text 渲染器）→ close */
function pushWrappedInlineToken(
    state: StateInline,
    tag: string,
    content: string,
    markup: string
): void {
    const openToken = state.push(`mdx_basic_${tag}_open`, tag, 1)
    openToken.markup = markup
    if (content.length > 0) {
        const textToken = state.push('text', '', 0)
        textToken.content = content
    }
    const closeToken = state.push(`mdx_basic_${tag}_close`, tag, -1)
    closeToken.markup = markup
}

/* ============================== 二、行内语法处理 ============================== */

/**
 * 行内 critic 标记：`{++ins++}` / `{--del--}` / `{~~old~>new~~}` / `{==mark==}` / `{>>comment<<}`。
 * 注释输出为带 hidden 属性的隐藏 span（CSS 再兜底 display:none），其余输出 del/ins/mark。
 * 未闭合时返回 false，回退为普通文本。
 */
function parseCriticMark(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    const kind = source.slice(start + 1, start + 3)
    if (kind === '>>') {
        const close = source.indexOf('<<}', start + 3)
        if (close < 0) {
            return false
        }
        if (silent) {
            state.pos = close + 3
            return true
        }
        const openToken = state.push('mdx_basic_critic_comment_open', 'span', 1)
        openToken.attrSet('class', 'critic comment')
        openToken.attrSet('hidden', '')
        const textToken = state.push('text', '', 0)
        textToken.content = unescapeMarkdownSpecial(source.slice(start + 3, close))
        state.push('mdx_basic_critic_comment_close', 'span', -1)
        state.pos = close + 3
        return true
    }
    if (kind === '~~') {
        const middle = source.indexOf('~>', start + 3)
        if (middle < 0) {
            return false
        }
        const close = source.indexOf('~~}', middle + 2)
        if (close < 0) {
            return false
        }
        if (silent) {
            state.pos = close + 3
            return true
        }
        pushWrappedInlineToken(
            state,
            'del',
            unescapeMarkdownSpecial(source.slice(start + 3, middle)),
            '{~~'
        )
        pushWrappedInlineToken(
            state,
            'ins',
            unescapeMarkdownSpecial(source.slice(middle + 2, close)),
            '~>'
        )
        state.pos = close + 3
        return true
    }
    const closer = kind === '++' ? '++}' : kind === '--' ? '--}' : kind === '==' ? '==}' : ''
    if (closer.length === 0) {
        return false
    }
    const close = source.indexOf(closer, start + 3)
    if (close < 0) {
        return false
    }
    if (silent) {
        state.pos = close + 3
        return true
    }
    const tag = kind === '++' ? 'ins' : kind === '--' ? 'del' : 'mark'
    pushWrappedInlineToken(
        state,
        tag,
        unescapeMarkdownSpecial(source.slice(start + 3, close)),
        `{${kind}`
    )
    state.pos = close + 3
    return true
}

/**
 * 键盘按键：`++ctrl+alt+del++` → `<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>`。
 * 支持 `++"Hello World"++` 形式（引号内作为单个按键）；未闭合/含空白键名时回退普通文本。
 */
function parseKeyboardKeys(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    if (source.charCodeAt(start + 1) !== 0x2b) {
        return false
    }
    // 三个连续加号（`+++`）不参与按键语法，避免与正文加号混淆
    if (source.charCodeAt(start + 2) === 0x2b) {
        return false
    }
    const close = source.indexOf('++', start + 2)
    if (close < 0) {
        return false
    }
    const rawContent = source.slice(start + 2, close)
    if (rawContent.length === 0 || rawContent.includes('\n')) {
        return false
    }
    let keys: string[]
    let quote = ''
    if (rawContent.length >= 2) {
        const first = rawContent[0]
        if ((first === '"' || first === "'") && rawContent[rawContent.length - 1] === first) {
            quote = first
            keys = [unescapeMarkdownSpecial(rawContent.slice(1, -1).trim())]
        } else {
            keys = rawContent.split('+')
        }
    } else {
        keys = rawContent.split('+')
    }
    if (quote.length === 0) {
        const validKeys = /^[A-Za-z0-9_-]+(?:\+[A-Za-z0-9_-]+)*$/.test(rawContent)
        if (!validKeys || keys.some((key) => key.length === 0)) {
            return false
        }
    }
    if (silent) {
        state.pos = close + 2
        return true
    }
    keys.forEach((key, index) => {
        if (index > 0) {
            const plusToken = state.push('text', '', 0)
            plusToken.content = '+'
        }
        pushWrappedInlineToken(state, 'kbd', key, '++')
    })
    state.pos = close + 2
    return true
}

/** 高亮 `==高亮==` → `<mark>高亮</mark>`（`===` 等更长等号串不匹配，避免与 tab 语法冲突） */
function parseMarkHighlight(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    if (source.charCodeAt(start + 1) !== 0x3d) {
        return false
    }
    if (source.charCodeAt(start + 2) === 0x3d) {
        return false
    }
    const close = findInlineClosingDelimiter(source, start + 2, '==')
    if (close < 0) {
        return false
    }
    const content = source.slice(start + 2, close)
    if (content.trim().length === 0) {
        return false
    }
    if (silent) {
        state.pos = close + 2
        return true
    }
    pushWrappedInlineToken(state, 'mark', unescapeMarkdownSpecial(content), '==')
    state.pos = close + 2
    return true
}

/**
 * caret 语法：`^^插入^^` → `<ins>`、`^上标^` → `<sup>`。
 * 内容需满足「首尾无空白」（pymdownx caret 的 no_space 语义），未闭合时回退普通文本。
 */
function parseCaretSyntax(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    if (source.charCodeAt(start + 1) === 0x5e) {
        // `^^插入^^`：若当前位置是更长 `$^^^` 串的中间位置则跳过
        if (start > 0 && source.charCodeAt(start - 1) === 0x5e) {
            return false
        }
        const close = findInlineClosingDelimiter(source, start + 2, '^^')
        if (close < 0) {
            return false
        }
        const content = source.slice(start + 2, close)
        if (!isValidWrappedContent(content)) {
            return false
        }
        if (silent) {
            state.pos = close + 2
            return true
        }
        pushWrappedInlineToken(state, 'ins', unescapeMarkdownSpecial(content), '^^')
        state.pos = close + 2
        return true
    }
    // `^上标^`：不把 `^^` 中第二个 ^ 当作上标起点
    if (start > 0 && source.charCodeAt(start - 1) === 0x5e) {
        return false
    }
    const close = findInlineClosingDelimiter(source, start + 1, '^')
    if (close < 0) {
        return false
    }
    const content = source.slice(start + 1, close)
    if (!isValidCompactWrappedContent(content)) {
        return false
    }
    if (silent) {
        state.pos = close + 1
        return true
    }
    pushWrappedInlineToken(state, 'sup', unescapeMarkdownSpecial(content), '^')
    state.pos = close + 1
    return true
}

/**
 * 下标 `~下标~` → `<sub>`。`~~删除~~` 保持 markdown-it 内建 strikethrough 行为：
 * 双波浪线开头/结尾与「前一个字符是 ~」的情况一律交回内建规则。
 */
function parseSubscriptSyntax(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    if (source.charCodeAt(start + 1) === 0x7e) {
        return false
    }
    if (start > 0 && source.charCodeAt(start - 1) === 0x7e) {
        return false
    }
    const close = findInlineClosingDelimiter(source, start + 1, '~')
    if (close < 0) {
        return false
    }
    const content = source.slice(start + 1, close)
    if (!isValidCompactWrappedContent(content)) {
        return false
    }
    if (silent) {
        state.pos = close + 1
        return true
    }
    pushWrappedInlineToken(state, 'sub', unescapeMarkdownSpecial(content), '~')
    state.pos = close + 1
    return true
}

/* ============================== 三、统一分派器 ============================== */

/** 行内拦截器触发字符集合（`[` `{` `+` `=` `^` `~`） */
const INLINE_TRIGGER_CODES = new Set([0x5b, 0x7b, 0x2b, 0x3d, 0x5e, 0x7e])

/** 需要跳过扩展解析的 MathML 标签：这些标签内的文本是公式源码，不是 Markdown 正文 */
const MATHML_RAW_TEXT_TAG_PATTERN =
    /^<(?:math|semantics|annotation|mrow|mi|mo|mn|ms|mtext|mspace|mstyle|mpadded|mphantom|merror|mtable|mtr|mtd|mfrac|msqrt|mroot|msub|msup|msubsup|munder|mover|munderover|mmultiscripts|mprescripts|none)\b/

/**
 * 当前行内位置是否处于 KaTeX 渲染产物（MathML）的源码文本中。
 * 完整预览管线会先把 `$...$` 渲染为含 `<annotation>a^2 + b^2</annotation>` 的 HTML，
 * 其中公式源码里的 `^`/`~` 等字符不能被本插件再次解释；这里通过「最近的未闭合
 * MathML 原始 HTML token」判定，命中时本插件行内规则直接跳过。
 */
function isInsideRenderedMath(state: StateInline): boolean {
    const tokens = state.tokens
    const lowerBound = Math.max(0, tokens.length - 12)
    for (let index = tokens.length - 1; index >= lowerBound; index -= 1) {
        const token = tokens[index]
        if (token.type === 'text' || token.type === 'text_special') {
            continue
        }
        if (token.type !== 'html_inline') {
            return false
        }
        if (token.content.startsWith('</')) {
            return false
        }
        return MATHML_RAW_TEXT_TAG_PATTERN.test(token.content)
    }
    return false
}

/**
 * 行内规则统一分派器（注册在 markdown-it `text` 规则之前）。
 * 仅当当前字符属于本插件的语法触发字符时才进入具体处理；否则立即返回 false，
 * 保证既有行内规则（escape/backtick/emoji/emphasis/link/内建 strikethrough/KaTeX 原始 HTML）
 * 的解析顺序与行为不变。KaTeX 渲染产物中的 MathML 文本（<annotation> 等）不做二次改写。
 */
export function mdxBasicInlineRule(state: StateInline, silent: boolean): boolean {
    if (!INLINE_TRIGGER_CODES.has(state.src.charCodeAt(state.pos))) {
        return false
    }
    if (isInsideRenderedMath(state)) {
        return false
    }
    switch (state.src.charCodeAt(state.pos)) {
        case 0x5b: // '['
            return parseFootnoteReference(state, silent)
        case 0x7b: // '{'
            return parseCriticMark(state, silent) || parseInlineAttributeList(state, silent)
        case 0x2b: // '+'
            return parseKeyboardKeys(state, silent)
        case 0x3d: // '='
            return parseMarkHighlight(state, silent)
        case 0x5e: // '^'
            return parseCaretSyntax(state, silent)
        case 0x7e: // '~'
            return parseSubscriptSyntax(state, silent)
        default:
            return false
    }
}
