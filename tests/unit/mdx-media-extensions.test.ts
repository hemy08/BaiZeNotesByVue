// @vitest-environment jsdom
/**
 * 批次 B：媒体 / 代码块扩展（preview-md-media.ts）单元测试。
 *
 * 覆盖三块能力：
 * 1. Grid cards（md-in-html）：容器识别、内部 Markdown 递归解析、普通 HTML 直通、未闭合回退、
 *    嵌套容器、与 admonition / 本地预渲染管线串联；
 * 2. 代码块增强：围栏 title / linenums / hl_lines（含区间）、行内 `#!lang` 高亮、
 *    未知语言转义、跨行 highlight.js span 的结构平衡、普通围栏零行为变化；
 * 3. Material 图标：已知 / 未知图标、emoji 不受影响、图标数据规模与体积、
 *    以及 DOMPurify（预览组件同款 USE_PROFILES 配置）消毒后的结构保留结论。
 *
 * 说明：DOMPurify 需要 DOM，因此整个文件使用 jsdom 环境（与 mkdocs-material-render.test.ts 一致）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import DOMPurify from 'dompurify'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import { HemyRenderPreLocal } from '../../src/renderer/src/components/Markdown/preview-local-render'
import {
    MDI_ICON_COUNT,
    MDI_ICON_PATHS,
    OCTICON_ICON_PATHS
} from '../../src/renderer/src/components/Markdown/mdi-icons-data'
import {
    MDI_ICON_CORE_COUNT,
    MDI_ICON_PATHS_CORE
} from '../../src/renderer/src/components/Markdown/mdi-icons-core'
import {
    getMdiIconNames,
    getMdiIconPath,
    isMdiIconDataLoaded,
    loadMdiIconData
} from '../../src/renderer/src/components/Markdown/mdi-icons-loader'

/** 与 MarkdownPreviewComponent.vue 完全一致的 DOMPurify 配置（CMP-15） */
const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }
}

/** 工作区根目录（vitest 从仓库根启动） */
const WORKSPACE_ROOT = process.cwd()

/** 用预览同款 markdown-it 实例（含全部批次 A/B/C 插件 + highlight.js）渲染 */
function renderMarkdown(source: string): string {
    return createPreviewMarkdownIt().render(source)
}

/** 统计匹配次数（断言结构数量用） */
function countMatches(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
}

/** 统计标签开闭数量（校验逐行包裹后 HTML 结构仍平衡） */
function countTags(html: string, tag: string): { open: number; close: number } {
    return {
        open: countMatches(html, new RegExp(`<${tag}\\b`, 'g')),
        close: countMatches(html, new RegExp(`</${tag}>`, 'g'))
    }
}

/** 构造「网格卡片 + 图标 + 分隔线 + 列表 + 行内 Markdown」的典型样例 */
function buildGridCardsDocument(): string {
    return [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-account: **标题一**',
        '',
        '    ---',
        '',
        '    卡片一描述，含 `行内代码` 与 [链接](https://example.com)。',
        '',
        '-   :material-cog: **标题二**',
        '',
        '    ---',
        '',
        '    卡片二描述',
        '',
        '</div>'
    ].join('\n')
}

/* ============================== 一、Grid cards ============================== */

