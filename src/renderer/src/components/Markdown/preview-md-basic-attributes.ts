/**
 * preview-md-basic-attributes.ts
 * 批次 A「标准 Markdown 扩展」——属性列表（attr_list）语法域
 * （结构优化第 5 批 5.5 由 preview-md-basic.ts 拆出）。
 *
 * 本文件负责的语法域（pymdownx / Python-Markdown attr_list 语义）：
 * - 行内元素尾随属性列表：`[按钮](url){ .md-button }`、`![alt](img){ align=center }`、
 *   `**粗体**{ .warn }`、`` `code`{ .kbd } ``（紧贴前一元素，中间不许空白）；
 * - ATX 标题行尾属性列表：`# 标题 { #custom-id }`（标准 heading 之前的 block rule）；
 * - 延后行内元素的属性列表兜底：强调/内建 strikethrough 等由 markdown-it ruler2 延后产出
 *   open/close token，其尾随属性在行内规则阶段看不到目标，由 core 规则统一附加。
 *
 * 边界：紧贴行内代码的 `{.js}`/`{:.js}` 属于 markdown-it-highlightjs 的语言标注语法，
 * 本模块必须让行（CODE_LANGUAGE_ANNOTATION_PATTERN），否则既有「行内代码高亮语言」会被吞掉。
 * 属性值统一交给 token.attrSet，由 markdown-it 渲染时转义；属性名做了字符消毒。
 */

import type { StateBlock, StateCore, StateInline, Token } from 'markdown-it'
import { canStartBlock, getLineText } from './preview-block-utils'

/* ============================== 一、常量 ============================== */

/** 是否为 ASCII 空白字符（不含换行） */
function isSpaceCode(code: number): boolean {
    return code === 0x20 || code === 0x09 || code === 0x0b || code === 0x0c || code === 0x0d
}

/** ATX 标题 + 行尾属性列表：`# 标题 { #id .class }` */
const HEADING_ATTRIBUTE_PATTERN = /^(#{1,6})[ \t]+(.*?)[ \t]*\{([^{}\n]*)\}[ \t]*$/
/** 行内元素尾随属性列表的 class / id / key=value 语法 */
const ATTRIBUTE_CLASS_PATTERN = /^\.([A-Za-z0-9_:-]+)/
const ATTRIBUTE_ID_PATTERN = /^#([A-Za-z0-9_:.-]+)/
const ATTRIBUTE_KEY_PATTERN =
    /^([A-Za-z_][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*)))?/
/** core 阶段识别行内属性列表文本（`{ .class }` 位于行内 token 流开头） */
const DEFERRED_ATTRIBUTE_LIST_PATTERN = /^\{([^{}\n]*)\}/
/** 行内属性列表前一个元素是行内代码时的语言标注语法（markdown-it-highlightjs 的 `{.js}`/`{:.js}`） */
const CODE_LANGUAGE_ANNOTATION_PATTERN = /^:?\.[^}\s]+$/

/** 行内属性可附加的目标标签（仅限真实行内元素；纯文本/http 原始 HTML 不附加） */
const INLINE_ATTRIBUTE_TARGET_TAGS = new Set([
    'a',
    'img',
    'code',
    'em',
    'strong',
    's',
    'del',
    'ins',
    'mark',
    'sup',
    'sub',
    'kbd',
    'span',
    'label',
    'button'
])

/* ============================== 二、属性操作解析与应用 ============================== */

/** 属性列表操作（按出现顺序应用：`.class` 追加、`#id`/`key=value` 覆盖） */
type AttributeOperation =
    | { kind: 'class'; value: string }
    | { kind: 'id'; value: string }
    | { kind: 'attribute'; name: string; value: string }

/** 属性名消毒：非法字符替换为下划线（与 Python-Markdown attr_list 语义接近） */
function sanitizeAttributeName(name: string): string {
    return name.replace(/[^A-Za-z0-9_:.-]/g, '_')
}

/**
 * 解析 `{ .class #id key=value key="quoted value" }` 内部文本（不含花括号）。
 * 支持可选的前导冒号（`{: .class }`）；语法不合法返回 null（回退为普通文本）。
 */
