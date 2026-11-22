/**
 * preview-mkdocs-material.ts
 * mkdocs-material 语法（`!!! admonition` 提示块 / `=== "标签"` 标签页）的 markdown-it 原生 block 插件。
 *
 * 背景（缺陷）：
 * 旧实现在 `preview-local-render.ts` 里用「正则/行扫描 → 预渲染 HTML 字符串」的方式处理这两类语法，
 * 再把生成的 HTML 直接拼回 Markdown 文本交给 markdown-it。该方案存在结构性缺陷：
 * 1. admonition 内嵌 tabbed set、tab 内嵌 4/8 空格缩进代码围栏的嵌套组合无法正确切分；
 * 2. 拼出的 HTML 与代码围栏文本混在一起，markdown-it 不再解析围栏（裸 ``` 原样出现在预览里）；
 * 3. 内容块内部的 Markdown（列表/加粗/KaTeX 等）需要人工二次 render，易漏分支。
 *
 * 现方案：注册两个 markdown-it block rule（admonition / tabbed set），在 Markdown 解析阶段直接
 * 产出容器 token，内容用 `state.md.block.parse()` 递归解析后插入 open/close 之间：
 * - 嵌套（admonition 内 tab、tab 内代码围栏/列表/公式、admonition 嵌套 admonition）由
 *   markdown-it 自身的 block 解析器天然支持；
 * - 内容缩进按「相对当前块缩进（state.blkIndent）≥ 4 列」判定，去缩进用 state.getLines()
 *   统一处理（与 markdown-it 的缩进代码块阈值一致，Tab 按 4 列展开）；
 * - 内容 token 的源码行号（token.map）会回填为整篇文档的绝对行号，保证目录定位行号准确；
 * - 渲染规则分别输出与既有 `styles/material/admonition.css` / `styles/material/tableset.css`
 *   类约定匹配的 HTML 结构（后者依赖「input 直接子元素 + labels + content」的兄弟选择器）。
 *
 * 优雅回退：块头部完全不匹配时规则返回 false，交回普通段落/代码块规则；
 * 内容为空、未闭合、嵌套过深（超过 markdown-it maxNesting）等情况均不抛异常、不吞后续 Markdown。
 */
import MarkdownIt from 'markdown-it'
import type { Env, StateBlock } from 'markdown-it'
// 块级解析公共 helper（第 3 批子任务 D 去重）：本模块使用缩进口径 A（blkIndent + 4，见 preview-block-utils）
import {
    CONTENT_INDENT,
    canStartBlock,
    collectIndentedBlockEnd,
    ensureEnv,
    getEnvNumber,
    getIndentedBlockContent,
    getLineText,
    isNestingTooDeep,
    parseNestedContent
} from './preview-block-utils'

/** markdown-it 实例类型（`MarkdownIt` 默认导出是构造器值，实例类型需用 InstanceType 表达） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/* ============================== 一、语法与 token 约定 ============================== */

/** admonition 头部：`!!! type "title"`（title 可省略；类型仅允许字母/数字/下划线/连字符） */
const ADMONITION_HEADER_PATTERN = /^!!!\s*([\w-]+)(?:\s+"([^"]*)")?[ \t]*$/

/** tab 头部：`=== "标签"`（兼容 `===  "示例"` 这种 === 与引号间多个空格的写法） */
const TABBED_HEADER_PATTERN = /^===\s+"([^"]*)"[ \t]*$/

/** 插件产出的 token 类型（开放/关闭成对出现，nesting 分别 1 / -1） */
export const MKDOCS_ADMONITION_OPEN = 'mkdocs_admonition_open'
export const MKDOCS_ADMONITION_CLOSE = 'mkdocs_admonition_close'
export const MKDOCS_TABS_OPEN = 'mkdocs_tabs_open'
export const MKDOCS_TAB_OPEN = 'mkdocs_tab_open'
export const MKDOCS_TAB_CLOSE = 'mkdocs_tab_close'
export const MKDOCS_TABS_CLOSE = 'mkdocs_tabs_close'

/** env 上的 tabbed set 自增计数器键名（同一次解析内保证多组 tab 的 name/id 唯一） */
const ENV_TABBED_SET_ID = '__mkdocsMaterialTabbedSetId'
/** env 上的递归嵌套深度键名（防御恶意深层嵌套导致栈溢出） */
const ENV_NESTING_DEPTH = '__mkdocsMaterialNestingDepth'

