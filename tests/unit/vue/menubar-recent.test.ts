// @vitest-environment jsdom
/**
 * 「文件」菜单 → 最近文件 / 最近文件夹（MenuBar.vue 动态注入）渲染层集成测试
 *
 * 覆盖：
 * - 打开「文件」菜单时调用 window.api.file.recentList()，把最近文件（basename 标签）与
 *   最近文件夹（路径标签）注入两个占位子菜单，各最多 20 项、超长标签截断到 60 字符；
 * - 空列表注入禁用占位项（menu.file.recentEmpty）；
 * - 点击最近文件/最近文件夹项经 menu-actions.ts 前缀拦截 → window.api.file.openRecent；
 * - 刷新失败静默（菜单仍正常打开，不抛异常）。
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

/** 打开「文件」菜单（子菜单 teleport 到 body） */
async function openFileMenu(): Promise<VueWrapper> {
    wrapper = mount(MenuBar)
    const fileMenuItem = wrapper.findAll('.menu-item')[0]
    expect(fileMenuItem.text()).toBe('文件')
    await fileMenuItem.trigger('click')
    await flushPromises()
    return wrapper
}

/** 当前一级子菜单全部标签 */
function topLevelLabels(): string[] {
    return [...document.body.querySelectorAll('.submenu-container .menu-item-label')].map(
        (node) => node.textContent ?? ''
    )
}

/** 在一级子菜单中找到指定标签的菜单项 DOM（含嵌套子菜单的组） */
function findTopLevelItem(label: string): HTMLElement | undefined {
    return [...document.body.querySelectorAll('.submenu-container .menu-submenu-item')].find(
        (node) => node.querySelector(':scope > .menu-item-label')?.textContent === label
    ) as HTMLElement | undefined
}

/** 悬浮展开一级子菜单中的组，显示其嵌套子菜单 */
async function hoverTopLevelGroup(label: string): Promise<void> {
    const item = findTopLevelItem(label)
    expect(item, `应存在一级菜单组「${label}」`).toBeDefined()
    item!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await flushPromises()
}

/** 当前展开的嵌套子菜单标签 */
function nestedLabels(): string[] {
    return [...document.body.querySelectorAll('.nested-submenu .menu-item-label')].map(
        (node) => node.textContent ?? ''
    )
}

/** 点击嵌套子菜单中指定标签的叶子项 */
async function clickNestedItem(label: string): Promise<void> {
    const leaf = [...document.body.querySelectorAll('.nested-submenu .menu-submenu-item')].find(
        (node) => node.querySelector(':scope > .menu-item-label')?.textContent === label
    )
    expect(leaf, `应存在嵌套菜单项「${label}」`).toBeDefined()
    leaf!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
}

describe('MenuBar 最近文件/最近文件夹菜单', () => {
    it('打开「文件」菜单时拉取并注入最近文件（basename）与最近文件夹（路径）', async () => {
        recentListMock.mockResolvedValue({
            files: ['C:\\docs\\note.md', 'D:\\other\\readme.md'],
            folders: ['C:\\workspace\\proj', 'D:\\work']
        })

        await openFileMenu()

        expect(recentListMock).toHaveBeenCalledTimes(1)
        expect(topLevelLabels()).toContain('最近文件')
        expect(topLevelLabels()).toContain('最近文件夹')

        await hoverTopLevelGroup('最近文件')
        expect(nestedLabels()).toEqual(['note.md', 'readme.md'])

        await hoverTopLevelGroup('最近文件夹')
        expect(nestedLabels()).toEqual(['C:/workspace/proj', 'D:/work'])
    })

    it('空列表时两个子菜单均显示禁用占位项「（暂无记录）」', async () => {
        recentListMock.mockResolvedValue({ files: [], folders: [] })

        await openFileMenu()

        await hoverTopLevelGroup('最近文件')
        expect(nestedLabels()).toEqual(['（暂无记录）'])
        const filesEmptyItem = document.body.querySelector(
            '.nested-submenu .menu-submenu-item'
        ) as HTMLElement
        expect(filesEmptyItem.classList.contains('disabled')).toBe(true)

        await hoverTopLevelGroup('最近文件夹')
        expect(nestedLabels()).toEqual(['（暂无记录）'])
    })

    it('最近列表超过 20 项时只注入前 20 项，超长标签截断到 60 字符', async () => {
        const longFolder = `C:\\${'a'.repeat(120)}`
        recentListMock.mockResolvedValue({
            files: Array.from({ length: 25 }, (_, index) => `C:\\notes\\file-${index}.md`),
            folders: [longFolder]
        })

        await openFileMenu()

        await hoverTopLevelGroup('最近文件')
        expect(nestedLabels()).toHaveLength(20)
        await hoverTopLevelGroup('最近文件夹')
        const folderLabels = nestedLabels()
        expect(folderLabels).toHaveLength(1)
        expect(folderLabels[0]).toHaveLength(60)
        expect(folderLabels[0].endsWith('...')).toBe(true)
    })

    it('点击最近文件项经前缀拦截调用 openRecent（kind=file，路径已解码）', async () => {
        recentListMock.mockResolvedValue({ files: ['C:\\文档\\最近笔记 a.md'], folders: [] })

        await openFileMenu()
        await hoverTopLevelGroup('最近文件')
        await clickNestedItem('最近笔记 a.md')

        expect(openRecentMock).toHaveBeenCalledWith({
            kind: 'file',
            path: 'C:\\文档\\最近笔记 a.md'
        })
    })

    it('点击最近文件夹项经前缀拦截调用 openRecent（kind=folder）', async () => {
        recentListMock.mockResolvedValue({ files: [], folders: ['C:\\workspace\\proj'] })

        await openFileMenu()
        await hoverTopLevelGroup('最近文件夹')
        await clickNestedItem('C:/workspace/proj')

        expect(openRecentMock).toHaveBeenCalledWith({
            kind: 'folder',
            path: 'C:\\workspace\\proj'
        })
    })

    it('刷新失败时静默降级：菜单仍正常打开且不抛异常', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        recentListMock.mockRejectedValue(new Error('ipc broken'))

        await openFileMenu()

        expect(topLevelLabels()).toContain('新建')
        expect(topLevelLabels()).toContain('打开文件夹')
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})
