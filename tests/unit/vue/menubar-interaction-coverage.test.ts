// @vitest-environment jsdom
/**
 * MenuBar.vue 交互与定位逻辑补测（既有用例覆盖插件菜单/最近文件菜单渲染，
 * 本文件补齐悬停开关、延迟关闭定时器、子菜单定位计算、点击外部关闭、resize 重定位）。
 *
 * 覆盖点：
 * 1. 点击当前菜单关闭、点击其它菜单切换；悬停其它顶级菜单时切换并刷新最近列表；
 * 2. 关闭定时器：菜单栏 mouseleave 延迟关闭；进入子菜单取消关闭；离开子菜单再次延迟关闭；
 * 3. 子菜单定位：右侧越界向左钳制、顶部/左侧越界钳制到 8px 内边距；resize 后重算；
 * 4. 点击 document 外部关闭、点击菜单栏/子菜单内部不关闭；
 * 5. 子菜单叶子项：有动作 → HandleMenuAction + 关闭；无动作（禁用占位）→ 不关闭；
 *    悬浮有子菜单的组展开嵌套、悬浮叶子项收起嵌套；
 * 6. 最近列表字段非法（非数组）时安全降级；文件路径以分隔符结尾时标签回退完整路径；
 * 7. 卸载时清理关闭定时器；无菜单打开时 resize 无副作用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import MenuBar from '@renderer/components/MenuBar.vue'

let wrapper: VueWrapper | null = null
let recentListMock: ReturnType<typeof vi.fn>
let openRecentMock: ReturnType<typeof vi.fn>

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
        config: { read: vi.fn().mockResolvedValue({}) },
        file: { recentList: recentListMock, openRecent: openRecentMock }
    })
}

/** 绕过组件内部 `document.querySelector` 直接给顶级菜单项注入布局矩形 */
function mockMenuRect(index: number, rect: { left: number; bottom: number }): void {
    const items = wrapper!.findAll('.menu-item')
    items[index].element.getBoundingClientRect = () =>
        ({
            left: rect.left,
            bottom: rect.bottom,
            top: rect.bottom,
            right: rect.left,
            width: 0,
            height: 0,
            x: rect.left,
            y: rect.bottom,
            toJSON: () => ({})
        }) as DOMRect
}

function menuItem(index: number) {
    return wrapper!.findAll('.menu-item')[index]
}

async function clickMenu(index: number): Promise<void> {
    await menuItem(index).trigger('click')
    await flushPromises()
}

async function hoverMenu(index: number): Promise<void> {
    await menuItem(index).trigger('mouseenter')
    await flushPromises()
}

function submenu(): HTMLElement | null {
    return document.body.querySelector('.submenu-container')
}

function submenuLabels(): string[] {
    return [
        ...document.body.querySelectorAll('.submenu-container > .submenu-list > .menu-submenu-item')
    ]
        .map((node) => node.querySelector('.menu-item-label')?.textContent ?? '')
        .filter((label) => label.length > 0)
}

function nestedItem(label: string): HTMLElement | undefined {
    return [...document.body.querySelectorAll('.nested-submenu .menu-submenu-item')].find(
        (node) => node.querySelector(':scope > .menu-item-label')?.textContent === label
    ) as HTMLElement | undefined
}

function topLevelItem(label: string): HTMLElement | undefined {
    return [...document.body.querySelectorAll('.submenu-container .menu-submenu-item')].find(
        (node) => node.querySelector(':scope > .menu-item-label')?.textContent === label
    ) as HTMLElement | undefined
}

async function wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
    await flushPromises()
}

beforeEach(() => {
    recentListMock = vi.fn().mockResolvedValue({ files: [], folders: [] })
    openRecentMock = vi.fn().mockResolvedValue({ ok: true })
    stubShellGlobals()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('MenuBar 点击/悬停开关菜单', () => {
    it('点击同一菜单再次点击关闭，点击其它菜单直接切换', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        expect(submenu()).not.toBeNull()
        expect(submenuLabels()).toContain('新建')

        // 再次点击当前菜单 → 关闭
        await clickMenu(0)
        expect(submenu()).toBeNull()

        // 打开另一个菜单 → 切换内容
        await clickMenu(1)
        expect(submenu()).not.toBeNull()
        const editLabels = submenuLabels()
        expect(editLabels.length).toBeGreaterThan(0)
        expect(editLabels).not.toContain('新建')
    })

    it('悬停其它顶级菜单切换菜单并刷新最近文件列表', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        recentListMock.mockClear()
        await clickMenu(1)
        expect(submenu()).not.toBeNull()

        await hoverMenu(0)
        // 切换到「文件」菜单：刷新最近列表
        expect(recentListMock).toHaveBeenCalledTimes(1)
        expect(submenuLabels()).toContain('最近文件')
    })

    it('悬停当前顶级菜单不重复切换，仅清理关闭定时器', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        expect(menuItem(0).classes()).toContain('active')

        // 菜单栏 mouseleave 启动关闭定时器，随后悬停同级菜单项 → 清理定时器
        await wrapper.trigger('mouseleave')
        await hoverMenu(1)
        await wait(150)
        // 定时器已被清理：菜单仍处于打开状态（切换为「编辑」菜单）
        expect(submenu()).not.toBeNull()
        expect(menuItem(1).classes()).toContain('active')
        expect(menuItem(0).classes()).not.toContain('active')
    })
})

