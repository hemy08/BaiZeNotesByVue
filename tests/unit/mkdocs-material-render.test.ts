// @vitest-environment jsdom
/**
 * mkdocs-material 语法（`!!! admonition` / `=== "标签"` tabbed set）渲染集成测试。
 *
 * 覆盖（对应 preview-mkdocs-material.ts 的 markdown-it 原生 block 插件方案）：
 * 1. admonition：有/无标题、类型小写化、标题 HTML 转义、内容 Markdown 解析、多块混排；
 * 2. tabbed set：单组多 tab（radio/label/block 数量、第 1 个 checked、代码围栏经 highlight.js
 *    高亮且不出现裸 ```）、多组 tab 的 radio name/id 唯一、`===  "双空格"` 兼容、
 *    tab 后空行、admonition 内嵌 tab、8 空格缩进代码围栏；
 * 3. 非法/未闭合块的优雅回退；普通 Markdown（标题/列表/围栏代码）不受影响；
 * 4. 与 MarkdownPreviewComponent 相同的 DOMPurify USE_PROFILES 配置消毒后，
 *    input/label/for/checked/name/id 等 tab 结构仍保留（jsdom 环境）；
 * 5. 与本地预渲染管线（HemyRenderPreLocal）串联后的端到端表现。
 */
import { describe, it, expect } from 'vitest'
import DOMPurify from 'dompurify'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import { HemyRenderPreLocal } from '../../src/renderer/src/components/Markdown/preview-local-render'

/** 与 MarkdownPreviewComponent.vue 完全一致的 DOMPurify 配置（CMP-15） */
const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }
}

/** 用预览同款 markdown-it 实例（含 mkdocs-material 插件 + highlight.js）渲染 */
function renderMarkdown(source: string): string {
    return createPreviewMarkdownIt().render(source)
}

/** 统计匹配次数（断言结构数量用） */
function countMatches(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
}

/** 生成「admonition 内嵌 tab + tab 内代码围栏」样例（与用户笔记同构） */
function buildSuccessTabsDocument(): string {
    return [
        '!!! Success "位运算解法"',
        '',
        '    === "C异或"',
        '        ```c',
        '        int singleNumber(int* nums, int numsSize){',
        '            int result = 0;',
        '            for (int i = 0; i < numsSize; i++) {',
        '                result = result ^ nums[i];',
        '            }',
        '            return result;',
        '        }',
        '        ```',
        '',
        '    === "Go异或"',
        '        ```go',
        '        func singleNumber(nums []int) int {',
        '            result := 0',
        '            return result',
        '        }',
        '        ```',
        '',
        '    === "C++异或"',
        '        ```cpp',
        '        int singleNumber() { return 0; }',
        '        ```'
    ].join('\n')
}

/* ============================== 一、admonition ============================== */

