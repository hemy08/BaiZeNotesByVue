/**
 * preview-source-anchor.ts
 * 预览 HTML 的「Markdown 源行锚点」注入（编辑器 → 预览滚动同步的数据基础）。
 *
 * 目标：让预览 DOM 能回答「这个块对应编辑器第几行」，从而把编辑器可见区首行映射为
 * 预览滚动位置。实现分两类：
 *
 * 1. **块级 token 属性注入**：markdown-it 解析期在 core.block 之后，给所有带
 *    `token.map` 的块级起始 token 写入 `data-source-line="<行号>"`（1 起始，与 Monaco 行号
 *    同口径）。markdown-it 默认渲染器（标题 / 段落 / 列表 / 引用 / 表格 / 代码 / hr 等）
 *    会经 `renderAttrs` 把属性输出到对应元素。属性只增不改，对既有插件（attr_list 等）
 *    写入的其它属性无影响；用户手写同名属性会被真实源行覆盖。
 * 2. **渲染器包装**：`html_block`（默认渲染器直接返回原始 HTML，忽略 token.attrs）与
 *    `fence`（`preview-md-media` 的增强围栏自定义渲染器会忽略 attrs）无法靠属性注入承载
 *    锚点，改为在渲染结果前插入一个**零高度块级锚点标记**：
 *    `<span class="preview-source-anchor" data-source-line="N"></span>`。
 *    样式由 MarkdownPreviewComponent 的 scoped 样式提供（display:block + 高度 0），
 *    不改变预览排版；DOMPurify 默认保留 data-* 属性与 class，消毒后锚点仍在
 *    （由 preview-source-anchor 的单元测试守护）。
 *
 * 安全边界：注入的属性值全部来自 `token.map` 的整数运算，渲染器包装只做**前缀拼接**，
 * 不插入任何用户可控字符串，不改变任何原有转义/消毒链路。
 */
import type MarkdownIt from 'markdown-it'
import type { Env, RendererRule, Token } from 'markdown-it'
import { PREVIEW_SOURCE_LINE_ATTRIBUTE } from './preview-scroll-sync'

/** markdown-it 实例类型（`MarkdownIt` 默认导出为构造函数值） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/**
 * 源行锚点开关的 env 键（**按次渲染启用**，默认关闭）。
 *
 * 为什么要 env 开关而不是无条件注入：
 * 1. `createPreviewMarkdownIt()` 是预览渲染的公共入口，单测/其它调用方会直接 `md.render()`
 *    并与既有 HTML 断言/字符串后处理（如 markdown-it-highlightjs 对 `<code class="` 的
 *    字符串包装）比较——无条件注入会改变所有既有渲染产物的字节形态；
 * 2. 锚点只服务于「分栏编辑器 → 预览滚动同步」，只有预览组件这一条真实链路需要，
 *    因此由预览组件在 render 时显式开启，其余调用方行为零变化（向后兼容）。
 */
export const PREVIEW_SOURCE_ANCHORS_ENV_KEY = '__baizePreviewSourceAnchors'

/** 本次渲染是否启用了源行锚点注入（env 缺省/未显式开启时为 false） */
export function IsPreviewSourceAnchorsEnabled(env: Env | undefined): boolean {
    return env !== undefined && env[PREVIEW_SOURCE_ANCHORS_ENV_KEY] === true
}

/**
 * 复制 env 并开启源行锚点（不修改入参，便于与既有 env 构造器组合）。
 * @param env 既有渲染 env（如 `createTabDeepLinkEnv()`），可为空
 */
export function WithPreviewSourceAnchors(env?: Env): Env {
    return { ...(env ?? {}), [PREVIEW_SOURCE_ANCHORS_ENV_KEY]: true }
}

/**
 * 零高度锚点标记的 class（样式由预览组件 scoped CSS 提供）。
 * 使用 class 而非内联 style：避免与 AS-9 远程图片策略里「内联 style 含远程 url()」的
 * 后处理路径产生任何交叉，也避免额外引入 style 白名单。
 */
export const PREVIEW_SOURCE_ANCHOR_CLASS = 'preview-source-anchor'

/**
 * 不注入属性锚点的 token 类型：
 * - inline：带 map 但不是块级渲染单元；
 * - fence：markdown-it-highlightjs 用**字符串替换**给 `<code class="` 补 `hljs` 类
 *   （见 node_modules/markdown-it-highlightjs/dist/core.js wrapCodeRenderer），
 *   若先往 fence token 塞属性会让 `<code data-source-line=... class=` 改变属性顺序、
 *   使该替换失配（代码高亮样式静默丢失）。围栏改由零高度标记承载锚点，不受属性顺序影响。
 */
const SKIP_TOKEN_TYPES = new Set(['inline', 'fence'])

