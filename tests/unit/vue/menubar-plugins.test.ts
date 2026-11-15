// @vitest-environment jsdom
/**
 * FE-16/FE-17 渲染层集成测试：插件菜单空组不再渲染、已注册插件工具入口可见可点击。
 *
 * 背景（out/full-scan/func-errors.md）：
 * - FE-16：插件菜单存在 9 个空组条目（4 个转换器子组 + 转换器外层组 + 语言关键字组 +
 *   解析器组 + 数据和命令对照表组），MenuBar.vue 以 submenu.length > 0 判定箭头，
 *   空组既无箭头也无 menuAction，点击/悬浮永远没有反应；
 * - FE-17：4 个已在 plugin-tools-const.ts 注册的插件工具没有菜单入口（功能不可达）。
 *
 * 修复：menu-config.ts 导出前统一 pruneEmptySubmenus 剪除空组；并在 pluginsMenu 中
 * 补齐 4 个已注册工具入口。本测试从 MenuBar 组件真实渲染链路验证这两点，
 * 并验证新入口点击后走既有 EventBus(PLUGIN_TOOL_SHOW) 链路（与 menu-actions.ts 拦截一致）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

// HandleMenuAction 顶部会取配置 store；测试只关心插件事件链路，避免拉起真实 store
const { showDialogMock } = vi.hoisted(() => ({ showDialogMock: vi.fn() }))
vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({ showDialog: showDialogMock })
}))

import MenuBar from '@renderer/components/MenuBar.vue'
import EventBus from '@renderer/common/event-bus/event-bus'

let wrapper: VueWrapper | null = null
let emitSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined)
        }
    })
    vi.stubGlobal('api', { config: { read: vi.fn().mockResolvedValue({}) } })
    emitSpy = vi.spyOn(EventBus, '$emit')
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    emitSpy.mockRestore()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

/** 打开「插件」菜单（子菜单 teleport 到 body） */
async function openPluginsMenu(): Promise<VueWrapper> {
    wrapper = mount(MenuBar)
    const pluginsItem = wrapper.findAll('.menu-item').find((item) => item.text() === '插件')
    expect(pluginsItem, '应存在「插件」顶级菜单').toBeDefined()
    await pluginsItem!.trigger('click')
    await flushPromises()
    return wrapper
}

function submenuLabels(): string[] {
    return [...document.body.querySelectorAll('.submenu-container .menu-item-label')].map(
        (node) => node.textContent ?? ''
    )
}

/** 在已打开的一级子菜单中鼠标悬浮到指定 label 的组，展开其嵌套子菜单 */
async function hoverSubmenuGroup(label: string): Promise<void> {
    const itemWrapper = [
        ...document.body.querySelectorAll('.submenu-container .menu-submenu-item')
    ].find((node) => node.querySelector('.menu-item-label')?.textContent === label)
    expect(itemWrapper, `应存在菜单组「${label}」`).toBeDefined()
    itemWrapper!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await flushPromises()
}

/** 点击嵌套子菜单中指定 label 的叶子项 */
async function clickNestedLeaf(label: string): Promise<void> {
    const leaf = [...document.body.querySelectorAll('.nested-submenu .menu-submenu-item')].find(
        (node) => node.querySelector('.menu-item-label')?.textContent === label
    )
    expect(leaf, `应存在嵌套菜单项「${label}」`).toBeDefined()
    leaf!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
}

describe('MenuBar 插件菜单（FE-16/FE-17）', () => {
    it('空组条目不再渲染（FE-16）', async () => {
        await openPluginsMenu()
        const labels = submenuLabels()

        // 空数据组：不应出现在渲染结果中
        expect(labels).not.toContain('语言语法关键字对照表')
        expect(labels).not.toContain('各类转换器')
        expect(labels).not.toContain('数据和命令对照表')
        // 有数据的组保留
        expect(labels).toContain('加解密插件')
        expect(labels).toContain('网络计算插件')
        expect(labels).toContain('常用对照表')
    })

    it('网络计算插件下可见已注册的 HTTP 状态码/子网掩码对照表入口，点击走 EventBus 链路（FE-17）', async () => {
        await openPluginsMenu()
        await hoverSubmenuGroup('网络计算插件')
        const nestedLabels = [
            ...document.body.querySelectorAll('.nested-submenu .menu-item-label')
        ].map((node) => node.textContent ?? '')
        expect(nestedLabels).toContain('HTTP状态码对照表')
        expect(nestedLabels).toContain('子网掩码对照表')

        await clickNestedLeaf('HTTP状态码对照表')
        expect(emitSpy).toHaveBeenCalledWith(
            'plugin-tools-show',
            'baize:menu:plugins:net:http-status-codes'
        )
        expect(showDialogMock).not.toHaveBeenCalled()
    })

    it('常用对照表下可见已注册的数字大小写/常见字体对照表入口并触发插件工具事件（FE-17）', async () => {
        await openPluginsMenu()
        await hoverSubmenuGroup('常用对照表')
        // 二级组「对照表一」再悬浮展开第三级
        const cheatSheet1 = [
            ...document.body.querySelectorAll('.nested-submenu .menu-submenu-item')
        ].find((node) => node.querySelector('.menu-item-label')?.textContent === '对照表一')
        expect(cheatSheet1, '应存在「对照表一」子组').toBeDefined()
        cheatSheet1!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        await flushPromises()

        const thirdLevelLabels = [
            ...document.body.querySelectorAll('.nested-submenu .nested-submenu .menu-item-label')
        ].map((node) => node.textContent ?? '')
        expect(thirdLevelLabels).toContain('数字大小写对照表')
        expect(thirdLevelLabels).toContain('常见字体样式对照表')

        const leaf = [
            ...document.body.querySelectorAll('.nested-submenu .nested-submenu .menu-submenu-item')
        ].find((node) => node.querySelector('.menu-item-label')?.textContent === '数字大小写对照表')
        leaf!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flushPromises()
        expect(emitSpy).toHaveBeenCalledWith(
            'plugin-tools-show',
            'baize:menu:plugins:info:numeric-case-table'
        )
    })
})
