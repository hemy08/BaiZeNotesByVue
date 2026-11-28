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
 * - Alt 键激活菜单栏（Windows 惯例，1.5.5 遗留项补齐）：单独按 Alt 激活/再次 Alt 或
 *   Esc 退出并归还原焦点；组合键（Alt+F4/Alt+Tab/Alt+字母/AltGr）与对话框内焦点不劫持，
 *   激活后的方向键/Enter/Esc 完全沿用既有菜单键盘语义；
 * - Alt+字母助记符（REQ-13，1.5.6）：映射表覆盖全部顶层菜单且字母唯一；Alt+字母激活
 *   菜单栏并打开/切换对应下拉（焦点进入第一项）；未映射字母/系统组合键/输入法组字/
 *   对话框内焦点不劫持，与单独 Alt 激活共存；菜单按钮用 aria-keyshortcuts 与 Alt 激活态
 *   的字母下划线（CSS ::after + data-mnemonic）提示，不改菜单 DOM 文案；
 * - 既有鼠标语义不变（悬停展开嵌套）。菜单数据/动作分发链路（MENU-01~13）未改动，
 *   动作执行仍走 HandleMenuAction（此处以替身断言接线）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import * as fs from 'fs'
import * as path from 'path'

const handleMenuActionMock = vi.hoisted(() => vi.fn())
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

import MenuBar from '@renderer/components/MenuBar.vue'
import {
    findMenuIndexByMnemonic,
    isMenuActivationAltKey,
    resolveMenuMnemonicLetter
} from '@renderer/components/MenuBar/menu-keyboard'
import { menuMap, TOP_MENU_ACCESS_KEYS } from '@renderer/components/MenuBar/menu-config'

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

/**
 * 构造「输入法组字中」的键盘事件。
 *
 * `isComposing` 是 KeyboardEvent 的只读属性，部分 jsdom 版本不认构造器入参，
 * 统一用 defineProperty 注入，保证「组字期不响应助记符」的用例真正生效。
 */
function pressComposingKey(
    target: Element,
    key: string,
    init: KeyboardEventInit = {}
): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    Object.defineProperty(event, 'isComposing', { value: true })
    target.dispatchEvent(event)
    return event
}

/** 打开「文件」菜单并等待下拉渲染完成 */
async function openFileMenuByKeyboard(target: VueWrapper): Promise<void> {
    await topItems(target)[0].trigger('keydown', { key: 'Enter' })
    await flushPromises()
}

/** 在菜单栏之外创建一个可聚焦控件并聚焦（模拟编辑器/其它控件的既有焦点） */
function createOutsideFocusTarget(): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '编辑区'
    document.body.appendChild(button)
    button.focus()
    return button
}

