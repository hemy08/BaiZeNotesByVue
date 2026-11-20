// @vitest-environment jsdom
/**
 * preview-source-anchor.ts 单元测试（1.5.0：预览源行锚点注入）。
 *
 * 覆盖：
 * 1. markdown-it 渲染产物中标题/段落/列表/引用/代码块/表格/原始 HTML 块都带
 *    `data-source-line` 锚点（html_block 与围栏用零高度标记 span 承载）；
 * 2. 增强围栏（title/linenums）等自定义渲染路径同样有锚点；
 * 3. DOMPurify 消毒后 data-* 属性与锚点 class 不被清掉（滚动同步的数据基础）；
 * 4. token 级工具函数：源行读取、跳过规则、注入条数、标记 HTML。
 */
import { describe, it, expect } from 'vitest'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import {
    InjectSourceLineAttributes,
    IsPreviewSourceAnchorsEnabled,
    IsSourceAnchorToken,
    PREVIEW_SOURCE_ANCHOR_CLASS,
    PREVIEW_SOURCE_ANCHORS_ENV_KEY,
    ReadTokenSourceLine,
    RenderSourceLineAnchorMarker,
    WithPreviewSourceAnchors
} from '../../src/renderer/src/components/Markdown/preview-source-anchor'
import { PREVIEW_SOURCE_LINE_ATTRIBUTE } from '../../src/renderer/src/components/Markdown/preview-scroll-sync'
import { SanitizePreviewHtml } from '../../src/renderer/src/components/Markdown/preview-sanitize'
import type { Token } from 'markdown-it'

/** 把渲染 HTML 解析为可查询 DOM */
function parseHtml(html: string): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = html
    return root
}

/**
 * 构造最小 token 桩（只含本模块读取的字段 + attrSet/attrGet 实现）。
 * markdown-it v15 的 Token 仅以类型导出，测试内用等价结构模拟。
 */
class FakeToken {
    type = 'paragraph_open'
    tag = 'p'
    attrs: Array<[string, string]> | null = null
    map: [number, number] | null = null
    nesting = 1
    level = 0
    children: Token[] | null = null
    content = ''
    markup = ''
    info = ''
    meta: unknown = null
    block = true
    hidden = false

    constructor(patch: Partial<Token> = {}) {
        Object.assign(this, patch)
    }

    attrSet(name: string, value: string): void {
        const attrs = this.attrs ?? []
        const existing = attrs.find(([key]) => key === name)
        if (existing) {
            existing[1] = value
        } else {
            attrs.push([name, value])
        }
        this.attrs = attrs
    }

    attrGet(name: string): string | null {
        return this.attrs?.find(([key]) => key === name)?.[1] ?? null
    }
}

/** 构造最小 token 桩（供纯函数分支用例使用） */
function makeToken(patch: Partial<Token>): Token {
    return new FakeToken(patch) as unknown as Token
}

const md = createPreviewMarkdownIt()

