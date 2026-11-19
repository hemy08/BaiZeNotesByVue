/**
 * preview-md-basic-blocks.ts
 * 批次 A「标准 Markdown 扩展」——块级语法域（结构优化第 5 批 5.5 由 preview-md-basic.ts 拆出）。
 *
 * 本文件负责的语法域：
 * 1. 折叠提示块：`??? note "标题"` / `???+ note "标题"` → `<details class="admonition note" open?>`
 *    + `<summary class="admonition-title">标题</summary>` + 递归解析的内容（复用 admonition.css）；
 * 2. 定义列表：`术语` + 下一行 `: 定义`（续行缩进延续）→ `<dl><dt>…</dt><dd>…</dd></dl>`；
 * 3. 任务列表改写的 core 规则：`- [ ]` / `- [x]`（大小写 x）→ 列表项 class `task-list-item`
 *    + 首段前 `<input type="checkbox" disabled checked?>`。
 *
 * 设计要点：块规则产出正确 block/nesting/map 的 token，内容用 `state.md.block.parse()` 递归解析，
 * 天然支持嵌套（??? 内列表/代码块/嵌套 ???）；非法/未闭合语法一律返回 false 回退普通文本。
 * 本模块只导出「规则注册函数 + 渲染所需 token 类型 + core 规则」，不承载插件安装顺序（见 preview-md-basic.ts）。
 */

import type { StateBlock, StateCore, Token } from 'markdown-it'
// 块级解析公共 helper（第 3 批子任务 D 去重）：缩进口径 A = blkIndent + 4（见 preview-block-utils）
import {
    canStartBlock,
    collectIndentedBlockEnd,
    getDedentedContent,
    getIndentedBlockContent,
    getLineText,
    isNestingTooDeep,
    parseNestedContent
} from './preview-block-utils'
import { ENV_NESTING_DEPTH, type MarkdownItInstance } from './preview-md-basic-shared'

/* ============================== 一、常量与 token 类型 ============================== */

/** 定义列表 dd 续行缩进阈值（`: ` 标记本身占 2 列；本插件特有，不进入公共 helper） */
const DEFINITION_CONTENT_INDENT = 2

