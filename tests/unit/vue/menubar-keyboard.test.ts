// @vitest-environment jsdom
/**
 * 菜单栏键盘可达组件测试（视觉升级 P1-B2 / T7）
 *
 * 覆盖需求（COMPONENTS.md §2）：
 * - role=menubar / menu / menuitem / separator 语义，aria-haspopup / aria-expanded；
 * - roving tabindex（菜单栏在 Tab 序列里只占一个焦点位）；
 * - 顶层：方向键移动 + 回绕、Home/End、Enter/空格/ArrowDown 打开并移入焦点、Esc 关闭归还焦点；
 * - 下拉：上下方向键（跳过分隔符/禁用项）、Home/End、Enter 执行动作、
 *   ArrowRight 展开嵌套并进入、ArrowLeft 返回父层、Tab 关闭并归还焦点；
 * - 既有鼠标语义不变（悬停展开嵌套）。菜单数据/动作分发链路（MENU-01~13）未改动，
 *   动作执行仍走 HandleMenuAction（此处以替身断言接线）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const handleMenuActionMock = vi.hoisted(() => vi.fn())
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

import MenuBar from '@renderer/components/MenuBar.vue'

let wrapper: VueWrapper | null = null

function stubShellGlobals(): void {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined)
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue({}) }
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    stubShellGlobals()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
})

/** 挂载菜单栏（挂到真实 DOM：键盘焦点断言依赖 document.activeElement） */
function mountMenuBar(): VueWrapper {
    wrapper = mount(MenuBar, { attachTo: document.body })
    return wrapper
}

/** 顶层菜单按钮 */
function topItems(target: VueWrapper): DOMWrapper<Element>[] {
    return target.findAll('.menu-item')
}

/** 顶层下拉的直接行（一级） */
function topLevelRows(): HTMLElement[] {
    return [
        ...document.querySelectorAll<HTMLElement>(
            '.submenu-container > .submenu-list > .menu-submenu-item, ' +
                '.submenu-container > .submenu-list > .submenu-item-wrapper > .menu-submenu-item'
        )
    ]
}

/** 按标签文本找一级行 */
function findTopLevelRow(label: string): HTMLElement {
    const row = topLevelRows().find(
        (node) => node.querySelector('.menu-item-label')?.textContent === label
    )
    expect(row, `应存在一级菜单行「${label}」`).toBeDefined()
    return row!
}

/** 向元素派发键盘事件（bubbles=true，模拟真实按键冒泡） */
function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
}

/** 打开「文件」菜单并等待下拉渲染完成 */
async function openFileMenuByKeyboard(target: VueWrapper): Promise<void> {
    await topItems(target)[0].trigger('keydown', { key: 'Enter' })
    await flushPromises()
}

