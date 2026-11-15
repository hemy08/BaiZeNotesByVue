/**
 * Tabbed Set 渲染单元测试（mkdocs-material 语法修复后）
 *
 * 历史：本文件原测 preview-local-render.ts 的「=== "标签" 字符串变换」旧实现
 * （tabbedSetRender / resetTabbedSetCounter 已删除）。现改为直接测试 markdown-it 原生
 * block 插件 `preview-mkdocs-material.ts` 的 tabbed set 规则：
 * 多标签收集、缩进去除、第 1 个 tab 默认选中、同文档多组 tab 的 radio name/id 唯一、
 * 标签转义、异常结构回退、非 tab 文本原样。
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { mkdocsMaterialPlugin } from '../../src/renderer/src/components/Markdown/preview-mkdocs-material'

/** 构造仅安装 mkdocs-material 插件的 markdown-it 实例 */
function createMarkdownIt(): InstanceType<typeof MarkdownIt> {
    const md = MarkdownIt({ html: true, xhtmlOut: true, breaks: true })
    md.use(mkdocsMaterialPlugin)
    return md
}

function render(source: string): string {
    return createMarkdownIt().render(source)
}

/** 统计匹配次数 */
function countMatches(html: string, pattern: RegExp): number {
    return (html.match(pattern) ?? []).length
}

describe('mkdocs-material tabbed set block rule', () => {
    it('should render a single tab set with checked first input and label', () => {
        const result = render('=== "Tab A"\n    hello world')
        expect(result).toContain('<div class="tabbed-set tabbed-alternate" data-tabs="1:1">')
        expect(result).toContain('id="__tabbed_1_1"')
        expect(result).toContain('checked')
        expect(result).toContain('<label for="__tabbed_1_1">Tab A</label>')
        // 内容行缩进 4 格被去除
        expect(result).toContain('<p>hello world</p>')
    })

    it('should render multiple tabs with only the first one checked', () => {
        const result = render('=== "A"\n    first\n\n=== "B"\n    second')
        expect(result).toContain('data-tabs="1:2"')
        expect(result).toContain('id="__tabbed_1_1"')
        expect(result).toContain('id="__tabbed_1_2"')
        // 仅第一个 input 带 checked
        expect(countMatches(result, /checked/g)).toBe(1)
        expect(result).toContain('<label for="__tabbed_1_1">A</label>')
        expect(result).toContain('<label for="__tabbed_1_2">B</label>')
        expect(result).toContain('<p>first</p>')
        expect(result).toContain('<p>second</p>')
    })

    it('should dedent content lines by 4 spaces (tabs indented deeper)', () => {
        const result = render('  === "A"\n      deep content')
        // === 缩进 2 格（<4 仍算块首），内容行 6 格缩进 → 去除 4 列后为 2 格缩进的段落
        expect(result).toContain('<p>deep content</p>')
        expect(result).toContain('<label for="__tabbed_1_1">A</label>')
    })

    it('should stop collecting at a non-indented line and continue rendering it', () => {
        const result = render('=== "A"\n    one\n# Title')
        // 标题行终止 tab 内容收集，但作为后续 Markdown 继续解析
        expect(result).toContain('<p>one</p>')
        expect(result).toContain('<h1>Title</h1>')
    })

    it('should treat deeper-indented === as content instead of a new tab', () => {
        const result = render('=== "A"\n        === "B"')
        // 更深缩进的 === 位于 tab 内容内部（相对缩进 8 → 去 4 后为 4 格缩进代码块），不是新 tab
        expect(result).toContain('data-tabs="1:1"')
        expect(result).not.toContain('>B</label>')
    })

    it('should pass through text without tabbed sets unchanged', () => {
        const input = 'just some plain\nmarkdown lines'
        expect(render(input)).toContain('just some plain')
        expect(render(input)).not.toContain('tabbed-set')
    })

    it('should escape HTML in tab labels', () => {
        const result = render('=== "<script>x</script>"\n    body')
        expect(result).not.toContain('<script>')
        expect(result).toContain('&lt;script&gt;x&lt;/script&gt;')
    })

    it('should increment the set id across multiple sets in one document', () => {
        const result = render('=== "A"\n    one\n\n# mid\n\n=== "B"\n    two')
        expect(result).toContain('data-tabs="1:1"')
        expect(result).toContain('data-tabs="2:1"')
    })

    it('should reset set ids for every new render (env is per parse)', () => {
        const md = createMarkdownIt()
        const first = md.render('=== "A"\n    one')
        const second = md.render('=== "B"\n    two')
        expect(first).toContain('data-tabs="1:1"')
        expect(second).toContain('data-tabs="1:1"')
        expect(second).toContain('<label for="__tabbed_1_1">B</label>')
    })

    it('should handle empty document without throwing', () => {
        expect(render('')).toBe('')
    })

    it('should render tab content as markdown (lists/code fences)', () => {
        const result = render(
            [
                '=== "A"',
                '    - 项目一',
                '    - 项目二',
                '',
                '=== "B"',
                '    ```go',
                '    func f() {}',
                '    ```'
            ].join('\n')
        )
        expect(result).toContain('<li>项目一</li>')
        expect(result).toContain('<code class="language-go">')
        expect(result).not.toContain('```')
    })
})