/** 折叠提示块：`??? type "title"` / `???+ type "title"`（type 仅字母/数字/下划线/连字符） */
const COLLAPSIBLE_ADMONITION_PATTERN = /^\?\?\?(\+?)\s*([\w-]+)(?:\s+"([^"]*)")?[ \t]*$/
/** 定义列表定义行：`: content`（冒号后至少一个空格/Tab） */
const DEFINITION_MARKER_PATTERN = /^:[ \t]+(.*)$/
/** 任务列表标记：行内内容开头的 `[ ]` / `[x]` / `[X]` */
const TASK_LIST_MARKER_PATTERN = /^\[([ xX])\](?=\s|$)/
/** 定义列表「术语行」黑名单：这些行属于其它块语法，不能当作术语 */
const DEFINITION_TERM_BLACKLIST =
    /^(?:[-*+][ \t]|#{1,6}[ \t]|>|\||`{3}|~{3}|\?\?\?|!!!|===|\[\^|<\/?[A-Za-z]|\{)/

/** 折叠提示块 token（open/close 成对；内容 token 递归插入两者之间） */
export const TOKEN_DETAILS_OPEN = 'mdx_basic_details_open'
export const TOKEN_DETAILS_CLOSE = 'mdx_basic_details_close'
/** 定义列表 token（tag 由默认 renderToken 渲染，无需自定义渲染规则） */
const TOKEN_DEFINITION_LIST_OPEN = 'mdx_basic_definition_list_open'
const TOKEN_DEFINITION_LIST_CLOSE = 'mdx_basic_definition_list_close'
const TOKEN_DEFINITION_TERM_OPEN = 'mdx_basic_definition_term_open'
const TOKEN_DEFINITION_TERM_CLOSE = 'mdx_basic_definition_term_close'
const TOKEN_DEFINITION_DESC_OPEN = 'mdx_basic_definition_desc_open'
const TOKEN_DEFINITION_DESC_CLOSE = 'mdx_basic_definition_desc_close'

/* ============================== 二、折叠提示块 `???` / `???+` ============================== */

/** 匹配折叠提示块头部 @returns 类型、标题与是否默认展开；不匹配返回 null */
function matchCollapsibleHeader(
    lineText: string
): { type: string; title: string; open: boolean } | null {
    const match = COLLAPSIBLE_ADMONITION_PATTERN.exec(lineText)
    if (!match) {
        return null
    }
    return { type: match[2], title: match[3] ?? '', open: match[1] === '+' }
}

/**
 * 折叠提示块 block rule：`??? type "标题"` / `???+ type "标题"` + 4 空格缩进内容。
 * 产出 details_open → 内容 token（递归解析）→ details_close。
 * 与 `!!! admonition` 一样不打断既有段落（alt: []，要求指令前有空行），避免把正文中的
 * 三个问号误判为块；未闭合/内容为空时按「块尾即文档尾」处理，不抛异常。
 */
export function collapsibleAdmonitionBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    const header = matchCollapsibleHeader(getLineText(state, startLine))
    if (!header) {
        return false
    }
    if (silent) {
        return true
    }
    if (isNestingTooDeep(state, ENV_NESTING_DEPTH)) {
        return false
    }

    const nextLine = collectIndentedBlockEnd(state, startLine, endLine)
    // 缩进口径 A（blkIndent + 4）：??? 内容必须相对容器再缩进 4 列
    const content = getIndentedBlockContent(state, startLine + 1, nextLine)

    const openToken = state.push(TOKEN_DETAILS_OPEN, 'details', 1)
    openToken.block = true
    openToken.map = [startLine, nextLine]
    openToken.meta = { type: header.type.toLowerCase(), title: header.title, open: header.open }
    parseNestedContent(state, content, startLine + 1, ENV_NESTING_DEPTH)
    const closeToken = state.push(TOKEN_DETAILS_CLOSE, 'details', -1)
    closeToken.block = true

    state.line = nextLine
    return true
}

/* ============================== 三、定义列表 `术语` + `: 定义` ============================== */

/** 术语行：非空、相对缩进 <4、且不属于其它块语法 */
function isDefinitionTermLine(state: StateBlock, line: number): boolean {
    if (!canStartBlock(state, line) || state.isEmpty(line)) {
        return false
    }
    const text = getLineText(state, line).trim()
    if (text.length === 0 || DEFINITION_TERM_BLACKLIST.test(text)) {
        return false
    }
    return !DEFINITION_MARKER_PATTERN.test(text)
}

/** 定义行：行首 `: `（冒号后至少一个空格/Tab） */
function isDefinitionMarkerLine(state: StateBlock, line: number): boolean {
    return canStartBlock(state, line) && DEFINITION_MARKER_PATTERN.test(getLineText(state, line))
}

/** 一组定义列表：连续术语行 + 第一个定义行 */
interface DefinitionListGroup {
    termLines: number[]
    firstDefinitionLine: number
}

/**
 * 从 fromLine 扫描一组「连续术语行 + 定义行」。允许 `术语1 / 术语2 / : 定义` 多术语共享定义，
 * 但必须至少有一个术语行且其后紧跟定义行，否则返回 null（当作普通段落回退）。
 */
function scanDefinitionListGroup(
    state: StateBlock,
    fromLine: number,
    endLine: number
): DefinitionListGroup | null {
    const termLines: number[] = []
    let line = fromLine
    while (line < endLine && isDefinitionTermLine(state, line)) {
        termLines.push(line)
        if (line + 1 < endLine && isDefinitionMarkerLine(state, line + 1)) {
            return { termLines, firstDefinitionLine: line + 1 }
        }
        line += 1
    }
    return null
}

/** 单个 `<dd>` 的内容（已去缩进） */
interface DefinitionContent {
    content: string
    startLine: number
    nextLine: number
}

