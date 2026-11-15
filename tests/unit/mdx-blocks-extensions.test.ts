// @vitest-environment jsdom
/**
 * 批次 C（mkdocs 块语法 / 片段 / 标签页深链）单元测试。
 *
 * 覆盖：
 * 1. pymdownx.blocks `///`：note/tip/... 提示块（标题/类型/转义/Markdown 递归解析/嵌套）、
 *    `/// tabbed` + 子 `/// tab`（与 `===` 相同的 radio 结构、多组不串号）、
 *    `/// details` 折叠块、未闭合/非法块优雅回退、token.map 绝对行号回填；
 * 2. snippets：`expandSnippetIncludes` 正常展开、相对路径、行号区间/越界夹取、递归展开与
 *    深度上限、循环引用、activeFilePath 空/相对路径不展开、非文本扩展名、路径穿越、
 *    单文件/总大小限流、缩进保留、readFile 注入点与失败降级；同步占位渲染；
 * 3. tab 深链：label/panel/radio/set 稳定 id 唯一且互相可对应、多组 tab 不串号、
 *    env 开关对历史 HTML 的兼容、getTabTargetByHash 各种输入；
 * 4. DOMPurify（与 MarkdownPreviewComponent 相同 USE_PROFILES 配置）消毒后
 *    id / data-* / details / summary / input 属性保留。
 */
import { describe, it, expect, vi } from 'vitest'
import DOMPurify from 'dompurify'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import { MKDOCS_ADMONITION_OPEN } from '../../src/renderer/src/components/Markdown/preview-mkdocs-material'
import {
    createTabDeepLinkEnv,
    expandSnippetIncludes,
    getTabTargetByHash,
    isSnippetDirectiveLine,
    parseSnippetIncludeLine,
    SNIPPET_DEFAULT_MAX_DEPTH
} from '../../src/renderer/src/components/Markdown/preview-md-blocks'

/** 与 MarkdownPreviewComponent.vue 完全一致的 DOMPurify 配置（CMP-15） */
const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }
}

/** 用预览同款 markdown-it 实例（含 mkdocs-material + 批次 C 插件 + highlight.js）渲染 */
function renderMarkdown(source: string): string {
    return createPreviewMarkdownIt().render(source)
}

/** 启用 tab 深链属性的渲染（预览组件接线后传入同一 env） */
function renderMarkdownWithDeepLinks(source: string): string {
    return createPreviewMarkdownIt().render(source, createTabDeepLinkEnv())
}

/** 统计匹配次数 */
function countMatches(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
}

/** 把 HTML 解析成可查询的 DOM 容器 */
function parseHtml(html: string): HTMLElement {
    const container = document.createElement('div')
    container.innerHTML = html
    return container
}

/* ============================== 一、pymdownx.blocks：提示块 ============================== */