describe('MenuBar 键盘语义与 roving tabindex', () => {
    it('渲染 menubar/menuitem 角色且顶层共 12 项（MENU-05 不变）', () => {
        const w = mountMenuBar()
        const menubar = w.find('[role="menubar"]')
        expect(menubar.exists()).toBe(true)
        expect(menubar.attributes('aria-label')).toBe('菜单栏')
        const items = topItems(w)
        expect(items).toHaveLength(12)
        for (const item of items) {
            expect(item.attributes('role')).toBe('menuitem')
            expect(item.attributes('aria-haspopup')).toBe('true')
        }
        // roving tabindex：只有第一项在 Tab 序列内
        expect(items[0].attributes('tabindex')).toBe('0')
        expect(items[1].attributes('tabindex')).toBe('-1')
    })

    it('方向键左右移动焦点并回绕；Home/End 跳首尾', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        ;(items[0].element as HTMLElement).focus()
        pressKey(items[0].element, 'ArrowRight')
        await nextTick()
        expect(document.activeElement).toBe(items[1].element)
        expect(items[1].attributes('tabindex')).toBe('0')
        expect(items[0].attributes('tabindex')).toBe('-1')

        pressKey(items[1].element, 'ArrowLeft')
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        // 从首项向左回绕到末项
        pressKey(items[0].element, 'ArrowLeft')
        await nextTick()
        expect(document.activeElement).toBe(items[11].element)

        pressKey(items[11].element, 'Home')
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        pressKey(items[0].element, 'End')
        await nextTick()
        expect(document.activeElement).toBe(items[11].element)
    })

    it('Enter 打开下拉并把焦点移入第一项；aria-expanded 同步', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        ;(items[0].element as HTMLElement).focus()
        pressKey(items[0].element, 'Enter')
        await flushPromises()

        expect(document.querySelector('.submenu-container')).not.toBeNull()
        expect(document.querySelector('.submenu-container [role="menu"]')).not.toBeNull()
        expect(items[0].attributes('aria-expanded')).toBe('true')

        const firstRow = topLevelRows()[0]
        expect(document.activeElement).toBe(firstRow)
    })

    it('下拉内方向键跳过分隔符并在首尾回绕，Home/End 到首尾可选项', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const rows = topLevelRows()
        const firstRow = rows[0]
        // 首项（新建）向下到第二项（打开文件）
        pressKey(firstRow, 'ArrowDown')
        await nextTick()
        expect(document.activeElement).toBe(rows[1])

        // End 到末个可导航项（退出），Home 回到首项
        pressKey(rows[1], 'End')
        await nextTick()
        expect(document.activeElement).toBe(rows[rows.length - 1])

        pressKey(rows[rows.length - 1], 'Home')
        await nextTick()
        expect(document.activeElement).toBe(rows[0])
    })

    it('Esc 关闭下拉并把焦点归还顶层按钮', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        await openFileMenuByKeyboard(w)
        const firstRow = topLevelRows()[0]
        pressKey(firstRow, 'Escape')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(items[0].element)
    })

    it('Tab 关闭下拉并归还焦点（不让焦点留在 teleport 节点）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        await openFileMenuByKeyboard(w)
        const firstRow = topLevelRows()[0]
        const event = pressKey(firstRow, 'Tab')
        expect(event.defaultPrevented).toBe(true)
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(items[0].element)
    })

    it('下拉内方向键左右切换顶层菜单并保持键盘焦点在下拉内', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        ;(items[0].element as HTMLElement).focus()
        pressKey(items[0].element, 'Enter')
        await flushPromises()
        const firstRow = topLevelRows()[0]

        // ArrowRight 在顶层叶子项上 → 切到下一个顶层菜单（编辑）
        pressKey(firstRow, 'ArrowRight')
        await flushPromises()
        expect(items[1].attributes('aria-expanded')).toBe('true')
        expect(topLevelRows().length).toBeGreaterThan(0)
        expect(document.activeElement).toBe(topLevelRows()[0])
    })

    it('Enter 执行叶子动作（复用 HandleMenuAction）并关闭菜单', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const firstRow = topLevelRows()[0]
        // 下拉打开后焦点已落到第一项（新建；动作 baize:menu:file:new）
        pressKey(document.activeElement ?? firstRow, 'Enter')
        await flushPromises()
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:new')
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(topItems(w)[0].element)
    })

    it('键盘打开后浏览器补发的合成 click 不会立即关掉菜单（防抖守卫）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        ;(items[0].element as HTMLElement).focus()
        pressKey(items[0].element, 'Enter')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()

        // 模拟原生 button 在 Enter/Space 下补发的 click（detail=0）
        items[0].element.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })
        )
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()
    })

    it('顶层按钮上按 Tab 时收起下拉（焦点按 roving tabindex 正常离开菜单栏）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        ;(items[0].element as HTMLElement).focus()
        pressKey(items[0].element, 'Enter')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()

        const event = pressKey(items[0].element, 'Tab')
        await flushPromises()
        expect(event.defaultPrevented).toBe(false)
        expect(document.querySelector('.submenu-container')).toBeNull()
    })

    it('键盘焦点在下拉内时鼠标划过菜单栏不会误关（鼠标 hover 与键盘焦点共存）', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const firstRow = topLevelRows()[0]
        expect(document.activeElement).toBe(firstRow)

        await w.trigger('mouseleave')
        await new Promise((resolve) => setTimeout(resolve, 150))
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()
    })
})

describe('MenuBar 子菜单焦点管理（嵌套层）', () => {
    it('ArrowRight 展开组并移入子层首项；ArrowLeft 返回父层', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const group = findTopLevelRow('从文件导入')
        group.focus()
        pressKey(group, 'ArrowRight')
        await flushPromises()

        const nested = document.querySelector('.nested-submenu')
        expect(nested).not.toBeNull()
        const firstNestedRow = nested!.querySelector<HTMLElement>('.menu-submenu-item')
        expect(firstNestedRow).not.toBeNull()
        expect(document.activeElement).toBe(firstNestedRow)

        // ArrowLeft：回到父层并重新聚焦组项（嵌套收起会重渲染本层行，需重新查询 DOM）
        pressKey(document.activeElement ?? nested!, 'ArrowLeft')
        await flushPromises()
        expect(document.querySelector('.nested-submenu')).toBeNull()
        const focusedGroup = document.querySelector<HTMLElement>(
            '.submenu-container .menu-submenu-item.has-submenu'
        )
        expect(focusedGroup).not.toBeNull()
        expect(document.activeElement).toBe(focusedGroup)
        expect(focusedGroup!.textContent).toContain('从文件导入')
    })

    it('嵌套层 Esc 关闭整个菜单栏下拉并归还顶层按钮焦点', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const group = findTopLevelRow('从文件导入')
        group.focus()
        pressKey(group, 'ArrowRight')
        await flushPromises()

        pressKey(document.activeElement ?? group, 'Escape')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(topItems(w)[0].element)
    })

    it('悬停展开嵌套（既有鼠标语义不变）并渲染 role=menu', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const group = findTopLevelRow('从文件导入')
        group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        const nested = document.querySelector('.nested-submenu')
        expect(nested).not.toBeNull()
        expect(nested!.querySelector('[role="menu"]')).not.toBeNull()
    })

    it('下拉内渲染 role=separator 的 1px 分隔符', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const separators = document.querySelectorAll('.submenu-container [role="separator"]')
        expect(separators.length).toBeGreaterThan(0)
        expect(separators[0].getAttribute('aria-orientation')).toBe('horizontal')
    })
})
