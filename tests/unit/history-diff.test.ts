/**
 * A3 行级 diff 适配层单测（node 环境，纯函数）
 *
 * 覆盖：
 * - 无差异 / 纯新增 / 纯删除 / 混合变更的行号与统计；
 * - 空文本语义（空文本 = 0 行，而非一个空行）；
 * - 上下文折叠（变更附近保留 N 行，其余折叠为 gap 行）；
 * - 展示行数上限降级（仅保留变更行 + 截断 gap）；
 * - 超大输入降级（tooLarge=true，不抛错）；
 * - 行号构建与统计函数。
 */
import { describe, it, expect } from 'vitest'
import {
    HISTORY_DIFF_DEFAULT_CONTEXT_LINES,
    buildNumberedDiffLines,
    computeHistoryDiff,
    countHistoryDiffStats,
    createEmptyHistoryDiffStats,
    foldHistoryDiffRows
} from '../../src/renderer/src/components/Markdown/history/history-diff'
import { diffLines } from '../../src/renderer/src/components/PluginTools/TextTools/text-diff-lib'

describe('countHistoryDiffStats / buildNumberedDiffLines', () => {
    it('统计 equal/add/remove 并给两侧行号', () => {
        const diff = diffLines('a\nb\nc', 'a\nc')
        const stats = countHistoryDiffStats(diff)
        expect(stats).toEqual({ added: 0, removed: 1, unchanged: 2, changed: true })

        const rows = buildNumberedDiffLines(diff)
        expect(rows).toEqual([
            { kind: 'line', type: 'equal', oldLine: 1, newLine: 1, text: 'a' },
            { kind: 'line', type: 'remove', oldLine: 2, newLine: null, text: 'b' },
            { kind: 'line', type: 'equal', oldLine: 3, newLine: 2, text: 'c' }
        ])
    })

    it('空文本统计为全 0（changed=false）', () => {
        expect(countHistoryDiffStats([])).toEqual(createEmptyHistoryDiffStats())
        expect(createEmptyHistoryDiffStats().changed).toBe(false)
    })

    it('纯新增行 newLine 连续、oldLine 为 null', () => {
        const rows = buildNumberedDiffLines(diffLines('', 'x\ny'))
        expect(rows).toEqual([
            { kind: 'line', type: 'add', oldLine: null, newLine: 1, text: 'x' },
            { kind: 'line', type: 'add', oldLine: null, newLine: 2, text: 'y' }
        ])
    })
})

describe('foldHistoryDiffRows 上下文折叠', () => {
    /** 构造 20 行相同、第 11 行变化的 diff 行 */
    function buildLongRows(): ReturnType<typeof buildNumberedDiffLines> {
        const oldLines = Array.from({ length: 20 }, (_, index) => `line-${index + 1}`)
        const newLines = [...oldLines]
        newLines[10] = 'changed'
        return buildNumberedDiffLines(diffLines(oldLines.join('\n'), newLines.join('\n')))
    }

    it('默认上下文 3 行：中间未变更行折叠为 gap，变更附近保留', () => {
        const folded = foldHistoryDiffRows(buildLongRows(), HISTORY_DIFF_DEFAULT_CONTEXT_LINES)
        // 首尾各有一个 gap，中间变更行 + 前后各 3 行上下文（另有 2 行变更）
        expect(folded[0]).toEqual({ kind: 'gap', hiddenLines: 7 })
        expect(folded[folded.length - 1]).toEqual({ kind: 'gap', hiddenLines: 6 })
        const lineRows = folded.filter((row) => row.kind === 'line')
        expect(lineRows).toHaveLength(8)
        expect(lineRows.some((row) => row.kind === 'line' && row.type === 'remove')).toBe(true)
        expect(lineRows.some((row) => row.kind === 'line' && row.type === 'add')).toBe(true)
    })

    it('上下文 0：只保留变更行，前后未变更行各自折叠', () => {
        const folded = foldHistoryDiffRows(buildLongRows(), 0)
        expect(folded).toEqual([
            { kind: 'gap', hiddenLines: 10 },
            { kind: 'line', type: 'remove', oldLine: 11, newLine: null, text: 'line-11' },
            { kind: 'line', type: 'add', oldLine: null, newLine: 11, text: 'changed' },
            { kind: 'gap', hiddenLines: 9 }
        ])
    })

    it('完全无差异时全部折叠为单个 gap', () => {
        const rows = buildNumberedDiffLines(diffLines('a\nb', 'a\nb'))
        expect(foldHistoryDiffRows(rows, 3)).toEqual([{ kind: 'gap', hiddenLines: 2 }])
    })
})

describe('computeHistoryDiff', () => {
    it('完全一致：changed=false，rows 为单个 gap', () => {
        const result = computeHistoryDiff('# 标题\n\n正文', '# 标题\n\n正文')
        expect(result.tooLarge).toBe(false)
        expect(result.truncated).toBe(false)
        expect(result.stats.changed).toBe(false)
        expect(result.rows).toEqual([{ kind: 'gap', hiddenLines: 3 }])
    })

    it('历史版本为空：当前内容全部为 add', () => {
        const result = computeHistoryDiff('', 'a\nb')
        expect(result.stats).toEqual({ added: 2, removed: 0, unchanged: 0, changed: true })
        const lineRows = result.rows.filter((row) => row.kind === 'line')
        expect(lineRows).toHaveLength(2)
        expect(lineRows.every((row) => row.kind === 'line' && row.type === 'add')).toBe(true)
    })

    it('当前内容为空：历史版本全部为 remove', () => {
        const result = computeHistoryDiff('a\nb', '')
        expect(result.stats.removed).toBe(2)
        expect(result.rows.some((row) => row.kind === 'line' && row.type === 'remove')).toBe(true)
    })

    it('混合增删：统计正确且行号两侧对齐', () => {
        const result = computeHistoryDiff(
            ['# 标题', '第一段', '第二段', '结尾'].join('\n'),
            ['# 标题', '第一段（改）', '结尾', '新增'].join('\n')
        )
        expect(result.stats.added).toBe(2)
        expect(result.stats.removed).toBe(2)
        const lineRows = result.rows.filter((row) => row.kind === 'line')
        for (const row of lineRows) {
            if (row.kind !== 'line') {
                continue
            }
            if (row.type === 'remove') {
                expect(row.newLine).toBeNull()
            } else if (row.type === 'add') {
                expect(row.oldLine).toBeNull()
            } else {
                expect(row.oldLine).not.toBeNull()
                expect(row.newLine).not.toBeNull()
            }
        }
    })

    it('展示行数超 maxRows 时降级为仅变更行并标记 truncated', () => {
        const oldText = Array.from({ length: 100 }, (_, index) => `old-${index}`).join('\n')
        const newText = Array.from({ length: 100 }, (_, index) => `new-${index}`).join('\n')
        const result = computeHistoryDiff(oldText, newText, { maxRows: 10 })
        expect(result.truncated).toBe(true)
        expect(result.stats.added).toBe(100)
        expect(result.stats.removed).toBe(100)
        // 10 行变更 + 1 行截断提示
        expect(result.rows).toHaveLength(11)
        expect(result.rows[result.rows.length - 1]).toEqual({
            kind: 'gap',
            hiddenLines: 190
        })
    })

    it('大文档输入降级为 tooLarge（不抛错）', () => {
        const huge = 'line\n'.repeat(80_000)
        const result = computeHistoryDiff(huge, huge)
        expect(result.tooLarge).toBe(true)
        expect(result.rows).toEqual([])
        expect(result.stats).toEqual(createEmptyHistoryDiffStats())
    })
})
