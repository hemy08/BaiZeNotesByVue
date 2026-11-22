/**
 * Material Admonitions 渲染单元测试（mkdocs-material 语法修复后）
 *
 * 历史：本文件原测 preview-local-render.ts 的「正则/行扫描 → HTML 字符串」旧实现
 * （materialAdmonitionsRender 等已删除）。现改为直接测试 markdown-it 原生 block 插件
 * `preview-mkdocs-material.ts` 的 admonition 规则：
 * 类型/标题解析、类型小写化、无标题兜底、内容 Markdown 递归解析、
 * 块内代码块与嵌套 tab/admonition、多块混排、标题转义、无语法时原样。
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { mkdocsMaterialPlugin } from '../../src/renderer/src/components/Markdown/preview-mkdocs-material'

/** 构造仅安装 mkdocs-material 插件的 markdown-it 实例（与预览实例同一套解析规则） */
function createMarkdownIt(): InstanceType<typeof MarkdownIt> {
    const md = MarkdownIt({ html: true, xhtmlOut: true, breaks: true })
    md.use(mkdocsMaterialPlugin)
    return md
}

function render(source: string): string {
    return createMarkdownIt().render(source)
}

describe('mkdocs-material admonition block rule', () => {
    it('should render an admonition with type, title and content', () => {
        // 内容行需缩进 4 格才会被归入 admonition 块
        const result = render('!!! note "提示"\n    这是内容')
        expect(result).toContain('<div class="admonition note">')
        expect(result).toContain('<p class="admonition-title">提示</p>')
        // 内容由 markdown-it 递归解析为段落
        expect(result).toContain('<p>这是内容</p>')
    })

    it('should render an admonition without a title (fallback to type name)', () => {
        const result = render('!!! warning\n    内容行')
        expect(result).toContain('<div class="admonition warning">')
        expect(result).toContain('<p class="admonition-title">warning</p>')
        expect(result).toContain('<p>内容行</p>')
    })

    it('should lowercase the admonition type', () => {
        const result = render('!!! NOTE "t"\n    line')
        expect(result).toContain('<div class="admonition note">')
    })

    it('should support hyphen and underscore in the admonition type', () => {
        expect(render('!!! pied-piper "p"\n    x')).toContain('class="admonition pied-piper"')
        expect(render('!!! Some_Type "p"\n    x')).toContain('class="admonition some_type"')
    })

    it('should render markdown formatting inside the admonition content', () => {
        const result = render('!!! note "t"\n    **bold** text')
        expect(result).toContain('<strong>bold</strong>')
    })

    it('should render code fences inside an admonition with highlight.js', () => {
        const result = render('!!! info "code"\n    ```js\n    let a = 1;\n    ```')
        expect(result).toContain('admonition info')
        // 代码围栏由 markdown-it 正常解析为 fenced code（不再原样输出裸 ```）
        expect(result).not.toContain('```')
        expect(result).toContain('<code class="language-js">')
    })

    it('should render a tabbed set nested inside an admonition', () => {
        const result = render(
            '!!! note "tabs"\n    === "A"\n        one\n\n    === "B"\n        two'
        )
        expect(result).toContain('admonition note')
        expect(result).toContain('class="tabbed-set tabbed-alternate"')
        expect(result).toContain('data-tabs="1:2"')
        expect(result).toContain('<label for="__tabbed_1_1">A</label>')
        expect(result).toContain('<p>one</p>')
        expect(result).toContain('<p>two</p>')
    })

    it('should render a tabbed set with unindented content (user-friendly fallback)', () => {
        const result = render(
            '=== "计算机"\n\n- 计算机基础\n- 计算机网络\n\n=== "操作系统"\n\n- 进程与线程\n\n## 下一节'
        )
        expect(result.match(/class="tabbed-set tabbed-alternate"/g)).toHaveLength(1)
        expect(result).toContain('data-tabs="1:2"')
        expect(result).toContain('<label for="__tabbed_1_1">计算机</label>')
        expect(result).toContain('<label for="__tabbed_1_2">操作系统</label>')
        expect(result).toContain('<li>计算机基础</li>')
        expect(result).toContain('<li>进程与线程</li>')
        expect(result).toContain('<h2>下一节</h2>')
    })

    it('should render multiple admonitions in one text', () => {
        const result = render('!!! note "a"\n    x\n\n!!! tip "b"\n    y')
        expect(result).toContain('admonition note')
        expect(result).toContain('admonition tip')
        expect(result.match(/admonition-title/g)).toHaveLength(2)
    })

    it('should leave text without admonition syntax unchanged', () => {
        const input = '普通文本\n没有任何语法'
        expect(render(input)).toBe('<p>普通文本<br />\n没有任何语法</p>\n')
    })

    it('should escape HTML in the title', () => {
        const result = render('!!! note "<b>x</b>"\n    y')
        expect(result).toContain('&lt;b&gt;x&lt;/b&gt;')
        expect(result).not.toContain('<b>')
    })

    it('should not swallow following markdown on invalid/empty admonition', () => {
        // 非法标记：回退为普通段落
        expect(render('!!!')).not.toContain('class="admonition ')
        // 空内容：仍产出卡片，后续段落正常解析
        const result = render('!!! note "empty"\n\n后文')
        expect(result).toContain('<p class="admonition-title">empty</p>')
        expect(result).toContain('<p>后文</p>')
    })
})
