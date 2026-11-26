import { describe, expect, it } from 'vitest'
import {
    detectInlineMarkdownFormats,
    planInlineMarkdownFormat
} from '../../src/renderer/src/components/Markdown/editor-markdown-format'

describe('P0 内联 Markdown 格式计划', () => {
    it('选中文本包裹，再次应用去掉标记', () => {
        const text = 'hello world'
        const planned = planInlineMarkdownFormat(text, 0, 5, 'bold')
        expect(planned).toMatchObject({
            replacement: '**hello**',
            selectionStart: 2,
            selectionEnd: 7
        })
        const applied =
            text.slice(0, planned.replaceStart) +
            planned.replacement +
            text.slice(planned.replaceEnd)
        const removed = planInlineMarkdownFormat(
            applied,
            planned.selectionStart,
            planned.selectionEnd,
            'bold'
        )
        expect(removed.replacement).toBe('hello')
        expect(removed.selectionStart).toBe(0)
        expect(removed.selectionEnd).toBe(5)
    })

    it('选区两侧已有标记时去掉标记', () => {
        const text = 'a **hello** b'
        const planned = planInlineMarkdownFormat(text, 4, 9, 'bold')
        expect(text.slice(planned.replaceStart, planned.replaceEnd)).toBe('**hello**')
        expect(planned.replacement).toBe('hello')
        expect(planned.selectionStart).toBe(2)
        expect(planned.selectionEnd).toBe(7)
    })

    it('光标在词上时选中该词并包裹', () => {
        const text = 'hello world'
        const planned = planInlineMarkdownFormat(text, 8, 8, 'italic')
        expect(text.slice(planned.replaceStart, planned.replaceEnd)).toBe('world')
        expect(planned.replacement).toBe('*world*')
        expect(planned.selectionStart).toBe(7)
        expect(planned.selectionEnd).toBe(12)
    })

    it('空光标无词时插入成对标记，斜体只插入 * 而非 **', () => {
        const planned = planInlineMarkdownFormat('', 0, 0, 'italic')
        expect(planned.replacement).toBe('**')
        expect(planned.selectionStart).toBe(1)
        expect(planned.selectionEnd).toBe(1)
        const code = planInlineMarkdownFormat('abc ', 4, 4, 'code')
        expect(code.replacement).toBe('``')
        expect(code.selectionStart).toBe(5)
    })

    it('粗体文字上点斜体/斜体文字上点粗体组合为粗斜体', () => {
        const boldText = '**hello**'
        const italic = planInlineMarkdownFormat(boldText, 2, 7, 'italic')
        expect(italic.replacement).toBe('***hello***')
        expect(italic.replaceStart).toBe(0)
        expect(italic.replaceEnd).toBe(9)

        const italicText = '*hello*'
        const bold = planInlineMarkdownFormat(italicText, 1, 6, 'bold')
        expect(bold.replacement).toBe('***hello***')
        expect(bold.replaceStart).toBe(0)
        expect(bold.replaceEnd).toBe(7)
    })
    it('检测选区/词周围格式状态', () => {
        expect(detectInlineMarkdownFormats('**hello**', 2, 7)).toMatchObject({
            bold: true,
            italic: false
        })
        expect(detectInlineMarkdownFormats('~~x~~', 2, 3)).toMatchObject({ strike: true })
        expect(detectInlineMarkdownFormats('`x`', 1, 2)).toMatchObject({ code: true })
        expect(detectInlineMarkdownFormats('plain', 0, 5)).toMatchObject({
            bold: false,
            italic: false,
            strike: false,
            code: false
        })
    })
})
