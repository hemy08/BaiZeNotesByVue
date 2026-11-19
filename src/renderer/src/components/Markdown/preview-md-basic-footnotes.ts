/**
 * preview-md-basic-footnotes.ts
 * 批次 A「标准 Markdown 扩展」——脚注语法域（结构优化第 5 批 5.5 由 preview-md-basic.ts 拆出）。
 *
 * 本文件负责的语法域：
 * - 脚注定义：`[^1]: 说明`（≥4 空格缩进的续行算内容）→ 暂存 env，不产出可见 token；
 * - 脚注引用：`[^1]` → 行内 `<sup class="footnote-ref" id="fnref-N"><a href="#fn-N">N</a></sup>`
 *   （同一脚注多次引用生成 `fnref-N-2` 等不重复锚点）；
 * - 文末脚注区：`<section class="footnotes"><ol><li id="fn-N">…↩</li></ol></section>`
 *   （按首次引用顺序输出，未被引用的定义不输出；缺定义时行内引用回退原文）。
 *
 * env 状态：脚注定义/编号/引用记录挂在 ENV_FOOTNOTES 键上（见 preview-md-basic-shared.ts），
 * 由 resetBasicEnvCoreRule 在每次 core 解析开始时复位，跨 render 互不影响。
 */

import type { Env, StateBlock, StateCore, StateInline } from 'markdown-it'
// 块级解析公共 helper（第 3 批子任务 D 去重）：缩进口径 A = blkIndent + 4（见 preview-block-utils）
import {
    CONTENT_INDENT,
    canStartBlock,
    ensureEnv,
    getIndentedBlockContent,
    getLineText,
    remapTokenLineMaps
} from './preview-block-utils'
import {
    ENV_FOOTNOTES,
    ENV_NESTING_DEPTH,
    type MarkdownItInstance
} from './preview-md-basic-shared'

/* ============================== 一、常量与 token 类型 ============================== */

/** 脚注定义：`[^label]: content` */
const FOOTNOTE_DEFINITION_PATTERN = /^\[\^([^\]]+)\]:[ \t]*(.*)$/

/** 脚注引用/回链（渲染规则见文末 registerFootnoteRenderers） */
const TOKEN_FOOTNOTE_REF = 'mdx_basic_footnote_ref'
const TOKEN_FOOTNOTE_BACKREF = 'mdx_basic_footnote_backref'
/** 文末脚注区（section/ol/li 均为普通 tag token，默认 renderToken 即可渲染） */
const TOKEN_FOOTNOTE_SECTION_OPEN = 'mdx_basic_footnote_section_open'
const TOKEN_FOOTNOTE_SECTION_CLOSE = 'mdx_basic_footnote_section_close'
const TOKEN_FOOTNOTE_LIST_OPEN = 'mdx_basic_footnote_list_open'
const TOKEN_FOOTNOTE_LIST_CLOSE = 'mdx_basic_footnote_list_close'
const TOKEN_FOOTNOTE_ITEM_OPEN = 'mdx_basic_footnote_item_open'
const TOKEN_FOOTNOTE_ITEM_CLOSE = 'mdx_basic_footnote_item_close'

/** 单条脚注定义（内容为去缩进后的 Markdown 源码） */
interface FootnoteDefinition {
    content: string
    /** 内容起始行（回填 token.map 用） */
    startLine: number
}

/** 单条脚注引用（按首次引用顺序编号） */
interface FootnoteReference {
    label: string
    number: number
    /** 同一脚注的第几次引用（从 1 开始，用于生成不重复的锚点 id） */
    occurrence: number
    anchorId: string
}

/** 一次解析内的脚注状态（挂在 env 上） */
interface FootnoteStore {
    definitions: Map<string, FootnoteDefinition>
    numbers: Map<string, number>
    nextNumber: number
    references: FootnoteReference[]
}

/* ============================== 二、env 状态工具 ============================== */

/** 读取脚注状态（不存在时返回 null，不创建） */
export function peekFootnoteStore(env: Env): FootnoteStore | null {
    const store = env[ENV_FOOTNOTES]
    if (!store || typeof store !== 'object') {
        return null
    }
    return store as FootnoteStore
}

/** 读取（必要时创建）脚注状态 */
function ensureFootnoteStore(env: Env): FootnoteStore {
    const existing = peekFootnoteStore(env)
    if (existing) {
        return existing
    }
    const store: FootnoteStore = {
        definitions: new Map(),
        numbers: new Map(),
        nextNumber: 1,
        references: []
    }
    env[ENV_FOOTNOTES] = store
    return store
}

