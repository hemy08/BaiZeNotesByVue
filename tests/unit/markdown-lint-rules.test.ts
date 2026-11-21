/**
 * A4 Markdown lint 规则单测（node 环境，纯函数）
 *
 * 覆盖 9 条规则的正常/边界/误报防护：
 * MD001 标题层级跳跃、MD009 行尾空格、MD012 连续空行、MD022 标题前后空行、
 * MD031 代码围栏前后空行、MD032 列表前后空行、MD040 围栏语言、
 * MD056 表格列数、MDT001 表格分隔行；以及 front matter / 围栏内豁免、大文档跳过、
 * 汇总统计（规则统计/严重级别/可修复数）与问题排序。
 */
import { describe, it, expect } from 'vitest'
import {
    MARKDOWN_LINT_MAX_INPUT_CHARS,
    MARKDOWN_LINT_RULES,
    MARKDOWN_LINT_RULE_MESSAGE_KEYS,
    lintMarkdown,
    summarizeMarkdownLint
} from '../../src/renderer/src/components/Markdown/lint/markdown-lint'

/** 取某规则的问题列表 */
function issuesOfRule(testMarkdown: string, ruleId: string): ReturnType<typeof lintMarkdown> {
    return lintMarkdown(testMarkdown).filter((issue) => issue.ruleId === ruleId)
}

describe('MD001 标题层级跳跃', () => {
    it('H1 → H3 报一次，参数为前一级/当前级', () => {
        const issues = issuesOfRule('# 一级\n\n### 三级', 'MD001')
        expect(issues).toHaveLength(1)
        expect(issues[0].line).toBe(3)
        expect(issues[0].column).toBe(1)
        expect(issues[0].messageParams).toEqual({ previous: 1, current: 3 })
        expect(issues[0].fix).toBeUndefined()
    })

    it('逐级递增、降级、首个标题为 H3 均不报', () => {
        expect(issuesOfRule('# a\n\n## b\n\n### c', 'MD001')).toEqual([])
        expect(issuesOfRule('## a\n\n### b', 'MD001')).toEqual([])
        expect(issuesOfRule('### 首个标题', 'MD001')).toEqual([])
        expect(issuesOfRule('## a\n\n# b\n\n### c', 'MD001')).toHaveLength(1)
    })
})

describe('MD009 行尾空格', () => {
    it('报出第一个多余空格位置并按行排序', () => {
        const issues = issuesOfRule('a  \nbc \n', 'MD009')
        expect(issues).toHaveLength(2)
        expect(issues[0]).toMatchObject({ ruleId: 'MD009', line: 1, column: 2 })
        expect(issues[1]).toMatchObject({ ruleId: 'MD009', line: 2, column: 3 })
        expect(issues[0].fix).toEqual({ kind: 'trailing-spaces' })
    })

    it('空白行上的多余空格同样报出（可被格式化清除）', () => {
        const issues = issuesOfRule('a\n   \nb', 'MD009')
        expect(issues).toHaveLength(1)
        expect(issues[0]).toMatchObject({ line: 2, column: 1 })
    })

    it('代码围栏内部与 front matter 内不报（保护代码示例与元数据）', () => {
        const fenced = '```\ncode  \n```\n'
        expect(issuesOfRule(fenced, 'MD009')).toEqual([])
        const frontMatter = '---\ntitle: demo  \n---\n\n正文\n'
        expect(issuesOfRule(frontMatter, 'MD009')).toEqual([])
    })
})

describe('MD012 连续空行', () => {
    it('连续 3 个空行从第 2 个起逐行报', () => {
        const issues = issuesOfRule('a\n\n\n\nb\n', 'MD012')
        expect(issues.map((issue) => issue.line)).toEqual([3, 4])
        expect(issues[0].fix).toEqual({ kind: 'multiple-blanks' })
    })

    it('单个空行不报；围栏内部空行不参与统计', () => {
        expect(issuesOfRule('a\n\nb', 'MD012')).toEqual([])
        expect(issuesOfRule('```\na\n\n\n\nb\n```\n', 'MD012')).toEqual([])
    })
})

describe('MD022 标题前后空行', () => {
    it('标题前/后缺空行各报一次（同一标题合并为一条）', () => {
        const issues = issuesOfRule('前言\n# 标题\n正文\n', 'MD022')
        expect(issues).toHaveLength(1)
        expect(issues[0].line).toBe(2)
        expect(issues[0].fix).toEqual({ kind: 'blanks-around-headings' })
    })

    it('标题前后已有空行/位于首行/末行不报', () => {
        expect(issuesOfRule('# 标题\n\n正文\n', 'MD022')).toEqual([])
        expect(issuesOfRule('前言\n\n# 标题\n', 'MD022')).toEqual([])
        expect(issuesOfRule('# 标题\n', 'MD022')).toEqual([])
    })
})

describe('MD031 / MD040 代码围栏', () => {
    it('围栏前后缺空行报 MD031；缺语言标识报 MD040（error 级）', () => {
        const issues = lintMarkdown('前言\n```\ncode\n```\n正文\n')
        const md031 = issues.filter((issue) => issue.ruleId === 'MD031')
        const md040 = issues.filter((issue) => issue.ruleId === 'MD040')
        expect(md031).toHaveLength(1)
        expect(md031[0].line).toBe(2)
        expect(md031[0].fix).toEqual({ kind: 'blanks-around-fences' })
        expect(md040).toHaveLength(1)
        expect(md040[0].line).toBe(2)
        expect(md040[0].severity).toBe('error')
        expect(md040[0].fix).toEqual({ kind: 'fenced-code-language' })
    })

    it('有语言标识/前后空行/文档首末围栏不报', () => {
        expect(issuesOfRule('前言\n\n```js\ncode\n```\n\n正文\n', 'MD031')).toEqual([])
        expect(issuesOfRule('```js\ncode\n```\n', 'MD040')).toEqual([])
        expect(issuesOfRule('~~~markdown\n~~~\n', 'MD040')).toEqual([])
    })

    it('缩进围栏（列表内）不报 MD031（插空行会改变列表归属）', () => {
        const text = '- 列表项\n  ```js\n  code\n  ```\n'
        expect(issuesOfRule(text, 'MD031')).toEqual([])
        expect(issuesOfRule(text, 'MD040')).toEqual([])
    })

    it('未闭合围栏不崩溃，且只检查开围栏前的空行', () => {
        const issues = lintMarkdown('前言\n```js\ncode\n')
        expect(issues.filter((issue) => issue.ruleId === 'MD031')).toHaveLength(1)
        expect(issues.filter((issue) => issue.ruleId === 'MD040')).toEqual([])
    })
})