function parseAttributeOperations(source: string): AttributeOperation[] | null {
    let position = 0
    const operations: AttributeOperation[] = []
    if (source[position] === ':') {
        position += 1
    }
    while (position < source.length) {
        while (position < source.length && isSpaceCode(source.charCodeAt(position))) {
            position += 1
        }
        if (position >= source.length) {
            break
        }
        const rest = source.slice(position)
        const classMatch = ATTRIBUTE_CLASS_PATTERN.exec(rest)
        if (classMatch) {
            operations.push({ kind: 'class', value: classMatch[1] })
            position += classMatch[0].length
            continue
        }
        const idMatch = ATTRIBUTE_ID_PATTERN.exec(rest)
        if (idMatch) {
            operations.push({ kind: 'id', value: idMatch[1] })
            position += idMatch[0].length
            continue
        }
        const keyMatch = ATTRIBUTE_KEY_PATTERN.exec(rest)
        if (!keyMatch) {
            return null
        }
        operations.push({
            kind: 'attribute',
            name: sanitizeAttributeName(keyMatch[1]),
            value: keyMatch[2] ?? keyMatch[3] ?? keyMatch[4] ?? ''
        })
        position += keyMatch[0].length
    }
    return operations
}

/** 把属性操作应用到 token（class 追加、其余覆盖；渲染时 markdown-it 统一转义属性值） */
function applyAttributeOperations(token: Token, operations: AttributeOperation[]): void {
    for (const operation of operations) {
        if (operation.kind === 'class') {
            token.attrJoin('class', operation.value)
        } else if (operation.kind === 'id') {
            token.attrSet('id', operation.value)
        } else {
            token.attrSet(operation.name, operation.value)
        }
    }
}

/* ============================== 三、属性目标定位 ============================== */

/**
 * 找到行内属性列表应附加的目标 token：从 endIndex 指向的「紧邻前一个行内元素」出发。
 * 若该 token 是闭合 token（emphasis/link/自定义包裹等），向前配平到对应 open token；
 * 若该 token 是自闭合行内元素（image/code_inline）则直接作为目标。
 */
function resolveAttributeTarget(tokens: Token[], endIndex: number): Token | null {
    let index = endIndex
    if (index < 0 || index >= tokens.length) {
        return null
    }
    if (tokens[index].nesting === -1) {
        let depth = 0
        for (; index >= 0; index -= 1) {
            const token = tokens[index]
            if (token.nesting === -1) {
                depth += 1
            } else if (token.nesting === 1) {
                depth -= 1
                if (depth === 0) {
                    break
                }
            }
        }
        if (index < 0) {
            return null
        }
    } else if (tokens[index].nesting !== 0) {
        return null
    }
    const target = tokens[index]
    if (!target.tag || !INLINE_ATTRIBUTE_TARGET_TAGS.has(target.tag)) {
        return null
    }
    return target
}

/** 行内属性列表目标是「当前 token 流最后一个元素」时的封装 */
function resolveInlineAttributeTarget(tokens: Token[]): Token | null {
    return resolveAttributeTarget(tokens, tokens.length - 1)
}

/* ============================== 四、块级规则：标题属性 ============================== */

/**
 * 标题属性 block rule：在标准 heading 规则之前匹配「ATX 标题 + 行尾属性列表」。
 * 属性列表无效时返回 false，由标准 heading 规则按普通标题处理（优雅回退）。
 */
