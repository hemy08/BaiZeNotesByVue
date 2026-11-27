/**
 * 菜单键盘导航纯函数单测（视觉升级 P1-B2 / T7）
 *
 * 覆盖：可导航判定（分隔符/禁用项跳过）、循环查找边界、Home/End、顶层横向回绕、
 * 顶层/子菜单按键语义映射。组件层 DOM 行为见 tests/unit/vue/menubar-keyboard.test.ts。
 */
import { describe, expect, it } from 'vitest'
import {
    findFirstNavigableIndex,
    findLastNavigableIndex,
    findNavigableIndex,
    hasMenuSubmenu,
    isMenuDisabled,
    isMenuNavigable,
    isMenuSeparator,
    moveMenubarIndex,
    resolveMenubarKeyAction,
    resolveSubmenuKeyAction
} from '../../src/renderer/src/components/MenuBar/menu-keyboard'
import type { BaiZeMenuEntry } from '../../src/renderer/src/components/MenuBar/menu-config'

/** 构造菜单项（默认可导航叶子） */
function item(overrides: Partial<BaiZeMenuEntry> = {}): BaiZeMenuEntry {
    return { label: '项', menuAction: 'baize:menu:test:item', ...overrides }
}

/** 样本：可导航 / 分隔符 / 禁用 / 可展开组 / 空子菜单（按叶子处理） */
function sampleItems(): BaiZeMenuEntry[] {
    return [
        item({ label: '第一项' }),
        { type: 'separator' },
        item({ label: '禁用项', enabled: false }),
        item({ label: '分组', submenu: [item({ label: '子项' })] }),
        item({ label: '空组', submenu: [] })
    ]
}

describe('菜单项可导航判定', () => {
    it('分隔符不是 menuitem、不参与导航', () => {
        const separator: BaiZeMenuEntry = { type: 'separator' }
        expect(isMenuSeparator(separator)).toBe(true)
        expect(isMenuNavigable(separator)).toBe(false)
    })

    it('enabled === false 的项禁用但仍是 menuitem', () => {
        const disabled = item({ enabled: false })
        expect(isMenuDisabled(disabled)).toBe(true)
        expect(isMenuNavigable(disabled)).toBe(false)
    })

    it('普通项可导航；空 submenu 按叶子处理', () => {
        expect(isMenuNavigable(item())).toBe(true)
        expect(hasMenuSubmenu(item())).toBe(false)
        expect(hasMenuSubmenu(item({ submenu: [] }))).toBe(false)
        expect(hasMenuSubmenu(item({ submenu: [item()] }))).toBe(true)
    })
})

describe('findNavigableIndex：跳过分隔符/禁用项并循环回绕', () => {
    it('向下跳过分隔符与禁用项', () => {
        const items = sampleItems()
        // 0 → 跳过 1 分隔符、2 禁用 → 3 分组
        expect(findNavigableIndex(items, 0, 'next')).toBe(3)
    })

    it('向上跳过禁用项与分隔符', () => {
        const items = sampleItems()
        // 3 → 跳过 2 禁用、1 分隔符 → 0
        expect(findNavigableIndex(items, 3, 'previous')).toBe(0)
    })

    it('末尾向下循环回绕到首项', () => {
        const items = sampleItems()
        expect(findNavigableIndex(items, items.length - 1, 'next')).toBe(0)
    })

    it('首项向上循环回绕到末个可导航项', () => {
        const items = sampleItems()
        // 末项 4 是叶子（空组）→ 回绕到 4
        expect(findNavigableIndex(items, 0, 'previous')).toBe(4)
    })

    it('起始索引 -1 时按方向从边界进入', () => {
        const items = sampleItems()
        expect(findNavigableIndex(items, -1, 'next')).toBe(0)
        expect(findNavigableIndex(items, -1, 'previous')).toBe(4)
    })

    it('整层无可用项返回 -1（全禁用/全分隔符/空数组）', () => {
        expect(findNavigableIndex([item({ enabled: false })], 0, 'next')).toBe(-1)
        expect(findNavigableIndex([{ type: 'separator' }], 0, 'next')).toBe(-1)
        expect(findNavigableIndex([], 0, 'next')).toBe(-1)
    })
})

