// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import HTMLSpecialChar from '@renderer/components/PluginTools/Informations/HTMLSpecialChar.vue'
import FormulaSymbol from '@renderer/components/PluginTools/Informations/FormulaSymbol.vue'
import ASCIIComparison from '@renderer/components/PluginTools/Informations/ASCIIComparison.vue'
import NormalFontStyle from '@renderer/components/PluginTools/Informations/NormalFontStyle.vue'
import SubnetMaskMapTable from '@renderer/components/PluginTools/Informations/SubnetMaskMapTable.vue'
import PhysicalSymbolic from '@renderer/components/PluginTools/Informations/PhysicalSymbolic.vue'
import {
    HTMLSpecCharTable,
    FormulaSymbolTable,
    ASCIITable,
    NormalFontTable,
    SubnetMaskBitsTable,
    PhysicalTable,
    CompressedArray
} from '@renderer/components/PluginTools/Informations/Information'

describe('HTMLSpecialChar', () => {
    it('renders the title and all compressed table rows', () => {
        const wrapper = mount(HTMLSpecialChar)
        expect(wrapper.find('.header-display-center').text()).toBe('HTML特殊字符对照表')
        // 数据源被 CompressedArray 按每行 3 列压缩后渲染
        const expectedRows = CompressedArray(HTMLSpecCharTable, 3).length
        expect(wrapper.findAll('tbody tr')).toHaveLength(expectedRows)
        expect(expectedRows).toBeGreaterThan(30)
    })

    it('renders the first entry preview, code and mark', () => {
        const wrapper = mount(HTMLSpecialChar)
        // 第一行第一列是 v-html 预览（&#36 在文本内容中会被解析为 $）
        expect(wrapper.find('.html-spec-char-table-preview').text()).toBe('$')
        // 写法与说明列
        const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(firstRowCells[1].text()).toBe('&#36')
        expect(firstRowCells[2].text()).toBe('美元符号')
    })

    it('computes the table width from the workAreaWidth prop', () => {
        const wrapper = mount(HTMLSpecialChar, { props: { workAreaWidth: '800px' } })
        expect(wrapper.find('input').attributes('style')).toContain('width: 750px')
    })

    it('filters the table by mark text', async () => {
        const wrapper = mount(HTMLSpecialChar)
        // 说明中包含"雪花"的共 3 条（雪花1/2/3），压缩后为 1 行
        await wrapper.find('input').setValue('雪花')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        expect(wrapper.find('tbody').text()).toContain('雪花1')
        expect(wrapper.find('tbody').text()).toContain('雪花3')
    })

    it('shows an empty table body when nothing matches', async () => {
        const wrapper = mount(HTMLSpecialChar)
        await wrapper.find('input').setValue('不存在的字符zzz')
        expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    })
})

describe('FormulaSymbol', () => {
    it('renders the title and all compressed rows', () => {
        const wrapper = mount(FormulaSymbol)
        expect(wrapper.find('.header-display-center').text()).toBe('数学公式符号')
        const expectedRows = CompressedArray(FormulaSymbolTable, 3).length
        expect(wrapper.findAll('tbody tr')).toHaveLength(expectedRows)
    })

    it('renders the first symbol and its mark', () => {
        const wrapper = mount(FormulaSymbol)
        const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(firstRowCells[0].text()).toBe('≈')
        expect(firstRowCells[1].text()).toBe('约等于')
    })

    it('filters symbols by mark', async () => {
        const wrapper = mount(FormulaSymbol)
        // "积分"匹配 ∫ 与 ∮（闭合曲线积分），共 2 条压缩为 1 行
        await wrapper.find('input').setValue('积分')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        const text = wrapper.find('tbody').text()
        expect(text).toContain('∫')
        expect(text).toContain('∮')
    })

    it('filters symbols by the symbol itself', async () => {
        const wrapper = mount(FormulaSymbol)
        await wrapper.find('input').setValue('∞')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        expect(wrapper.find('tbody').text()).toContain('无穷大')
    })
})

describe('ASCIIComparison', () => {
    it('renders all 128 ASCII rows', () => {
        const wrapper = mount(ASCIIComparison)
        expect(wrapper.find('.header-display-center').text()).toBe('ASCII 对照表')
        expect(wrapper.findAll('tbody tr')).toHaveLength(ASCIITable.length)
        expect(ASCIITable.length).toBe(128)
    })

    it('renders the first ASCII entry (NUL)', () => {
        const wrapper = mount(ASCIIComparison)
        const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(firstRowCells.map((cell) => cell.text())).toEqual([
            '0000 0000',
            '00',
            '0',
            '0x00',
            'NUL(null)',
            '空字符'
        ])
    })

    it('filters by decimal value', async () => {
        const wrapper = mount(ASCIIComparison)
        // dec=48 与 hex=0x48 两条记录都包含 "48"
        await wrapper.find('input').setValue('48')
        expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        const text = wrapper.find('tbody').text()
        expect(text).toContain('字符0')
        expect(text).toContain('0x48')
    })

    it('filters by Chinese mark text', async () => {
        const wrapper = mount(ASCIIComparison)
        await wrapper.find('input').setValue('大写字母A')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        expect(wrapper.find('tbody').text()).toContain('0x41')
    })

    it('filters by abridge text', async () => {
        const wrapper = mount(ASCIIComparison)
        // abridge 含 "tab" 的有 HT 与 VT 两条
        await wrapper.find('input').setValue('tab')
        expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        expect(wrapper.find('tbody').text()).toContain('HT (horizontal tab)')
        expect(wrapper.find('tbody').text()).toContain('VT (vertical tab)')
    })
})