describe('mkdocs-material admonition 渲染', () => {
    it('should render an admonition with type, title and markdown content', () => {
        const html = renderMarkdown('!!! note "提示"\n    这是**内容**')

        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<p class="admonition-title">提示</p>')
        // 内容交给 markdown-it 解析：加粗语法生效
        expect(html).toContain('<p>这是<strong>内容</strong></p>')
        expect(html).toContain('</div>')
    })

    it('should fall back to the type name when no title is given', () => {
        const html = renderMarkdown('!!! warning\n    注意')

        expect(html).toContain('<div class="admonition warning">')
        expect(html).toContain('<p class="admonition-title">warning</p>')
        expect(html).toContain('<p>注意</p>')
    })

    it('should lowercase the admonition type', () => {
        const html = renderMarkdown('!!! NOTE "t"\n    line')

        expect(html).toContain('<div class="admonition note">')
    })

    it('should escape HTML in the title (no script injection)', () => {
        const html = renderMarkdown('!!! note "<script>alert(1)</script>"\n    x')

        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('should support nested admonitions', () => {
        const html = renderMarkdown(
            ['!!! note "外层"', '    !!! tip "内层"', '        嵌套内容'].join('\n')
        )

        expect(countMatches(html, /class="admonition /g)).toBe(2)
        expect(html).toContain('<div class="admonition note">')
        expect(html).toContain('<div class="admonition tip">')
        expect(html).toContain('<p>嵌套内容</p>')
    })

    it('should support lists and code fences directly inside an admonition', () => {
        const html = renderMarkdown(
            [
                '!!! tip "提示"',
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

    it('should render multiple admonitions without cross-contamination', () => {
        const html = renderMarkdown(
            [
                '!!! note "第一块"',
                '    body-one',
                '',
                '!!! warning "第二块"',
                '    body-two',
                '',
                '!!! tip "第三块"',
                '    body-three'
            ].join('\n')
        )

        expect(countMatches(html, /class="admonition /g)).toBe(3)
        const first = html.indexOf('第一块')
        const second = html.indexOf('第二块')
        const third = html.indexOf('第三块')
        expect(first).toBeGreaterThanOrEqual(0)
        expect(second).toBeGreaterThan(first)
        expect(third).toBeGreaterThan(second)
        expect(html).toContain('<p>body-one</p>')
        expect(html).toContain('<p>body-two</p>')
        expect(html).toContain('<p>body-three</p>')
    })
})

/* ============================== 二、tabbed set ============================== */

describe('mkdocs-material tabbed set 渲染', () => {
    it('should keep a tab label containing HTML escaped', () => {
        const html = renderMarkdown('=== "<script>alert(1)</script>"\n    x')

        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('should render 3 tabs with radios, labels and highlighted code blocks', () => {
        const html = renderMarkdown(buildSuccessTabsDocument())

        // 一段 admonition 卡片 + 一组 3 tab
        expect(countMatches(html, /class="admonition success"/g)).toBe(1)
        expect(html).toContain('<div class="tabbed-set tabbed-alternate" data-tabs="1:3">')
        expect(countMatches(html, /type="radio"/g)).toBe(3)
        expect(countMatches(html, /class="tabbed-block"/g)).toBe(3)

        // 标签顺序与内容
        expect(html).toContain('<label for="__tabbed_1_1">C异或</label>')
        expect(html).toContain('<label for="__tabbed_1_2">Go异或</label>')
        expect(html).toContain('<label for="__tabbed_1_3">C++异或</label>')

        // 默认只选中第一个 tab（radio checked 仅 1 个）
        expect(countMatches(html, /checked/g)).toBe(1)
        expect(html).toContain('<input type="radio" name="__tabbed_1" id="__tabbed_1_1" checked>')

        // 代码围栏被 highlight.js 高亮为对应语言，且不再出现裸 ```
        expect(html).toContain('<code class="hljs language-c">')
        expect(html).toContain('<code class="hljs language-go">')
        expect(html).toContain('<code class="hljs language-cpp">')
        expect(html).not.toContain('```')
        // tab 标记本身不再作为普通文本输出
        expect(html).not.toContain('=== "C异或"')
    })

    it('should support blank line between tab header and content', () => {
        const html = renderMarkdown(
            [
                '=== "C差值"',
                '',
                '    ```c',
                '    int x;',
                '    ```',
                '',
                '=== "Go差值"',
                '    ok'
            ].join('\n')
        )

        expect(html).toContain('data-tabs="1:2"')
        expect(html).toContain('<code class="hljs language-c">')
        expect(html).not.toContain('```')
    })

    it('should generate unique radio name/id for multiple tab sets in one document', () => {
        const html = renderMarkdown(
            ['=== "A"', '    one', '', '# 中间标题', '', '=== "B"', '    two'].join('\n')
        )

        expect(html).toContain('data-tabs="1:1"')
        expect(html).toContain('data-tabs="2:1"')
        expect(html).toContain('name="__tabbed_1"')
        expect(html).toContain('name="__tabbed_2"')
        expect(html).toContain('id="__tabbed_1_1"')
        expect(html).toContain('id="__tabbed_2_1"')
        // 两组 radio 名称不冲突（避免浏览器把不同组 tab 联动）
        expect(html).not.toContain('name="__tabbed_1" id="__tabbed_2_1"')
        expect(countMatches(html, /type="radio"/g)).toBe(2)
    })

    it('should accept two spaces between === and the label', () => {
        const html = renderMarkdown('===  "双空格"\n    body')

        expect(html).toContain('<label for="__tabbed_1_1">双空格</label>')
        expect(html).toContain('<p>body</p>')
    })

    it('should support 8-space indented code fences inside a tab inside an admonition', () => {
        // 文档缩进层级：admonition(0) → tab(4) → 代码围栏(8)
        const html = renderMarkdown(
            [
                '!!! Success "数组解法"',
                '',
                '    === "C差值"',
                '',
                '        ```c',
                '        int cmp(const void* a, const void* b) { return 0; }',
                '        ```'
            ].join('\n')
        )

        expect(html).toContain('<div class="admonition success">')
        expect(html).toContain('<code class="hljs language-c">')
        expect(html).not.toContain('```')
        // 代码块位于 tabbed-block 内部（缩进去尽、结构未被打断）
        expect(html).toMatch(/class="tabbed-block"><pre><code class="hljs language-c">/)
    })

    it('should treat deeper-indented === as content, not a new tab', () => {
        const html = renderMarkdown('=== "A"\n        === "B"')

        expect(html).toContain('data-tabs="1:1"')
        expect(html).not.toContain('>B</label>')
    })

    it('should render an empty tab set when tab content is unindented', () => {
        const html = renderMarkdown('=== "A"\n普通段落')

        expect(html).toContain('data-tabs="1:1"')
        expect(html).toContain('<label for="__tabbed_1_1">A</label>')
        // 未缩进的行不属于 tab 内容，按普通段落继续渲染（不吞后续 Markdown）
        expect(html).toContain('<p>普通段落</p>')
    })
})

/* ============================== 三、非法/未闭合回退 ============================== */

describe('mkdocs-material 非法/未闭合块的优雅回退', () => {
    it('should treat a bare "!!!" line as ordinary text', () => {
        const html = renderMarkdown('!!!\nnot a card')

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('!!!')
        expect(html).toContain('not a card')
    })

    it('should treat an unterminated title as ordinary text', () => {
        const html = renderMarkdown('!!! note "未闭合\n    line')

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('!!! note')
    })

    it('should close an unclosed tab set at end of document without throwing', () => {
        const html = renderMarkdown('=== "A"\n    content')

        expect(html).toContain('data-tabs="1:1"')
        expect(html).toContain('<p>content</p>')
    })

    it('should keep following markdown intact after an unterminated directive', () => {
        const html = renderMarkdown('!!! note "块"\n    内容\n\n# 后续标题\n\n- 列表项')

        expect(html).toContain('<p class="admonition-title">块</p>')
        expect(html).toContain('<h1>后续标题</h1>')
        expect(html).toContain('<li>列表项</li>')
    })
})

/* ============================== 四、普通 Markdown 不受影响 ============================== */

describe('mkdocs-material 插件不影响普通 Markdown', () => {
    it('should render headings, lists and fenced code as before', () => {
        const html = renderMarkdown(
            ['# 标题一', '', '- 项目甲', '- 项目乙', '', '```js', 'const a = 1', '```'].join('\n')
        )

        expect(html).toContain('<h1>标题一</h1>')
        expect(html).toContain('<li>项目甲</li>')
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('```')
    })

    it('should not render admonition/tab syntax without a blank line inside a paragraph', () => {
        // 与 mkdocs 语义一致：指令需要单独成块；紧跟段落的 !!! 不打断段落
        const html = renderMarkdown('普通正文\n!!! note "x"\n    y')

        expect(html).not.toContain('class="admonition ')
        expect(html).toContain('!!! note')
    })
})

/* ============================== 五、DOMPurify 消毒后结构保留 ============================== */

describe('tab 结构经 DOMPurify 消毒后仍可交互（CMP-15 配置）', () => {
    it('should keep input/label/for/checked/name/id after sanitizing', () => {
        const html = renderMarkdown(buildSuccessTabsDocument())
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        expect(sanitized).toContain('class="tabbed-set tabbed-alternate"')
        expect(sanitized).toContain('<input')
        expect(sanitized).toContain('type="radio"')
        expect(sanitized).toContain('name="__tabbed_1"')
        expect(sanitized).toContain('id="__tabbed_1_1"')
        expect(sanitized).toContain('checked')
        expect(sanitized).toContain('<label for="__tabbed_1_1">C异或</label>')
        expect(countMatches(sanitized, /class="tabbed-block"/g)).toBe(3)
        expect(countMatches(sanitized, /type="radio"/g)).toBe(3)
        // 高亮 class 与 admonition class 均保留
        expect(sanitized).toContain('class="admonition success"')
        expect(sanitized).toContain('<code class="hljs language-c">')
    })

    it('should strip dangerous HTML while keeping escaped title text', () => {
        const html = renderMarkdown('!!! note "<img src=x onerror=alert(1)>"\n    body')
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        // 标题已在渲染时转义为纯文本：消毒后只保留可见文本，不产生 img 元素/事件属性
        expect(sanitized).not.toContain('<img')
        expect(sanitized).not.toContain('<script')
        expect(sanitized).toContain('&lt;img src=x onerror=alert(1)&gt;')
        expect(sanitized).toContain('<div class="admonition note">')
        expect(sanitized).toContain('body')
    })
})

/* ============================== 六、与本地预渲染管线串联 ============================== */

describe('preview-mkdocs-material 与 HemyRenderPreLocal 串联', () => {
    it('should render admonition+tab document after the local pre-render pipeline', () => {
        const source = buildSuccessTabsDocument()
        const html = renderMarkdown(HemyRenderPreLocal(source))

        expect(html).toContain('<div class="admonition success">')
        expect(html).toContain('data-tabs="1:3"')
        expect(html).toContain('<code class="hljs language-c">')
        expect(html).not.toContain('```')
    })

    it('should keep code fences outside admonitions intact through the pipeline', () => {
        const source = ['前言', '', '```js', 'const a = 1', '```', '', '后记'].join('\n')
        const preRendered = HemyRenderPreLocal(source)
        const html = renderMarkdown(preRendered)

        // 预处理不再吞掉围栏边界的换行符：markdown-it 仍能识别围栏并高亮
        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('```')
        expect(html).toContain('<p>前言</p>')
        expect(html).toContain('<p>后记</p>')
    })
})
