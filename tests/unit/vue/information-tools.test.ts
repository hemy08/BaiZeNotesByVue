// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import HttpStatusCode from '@renderer/components/PluginTools/Informations/HttpStatusCode.vue'
import FileNameExtension from '@renderer/components/PluginTools/Informations/FileNameExtension.vue'
import GreeceLetter from '@renderer/components/PluginTools/Informations/GreeceLetter.vue'
import NumericCase from '@renderer/components/PluginTools/Informations/NumericCase.vue'

import {
    HTTPStatusCodeTable,
    HTMLMimeTypeTable,
    GreeceLetterTable,
    NumericCaseTable
} from '@renderer/components/PluginTools/Informations/Information'

describe('HttpStatusCode', () => {
    function mountHttp() {
        return mount(HttpStatusCode, { props: { workAreaWidth: '1000px' } })
    }

    it('renders the complete status code table when the query is empty', () => {
        const wrapper = mountHttp()
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(HTTPStatusCodeTable.length)
        expect(rows[0].text()).toContain('100 Continue')
        expect(rows[0].text()).toContain('客户端应当继续发送请求')
    })

    it('filters rows by status code', async () => {
        const wrapper = mountHttp()
        await wrapper.find('input').setValue('404')
        const expected = HTTPStatusCodeTable.filter(
            (item) => item.code.includes('404') || item.desc.toLowerCase().includes('404')
        )
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(expected.length)
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect(row.text()).toContain('404')
        }
    })

    it('filters rows by description keyword', async () => {
        const wrapper = mountHttp()
        await wrapper.find('input').setValue('请求已成功')
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(1)
        expect(rows[0].text()).toContain('200 OK')
    })

    it('shows no rows when nothing matches the query', async () => {
        const wrapper = mountHttp()
        await wrapper.find('input').setValue('不存在的状态码XYZ')
        expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    })
})

describe('FileNameExtension', () => {
    function mountFileExt() {
        return mount(FileNameExtension, { props: { workAreaWidth: '1000px' } })
    }

    it('renders the whole MIME table compressed into two-column rows', () => {
        const wrapper = mountFileExt()
        const rows = wrapper.findAll('tbody tr')
        // CompressedArray(table, 2)：每行两个条目
        expect(rows).toHaveLength(Math.ceil(HTMLMimeTypeTable.length / 2))
        expect(rows[0].findAll('td')).toHaveLength(4)
        expect(rows[0].text()).toContain(HTMLMimeTypeTable[0].ext)
        expect(rows[0].text()).toContain(HTMLMimeTypeTable[0].type)
    })

    it('filters rows by extension', async () => {
        const wrapper = mountFileExt()
        await wrapper.find('input').setValue('.pdf')
        const expected = HTMLMimeTypeTable.filter(
            (item) =>
                item.ext.toLowerCase().includes('.pdf') || item.type.toLowerCase().includes('.pdf')
        )
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(Math.ceil(expected.length / 2))
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect(row.text().toLowerCase()).toContain('.pdf')
        }
    })

    it('filters rows by MIME type', async () => {
        const wrapper = mountFileExt()
        await wrapper.find('input').setValue('application/pdf')
        const expected = HTMLMimeTypeTable.filter(
            (item) =>
                item.ext.toLowerCase().includes('application/pdf') ||
                item.type.toLowerCase().includes('application/pdf')
        )
        const rows = wrapper.findAll('tbody tr')
        // 数据表中 .pdf 与 application/pdf 各出现 2 次
        expect(expected.length).toBe(2)
        expect(rows).toHaveLength(Math.ceil(expected.length / 2))
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect(row.text().toLowerCase()).toContain('application/pdf')
        }
    })
})

describe('GreeceLetter', () => {
    function mountGreece() {
        return mount(GreeceLetter, { props: { workAreaWidth: '1000px' } })
    }

    it('renders all greek letters compressed into two-column rows', () => {
        const wrapper = mountGreece()
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(Math.ceil(GreeceLetterTable.length / 2))
        expect(rows[0].findAll('td')).toHaveLength(6)
        expect(rows[0].text()).toContain('&Alpha;')
        expect(rows[0].text()).toContain('&#913;')
    })

    it('filters letters by name', async () => {
        const wrapper = mountGreece()
        await wrapper.find('input').setValue('alpha')
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(1)
        expect(rows[0].text()).toContain('&alpha;')
        expect(rows[0].text()).toContain('&#945;')
    })

    it('filters letters by decimal code', async () => {
        const wrapper = mountGreece()
        await wrapper.find('input').setValue('&#946;')
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(1)
        expect(rows[0].text()).toContain('&beta;')
    })
})

describe('NumericCase', () => {
    function mountNumeric() {
        return mount(NumericCase, { props: { workAreaWidth: '1000px' } })
    }

    it('renders the complete number case table', () => {
        const wrapper = mountNumeric()
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(NumericCaseTable.length)
        // 第一行：1 / 一 / 壹
        const firstCells = rows[0].findAll('td').map((td) => td.text())
        expect(firstCells).toEqual(['1', '一', '壹'])
    })

    it('filters rows by uppercase chinese number', async () => {
        const wrapper = mountNumeric()
        await wrapper.find('input').setValue('壹')
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(1)
        const cells = rows[0].findAll('td').map((td) => td.text())
        expect(cells).toEqual(['1', '一', '壹'])
    })

    it('filters rows by number value', async () => {
        const wrapper = mountNumeric()
        await wrapper.find('input').setValue('10000')
        const expected = NumericCaseTable.filter(
            (item) =>
                item.number.includes('10000') ||
                item.lower.toLowerCase().includes('10000') ||
                item.upper.toLowerCase().includes('10000')
        )
        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(expected.length)
        expect(rows.length).toBeGreaterThan(1)
        for (const row of rows) {
            expect(row.text()).toContain('10000')
        }
    })
})
