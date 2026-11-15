import { describe, it, expect, vi } from 'vitest'

// 模拟 vue3-context-menu，捕获 showContextMenu 调用参数
vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: vi.fn() },
    MenuItem: {}
}))

import ContextMenu from '@imengyu/vue3-context-menu'
import { showEmojiQuickAccess } from '../../src/renderer/src/components/Markdown/hemy-quick-access-emojis'

const showContextMenuMock = vi.mocked(ContextMenu.showContextMenu)

interface EmojiMenuItem {
    label: string
    direction: string
    children: { label: { children: { children: string }[] } }[]
}

// 提取菜单数据：分类标签 + 每个按钮的 emoji 字符
function collectEmojiItems(): { items: EmojiMenuItem[]; all: string[] } {
    showEmojiQuickAccess({ x: 1, y: 2 } as MouseEvent)
    const items = showContextMenuMock.mock.calls[0][0].items as EmojiMenuItem[]
    const all: string[] = []
    for (const item of items) {
        const vnode = item.children[0].label
        for (const button of vnode.children) {
            all.push(button.children)
        }
    }
    return { items, all }
}

describe('showEmojiQuickAccess', () => {
    it('should open the context menu at x and y+10', () => {
        showContextMenuMock.mockClear()
        showEmojiQuickAccess({ x: 100, y: 200 } as MouseEvent)

        expect(showContextMenuMock).toHaveBeenCalledTimes(1)
        const args = showContextMenuMock.mock.calls[0][0]
        expect(args.x).toBe(100)
        expect(args.y).toBe(210)
    })

    it('should expose the 20 emoji categories with labels and lr direction', () => {
        showContextMenuMock.mockClear()
        const { items } = collectEmojiItems()

        expect(items).toHaveLength(20)
        for (const item of items) {
            expect(typeof item.label).toBe('string')
            expect(item.label.length).toBeGreaterThan(0)
            expect(item.direction).toBe('lr')
            expect(item.children).toHaveLength(1)
        }
    })

    it('should keep category labels unique', () => {
        showContextMenuMock.mockClear()
        const { items } = collectEmojiItems()

        const labels = items.map((item) => item.label)
        expect(new Set(labels).size).toBe(labels.length)
    })

    it('should keep every emoji non-empty and unique within each category', () => {
        showContextMenuMock.mockClear()
        const { items } = collectEmojiItems()

        for (const item of items) {
            const values = item.children[0].label.children.map((b) => b.children)
            expect(values.length).toBeGreaterThan(0)
            for (const emoji of values) {
                expect(typeof emoji).toBe('string')
                expect(emoji.length).toBeGreaterThan(0)
            }
            // 分类内不允许重复（防止数据表回归）
            expect(new Set(values).size, `${item.label} 分类内不应重复`).toBe(values.length)
        }
    })

    it('should pin the table size and known cross-category duplicates', () => {
        showContextMenuMock.mockClear()
        const { all } = collectEmojiItems()

        // 当前数据表共 852 个表情，其中 64 个跨分类重复（如通用手势/日常表情多分类出现）
        expect(all.length).toBe(852)
        expect(new Set(all).size).toBe(788)
        expect(all.length - new Set(all).size).toBe(64)
    })

    it('should contain the expected phone and plant emojis', () => {
        showContextMenuMock.mockClear()
        const { items, all } = collectEmojiItems()

        const phone = items.find((item) => item.label.includes('手机'))
        expect(phone).toBeDefined()
        const phoneEmojis = phone!.children[0].label.children.map((b) => b.children)
        expect(phoneEmojis).toContain('📱')
        expect(phoneEmojis).toContain('📞')

        const plant = items.find((item) => item.label.includes('植物'))
        expect(plant).toBeDefined()
        const plantEmojis = plant!.children[0].label.children.map((b) => b.children)
        expect(plantEmojis).toContain('🌹')
        expect(plantEmojis).toContain('🌸')

        expect(all).toContain('🎉')
    })
})