/* ============================== 一.五、tab 深链（#tab-id） ==============================
 * 目标：让 `#__tabbed_<setId>_<tabNumber>`（panel/radio 锚点）或
 * `#__tabbed_<setId>_<tabNumber>_label`（label 锚点）这类深链可以定位到具体 tab：
 * - 渲染时为 tabbed-set / label / panel 产出稳定的 id（见下方 id 生成函数），
 *   label 另带 data-tab-target 指向对应 panel id，供预览组件做点击委托；
 * - 路径两端（渲染器与 getTabTargetByHash）共用同一组 id 生成函数，避免约定漂移。
 *
 * 兼容性：新增 id/data 属性会改变既有 tabbed HTML（既有单元测试断言了 label 的精确
 * 字符串），因此由 markdown-it env 开关控制：`createTabDeepLinkEnv()` 产出的 env
 * 传给 `md.render(src, env)` 时才输出深链属性；不传 env 时 HTML 与历史版本逐字节一致。
 */
export const MDX_TAB_DEEP_LINK_ENV_KEY = '__mdxTabDeepLinks'

/** tab 深链解析结果（radioId 即 radio input 的 id，可直接赋值 checked 切换 tab） */
export interface TabDeepLinkTarget {
    /** 形如 `__tabbed_12_2` 的 radio id */
    radioId: string
}

/** 生成 tabbed-set 容器锚点 id：`__tabbed_set_<setId>` */
export function getTabbedSetAnchorId(setId: number): string {
    return `__tabbed_set_${setId}`
}

/** 生成第 tabNumber（1-based）个 radio 与 panel 共用的稳定 id：`__tabbed_<setId>_<tabNumber>` */
export function getTabbedRadioId(setId: number, tabNumber: number): string {
    return `__tabbed_${setId}_${tabNumber}`
}

/**
 * 生成第 tabNumber（1-based）个 panel 的稳定 id：`__tabbed_<setId>_<tabNumber>_panel`。
 *
 * 为什么 panel 带 `_panel` 后缀：radio input 已占用 `__tabbed_<setId>_<tabNumber>`（既有
 * mkdocs-material 约定，基线测试断言了该 id），HTML id 必须全局唯一，panel 不能复用。
 * `getTabTargetByHash` 仍按任务约定把 `#__tabbed_<setId>_<n>` 解析为 radioId。
 */
export function getTabbedPanelId(setId: number, tabNumber: number): string {
    return `__tabbed_${setId}_${tabNumber}_panel`
}

/** 生成第 tabNumber（1-based）个 label 的稳定 id：`__tabbed_<setId>_<tabNumber>_label` */
export function getTabbedLabelId(setId: number, tabNumber: number): string {
    return `__tabbed_${setId}_${tabNumber}_label`
}

/**
 * 构造启用 tab 深链属性的渲染 env。
 * 使用方式：`md.render(source, createTabDeepLinkEnv())`（预览组件接线时统一传入）。
 */
export function createTabDeepLinkEnv(): Env {
    return { [MDX_TAB_DEEP_LINK_ENV_KEY]: true }
}

/** 当前渲染是否启用 tab 深链属性（env 未提供/未开启时返回 false，保持历史 HTML 不变） */
export function isTabDeepLinkEnabled(env: Env | undefined): boolean {
    return env?.[MDX_TAB_DEEP_LINK_ENV_KEY] === true
}

/** tab 深链 hash 的合法形态：`#__tabbed_<setId>_<n>`、`#__tabbed_<setId>_<n>_label`、`#__tabbed_<setId>_<n>_panel` */
const TAB_DEEP_LINK_HASH_PATTERN = /^__tabbed_(\d+)_(\d+)(?:_(?:label|panel))?$/

/**
 * 把 URL hash 解析为需要选中的 radio id（纯函数，供预览组件接入点击/hashchange 事件）。
 *
 * 支持：
 * - `#__tabbed_12_2`（panel / radio 锚点）
 * - `#__tabbed_12_2_label`（label 锚点）
 * - `#__tabbed_12_2_panel`（panel 锚点，兼容 root 代理按 panel id 拼链接）
 * - 省略前导 `#`、或传入完整 URL（取最后一个 `#` 之后的部分）
 *
 * 不合法（不是 tab 深链、set/序号非正整数、`#__tabbed_set_12` 容器锚点）返回 null。
 */