describe('findFirstNavigableIndex / findLastNavigableIndex（Home/End）', () => {
    it('首项被禁用时取下一个可用项', () => {
        const items = [item({ enabled: false }), { type: 'separator' }, item(), item()]
        expect(findFirstNavigableIndex(items)).toBe(2)
        expect(findLastNavigableIndex(items)).toBe(3)
    })

    it('全不可用时返回 -1', () => {
        const items = [item({ enabled: false }), { type: 'separator' }]
        expect(findFirstNavigableIndex(items)).toBe(-1)
        expect(findLastNavigableIndex(items)).toBe(-1)
        expect(findFirstNavigableIndex([])).toBe(-1)
    })
})

describe('moveMenubarIndex：顶层横向移动', () => {
    it('左右移动并按 12 个顶层菜单回绕', () => {
        expect(moveMenubarIndex(0, -1, 12)).toBe(11)
        expect(moveMenubarIndex(11, 1, 12)).toBe(0)
        expect(moveMenubarIndex(5, 1, 12)).toBe(6)
        expect(moveMenubarIndex(5, -1, 12)).toBe(4)
    })

    it('非法当前索引与空菜单安全降级', () => {
        expect(moveMenubarIndex(-1, 1, 12)).toBe(1)
        expect(moveMenubarIndex(99, -1, 12)).toBe(11)
        expect(moveMenubarIndex(0, 1, 0)).toBe(-1)
    })
})

describe('resolveMenubarKeyAction：顶层按键语义', () => {
    it('方向键与 Home/End', () => {
        expect(resolveMenubarKeyAction('ArrowLeft', false)).toBe('previous')
        expect(resolveMenubarKeyAction('ArrowRight', false)).toBe('next')
        expect(resolveMenubarKeyAction('Home', false)).toBe('first')
        expect(resolveMenubarKeyAction('End', false)).toBe('last')
    })

    it('Enter / Space / ArrowDown 打开菜单', () => {
        expect(resolveMenubarKeyAction('Enter', false)).toBe('open')
        expect(resolveMenubarKeyAction(' ', false)).toBe('open')
        expect(resolveMenubarKeyAction('Spacebar', false)).toBe('open')
        expect(resolveMenubarKeyAction('ArrowDown', false)).toBe('open')
    })

    it('Escape 仅在菜单已展开时消费事件', () => {
        expect(resolveMenubarKeyAction('Escape', true)).toBe('close')
        expect(resolveMenubarKeyAction('Escape', false)).toBeNull()
    })

    it('未知按键不消费', () => {
        expect(resolveMenubarKeyAction('a', false)).toBeNull()
        expect(resolveMenubarKeyAction('Tab', false)).toBeNull()
    })
})

describe('resolveSubmenuKeyAction：子菜单按键语义', () => {
    const leaf = item()
    const group = item({ submenu: [item()] })

    it('上下方向键与 Home/End 在子菜单内移动', () => {
        expect(resolveSubmenuKeyAction('ArrowDown', 0, leaf)).toBe('next')
        expect(resolveSubmenuKeyAction('ArrowUp', 0, leaf)).toBe('previous')
        expect(resolveSubmenuKeyAction('Home', 1, leaf)).toBe('first')
        expect(resolveSubmenuKeyAction('End', 1, leaf)).toBe('last')
    })

    it('Enter / Space 激活当前项', () => {
        expect(resolveSubmenuKeyAction('Enter', 0, leaf)).toBe('activate')
        expect(resolveSubmenuKeyAction(' ', 1, leaf)).toBe('activate')
    })

    it('ArrowRight：组项展开子层；顶层叶子切下一个顶层菜单；嵌套层叶子不消费', () => {
        expect(resolveSubmenuKeyAction('ArrowRight', 0, group)).toBe('open-submenu')
        expect(resolveSubmenuKeyAction('ArrowRight', 0, leaf)).toBe('switch-next')
        expect(resolveSubmenuKeyAction('ArrowRight', 1, leaf)).toBeNull()
    })

    it('ArrowLeft：顶层切上一个顶层菜单；嵌套层返回父层', () => {
        expect(resolveSubmenuKeyAction('ArrowLeft', 0, leaf)).toBe('switch-previous')
        expect(resolveSubmenuKeyAction('ArrowLeft', 1, leaf)).toBe('back')
    })

    it('Escape / Tab 语义', () => {
        expect(resolveSubmenuKeyAction('Escape', 0, leaf)).toBe('close')
        expect(resolveSubmenuKeyAction('Tab', 0, leaf)).toBe('tab')
    })

    it('未知按键不消费', () => {
        expect(resolveSubmenuKeyAction('a', 0, leaf)).toBeNull()
        expect(resolveSubmenuKeyAction('F5', 0, leaf)).toBeNull()
    })
})