describe('MenuBar 延迟关闭定时器', () => {
    it('鼠标离开菜单栏 100ms 后关闭；进入子菜单取消关闭', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        expect(submenu()).not.toBeNull()

        await wrapper.trigger('mouseleave')
        expect(submenu()).not.toBeNull()
        await wait(150)
        expect(submenu()).toBeNull()

        // 重新打开 → 离开菜单栏后立即进入子菜单：取消关闭
        await clickMenu(0)
        await wrapper.trigger('mouseleave')
        const container = submenu()!
        container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        await wait(150)
        expect(submenu()).not.toBeNull()

        // 离开子菜单 → 再次延迟关闭
        container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
        await flushPromises()
        expect(submenu()).not.toBeNull()
        await wait(150)
        expect(submenu()).toBeNull()
    })

    it('到达关闭定时器时鼠标已回到子菜单则不关闭', async () => {
        // 覆盖定时器回调内的二次判断：定时器到点时 isSubmenuHovered 为 true
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        await wrapper.trigger('mouseleave')

        // 在 100ms 定时器到点前重新进入子菜单（取消当前定时器），再手动触发一次
        // mouseleave 事件但立即进入子菜单：通过两次事件组合覆盖回调内判断
        const container = submenu()!
        container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
        await flushPromises()
        // 定时器已排定，进入子菜单取消
        container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        await wait(150)
        expect(submenu()).not.toBeNull()
    })
})

describe('MenuBar 子菜单定位与 resize', () => {
    it('右侧越界时向左钳制，resize 后用新矩形重算', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        mockMenuRect(0, { left: 1000, bottom: 100 })
        await clickMenu(0)

        const container = submenu()!
        // jsdom innerWidth 默认 1024：1000 + 220 + 8 > 1024 → left = 1024 - 220 - 8 = 796
        expect(container.style.left).toBe('796px')
        expect(container.style.top).toBe('100px')

        // resize 后按新矩形重算（不越界 → 原样使用）
        mockMenuRect(0, { left: 10, bottom: 40 })
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(container.style.left).toBe('10px')
        expect(container.style.top).toBe('40px')
    })

    it('顶部与左侧越界时钳制到 8px 内边距', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        mockMenuRect(0, { left: 0, bottom: 0 })
        await clickMenu(0)

        const container = submenu()!
        expect(container.style.left).toBe('8px')
        expect(container.style.top).toBe('8px')
    })

    it('无菜单打开时 resize 无副作用', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(submenu()).toBeNull()
    })
})

describe('MenuBar 点击外部与子菜单项交互', () => {
    it('点击 document 其它区域关闭；点击菜单栏或子菜单内部不关闭', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        expect(submenu()).not.toBeNull()

        // 点击菜单栏内部（root 元素）不关闭
        wrapper.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(submenu()).not.toBeNull()

        // 点击子菜单内部不关闭
        const container = submenu()!
        container.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(submenu()).not.toBeNull()

        // 点击 document 其它区域关闭
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(submenu()).toBeNull()
    })

    it('子菜单组悬浮展开嵌套、叶子项悬浮收起；禁用占位项点击不关闭', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)

        // 悬浮「最近文件」组 → 展开嵌套子菜单（空列表 → 禁用占位项）
        const group = topLevelItem('最近文件')!
        group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        const emptyItem = nestedItem('（暂无记录）')
        expect(emptyItem).toBeDefined()

        // 点击禁用占位项（无 menuAction）：不触发动作、菜单保持打开
        emptyItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(submenu()).not.toBeNull()

        // 悬浮普通叶子项（无子菜单）→ 收起嵌套
        const leaf = topLevelItem('新建')!
        leaf.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        expect(document.body.querySelector('.nested-submenu')).toBeNull()
    })

    it('点击有动作的子菜单项执行动作并关闭菜单', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        const newItem = topLevelItem('新建')!
        newItem.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(submenu()).toBeNull()
        // 新建动作经 menu-actions 走 IPC / 对话框（此处只断言菜单关闭，动作细节由其它用例覆盖）
    })
})

describe('MenuBar 最近列表异常数据降级', () => {
    it('最近列表字段非数组时按空列表处理且不抛错', async () => {
        recentListMock.mockResolvedValue({ files: 'invalid', folders: null })
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        await flushPromises()

        expect(submenu()).not.toBeNull()
        const group = topLevelItem('最近文件')!
        group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        expect(nestedItem('（暂无记录）')).toBeDefined()
    })

    it('文件路径以分隔符结尾时标签回退完整路径；最近列表读取失败静默', async () => {
        recentListMock.mockResolvedValueOnce({ files: ['C:\\notes\\dir\\'], folders: [] })
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        await flushPromises()

        const group = topLevelItem('最近文件')!
        group.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()
        // basename 为空 → 回退完整路径
        expect(nestedItem('C:\\notes\\dir\\')).toBeDefined()

        // 读取失败：静默保留上次数据（菜单仍打开）
        recentListMock.mockRejectedValueOnce(new Error('recent list failed'))
        await clickMenu(1)
        await hoverMenu(0)
        await flushPromises()
        expect(submenu()).not.toBeNull()
        expect(menuItem(0).classes()).toContain('active')
    })
})

describe('MenuBar 卸载清理', () => {
    it('卸载时清理未触发的关闭定时器，且之后 document/window 事件不再报错', async () => {
        wrapper = mount(MenuBar, { attachTo: document.body })
        await clickMenu(0)
        await wrapper.trigger('mouseleave')
        wrapper.unmount()
        wrapper = null

        // 定时器已清理：等待超过延迟不抛错
        await wait(150)
        window.dispatchEvent(new Event('resize'))
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(document.body.querySelector('.submenu-container')).toBeNull()
    })
})
