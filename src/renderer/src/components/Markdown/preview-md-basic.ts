/**
 * preview-md-basic.ts
 * 批次 A：标准 Markdown 扩展（mkdocs-material / pymdownx 基础语法）——markdown-it 原生插件。
 *
 * 实现的 9 项语法（全部在 markdown-it 解析阶段完成，不做「渲染后字符串替换」）：
 * 1. 折叠提示块：`??? note "标题"` / `???+ note "标题"` → `<details class="admonition note" open?>`
 *    + `<summary class="admonition-title">标题</summary>` + 递归解析的内容（复用 admonition.css）；
 * 2. 任务列表：`- [ ]` / `- [x]`（大小写 x）→ 列表项 class `task-list-item` + 首段前
 *    `<input type="checkbox" disabled checked?>`;
 * 3. 高亮：`==高亮==` → `<mark>`;
 * 4. 插入/删除/critic：`^^插入^^` → `<ins>`、markdown-it 内建 `~~删除~~` 保持不变、
 *    `{++insert++}`/`{--delete--}`/`{~~old~>new~~}`/`{==highlight==}`/`{>>comment<<}`（隐藏注释）；
 * 5. 上标/下标：`^上标^` → `<sup>`、`~下标~` → `<sub>`（不干扰内建 `~~删除~~`）；
 * 6. 键盘按键：`++ctrl+alt+del++` → `<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>`；
 * 7. 属性列表（attr_list）：`[按钮](url){ .md-button }`、`![alt](img){ align=center }`、
 *    标题 `# 标题 { #custom-id }`、任意行内元素尾随 `{ .class #id key=value }`；
 * 8. 脚注：`[^1]` 引用 + `[^1]: 说明` 定义 → 行内 `<sup class="footnote-ref">…</sup>`，
 *    文末 `<section class="footnotes"><ol><li id="fn-1">…</li></ol></section>`；缺定义时回退原文；
 * 9. 定义列表：`术语` + 下一行 `: 定义`（续行缩进延续）→ `<dl><dt>…</dt><dd>…</dd></dl>`。
 *
 * 设计要点：
 * - 行内规则统一注册为一个「分派器」（插入在 markdown-it `text` 规则之前）：只在 `{`/`+`/`=`/
 *   `^`/`~`/`[` 等终止符位置被调用，命中后才推进 `state.pos`，未命中一律返回 false，
 *   因此不会吞掉 emoji、KaTeX 公式、链接、内建 strikethrough 等既有语法；
 * - 所有用户文本输出前经 `md.utils.escapeHtml`（文本 token 由默认 text 渲染器转义），
 *   块级头部（??? 标题、tab 标签、属性值）显式转义；
 * - 块规则（??? / 脚注定义 / 定义列表 / 标题属性）产出正确 `block`/`nesting`/`map` 的 token，
 *   内容用 `state.md.block.parse()` 递归解析，天然支持嵌套（??? 内列表/代码块/嵌套 ???）；
 * - 非法/未闭合语法一律返回 false 回退为普通文本，不抛异常、不吞后续 Markdown；
 * - 产物标签（details/summary/ins/del/mark/sup/sub/kbd/dl/dt/dd/input 及其
 *   class/id/disabled/checked/open 等属性）均在 DOMPurify 默认 HTML 白名单内（有测试校验）。
 *
 * 已知边界（不修改既有预处理管线的前提下）：
 * - `preview-local-render.ts` 会在 markdown-it 之前把 `![alt](本地图片)` 替换为原始 HTML 并
 *   把本地链接替换为 `<a>`，因此「图片/本地链接 + 属性列表」在完整预览管线中拿不到该属性；
 *   直接 `createPreviewMarkdownIt().render()`（本模块语法层）行为正确；http(s) 链接不受影响。
 * - 段落级「末行单独成行」的属性列表未实现（需求只要求标题同行与行内尾随两种形式）。
 */
import type MarkdownIt from 'markdown-it'
import type { Env, StateBlock, StateCore, StateInline, Token } from 'markdown-it'

/** markdown-it 实例类型（`MarkdownIt` 默认导出是构造器值，实例类型需用 InstanceType 表达） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/* ============================== 一、常量与 token 类型 ============================== */