/**
 * 读取 token 的源起始行号（1 起始，与 Monaco/编辑器行号一致）。
 *
 * markdown-it 的 `token.map[0]` 是 0 起始行号；无 map / 非法值返回 null。
 *
 * @param token markdown-it token
 * @returns 1 起始行号；无法确定时 null
 */
export function ReadTokenSourceLine(token: Token | null | undefined): number | null {
    if (!token) {
        return null
    }
    const map = token.map
    if (!map) {
        return null
    }
    const startLine = map[0]
    if (!Number.isFinite(startLine) || startLine < 0) {
        return null
    }
    return Math.floor(startLine) + 1
}

/**
 * 判断 token 是否需要注入源行锚点：
 * 有 map、是起始 token（nesting >= 0）、且不是 inline 等非块级渲染单元。
 */
export function IsSourceAnchorToken(token: Token | null | undefined): boolean {
    if (!token || token.nesting < 0) {
        return false
    }
    if (SKIP_TOKEN_TYPES.has(token.type)) {
        return false
    }
    return ReadTokenSourceLine(token) !== null
}

/**
 * 给一批 token 注入 `data-source-line` 属性（原地修改，属性值来自 token.map）。
 *
 * @param tokens markdown-it token 列表
 * @returns 实际注入的 token 数量（诊断/单测用）
 */
export function InjectSourceLineAttributes(tokens: readonly Token[]): number {
    let injected = 0
    for (const token of tokens) {
        if (!IsSourceAnchorToken(token)) {
            continue
        }
        const line = ReadTokenSourceLine(token)
        if (line === null) {
            continue
        }
        token.attrSet(PREVIEW_SOURCE_LINE_ATTRIBUTE, String(line))
        injected += 1
    }
    return injected
}

/**
 * 生成零高度源行锚点标记 HTML。
 * 行号来自 token.map 的整数运算（不含用户文本），不存在 HTML 注入面。
 */
export function RenderSourceLineAnchorMarker(line: number): string {
    return `<span class="${PREVIEW_SOURCE_ANCHOR_CLASS}" ${PREVIEW_SOURCE_LINE_ATTRIBUTE}="${line}"></span>`
}

/**
 * 包装指定渲染器规则：在渲染结果前插入源行锚点标记（token 无 map 时原样返回）。
 *
 * 用于默认渲染器忽略 token.attrs 的 token 类型（html_block）与自定义渲染器覆盖了
 * 默认属性输出的 token 类型（fence 增强路径）。
 */
function wrapRendererWithSourceLineMarker(
    md: MarkdownItInstance,
    ruleName: 'html_block' | 'fence'
): void {
    const originalRule = md.renderer.rules[ruleName]
    const wrappedRule: RendererRule = (tokens, index, options, env, self) => {
        const token = tokens[index]
        const rendered = originalRule
            ? originalRule(tokens, index, options, env, self)
            : self.renderToken(tokens, index, options)
        // 未开启锚点（单测/其它调用方）时输出与注入前逐字一致
        if (!IsPreviewSourceAnchorsEnabled(env)) {
            return rendered
        }
        const line = ReadTokenSourceLine(token)
        if (line === null) {
            return rendered
        }
        return RenderSourceLineAnchorMarker(line) + rendered
    }
    md.renderer.rules[ruleName] = wrappedRule
}

/**
 * 安装源行锚点插件（预览 markdown-it 实例唯一装配入口，见 preview-markdown-it.ts）。
 *
 * 必须安装在全部 block 插件之后：扩展插件可能新增自定义 token 类型；本插件在 core.block
 * 之后统一遍历最终 token 流，因此天然覆盖内置与扩展产生的 token。
 *
 * @param md markdown-it 实例
 */
export function installPreviewSourceAnchors(md: MarkdownItInstance): void {
    // core.block 之后 token 流已完整（含扩展插件的自定义块 token），此时注入最稳。
    // 仅当本轮 render 的 env 显式开启锚点时才注入（见 PREVIEW_SOURCE_ANCHORS_ENV_KEY）。
    md.core.ruler.after('block', 'preview_source_line_anchors', (state) => {
        if (!IsPreviewSourceAnchorsEnabled(state.env)) {
            return
        }
        InjectSourceLineAttributes(state.tokens)
    })
    // html_block：默认渲染器返回 token.content，token.attrs 不参与渲染
    wrapRendererWithSourceLineMarker(md, 'html_block')
    // fence：默认/增强围栏渲染器均可能自行渲染 <pre><code>，且 highlightjs 插件对输出做
    // 字符串包装；统一在整块前插入标记，保证任何围栏（含 title/linenums 增强）都有锚点
    wrapRendererWithSourceLineMarker(md, 'fence')
}
