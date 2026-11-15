import { describe, it, expect, vi } from 'vitest'

// 模拟 vue3-context-menu，捕获 showContextMenu 调用参数
vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: vi.fn() },
    MenuItem: {}
}))

import ContextMenu from '@imengyu/vue3-context-menu'
import { showSymbolQuickAccess } from '../../src/renderer/src/components/Markdown/hemy-quick-access-symbols'

const showContextMenuMock = vi.mocked(ContextMenu.showContextMenu)

interface SymbolMenuItem {
    label: string
    direction: string
    children: { label: { children: { children: string }[] } }[]
}

// 提取菜单数据：分类标签 + 每个按钮的符号字符
function collectSymbolItems(): { items: SymbolMenuItem[]; all: string[] } {
    showSymbolQuickAccess({ x: 1, y: 2 } as MouseEvent)
    const items = showContextMenuMock.mock.calls[0][0].items as SymbolMenuItem[]
    const all: string[] = []
    for (const item of items) {
        const vnode = item.children[0].label
        for (const button of vnode.children) {
            all.push(button.children)
        }
    }
    return { items, all }
}

describe('showSymbolQuickAccess', () => {
    it('should open the context menu at x and y+10', () => {
        showContextMenuMock.mockClear()
        showSymbolQuickAccess({ x: 100, y: 200 } as MouseEvent)

        expect(showContextMenuMock).toHaveBeenCalledTimes(1)
        const args = showContextMenuMock.mock.calls[0][0]
        expect(args.x).toBe(100)
        expect(args.y).toBe(210)
    })

    it('should expose the 23 symbol categories with labels and br direction', () => {
        showContextMenuMock.mockClear()
        const { items } = collectSymbolItems()

        expect(items).toHaveLength(23)
        for (const item of items) {
            expect(typeof item.label).toBe('string')
            expect(item.label.length).toBeGreaterThan(0)
            expect(item.direction).toBe('br')
            expect(item.children).toHaveLength(1)
        }
    })

    it('should keep category labels unique', () => {
        showContextMenuMock.mockClear()
        const { items } = collectSymbolItems()

        const labels = items.map((item) => item.label)
        expect(new Set(labels).size).toBe(labels.length)
    })

    it('should keep every symbol non-empty', () => {
        showContextMenuMock.mockClear()
        const { all } = collectSymbolItems()

        expect(all.length).toBeGreaterThan(100)
        for (const symbol of all) {
            expect(typeof symbol).toBe('string')
            expect(symbol.length).toBeGreaterThan(0)
        }
    })

    it('should keep symbols unique within every category except the known duplicates', () => {
        showContextMenuMock.mockClear()
        const { items } = collectSymbolItems()

        // 数据表中已知存在分类内重复的三个分类（见探针记录，疑似录入重复）
        const knownDuplicateCategories = ['数学运算 ㏒', '数学单位 ￡', '制表符 ┆']

        for (const item of items) {
            const values = item.children[0].label.children.map((b) => b.children)
            if (knownDuplicateCategories.includes(item.label)) continue
            expect(new Set(values).size, `${item.label} 分类内不应重复`).toBe(values.length)
        }
    })

    it('should pin the table size and known duplicate counts', () => {
        showContextMenuMock.mockClear()
        const { all, items } = collectSymbolItems()

        // 当前数据表共 822 个符号，804 个唯一值（18 个重复，其中部分为分类内重复）
        expect(all.length).toBe(822)
        expect(new Set(all).size).toBe(804)

        // 数学运算分类中 ﹢ 与 ﹣ 各出现两次（已知数据现状）
        const math = items.find((item) => item.label === '数学运算 ㏒')!
        const mathValues = math.children[0].label.children.map((b) => b.children)
        expect(mathValues.filter((v) => v === '﹢')).toHaveLength(2)
        expect(mathValues.filter((v) => v === '﹣')).toHaveLength(2)
    })

    it('should contain the expected special, phonetic and unit symbols', () => {
        showContextMenuMock.mockClear()
        const { items, all } = collectSymbolItems()

        // 特殊字符分类包含 ★
        const spcial = items.find((item) => item.label.includes('特殊字符'))
        expect(spcial).toBeDefined()
        const spcialSymbols = spcial!.children[0].label.children.map((b) => b.children)
        expect(spcialSymbols).toContain('★')
        expect(spcialSymbols).toContain('☆')

        // 中文注音分类：按钮文本取注音字符（text[0]）
        const phonetic = items.find((item) => item.label === '中文注音')
        expect(phonetic).toBeDefined()
        const phoneticSymbols = phonetic!.children[0].label.children.map((b) => b.children)
        expect(phoneticSymbols).toContain('ㄚ')
        expect(phoneticSymbols).toContain('ㄅ')

        // 中文单位分类包含 零
        const unit = items.find((item) => item.label.includes('中文单位'))
        expect(unit).toBeDefined()
        const unitSymbols = unit!.children[0].label.children.map((b) => b.children)
        expect(unitSymbols).toContain('零')

        expect(all).toContain('△')
    })
})