/** 每次解析开始时复位 env 上的脚注状态与嵌套计数（跨 render 互不影响） */
export function resetBasicEnvCoreRule(state: StateCore): void {
    state.env[ENV_FOOTNOTES] = {
        definitions: new Map(),
        numbers: new Map(),
        nextNumber: 1,
        references: []
    } as FootnoteStore
    state.env[ENV_NESTING_DEPTH] = 0
}

/**
 * core 阶段的递归解析（脚注文末区使用）：追加块 token 并手动补做 inline 阶段。
 * 若在 core `inline` 规则之后追加 token，其 inline 子 token 不会被自动 tokenize，
 * 因此这里显式调用 md.inline.parse；行号按 contentStartLine 回填。
 */
function appendParsedBlockContent(
    state: StateCore,
    content: string,
    contentStartLine: number
): void {
    if (content.length === 0) {
        return
    }
    const tokens = state.tokens
    const tokenStart = tokens.length
    state.md.block.parse(content, state.md, state.env, tokens)
    remapTokenLineMaps(tokens, tokenStart, contentStartLine)
    for (let index = tokenStart; index < tokens.length; index += 1) {
        const token = tokens[index]
        if (token.type !== 'inline') {
            continue
        }
        token.children = []
        state.md.inline.parse(token.content, state.md, state.env, token.children)
    }
}

/* ============================== 三、块级规则：脚注定义 ============================== */

/**
 * 脚注定义 block rule：`[^label]: 首行内容` + ≥4 空格缩进的续行（空行分隔的续行也算）。
 * 定义本身不产出可见 token（内容暂存 env，由文末脚注 core 规则统一输出），
 * 无定义时行内引用回退为原文；重复定义以第一次为准。
 */
export function footnoteDefinitionBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    const match = FOOTNOTE_DEFINITION_PATTERN.exec(getLineText(state, startLine))
    if (!match) {
        return false
    }
    const label = match[1].trim()
    if (label.length === 0) {
        return false
    }
    if (silent) {
        return true
    }

    let nextLine = startLine + 1
    let lastContentLine = startLine
    while (nextLine < endLine) {
        if (state.isEmpty(nextLine)) {
            nextLine += 1
            continue
        }
        if (state.sCount[nextLine] - state.blkIndent >= CONTENT_INDENT) {
            lastContentLine = nextLine
            nextLine += 1
            continue
        }
        break
    }
    // 缩进口径 A（blkIndent + 4）：脚注定义的续行要求相对容器缩进 ≥4 列
    const continuation = getIndentedBlockContent(state, startLine + 1, lastContentLine + 1)
    const firstLine = match[2]
    let content = firstLine
    if (continuation.length > 0) {
        content = content.length > 0 ? `${content}\n${continuation}` : continuation
    }

    const store = ensureFootnoteStore(ensureEnv(state))
    if (!store.definitions.has(label)) {
        store.definitions.set(label, { content, startLine: startLine + 1 })
    }
    state.line = nextLine
    return true
}

/* ============================== 四、core 规则：文末脚注区 ============================== */

/**
 * 文末脚注区 core 规则（在 core `inline` 之后执行：此时所有 `[^x]` 已编号并记录）。
 * 按「首次引用顺序」输出 section > ol > li[id=fn-N] + 定义内容 + 回链 a[href=#fnref-N]；
 * 未被引用的定义不输出（与 pymdownx 的脚注区一致），缺失定义的引用已在行内阶段回退原文。
 */