/** 自定义块缩进阈值：与 markdown-it 缩进代码块一致（4 列，Tab 按 4 列展开） */
const CONTENT_INDENT = 4
/** 定义列表 dd 续行缩进阈值（`: ` 标记本身占 2 列） */
const DEFINITION_CONTENT_INDENT = 2
/** markdown-it 默认 maxNesting（防御恶意深层嵌套导致栈溢出） */
const DEFAULT_MAX_NESTING = 100

/** 折叠提示块：`??? type "title"` / `???+ type "title"`（type 仅字母/数字/下划线/连字符） */
const COLLAPSIBLE_ADMONITION_PATTERN = /^\?\?\?(\+?)\s*([\w-]+)(?:\s+"([^"]*)")?[ \t]*$/
/** 脚注定义：`[^label]: content` */
const FOOTNOTE_DEFINITION_PATTERN = /^\[\^([^\]]+)\]:[ \t]*(.*)$/
/** 定义列表定义行：`: content`（冒号后至少一个空格/Tab） */
const DEFINITION_MARKER_PATTERN = /^:[ \t]+(.*)$/
/** ATX 标题 + 行尾属性列表：`# 标题 { #id .class }` */
const HEADING_ATTRIBUTE_PATTERN = /^(#{1,6})[ \t]+(.*?)[ \t]*\{([^{}\n]*)\}[ \t]*$/
/** 任务列表标记：行内内容开头的 `[ ]` / `[x]` / `[X]` */
const TASK_LIST_MARKER_PATTERN = /^\[([ xX])\](?=\s|$)/
/** 行内元素尾随属性列表的 class / id / key=value 语法 */
const ATTRIBUTE_CLASS_PATTERN = /^\.([A-Za-z0-9_:-]+)/
const ATTRIBUTE_ID_PATTERN = /^#([A-Za-z0-9_:.-]+)/
const ATTRIBUTE_KEY_PATTERN =
    /^([A-Za-z_][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]*)))?/
/** 定义列表「术语行」黑名单：这些行属于其它块语法，不能当作术语 */
const DEFINITION_TERM_BLACKLIST =
    /^(?:[-*+][ \t]|#{1,6}[ \t]|>|\||`{3}|~{3}|\?\?\?|!!!|===|\[\^|<\/?[A-Za-z]|\{)/

/** 折叠提示块 token（open/close 成对；内容 token 递归插入两者之间） */
const TOKEN_DETAILS_OPEN = 'mdx_basic_details_open'
const TOKEN_DETAILS_CLOSE = 'mdx_basic_details_close'
/** 定义列表 token（tag 由默认 renderToken 渲染，无需自定义渲染规则） */
const TOKEN_DEFINITION_LIST_OPEN = 'mdx_basic_definition_list_open'
const TOKEN_DEFINITION_LIST_CLOSE = 'mdx_basic_definition_list_close'
const TOKEN_DEFINITION_TERM_OPEN = 'mdx_basic_definition_term_open'
const TOKEN_DEFINITION_TERM_CLOSE = 'mdx_basic_definition_term_close'
const TOKEN_DEFINITION_DESC_OPEN = 'mdx_basic_definition_desc_open'
const TOKEN_DEFINITION_DESC_CLOSE = 'mdx_basic_definition_desc_close'
/** 脚注引用/回链（渲染规则见第四节） */
const TOKEN_FOOTNOTE_REF = 'mdx_basic_footnote_ref'
const TOKEN_FOOTNOTE_BACKREF = 'mdx_basic_footnote_backref'
/** 文末脚注区（section/ol/li 均为普通 tag token，默认 renderToken 即可渲染） */
const TOKEN_FOOTNOTE_SECTION_OPEN = 'mdx_basic_footnote_section_open'
const TOKEN_FOOTNOTE_SECTION_CLOSE = 'mdx_basic_footnote_section_close'
const TOKEN_FOOTNOTE_LIST_OPEN = 'mdx_basic_footnote_list_open'
const TOKEN_FOOTNOTE_LIST_CLOSE = 'mdx_basic_footnote_list_close'
const TOKEN_FOOTNOTE_ITEM_OPEN = 'mdx_basic_footnote_item_open'
const TOKEN_FOOTNOTE_ITEM_CLOSE = 'mdx_basic_footnote_item_close'

/** env 上的脚注状态键（定义/编号/引用记录，跨 block 与 inline 阶段共享） */
const ENV_FOOTNOTES = '__mdxBasicFootnotes'
/** env 上的递归嵌套深度键（防御深层嵌套） */
const ENV_NESTING_DEPTH = '__mdxBasicNestingDepth'

/* ============================== 二、通用工具函数 ============================== */

/** 读取某一行的原始文本（已去除行首缩进；markdown-it 的 src 已把 CRLF 归一化为 LF） */
function getLineText(state: StateBlock, line: number): string {
    return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line])
}