export function getTabTargetByHash(hash: string): TabDeepLinkTarget | null {
    if (typeof hash !== 'string') {
        return null
    }
    const hashIndex = hash.lastIndexOf('#')
    let value = (hashIndex >= 0 ? hash.slice(hashIndex + 1) : hash).trim()
    try {
        value = decodeURIComponent(value)
    } catch {
        // 非法百分号编码：保留原值继续做严格匹配（不抛异常）
    }
    const match = TAB_DEEP_LINK_HASH_PATTERN.exec(value)
    if (!match) {
        return null
    }
    const setId = Number(match[1])
    const tabNumber = Number(match[2])
    if (!Number.isSafeInteger(setId) || !Number.isSafeInteger(tabNumber) || tabNumber < 1) {
        return null
    }
    return { radioId: getTabbedRadioId(setId, tabNumber) }
}

/* ============================== 二、行级工具函数 ============================== */

/**
 * 匹配 admonition 头部。
 * @returns 类型（保持原文大小写，渲染时再小写化）与标题（可为空串）；不匹配返回 null
 */
function matchAdmonitionHeader(lineText: string): { type: string; title: string } | null {
    const match = ADMONITION_HEADER_PATTERN.exec(lineText)
    if (!match) {
        return null
    }
    return { type: match[1], title: match[2] ?? '' }
}

/**
 * 匹配 tab 头部。
 * @returns 标签文本；不匹配返回 null
 */
function matchTabbedHeader(lineText: string): string | null {
    const match = TABBED_HEADER_PATTERN.exec(lineText)
    return match ? match[1] : null
}

/** 无缩进 tab 内容兼容分支的段边界：标题或分隔线（避免吞掉后续正文）。 */
function isTabContentSectionBoundary(lineText: string): boolean {
    const trimmed = lineText.trim()
    if (/^#{1,6}(?:\s|$)/.test(trimmed)) {
        return true
    }
    return /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(trimmed)
}

/**
 * 分配下一个 tabbed set 序号（从 1 开始）。
 * 计数器挂在 env 上，同一次解析（含递归子解析）内自增，保证多组 tab 的 radio name/id 不冲突。
 */
function nextTabbedSetId(env: Env): number {
    const next = getEnvNumber(env, ENV_TABBED_SET_ID) + 1
    env[ENV_TABBED_SET_ID] = next
    return next
}

/* ============================== 三、block rule 实现 ============================== */

/**
 * admonition block rule：`!!! type "title"` + 缩进内容。
 * 产出 `mkdocs_admonition_open` → 内容 token → `mkdocs_admonition_close`。
 */
function admonitionBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    const header = matchAdmonitionHeader(getLineText(state, startLine))
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
    // 缩进口径 A（blkIndent + 4）：!!! 内容必须相对容器再缩进 4 列
    const content = getIndentedBlockContent(state, startLine + 1, nextLine)

    const openToken = state.push(MKDOCS_ADMONITION_OPEN, 'div', 1)
    openToken.block = true
    openToken.map = [startLine, nextLine]
    openToken.meta = { type: header.type, title: header.title }
    parseNestedContent(state, content, startLine + 1, ENV_NESTING_DEPTH)
    const closeToken = state.push(MKDOCS_ADMONITION_CLOSE, 'div', -1)
    closeToken.block = true

    state.line = nextLine
    return true
}

/** 单个 tab 段的信息（标签 + 去缩进内容 + 内容起始绝对行号） */
interface TabSegment {
    label: string
    content: string
    contentStartLine: number
}

/**
 * tabbed set block rule：一个或多个连续的 `=== "标签"` 段（段之间可有空行分隔）。
 * 产出 `mkdocs_tabs_open`（meta.labels 含全部标签）→ 每段 `mkdocs_tab_open` → 内容 token
 * → `mkdocs_tab_close` → `mkdocs_tabs_close`。
 */
