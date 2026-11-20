// @vitest-environment jsdom
/**
 * 批次 A「标准 Markdown 扩展」单元测试（preview-md-basic.ts）。
 *
 * 覆盖 9 项语法（每项 ≥2 例，正常 + 边界）：
 * 1. `???` / `???+` 折叠提示块（类型/标题/默认展开/嵌套/转义/优雅回退）；
 * 2. 任务列表（`[ ]`/`[x]`/`[X]`、class/checkbox、非任务列表不受影响）；
 * 3. `==高亮==`（边界：空内容/未闭合/`===`、代码块内不生效）；
 * 4. `^^插入^^`、markdown-it 内建 `~~删除~~`、critic 标记（含隐藏注释、替换语法、转义）；
 * 5. `^上标^` / `~下标~`（不干扰内建 `~~删除~~`）；
 * 6. `++ctrl+alt+del++` 键盘按键（与 `C++`、critic `{++…++}` 区分）；
 * 7. attr_list（链接/图片/标题/行内元素，class/id/key=value，语法非法回退）；
 * 8. 脚注（引用编号、文末区、多行定义、同脚注多次引用、缺失定义回退）；
 * 9. 定义列表（多定义/多术语共享定义/多组/续行/回退）。
 *
 * 另含：嵌套组合（??? 内列表/代码/嵌套 ???/!!! admonition/tabbed set）、
 * 既有语法共存（KaTeX 预处理产物 / emoji / 围栏代码 / 内建 strikethrough / 链接）、
 * 与预览组件一致的 DOMPurify（USE_PROFILES）消毒后标签与属性保留验证（jsdom）。
 */
import { describe, it, expect } from 'vitest'
import DOMPurify from 'dompurify'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import {
    EnsurePreviewKatexLoaded,
    HemyRenderPreLocal
} from '../../src/renderer/src/components/Markdown/preview-local-render'

/** 与 MarkdownPreviewComponent.vue 完全一致的 DOMPurify 配置（CMP-15） */
const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }
}

/** 用预览同款 markdown-it 实例（含批次 A/B/C 插件 + highlight.js）渲染 */
function renderMarkdown(source: string): string {
    return createPreviewMarkdownIt().render(source)
}

/** 统计匹配次数（断言结构数量用） */
function countMatches(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
}

/** 经「本地预渲染 + markdown-it」完整语法管线渲染（用于 KaTeX 共存验证） */
async function renderThroughPipeline(source: string): Promise<string> {
    // P1-8：KaTeX 改为按需动态加载——与预览组件同序，在同步预渲染前先 await 加载
    await EnsurePreviewKatexLoaded(source)
    return createPreviewMarkdownIt().render(HemyRenderPreLocal(source))
}

/* ============================== 一、折叠提示块 `???` ============================== */

