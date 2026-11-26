import { describe, expect, it } from 'vitest'
import {
    createEmptyTable,
    parseMarkdownTableAtLine,
    parseMarkdownTableAtOffset,
    serializeMarkdownTable,
    sortMarkdownTableRows,
    transposeMarkdownTable
} from '../../src/renderer/src/components/Markdown/table-markdown'

const TABLE = ['| 名称 | 数量 |', '| :--- | ---: |', '| 苹果 | 3 |', '| 香蕉 | 5 |'].join('\n')

describe('P0 GFM 表格解析/序列化', () => {
    it('解析表头、行与列对齐', () => {
        const table = parseMarkdownTableAtLine(TABLE.split('\n'), 0)
        expect(table).not.toBeNull()
        expect(table).toMatchObject({
            headers: ['名称', '数量'],
            rows: [
                ['苹果', '3'],
                ['香蕉', '5']
            ],
            alignments: ['left', 'right'],
            startLine: 0,
            endLine: 3
        })
    })

    it('根据光标偏移定位所在表格', () => {
        const text = `前言\n\n${TABLE}\n\n后文`
        expect(parseMarkdownTableAtOffset(text, text.indexOf('苹果'))).not.toBeNull()
        expect(parseMarkdownTableAtOffset(text, text.indexOf('后文'))).toBeNull()
    })

    it('CRLF 文档中表格位于多行之后仍能定位（Monaco 模型偏移兼容）', () => {
        const text = `第一段\r\n\r\n第二段\r\n\r\n${TABLE.replace(/\n/g, '\r\n')}\r\n\r\n后文`
        expect(parseMarkdownTableAtOffset(text, text.indexOf('苹果'))).not.toBeNull()
        expect(parseMarkdownTableAtOffset(text, text.indexOf('香蕉'))).not.toBeNull()
    })

    it('长表格（>100 行）光标在后半段仍能定位表头', () => {
        const rows = Array.from({ length: 150 }, (_, index) => `| 行 ${index + 1} | ${index} |`)
        const text = ['| 名称 | 数值 |', '| --- | --- |', ...rows].join('\n')
        expect(parseMarkdownTableAtOffset(text, text.indexOf('行 140'))).not.toBeNull()
    })

    it('支持单元格内转义管道', () => {
        const text = ['| 表达式 | 说明 |', '| --- | --- |', '| a \\| b | 或 |'].join('\n')
        const table = parseMarkdownTableAtLine(text.split('\n'), 0)
        expect(table?.rows[0]).toEqual(['a | b', '或'])
        const serialized = serializeMarkdownTable(table!)
        expect(serialized).toContain('a \\| b')
    })

    it('序列化时保留对齐并重新输出标准管道格式', () => {
        const table = parseMarkdownTableAtLine(TABLE.split('\n'), 0)!
        table.rows.push(['橙子', '2'])
        table.alignments[0] = 'center'
        const serialized = serializeMarkdownTable(table)
        expect(serialized).toContain('| :---: | ---: |')
        expect(serialized.split('\n')).toHaveLength(5)
    })

    it('创建空表格', () => {
        const empty = createEmptyTable(2, 4)
        expect(empty.headers).toHaveLength(4)
        expect(empty.rows).toHaveLength(2)
        expect(empty.alignments.every((alignment) => alignment === 'default')).toBe(true)
    })
})

describe('电子表格能力：多行、排序、转置', () => {
    it('单元格换行序列化为 <br>，解析时还原为换行', () => {
        const table = parseMarkdownTableAtLine(
            ['| A | B |', '| --- | --- |', '| x | 1 |'].join('\n').split('\n'),
            0
        )!
        table.rows[0][0] = '第一行\n第二行'
        const serialized = serializeMarkdownTable(table)
        expect(serialized).toContain('第一行<br>第二行')
        const parsed = parseMarkdownTableAtLine(serialized.split('\n'), 0)
        expect(parsed?.rows[0][0]).toBe('第一行\n第二行')
    })

    it('按列排序整行：数字优先，支持升降序', () => {
        const table = parseMarkdownTableAtLine(
            ['| 名称 | 数量 |', '| --- | --- |', '| A | 10 |', '| B | 2 |', '| C | 30 |']
                .join('\n')
                .split('\n'),
            0
        )!
        const ascending = sortMarkdownTableRows(table, 1, 'asc')
        expect(ascending.rows.map((row) => row[0])).toEqual(['B', 'A', 'C'])
        const descending = sortMarkdownTableRows(table, 1, 'desc')
        expect(descending.rows.map((row) => row[0])).toEqual(['C', 'A', 'B'])
    })

    it('行列互换', () => {
        const table = parseMarkdownTableAtLine(
            ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n').split('\n'),
            0
        )!
        const transposed = transposeMarkdownTable(table)
        expect(transposed.headers).toEqual(['A', '1', '3'])
        expect(transposed.rows).toEqual([['B', '2', '4']])
    })
})