function tabbedSetBlockRule(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    if (!canStartBlock(state, startLine)) {
        return false
    }
    if (matchTabbedHeader(getLineText(state, startLine)) === null) {
        return false
    }
    if (silent) {
        return true
    }
    const env = ensureEnv(state)
    if (isNestingTooDeep(state, ENV_NESTING_DEPTH)) {
        return false
    }

    const segments: TabSegment[] = []
    let headerLine = startLine
    let nextLine = startLine + 1
    // 逐段扫描：每段 = 头部行 + 缩进内容；段结束后若下一非空行仍是 tab 头部，则继续收集
    for (;;) {
        const label = matchTabbedHeader(getLineText(state, headerLine))
        if (label === null) {
            break
        }
        // 记录本段最后一个「非空缩进行」的行号，用于裁掉段尾空行（段间空行不属于内容）
        let lastContentLine = headerLine
        nextLine = headerLine + 1
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
        const contentEnd = lastContentLine + 1
        let content = getIndentedBlockContent(state, headerLine + 1, contentEnd)
        // 兼容用户常见写法：`=== "标签"` 下内容没有缩进（严格 mkdocs 要求缩进 4 格）。
        // 若没有任何缩进内容，则把后续非空行收集到下一个 tab 头部 / 标题 / 分隔线之前，
        // 避免整段内容落到 tab 外、tab 面板显示为空白。
        if (lastContentLine === headerLine) {
            let unindentedEnd = headerLine + 1
            while (unindentedEnd < endLine) {
                if (matchTabbedHeader(getLineText(state, unindentedEnd)) !== null) {
                    break
                }
                if (isTabContentSectionBoundary(getLineText(state, unindentedEnd))) {
                    break
                }
                unindentedEnd += 1
            }
            // 内容裁掉段尾空行，但 nextLine 必须停在下一个 tab 头部/段边界，
            // 否则会把下一段误判为普通内容而拆成多个 tabbed set。
            let contentEnd = unindentedEnd
            while (contentEnd > headerLine + 1 && state.isEmpty(contentEnd - 1)) {
                contentEnd -= 1
            }
            nextLine = unindentedEnd
            content = state.getLines(headerLine + 1, contentEnd, state.blkIndent, false)
        }
        segments.push({
            label,
            // 缩进口径 A：tab 内容相对容器缩进 4 列；无缩进兼容分支已按 blkIndent 取原文
            content,
            contentStartLine: headerLine + 1
        })
        // 下一个 tab 段：要求下一行仍是（相对缩进 <4 的）tab 头部，否则本组结束
        if (nextLine >= endLine || matchTabbedHeader(getLineText(state, nextLine)) === null) {
            break
        }
        headerLine = nextLine
    }

    const setId = nextTabbedSetId(env)
    const setOpenToken = state.push(MKDOCS_TABS_OPEN, 'div', 1)
    setOpenToken.block = true
    setOpenToken.map = [startLine, nextLine]
    setOpenToken.meta = { setId, labels: segments.map((segment) => segment.label) }
    segments.forEach((segment, index) => {
        const tabOpenToken = state.push(MKDOCS_TAB_OPEN, 'div', 1)
        tabOpenToken.block = true
        tabOpenToken.map = [segment.contentStartLine - 1, segment.contentStartLine - 1]
        // setId 供渲染器生成深链 panel id（panel 与第 index+1 个 radio 共用同一 id）
        tabOpenToken.meta = { index, setId }
        parseNestedContent(state, segment.content, segment.contentStartLine, ENV_NESTING_DEPTH)
        const tabCloseToken = state.push(MKDOCS_TAB_CLOSE, 'div', -1)
        tabCloseToken.block = true
    })
    const setCloseToken = state.push(MKDOCS_TABS_CLOSE, 'div', -1)
    setCloseToken.block = true

    state.line = nextLine
    return true
}

/* ============================== 四、渲染规则 ============================== */

/**
 * 注册 token 渲染规则。
 * 结构约定（与既有 mkdocs-material CSS 选择器匹配）：
 * - admonition：`.admonition.${type} > p.admonition-title` + 内容 HTML；
 * - tabbed set：`.tabbed-set.tabbed-alternate` 的直接子元素依次为 N 个 radio input、
 *   `.tabbed-labels`（内含 N 个 label）、`.tabbed-content`（内含 N 个 `.tabbed-block`）。
 *   tableset.css 依赖 `input:first-child:checked ~ .tabbed-labels > :first-child` 等兄弟选择器，
 *   因此 input/labels/content 必须保持该顺序且同为 .tabbed-set 直接子元素。
 */
