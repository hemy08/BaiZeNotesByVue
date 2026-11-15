/**
 * PF-15 回归：Admonition 解析「单趟扫描 / 不遗漏 / 不重复处理」。
 *
 * 历史：本文件原守护 preview-local-render.ts 旧实现（while 内全文 replace → 单次扫描 + 回调拼接）
 * 的线性化改造。mkdocs-material 语法修复后，admonition 改由 markdown-it 原生 block rule
 * 单趟 token 化解析（preview-mkdocs-material.ts），本文件改为守护新实现的同等性质：
 * 1. k 个提示块全部渲染、不漏不重（token 数量线性、无嵌套重复扫描）；
 * 2. 嵌套 admonition / 代码块内的 !!! 文本各按 Markdown 语义处理，不会被二次解析；
 * 3. 内容 token 的源码行号回填为整篇文档的绝对行号（目录定位准确，PF-14 依赖）；
 * 4. 多块内容互不串扰、CRLF 文档同样正常。
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { mkdocsMaterialPlugin } from '../../src/renderer/src/components/Markdown/preview-mkdocs-material'

function createMarkdownIt(): InstanceType<typeof MarkdownIt> {
    const md = MarkdownIt({ html: true, xhtmlOut: true, breaks: true })
    md.use(mkdocsMaterialPlugin)
    return md
}

/** 统计输出中 admonition 容器数量 */
function countAdmonitionDivs(html: string): number {
    return (html.match(/<div class="admonition /g) ?? []).length
}

describe('PF-15 新实现：admonition 单趟 token 化解析', () => {
    it('k=100 个提示块全部渲染（单趟扫描不跳过后续匹配）', () => {
        const blocks = Array.from(
            { length: 100 },
            (_, index) => `!!! tip "块${index}"\n    内容${index}`
        )
        const result = createMarkdownIt().render(blocks.join('\n\n'))

        expect(countAdmonitionDivs(result)).toBe(100)
        expect(result.match(/admonition-title/g)).toHaveLength(100)
        // 首尾块都在（避免只处理前 N 个的截断回归）
        expect(result).toContain('<p class="admonition-title">块0</p>')
        expect(result).toContain('<p class="admonition-title">块99</p>')
    })

    it('token 数量随块数线性增长（无重复解析/重复 token）', () => {
        const md = createMarkdownIt()
        // 每个提示块：admonition_open + paragraph_open + inline + paragraph_close + admonition_close
        for (const count of [1, 10, 100]) {
            const blocks = Array.from(
                { length: count },
                (_, index) => `!!! note "块${index}"\n    内容${index}`
            )
            const tokens = md.parse(blocks.join('\n\n'), {})
            expect(tokens, `count=${count}`).toHaveLength(count * 5)
        }
    })

    it('嵌套提示块按 Markdown 语义渲染为两层（不在原文上二次 replace）', () => {
        const result = createMarkdownIt().render('!!! note "a"\n    !!! tip "inner"\n        y')

        // 外层 + 内层各一个容器：嵌套由 markdown-it 递归解析，而非对生成 HTML 再扫描
        expect(countAdmonitionDivs(result)).toBe(2)
        expect(result).toContain('<div class="admonition note">')
        expect(result).toContain('<div class="admonition tip">')
        expect(result).toContain('<p>y</p>')
    })

    it('代码块内的 !!! 文本保持源码显示，不生成嵌套容器', () => {
        const result = createMarkdownIt().render(
            ['!!! note "a"', '    ```text', '    !!! tip "inner"', '    ```'].join('\n')
        )

        expect(countAdmonitionDivs(result)).toBe(1)
        expect(result).toContain('!!! tip &quot;inner&quot;')
    })

    it('互相独立的多块内容不会串扰（每个块的标题/内容对应正确）', () => {
        const input = [
            '!!! note "第一块"',
            '    body-one',
            '',
            '!!! warning "第二块"',
            '    body-two',
            '',
            '!!! tip "第三块"',
            '    body-three'
        ].join('\n')

        const result = createMarkdownIt().render(input)

        expect(result).toContain('admonition note')
        expect(result).toContain('admonition warning')
        expect(result).toContain('admonition tip')
        const firstIndex = result.indexOf('第一块')
        const secondIndex = result.indexOf('第二块')
        const thirdIndex = result.indexOf('第三块')
        expect(firstIndex).toBeGreaterThanOrEqual(0)
        expect(secondIndex).toBeGreaterThan(firstIndex)
        expect(thirdIndex).toBeGreaterThan(secondIndex)
        expect(result).toContain('<p>body-one</p>')
        expect(result).toContain('<p>body-two</p>')
        expect(result).toContain('<p>body-three</p>')
    })

    it('内容 token 的源码行号回填为绝对行号（目录定位 PF-14）', () => {
        const md = createMarkdownIt()
        const tokens = md.parse(['!!! note "t"', '    ## 子标题', '', '后文'].join('\n'), {})
        const heading = tokens.find((token) => token.type === 'heading_open')

        expect(heading).toBeDefined()
        // 子标题位于整篇文档第 2 行（0 起始为 1），而非拆分后的第 1 行
        expect(heading?.map?.[0]).toBe(1)
        // admonition 容器覆盖头部行到块结束（含块尾空行，end 为独占行号）
        const admonition = tokens.find((token) => token.type === 'mkdocs_admonition_open')
        expect(admonition?.map).toEqual([0, 3])
    })

    it('CRLF 文本文档同样渲染两个块（markdown-it 归一化换行）', () => {
        const result = createMarkdownIt().render(
            '!!! note "提示"\r\n    这是内容\r\n\r\n!!! tip "b"\r\n    y'
        )

        expect(countAdmonitionDivs(result)).toBe(2)
        expect(result).toContain('<p class="admonition-title">提示</p>')
        expect(result).toContain('<p class="admonition-title">b</p>')
    })
})
