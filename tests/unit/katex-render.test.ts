import { describe, it, expect } from 'vitest'
import { katexRenderToString, katexRenderMathInText } from '../../src/main/renders/KatexRender'

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