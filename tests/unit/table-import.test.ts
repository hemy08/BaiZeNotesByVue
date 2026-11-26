// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
    matrixToImportedTable,
    parseCsvText,
    parseXlsxFile
} from '../../src/renderer/src/components/dialogs/medium/table-editor/table-import'

describe('表格导入：CSV 解析', () => {
    it('解析逗号、引号、换行和转义引号', () => {
        const rows = parseCsvText('名称,数量\r\n"苹果,红富士",3\r\n"带""引号""",5\r\n')
        expect(rows).toEqual([
            ['名称', '数量'],
            ['苹果,红富士', '3'],
            ['带"引号"', '5']
        ])
    })

    it('去除 BOM，兼容 LF/CRLF', () => {
        expect(parseCsvText('\uFEFFa,b\n1,2')).toEqual([
            ['a', 'b'],
            ['1', '2']
        ])
    })

    it('矩阵转表格：首行表头、补齐列、去掉尾部空行', () => {
        const table = matrixToImportedTable([['A', 'B'], ['1'], ['', '']])
        expect(table.headers).toEqual(['A', 'B'])
        expect(table.rows).toEqual([['1', '']])
    })

    it('空文件返回空表格', () => {
        expect(matrixToImportedTable([])).toEqual({ headers: [], rows: [] })
        expect(matrixToImportedTable([['', '']])).toEqual({ headers: [], rows: [] })
    })
})

describe('表格导入：XLSX 解析', () => {
    it('读取首个工作表的共享字符串与数字单元格', async () => {
        const zip = new JSZip()
        zip.file(
            'xl/sharedStrings.xml',
            '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>姓名</t></si><si><t>年龄</t></si><si><t>张三</t></si></sst>'
        )
        zip.file(
            'xl/worksheets/sheet1.xml',
            '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>20</v></c></row></sheetData></worksheet>'
        )
        const buffer = await zip.generateAsync({ type: 'uint8array' })
        const file = {
            name: 'data.xlsx',
            arrayBuffer: async () =>
                buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        } as unknown as File
        const table = await parseXlsxFile(file)
        expect(table.headers).toEqual(['姓名', '年龄'])
        expect(table.rows).toEqual([['张三', '20']])
    })
})
