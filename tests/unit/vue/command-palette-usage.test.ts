// @vitest-environment jsdom
/**
 * A9 命令面板最近命令 / 分组折叠 / 空态建议组件单测（1.5.6 P2 批次 C：REQ-10 + REQ-11）
 *
 * 覆盖：
 * 1. 命令执行后写入本机使用历史（localStorage `baize:command-palette:usage`）；
 * 2. 空查询「最近使用」分区置顶、按最近时间排序、最多 5 条、与分类分组去重；
 * 3. 搜索排序使用权重（最近使用过的命令在同等匹配层内靠前）；
 * 4. 分组折叠：按钮 aria-expanded、localStorage 持久化、重新打开仍保持折叠；
 * 5. 折叠后键盘 ↑↓/Enter 只经过可见行（不执行被折叠项）；
 * 6. 空态「相关命令」建议：与真实结果视觉/语义区分、最多 5 条、Enter 可执行；
 * 7. 既有空态（无建议）与键盘选择不回归；storage 损坏时静默降级。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const handleMenuActionMock = vi.hoisted(() => vi.fn())
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

import CommandPalette from '@renderer/components/search/CommandPalette.vue'
import {
    COMMAND_COLLAPSED_GROUPS_STORAGE_KEY,
    COMMAND_USAGE_STORAGE_KEY
} from '../../../src/renderer/src/components/search/command-palette-storage'
import { IPC } from '../../../src/shared/ipc-channels'

/** 使用记录（命令 id → { lastUsed, count }） */
type SeededUsage = Record<string, { lastUsed: number; count: number }>

let wrappers: VueWrapper[] = []

/** 挂载命令面板（命令模式） */
function mountPalette(): VueWrapper {
    const wrapper = mount(CommandPalette, {
        props: { visible: true, initialMode: 'command' },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

/** 预置使用历史（模拟历史执行记录） */
function seedUsage(usage: SeededUsage): void {
    window.localStorage.setItem(COMMAND_USAGE_STORAGE_KEY, JSON.stringify(usage))
}

/** 读取已持久化的使用历史 */
function readStoredUsage(): SeededUsage {
    const raw = window.localStorage.getItem(COMMAND_USAGE_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SeededUsage) : {}
}

/** 读取已持久化的折叠分组 key */
function readStoredCollapsedGroups(): string[] {
    const raw = window.localStorage.getItem(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
}

/** 全部分区标题按钮文案（顺序 = DOM 顺序） */
function groupTitleTexts(wrapper: VueWrapper): string[] {
    return wrapper.findAll('button.palette-group-title').map((button) => button.text())
}

/** 第一个分区（最近使用或首个分类）内的命令行数量 */
function firstSectionOptionCount(wrapper: VueWrapper): number {
    const firstGroup = wrapper.findAll('[role="group"]')[0]
    return firstGroup ? firstGroup.findAll('.palette-option').length : 0
}

beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: vi.fn(async (channel: string) => {
                if (channel === IPC.FILE.SEARCH_WORKSPACE) {
                    return {
                        ok: true,
                        files: [],
                        fileList: [],
                        truncated: false,
                        matchCount: 0,
                        scannedFiles: 0
                    }
                }
                return undefined
            }),
            send: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn()
        }
    })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    window.localStorage.clear()
    vi.unstubAllGlobals()
})

describe('REQ-10 命令执行历史记录', () => {
    it('执行命令后写入使用历史（count 累加、lastUsed 为正时间戳）', async () => {
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').trigger('keydown', { key: 'Enter' })

        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:save')
        const stored = readStoredUsage()
        expect(stored.save?.count).toBe(1)
        expect(stored.save?.lastUsed).toBeGreaterThan(0)
    })

    it('命令执行失败不记录使用历史', async () => {
        handleMenuActionMock.mockImplementationOnce(() => {
            throw new Error('menu dispatch failed')
        })
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').trigger('keydown', { key: 'Enter' })
        expect(wrapper.find('.palette-hint--error').exists()).toBe(true)
        expect(readStoredUsage()).toEqual({})
    })
})