export function footnoteSectionCoreRule(state: StateCore): void {
    const store = peekFootnoteStore(state.env)
    if (!store || store.references.length === 0) {
        return
    }
    const orderedReferences: FootnoteReference[] = []
    const referencesByLabel = new Map<string, FootnoteReference[]>()
    const seenLabels = new Set<string>()
    for (const reference of store.references) {
        const bucket = referencesByLabel.get(reference.label)
        if (bucket) {
            bucket.push(reference)
        } else {
            referencesByLabel.set(reference.label, [reference])
        }
        if (!seenLabels.has(reference.label)) {
            seenLabels.add(reference.label)
            orderedReferences.push(reference)
        }
    }

    const tokens = state.tokens
    const sectionOpen = new state.Token(TOKEN_FOOTNOTE_SECTION_OPEN, 'section', 1)
    sectionOpen.block = true
    sectionOpen.attrSet('class', 'footnotes')
    tokens.push(sectionOpen)
    const listOpen = new state.Token(TOKEN_FOOTNOTE_LIST_OPEN, 'ol', 1)
    listOpen.block = true
    tokens.push(listOpen)

    for (const reference of orderedReferences) {
        const definition = store.definitions.get(reference.label)
        if (!definition) {
            continue
        }
        const itemOpen = new state.Token(TOKEN_FOOTNOTE_ITEM_OPEN, 'li', 1)
        itemOpen.block = true
        itemOpen.attrSet('id', `fn-${reference.number}`)
        tokens.push(itemOpen)
        appendParsedBlockContent(state, definition.content, definition.startLine)
        const backrefs = referencesByLabel.get(reference.label) ?? []
        for (const backref of backrefs) {
            const anchor = new state.Token(TOKEN_FOOTNOTE_BACKREF, '', 0)
            anchor.meta = { anchorId: backref.anchorId, occurrence: backref.occurrence }
            tokens.push(anchor)
        }
        const itemClose = new state.Token(TOKEN_FOOTNOTE_ITEM_CLOSE, 'li', -1)
        itemClose.block = true
        tokens.push(itemClose)
    }

    const listClose = new state.Token(TOKEN_FOOTNOTE_LIST_CLOSE, 'ol', -1)
    listClose.block = true
    tokens.push(listClose)
    const sectionClose = new state.Token(TOKEN_FOOTNOTE_SECTION_CLOSE, 'section', -1)
    sectionClose.block = true
    tokens.push(sectionClose)
}

/* ============================== 五、行内规则：脚注引用 ============================== */

/**
 * 脚注引用 `[^label]`：仅当同一次解析内存在 `[^label]: …` 定义时生效；
 * 无定义时返回 false，回退为字面文本 `[^label]`（缺失定义优雅降级）。
 * 编号按首次引用顺序分配，同一脚注多次引用生成 `fnref-N-2` 等不重复锚点。
 */
export function parseFootnoteReference(state: StateInline, silent: boolean): boolean {
    const source = state.src
    const start = state.pos
    if (source.charCodeAt(start + 1) !== 0x5e) {
        return false
    }
    const close = source.indexOf(']', start + 2)
    if (close < 0) {
        return false
    }
    const rawLabel = source.slice(start + 2, close)
    const label = rawLabel.trim()
    if (label.length === 0 || rawLabel.includes('\n') || rawLabel.includes('[')) {
        return false
    }
    const store = peekFootnoteStore(state.env)
    if (!store || !store.definitions.has(label)) {
        return false
    }
    if (silent) {
        state.pos = close + 1
        return true
    }
    let number = store.numbers.get(label)
    if (number === undefined) {
        number = store.nextNumber
        store.nextNumber += 1
        store.numbers.set(label, number)
    }
    const occurrence = store.references.filter((reference) => reference.label === label).length + 1
    const anchorId = occurrence === 1 ? `fnref-${number}` : `fnref-${number}-${occurrence}`
    store.references.push({ label, number, occurrence, anchorId })
    const token = state.push(TOKEN_FOOTNOTE_REF, '', 0)
    token.meta = { number, anchorId }
    state.pos = close + 1
    return true
}

/* ============================== 六、渲染规则 ============================== */

/** 注册脚注 token 的渲染规则（其余自定义 tag token 走默认 renderToken） */
export function registerFootnoteRenderers(md: MarkdownItInstance): void {
    const escapeHtml = (value: string): string => md.utils.escapeHtml(value)

    md.renderer.rules[TOKEN_FOOTNOTE_REF] = (tokens, index) => {
        const meta = tokens[index].meta ?? {}
        const number = typeof meta.number === 'number' ? meta.number : 0
        const anchorId = typeof meta.anchorId === 'string' ? meta.anchorId : ''
        // id 放在 <sup> 上（与 Python-Markdown 脚注一致）：<a> 保持纯净的 href，
        // 文末回链 <a href="#fnref-N"> 通过 id 精确跳回首次引用位置。
        return (
            `<sup class="footnote-ref" id="${escapeHtml(anchorId)}">` +
            `<a href="#fn-${number}">${number}</a>` +
            `</sup>`
        )
    }

    md.renderer.rules[TOKEN_FOOTNOTE_BACKREF] = (tokens, index) => {
        const meta = tokens[index].meta ?? {}
        const anchorId = typeof meta.anchorId === 'string' ? meta.anchorId : ''
        const occurrence = typeof meta.occurrence === 'number' ? meta.occurrence : 1
        const suffix = occurrence > 1 ? `<sup>${occurrence}</sup>` : ''
        return ` <a href="#${escapeHtml(anchorId)}">↩</a>${suffix}`
    }
}