/**
 * 是否允许在此行起始一个自定义块。
 * 与 markdown-it 内置 block rule 一致：相对当前块缩进（blkIndent）必须小于 4，
 * 否则该行属于缩进代码块，不应被当作 ??? / 脚注定义 / 定义列表的头部。
 */
function canStartBlock(state: StateBlock, line: number): boolean {
    return state.sCount[line] - state.blkIndent < CONTENT_INDENT
}

/** 是否为 ASCII 空白字符（不含换行） */
function isSpaceCode(code: number): boolean {
    return code === 0x20 || code === 0x09 || code === 0x0b || code === 0x0c || code === 0x0d
}

/** 读取（必要时创建）当前解析的 env 对象 */
function ensureEnv(state: { env: Env }): Env {
    if (!state.env) {
        state.env = {}
    }
    return state.env
}

/** 当前递归嵌套深度是否已超限（超限时自定义块回退为普通段落，避免栈溢出） */
function isNestingTooDeep(state: StateBlock, env: Env): boolean {
    const depth = typeof env[ENV_NESTING_DEPTH] === 'number' ? env[ENV_NESTING_DEPTH] : 0
    const maxNesting = state.md.options.maxNesting ?? DEFAULT_MAX_NESTING
    return depth >= maxNesting
}

/** 收集「缩进内容块」结束行号：空行或相对缩进 ≥4 列的行都属于块内容，遇其他行即结束 */
function collectIndentedBlockEnd(state: StateBlock, startLine: number, endLine: number): number {
    let line = startLine + 1
    while (line < endLine) {
        if (state.isEmpty(line)) {
            line += 1
            continue
        }
        if (state.sCount[line] - state.blkIndent >= CONTENT_INDENT) {
            line += 1
            continue
        }
        break
    }
    return line
}

/**
 * 取出 [beginLine, endLine) 区间文本并按「相对当前块缩进 +4 列」去缩进。
 * state.getLines() 是 markdown-it 官方缩进工具：按列展开 Tab、行数一一对应，
 * 因此递归解析后的 token.map 可以按行号整体平移回填。
 */
function getDedentedContent(state: StateBlock, beginLine: number, endLine: number): string {
    if (endLine <= beginLine) {
        return ''
    }
    return state.getLines(beginLine, endLine, state.blkIndent + CONTENT_INDENT, false)
}

/** 把 [startIndex, ...] 新产出的 token.map 从「子文本相对行号」回填为整篇文档绝对行号 */
function remapTokenLineMaps(tokens: Token[], startIndex: number, sourceStartLine: number): void {
    for (let index = startIndex; index < tokens.length; index += 1) {
        const map = tokens[index].map
        if (map) {
            map[0] += sourceStartLine
            map[1] += sourceStartLine
        }
    }
}

/**
 * 块级递归解析：把去缩进后的 Markdown 内容解析为 token 追加到当前 token 流。
 * 内容 token 的源码行号会按 sourceStartLine 回填，保证目录/定位行号准确。
 */