describe('NormalFontStyle', () => {
    it('renders all font rows', () => {
        const wrapper = mount(NormalFontStyle)
        expect(wrapper.find('.header-display-center').text()).toBe('常见字体对照')
        expect(wrapper.findAll('tbody tr')).toHaveLength(NormalFontTable.length)
    })

    it('applies the css style to the preview cell', () => {
        const wrapper = mount(NormalFontStyle)
        const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(firstRowCells[0].text()).toBe('Arial')
        expect(firstRowCells[1].text()).toBe('Arial')
        // 预览单元格应用 font-family 样式（jsdom 将样式序列化为 font-family）
        expect(firstRowCells[2].attributes('style')).toContain('font-family: Arial')
    })

    it('filters fonts by css style name', async () => {
        const wrapper = mount(NormalFontStyle)
        // "simsun" 同时命中 SimSun（宋体）与 NSimSun（新宋体）
        await wrapper.find('input').setValue('SimSun')
        expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        expect(wrapper.find('tbody').text()).toContain('宋体')
        expect(wrapper.find('tbody').text()).toContain('新宋体')
    })

    it('filters fonts by Chinese name', async () => {
        const wrapper = mount(NormalFontStyle)
        // 名称含"宋"共 6 条：宋体/新宋体/仿宋/华文宋体/华文中宋/华文仿宋
        await wrapper.find('input').setValue('宋')
        expect(wrapper.findAll('tbody tr')).toHaveLength(6)
        expect(wrapper.find('tbody').text()).toContain('华文中宋')
    })
})

describe('SubnetMaskMapTable', () => {
    it('renders all 33 subnet mask rows', () => {
        const wrapper = mount(SubnetMaskMapTable)
        expect(wrapper.find('.header-display-center').text()).toBe('子网掩码对照表')
        expect(wrapper.findAll('tbody tr')).toHaveLength(SubnetMaskBitsTable.length)
        expect(SubnetMaskBitsTable.length).toBe(33)
    })

    it('renders the first row with mask 255.255.255.255', () => {
        const wrapper = mount(SubnetMaskMapTable)
        const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(firstRowCells.map((cell) => cell.text())).toEqual(['255.255.255.255', '32', '1'])
    })

    it('filters rows by mask', async () => {
        const wrapper = mount(SubnetMaskMapTable)
        await wrapper.find('input').setValue('255.255.255.0')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        const cells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(cells.map((cell) => cell.text())).toEqual(['255.255.255.0', '24', '256'])
    })

    it('filters rows by bit number', async () => {
        const wrapper = mount(SubnetMaskMapTable)
        // 位数为 23 的记录仅一条（nums/掩码中均不含 "23"）
        await wrapper.find('input').setValue('23')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        expect(wrapper.find('tbody').text()).toContain('255.255.254.0')
    })
})

describe('PhysicalSymbolic', () => {
    it('renders all 24 physical symbol rows', () => {
        const wrapper = mount(PhysicalSymbolic)
        expect(wrapper.find('.header-display-center').text()).toBe('物理符号常量')
        expect(wrapper.findAll('tbody tr')).toHaveLength(PhysicalTable.length)
        expect(PhysicalTable.length).toBe(24)
    })

    it('renders the first row (mass)', () => {
        const wrapper = mount(PhysicalSymbolic)
        const firstRowCells = wrapper.findAll('tbody tr')[0].findAll('td')
        expect(firstRowCells[0].text()).toBe('m')
        expect(firstRowCells[1].text()).toBe('质量')
        expect(firstRowCells[2].text()).toContain('千克')
    })

    it('filters rows by name', async () => {
        const wrapper = mount(PhysicalSymbolic)
        // "质量"命中 4 个名称（质量/电子质量/质子质量/中子质量）
        // 以及动量条目说明中的"物体的质量和速度"，共 5 条
        await wrapper.find('input').setValue('质量')
        expect(wrapper.findAll('tbody tr')).toHaveLength(5)
        expect(wrapper.find('tbody').text()).toContain('m_e')
        expect(wrapper.find('tbody').text()).toContain('中子质量')
        expect(wrapper.find('tbody').text()).toContain('动量')
    })

    it('filters rows by mark text', async () => {
        const wrapper = mount(PhysicalSymbolic)
        await wrapper.find('input').setValue('特斯拉')
        expect(wrapper.findAll('tbody tr')).toHaveLength(1)
        expect(wrapper.find('tbody').text()).toContain('磁场强度')
    })
})