describe('pymdownx.blocks /// 提示块', () => {
    it('should render a note block with markdown content parsed recursively', () => {
        const html = renderMarkdown('/// note\n这是**内容**\n///')

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<p class="admonition-title">note</p>')
        expect(html).toContain('<p>这是<strong>内容</strong></p>')
        expect(html).toContain('</div>')
    })

    it('should use the text after "|" as the block title', () => {
        const html = renderMarkdown('/// tip | 自定义标题\n内容\n///')

        expect(html).toContain('<div class="admonition tip">')
        expect(html).toContain('<p class="admonition-title">自定义标题</p>')
        expect(html).toContain('<p>内容</p>')
    })

    it('should lowercase the block type', () => {
        const html = renderMarkdown('/// NOTE\n内容\n///')

        expect(html).toContain('<div class="admonition note">')
    })

    it('should render all common admonition types with the same structure', () => {
        const types = ['note', 'tip', 'warning', 'danger', 'info', 'success', 'question', 'bug']
        for (const type of types) {
            const html = renderMarkdown(`/// ${type}\nbody\n///`)
            expect(html).toContain(`<div class="admonition ${type}">`)
            expect(html).toContain(`<p class="admonition-title">${type}</p>`)
            expect(html).toContain('<p>body</p>')
        }
    })

    it('should accept hyphen/underscore in the block type', () => {
        expect(renderMarkdown('/// pied-piper | p\nx\n///')).toContain(
            'class="admonition pied-piper"'
        )
        expect(renderMarkdown('/// Some_Type | p\nx\n///')).toContain(
            'class="admonition some_type"'
        )
    })

    it('should escape HTML in the block title', () => {
        const html = renderMarkdown('/// note | <script>alert(1)</script>\nbody\n///')

        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
        expect(html).toContain('<p>body</p>')
    })

    it('should support lists and fenced code inside a block', () => {
        const html = renderMarkdown(
            [
                '/// tip | 代码',
                '- 项目一',
                '- 项目二',
                '',
                '```js',
                'const a = 1',
                '```',
                '///'
            ].join('\n')
        )

        expect(html).toContain('<li>项目一</li>')
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('```')
    })

    it('should support an empty block body', () => {
        const html = renderMarkdown('/// note\n///')

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<p class="admonition-title">note</p>')
        expect(html).toContain('</div>')
    })

    it('should support nested !!! admonition inside a /// block', () => {
        const html = renderMarkdown(['/// note', '!!! tip "内部"', '    内容', '///'].join('\n'))

        expect(countMatches(html, /class="admonition /g)).toBe(2)
        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<div class="admonition tip">')
        expect(html).toContain('<p>内容</p>')
    })

    it('should support nested /// blocks', () => {
        const html = renderMarkdown(
            ['/// note', '/// tip | 内层', '嵌套内容', '///', '///'].join('\n')
        )

        expect(countMatches(html, /class="admonition /g)).toBe(2)
        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<p class="admonition-title">内层</p>')
        expect(html).toContain('<p>嵌套内容</p>')
    })

    it('should not treat "///" inside a fenced code block as the block end', () => {
        const html = renderMarkdown(
            ['/// note', '```text', '///', '```', '围栏后内容', '///'].join('\n')
        )

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<code class="hljs language-text">')
        expect(html).toContain('<p>围栏后内容</p>')
        expect(html).toContain('</div>')
    })

    it('should work inside a mkdocs-material admonition (as indented content)', () => {
        const html = renderMarkdown(
            ['!!! note "外层"', '    /// tip | 内层', '    内容', '    ///'].join('\n')
        )

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<div class="admonition tip">')
        expect(html).toContain('<p class="admonition-title">内层</p>')
    })

    it('should work inside a list item', () => {
        const html = renderMarkdown(
            ['- 项目', '', '  /// warning | 列表内', '  内容', '  ///'].join('\n')
        )

        expect(html).toContain('<li>')
        expect(html).toContain('<div class="admonition warning">')
        expect(html).toContain('<p>内容</p>')
    })

    it('should backfill token.map with absolute document line numbers', () => {
        const md = createPreviewMarkdownIt()
        // 显式传 env：markdown-it v15 的 parse() 不像 render() 那样为 env 兜底默认值
        const tokens = md.parse(
            ['前言', '', '/// note', '块内容', '///', '', '后续'].join('\n'),
            {}
        )
        const openIndex = tokens.findIndex((token) => token.type === MKDOCS_ADMONITION_OPEN)

        expect(openIndex).toBeGreaterThanOrEqual(0)
        // 起始行是第 3 行（0-based 2），结束行是第 5 行（0-based 4）之后 → [2, 5)
        expect(tokens[openIndex].map).toEqual([2, 5])
        const paragraph = tokens
            .slice(openIndex + 1)
            .find((token) => token.type === 'paragraph_open')
        expect(paragraph?.map).toEqual([3, 4])
    })
})

/* ============================== 二、pymdownx.blocks：tabbed / tab ============================== */

describe('pymdownx.blocks /// tabbed', () => {
    it('should render a tabbed set with radios/labels/panels like ===', () => {
        const html = renderMarkdown(
            [
                '/// tabbed',
                '/// tab | 标签1',
                '内容1',
                '///',
                '/// tab | 标签2',
                '内容2',
                '///',
                '///'
            ].join('\n')
        )

        expect(html).toContain('class="tabbed-set tabbed-alternate"')
        expect(html).toContain('data-tabs="100001:2"')
        expect(countMatches(html, /type="radio"/g)).toBe(2)
        expect(countMatches(html, /class="tabbed-block"/g)).toBe(2)
        expect(html).toContain('<label for="__tabbed_100001_1">标签1</label>')
        expect(html).toContain('<label for="__tabbed_100001_2">标签2</label>')
        expect(html).toContain('<p>内容1</p>')
        expect(html).toContain('<p>内容2</p>')
        // 仅第一个 tab 默认选中
        expect(countMatches(html, /checked/g)).toBe(1)
    })

    it('should escape HTML in tab labels', () => {
        const html = renderMarkdown(
            ['/// tabbed', '/// tab | <script>x</script>', 'body', '///', '///'].join('\n')
        )

        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    })

    it('should parse markdown inside each tab', () => {
        const html = renderMarkdown(
            [
                '/// tabbed',
                '/// tab | A',
                '- 列表项',
                '',
                '```js',
                'const a = 1',
                '```',
                '///',
                '/// tab | B',
                '**加粗**',
                '///',
                '///'
            ].join('\n')
        )

        expect(html).toContain('<li>列表项</li>')
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).toContain('<strong>加粗</strong>')
        expect(html).not.toContain('```')
    })

    it('should support a /// block nested inside a tab', () => {
        const html = renderMarkdown(
            ['/// tabbed', '/// tab | A', '/// note', '提示内容', '///', '///', '///'].join('\n')
        )

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<p>提示内容</p>')
    })

    it('should support tabbed nested inside a /// admonition', () => {
        const html = renderMarkdown(
            [
                '/// note',
                '/// tabbed',
                '/// tab | A',
                'a',
                '///',
                '/// tab | B',
                'b',
                '///',
                '///',
                '///'
            ].join('\n')
        )

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('data-tabs="100001:2"')
        expect(html).toContain('<p>a</p>')
        expect(html).toContain('<p>b</p>')
    })

    it('should render a standalone /// tab as a single-tab set', () => {
        const html = renderMarkdown('/// tab | 单标签\n内容\n///')

        expect(html).toContain('data-tabs="100001:1"')
        expect(html).toContain('<label for="__tabbed_100001_1">单标签</label>')
        expect(html).toContain('<p>内容</p>')
    })

    it('should reset the tabbed set counter for every render', () => {
        const md = createPreviewMarkdownIt()
        const first = md.render('/// tabbed\n/// tab | A\na\n///\n///')
        const second = md.render('/// tabbed\n/// tab | B\nb\n///\n///')

        expect(first).toContain('data-tabs="100001:1"')
        expect(second).toContain('data-tabs="100001:1"')
    })
})

/* ============================== 三、pymdownx.blocks：details ============================== */

describe('pymdownx.blocks /// details', () => {
    it('should render a details block with summary title and markdown content', () => {
        const html = renderMarkdown('/// details | 折叠标题\n内容**加粗**\n///')

        expect(html).toContain('<details class="admonition details">')
        expect(html).toContain('<summary>折叠标题</summary>')
        expect(html).toContain('<p>内容<strong>加粗</strong></p>')
        expect(html).toContain('</details>')
    })

    it('should fall back to the type name when no title is given', () => {
        const html = renderMarkdown('/// details\n内容\n///')

        expect(html).toContain('<summary>details</summary>')
    })

    it('should escape HTML in the summary', () => {
        const html = renderMarkdown('/// details | <b>标题</b>\n内容\n///')

        expect(html).not.toContain('<b>标题</b>')
        expect(html).toContain('&lt;b&gt;标题&lt;/b&gt;')
    })

    it('should support lists and code inside details', () => {
        const html = renderMarkdown(
            [
                '/// details | 展开查看',
                '- 列表一',
                '- 列表二',
                '',
                '```js',
                'const a = 1',
                '```',
                '///'
            ].join('\n')
        )

        expect(html).toContain('<li>列表一</li>')
        expect(html).toContain('<code class="hljs language-js">')
    })
})

/* ============================== 四、非法 / 未闭合块优雅回退 ============================== */

describe('pymdownx.blocks 非法/未闭合块的优雅回退', () => {
    it('should treat an unclosed /// block as ordinary text and keep following markdown', () => {
        const html = renderMarkdown(
            ['/// note', '没有结束', '', '# 后续标题', '', '- 列表项'].join('\n')
        )

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('/// note')
        expect(html).toContain('<h1>后续标题</h1>')
        expect(html).toContain('<li>列表项</li>')
    })

    it('should treat an unclosed /// tabbed as ordinary text', () => {
        const html = renderMarkdown(['/// tabbed', '/// tab | A', 'a', ''].join('\n'))

        expect(html).not.toContain('tabbed-set')
        expect(html).toContain('/// tabbed')
    })

    it('should treat a bare "///" line as ordinary text', () => {
        const html = renderMarkdown('///\n普通文本')

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('///')
        expect(html).toContain('普通文本')
    })

    it('should require whitespace between "///" and the block type', () => {
        const html = renderMarkdown('///note\n内容\n///')

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('///note')
    })

    it('should not interrupt a paragraph without a blank line (same as !!!)', () => {
        const html = renderMarkdown('普通正文\n/// note\n内容\n///')

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('/// note')
    })

    it('should not break ordinary markdown documents', () => {
        const html = renderMarkdown(
            [
                '# 标题',
                '',
                '- 项目甲',
                '- 项目乙',
                '',
                '```js',
                'const a = 1',
                '```',
                '',
                '正文'
            ].join('\n')
        )

        expect(html).toContain('<h1>标题</h1>')
        expect(html).toContain('<li>项目甲</li>')
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('///')
    })
})

/* ============================== 五、tab 深链 id 与 hash 解析 ============================== */

describe('tab 深链 id 约定与 getTabTargetByHash', () => {
    it('should keep historical HTML unchanged when deep links are not enabled', () => {
        const html = renderMarkdown('=== "A"\n    one')

        // 默认（不传 env）不输出深链 id/data，保证既有渲染断言逐字节兼容
        expect(html).toContain('<div class="tabbed-set tabbed-alternate" data-tabs="1:1">')
        expect(html).toContain('<label for="__tabbed_1_1">A</label>')
        expect(html).not.toContain('_label"')
        expect(html).not.toContain('data-tab-target')
        expect(html).not.toContain('__tabbed_set_1')
        expect(html).not.toContain('_panel"')
    })

    it('should render set/label/panel stable ids when deep links are enabled', () => {
        const html = renderMarkdownWithDeepLinks('=== "A"\n    one\n\n=== "B"\n    two')

        expect(html).toContain(
            '<div id="__tabbed_set_1" class="tabbed-set tabbed-alternate" data-tabs="1:2">'
        )
        expect(html).toContain(
            '<label for="__tabbed_1_1" id="__tabbed_1_1_label" data-tab-target="__tabbed_1_1_panel">A</label>'
        )
        expect(html).toContain(
            '<label for="__tabbed_1_2" id="__tabbed_1_2_label" data-tab-target="__tabbed_1_2_panel">B</label>'
        )
        expect(html).toContain('<div id="__tabbed_1_1_panel" class="tabbed-block">')
        expect(html).toContain('<div id="__tabbed_1_2_panel" class="tabbed-block">')
        // radio 与 label 的 for 对应关系保持不变
        expect(html).toContain('<input type="radio" name="__tabbed_1" id="__tabbed_1_1" checked>')
    })

    it('should make all ids unique and mutually consistent across multiple tab sets', () => {
        const html = renderMarkdownWithDeepLinks(
            [
                '=== "A1"',
                '    a1',
                '',
                '# 分隔一',
                '',
                '=== "A2"',
                '    a2',
                '',
                '# 分隔二',
                '',
                '=== "B1"',
                '    b1',
                '',
                '/// tabbed',
                '/// tab | C1',
                'c1',
                '///',
                '/// tab | C2',
                'c2',
                '///',
                '///'
            ].join('\n')
        )
        const container = parseHtml(html)

        // 1) 所有 id 唯一（radio/panel/label/set 不重复）
        const ids = Array.from(container.querySelectorAll('[id]')).map((element) => element.id)
        expect(ids.length).toBeGreaterThan(0)
        expect(new Set(ids).size).toBe(ids.length)

        // 2) label ↔ radio ↔ panel 三方相互对应
        const labels = Array.from(
            container.querySelectorAll<HTMLLabelElement>('.tabbed-labels > label')
        )
        expect(labels.length).toBe(5)
        for (const label of labels) {
            const radioId = label.getAttribute('for')
            expect(radioId).not.toBeNull()
            const radio = container.querySelector<HTMLInputElement>(`#${radioId}`)
            expect(radio).not.toBeNull()
            expect(radio?.type).toBe('radio')
            expect(label.id).toBe(`${radioId}_label`)
            const panelId = label.getAttribute('data-tab-target')
            expect(panelId).toBe(`${radioId}_panel`)
            const panel = container.querySelector<HTMLElement>(`#${panelId}`)
            expect(panel).not.toBeNull()
            expect(panel?.classList.contains('tabbed-block')).toBe(true)
        }

        // 3) 四组 tab 的 radio name 互不相同（不串号）
        const names = Array.from(container.querySelectorAll('.tabbed-set > input')).map(
            (input) => input.getAttribute('name') ?? ''
        )
        expect(new Set(names).size).toBe(4)
        // 4) 每组 tabbed-set 都有稳定的容器锚点 id
        const sets = Array.from(container.querySelectorAll('.tabbed-set'))
        expect(sets).toHaveLength(4)
        for (const set of sets) {
            const dataTabs = set.getAttribute('data-tabs') ?? ''
            const setId = dataTabs.split(':')[0]
            expect(set.id).toBe(`__tabbed_set_${setId}`)
        }
    })

    it('should resolve panel/label anchors to the matching radio id', () => {
        const html = renderMarkdownWithDeepLinks(
            [
                '/// tabbed',
                '/// tab | 标签1',
                '内容1',
                '///',
                '/// tab | 标签2',
                '内容2',
                '///',
                '///'
            ].join('\n')
        )
        const container = parseHtml(html)
        const panel = container.querySelector<HTMLElement>('.tabbed-block[id]')
        expect(panel).not.toBeNull()
        const panelId = panel?.id ?? ''

        // hash 指向 panel id → 解析出 radio id，且该 radio 在文档中存在
        const target = getTabTargetByHash(`#${panelId}`)
        expect(target).toEqual({ radioId: '__tabbed_100001_1' })
        const radio = container.querySelector<HTMLInputElement>(`#${target?.radioId}`)
        expect(radio).not.toBeNull()
        expect(radio?.name).toBe('__tabbed_100001')
    })

    it('should parse tab deep-link hashes from several accepted forms', () => {
        expect(getTabTargetByHash('#__tabbed_12_2')).toEqual({ radioId: '__tabbed_12_2' })
        expect(getTabTargetByHash('__tabbed_12_2')).toEqual({ radioId: '__tabbed_12_2' })
        expect(getTabTargetByHash('#__tabbed_12_2_label')).toEqual({ radioId: '__tabbed_12_2' })
        expect(getTabTargetByHash('#__tabbed_12_2_panel')).toEqual({ radioId: '__tabbed_12_2' })
        expect(getTabTargetByHash('http://localhost:57507/#__tabbed_3_4')).toEqual({
            radioId: '__tabbed_3_4'
        })
    })

    it('should reject invalid or non-tab hashes', () => {
        expect(getTabTargetByHash('')).toBeNull()
        expect(getTabTargetByHash('#')).toBeNull()
        expect(getTabTargetByHash('#__tabbed_set_12')).toBeNull()
        expect(getTabTargetByHash('#__tabbed_12')).toBeNull()
        expect(getTabTargetByHash('#__tabbed_12_0')).toBeNull()
        expect(getTabTargetByHash('#__tabbed_a_1')).toBeNull()
        expect(getTabTargetByHash('#other-anchor')).toBeNull()
        expect(getTabTargetByHash('https://example.com/#foo')).toBeNull()
    })

    it('should provide a deep-link style sheet with :target fallback rules', () => {
        const css = readFileSync(
            join(process.cwd(), 'src', 'renderer', 'src', 'styles', 'material', 'md-blocks.css'),
            'utf-8'
        )

        expect(css).toContain(':target')
        expect(css).toContain('display: block')
        expect(css).toContain('data-tab-target')
        expect(css).toContain('__tabbed')
        expect(css).toContain('scroll-margin-top')
    })
})

/* ============================== 六、snippets：同步语法解析 ============================== */

describe('snippets 指令同步解析', () => {
    it('should recognize a double-quoted include directive with indentation', () => {
        expect(parseSnippetIncludeLine('    --8<-- "relative/path.md"')).toEqual({
            indent: '    ',
            rawText: '--8<-- "relative/path.md"',
            target: { path: 'relative/path.md', startLine: null, endLine: null }
        })
        expect(isSnippetDirectiveLine('--8<-- "a.md"')).toBe(true)
    })

    it('should parse line ranges in quoted and unquoted forms', () => {
        expect(parseSnippetIncludeLine('--8<-- "a.md:10:20"')?.target).toEqual({
            path: 'a.md',
            startLine: 10,
            endLine: 20
        })
        expect(parseSnippetIncludeLine("--8<-- 'a.md:10'")?.target).toEqual({
            path: 'a.md',
            startLine: 10,
            endLine: null
        })
        expect(parseSnippetIncludeLine('--8<-- sub/a.md')?.target).toEqual({
            path: 'sub/a.md',
            startLine: null,
            endLine: null
        })
    })

    it('should reject malformed directives', () => {
        expect(parseSnippetIncludeLine('--8<-- "unclosed.md')).toBeNull()
        expect(parseSnippetIncludeLine('--8<-- "a.md" "b.md"')).toBeNull()
        expect(parseSnippetIncludeLine('--8<--')).toBeNull()
        expect(parseSnippetIncludeLine('普通文本 --8<-- "a.md"')).toBeNull()
        expect(isSnippetDirectiveLine('--8<--   ')).toBe(false)
    })
})

/* ============================== 七、snippets：异步展开 ============================== */

describe('expandSnippetIncludes 异步展开', () => {
    /** 构造内存文件系统读取桩并记录调用参数（模拟主进程 IPC.FILE.READ_HTML 注入点） */
    function createReadFileMock(files: Record<string, string>) {
        return vi.fn(async (absPath: string): Promise<string | null> => files[absPath] ?? null)
    }

    it('should expand a basic include', async () => {
        const readFile = createReadFileMock({ 'C:/notes/a.md': '# A\n正文\n' })
        const result = await expandSnippetIncludes('--8<-- "a.md"', 'C:/notes/current.md', readFile)

        expect(result).toBe('# A\n正文')
        expect(readFile).toHaveBeenCalledWith('C:/notes/a.md')
    })

    it('should resolve paths relative to the active file directory', async () => {
        const readFile = createReadFileMock({ 'C:/notes/deep/sub/b.md': 'B 内容' })
        const result = await expandSnippetIncludes(
            '前\n--8<-- "sub/b.md"\n后',
            'C:/notes/deep/current.md',
            readFile
        )

        expect(result).toBe('前\nB 内容\n后')
        // 路径基于 active 文件目录（deep/），而不是进程工作目录
        expect(readFile).toHaveBeenCalledWith('C:/notes/deep/sub/b.md')
    })

    it('should keep other markdown lines byte-identical around the include', async () => {
        const readFile = createReadFileMock({ 'C:/notes/a.md': 'A' })
        const source = ['# 标题', '', '--8<-- "a.md"', '', '- 列表', '文字'].join('\n')
        const result = await expandSnippetIncludes(source, 'C:/notes/current.md', readFile)

        expect(result).toBe(['# 标题', '', 'A', '', '- 列表', '文字'].join('\n'))
    })

    it('should expand a line range (1-based, inclusive)', async () => {
        const content = ['L1', 'L2', 'L3', 'L4', 'L5', ''].join('\n')
        const readFile = createReadFileMock({ 'C:/notes/a.md': content })

        await expect(
            expandSnippetIncludes('--8<-- "a.md:2:3"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('L2\nL3')
        await expect(
            expandSnippetIncludes('--8<-- "a.md:4"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('L4\nL5')
    })

    it('should clamp out-of-range line numbers and handle reversed ranges', async () => {
        const readFile = createReadFileMock({ 'C:/notes/a.md': 'L1\nL2\nL3\n' })

        // 越界夹取：start/end 都夹到文件行数
        await expect(
            expandSnippetIncludes('--8<-- "a.md:999:9999"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('L3')
        // start < 1 夹到第 1 行
        await expect(
            expandSnippetIncludes('--8<-- "a.md:0:2"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('L1\nL2')
        // end < start → 空内容（指令行本身被替换为空行）
        await expect(
            expandSnippetIncludes('--8<-- "a.md:3:1"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('')
    })

    it('should not expand when activeFilePath is null / empty / relative', async () => {
        const readFile = createReadFileMock({ 'C:/notes/a.md': 'A' })
        const source = '--8<-- "a.md"'

        await expect(expandSnippetIncludes(source, null, readFile)).resolves.toBe(source)
        await expect(expandSnippetIncludes(source, '', readFile)).resolves.toBe(source)
        await expect(expandSnippetIncludes(source, 'relative/current.md', readFile)).resolves.toBe(
            source
        )
        expect(readFile).not.toHaveBeenCalled()
    })

    it('should keep the directive line when the file is missing or read fails', async () => {
        const onWarn = vi.fn()
        const missingRead = createReadFileMock({})
        await expect(
            expandSnippetIncludes('--8<-- "missing.md"', 'C:/notes/current.md', missingRead, {
                onWarn
            })
        ).resolves.toBe('--8<-- "missing.md"')
        expect(onWarn).toHaveBeenCalled()

        const throwingRead = vi.fn(async (): Promise<string | null> => {
            throw new Error('EACCES')
        })
        await expect(
            expandSnippetIncludes('--8<-- "a.md"', 'C:/notes/current.md', throwingRead, { onWarn })
        ).resolves.toBe('--8<-- "a.md"')
    })

    it('should reject non-text extensions', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({ 'C:/notes/a.exe': 'binary' })

        await expect(
            expandSnippetIncludes('--8<-- "a.exe"', 'C:/notes/current.md', readFile, { onWarn })
        ).resolves.toBe('--8<-- "a.exe"')
        expect(readFile).not.toHaveBeenCalled()
        expect(onWarn).toHaveBeenCalled()
    })

    it('should block ".." path traversal by default but allow it with allowOutsideRoot', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({ 'C:/outside.md': 'OUTSIDE' })

        await expect(
            expandSnippetIncludes('--8<-- "../outside.md"', 'C:/notes/current.md', readFile, {
                onWarn
            })
        ).resolves.toBe('--8<-- "../outside.md"')
        expect(readFile).not.toHaveBeenCalled()
        expect(onWarn).toHaveBeenCalled()

        await expect(
            expandSnippetIncludes('--8<-- "../outside.md"', 'C:/notes/current.md', readFile, {
                allowOutsideRoot: true
            })
        ).resolves.toBe('OUTSIDE')
        expect(readFile).toHaveBeenCalledWith('C:/outside.md')
    })

    it('should reject absolute snippet paths', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({})

        await expect(
            expandSnippetIncludes('--8<-- "/etc/passwd.md"', 'C:/notes/current.md', readFile, {
                onWarn
            })
        ).resolves.toBe('--8<-- "/etc/passwd.md"')
        expect(readFile).not.toHaveBeenCalled()
    })

    it('should recursively expand nested includes', async () => {
        const readFile = createReadFileMock({
            'C:/notes/a.md': 'A\n--8<-- "b.md"\n',
            'C:/notes/b.md': 'B\n--8<-- "c.md"\n',
            'C:/notes/c.md': 'C'
        })

        await expect(
            expandSnippetIncludes('--8<-- "a.md"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('A\nB\nC')
    })

    it('should resolve nested include paths against the active file directory', async () => {
        const readFile = createReadFileMock({
            'C:/notes/sub/b.md': '--8<-- "c.md"\n',
            'C:/notes/c.md': 'C'
        })

        await expect(
            expandSnippetIncludes('--8<-- "sub/b.md"', 'C:/notes/current.md', readFile)
        ).resolves.toBe('C')
        expect(readFile).toHaveBeenCalledWith('C:/notes/c.md')
    })

    it('should stop recursion at the depth limit and keep the unexpanded line', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({
            'C:/notes/a.md': 'A\n--8<-- "b.md"\n',
            'C:/notes/b.md': 'B\n--8<-- "c.md"\n',
            'C:/notes/c.md': 'C'
        })

        await expect(
            expandSnippetIncludes('--8<-- "a.md"', 'C:/notes/current.md', readFile, {
                maxDepth: 1,
                onWarn
            })
        ).resolves.toBe('A\n--8<-- "b.md"')
        expect(onWarn).toHaveBeenCalled()
    })

    it('should detect circular includes', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({
            'C:/notes/loop.md': 'LOOP\n--8<-- "loop.md"\n'
        })

        const result = await expandSnippetIncludes(
            '--8<-- "loop.md"',
            'C:/notes/current.md',
            readFile,
            { onWarn }
        )

        expect(result).toBe('LOOP\n--8<-- "loop.md"')
        expect(onWarn).toHaveBeenCalled()
        // 默认深度上限是 5（循环检测会在更深递归前先命中）
        expect(SNIPPET_DEFAULT_MAX_DEPTH).toBe(5)
    })

    it('should enforce the single-file size limit', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({ 'C:/notes/big.md': '0123456789' })

        await expect(
            expandSnippetIncludes('--8<-- "big.md"', 'C:/notes/current.md', readFile, {
                maxFileBytes: 5,
                onWarn
            })
        ).resolves.toBe('--8<-- "big.md"')
        expect(onWarn).toHaveBeenCalled()
    })

    it('should enforce the total expanded size limit', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({
            'C:/notes/a.md': 'AAAA',
            'C:/notes/b.md': 'BBBB'
        })
        const source = '--8<-- "a.md"\n--8<-- "b.md"'

        await expect(
            expandSnippetIncludes(source, 'C:/notes/current.md', readFile, {
                maxTotalBytes: 6,
                onWarn
            })
        ).resolves.toBe('AAAA\n--8<-- "b.md"')
        expect(onWarn).toHaveBeenCalled()
    })

    it('should keep the indentation of the directive line for every included line', async () => {
        const readFile = createReadFileMock({ 'C:/notes/a.md': '第一行\n\n第三行\n' })
        const source = ['!!! note "外层"', '    --8<-- "a.md"'].join('\n')

        await expect(expandSnippetIncludes(source, 'C:/notes/current.md', readFile)).resolves.toBe(
            '!!! note "外层"\n    第一行\n\n    第三行'
        )
    })

    it('should keep malformed directives as-is with a warning', async () => {
        const onWarn = vi.fn()
        const readFile = createReadFileMock({})

        await expect(
            expandSnippetIncludes('--8<-- "unclosed.md', 'C:/notes/current.md', readFile, {
                onWarn
            })
        ).resolves.toBe('--8<-- "unclosed.md')
        expect(onWarn).toHaveBeenCalled()
        expect(readFile).not.toHaveBeenCalled()
    })

    it('should warn via console.warn by default', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const readFile = createReadFileMock({})

        await expandSnippetIncludes('--8<-- "missing.md"', 'C:/notes/current.md', readFile)

        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('should return markdown unchanged when there is no directive', async () => {
        const readFile = createReadFileMock({})
        const source = '# 标题\n\n普通段落\n'

        await expect(expandSnippetIncludes(source, 'C:/notes/current.md', readFile)).resolves.toBe(
            source
        )
        expect(readFile).not.toHaveBeenCalled()
    })
})

/* ============================== 八、snippets：同步占位渲染 ============================== */

describe('snippets 未展开指令的同步占位渲染', () => {
    it('should render an unexpanded directive as escaped plain text without throwing', () => {
        const html = renderMarkdown('--8<-- "relative/path.md"')

        expect(html).toContain('class="mdx-snippet-placeholder"')
        expect(html).toContain('data-snippet-target="relative/path.md"')
        // `<` 被转义、文本仍按普通文本显示
        expect(html).toContain('--8&lt;-- &quot;relative/path.md&quot;')
        expect(html).not.toContain('<script')
    })

    it('should render unexpanded directives inside admonition/tab content', () => {
        expect(renderMarkdown('!!! note "n"\n    --8<-- "a.md"')).toContain(
            'class="mdx-snippet-placeholder"'
        )
        expect(renderMarkdown('/// note\n--8<-- "a.md"\n///')).toContain(
            'class="mdx-snippet-placeholder"'
        )
    })

    it('should keep an inline occurrence as ordinary paragraph text', () => {
        const html = renderMarkdown('正文 --8<-- "a.md" 结尾')

        expect(html).toContain('--8&lt;--')
        expect(html).toContain('正文')
    })
})

/* ============================== 九、DOMPurify 消毒后属性保留 ============================== */

describe('批次 C 结构经 DOMPurify 消毒后仍保留（CMP-15 配置）', () => {
    it('should keep /// admonition classes and title after sanitizing', () => {
        const html = renderMarkdown('/// warning | 注意\n**内容**\n///')
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).toContain('<div class="admonition warning">')
        expect(sanitized).toContain('<p class="admonition-title">注意</p>')
        expect(sanitized).toContain('<strong>内容</strong>')
    })

    it('should keep details/summary and content after sanitizing', () => {
        const html = renderMarkdown('/// details | 折叠\n内容\n///')
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).toContain('<details class="admonition details">')
        expect(sanitized).toContain('<summary>折叠</summary>')
        expect(sanitized).toContain('<p>内容</p>')
        expect(sanitized).toContain('</details>')
    })

    it('should keep tab deep-link ids / data-* / input attributes after sanitizing', () => {
        const html = renderMarkdownWithDeepLinks(
            [
                '/// tabbed',
                '/// tab | 标签1',
                '内容1',
                '///',
                '/// tab | 标签2',
                '内容2',
                '///',
                '///'
            ].join('\n')
        )
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).toContain('id="__tabbed_set_100001"')
        expect(sanitized).toContain('<label')
        expect(sanitized).toContain('id="__tabbed_100001_1_label"')
        expect(sanitized).toContain('data-tab-target="__tabbed_100001_1_panel"')
        expect(sanitized).toContain('id="__tabbed_100001_1_panel"')
        expect(sanitized).toContain('name="__tabbed_100001"')
        expect(sanitized).toContain('type="radio"')
        expect(sanitized).toContain('checked')

        // 消毒后 label↔panel 的 id 依然互相可对应
        const container = parseHtml(sanitized)
        const labels = Array.from(container.querySelectorAll('.tabbed-labels > label'))
        expect(labels).toHaveLength(2)
        for (const label of labels) {
            const target = label.getAttribute('data-tab-target') ?? ''
            expect(container.querySelector(`#${target}`)).not.toBeNull()
        }
    })

    it('should strip dangerous title HTML while keeping escaped text', () => {
        const html = renderMarkdown('/// note | <img src=x onerror=alert(1)>\nbody\n///')
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).not.toContain('<img')
        expect(sanitized).toContain('&lt;img src=x onerror=alert(1)&gt;')
        expect(sanitized).toContain('<div class="admonition note">')
    })

    it('should keep the snippet placeholder class/data after sanitizing', () => {
        const sanitized = DOMPurify.sanitize(renderMarkdown('--8<-- "a.md"'), DOMPURIFY_CONFIG)

        expect(sanitized).toContain('class="mdx-snippet-placeholder"')
        expect(sanitized).toContain('data-snippet-target="a.md"')
    })
})
