// @vitest-environment node
/**
 * A9 命令注册表单测（2026-11-21）
 *
 * 覆盖点：
 * 1. 命令清单完整性（既有能力复用 menuAction + A2/A9 自身动作）；
 * 2. 命令的 labelKey/categoryKey 命名空间统一（`editorUi.commandPalette.*`）；
 * 3. **菜单动作 id 与 menu-config 菜单树一致**（防止命令面板与菜单栏漂移）；
 * 4. 过滤逻辑：空查询、翻译名匹配、关键词匹配、子序列兜底、无结果。
 */
import { describe, it, expect } from 'vitest'

import {
    buildPaletteCommands,
    filterPaletteCommands,
    getPaletteCategoryLabel,
    getPaletteCommandLabel,
    type PaletteCommand,
    type PaletteCommandHandlers
} from '../../../src/renderer/src/components/search/command-registry'
import { menuMap } from '../../../src/renderer/src/components/MenuBar/menu-config'

/** 测试用菜单动作分发替身（不真正执行） */
const handlers: PaletteCommandHandlers = {
    runMenuAction: () => {},
    openWorkspaceSearch: () => {},
    switchMode: () => {}
}

const commands = buildPaletteCommands(handlers)

/** 收集菜单树中全部 menuAction（与 menu-config 单真源保持一致） */
function collectMenuActions(items: typeof menuMap.value, out: string[] = []): string[] {
    for (const item of items) {
        if (typeof item.menuAction === 'string') {
            out.push(item.menuAction)
        }
        if (Array.isArray(item.submenu)) {
            collectMenuActions(item.submenu, out)
        }
    }
    return out
}

const MENU_ACTIONS = new Set(collectMenuActions(menuMap.value))

/** 模拟词典翻译（命令面板新增 i18n 键由主控统一补；单测用假翻译验证过滤逻辑） */
const TRANSLATIONS: Record<string, string> = {
    'editorUi.commandPalette.command.save': '保存',
    'editorUi.commandPalette.command.openFolder': '打开文件夹',
    'editorUi.commandPalette.command.insertMermaid': '插入 Mermaid 图表',
    'editorUi.commandPalette.command.workspaceSearch': '工作区搜索/替换',
    'editorUi.commandPalette.category.file': '文件',
    'editorUi.commandPalette.category.insert': '插入',
    'editorUi.commandPalette.category.search': '搜索'
}
const translate = (key: string): string => TRANSLATIONS[key] ?? key

describe('buildPaletteCommands：命令清单', () => {
    it('包含既有能力命令 + A2/A9 自身命令，id 唯一', () => {
        const ids = commands.map((command) => command.id)
        expect(ids).toEqual([
            'save',
            'open-folder',
            'open-file',
            'find',
            'replace',
            'goto-line',
            'outline',
            'insert-table',
            'insert-math',
            'insert-mermaid',
            'workspace-search',
            'quick-open',
            'command-palette',
            'front-matter',
            'knowledge-tags',
            'knowledge-links',
            'knowledge-backlinks'
        ])
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('所有命令提供 labelKey/categoryKey，且命名空间统一', () => {
        for (const command of commands) {
            expect(command.labelKey.startsWith('editorUi.commandPalette.command.')).toBe(true)
            expect(command.categoryKey.startsWith('editorUi.commandPalette.category.')).toBe(true)
            expect(command.keywords.length).toBeGreaterThan(0)
        }
    })

    it('菜单动作型命令的 menuAction 均存在于 menu-config 菜单树（不复制菜单数据）', () => {
        const menuCommands = commands.filter((command) => command.menuAction !== undefined)
        expect(menuCommands.length).toBeGreaterThanOrEqual(10)
        for (const command of menuCommands) {
            expect(MENU_ACTIONS.has(command.menuAction as string), command.menuAction).toBe(true)
        }
    })

    it('自定义命令（工作区搜索/模式切换）提供 run 函数且不提供 menuAction', () => {
        for (const id of ['workspace-search', 'quick-open', 'command-palette']) {
            const command = commands.find((item) => item.id === id) as PaletteCommand
            expect(command).toBeDefined()
            expect(typeof command.run).toBe('function')
            expect(command.menuAction).toBeUndefined()
        }
    })

    it('模式切换命令不关闭面板（closeOnRun=false），菜单命令默认执行后关闭', () => {
        expect(commands.find((command) => command.id === 'quick-open')?.closeOnRun).toBe(false)
        expect(commands.find((command) => command.id === 'command-palette')?.closeOnRun).toBe(false)
        expect(commands.find((command) => command.id === 'save')?.closeOnRun).toBeUndefined()
    })

    it('执行入口接线到注入的 handlers（不复制实现）', () => {
        const calls: string[] = []
        const customHandlers: PaletteCommandHandlers = {
            runMenuAction: (action: string) => calls.push(`menu:${action}`),
            openWorkspaceSearch: () => calls.push('workspace-search'),
            switchMode: (mode: string) => calls.push(`mode:${mode}`)
        }
        const customCommands = buildPaletteCommands(customHandlers)
        customCommands.find((command) => command.id === 'workspace-search')?.run?.()
        customCommands.find((command) => command.id === 'quick-open')?.run?.()
        customCommands.find((command) => command.id === 'command-palette')?.run?.()
        expect(calls).toEqual(['workspace-search', 'mode:file', 'mode:command'])
    })
})

describe('filterPaletteCommands：过滤', () => {
    it('空查询返回全部且保持注册顺序', () => {
        expect(filterPaletteCommands(commands, '', translate).map((command) => command.id)).toEqual(
            commands.map((command) => command.id)
        )
        expect(filterPaletteCommands(commands, '   ', translate)).toHaveLength(commands.length)
    })

    it('翻译名子串命中（中文）', () => {
        const result = filterPaletteCommands(commands, '保存', translate)
        expect(result.map((command) => command.id)).toEqual(['save'])
    })

    it('关键词/id 命中（英文输入在中文界面也可用）', () => {
        expect(
            filterPaletteCommands(commands, 'mermaid', translate).map((command) => command.id)
        ).toEqual(['insert-mermaid'])
        expect(
            filterPaletteCommands(commands, 'workspace', translate).map((command) => command.id)
        ).toContain('workspace-search')
        expect(
            filterPaletteCommands(commands, 'quick-open', translate).map((command) => command.id)
        ).toEqual(['quick-open'])
    })

    it('子序列兜底匹配（wsp → workspace-search）', () => {
        const result = filterPaletteCommands(commands, 'wsp', translate)
        expect(result.map((command) => command.id)).toContain('workspace-search')
    })

    it('无命中返回空数组；大小写不敏感', () => {
        expect(filterPaletteCommands(commands, 'zzzz', translate)).toEqual([])
        expect(
            filterPaletteCommands(commands, 'MERMAID', translate).map((command) => command.id)
        ).toEqual(['insert-mermaid'])
    })

    it('显示名/分组名走注入的 translate（翻译缺失时返回键名，不抛异常）', () => {
        const command = commands[0]
        expect(getPaletteCommandLabel(command, translate)).toBe('保存')
        expect(getPaletteCategoryLabel(command, translate)).toBe('文件')
        expect(getPaletteCommandLabel(command, (key) => key)).toBe(command.labelKey)
    })
})