/**
 * 收集一个定义的内容：`: ` 之后的文本 + 缩进 ≥2 列的续行（空行允许，但只保留到最后一个
 * 非空续行）；遇到下一个 `: ` 定义行或非缩进行即结束。
 */
function collectDefinitionContent(
    state: StateBlock,
    markerLine: number,
    endLine: number
): DefinitionContent {
    const match = DEFINITION_MARKER_PATTERN.exec(getLineText(state, markerLine))
    const firstLine = match ? match[1] : ''
    let nextLine = markerLine + 1
    let lastContentLine = markerLine
    while (nextLine < endLine) {
        if (state.isEmpty(nextLine)) {
            nextLine += 1
            continue
        }
        if (isDefinitionMarkerLine(state, nextLine)) {
            break
        }
        if (state.sCount[nextLine] - state.blkIndent >= DEFINITION_CONTENT_INDENT) {
            lastContentLine = nextLine
            nextLine += 1
            continue
        }
        break
    }
    let content = firstLine
    if (lastContentLine > markerLine) {
        // 定义列表 dd 续行口径：blkIndent + 2（`: ` 标记占 2 列），与公共 helper 的基础去缩进函数等价
        const continuation = getDedentedContent(
            state,
            markerLine + 1,
            lastContentLine + 1,
            state.blkIndent + DEFINITION_CONTENT_INDENT
        )
        content = content.length > 0 ? `${content}\n${continuation}` : continuation
    }
    return { content, startLine: markerLine + 1, nextLine }
}

/** 去掉「单个段落」包装：`<dd><p>定义</p></dd>` → `<dd>定义</dd>`（多段落/其它块保持原样） */
function hideSingleParagraphWrapper(tokens: Token[], startIndex: number): void {
    if (tokens.length - startIndex !== 3) {
        return
    }
    const openToken = tokens[startIndex]
    const inlineToken = tokens[startIndex + 1]
    const closeToken = tokens[startIndex + 2]
    if (
        openToken.type === 'paragraph_open' &&
        inlineToken.type === 'inline' &&
        closeToken.type === 'paragraph_close'
    ) {
        openToken.hidden = true
        closeToken.hidden = true
    }
}

/**
 * 定义列表 block rule：`术语` 行 + 后一行 `: 定义`；支持多术语共享定义、多定义、组间空行。
 * 产出 `<dl><dt>…</dt><dd>…（递归解析）</dd>…</dl>`；不满足结构时返回 false 交回段落解析。
 */
export function definitionListBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    let group = scanDefinitionListGroup(state, startLine, endLine)
    if (!group) {
        return false
    }
    if (silent) {
        return true
    }
    if (isNestingTooDeep(state, ENV_NESTING_DEPTH)) {
        return false
    }

    const listTokenIndex = state.tokens.length
    const listOpen = state.push(TOKEN_DEFINITION_LIST_OPEN, 'dl', 1)
    listOpen.block = true
    let lastLine = group.firstDefinitionLine

    for (;;) {
        group.termLines.forEach((termLine) => {
            const termOpen = state.push(TOKEN_DEFINITION_TERM_OPEN, 'dt', 1)
            termOpen.block = true
            termOpen.map = [termLine, termLine + 1]
            const inlineToken = state.push('inline', '', 0)
            inlineToken.block = true
            inlineToken.map = [termLine, termLine + 1]
            inlineToken.content = getLineText(state, termLine).trim()
            inlineToken.children = []
            const termClose = state.push(TOKEN_DEFINITION_TERM_CLOSE, 'dt', -1)
            termClose.block = true
        })

        let definitionLine = group.firstDefinitionLine
        while (definitionLine < endLine && isDefinitionMarkerLine(state, definitionLine)) {
            const definition = collectDefinitionContent(state, definitionLine, endLine)
            const itemOpen = state.push(TOKEN_DEFINITION_DESC_OPEN, 'dd', 1)
            itemOpen.block = true
            itemOpen.map = [definitionLine, definition.nextLine]
            const contentStartIndex = state.tokens.length
            parseNestedContent(state, definition.content, definition.startLine, ENV_NESTING_DEPTH)
            hideSingleParagraphWrapper(state.tokens, contentStartIndex)
            const itemClose = state.push(TOKEN_DEFINITION_DESC_CLOSE, 'dd', -1)
            itemClose.block = true
            lastLine = definition.nextLine
            definitionLine = definition.nextLine
        }

        // 组间允许空行：跳过空行后若仍是「术语+定义」结构，则继续并入同一个 dl
        let candidate = lastLine
        while (candidate < endLine && state.isEmpty(candidate)) {
            candidate += 1
        }
        const nextGroup =
            candidate < endLine ? scanDefinitionListGroup(state, candidate, endLine) : null
        if (!nextGroup) {
            break
        }
        group = nextGroup
        lastLine = candidate
    }

    const listClose = state.push(TOKEN_DEFINITION_LIST_CLOSE, 'dl', -1)
    listClose.block = true
    if (state.tokens[listTokenIndex]) {
        state.tokens[listTokenIndex].map = [startLine, lastLine]
    }
    state.line = lastLine
    return true
}