function parseNestedBlockContent(
    state: StateBlock,
    content: string,
    sourceStartLine: number,
    env: Env
): void {
    if (content.length === 0) {
        return
    }
    const tokenStart = state.tokens.length
    const depth = typeof env[ENV_NESTING_DEPTH] === 'number' ? env[ENV_NESTING_DEPTH] : 0
    env[ENV_NESTING_DEPTH] = depth + 1
    try {
        state.md.block.parse(content, state.md, state.env, state.tokens)
    } finally {
        env[ENV_NESTING_DEPTH] = depth
    }
    remapTokenLineMaps(state.tokens, tokenStart, sourceStartLine)
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

/* ============================== 三、块级规则 ============================== */

/* ---------- 3.1 折叠提示块 `???` / `???+` ---------- */

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
function collapsibleAdmonitionBlockRule(
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
    const env = ensureEnv(state)
    if (isNestingTooDeep(state, env)) {
        return false
    }

    const nextLine = collectIndentedBlockEnd(state, startLine, endLine)
    const content = getDedentedContent(state, startLine + 1, nextLine)

    const openToken = state.push(TOKEN_DETAILS_OPEN, 'details', 1)
    openToken.block = true
    openToken.map = [startLine, nextLine]
    openToken.meta = { type: header.type.toLowerCase(), title: header.title, open: header.open }
    parseNestedBlockContent(state, content, startLine + 1, env)
    const closeToken = state.push(TOKEN_DETAILS_CLOSE, 'details', -1)
    closeToken.block = true

    state.line = nextLine
    return true
}

/* ---------- 3.2 脚注定义 `[^label]: content` ---------- */

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

/** 读取脚注状态（不存在时返回 null，不创建） */
function peekFootnoteStore(env: Env): FootnoteStore | null {
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

/**
 * 脚注定义 block rule：`[^label]: 首行内容` + ≥4 空格缩进的续行（空行分隔的续行也算）。
 * 定义本身不产出可见 token（内容暂存 env，由文末脚注 core 规则统一输出），
 * 无定义时行内引用回退为原文；重复定义以第一次为准。
 */
function footnoteDefinitionBlockRule(
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
    const continuation = getDedentedContent(state, startLine + 1, lastContentLine + 1)
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

/* ---------- 3.3 定义列表 `术语` + `: 定义` ---------- */

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
        const continuation = state.getLines(
            markerLine + 1,
            lastContentLine + 1,
            state.blkIndent + DEFINITION_CONTENT_INDENT,
            false
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
function definitionListBlockRule(
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
    const env = ensureEnv(state)
    if (isNestingTooDeep(state, env)) {
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
            parseNestedBlockContent(state, definition.content, definition.startLine, env)
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

/* ---------- 3.4 标题属性列表 `# 标题 { #id .class }` ---------- */

/**
 * 标题属性 block rule：在标准 heading 规则之前匹配「ATX 标题 + 行尾属性列表」。
 * 属性列表无效时返回 false，由标准 heading 规则按普通标题处理（优雅回退）。
 */
function headingAttributeBlockRule(
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

/* ============================== 四、core 规则 ============================== */

/** 每次解析开始时复位 env 上的脚注状态与嵌套计数（跨 render 互不影响） */
function resetBasicEnvCoreRule(state: StateCore): void {
    state.env[ENV_FOOTNOTES] = {
        definitions: new Map(),
        numbers: new Map(),
        nextNumber: 1,
        references: []
    } as FootnoteStore
    state.env[ENV_NESTING_DEPTH] = 0
}

/**
 * 文末脚注区 core 规则（在 core `inline` 之后执行：此时所有 `[^x]` 已编号并记录）。
 * 按「首次引用顺序」输出 section > ol > li[id=fn-N] + 定义内容 + 回链 a[href=#fnref-N]；
 * 未被引用的定义不输出（与 pymdownx 的脚注区一致），缺失定义的引用已在行内阶段回退原文。
 */
function footnoteSectionCoreRule(state: StateCore): void {
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

/**
 * 任务列表 core 规则（在 core inline 之后执行，children 已 tokenize）：
 * 识别列表项首段行内内容开头的 `[ ]` / `[x]` / `[X]`，给 `<li>` 加 `task-list-item` class，
 * 并把 `<input type="checkbox" disabled checked?> ` 插到首段内容最前（不改动其余行内 token）。
 */
function taskListCoreRule(state: StateCore): void {
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

/** core 阶段识别行内属性列表文本（`{ .class }` 位于行内 token 流开头） */
const DEFERRED_ATTRIBUTE_LIST_PATTERN = /^\{([^{}\n]*)\}/

/**
 * 行内属性列表 core 规则：处理 markdown-it「延后生成」的行内元素（强调/内建 strikethrough
 * 等由 ruler2 在行内 tokenize 结束后才产出 open/close token），它们后面的属性列表在行内
 * 规则阶段还看不到目标 token，会残留为文本 token；这里在 core inline 之后统一附加。
 * 正常路径（link/image/code/自定义包裹）已在行内规则阶段完成附加，不会走到这里。
 */
function deferredInlineAttributesCoreRule(state: StateCore): void {
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

/* ============================== 五、行内规则（统一分派 + 各语法处理） ============================== */

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

/** 行内属性列表前一个元素是行内代码时的语言标注语法（markdown-it-highlightjs 的 `{.js}`/`{:.js}`） */
const CODE_LANGUAGE_ANNOTATION_PATTERN = /^:?\.[^}\s]+$/

/**
 * 行内元素尾随属性列表：`[按钮](url){ .md-button }`、`![alt](img){ align=center }`、
 * `**粗体**{ .warn }`、`` `code`{ .kbd } `` 等。
 * 语法要求属性列表紧贴前一个行内元素（中间不许空白），否则交回普通文本。
 * 注意：紧贴行内代码的 `{.js}`/`{:.js}` 属于 markdown-it-highlightjs 的语言标注语法，
 * 本规则必须让行，否则既有「行内代码高亮语言」能力会被吞掉。
 */
function parseInlineAttributeList(state: StateInline, silent: boolean): boolean {
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

/**
 * 脚注引用 `[^label]`：仅当同一次解析内存在 `[^label]: …` 定义时生效；
 * 无定义时返回 false，回退为字面文本 `[^label]`（缺失定义优雅降级）。
 * 编号按首次引用顺序分配，同一脚注多次引用生成 `fnref-N-2` 等不重复锚点。
 */
function parseFootnoteReference(state: StateInline, silent: boolean): boolean {
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
function mdxBasicInlineRule(state: StateInline, silent: boolean): boolean {
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

/* ============================== 六、渲染规则 ============================== */

/** 注册自定义 token 的渲染规则（其余自定义 tag token 走默认 renderToken） */
function registerBasicRenderers(md: MarkdownItInstance): void {
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

/* ============================== 七、插件入口 ============================== */

/**
 * 安装标准 Markdown 扩展插件（批次 A）：
 * 折叠提示块、任务列表、mark/ins/del/sup/sub、键盘按键、行内/标题属性列表、脚注、定义列表。
 *
 * 由 `installPreviewExtensions(md)` 统一调用；只新增 block/inline/core 规则与渲染规则，
 * 不修改 `md.options.highlight`（PF-1 的高亮守卫顺序保持不变）。
 */
export function installMdxBasicExtensions(md: MarkdownItInstance): void {
    // core：解析开始时复位插件状态（同一次 render 内自增，跨 render 互不影响）
    md.core.ruler.before('normalize', 'mdx_basic_env_reset', resetBasicEnvCoreRule)

    // block：标题属性（与标准 heading 相同的段落打断能力）
    md.block.ruler.before('heading', 'mdx_basic_heading_attributes', headingAttributeBlockRule, {
        alt: ['paragraph', 'reference', 'blockquote']
    })
    // block：??? 折叠块 / 定义列表（不打断既有段落，要求块前有空行）
    md.block.ruler.before(
        'paragraph',
        'mdx_basic_collapsible_admonition',
        collapsibleAdmonitionBlockRule,
        { alt: [] }
    )
    md.block.ruler.before('paragraph', 'mdx_basic_definition_list', definitionListBlockRule, {
        alt: []
    })
    // block：脚注定义必须早于 markdown-it 的 reference 规则——`[^1]: 内容` 的形态同时满足
    // 「链接引用定义 `[label]: dest`」，若晚于 reference 会被误解析成引用定义（脚注失效）。
    md.block.ruler.before(
        'reference',
        'mdx_basic_footnote_definition',
        footnoteDefinitionBlockRule,
        {
            alt: []
        }
    )

    // inline：统一分派器（位于 text 之前，仅命中本插件触发字符时生效）
    md.inline.ruler.before('text', 'mdx_basic_inline', mdxBasicInlineRule)

    // core：文末脚注区（inline 之后：所有引用已完成编号）→ 延后行内属性 → 任务列表改写
    md.core.ruler.after('inline', 'mdx_basic_footnote_section', footnoteSectionCoreRule)
    md.core.ruler.after(
        'mdx_basic_footnote_section',
        'mdx_basic_inline_attributes',
        deferredInlineAttributesCoreRule
    )
    md.core.ruler.after('mdx_basic_inline_attributes', 'mdx_basic_task_lists', taskListCoreRule)

    registerBasicRenderers(md)
}