describe('preview-source-anchor：markdown-it 源行锚点注入', () => {
    const source = [
        '# 一级标题',
        '',
        '段落内容',
        '',
        '- 列表项一',
        '- 列表项二',
        '',
        '> 引用段落',
        '',
        '```js',
        'const a = 1',
        '```',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '<div class="raw-html">原始 HTML 块</div>',
        ''
    ].join('\n')

    it('标题/段落/列表/引用/表格带 data-source-line（1 起始，与编辑器行号一致）', () => {
        const root = parseHtml(md.render(source, WithPreviewSourceAnchors()))
        expect(root.querySelector(`h1[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="1"]`)?.textContent).toBe(
            '一级标题'
        )
        expect(root.querySelector(`p[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="3"]`)?.textContent).toBe(
            '段落内容'
        )
        expect(root.querySelectorAll(`ul li[${PREVIEW_SOURCE_LINE_ATTRIBUTE}]`).length).toBe(2)
        expect(root.querySelector(`li[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="5"]`)).not.toBeNull()
        expect(root.querySelector(`li[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="6"]`)).not.toBeNull()
        expect(
            root.querySelector(`blockquote[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="8"]`)
        ).not.toBeNull()
        expect(root.querySelector(`table[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="14"]`)).not.toBeNull()
    })

    it('围栏代码块：用零高度锚点标记承载（不注入 token 属性，避免破坏高亮类包装）', () => {
        const root = parseHtml(md.render(source, WithPreviewSourceAnchors()))
        const fenceLine = 10
        const marker = root.querySelector(
            `span.${PREVIEW_SOURCE_ANCHOR_CLASS}[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="${fenceLine}"]`
        )
        expect(marker, '围栏代码块前应有锚点标记').not.toBeNull()
        // 属性锚点刻意不写入 fence token：属性顺序变化会让 highlightjs 的
        // `<code class="` 字符串替换失配，导致 hljs 类丢失（样式静默回退）
        expect(
            root.querySelector('pre > code')?.getAttribute(PREVIEW_SOURCE_LINE_ATTRIBUTE)
        ).toBeNull()
        // 高亮类仍在（与既有渲染结果一致）
        expect(root.innerHTML).toContain('class="hljs language-js"')
    })

    it('未开启锚点 env（其它 md.render 调用方）时输出与注入前逐字一致', () => {
        const plainHtml = md.render(source)
        expect(plainHtml).not.toContain(PREVIEW_SOURCE_LINE_ATTRIBUTE)
        expect(plainHtml).not.toContain(PREVIEW_SOURCE_ANCHOR_CLASS)
        // env 开关不修改入参（可与既有 env 构造器安全组合）
        const baseEnv = { custom: 1 }
        const withAnchors = WithPreviewSourceAnchors(baseEnv)
        expect(withAnchors[PREVIEW_SOURCE_ANCHORS_ENV_KEY]).toBe(true)
        expect(withAnchors.custom).toBe(1)
        expect(baseEnv).toEqual({ custom: 1 })
        expect(IsPreviewSourceAnchorsEnabled(undefined)).toBe(false)
        expect(IsPreviewSourceAnchorsEnabled({})).toBe(false)
        expect(IsPreviewSourceAnchorsEnabled(withAnchors)).toBe(true)
    })

    it('原始 HTML 块：默认渲染器忽略 token.attrs，改用零高度锚点标记承载', () => {
        const root = parseHtml(md.render(source, WithPreviewSourceAnchors()))
        const rawLine = 18
        const rawBlock = root.querySelector('div.raw-html')
        expect(rawBlock?.textContent).toBe('原始 HTML 块')
        const marker = root.querySelector(
            `span.${PREVIEW_SOURCE_ANCHOR_CLASS}[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="${rawLine}"]`
        )
        expect(marker, 'html_block 前应有锚点标记').not.toBeNull()
        // 标记必须是原始 HTML 块的前一个兄弟节点（位置即块顶部）
        expect(marker?.nextElementSibling).toBe(rawBlock)
    })

    it('缩进代码块 / 增强围栏（title+linenums）同样带锚点', () => {
        const indented = parseHtml(md.render('    const b = 2\n', WithPreviewSourceAnchors()))
        // markdown-it 15：code_block 的属性渲染在 <pre> 上（fence 由锚点标记承载，
        // 且刻意不给 fence token 注入属性——避免破坏 highlightjs 插件对输出的字符串包装）
        expect(indented.querySelector(`pre[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="1"]`)).not.toBeNull()

        const enhanced = parseHtml(
            md.render(
                '```js title="demo.js" linenums="1"\nconst c = 3\n```\n',
                WithPreviewSourceAnchors()
            )
        )
        expect(enhanced.querySelector('div.highlight')).not.toBeNull()
        expect(
            enhanced.querySelector(
                `span.${PREVIEW_SOURCE_ANCHOR_CLASS}[${PREVIEW_SOURCE_LINE_ATTRIBUTE}="1"]`
            )
        ).not.toBeNull()
        // 高亮类必须保留（锚点注入不得干扰 highlightjs 的 <code class="hljs …"> 包装）
        expect(enhanced.innerHTML).toContain('class="hljs language-js"')
    })

    it('DOMPurify 消毒后仍保留 data-source-line 与锚点 class（安全边界不变）', () => {
        const sanitized = SanitizePreviewHtml(md.render(source, WithPreviewSourceAnchors()))
        expect(sanitized).toContain('data-source-line="1"')
        expect(sanitized).toContain('data-source-line="10"')
        expect(sanitized).toContain(PREVIEW_SOURCE_ANCHOR_CLASS)
        // 原有 XSS 消毒链路行为不变：脚本/事件处理器仍被剥离
        const injected = parseHtml(sanitized)
        expect(injected.querySelector('script')).toBeNull()
    })
})