describe('REQ-10 空查询「最近使用」分区', () => {
    it('最近使用分区置顶，按最近执行时间倒序，且不与分类分组重复', async () => {
        seedUsage({
            'insert-table': { lastUsed: 100, count: 1 },
            save: { lastUsed: 200, count: 3 }
        })
        const wrapper = mountPalette()

        expect(groupTitleTexts(wrapper)[0]).toBe('最近使用')
        const options = wrapper.findAll('.palette-option')
        expect(options[0].text()).toContain('保存')
        expect(options[1].text()).toContain('Markdown 表格')
        // 共 19 条命令（1.5.7 LLM Wiki L1 起）：2 条置顶 + 其余分组仍为 19 条（置顶项从分组中移除，不重复）
        expect(options).toHaveLength(19)
        expect(options.filter((option) => option.text().includes('保存'))).toHaveLength(1)
    })

    it('最近使用最多展示 5 条（超出按最近时间截断）', () => {
        seedUsage({
            save: { lastUsed: 600, count: 1 },
            'open-folder': { lastUsed: 500, count: 1 },
            'open-file': { lastUsed: 400, count: 1 },
            find: { lastUsed: 300, count: 1 },
            replace: { lastUsed: 200, count: 1 },
            'goto-line': { lastUsed: 100, count: 1 }
        })
        const wrapper = mountPalette()
        expect(firstSectionOptionCount(wrapper)).toBe(5)
        expect(groupTitleTexts(wrapper)[0]).toBe('最近使用')
    })

    it('重新打开面板后仍展示最近使用（本机持久化生效）', async () => {
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').trigger('keydown', { key: 'Enter' })

        await wrapper.setProps({ visible: false })
        await wrapper.setProps({ visible: true })
        await nextTick()

        expect(groupTitleTexts(wrapper)[0]).toBe('最近使用')
        expect(wrapper.findAll('.palette-option')[0].text()).toContain('保存')
    })

    it('模式切换类命令（不关闭面板）不进入最近使用分区', async () => {
        seedUsage({
            'quick-open': { lastUsed: 300, count: 1 },
            save: { lastUsed: 100, count: 1 }
        })
        const wrapper = mountPalette()
        expect(groupTitleTexts(wrapper)[0]).toBe('最近使用')
        const options = wrapper.findAll('.palette-option')
        expect(options[0].text()).toContain('保存')
        // 「快速打开文件」不在最近使用分区置顶（仍在搜索分组内）
        expect(
            wrapper.findAll('[role="group"]')[0].findAll('.palette-option')[0].text()
        ).not.toContain('快速打开文件')
    })
})

describe('REQ-10 搜索排序使用权重', () => {
    it('同等匹配层内，最近使用过的命令排在前面', async () => {
        seedUsage({ 'insert-mermaid': { lastUsed: 500, count: 2 } })
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')

        await input.setValue('insert')
        await nextTick()
        expect(wrapper.findAll('.palette-option')[0].text()).toContain('Mermaid')
    })

    it('未使用过的命令保持原始注册顺序（无历史时）', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.setValue('insert')
        await nextTick()
        expect(wrapper.findAll('.palette-option')[0].text()).toContain('Markdown 表格')
    })
})

describe('REQ-11 分组折叠', () => {
    it('分组标题是原生按钮：aria-expanded 同步、点击折叠并持久化', async () => {
        const wrapper = mountPalette()
        const buttons = wrapper.findAll('button.palette-group-title')
        expect(buttons[0].attributes('aria-expanded')).toBe('true')
        // 展开时 aria-controls 指向分区内容容器（折叠后容器不渲染，属性同步省略）
        expect(buttons[0].attributes('aria-controls')).toBeTruthy()
        const before = wrapper.findAll('.palette-option').length
        expect(before).toBe(19)

        await buttons[0].trigger('click')
        expect(wrapper.findAll('button.palette-group-title')[0].attributes('aria-expanded')).toBe(
            'false'
        )
        expect(wrapper.findAll('button.palette-group-title')[0].attributes('aria-controls')).toBe(
            undefined
        )
        // 文件分组 4 条命令被折叠（保存 / 打开文件夹 / 打开文件 / 初始化 LLM Wiki）
        expect(wrapper.findAll('.palette-option')).toHaveLength(before - 4)
        expect(readStoredCollapsedGroups()).toContain('editorUi.commandPalette.category.file')
    })

    it('折叠状态跨面板重建保持（localStorage 记忆）', async () => {
        const wrapper = mountPalette()
        await wrapper.findAll('button.palette-group-title')[0].trigger('click')

        const reopened = mountPalette()
        expect(reopened.findAll('button.palette-group-title')[0].attributes('aria-expanded')).toBe(
            'false'
        )
        expect(groupTitleTexts(reopened)[0]).toBe('文件')
        // 19 条 - 文件分组 4 条 = 15 条仍在展开分组中
        expect(reopened.findAll('.palette-option')).toHaveLength(15)
    })

    it('折叠后键盘选择只经过可见行（不执行被折叠项）', async () => {
        const wrapper = mountPalette()
        await wrapper.findAll('button.palette-group-title')[0].trigger('click')
        const input = wrapper.find('input.palette-input')

        // 首项从文件分组的「保存」变为编辑分组的「查找」
        await input.trigger('keydown', { key: 'Enter' })
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:edit:find-in-file')
    })

    it('折叠状态存储损坏时容错为全部展开', () => {
        window.localStorage.setItem(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY, 'not-json')
        const wrapper = mountPalette()
        expect(wrapper.findAll('.palette-option')).toHaveLength(19)
        expect(wrapper.findAll('button.palette-group-title')[0].attributes('aria-expanded')).toBe(
            'true'
        )
    })
})

