import { describe, expect, it } from 'vitest'
import {
    createEmptyTable,
    parseMarkdownTableAtLine,
    parseMarkdownTableAtOffset,
    serializeMarkdownTable
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
