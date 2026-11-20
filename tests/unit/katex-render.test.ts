/**
 * KaTeX 渲染单元测试（PF-02：已迁移至渲染层 preview-local-render.ts）
 * 覆盖：LaTeX → HTML、非法公式降级、行内/块级/数学代码块、反引号内公式不渲染、无公式透传
 *
 * P1-8（KaTeX 按需加载）：katex 已改为动态 import，直接调用渲染函数前必须先
 * `await EnsurePreviewKatexLoaded()`（预览组件在渲染前完成同一步骤）；本文件验证真实
 * KaTeX 渲染输出，因此在 beforeAll 中显式加载一次。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
    EnsurePreviewKatexLoaded,
    IsPreviewKatexLoaded,
    katexRenderToString,
    katexRenderMathInText
} from '../../src/renderer/src/components/Markdown/preview-local-render'

beforeAll(async () => {
    // 真实 KaTeX：加载一次后整个文件复用（模块级实例）
    expect(await EnsurePreviewKatexLoaded('$x^2$')).toBe(true)
    expect(IsPreviewKatexLoaded()).toBe(true)
})

describe('KatexRender', () => {
    describe('katexRenderToString', () => {
        it('should render simple LaTeX to HTML', () => {
            const result = katexRenderToString('x^2')
            expect(result).toContain('katex')
            expect(result).toContain('x')
        })

        it('should return original text on invalid LaTeX', () => {
            const result = katexRenderToString('\\invalid{')
            expect(result).toBe('\\invalid{')
        })
    })

    describe('katexRenderMathInText', () => {
        it('should render inline math with single $', () => {
            const result = katexRenderMathInText('hello $x^2$ world')
            expect(result).toContain('katex')
            expect(result).toContain('hello')
            expect(result).toContain('world')
        })

        it('should render block math with double $$', () => {
            const result = katexRenderMathInText('text $$x^2$$ end')
            expect(result).toContain('katex-math-block')
            expect(result).toContain('text')
            expect(result).toContain('end')
        })

        it('should render math code block', () => {
            const result = katexRenderMathInText('```math\nx^2\n```')
            expect(result).toContain('katex-code-block')
        })

        it('should render katex code block', () => {
            const result = katexRenderMathInText('```katex\nx^2\n```')
            expect(result).toContain('katex-code-block')
        })

        it('should render latex code block', () => {
            const result = katexRenderMathInText('```latex\nx^2\n```')
            expect(result).toContain('katex-code-block')
        })

        it('should not render math inside backticks', () => {
            const result = katexRenderMathInText('`$x^2$`')
            expect(result).not.toContain('katex')
        })

        it('should handle text without any math', () => {
            const result = katexRenderMathInText('just plain textBaiZe text')
            expect(result).toBe('just plain textBaiZe text')
        })
    })
})
