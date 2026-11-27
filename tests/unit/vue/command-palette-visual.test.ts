// @vitest-environment jsdom
/**
 * 命令面板视觉与快捷键 chip 单测（视觉升级 P1-B2 / T10）
 *
 * 覆盖：
 * - 外壳材质令牌：宽度 720、圆角 --ui-radius-lg、阴影 --ui-shadow-3、玻璃透明度/模糊变量；
 * - 快捷键 chip：键位来自菜单树真源（保存 Ctrl+S、Quick Open Ctrl+P 等），
 *   并输出 aria-keyshortcuts 规范语法；
 * - 无结果空态改用统一 EmptyState 组件（T11 首批替换点）。
 *
 * 视觉计算样式由真实浏览器截图验收（jsdom 不解析 CSS 变量），本文件只断言
 * “外壳把令牌写进内联样式 / 组件渲染出对应语义节点”的可测试契约。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper, type DOMWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const handleMenuActionMock = vi.hoisted(() => vi.fn())
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

import CommandPalette from '@renderer/components/search/CommandPalette.vue'
import { IPC } from '../../../src/shared/ipc-channels'

let wrapper: VueWrapper | null = null

function mountPalette(initialMode: 'command' | 'file' = 'command'): VueWrapper {
    wrapper = mount(CommandPalette, {
        props: { visible: true, initialMode },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    return wrapper
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: vi.fn().mockResolvedValue(undefined),
            send: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn()
        }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
})

/** 按命令显示文案找命令行 */
function findOptionRow(w: VueWrapper, label: string): DOMWrapper<Element> {
    const row = w.findAll('.palette-option').find((option) => option.text().includes(label))
    expect(row, `应存在命令「${label}」`).toBeDefined()
    return row!
}

describe('命令面板：外壳四风格令牌', () => {
    it('外壳宽度 720 且内联写入圆角/阴影/玻璃透明度与模糊令牌', () => {
        const w = mountPalette()
        const container = w.find('.dialog-container')
        expect(container.exists()).toBe(true)
        const style = container.attributes('style') ?? ''
        expect(style).toContain('width: 720px')
        expect(style).toContain('--ui-radius-lg')
        expect(style).toContain('--ui-shadow-3')
        expect(style).toContain('--ui-surface-opacity')
        expect(style).toContain('--ui-surface-blur')
        expect(style).toContain('--ui-highlight-border-alpha')
    })
})

describe('命令面板：快捷键 chip（键位来自菜单树真源）', () => {
    it('保存命令显示 Ctrl+S chip 与 aria-keyshortcuts', () => {
        const w = mountPalette()
        const row = findOptionRow(w, '保存')
        const chip = row.find('.option-shortcut')
        expect(chip.exists()).toBe(true)
        expect(chip.text()).toBe('Ctrl+S')
        expect(chip.attributes('aria-hidden')).toBe('true')
        expect(row.attributes('aria-keyshortcuts')).toBe('Control+S')
    })

    it('面板自身命令（Quick Open / 命令面板 / 工作区搜索）同样显示键位', async () => {
        const w = mountPalette()
        await w.find('input.palette-input').setValue('quick-open')
        await nextTick()
        const row = findOptionRow(w, '快速打开文件')
        expect(row.find('.option-shortcut').text()).toBe('Ctrl+P')
        expect(row.attributes('aria-keyshortcuts')).toBe('Control+P')

        await w.find('input.palette-input').setValue('workspace-search')
        await nextTick()
        expect(findOptionRow(w, '工作区搜索/替换').find('.option-shortcut').text()).toBe(
            'Ctrl+Shift+F'
        )
    })

    it('无键位标注的命令不渲染 chip', async () => {
        const w = mountPalette()
        await w.find('input.palette-input').setValue('open-file')
        await nextTick()
        const rows = w.findAll('.palette-option')
        expect(rows.length).toBeGreaterThan(0)
        expect(rows[0].find('.option-shortcut').exists()).toBe(false)
    })
})

describe('命令面板：无结果空态使用统一组件', () => {
    it('命令模式无匹配时渲染 EmptyState（no-search 变体 + 复用既有文案）', async () => {
        const w = mountPalette()
        await w.find('input.palette-input').setValue('zzzz-not-exist')
        await nextTick()
        expect(w.findAll('.palette-option')).toHaveLength(0)
        const empty = w.find('.palette-list .empty-state')
        expect(empty.exists()).toBe(true)
        expect(empty.classes()).toContain('empty-state--no-search')
        expect(empty.classes()).toContain('empty-state--compact')
        expect(empty.find('.empty-state__title').text()).toBe('没有匹配的命令')
        expect(empty.attributes('role')).toBe('status')
    })

    it('文件模式无文件时同样渲染 EmptyState', async () => {
        vi.stubGlobal('electron', {
            ipcRenderer: {
                invoke: vi.fn().mockImplementation(async (channel: string) => {
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
        const w = mountPalette('file')
        await flushPromises()
        const empty = w.find('.palette-list .empty-state')
        expect(empty.exists()).toBe(true)
        expect(empty.find('.empty-state__title').text()).toBe('工作区中没有可打开的文件')
    })
})
