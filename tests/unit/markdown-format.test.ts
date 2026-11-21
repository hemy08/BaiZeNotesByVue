/**
 * A4 Markdown 安全格式化单测（node 环境，纯函数）
 *
 * 覆盖：
 * - 行尾空格 / 连续空行 / 标题、围栏、列表前后空行 / 裸围栏补语言；
 * - 幂等（format(format(x)) === format(x)）；
 * - 安全边界：front matter 原样、围栏内部逐字保留、缩进围栏（列表内）不插空行、
 *   标题层级/表格结构不修改、换行风格（CRLF）保留、空文本/无尾换行原样。
 */
import { describe, it, expect } from 'vitest'
import {
    formatMarkdown,
    lintMarkdown
} from '../../src/renderer/src/components/Markdown/lint/markdown-lint'

/** 反复格式化的便捷断言 */
function expectIdempotent(markdown: string): string {
    const once = formatMarkdown(markdown)
    const twice = formatMarkdown(once)
    expect(twice).toBe(once)
    return once
}

describe('安全修复项', () => {
    it('去除行尾空格（围栏内部保留）', () => {
        expect(formatMarkdown('a  \nb\t\n')).toBe('a\nb\n')
        const fenced = '```js\ncode  \n```\n'
        expect(formatMarkdown(fenced)).toBe(fenced)
    })

    it('折叠连续空行为单空行', () => {
        expect(formatMarkdown('a\n\n\n\nb\n')).toBe('a\n\nb\n')
        expect(formatMarkdown('a\n   \n\t\nb\n')).toBe('a\n\nb\n')
    })

    it('标题前后补空行（首行前/末行后不补）', () => {
        expect(formatMarkdown('前言\n# 标题\n正文\n')).toBe('前言\n\n# 标题\n\n正文\n')
        expect(formatMarkdown('# 标题\n正文\n')).toBe('# 标题\n\n正文\n')
        expect(formatMarkdown('前言\n# 标题\n')).toBe('前言\n\n# 标题\n')
    })

    it('代码围栏前后补空行并补语言标识', () => {
        expect(formatMarkdown('前言\n```\ncode\n```\n正文\n')).toBe(
            '前言\n\n```text\ncode\n```\n\n正文\n'
        )
        expect(formatMarkdown('```js\ncode\n```\n')).toBe('```js\ncode\n```\n')
    })

    it('列表前后补空行（块内空行保留）', () => {
        expect(formatMarkdown('前言\n- a\n- b\n正文\n')).toBe('前言\n\n- a\n- b\n\n正文\n')
        expect(formatMarkdown('- a\n\n- b\n')).toBe('- a\n\n- b\n')
    })

    it('多个问题叠加一次修复完成', () => {
        const input = '# A\n正文  \n\n\n\n```js\ncode\n```\n- a\n- b\n结尾  \n'
        expect(expectIdempotent(input)).toBe(
            '# A\n\n正文\n\n```js\ncode\n```\n\n- a\n- b\n\n结尾\n'
        )
    })
})

describe('安全边界（不修改的内容）', () => {
    it('front matter 原样保留（含行尾空格与多空行），仅在其后补标题空行', () => {
        const input = '---\ntitle: demo  \n\ntags: [a]\n---\n# 标题\n'
        expect(formatMarkdown(input)).toBe('---\ntitle: demo  \n\ntags: [a]\n---\n\n# 标题\n')
    })

    it('围栏内部内容逐字保留（行尾空格、连续空行、围栏语言内容）', () => {
        const input = '前言\n\n```text\ncode  \n\n\n\nmore\n```\n'
        expect(formatMarkdown(input)).toBe(input)
    })

    it('缩进围栏（列表内）不插空行、不改语言（避免改变列表归属）', () => {
        const input = '- 列表项\n  ```js\n  code\n  ```\n'
        expect(formatMarkdown(input)).toBe(input)
    })

    it('缩进裸围栏只补语言、不插入空行', () => {
        const input = '- 列表项\n  ```\n  code\n  ```\n'
        // 裸围栏补 text 属于安全修复（仅影响高亮），但缩进围栏前后不补空行
        expect(formatMarkdown(input)).toBe('- 列表项\n  ```text\n  code\n  ```\n')
    })

    it('不修改标题层级与表格结构', () => {
        const headings = '# A\n### B\n'
        expect(formatMarkdown(headings)).toBe('# A\n\n### B\n')
        const table = 'x\n| a | b |\n| --- | x |\n'
        expect(formatMarkdown(table)).toBe(table)
    })

    it('CRLF 换行风格保留', () => {
        const formatted = formatMarkdown('# A\r\n正文  \r\n')
        expect(formatted).toBe('# A\r\n\r\n正文\r\n')
        expect(formatted.includes('\r\n')).toBe(true)
        expect(/(?<!\r)\n/.test(formatted)).toBe(false)
    })

    it('空文本/无尾换行输入原样语义', () => {
        expect(formatMarkdown('')).toBe('')
        expect(formatMarkdown('a')).toBe('a')
        expect(formatMarkdown('a  ')).toBe('a')
        expect(formatMarkdown('a\n')).toBe('a\n')
    })
})

describe('幂等性', () => {
    const samples: string[] = [
        '',
        'text',
        '# 标题',
        '前言\n## 标题\n正文',
        '前言\n\n```\ncode\n```\n\n正文\n',
        '---\ntitle: x\n---\n# H\n- a\n- b\n',
        'a\n\n\n\nb  \n',
        '- a\n  - b\n\n正文',
        '| a | b |\n| --- | --- |\n| 1 | 2 |',
        '> 引用\n> 第二行\n\n## 标题\n',
        '~~~\ncode\n~~~',
        '   ## 缩进标题\n正文\n'
    ]

    it('任意样例二次格式化结果不变', () => {
        for (const sample of samples) {
            expectIdempotent(sample)
        }
    })

    it('格式化后再 lint：可自动修复的问题应清零（不可修复规则除外）', () => {
        const input = '# A\n正文  \n\n\n\n```\ncode\n```\n- a\n- b\n'
        const formatted = formatMarkdown(input)
        const remaining = lintMarkdown(formatted).filter((issue) => issue.fix !== undefined)
        expect(remaining).toEqual([])
    })
})