function registerRenderers(md: MarkdownItInstance): void {
    const escapeHtml = (value: string): string => md.utils.escapeHtml(value)

    md.renderer.rules[MKDOCS_ADMONITION_OPEN] = (tokens, idx) => {
        const meta = tokens[idx].meta ?? {}
        const rawType = typeof meta.type === 'string' ? meta.type : ''
        const type = rawType.length > 0 ? rawType.toLowerCase() : 'note'
        const rawTitle = typeof meta.title === 'string' ? meta.title : ''
        const title = rawTitle.length > 0 ? rawTitle : type
        return (
            `<div class="admonition ${escapeHtml(type)}">` +
            `<p class="admonition-title">${escapeHtml(title)}</p>`
        )
    }
    md.renderer.rules[MKDOCS_ADMONITION_CLOSE] = () => '</div>\n'

    md.renderer.rules[MKDOCS_TABS_OPEN] = (tokens, idx, _options, env) => {
        const meta = tokens[idx].meta ?? {}
        const setId = typeof meta.setId === 'number' ? meta.setId : 1
        const labels = Array.isArray(meta.labels) ? meta.labels.map((label) => String(label)) : []
        // 深链属性受 env 开关控制：未开启时输出与历史版本逐字节一致（既有测试基线依赖）
        const deepLinks = isTabDeepLinkEnabled(env)
        const setAnchor = deepLinks ? ` id="${getTabbedSetAnchorId(setId)}"` : ''
        const parts: string[] = [
            `<div${setAnchor} class="tabbed-set tabbed-alternate" data-tabs="${setId}:${labels.length}">\n`
        ]
        labels.forEach((_label, index) => {
            const tabNumber = index + 1
            const checked = index === 0 ? ' checked' : ''
            parts.push(
                `<input type="radio" name="__tabbed_${setId}" ` +
                    `id="${getTabbedRadioId(setId, tabNumber)}"${checked}>\n`
            )
        })
        parts.push('<div class="tabbed-labels">')
        labels.forEach((label, index) => {
            const tabNumber = index + 1
            // label 深链属性：id 供 #__tabbed_x_y_label 直接锚定，data-tab-target 指向对应 panel
            const deepLinkAttrs = deepLinks
                ? ` id="${getTabbedLabelId(setId, tabNumber)}"` +
                  ` data-tab-target="${getTabbedPanelId(setId, tabNumber)}"`
                : ''
            parts.push(
                `<label for="${getTabbedRadioId(setId, tabNumber)}"${deepLinkAttrs}>${escapeHtml(label)}</label>`
            )
        })
        parts.push('</div>\n<div class="tabbed-content">')
        return parts.join('')
    }
    md.renderer.rules[MKDOCS_TAB_OPEN] = (tokens, idx, _options, env) => {
        if (!isTabDeepLinkEnabled(env)) {
            return '<div class="tabbed-block">'
        }
        const meta = tokens[idx].meta ?? {}
        const setId = typeof meta.setId === 'number' ? meta.setId : 1
        const index = typeof meta.index === 'number' ? meta.index : 0
        // panel id 带 _panel 后缀（radio 已占用 __tabbed_<set>_<n>，HTML id 必须唯一）；
        // 既有 input:checked ~ .tabbed-block 兄弟选择器不依赖 id，结构与交互保持不变
        return `<div id="${getTabbedPanelId(setId, index + 1)}" class="tabbed-block">`
    }
    md.renderer.rules[MKDOCS_TAB_CLOSE] = () => '</div>'
    md.renderer.rules[MKDOCS_TABS_CLOSE] = () => '</div>\n</div>\n'
}

/* ============================== 五、插件入口 ============================== */

/**
 * mkdocs-material 语法插件：在 markdown-it 实例上注册 admonition / tabbed set 两个 block rule。
 *
 * 使用方式：`md.use(mkdocsMaterialPlugin)`（需在 highlight.js 等渲染插件之后使用即可，
 * 本插件只新增 block rule 与 token 渲染规则，不修改 `md.options.highlight`）。
 */
export function mkdocsMaterialPlugin(md: MarkdownItInstance): void {
    // 每次解析开始时复位 env 上的计数器：同一次 md.render 内自增，跨 render 互不影响
    md.core.ruler.before('normalize', 'mkdocs_material_env_reset', (state) => {
        if (!state.env) {
            return
        }
        state.env[ENV_TABBED_SET_ID] = 0
        state.env[ENV_NESTING_DEPTH] = 0
    })

    // alt: [] —— 自定义块只参与默认 block 链：不允许打断已有段落（避免 `正文\n!!! note` 被误判），
    // 与 mkdocs 要求「指令前有空行」的语义一致；代码块/标题等既有规则仍优先匹配。
    md.block.ruler.before('paragraph', 'mkdocs_admonition', admonitionBlockRule, { alt: [] })
    md.block.ruler.before('paragraph', 'mkdocs_tabbed_set', tabbedSetBlockRule, { alt: [] })

    registerRenderers(md)
}