/* ============================== 四、core 规则：任务列表 ============================== */

/**
 * 任务列表 core 规则（在 core inline 之后执行，children 已 tokenize）：
 * 识别列表项首段行内内容开头的 `[ ]` / `[x]` / `[X]`，给 `<li>` 加 `task-list-item` class，
 * 并把 `<input type="checkbox" disabled checked?> ` 插到首段内容最前（不改动其余行内 token）。
 */
export function taskListCoreRule(state: StateCore): void {
    const tokens = state.tokens
    for (let index = 0; index < tokens.length; index += 1) {
        const inlineToken = tokens[index]
        if (inlineToken.type !== 'inline') {
            continue
        }
        const paragraphIndex = index - 1
        if (paragraphIndex < 0 || tokens[paragraphIndex].type !== 'paragraph_open') {
            continue
        }
        const itemIndex = paragraphIndex - 1
        if (itemIndex < 0 || tokens[itemIndex].type !== 'list_item_open') {
            continue
        }
        const marker = TASK_LIST_MARKER_PATTERN.exec(inlineToken.content)
        if (!marker) {
            continue
        }
        const children = inlineToken.children
        if (!children || children.length === 0) {
            continue
        }
        const firstChild = children[0]
        if (firstChild.type !== 'text' || !firstChild.content.startsWith(marker[0])) {
            continue
        }
        const rest = firstChild.content.slice(marker[0].length)
        if (rest.length > 0) {
            firstChild.content = rest
        } else {
            children.shift()
        }
        inlineToken.content = inlineToken.content.slice(marker[0].length)

        const checked = marker[1].toLowerCase() === 'x'
        const checkbox = new state.Token('html_inline', '', 0)
        checkbox.content = checked
            ? '<input type="checkbox" disabled checked>'
            : '<input type="checkbox" disabled>'
        children.unshift(checkbox)
        tokens[itemIndex].attrJoin('class', 'task-list-item')
    }
}

/* ============================== 五、渲染规则：折叠提示块 ============================== */

/** 注册折叠提示块 token 的渲染规则（其余自定义 tag token 走默认 renderToken） */
export function registerDetailsRenderer(md: MarkdownItInstance): void {
    const escapeHtml = (value: string): string => md.utils.escapeHtml(value)

    md.renderer.rules[TOKEN_DETAILS_OPEN] = (tokens, index) => {
        const meta = tokens[index].meta ?? {}
        const rawType = typeof meta.type === 'string' ? meta.type : ''
        const type = rawType.length > 0 ? rawType : 'note'
        const rawTitle = typeof meta.title === 'string' ? meta.title : ''
        const title = rawTitle.length > 0 ? rawTitle : type
        const openAttribute = meta.open === true ? ' open' : ''
        return (
            `<details class="admonition ${escapeHtml(type)}"${openAttribute}>\n` +
            `<summary class="admonition-title">${escapeHtml(title)}</summary>\n`
        )
    }
    md.renderer.rules[TOKEN_DETAILS_CLOSE] = () => '</details>\n'
}