describe('grid cards（md-in-html 容器）', () => {
    it('should parse the markdown inside a div.grid.cards[markdown] container', () => {
        const html = renderMarkdown(buildGridCardsDocument())

        // 容器输出与原 class 一致
        expect(html).toContain('<div class="grid cards">')
        // 列表 / 加粗 / 分隔线 / 行内代码 / 链接全部被递归解析
        expect(countMatches(html, /<li>/g)).toBe(2)
        expect(html).toContain('<strong>标题一</strong>')
        expect(html).toContain('<strong>标题二</strong>')
        expect(countMatches(html, /<hr\b/g)).toBe(2)
        expect(html).toContain('<code class="hljs">行内代码</code>')
        expect(html).toContain('<a href="https://example.com">链接</a>')
        expect(html).toContain('卡片一描述')
        expect(html).toContain('卡片二描述')
        // 容器内的图标与卡片组合生效
        expect(countMatches(html, /class="mkdocs-icon"/g)).toBe(2)
        // markdown 属性本身不应出现在输出里
        expect(html).not.toContain('markdown>')
    })

    it('should support <div class="grid" markdown> without the cards class', () => {
        const html = renderMarkdown(
            ['<div class="grid" markdown>', '-   单卡片', '</div>'].join('\n')
        )

        expect(html).toContain('<div class="grid">')
        expect(html).toContain('<li>单卡片</li>')
    })

    it('should accept attributes in any order, single quotes and markdown="1"', () => {
        const ordered = renderMarkdown(
            ['<div markdown class="grid cards">', '-   甲', '</div>'].join('\n')
        )
        expect(ordered).toContain('<div class="grid cards">')
        expect(ordered).toContain('<li>甲</li>')

        const singleQuoted = renderMarkdown(
            ["<div class='grid cards' markdown='1'>", '-   乙', '</div>'].join('\n')
        )
        expect(singleQuoted).toContain('<div class="grid cards">')
        expect(singleQuoted).toContain('<li>乙</li>')
    })

    it('should keep extra safe classes of the container', () => {
        const html = renderMarkdown(
            ['<div class="grid cards compact" markdown>', '-   丙', '</div>'].join('\n')
        )

        expect(html).toContain('<div class="grid cards compact">')
    })

    it('should pass through a plain div without the markdown attribute', () => {
        const html = renderMarkdown(
            ['<div class="grid cards">', '-   不解析', '', '普通段落'].join('\n')
        )

        // 未带 markdown 属性：容器内容保持原始 HTML 直通，不生成列表
        expect(html).not.toContain('<li>')
        expect(html).toContain('-   不解析')
        expect(html).toContain('<p>普通段落</p>')
    })

    it('should gracefully fall back for an unclosed container without swallowing later markdown', () => {
        const html = renderMarkdown(
            [
                '<div class="grid cards" markdown>',
                '-   未闭合内容',
                '',
                '# 后续标题',
                '',
                '- 列表项'
            ].join('\n')
        )

        // 不抛异常、开标签原样保留，后续 Markdown 全部正常解析
        expect(html).toContain('<div class="grid cards" markdown>')
        expect(html).toContain('<li>未闭合内容</li>')
        expect(html).toContain('<h1>后续标题</h1>')
        expect(html).toContain('<li>列表项</li>')
    })

    it('should not treat a self-closing div as a markdown container', () => {
        const html = renderMarkdown(
            ['<div class="grid cards" markdown />', '', '-   普通列表'].join('\n')
        )

        // 自闭合 div 非法：交给默认 html_block 直通（开标签原样保留），后续列表按普通 Markdown 解析
        expect(html).toContain('markdown />')
        expect(html).not.toContain('</div>')
        expect(html).toContain('<li>普通列表</li>')
    })

    it('should render an empty container', () => {
        const html = renderMarkdown(['<div class="grid cards" markdown>', '</div>'].join('\n'))

        expect(html).toContain('<div class="grid cards"></div>')
    })

    it('should support a nested grid container', () => {
        const html = renderMarkdown(
            [
                '<div class="grid cards" markdown>',
                '-   外层卡片',
                '',
                '<div class="grid" markdown>',
                '',
                '-   内层卡片',
                '',
                '</div>',
                '',
                '</div>'
            ].join('\n')
        )

        expect(countMatches(html, /<div class="grid/g)).toBe(2)
        expect(html).toContain('<li>外层卡片</li>')
        expect(html).toContain('<li>内层卡片</li>')
    })

    it('should not count </div> inside a fenced code block as the container close tag', () => {
        const html = renderMarkdown(
            [
                '<div class="grid cards" markdown>',
                '',
                '-   卡片',
                '',
                '    ```html',
                '    </div>',
                '    ```',
                '',
                '</div>'
            ].join('\n')
        )

        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('<code class="hljs language-html">')
        // 代码块里的 `</div>` 被高亮转义，不会让容器提前闭合（输出里只有 1 个真实 </div>）
        expect(html).toContain('&lt;/')
        expect(countMatches(html, /<\/div>/g)).toBe(1)
    })

    it('should not count <div> written inside inline code as a real tag', () => {
        const html = renderMarkdown(
            [
                '<div class="grid cards" markdown>',
                '-   卡片描述里提到 `<div>` 与 `</div>` 标签',
                '',
                '</div>'
            ].join('\n')
        )

        // 行内代码中的标签不应影响闭合扫描：容器正常闭合且内容完整
        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('&lt;div&gt;')
        expect(html).toContain('&lt;/div&gt;')
        expect(countMatches(html, /<\/div>/g)).toBe(1)
    })

    it('should treat a div with markdown but without grid class as plain HTML', () => {
        const html = renderMarkdown(
            ['<div class="other" markdown>', '-   不解析', '', '</div>'].join('\n')
        )

        expect(html).not.toContain('<li>')
        expect(html).toContain('-   不解析')
        expect(html).toContain('<div class="other" markdown>')
    })

    it('should support a grid container inside an admonition (4-space indented)', () => {
        const html = renderMarkdown(
            [
                '!!! note "卡片区"',
                '    <div class="grid cards" markdown>',
                '    -   卡片内容',
                '    </div>'
            ].join('\n')
        )

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('<li>卡片内容</li>')
    })

    it('should still render after the local pre-render pipeline', () => {
        const html = renderMarkdown(HemyRenderPreLocal(buildGridCardsDocument()))

        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('<strong>标题一</strong>')
        expect(countMatches(html, /class="mkdocs-icon"/g)).toBe(2)
    })
})

/* ============================== 二、围栏代码块增强 ============================== */

describe('围栏代码块增强（linenums / hl_lines / title）', () => {
    const PYTHON_SOURCE = [
        '```python linenums="1" hl_lines="2 3" title="main.py"',
        'def main():',
        '    print("a")',
        '    print("b")',
        '```'
    ].join('\n')

    it('should render a highlight wrapper with filename and highlighted lines', () => {
        const html = renderMarkdown(PYTHON_SOURCE)

        expect(html).toContain('<div class="highlight">')
        expect(html).toContain('<span class="filename">main.py</span>')
        expect(html).toContain('<code class="hljs language-python">')
        // 行号从 1 开始
        expect(html).toContain('<span class="lineno" aria-hidden="true">1</span>')
        expect(html).toContain('<span class="lineno" aria-hidden="true">2</span>')
        expect(html).toContain('<span class="lineno" aria-hidden="true">3</span>')
        // hl_lines="2 3"：恰好两行高亮；第 1 行不高亮
        expect(countMatches(html, /class="line hll"/g)).toBe(2)
        expect(html).not.toContain('class="line hll"><span class="lineno" aria-hidden="true">1<')
        // info 属性不得泄漏为可见文本
        expect(html).not.toContain('linenums')
        expect(html).not.toContain('hl_lines')
    })

    it('should start line numbers from the linenums value', () => {
        const html = renderMarkdown(
            ['```js linenums="5"', 'const a = 1', 'const b = 2', '```'].join('\n')
        )

        expect(html).toContain('<span class="lineno" aria-hidden="true">5</span>')
        expect(html).toContain('<span class="lineno" aria-hidden="true">6</span>')
        expect(html).not.toContain('<span class="lineno" aria-hidden="true">1</span>')
    })

    it('should treat a bare linenums attribute as starting from 1', () => {
        const html = renderMarkdown(['```js linenums', 'const a = 1', '```'].join('\n'))

        expect(html).toContain('<span class="lineno" aria-hidden="true">1</span>')
    })

    it('should expand hl_lines ranges', () => {
        const source = [
            '```js linenums="1" hl_lines="5-7"',
            'const a1 = 1',
            'const a2 = 2',
            'const a3 = 3',
            'const a4 = 4',
            'const a5 = 5',
            'const a6 = 6',
            'const a7 = 7',
            'const a8 = 8',
            '```'
        ].join('\n')
        const html = renderMarkdown(source)

        expect(countMatches(html, /class="line hll"/g)).toBe(3)
        expect(html).toContain('a5 = ')
        expect(html).toContain('a7 = ')
        expect(html).not.toContain('class="line hll"><span class="lineno" aria-hidden="true">4<')
    })

    it('should support title only (no line wrapping)', () => {
        const html = renderMarkdown(['```js title="src/index.js"', 'const a = 1', '```'].join('\n'))

        expect(html).toContain('<div class="highlight">')
        expect(html).toContain('<span class="filename">src/index.js</span>')
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('class="line')
        expect(html).not.toContain('class="lineno"')
    })

    it('should keep spaces inside the filename title', () => {
        const html = renderMarkdown(
            ['```js title="My Program.js"', 'const a = 1', '```'].join('\n')
        )

        expect(html).toContain('<span class="filename">My Program.js</span>')
    })

    it('should accept single-quoted attributes and attribute order variations', () => {
        const html = renderMarkdown(
            [
                "```python title='app.py' linenums='3' hl_lines='1'",
                'print("x")',
                'print("y")',
                '```'
            ].join('\n')
        )

        expect(html).toContain('<span class="filename">app.py</span>')
        expect(html).toContain('<span class="lineno" aria-hidden="true">3</span>')
        expect(countMatches(html, /class="line hll"/g)).toBe(1)
    })

    it('should keep unknown languages escaped while still applying attrs', () => {
        const html = renderMarkdown(
            [
                '```not-a-real-language linenums="1" title="x.txt"',
                '<div class="x"> & stuff',
                '```'
            ].join('\n')
        )

        expect(html).toContain('<span class="filename">x.txt</span>')
        expect(html).toContain('&lt;div class=&quot;x&quot;&gt; &amp; stuff')
        expect(html).toContain('hljs language-not-a-real-language')
        expect(html).not.toContain('<div class="x">')
    })

    it('should escape HTML in the filename (no injection)', () => {
        const html = renderMarkdown(
            ['```js title="<script>alert(1)</script>"', 'const a = 1', '```'].join('\n')
        )

        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('should keep per-line tags balanced when highlight.js spans cross lines', () => {
        const html = renderMarkdown(
            ['```python linenums="1" hl_lines="1"', 'value = """aaa', 'bbb"""', '```'].join('\n')
        )

        const spanTags = countTags(html, 'span')
        expect(spanTags.open).toBe(spanTags.close)
        // 跨行的字符串 span 在每一行都被补齐 / 重新打开，两行都带 hljs-string
        expect(countMatches(html, /hljs-string/g)).toBeGreaterThanOrEqual(2)
        expect(html).toContain('bbb')
        expect(countMatches(html, /class="line hll"/g)).toBe(1)
    })

    it('should ignore invalid hl_lines fragments without throwing', () => {
        const html = renderMarkdown(
            ['```js hl_lines="abc 0 -3 2-1"', 'const a = 1', 'const b = 2', '```'].join('\n')
        )

        // `2-1` 归一化为 1..2，`abc` / `0` / `-3` 忽略
        expect(countMatches(html, /class="line hll"/g)).toBe(2)
    })

    it('should support attributes without a language (plain escaped code)', () => {
        const html = renderMarkdown(
            ['``` linenums="1" title="notes.txt"', 'plain & text', '```'].join('\n')
        )

        expect(html).toContain('<span class="filename">notes.txt</span>')
        expect(html).toContain('plain &amp; text')
        expect(html).toContain('<span class="lineno" aria-hidden="true">1</span>')
    })

    it('should leave plain fenced code rendering unchanged (no wrapper, PF-1 order intact)', () => {
        const html = renderMarkdown(['```js', 'const a = 1', '```'].join('\n'))

        expect(html).toContain('<pre><code class="hljs language-js">')
        expect(html).not.toContain('<div class="highlight">')
        expect(html).not.toContain('class="line')
        expect(html).not.toContain('class="filename"')
    })

    it('should not affect a fence with an unrelated info attribute', () => {
        const html = renderMarkdown(['```js foo="bar"', 'const a = 1', '```'].join('\n'))

        expect(html).toContain('<pre><code class="hljs language-js">')
        expect(html).not.toContain('<div class="highlight">')
        expect(html).not.toContain('foo=')
    })

    it('should work inside a tabbed set', () => {
        const html = renderMarkdown(
            [
                '=== "示例"',
                '    ```js title="a.js" linenums="1" hl_lines="2"',
                '    const a = 1',
                '    const b = 2',
                '    ```'
            ].join('\n')
        )

        expect(html).toContain('tabbed-set tabbed-alternate')
        expect(html).toContain('<span class="filename">a.js</span>')
        expect(html).toContain('<span class="lineno" aria-hidden="true">2</span>')
        expect(html).toContain('class="line hll"')
    })
})

/* ============================== 三、行内高亮（inlinehilite） ============================== */

describe('行内高亮（#!lang）', () => {
    it('should render #!lang inline code with the highlight class', () => {
        const html = renderMarkdown('行内 `#!python print(1)` 结束')

        expect(html).toContain('<code class="highlight language-python">')
        expect(html).toContain('hljs-built_in')
        expect(html).toContain('print')
        expect(html).toContain('结束')
    })

    it('should keep unknown inline languages escaped', () => {
        const html = renderMarkdown('`#!not-a-lang x < y & z`')

        expect(html).toContain('<code class="highlight language-not-a-lang">')
        expect(html).toContain('x &lt; y &amp; z')
    })

    it('should leave ordinary inline code unchanged', () => {
        const html = renderMarkdown('普通 `const a = 1` 行内代码')

        expect(html).toContain('<code class="hljs">const a = 1</code>')
        expect(html).not.toContain('highlight language-')
    })

    it('should not treat a shebang as an inline highlight language', () => {
        const html = renderMarkdown('脚本 `#!/bin/bash` 开头')

        expect(html).toContain('#!/bin/bash')
        expect(html).not.toContain('highlight language-')
    })

    it('should work inside headings and grid cards', () => {
        const heading = renderMarkdown('### 标题 `#!js const a = 1`')
        expect(heading).toContain('<h3>')
        expect(heading).toContain('<code class="highlight language-js">')

        const card = renderMarkdown(
            ['<div class="grid cards" markdown>', '-   `#!python print(1)`', '</div>'].join('\n')
        )
        expect(card).toContain('<div class="grid cards">')
        expect(card).toContain('<code class="highlight language-python">')
    })
})

/* ============================== 四、Material 图标 ============================== */

describe('Material 图标（:material-*:）', () => {
    it('should render a known material icon as span + svg + path', () => {
        const html = renderMarkdown('前 :material-account: 后')

        expect(html).toContain('<span class="mkdocs-icon" title="material-account">')
        expect(html).toContain('<svg class="md-icon"')
        expect(html).toContain('viewBox="0 0 24 24"')
        expect(html).toContain('width="1.2em"')
        expect(html).toContain('height="1.2em"')
        expect(html).toContain('fill="currentColor"')
        expect(html).toContain('aria-hidden="true"')
        expect(html).toMatch(/<path d="M[^"]+"\/><\/svg><\/span>/)
        expect(html).toContain('前')
        expect(html).toContain('后')
        // 短代码本身不再以文本形式出现在输出里
        expect(html).not.toContain(':material-account:')
    })

    it('should render outline / language / brand icons from the subset', () => {
        const html = renderMarkdown(
            [
                ':material-account-outline: :material-language-python: :material-github:',
                '',
                ':material-docker: :material-database: :material-terminal:'
            ].join('\n')
        )

        expect(countMatches(html, /class="mkdocs-icon"/g)).toBe(6)
        expect(html).toContain('title="material-language-python"')
        expect(html).toContain('title="material-github"')
        expect(html).toContain('title="material-terminal"')
    })

    it('should degrade an unknown icon to visible text without swallowing following text', () => {
        const html = renderMarkdown(':material-unknown-name: 后续文本')

        expect(html).toContain('class="mkdocs-icon mkdocs-icon--missing"')
        expect(html).toContain('title="material-unknown-name"')
        expect(html).toContain(':material-unknown-name:')
        expect(html).toContain('后续文本')
        expect(html).not.toContain('<svg')
    })

    it('should not affect emoji shortcodes', () => {
        const html = renderMarkdown(':smile: 与 :material-star: 与 :heart:')

        // emoji 仍由 markdown-it-emoji 处理
        expect(html).toContain('😄')
        expect(html).toContain('❤')
        // material 图标照常渲染
        expect(html).toContain('title="material-star"')
    })

    it('should not match malformed shortcode patterns', () => {
        const html = renderMarkdown('A :: B :material-: C :material-Account: D')

        expect(html).not.toContain('<svg')
        expect(html).toContain('::')
        expect(html).toContain(':material-:')
        expect(html).toContain(':material-Account:')
    })

    it('should render icons inside headings, lists and cards', () => {
        const html = renderMarkdown(
            [
                '## :material-book: 标题',
                '',
                '- :material-check: 列表项',
                '',
                '<div class="grid cards" markdown>',
                '-   :material-folder-open: 卡片',
                '</div>'
            ].join('\n')
        )

        expect(html).toContain('<h2><span class="mkdocs-icon" title="material-book">')
        expect(html).toContain('<li><span class="mkdocs-icon" title="material-check">')
        expect(html).toContain('title="material-folder-open"')
    })

    it('should not parse icons inside code blocks or inline code', () => {
        const fenced = renderMarkdown(['```text', ':material-account:', '```'].join('\n'))
        expect(fenced).not.toContain('<svg')
        expect(fenced).toContain(':material-account:')

        const inline = renderMarkdown('` :material-account: `')
        expect(inline).not.toContain('<svg')
        expect(inline).toContain(':material-account:')
    })

    it('should fall back to visible text for octicons (extension point, empty data)', () => {
        const html = renderMarkdown(':octicons-home: 文本')

        expect(OCTICON_ICON_PATHS).toEqual({})
        expect(html).toContain('mkdocs-icon--missing')
        expect(html).toContain(':octicons-home:')
        expect(html).toContain('文本')
    })
})

/* ============================== 五、图标数据子集 ============================== */

describe('MDI 图标数据子集', () => {
    it('should contain at least 100 icons and the required common icons', () => {
        expect(MDI_ICON_COUNT).toBeGreaterThanOrEqual(100)
        expect(Object.keys(MDI_ICON_PATHS).length).toBe(MDI_ICON_COUNT)
        const required = [
            'account',
            'account-outline',
            'home',
            'cog',
            'file',
            'folder',
            'link',
            'code',
            'check',
            'close',
            'alert',
            'information',
            'magnify',
            'book',
            'star',
            'heart',
            'download',
            'upload',
            'pencil',
            'delete',
            'plus',
            'chevron-left',
            'chevron-right',
            'chevron-up',
            'chevron-down',
            'arrow-left',
            'arrow-right',
            'arrow-up',
            'arrow-down',
            'github',
            'language-python',
            'language-cpp',
            'language-javascript',
            'language-rust',
            'language-go',
            'linux',
            'windows',
            'apple',
            'microsoft',
            'docker',
            'database',
            'cloud',
            'lock',
            'key',
            'email',
            'calendar',
            'clock',
            'chart-bar',
            'chart-line',
            'chart-pie',
            'table',
            'image',
            'video',
            'music',
            'terminal',
            'console',
            'bug',
            'test-tube',
            'package',
            'tag',
            'comment',
            'message',
            'bell',
            'account-group',
            'help-circle',
            'play',
            'pause',
            'refresh',
            'history',
            'map-marker',
            'phone',
            'wifi',
            'battery',
            'monitor',
            'printer',
            'folder-open',
            'file-document'
        ]
        const missing = required.filter((name) => !(name in MDI_ICON_PATHS))
        expect(missing).toEqual([])
    })

    it('should have valid 24x24 path data and stay within ~100 KiB', () => {
        for (const [name, pathData] of Object.entries(MDI_ICON_PATHS)) {
            expect(pathData.length, `icon ${name} should not be empty`).toBeGreaterThan(10)
            expect(/^[Mm]/.test(pathData), `icon ${name} should start with a moveto command`).toBe(
                true
            )
            expect(pathData, `icon ${name} should not contain markup`).not.toMatch(/[<>]/)
        }

        const dataPath = path.resolve(
            WORKSPACE_ROOT,
            'src/renderer/src/components/Markdown/mdi-icons-data.ts'
        )
        const dataBytes = fs.statSync(dataPath).size
        expect(dataBytes).toBeLessThan(100 * 1024)
    })
})

/* ============================== 五-b、核心子集与懒加载（P2-4） ============================== */

describe('MDI 核心子集与全量懒加载（P2-4）', () => {
    it('核心子集是全量数据的真子集，且同名 path 完全一致', () => {
        expect(MDI_ICON_CORE_COUNT).toBe(Object.keys(MDI_ICON_PATHS_CORE).length)
        // 确实只拆出了一部分（核心 < 全量，首屏体积减少）
        expect(MDI_ICON_CORE_COUNT).toBeLessThan(MDI_ICON_COUNT)
        for (const [name, pathData] of Object.entries(MDI_ICON_PATHS_CORE)) {
            expect(MDI_ICON_PATHS[name], `core icon ${name} should exist in full data`).toBe(
                pathData
            )
        }
        // 渲染测试用到的图标都在核心子集中（保证预览首屏渲染零异步等待）
        for (const name of [
            'account',
            'account-outline',
            'cog',
            'star',
            'book',
            'check',
            'github'
        ]) {
            expect(MDI_ICON_PATHS_CORE[name]).toBeDefined()
        }
    })

    it('核心图标同步可取；全量加载前非核心图标降级、加载后可用（Promise 缓存）', async () => {
        // 核心图标无需等待全量加载即可同步取得
        expect(getMdiIconPath('account')).toBe(MDI_ICON_PATHS.account)

        // 非核心图标（如 android 不在核心清单）在加载完成前降级为 undefined
        if (!isMdiIconDataLoaded()) {
            expect(getMdiIconPath('android')).toBeUndefined()
        }
        // 动态 import 缓存：多次调用返回同一 Promise/结果
        const first = loadMdiIconData()
        const second = loadMdiIconData()
        expect(second).toBe(first)
        await first
        expect(isMdiIconDataLoaded()).toBe(true)
        expect(getMdiIconPath('android')).toBe(MDI_ICON_PATHS.android)
        // 图标名列表从核心集扩展到全量
        const names = getMdiIconNames()
        expect(names.length).toBe(MDI_ICON_COUNT)
        expect(names).toContain('android')
        expect(names).toContain('account')
    })

    it('octicons 扩展点仍为空对象，渲染走降级路径', () => {
        expect(OCTICON_ICON_PATHS).toEqual({})
    })
})

/* ============================== 六、DOMPurify 兼容性 ============================== */

describe('DOMPurify 消毒后结构保留（预览组件同款 USE_PROFILES 配置）', () => {
    it('should keep grid cards / icons / code block enhancement structure after sanitizing', () => {
        const source = [
            buildGridCardsDocument(),
            '',
            '```python linenums="1" hl_lines="2" title="main.py"',
            'def main():',
            '    print("a")',
            '```'
        ].join('\n')
        const sanitized = DOMPurify.sanitize(renderMarkdown(source), DOMPURIFY_CONFIG)

        expect(sanitized).toContain('<div class="grid cards">')
        expect(sanitized).toContain('<li>')
        expect(sanitized).toContain('<strong>标题一</strong>')
        expect(sanitized).toContain('<hr>')
        // 图标 svg 结构 + 属性全部保留
        expect(sanitized).toContain('<span class="mkdocs-icon" title="material-account">')
        expect(sanitized).toContain('<svg class="md-icon"')
        expect(sanitized).toContain('viewBox="0 0 24 24"')
        expect(sanitized).toContain('fill="currentColor"')
        expect(sanitized).toContain('aria-hidden="true"')
        // DOMPurify 会把自闭合 path 序列化为 `<path …></path>`，两种形态都接受
        expect(sanitized).toMatch(/<path d="M[^"]+"(?:\/>|><\/path>)<\/svg><\/span>/)
        // 代码块增强结构保留
        expect(sanitized).toContain('<div class="highlight">')
        expect(sanitized).toContain('<span class="filename">main.py</span>')
        expect(sanitized).toContain('<span class="lineno" aria-hidden="true">1</span>')
        expect(sanitized).toContain('class="line hll"')
        expect(sanitized).toContain('hljs language-python')
    })

    it('should keep details / summary / disabled input and strip svg <use> after sanitizing', () => {
        const source = [
            '<details>',
            '<summary>可折叠标题</summary>',
            '<input type="checkbox" disabled>',
            '<svg viewBox="0 0 10 10"><defs><path id="icon-path" d="M0 0h10v10z"/></defs>',
            '<use href="#icon-path"/></svg>',
            '<span class="probe" title="提示" aria-hidden="true">文本</span>',
            '</details>'
        ].join('')
        const sanitized = DOMPurify.sanitize(renderMarkdown(source), DOMPURIFY_CONFIG)

        expect(sanitized).toContain('<details>')
        expect(sanitized).toContain('<summary>可折叠标题</summary>')
        // 布尔属性在序列化后形如 `disabled=""`，语义不变
        expect(sanitized).toContain('<input type="checkbox" disabled="">')
        expect(sanitized).toContain('<svg viewBox="0 0 10 10">')
        expect(sanitized).toContain('<path id="icon-path" d="M0 0h10v10z">')
        expect(sanitized).toContain('class="probe" title="提示" aria-hidden="true"')
        // DOMPurify 3.4.x 出于安全考虑默认移除 SVG <use>（本项目的图标只用 <path>，
        // 因此不受影响；这是「不需要改 MarkdownPreviewComponent 配置」的事实依据）
        expect(sanitized).not.toContain('<use')
    })

    it('should strip dangerous HTML while keeping the enhanced structures', () => {
        const html = renderMarkdown(
            [
                '<div class="grid cards" markdown>',
                '-   :material-shield-check: 安全',
                '</div>',
                '',
                '<script>alert(1)</script>',
                '<img src="x" onerror="alert(1)">'
            ].join('\n')
        )
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).not.toContain('<script')
        expect(sanitized).not.toContain('onerror')
        expect(sanitized).toContain('<div class="grid cards">')
        expect(sanitized).toContain('title="material-shield-check"')
    })
})

/* ============================== 七、CSS 交付物 ============================== */

describe('md-media.css 样式交付', () => {
    const css = fs.readFileSync(
        path.resolve(WORKSPACE_ROOT, 'src/renderer/src/styles/material/md-media.css'),
        'utf8'
    )

    it('should style grid cards, icons, filename, line numbers and hll lines', () => {
        expect(css).toMatch(/\.grid\.cards/)
        expect(css).toMatch(/\.mkdocs-icon/)
        expect(css).toMatch(/\.md-icon/)
        expect(css).toMatch(/\.filename/)
        expect(css).toMatch(/\.lineno/)
        expect(css).toMatch(/\.line/)
        expect(css).toMatch(/\.hll/)
        // 复制代码时行号不混入：行号必须 user-select: none
        expect(css).toMatch(/\.lineno[\s\S]{0,400}?user-select:\s*none/)
        // 使用 CSS 变量（深浅主题可覆盖），不引入新依赖
        expect(css).toContain('var(--')
    })
})