describe('折叠提示块 ??? / ???+', () => {
    it('should render a collapsed admonition with title and parsed content', () => {
        const html = renderMarkdown('??? note "提示"\n    这是**内容**')

        expect(html).toContain('<details class="admonition note">')
        expect(html).toContain('<summary class="admonition-title">提示</summary>')
        expect(html).toContain('<p>这是<strong>内容</strong></p>')
        expect(html).toContain('</details>')
        // 默认折叠（无 open 属性）
        expect(html).not.toContain('<details class="admonition note" open')
    })

    it('should render ???+ as expanded (open attribute) and lowercase the type', () => {
        const html = renderMarkdown('???+ WARNING "注意"\n    内容')

        expect(html).toContain('<details class="admonition warning" open>')
        expect(html).toContain('<summary class="admonition-title">注意</summary>')
    })

    it('should fall back to the type name when no title is given', () => {
        const html = renderMarkdown('??? tip\n    内容')

        expect(html).toContain('<summary class="admonition-title">tip</summary>')
        expect(html).toContain('<p>内容</p>')
    })

    it('should escape HTML in the title (no script injection)', () => {
        const html = renderMarkdown('??? note "<script>alert(1)</script>"\n    x')

        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
        expect(html).toContain('<details class="admonition note">')
    })

    it('should support lists and fenced code inside a collapsible block', () => {
        const html = renderMarkdown(
            [
                '??? tip "嵌套内容"',
                '    - 列表项一',
                '    - 列表项二',
                '',
                '    ```js',
                '    const a = 1',
                '    ```'
            ].join('\n')
        )

        expect(html).toContain('<li>列表项一</li>')
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('```')
    })

    it('should support nested ??? and nested !!! admonition/tabbed set', () => {
        const nestedDetails = renderMarkdown(
            ['??? note "外层"', '    ???+ tip "内层"', '        嵌套内容'].join('\n')
        )
        expect(countMatches(nestedDetails, /<details class="admonition /g)).toBe(2)
        expect(nestedDetails).toContain('<details class="admonition tip" open>')
        expect(nestedDetails).toContain('<p>嵌套内容</p>')

        const mixedBlocks = renderMarkdown(
            [
                '??? note "外层"',
                '    !!! warning "admonition 内层"',
                '        内容一',
                '',
                '    === "标签"',
                '        内容二'
            ].join('\n')
        )
        expect(mixedBlocks).toContain('<div class="admonition warning">')
        expect(mixedBlocks).toContain('tabbed-set')
        expect(mixedBlocks).toContain('<p>内容一</p>')
        expect(mixedBlocks).toContain('<p>内容二</p>')
    })

    it('should support task lists and definition lists nested inside a collapsible block', () => {
        const html = renderMarkdown(
            [
                '??? note "嵌套块级语法"',
                '    - [x] 已完成',
                '    - [ ] 未完成',
                '',
                '    术语',
                '    : 定义'
            ].join('\n')
        )

        expect(html).toContain('<details class="admonition note">')
        expect(countMatches(html, /class="task-list-item"/g)).toBe(2)
        expect(html).toContain('<dl>')
        expect(html).toContain('<dt>术语</dt>')
        expect(html).toContain('<dd>定义</dd>')
    })

    it('should not treat ??? / footnote definition lines inside fenced code as blocks', () => {
        const html = renderMarkdown(
            ['```', '??? note "x"', '[^1]: y', '术语', ': 定义', '```'].join('\n')
        )

        expect(html).toContain('??? note &quot;x&quot;')
        expect(html).toContain('[^1]: y')
        expect(html).not.toContain('<details')
        expect(html).not.toContain('<dl>')
    })

    it('should not treat ??? inside a paragraph as a block and tolerate unclosed blocks', () => {
        const inlineText = renderMarkdown('普通正文\n??? note "x"\n    y')
        expect(inlineText).not.toContain('<details')
        expect(inlineText).toContain('??? note')

        // 文末未闭合：块尾即文档尾，不抛异常、后续 Markdown 不受影响
        const unclosed = renderMarkdown('??? note "未闭合"\n    内容\n\n# 后续标题')
        expect(unclosed).toContain('<details class="admonition note">')
        expect(unclosed).toContain('<p>内容</p>')
        expect(unclosed).toContain('<h1>后续标题</h1>')
    })

    it('should render multiple collapsible blocks without cross-contamination', () => {
        const html = renderMarkdown(
            ['??? note "第一块"', '    body-one', '', '???+ tip "第二块"', '    body-two'].join(
                '\n'
            )
        )

        expect(countMatches(html, /<details class="admonition /g)).toBe(2)
        expect(html).toContain('<p>body-one</p>')
        expect(html).toContain('<p>body-two</p>')
        expect(countMatches(html, /open>/g)).toBe(1)
    })
})

/* ============================== 二、任务列表 ============================== */

describe('任务列表', () => {
    it('should render unchecked/checked task items with li class and disabled checkbox', () => {
        const html = renderMarkdown('- [ ] 未完成\n- [x] 已完成\n- [X] 大写完成')

        expect(countMatches(html, /class="task-list-item"/g)).toBe(3)
        expect(countMatches(html, /<input type="checkbox" disabled>/g)).toBe(1)
        expect(countMatches(html, /<input type="checkbox" disabled checked>/g)).toBe(2)
        expect(html).toContain('未完成')
        expect(html).toContain('已完成')
        expect(html).toContain('大写完成')
        // 任务标记不再作为文本输出
        expect(html).not.toContain('[ ]')
        expect(html).not.toContain('[x]')
    })

    it('should support ordered lists and loose list items (checkbox before first paragraph)', () => {
        const ordered = renderMarkdown('1. [ ] 有序未完成\n2. [x] 有序完成')
        expect(countMatches(ordered, /class="task-list-item"/g)).toBe(2)
        expect(countMatches(ordered, /<input type="checkbox"/g)).toBe(2)

        const loose = renderMarkdown('- [x] 第一段\n\n  第二段')
        expect(loose).toContain('class="task-list-item"')
        expect(loose).toContain('<p><input type="checkbox" disabled checked> 第一段</p>')
        expect(loose).toContain('第二段')
    })

    it('should not alter ordinary list items or markers without a following space', () => {
        const ordinary = renderMarkdown('- 普通项目一\n- 普通项目二')
        expect(ordinary).not.toContain('task-list-item')
        expect(ordinary).not.toContain('<input')

        const noSpace = renderMarkdown('- [x]紧贴文本')
        expect(noSpace).not.toContain('task-list-item')
        expect(noSpace).not.toContain('<input')
    })

    it('should keep inline markdown/emoji after the task marker', () => {
        const html = renderMarkdown('- [ ] 完成 **加粗** :rocket:')

        expect(html).toContain('class="task-list-item"')
        expect(html).toContain('<strong>加粗</strong>')
        expect(html).toContain('🚀')
    })

    it('should render an empty task item as checkbox only', () => {
        const html = renderMarkdown('- [ ]\n- [x]')

        expect(countMatches(html, /class="task-list-item"/g)).toBe(2)
        expect(html).toContain('<input type="checkbox" disabled>')
        expect(html).toContain('<input type="checkbox" disabled checked>')
    })
})

/* ============================== 三、高亮 == 高亮 == ============================== */

describe('高亮 ==高亮==', () => {
    it('should render mark tags in inline text', () => {
        const html = renderMarkdown('这是==高亮==文本')

        expect(html).toContain('<mark>高亮</mark>')
        expect(html).toContain('这是<mark>高亮</mark>文本')
    })

    it('should allow spaces inside the highlight and escape HTML', () => {
        const spaced = renderMarkdown('==带 空格 的高亮==')
        expect(spaced).toContain('<mark>带 空格 的高亮</mark>')

        const escaped = renderMarkdown('==<b>不是标签</b>==')
        expect(escaped).toContain('&lt;b&gt;不是标签&lt;/b&gt;')
        expect(escaped).not.toContain('<b>不是标签</b>')
    })

    it('should fall back for empty/unclosed/=== cases', () => {
        expect(renderMarkdown('空 ==高亮')).toContain('==高亮')
        expect(renderMarkdown('==   ==')).not.toContain('<mark>')
        expect(renderMarkdown('x === y')).not.toContain('<mark>')
    })

    it('should not touch code spans or fenced code blocks', () => {
        const codeSpan = renderMarkdown('`==不是高亮==`')
        expect(codeSpan).toMatch(/<code[^>]*>==不是高亮==<\/code>/)
        expect(codeSpan).not.toContain('<mark>')

        const fence = renderMarkdown('```\n==不是高亮==\n```')
        expect(fence).not.toContain('<mark>')
        expect(fence).toContain('==不是高亮==')
    })
})

/* ============================== 四、插入/删除/critic ============================== */

describe('插入 ^^…^^、内建删除 ~~…~~ 与 critic 标记', () => {
    it('should render caret insert and keep markdown-it strikethrough working', () => {
        const html = renderMarkdown('^^新增内容^^ 与 ~~删除内容~~')

        expect(html).toContain('<ins>新增内容</ins>')
        expect(html).toContain('<s>删除内容</s>')
        // 内建删除不被 caret 规则或下标规则吞掉
        expect(html).not.toContain('<sub>删除内容</sub>')
    })

    it('should render critic insert/delete/mark and substitution', () => {
        const html = renderMarkdown('{++新增++} {--删除--} {==高亮==} 替换：{~~旧内容~>新内容~~}')

        expect(html).toContain('<ins>新增</ins>')
        expect(html).toContain('<del>删除</del>')
        expect(html).toContain('<mark>高亮</mark>')
        expect(html).toContain('<del>旧内容</del>')
        expect(html).toContain('<ins>新内容</ins>')
    })

    it('should hide critic comments and escape their content', () => {
        const html = renderMarkdown('正文{>>审核意见<script>alert(1)</script><<}结束')

        expect(html).toContain('class="critic comment"')
        expect(html).toContain('hidden')
        expect(html).toContain('审核意见')
        // 注释内容中的 HTML 已转义，不会成为可执行标签
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')

        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)
        expect(sanitized).toContain('class="critic comment"')
        expect(sanitized).toContain('hidden')
    })

    it('should escape critic/insert content and tolerate unclosed marks', () => {
        const html = renderMarkdown('{++<b>粗</b>++} 和 ^^<i>斜</i>^^')
        expect(html).toContain('&lt;b&gt;粗&lt;/b&gt;')
        expect(html).toContain('&lt;i&gt;斜&lt;/i&gt;')
        expect(html).not.toContain('<b>粗</b>')

        const unclosed = renderMarkdown('{++未闭合 和 --} 不闭合')
        expect(unclosed).toContain('{++未闭合')
        expect(unclosed).not.toContain('<ins>')
    })
})

/* ============================== 五、上标/下标 ============================== */

describe('上标 ^…^ 与下标 ~…~', () => {
    it('should render superscript and subscript', () => {
        const html = renderMarkdown('H~2~O 与 x^2^ 以及 E=mc^2^')

        expect(html).toContain('H<sub>2</sub>O')
        expect(html).toContain('x<sup>2</sup>')
        expect(html).toContain('mc<sup>2</sup>')
    })

    it('should keep markdown-it built-in strikethrough intact (no sub/sup leak)', () => {
        const html = renderMarkdown('~~删除~~ 与 ~下标~')

        expect(html).toContain('<s>删除</s>')
        expect(html).toContain('<sub>下标</sub>')
        expect(countMatches(html, /<sub>/g)).toBe(1)
        expect(countMatches(html, /<sup>/g)).toBe(0)
    })

    it('should support CJK content and reject space-padded content', () => {
        expect(renderMarkdown('水^上标^与~下标~')).toContain('水<sup>上标</sup>与<sub>下标</sub>')
        expect(renderMarkdown('~ 空格 ~')).not.toContain('<sub>')
        expect(renderMarkdown('^ 空格 ^')).not.toContain('<sup>')
    })

    it('should leave unclosed markers as literal text and not touch emphasis', () => {
        const unclosed = renderMarkdown('未闭合 ^上标 与 ~下标')
        expect(unclosed).toContain('^上标')
        expect(unclosed).toContain('~下标')
        expect(unclosed).not.toContain('<sup>')

        const emphasis = renderMarkdown('*斜体* 与 ^上^')
        expect(emphasis).toContain('<em>斜体</em>')
        expect(emphasis).toContain('<sup>上</sup>')
    })
})

/* ============================== 六、键盘按键 ++…++ ============================== */

describe('键盘按键 ++…++', () => {
    it('should render kbd elements joined by plus signs', () => {
        const html = renderMarkdown('按 ++ctrl+alt+del++ 重启')

        expect(html).toContain('<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>')
    })

    it('should support a single key and quoted continuous input', () => {
        expect(renderMarkdown('++Enter++')).toContain('<kbd>Enter</kbd>')
        expect(renderMarkdown('++"Hello World"++')).toContain('<kbd>Hello World</kbd>')
    })

    it('should not touch plain C++ text or critic insert marks', () => {
        const cpp = renderMarkdown('使用 C++ 语言')
        expect(cpp).not.toContain('<kbd>')
        expect(cpp).toContain('C++')

        const critic = renderMarkdown('{++插入内容++}')
        expect(critic).toContain('<ins>插入内容</ins>')
        expect(critic).not.toContain('<kbd>')
    })

    it('should fall back for unclosed markers and invalid key names', () => {
        const unclosed = renderMarkdown('未闭合 ++ctrl')
        expect(unclosed).toContain('++ctrl')
        expect(unclosed).not.toContain('<kbd>')

        const invalid = renderMarkdown('++a b c++')
        expect(invalid).not.toContain('<kbd>')
    })
})

/* ============================== 七、属性列表 attr_list ============================== */

describe('属性列表 attr_list', () => {
    it('should attach .md-button class to a link', () => {
        const html = renderMarkdown('[按钮](https://example.com){ .md-button }')

        expect(html).toMatch(
            /<a (?=[^>]*href="https:\/\/example\.com")(?=[^>]*class="md-button")[^>]*>按钮<\/a>/
        )
    })

    it('should support multiple classes, id and key=value attributes', () => {
        const html = renderMarkdown(
            '[链接](https://example.com){ .md-button .md-button--primary #custom target="_blank" }'
        )

        expect(html).toContain('class="md-button md-button--primary"')
        expect(html).toContain('id="custom"')
        expect(html).toContain('target="_blank"')
        expect(html).toContain('href="https://example.com"')
    })

    it('should attach align attribute to images', () => {
        const html = renderMarkdown('![示意图](pic.png){ align=center }')

        expect(html).toMatch(/<img [^>]*align="center"/)
        expect(html).toMatch(/<img [^>]*alt="示意图"/)
        expect(html).toMatch(/<img [^>]*src="pic.png"/)
    })

    it('should attach attributes to headings on the same line', () => {
        const html = renderMarkdown('# 标题 { #custom-id }')

        expect(html).toContain('<h1 id="custom-id">标题</h1>')

        const withClass = renderMarkdown('## 小节 { .doc-title #sec }')
        expect(withClass).toContain('<h2 class="doc-title" id="sec">小节</h2>')
    })

    it('should attach attributes to other inline elements (emphasis/code/strikethrough)', () => {
        const strong = renderMarkdown('**重点**{ .highlight }')
        expect(strong).toContain('<strong class="highlight">重点</strong>')

        const code = renderMarkdown('`npm install`{ .command }')
        expect(code).toMatch(/<code[^>]*class="[^"]*command[^"]*"[^>]*>npm install<\/code>/)

        const strikethrough = renderMarkdown('~~旧内容~~{ .deprecated }')
        expect(strikethrough).toContain('<s class="deprecated">旧内容</s>')
    })

    it('should accept the no-space form and the optional colon form', () => {
        const noSpace = renderMarkdown('[链接](https://example.com){.md-button}')
        expect(noSpace).toContain('class="md-button"')

        const colonForm = renderMarkdown('[链接](https://example.com){: .md-button #btn }')
        expect(colonForm).toContain('class="md-button"')
        expect(colonForm).toContain('id="btn"')

        const headingNoSpace = renderMarkdown('# 标题 {#custom-id}')
        expect(headingNoSpace).toContain('<h1 id="custom-id">标题</h1>')
    })

    it('should require no whitespace before the attribute list', () => {
        const html = renderMarkdown('[链接](https://example.com) { .md-button }')

        expect(html).not.toContain('class="md-button"')
        expect(html).toContain('{ .md-button }')
    })

    it('should ignore invalid attribute lists and keep them as text', () => {
        const html = renderMarkdown('*斜体*{ 这不是属性 }')

        expect(html).not.toContain('<em class=')
        expect(html).toContain('{ 这不是属性 }')
    })

    it('should keep class/id after DOMPurify and strip event handler attributes', () => {
        const html = renderMarkdown(
            '[按钮](https://example.com){ .md-button #btn onclick=alert(1) }'
        )
        expect(html).toContain('onclick="alert(1)"')

        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)
        expect(sanitized).toContain('class="md-button"')
        expect(sanitized).toContain('id="btn"')
        expect(sanitized).not.toContain('onclick')
    })
})

/* ============================== 八、脚注 ============================== */

describe('脚注 [^n] 引用与定义', () => {
    it('should render footnote reference and section with backlink', () => {
        const html = renderMarkdown('正文引用[^1]\n\n[^1]: 脚注说明')

        expect(html).toContain('<sup class="footnote-ref" id="fnref-1">')
        expect(html).toContain('<a href="#fn-1">1</a></sup>')
        expect(html).toContain('<section class="footnotes">')
        expect(html).toContain('<ol>')
        expect(html).toContain('<li id="fn-1">')
        expect(html).toContain('<p>脚注说明</p>')
        expect(html).toContain('<a href="#fnref-1">↩</a>')
        expect(html).toContain('</section>')
    })

    it('should number footnotes by order of first reference', () => {
        const html = renderMarkdown(
            ['先引用乙[^b]，再引用甲[^a]。', '', '[^a]: 定义甲', '', '[^b]: 定义乙'].join('\n')
        )

        // 乙先被引用 → 编号 1；甲 → 编号 2
        expect(html).toMatch(/href="#fn-1"[^>]*>1<\/a>/)
        expect(html).toMatch(/href="#fn-2"[^>]*>2<\/a>/)
        expect(html).toContain('<li id="fn-1">')
        expect(html).toContain('<p>定义乙</p>')
        expect(html).toContain('<li id="fn-2">')
        expect(html).toContain('<p>定义甲</p>')
    })

    it('should fall back to literal text when the definition is missing', () => {
        const html = renderMarkdown('正文[^missing] 与 [^2]\n\n[^2]: 有定义')

        expect(html).toContain('[^missing]')
        expect(html).not.toContain('href="#fn-missing"')
        expect(html).toContain('href="#fn-1"')
    })

    it('should not break reference-style link definitions', () => {
        const html = renderMarkdown('[foo][ref]\n\n[ref]: https://example.com "标题"')

        expect(html).toContain('<a href="https://example.com" title="标题">foo</a>')
        expect(html).not.toContain('class="footnotes"')
    })

    it('should parse markdown inside a multi-line footnote definition', () => {
        const html = renderMarkdown(
            ['正文[^1]', '', '[^1]: 第一行 **加粗**', '    第二行', '    第三行'].join('\n')
        )

        expect(html).toContain('<p>第一行 <strong>加粗</strong>')
        expect(html).toContain('第二行')
        expect(html).toContain('第三行')
    })

    it('should keep footnotes and ids after DOMPurify sanitizing', () => {
        const html = renderMarkdown('A[^1] B[^1]\n\n[^1]: 说明')
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).toContain('class="footnote-ref"')
        expect(sanitized).toContain('id="fnref-1"')
        expect(sanitized).toContain('id="fn-1"')
        expect(sanitized).toContain('class="footnotes"')
        expect(sanitized).toContain('href="#fnref-1-2"')
    })
})

/* ============================== 九、定义列表 ============================== */

describe('定义列表 术语 + : 定义', () => {
    it('should render a basic definition list', () => {
        const html = renderMarkdown('术语\n: 定义')

        expect(html).toContain('<dl>')
        expect(html).toContain('<dt>术语</dt>')
        expect(html).toContain('<dd>定义</dd>')
        expect(html).toContain('</dl>')
    })

    it('should support multiple definitions for one term', () => {
        const html = renderMarkdown('术语\n: 定义一\n: 定义二')

        expect(countMatches(html, /<dd>/g)).toBe(2)
        expect(html).toContain('<dd>定义一</dd>')
        expect(html).toContain('<dd>定义二</dd>')
    })

    it('should support multiple terms sharing a definition', () => {
        const html = renderMarkdown('术语甲\n术语乙\n: 共享定义')

        expect(countMatches(html, /<dt>/g)).toBe(2)
        expect(html).toContain('<dt>术语甲</dt>')
        expect(html).toContain('<dt>术语乙</dt>')
        expect(countMatches(html, /<dd>/g)).toBe(1)
        expect(html).toContain('<dd>共享定义</dd>')
    })

    it('should merge multiple groups into one dl and support continuation lines', () => {
        const html = renderMarkdown(
            ['苹果', ': 蔷薇科植物', '', '橙子', ': 芸香科植物', '  常绿乔木'].join('\n')
        )

        expect(countMatches(html, /<dl>/g)).toBe(1)
        expect(countMatches(html, /<dt>/g)).toBe(2)
        expect(html).toContain('<dd>芸香科植物<br />')
        expect(html).toContain('常绿乔木')
    })

    it('should parse inline markdown in terms and definitions', () => {
        const html = renderMarkdown('**术语**\n: 定义含 `代码`')

        expect(html).toContain('<dt><strong>术语</strong></dt>')
        expect(html).toMatch(/<code[^>]*>代码<\/code>/)
    })

    it('should fall back for non-definition paragraphs and lone colons', () => {
        const plain = renderMarkdown('普通段落\n普通续行')
        expect(plain).not.toContain('<dl>')
        expect(plain).toContain('<p>普通段落')

        const loneColon = renderMarkdown(': 只有定义行')
        expect(loneColon).not.toContain('<dl>')

        // 块内列表/标题等既有语法不受定义列表规则影响
        const otherBlocks = renderMarkdown('# 标题\n\n- 列表项\n\n> 引用')
        expect(otherBlocks).toContain('<h1>标题</h1>')
        expect(otherBlocks).toContain('<li>列表项</li>')
        expect(otherBlocks).toContain('<blockquote>')
    })

    it('should keep dl/dt/dd after DOMPurify sanitizing', () => {
        const sanitized = DOMPurify.sanitize(renderMarkdown('术语\n: 定义'), DOMPURIFY_CONFIG)

        expect(sanitized).toContain('<dl>')
        expect(sanitized).toContain('<dt>术语</dt>')
        expect(sanitized).toContain('<dd>定义</dd>')
    })
})

/* ============================== 十、既有语法共存 ============================== */

describe('与既有语法共存（不回归）', () => {
    it('should keep emoji, links and markdown-it strikethrough working', () => {
        const html = renderMarkdown(
            ':smile: [链接](https://example.com) ~~删除~~ **粗体** *斜体* `code`'
        )

        expect(html).toContain('😄')
        expect(html).toContain('<a href="https://example.com">链接</a>')
        expect(html).toContain('<s>删除</s>')
        expect(html).toContain('<strong>粗体</strong>')
        expect(html).toContain('<em>斜体</em>')
        expect(html).toMatch(/<code[^>]*>code<\/code>/)
    })

    it('should keep KaTeX output from the local pre-render pipeline untouched', async () => {
        const html = await renderThroughPipeline('行内公式 $E=mc^2$ 与 $a^2 + b^2$ 结束')

        expect(html).toContain('class="katex"')
        // 公式源码在 MathML annotation 中保持原样：^ 不被当作上标语法改写
        expect(html).toContain('a^2 + b^2')
        expect(html).not.toContain('<sup>2</sup>')
    })

    it('should keep fenced code blocks, tables and blockquotes untouched', () => {
        const html = renderMarkdown(
            [
                '```js',
                'const a = 1',
                '```',
                '',
                '| 列一 | 列二 |',
                '| ---- | ---- |',
                '| 1    | 2    |',
                '',
                '> 引用段落'
            ].join('\n')
        )

        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('```')
        expect(html).toContain('<table>')
        expect(html).toContain('<blockquote>')
    })

    it('should not process markup syntax inside code spans/fences', () => {
        const html = renderMarkdown(
            ['`==x== ^y^ ~z~ ++k++ { .c }`', '', '```', '==x== ^y^ ~z~', '```'].join('\n')
        )

        expect(html).toContain('==x== ^y^ ~z~ ++k++ { .c }')
        expect(html).not.toContain('<mark>')
        expect(html).not.toContain('<sup>')
        expect(html).not.toContain('<kbd>')
    })
})

/* ============================== 十一、DOMPurify 综合保留验证 ============================== */

describe('DOMPurify（USE_PROFILES 配置）消毒后标签与属性保留', () => {
    it('should keep details/summary/open/ins/del/mark/sup/sub/kbd/dl/dt/dd/input structures', () => {
        const source = [
            '???+ note "标题"',
            '    折叠内容',
            '',
            '- [x] 任务',
            '',
            '^^插入^^ ~~删除~~ ==高亮== H~2~O x^2^ ++ctrl+alt+del++',
            '',
            '术语',
            ': 定义',
            '',
            '# 标题 { #custom-id }',
            '',
            '正文[^1]',
            '',
            '[^1]: 脚注'
        ].join('\n')
        const sanitized = DOMPurify.sanitize(renderMarkdown(source), DOMPURIFY_CONFIG)

        expect(sanitized).toContain('<details class="admonition note" open')
        expect(sanitized).toContain('<summary class="admonition-title">标题</summary>')
        expect(sanitized).toContain('<ins>插入</ins>')
        expect(sanitized).toContain('<s>删除</s>')
        expect(sanitized).toContain('<mark>高亮</mark>')
        expect(sanitized).toContain('<sub>2</sub>')
        expect(sanitized).toContain('<sup>2</sup>')
        expect(sanitized).toContain('<kbd>ctrl</kbd>')
        expect(sanitized).toContain('<dl>')
        expect(sanitized).toContain('<dt>术语</dt>')
        expect(sanitized).toContain('<dd>定义</dd>')
        expect(sanitized).toContain('class="task-list-item"')
        expect(sanitized).toContain('type="checkbox"')
        expect(sanitized).toContain('disabled')
        expect(sanitized).toContain('checked')
        expect(sanitized).toContain('id="custom-id"')
        expect(sanitized).toContain('class="footnote-ref"')
        expect(sanitized).toContain('id="fn-1"')
        expect(sanitized).toContain('id="fnref-1"')
    })

    it('should strip script/event handlers while keeping plain text content', () => {
        const html = renderMarkdown(
            '??? note "<script>alert(1)</script>"\n    正文[^1]\n\n[^1]: 说明'
        )
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).not.toContain('<script')
        expect(sanitized).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
        expect(sanitized).toContain('<details class="admonition note">')
        expect(sanitized).toContain('<section class="footnotes">')
    })
})