/** 菜单栏根节点（激活态 class 断言用） */
function menubarRoot(target: VueWrapper): DOMWrapper<Element> {
    return target.find('[role="menubar"]')
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

describe('MenuBar Alt 键激活菜单栏（Windows 惯例）', () => {
    it('单独按 Alt 激活菜单栏：聚焦第一个顶层菜单、消费按键并给出激活态', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        const event = pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()

        expect(event.defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(items[0].element)
        // 激活态 class 是可视反馈（focus-ring 令牌）的挂载点
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')
    })

    it('激活后方向键/Enter 沿用既有菜单键盘语义（不新增第二套导航）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        // 方向键：与既有 roving tabindex 语义一致
        pressKey(items[0].element, 'ArrowRight')
        await nextTick()
        expect(document.activeElement).toBe(items[1].element)

        // Enter：打开「编辑」菜单并把焦点移入下拉第一项
        pressKey(items[1].element, 'Enter')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()
        expect(items[1].attributes('aria-expanded')).toBe('true')
        expect(document.activeElement).toBe(topLevelRows()[0])
    })

    it('再次按 Alt 退出激活并把焦点归还激活前控件', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        const outside = createOutsideFocusTarget()
        expect(document.activeElement).toBe(outside)

        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        // 真实事件目标是当前聚焦的菜单项（菜单栏区域内按下 Alt）也要能退出
        const secondEvent = pressKey(items[0].element, 'Alt', { altKey: true })
        await nextTick()
        expect(secondEvent.defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('激活后按 Esc 退出激活并归还焦点（未展开下拉时由激活态消费 Esc）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        const outside = createOutsideFocusTarget()
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        const event = pressKey(items[0].element, 'Escape')
        await nextTick()
        expect(event.defaultPrevented).toBe(true)
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('Alt 打开下拉后按 Esc：沿用既有「关闭下拉并归还顶层按钮」语义并退出激活', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        pressKey(items[0].element, 'Enter')
        await flushPromises()

        pressKey(document.activeElement ?? items[0].element, 'Escape')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(items[0].element)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('焦点离开菜单栏时退出激活态（Tab 移出后再按 Alt 不会抢回旧焦点）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        const outside = createOutsideFocusTarget()

        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')

        // Tab 的焦点移动由浏览器完成（jsdom 不实现），这里直接聚焦外部控件模拟移出
        outside.focus()
        await nextTick()
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')

        // 再次 Alt 应重新激活，而不是「退出上一次激活」并抢回旧焦点
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')
    })

    it('Alt+其它键/带修饰键的组合键不被劫持（Alt+F4、Alt+Tab、AltGr 等放行）', async () => {
        const w = mountMenuBar()
        const outside = createOutsideFocusTarget()
        const combos: KeyboardEventInit[] = [
            { key: 'q', altKey: true }, // Alt+未映射字母（en-US 键盘 Q 无顶层菜单助记符）
            { key: 'Tab', altKey: true }, // Alt+Tab（系统切换窗口）
            { key: 'F4', altKey: true }, // Alt+F4（系统关闭窗口）
            { key: 'Alt', altKey: true, ctrlKey: true }, // AltGr / Ctrl+Alt
            { key: 'Alt', altKey: true, shiftKey: true },
            { key: 'Alt', altKey: true, metaKey: true }
        ]
        for (const init of combos) {
            const event = pressKey(document.body, init.key ?? '', init)
            expect(event.defaultPrevented, `组合键 ${init.key} 不应被菜单栏消费`).toBe(false)
        }
        await nextTick()
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('按住 Alt 的自动重复不重复切换激活态', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        const repeatEvent = pressKey(document.body, 'Alt', { altKey: true, repeat: true })
        await nextTick()
        expect(repeatEvent.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(items[0].element)
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')
    })

    it('激活后按 Alt+其它键（Alt+F4/Alt+Tab/未映射的 Alt+字母）撤销激活且不消费按键', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        const outside = createOutsideFocusTarget()

        for (const key of ['q', 'Tab', 'F4']) {
            pressKey(document.body, 'Alt', { altKey: true })
            await nextTick()
            expect(document.activeElement).toBe(items[0].element)

            const event = pressKey(document.body, key, { altKey: true })
            await nextTick()
            expect(event.defaultPrevented, `Alt+${key} 不应被菜单栏消费`).toBe(false)
            expect(document.activeElement).toBe(outside)
            expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
        }
    })

    it('按住 Alt 继续用方向键导航时激活态保留（Windows 菜单习惯）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)

        pressKey(items[0].element, 'ArrowRight', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[1].element)
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')
    })

    it('焦点在对话框内时 Alt 不激活菜单栏（不抢模态浮层焦点）', async () => {
        const w = mountMenuBar()
        const dialog = document.createElement('div')
        dialog.setAttribute('role', 'dialog')
        dialog.setAttribute('aria-modal', 'true')
        const dialogButton = document.createElement('button')
        dialog.appendChild(dialogButton)
        document.body.appendChild(dialog)
        dialogButton.focus()

        const event = pressKey(dialogButton, 'Alt', { altKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(dialogButton)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('菜单栏被宿主隐藏（Windows 原生菜单样式）时 Alt 不激活', async () => {
        const host = document.createElement('div')
        host.style.display = 'none'
        document.body.appendChild(host)
        wrapper = mount(MenuBar, { attachTo: host })

        const event = pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(wrapper.find('[role="menubar"]').classes()).not.toContain('menu-bar--alt-active')
    })

    it('卸载后移除全局 Alt 监听（不再消费按键、不抛错）', async () => {
        const w = mountMenuBar()
        w.unmount()
        wrapper = null
        const outside = createOutsideFocusTarget()

        const event = pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(outside)
    })
})

describe('Alt+字母助记符映射表（REQ-13）', () => {
    it('覆盖全部 12 个顶层菜单、字母唯一且映射表与菜单栏顺序/标识逐项一致', () => {
        expect(menuMap.value).toHaveLength(12)
        // 映射表由 menuMap 顶层项派生：长度相等即「全部顶层菜单都有助记符」（无遗漏）
        expect(TOP_MENU_ACCESS_KEYS).toHaveLength(menuMap.value.length)

        const letters = menuMap.value.map((menu) => menu.accessKey)
        for (const [index, letter] of letters.entries()) {
            expect(letter, `第 ${index + 1} 个顶层菜单应声明 accessKey`).toMatch(/^[A-Z]$/)
        }
        // 字母不得重复（冲突会让 Alt+字母 落点不确定）
        expect(new Set(letters).size).toBe(letters.length)
        // 同源校验：顺序与菜单标识逐项来自 menuMap，不在别处维护第二份字母表
        expect(TOP_MENU_ACCESS_KEYS.map((entry) => entry.accessKey)).toEqual(letters)
        expect(TOP_MENU_ACCESS_KEYS.map((entry) => entry.labelKey)).toEqual(
            menuMap.value.map((menu) => menu.labelKey)
        )
    })

    it('按英文语义首字母映射（文件 F / 编辑 E / 视图 V / 插入 I / 设置 S / 工具 T / 帮助 H）', () => {
        const byLabelKey = new Map(
            TOP_MENU_ACCESS_KEYS.map((entry) => [entry.labelKey, entry.accessKey])
        )
        expect(byLabelKey.get('menu.file.label')).toBe('F')
        expect(byLabelKey.get('menu.edit.label')).toBe('E')
        expect(byLabelKey.get('menu.view.label')).toBe('V')
        expect(byLabelKey.get('menu.insert.label')).toBe('I')
        expect(byLabelKey.get('menu.setting.label')).toBe('S')
        expect(byLabelKey.get('menu.tools.label')).toBe('T')
        expect(byLabelKey.get('menu.help.label')).toBe('H')
        // GitHub 为品牌名（label 原样展示）：固定 G
        expect(TOP_MENU_ACCESS_KEYS.find((entry) => entry.label === 'GitHub')?.accessKey).toBe('G')
    })

    it('字母 → 顶层菜单索引解析大小写不敏感，未映射字母返回 -1', () => {
        expect(findMenuIndexByMnemonic(menuMap.value, 'f')).toBe(0)
        expect(findMenuIndexByMnemonic(menuMap.value, 'F')).toBe(0)
        expect(findMenuIndexByMnemonic(menuMap.value, 'h')).toBe(11)
        expect(findMenuIndexByMnemonic(menuMap.value, 'q')).toBe(-1)
        expect(findMenuIndexByMnemonic(menuMap.value, '')).toBe(-1)
    })
})

describe('MenuBar Alt+字母助记符交互（REQ-13）', () => {
    it('Alt+F 从外部焦点激活菜单栏并直接打开「文件」下拉（焦点进入第一项）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        createOutsideFocusTarget()

        const event = pressKey(document.body, 'f', { altKey: true })
        await flushPromises()

        expect(event.defaultPrevented).toBe(true)
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')
        expect(items[0].attributes('aria-expanded')).toBe('true')
        expect(items[1].attributes('aria-expanded')).toBe('false')
        expect(document.querySelector('.submenu-container')).not.toBeNull()
        expect(document.activeElement).toBe(topLevelRows()[0])
    })

    it('12 个顶层菜单的 Alt+字母均可打开对应下拉（REQ-13 验收：常用菜单全覆盖）', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        for (const [index, entry] of TOP_MENU_ACCESS_KEYS.entries()) {
            const event = pressKey(document.body, entry.accessKey.toLowerCase(), { altKey: true })
            await flushPromises()
            expect(event.defaultPrevented, `Alt+${entry.accessKey} 应被菜单栏消费`).toBe(true)
            expect(
                items[index].attributes('aria-expanded'),
                `Alt+${entry.accessKey} 应展开第 ${index + 1} 个顶层菜单`
            ).toBe('true')
            expect(document.activeElement).toBe(topLevelRows()[0])

            // Esc 关闭当前下拉，进入下一轮（焦点按既有契约回到顶层菜单项）
            pressKey(document.activeElement ?? items[index].element, 'Escape')
            await flushPromises()
            expect(document.querySelector('.submenu-container')).toBeNull()
        }
    })

    it('单独 Alt 激活后按 Alt+E 打开「编辑」菜单，激活态保留且再次 Alt 归还原焦点', async () => {
        const w = mountMenuBar()
        const items = topItems(w)
        const outside = createOutsideFocusTarget()

        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        expect(document.activeElement).toBe(items[0].element)
        expect(menubarRoot(w).classes()).toContain('menu-bar--alt-active')

        const event = pressKey(items[0].element, 'e', { altKey: true })
        await flushPromises()
        expect(event.defaultPrevented).toBe(true)
        expect(items[1].attributes('aria-expanded')).toBe('true')
        expect(items[0].attributes('aria-expanded')).toBe('false')
        expect(document.activeElement).toBe(topLevelRows()[0])
        // 编辑菜单第一项「撤销」（确认换的是下拉内容而不只是焦点）
        expect(topLevelRows()[0].textContent).toContain('撤销')
        // 与单独 Alt 的退出语义共存：菜单打开时再次 Alt → 关闭并归还激活前焦点
        pressKey(document.activeElement ?? items[1].element, 'Alt', { altKey: true })
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('已有下拉展开时 Alt+V 切换到「视图」菜单（复用既有切换/聚焦语义）', async () => {
        const w = mountMenuBar()
        await openFileMenuByKeyboard(w)
        const items = topItems(w)

        const event = pressKey(document.activeElement ?? document.body, 'v', { altKey: true })
        await flushPromises()
        expect(event.defaultPrevented).toBe(true)
        expect(items[2].attributes('aria-expanded')).toBe('true')
        expect(items[0].attributes('aria-expanded')).toBe('false')
        expect(document.activeElement).toBe(topLevelRows()[0])
        // 视图菜单第一项「编辑模式」
        expect(topLevelRows()[0].textContent).toContain('编辑模式')
    })

    it('未映射的 Alt+字母不消费按键、不激活菜单栏（交给既有规则）', async () => {
        const w = mountMenuBar()
        const outside = createOutsideFocusTarget()
        for (const key of ['q', 'x', 'z']) {
            const event = pressKey(document.body, key, { altKey: true })
            expect(event.defaultPrevented, `Alt+${key} 不应被菜单栏消费`).toBe(false)
        }
        await nextTick()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('系统组合键与修饰组合不劫持（Alt+F4 / Alt+Tab / Alt+Shift+F / Ctrl+Alt+F）', async () => {
        const w = mountMenuBar()
        const outside = createOutsideFocusTarget()
        const combos: KeyboardEventInit[] = [
            { key: 'F4', altKey: true },
            { key: 'Tab', altKey: true },
            { key: 'f', altKey: true, shiftKey: true },
            { key: 'f', altKey: true, ctrlKey: true },
            { key: 'f', altKey: true, metaKey: true },
            { key: 'f', altKey: true, repeat: true }
        ]
        for (const init of combos) {
            const event = pressKey(document.body, init.key ?? '', init)
            expect(event.defaultPrevented, `组合键 ${init.key} 不应被助记符消费`).toBe(false)
        }
        await nextTick()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('输入法组字中的 Alt+字母不响应（不打开菜单、不消费按键）', async () => {
        const w = mountMenuBar()
        const outside = createOutsideFocusTarget()

        const event = pressComposingKey(document.body, 'f', { altKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(outside)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('焦点在对话框内时 Alt+字母不激活菜单栏（不抢模态浮层焦点）', async () => {
        const w = mountMenuBar()
        const dialog = document.createElement('div')
        dialog.setAttribute('role', 'dialog')
        dialog.setAttribute('aria-modal', 'true')
        const dialogButton = document.createElement('button')
        dialog.appendChild(dialogButton)
        document.body.appendChild(dialog)
        dialogButton.focus()

        const event = pressKey(dialogButton, 'f', { altKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(document.activeElement).toBe(dialogButton)
        expect(menubarRoot(w).classes()).not.toContain('menu-bar--alt-active')
    })

    it('菜单栏被宿主隐藏（Windows 原生菜单样式）时 Alt+字母不打开菜单', async () => {
        const host = document.createElement('div')
        host.style.display = 'none'
        document.body.appendChild(host)
        wrapper = mount(MenuBar, { attachTo: host })

        const event = pressKey(document.body, 'f', { altKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(wrapper.find('[role="menubar"]').classes()).not.toContain('menu-bar--alt-active')
    })

    it('可发现性提示：aria-keyshortcuts + data-mnemonic，且不改变菜单 DOM 文案', () => {
        const w = mountMenuBar()
        const items = topItems(w)
        // 读屏可通过 aria-keyshortcuts 得知 Alt+字母；data-mnemonic 供 Alt 激活态 CSS 提示
        expect(items[0].attributes('aria-keyshortcuts')).toBe('Alt+F')
        expect(items[0].attributes('data-mnemonic')).toBe('F')
        expect(items[11].attributes('aria-keyshortcuts')).toBe('Alt+H')
        expect(items[11].attributes('data-mnemonic')).toBe('H')
        // 助记符不写入 DOM 文案（既有用例按 text() === '插件' 等定位，不可回归）
        expect(items[0].text()).toBe('文件')
        expect(items[7].text()).toBe('插件')

        // Alt 激活态下由 CSS ::after + attr(data-mnemonic) 显示「字母下划线」（Windows 惯例）
        const source = fs
            .readFileSync(
                path.join(process.cwd(), 'src', 'renderer', 'src', 'components', 'MenuBar.vue'),
                'utf8'
            )
            .replace(/\r\n/g, '\n')
        expect(source).toContain('.menu-bar--alt-active .menu-item::after')
        expect(source).toMatch(/content:\s*attr\(data-mnemonic\)/)
        expect(source).toMatch(/text-decoration:\s*underline/)
    })
})

describe('resolveMenuMnemonicLetter（Alt+字母判定纯函数）', () => {
    it('只认「Alt+单个 A-Z 字母」，大小写归一为小写', () => {
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true })).toBe('f')
        expect(resolveMenuMnemonicLetter({ key: 'F', altKey: true })).toBe('f')
        expect(resolveMenuMnemonicLetter({ key: 'h', altKey: true })).toBe('h')
        expect(resolveMenuMnemonicLetter({ key: 'f' })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'F4', altKey: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'Tab', altKey: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'Alt', altKey: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: '1', altKey: true })).toBeNull()
    })

    it('带 Ctrl/Meta/Shift 的组合键、输入法组字与自动重复一律放行', () => {
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true, ctrlKey: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true, metaKey: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true, shiftKey: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true, repeat: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true, isComposing: true })).toBeNull()
        expect(resolveMenuMnemonicLetter({ key: 'f', altKey: true, keyCode: 229 })).toBeNull()
    })
})

describe('isMenuActivationAltKey（Alt 激活判定纯函数）', () => {
    it('只认「单独 Alt」：组合键、输入法组字与自动重复一律放行', () => {
        expect(isMenuActivationAltKey({ key: 'Alt' })).toBe(true)
        expect(isMenuActivationAltKey({ key: 'f' })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Tab' })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'F4' })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Alt', ctrlKey: true })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Alt', metaKey: true })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Alt', shiftKey: true })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Alt', repeat: true })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Alt', isComposing: true })).toBe(false)
        expect(isMenuActivationAltKey({ key: 'Alt', keyCode: 229 })).toBe(false)
    })
})