describe('preview-source-anchor：token 工具函数', () => {
    it('ReadTokenSourceLine：map[0] 0 起始 -> 1 起始；无 map/负值返回 null', () => {
        expect(ReadTokenSourceLine(makeToken({ map: [0, 1] }))).toBe(1)
        expect(ReadTokenSourceLine(makeToken({ map: [11, 12] }))).toBe(12)
        expect(ReadTokenSourceLine(makeToken({ map: null }))).toBeNull()
        expect(ReadTokenSourceLine(makeToken({ map: [-1, 2] }))).toBeNull()
        expect(ReadTokenSourceLine(makeToken({ map: [Number.NaN, 2] }))).toBeNull()
        expect(ReadTokenSourceLine(null)).toBeNull()
        expect(ReadTokenSourceLine(undefined)).toBeNull()
    })

    it('IsSourceAnchorToken：只接受有 map 的起始块级 token', () => {
        expect(IsSourceAnchorToken(makeToken({ map: [0, 1] }))).toBe(true)
        expect(IsSourceAnchorToken(makeToken({ type: 'heading_open', map: [0, 1] }))).toBe(true)
        // 闭合 token / inline / 无 map 都跳过
        expect(IsSourceAnchorToken(makeToken({ nesting: -1, map: [0, 1] }))).toBe(false)
        expect(IsSourceAnchorToken(makeToken({ type: 'inline', nesting: 0, map: [0, 1] }))).toBe(
            false
        )
        expect(IsSourceAnchorToken(makeToken({ map: null }))).toBe(false)
        // fence 由零高度标记承载，不注入属性（见 SKIP_TOKEN_TYPES 注释）
        expect(IsSourceAnchorToken(makeToken({ type: 'fence', nesting: 0, map: [0, 3] }))).toBe(
            false
        )
        expect(IsSourceAnchorToken(null)).toBe(false)
    })

    it('InjectSourceLineAttributes：注入条数正确、覆盖用户同名属性、无 map token 不变', () => {
        const heading = makeToken({ type: 'heading_open', map: [2, 3] })
        const paragraph = makeToken({ map: [5, 6] })
        const closing = makeToken({ type: 'heading_close', nesting: -1, map: [2, 3] })
        const noMap = makeToken({ map: null })
        // 用户经 attr_list 手写的同名属性必须被真实源行覆盖
        paragraph.attrSet(PREVIEW_SOURCE_LINE_ATTRIBUTE, '999')

        const count = InjectSourceLineAttributes([heading, paragraph, closing, noMap])
        expect(count).toBe(2)
        expect(heading.attrGet(PREVIEW_SOURCE_LINE_ATTRIBUTE)).toBe('3')
        expect(paragraph.attrGet(PREVIEW_SOURCE_LINE_ATTRIBUTE)).toBe('6')
        expect(closing.attrGet(PREVIEW_SOURCE_LINE_ATTRIBUTE)).toBeNull()
        expect(noMap.attrGet(PREVIEW_SOURCE_LINE_ATTRIBUTE)).toBeNull()
    })

    it('RenderSourceLineAnchorMarker：输出确定的零高度标记结构', () => {
        expect(RenderSourceLineAnchorMarker(7)).toBe(
            `<span class="${PREVIEW_SOURCE_ANCHOR_CLASS}" ${PREVIEW_SOURCE_LINE_ATTRIBUTE}="7"></span>`
        )
    })
})