describe('MD032 列表前后空行', () => {
    it('列表紧贴前后段落各报一次（同块合并）', () => {
        const issues = issuesOfRule('前言\n- a\n- b\n正文\n', 'MD032')
        expect(issues).toHaveLength(1)
        expect(issues[0].line).toBe(2)
        expect(issues[0].fix).toEqual({ kind: 'blanks-around-lists' })
    })

    it('列表前后已有空行/文档首末/块内空行不报', () => {
        expect(issuesOfRule('前言\n\n- a\n- b\n\n正文\n', 'MD032')).toEqual([])
        expect(issuesOfRule('- a\n- b\n', 'MD032')).toEqual([])
        expect(issuesOfRule('- a\n\n- b\n', 'MD032')).toEqual([])
    })

    it('嵌套列表（缩进续行）视为同一块，不误报内部空行', () => {
        expect(issuesOfRule('前言\n\n- a\n  - b\n\n正文\n', 'MD032')).toEqual([])
    })
})

describe('MD056 / MDT001 表格', () => {
    it('合法表格不报', () => {
        expect(lintMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n')).toEqual([])
        expect(lintMarkdown('a | b\n--- | ---\n1 | 2\n')).toEqual([])
    })

    it('分隔行单元格格式非法报 MDT001', () => {
        const issues = lintMarkdown('| a | b |\n| --- | x |\n| 1 | 2 |\n')
        const mdt = issues.filter((issue) => issue.ruleId === 'MDT001')
        expect(mdt).toHaveLength(1)
        expect(mdt[0].line).toBe(2)
        expect(mdt[0].fix).toBeUndefined()
    })

    it('分隔行列数与表头不一致报 MD056', () => {
        const issues = lintMarkdown('| a | b |\n| --- |\n')
        const md056 = issues.filter((issue) => issue.ruleId === 'MD056')
        expect(md056).toHaveLength(1)
        expect(md056[0].line).toBe(2)
    })

    it('表格主体行列数与表头不一致逐行报 MD056', () => {
        const issues = lintMarkdown('| a | b |\n| --- | --- |\n| 1 |\n| 1 | 2 |\n')
        const md056 = issues.filter((issue) => issue.ruleId === 'MD056')
        expect(md056).toHaveLength(1)
        expect(md056[0].line).toBe(3)
    })

    it('普通含管道段落不误报（无分隔行特征）', () => {
        expect(lintMarkdown('使用 a | b 表示并列\n-- 不是分隔行 --\n')).toEqual([])
    })
})

describe('lintMarkdown 边界与汇总', () => {
    it('空文本/超大文本返回空数组（大文档由调用方提示跳过）', () => {
        expect(lintMarkdown('')).toEqual([])
        expect(lintMarkdown('x'.repeat(MARKDOWN_LINT_MAX_INPUT_CHARS + 1))).toEqual([])
    })

    it('CRLF 文本行号按逻辑行计算', () => {
        const issues = issuesOfRule('# A\r\n### B', 'MD001')
        expect(issues).toHaveLength(1)
        expect(issues[0].line).toBe(2)
    })

    it('结果按 行 → 列 → 规则 id 排序，规则元数据覆盖全部规则', () => {
        const issues = lintMarkdown('# A\n正文  \n```\ncode\n```\n')
        expect([...issues].sort((left, right) => left.line - right.line)).toEqual(issues)
        expect(MARKDOWN_LINT_RULES).toHaveLength(9)
        for (const rule of MARKDOWN_LINT_RULES) {
            expect(MARKDOWN_LINT_RULE_MESSAGE_KEYS[rule.id]).toMatch(
                /^editorUi\.markdownLint\.rules\.[A-Za-z]+$/
            )
        }
    })

    it('summarizeMarkdownLint：总数/错误/警告/可修复数/规则统计（按数量降序）', () => {
        const issues = lintMarkdown(
            ['# A', '正文  ', '', '', '', '### B', '更多  ', '', '```', 'code', '```'].join('\n')
        )
        const summary = summarizeMarkdownLint(issues)
        expect(summary.total).toBe(issues.length)
        expect(summary.errors + summary.warnings).toBe(summary.total)
        expect(summary.errors).toBe(1) // MD040
        const md009 = summary.ruleStats.find((stat) => stat.ruleId === 'MD009')
        expect(md009?.count).toBe(2)
        for (let index = 1; index < summary.ruleStats.length; index++) {
            expect(summary.ruleStats[index - 1].count).toBeGreaterThanOrEqual(
                summary.ruleStats[index].count
            )
        }
        expect(summary.fixable).toBeGreaterThan(0)
    })

    it('summarizeMarkdownLint：空问题列表返回全 0', () => {
        expect(summarizeMarkdownLint([])).toEqual({
            total: 0,
            errors: 0,
            warnings: 0,
            fixable: 0,
            ruleStats: []
        })
    })
})