describe('REQ-11 空态「相关命令」建议', () => {
    it('无真实匹配时展示相关命令建议（独立分区 + 建议徽标 + 虚线区分）', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.setValue('存档')
        await nextTick()

        // 真实结果为空（建议项不复用 .palette-option，避免与真实结果混淆）
        expect(wrapper.findAll('.palette-option')).toHaveLength(0)
        expect(wrapper.find('.empty-state').exists()).toBe(true)
        expect(wrapper.find('.empty-state__description').text()).toContain('相近建议')

        const suggestions = wrapper.findAll('.palette-suggestion')
        expect(suggestions.length).toBeGreaterThan(0)
        expect(suggestions.length).toBeLessThanOrEqual(5)
        expect(suggestions[0].text()).toContain('保存')
        expect(suggestions[0].text()).toContain('建议')
        expect(suggestions[0].attributes('role')).toBe('option')
        expect(suggestions[0].attributes('aria-selected')).toBe('true')
        // 独立建议分区（带标题，读屏可感知「建议」语境）
        const suggestionGroup = wrapper.find('.palette-suggestions')
        expect(suggestionGroup.attributes('role')).toBe('group')
        expect(suggestionGroup.text()).toContain('相关命令')
    })

    it('建议项可回车执行（与真实命令共用执行链路）', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.setValue('存档')
        await nextTick()

        await input.trigger('keydown', { key: 'Enter' })
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:save')
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('建议项可点击执行', async () => {
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').setValue('存档')
        await nextTick()

        await wrapper.findAll('.palette-suggestion')[0].trigger('click')
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:save')
    })

    it('无建议时保留既有空态（不渲染建议分区）', async () => {
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').setValue('zzzz-not-exist')
        await nextTick()

        expect(wrapper.findAll('.palette-suggestion')).toHaveLength(0)
        expect(wrapper.find('.empty-state__title').text()).toBe('没有匹配的命令')
    })
})

describe('键盘行为不回归', () => {
    it('↑ 从首项循环到末项并回车执行', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.trigger('keydown', { key: 'ArrowUp' })
        await input.trigger('keydown', { key: 'Enter' })
        // 19 条命令末项为「附件管理」（1.5.7 新增的初始化 LLM Wiki 在文件分组内，不改末项）
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:edit:attachments')
    })

    it('↓ 移动选择后回车执行下一项', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.trigger('keydown', { key: 'ArrowDown' })
        await input.trigger('keydown', { key: 'Enter' })
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:open-folder')
    })

    it('Esc 关闭面板（BaseDialog 键盘契约）', async () => {
        const wrapper = mountPalette()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('使用历史存储损坏时静默降级（面板照常渲染、无最近分区）', () => {
        window.localStorage.setItem(COMMAND_USAGE_STORAGE_KEY, '{broken-json')
        const wrapper = mountPalette()
        expect(wrapper.findAll('.palette-option')).toHaveLength(19)
        expect(groupTitleTexts(wrapper)[0]).toBe('文件')
    })

    it('文件模式仍按原逻辑渲染（README 文件清单）', async () => {
        const wrapper = mount(CommandPalette, {
            props: { visible: true, initialMode: 'file' },
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        wrappers.push(wrapper)
        await flushPromises()
        expect(wrapper.find('input.palette-input').exists()).toBe(true)
        expect(wrapper.findAll('.palette-suggestion')).toHaveLength(0)
    })
})
