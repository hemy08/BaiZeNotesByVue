/**
 * 命令面板快捷键 chip 数据单测（视觉升级 P1-B2 / T10）
 *
 * 覆盖：菜单树 accelerator 递归收集、命令→菜单动作→键位的映射、真实注册表集成断言
 * （保存 Ctrl+S / Quick Open Ctrl+P / 命令面板 Ctrl+Shift+P / 工作区搜索 Ctrl+Shift+F）、
 * aria-keyshortcuts 语法转换。键位真源是菜单树（MENU-10），本模块不新增键位表。
 */
import { describe, expect, it } from 'vitest'
import {
    COMMAND_MENU_ACTION_BINDINGS,
    buildCommandAcceleratorMap,
    collectMenuAccelerators,
    toAriaKeyshortcuts
} from '../../src/renderer/src/components/search/command-shortcuts'
import { buildPaletteCommands } from '../../src/renderer/src/components/search/command-registry'
import type { BaiZeMenuEntry } from '../../src/renderer/src/components/MenuBar/menu-config'

/** 构造最小菜单树节点 */
function entry(overrides: Partial<BaiZeMenuEntry> = {}): BaiZeMenuEntry {
    return { label: '项', ...overrides }
}

describe('collectMenuAccelerators：菜单树键位收集', () => {
    it('递归收集「动作 id → accelerator」并跳过无动作/无标注项', () => {
        const tree: BaiZeMenuEntry[] = [
            entry({ menuAction: 'a:one', accelerator: 'Ctrl+A' }),
            entry({ menuAction: 'a:no-accel' }),
            entry({ label: '仅展示' }),
            { type: 'separator' },
            entry({
                label: '组',
                submenu: [
                    entry({ menuAction: 'a:nested', accelerator: 'Ctrl+N' }),
                    entry({ label: '空组', submenu: [] })
                ]
            })
        ]
        const map = collectMenuAccelerators(tree)
        expect(map.get('a:one')).toBe('Ctrl+A')
        expect(map.get('a:nested')).toBe('Ctrl+N')
        expect(map.has('a:no-accel')).toBe(false)
        expect(map.size).toBe(2)
    })

    it('同一动作重复出现时保留先出现的标注（不覆盖）', () => {
        const tree: BaiZeMenuEntry[] = [
            entry({ menuAction: 'a:dup', accelerator: 'Ctrl+1' }),
            entry({ menuAction: 'a:dup', accelerator: 'Ctrl+2' })
        ]
        expect(collectMenuAccelerators(tree).get('a:dup')).toBe('Ctrl+1')
    })

    it('空菜单树返回空映射', () => {
        expect(collectMenuAccelerators([]).size).toBe(0)
    })
})

describe('buildCommandAcceleratorMap：命令 → 键位', () => {
    const menuTree: BaiZeMenuEntry[] = [
        entry({ menuAction: 'm:save', accelerator: 'Ctrl+S' }),
        entry({ menuAction: 'm:quick-open', accelerator: 'Ctrl+P' })
    ]

    it('命令的 menuAction 命中菜单树标注', () => {
        const map = buildCommandAcceleratorMap(
            [{ id: 'save', labelKey: 'k', categoryKey: 'c', keywords: [], menuAction: 'm:save' }],
            menuTree
        )
        expect(map.get('save')).toBe('Ctrl+S')
    })

    it('面板自身命令经 COMMAND_MENU_ACTION_BINDINGS 接线到菜单树标注', () => {
        expect(COMMAND_MENU_ACTION_BINDINGS['quick-open']).toBe('baize:menu:edit:quick-open')
        const map = buildCommandAcceleratorMap(
            [{ id: 'quick-open', labelKey: 'k', categoryKey: 'c', keywords: [] }],
            [{ menuAction: 'baize:menu:edit:quick-open', accelerator: 'Ctrl+P' }]
        )
        expect(map.get('quick-open')).toBe('Ctrl+P')
    })

    it('无动作/菜单树无标注的命令不产生 chip', () => {
        const map = buildCommandAcceleratorMap(
            [
                {
                    id: 'open-file',
                    labelKey: 'k',
                    categoryKey: 'c',
                    keywords: [],
                    menuAction: 'm:unknown'
                },
                { id: 'custom', labelKey: 'k', categoryKey: 'c', keywords: [] }
            ],
            menuTree
        )
        expect(map.size).toBe(0)
    })

    it('与真实命令注册表 + 真实菜单树集成：常用命令都有正确键位', () => {
        const commands = buildPaletteCommands({
            runMenuAction: () => undefined,
            openWorkspaceSearch: () => undefined,
            switchMode: () => undefined,
            openOrCreateCaptureEntry: () => undefined,
            captureClipToNote: () => undefined,
            captureClipToEditor: () => undefined,
            ocrClipboardToEditor: () => undefined,
            ocrClipboardToClipboard: () => undefined
        })
        const map = buildCommandAcceleratorMap(commands)
        expect(map.get('save')).toBe('Ctrl+S')
        expect(map.get('open-folder')).toBe('Ctrl+O')
        expect(map.get('find')).toBe('Ctrl+F')
        expect(map.get('replace')).toBe('Ctrl+H')
        expect(map.get('goto-line')).toBe('Ctrl+G')
        // 面板自身命令（无 menuAction）经映射表接线
        expect(map.get('quick-open')).toBe('Ctrl+P')
        expect(map.get('command-palette')).toBe('Ctrl+Shift+P')
        expect(map.get('workspace-search')).toBe('Ctrl+Shift+F')
        // 「打开文件」菜单本身没有键位标注 → 不渲染 chip
        expect(map.has('open-file')).toBe(false)
    })
})

describe('toAriaKeyshortcuts：aria-keyshortcuts 语法', () => {
    it('Ctrl/Alt/Shift/Cmd 转换为规范修饰键名', () => {
        expect(toAriaKeyshortcuts('Ctrl+Shift+P')).toBe('Control+Shift+P')
        expect(toAriaKeyshortcuts('Ctrl+Alt+P')).toBe('Control+Alt+P')
        expect(toAriaKeyshortcuts('Cmd+S')).toBe('Meta+S')
        expect(toAriaKeyshortcuts('Ctrl+Y')).toBe('Control+Y')
    })

    it('功能键/数字键原样保留，单字母大写', () => {
        expect(toAriaKeyshortcuts('F4')).toBe('F4')
        expect(toAriaKeyshortcuts('F12')).toBe('F12')
        expect(toAriaKeyshortcuts('Ctrl+1')).toBe('Control+1')
        expect(toAriaKeyshortcuts('Ctrl+s')).toBe('Control+S')
    })

    it('忽略空片段', () => {
        expect(toAriaKeyshortcuts('')).toBe('')
        expect(toAriaKeyshortcuts('Ctrl+')).toBe('Control')
    })
})