export function headingAttributeBlockRule(
    state: StateBlock,
    startLine: number,
    _endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    const match = HEADING_ATTRIBUTE_PATTERN.exec(getLineText(state, startLine))
    if (!match) {
        return false
    }
    const operations = parseAttributeOperations(match[3])
    if (!operations || operations.length === 0) {
        return false
    }
    if (silent) {
        return true
    }

    const level = match[1].length
    const tag = `h${level}`
    // 与 CommonMark 一致：去掉行尾可选的 ATX 关闭井号
    const headingText = match[2].replace(/[ \t]+#+[ \t]*$/, '')
    const openToken = state.push('heading_open', tag, 1)
    openToken.block = true
    openToken.markup = match[1]
    openToken.map = [startLine, startLine + 1]
    applyAttributeOperations(openToken, operations)
    const inlineToken = state.push('inline', '', 0)
    inlineToken.block = true
    inlineToken.map = [startLine, startLine + 1]
    inlineToken.content = headingText
    inlineToken.children = []
    const closeToken = state.push('heading_close', tag, -1)
    closeToken.block = true
    closeToken.markup = match[1]
    state.line = startLine + 1
    return true
}

/* ============================== 五、core 规则：延后行内属性 ============================== */

/**
 * 行内属性列表 core 规则：处理 markdown-it「延后生成」的行内元素（强调/内建 strikethrough
 * 等由 ruler2 在行内 tokenize 结束后才产出 open/close token），它们后面的属性列表在行内
 * 规则阶段还看不到目标 token，会残留为文本 token；这里在 core inline 之后统一附加。
 * 正常路径（link/image/code/自定义包裹）已在行内规则阶段完成附加，不会走到这里。
 */
export function deferredInlineAttributesCoreRule(state: StateCore): void {
    for (const inlineToken of state.tokens) {
        if (inlineToken.type !== 'inline' || !inlineToken.children) {
            continue
        }
        const children = inlineToken.children
        for (let index = 0; index < children.length; index += 1) {
            const textToken = children[index]
            if (textToken.type !== 'text' && textToken.type !== 'text_special') {
                continue
            }
            const match = DEFERRED_ATTRIBUTE_LIST_PATTERN.exec(textToken.content)
            if (!match) {
                continue
            }
            const operations = parseAttributeOperations(match[1])
            if (!operations || operations.length === 0) {
                continue
            }
            // 跳过零长度 token，定位紧邻的前一个行内元素
            let targetIndex = index - 1
            while (
                targetIndex >= 0 &&
                children[targetIndex].nesting === 0 &&
                children[targetIndex].content.length === 0
            ) {
                targetIndex -= 1
            }
            const target = resolveAttributeTarget(children, targetIndex)
            if (!target) {
                continue
            }
            // 行内代码的语言标注（`{.js}`/`{:.js}`）留给 markdown-it-highlightjs 处理
            if (target.type === 'code_inline' && CODE_LANGUAGE_ANNOTATION_PATTERN.test(match[1])) {
                continue
            }
            applyAttributeOperations(target, operations)
            const rest = textToken.content.slice(match[0].length)
            if (rest.length === 0) {
                children.splice(index, 1)
                index -= 1
            } else {
                textToken.content = rest
            }
        }
    }
}

/* ============================== 六、行内规则：尾随属性列表 ============================== */

/**
 * 行内元素尾随属性列表：`[按钮](url){ .md-button }`、`![alt](img){ align=center }`、
 * `**粗体**{ .warn }`、`` `code`{ .kbd } `` 等。
 * 语法要求属性列表紧贴前一个行内元素（中间不许空白），否则交回普通文本。
 * 注意：紧贴行内代码的 `{.js}`/`{:.js}` 属于 markdown-it-highlightjs 的语言标注语法，
 * 本规则必须让行，否则既有「行内代码高亮语言」能力会被吞掉。
 */
export function parseInlineAttributeList(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    if (start === 0) {
        return false
    }
    const previousCode = source.charCodeAt(start - 1)
    if (previousCode === 0x0a || isSpaceCode(previousCode)) {
        return false
    }
    const close = source.indexOf('}', start + 1)
    if (close < 0) {
        return false
    }
    const inner = source.slice(start + 1, close)
    if (inner.includes('\n')) {
        return false
    }
    const target = resolveInlineAttributeTarget(state.tokens)
    if (!target) {
        return false
    }
    if (target.type === 'code_inline' && CODE_LANGUAGE_ANNOTATION_PATTERN.test(inner)) {
        return false
    }
    const operations = parseAttributeOperations(inner)
    if (!operations || operations.length === 0) {
        return false
    }
    if (silent) {
        state.pos = close + 1
        return true
    }
    applyAttributeOperations(target, operations)
    state.pos = close + 1
    return true
}