/* ============================== 十二、与本地预渲染管线串联 ============================== */

describe('与本地预渲染管线（HemyRenderPreLocal）串联', () => {
    it('should render all batch-A syntaxes through the real preview pipeline', async () => {
        const source = [
            '???+ note "折叠标题"',
            '    折叠内容',
            '',
            '- [x] 已完成任务',
            '- [ ] 未完成任务',
            '',
            '^^插入^^ ==高亮== ~~删除~~ H~2~O x^2^ ++ctrl+alt+del++',
            '',
            '术语',
            ': 定义',
            '',
            '正文引用[^1]',
            '',
            '[^1]: 脚注说明',
            '',
            '[按钮](https://example.com){ .md-button }'
        ].join('\n')
        const html = await renderThroughPipeline(source)

        expect(html).toContain('<details class="admonition note" open>')
        expect(html).toContain('<summary class="admonition-title">折叠标题</summary>')
        expect(countMatches(html, /class="task-list-item"/g)).toBe(2)
        expect(html).toContain('<ins>插入</ins>')
        expect(html).toContain('<mark>高亮</mark>')
        expect(html).toContain('<sub>2</sub>')
        expect(html).toContain('<sup>2</sup>')
        expect(html).toContain('<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>')
        expect(html).toContain('<dl>')
        expect(html).toContain('<dt>术语</dt>')
        expect(html).toContain('<dd>定义</dd>')
        expect(html).toContain('<section class="footnotes">')
        expect(html).toContain('id="fn-1"')
        expect(html).toContain('class="md-button"')
        // 未缩进/未闭合内容不吞后续 Markdown
        expect(html).not.toContain('???+')
    })

    it('should keep code fences inside collapsible blocks intact after pre-render', async () => {
        const source = [
            '??? tip "代码示例"',
            '    ```js',
            '    const a = 1',
            '    ```',
            '',
            '前言',
            '',
            '```js',
            'const b = 2',
            '```'
        ].join('\n')
        const html = await renderThroughPipeline(source)

        expect(countMatches(html, /class="hljs language-js"/g)).toBe(2)
        expect(html).not.toContain('```')
        expect(html).toContain('<p>前言</p>')
    })
})
