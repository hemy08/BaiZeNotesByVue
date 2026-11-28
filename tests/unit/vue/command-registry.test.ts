// @vitest-environment node
/**
 * A9 命令注册表单测（2026-11-21，1.5.2 增补 E6 日常记录 / E1 剪贴板剪藏）
 *
 * 覆盖点：
 * 1. 命令清单完整性（既有能力复用 menuAction + A2/A9 自身动作 + E6/E1 可选能力命令）；
 * 2. 命令的 labelKey/categoryKey 命名空间统一（`editorUi.commandPalette.*`）；
 * 3. **菜单动作 id 与 menu-config 菜单树一致**（防止命令面板与菜单栏漂移）；
 * 4. 过滤逻辑：空查询、翻译名匹配、关键词匹配、子序列兜底、无结果；
 * 5. 1.5.2 E6/E1：`featureDailyNotes` / `featureClipCapture` 关闭时对应命令**不注册**
 *    （isFeatureEnabled 过滤），开启时注册且执行函数把动作交给注入处理器。
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
    switchMode: () => {},
    openOrCreateCaptureEntry: () => {},
    captureClipToNote: () => {},
    captureClipToEditor: () => {},
    ocrClipboardToEditor: () => {},
    ocrClipboardToClipboard: () => {}
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
            // 1.5.7 LLM Wiki L1：初始化工作区（raw/ 与 wiki/）
            'initialize-llm-wiki',
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
            'knowledge-backlinks',
            'attachments',
            'daily-note',
            'inbox-capture',
            'clip-to-note',
            'clip-to-editor',
            'ocr-insert',
            'ocr-copy'
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

    // 1.5.7 LLM Wiki L1：初始化工作区命令（动作 id 与 menu-config 的「文件 → 初始化 LLM Wiki」一致）
    it('注册「初始化 LLM Wiki」命令：id/分类/关键词/menuAction 契约', () => {
        const command = commands.find((item) => item.id === 'initialize-llm-wiki')
        expect(command).toBeDefined()
        expect(command!.menuAction).toBe('baize:file:initialize-llm-wiki')
        expect(command!.categoryKey).toBe('editorUi.commandPalette.category.file')
        expect(command!.keywords).toEqual(['llm', 'wiki', 'raw', '初始化'])
        expect(command!.labelKey.startsWith('editorUi.commandPalette.command.')).toBe(true)
        // 动作 id 已存在于菜单树（命令与会菜单共用同一分发链路）
        expect(MENU_ACTIONS.has(command!.menuAction as string)).toBe(true)
    })

    it('「初始化 LLM Wiki」命令可按英文/中文关键词命中', () => {
        const byWiki = filterPaletteCommands(commands, 'wiki', translate).map(
            (command) => command.id
        )
        expect(byWiki).toContain('initialize-llm-wiki')
        expect(filterPaletteCommands(commands, 'llm', translate).map((c) => c.id)).toContain(
            'initialize-llm-wiki'
        )
        expect(filterPaletteCommands(commands, '初始化', translate).map((c) => c.id)).toContain(
            'initialize-llm-wiki'
        )
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
            switchMode: (mode: string) => calls.push(`mode:${mode}`),
            openOrCreateCaptureEntry: (kind: string) => calls.push(`capture:${kind}`),
            captureClipToNote: () => calls.push('clip:note'),
            captureClipToEditor: () => calls.push('clip:editor'),
            ocrClipboardToEditor: () => calls.push('ocr:editor'),
            ocrClipboardToClipboard: () => calls.push('ocr:clipboard')
        }
        const customCommands = buildPaletteCommands(customHandlers)
        customCommands.find((command) => command.id === 'workspace-search')?.run?.()
        customCommands.find((command) => command.id === 'quick-open')?.run?.()
        customCommands.find((command) => command.id === 'command-palette')?.run?.()
        customCommands.find((command) => command.id === 'daily-note')?.run?.()
        customCommands.find((command) => command.id === 'inbox-capture')?.run?.()
        customCommands.find((command) => command.id === 'clip-to-note')?.run?.()
        customCommands.find((command) => command.id === 'clip-to-editor')?.run?.()
        customCommands.find((command) => command.id === 'ocr-insert')?.run?.()
        customCommands.find((command) => command.id === 'ocr-copy')?.run?.()
        expect(calls).toEqual([
            'workspace-search',
            'mode:file',
            'mode:command',
            'capture:daily',
            'capture:inbox',
            'clip:note',
            'clip:editor',
            'ocr:editor',
            'ocr:clipboard'
        ])
    })
})

describe('1.5.2 E6 可选能力过滤：featureDailyNotes', () => {
    const captureIds = ['daily-note', 'inbox-capture']

    it('开关关闭时日常记录命令不注册（命令面板不出现入口）', () => {
        const filtered = buildPaletteCommands(handlers, { isFeatureEnabled: () => false })
        const ids = filtered.map((command) => command.id)
        for (const id of captureIds) {
            expect(ids).not.toContain(id)
        }
        // 非可选能力命令不受影响
        expect(ids).toContain('save')
        expect(ids).toContain('attachments')
    })

    it('仅开启 dailyNotes 时注册两条日常记录命令，且分类为 capture', () => {
        const filtered = buildPaletteCommands(handlers, {
            isFeatureEnabled: (id) => id === 'dailyNotes'
        })
        for (const id of captureIds) {
            const command = filtered.find((item) => item.id === id) as PaletteCommand
            expect(command).toBeDefined()
            expect(command.featureFlag).toBe('dailyNotes')
            expect(command.categoryKey).toBe('editorUi.commandPalette.category.capture')
            expect(command.labelKey.startsWith('editorUi.commandPalette.command.')).toBe(true)
            expect(command.menuAction).toBeUndefined()
            expect(typeof command.run).toBe('function')
        }
    })

    it('未提供 isFeatureEnabled 时视为全部开启（兼容既有调用方/单测）', () => {
        const ids = buildPaletteCommands(handlers).map((command) => command.id)
        for (const id of captureIds) {
            expect(ids).toContain(id)
        }
    })
})

describe('1.5.2 E1 可选能力过滤：featureClipCapture', () => {
    const clipCommandIds = ['clip-to-note', 'clip-to-editor']

    it('开关关闭时剪藏命令不注册（命令面板不出现入口）', () => {
        const filtered = buildPaletteCommands(handlers, { isFeatureEnabled: () => false })
        const ids = filtered.map((command) => command.id)
        for (const id of clipCommandIds) {
            expect(ids).not.toContain(id)
        }
        expect(ids).toContain('save')
        expect(ids).toContain('attachments')
    })

    it('仅开启 clipCapture 时注册两条剪藏命令，且分类为 capture', () => {
        const filtered = buildPaletteCommands(handlers, {
            isFeatureEnabled: (id) => id === 'clipCapture'
        })
        for (const id of clipCommandIds) {
            const command = filtered.find((item) => item.id === id) as PaletteCommand
            expect(command).toBeDefined()
            expect(command.featureFlag).toBe('clipCapture')
            expect(command.categoryKey).toBe('editorUi.commandPalette.category.capture')
            expect(command.labelKey.startsWith('editorUi.commandPalette.command.')).toBe(true)
            expect(command.menuAction).toBeUndefined()
            expect(typeof command.run).toBe('function')
        }
        // 未开启的能力命令仍不注册（开关互相独立）
        const ids = filtered.map((command) => command.id)
        expect(ids).not.toContain('daily-note')
        expect(ids).not.toContain('inbox-capture')
    })

    it('同时开启 dailyNotes 与 clipCapture 时四条捕获命令按注册顺序排列', () => {
        const filtered = buildPaletteCommands(handlers, { isFeatureEnabled: () => true })
        const captureIds = filtered
            .filter((command) => command.categoryKey === 'editorUi.commandPalette.category.capture')
            .map((command) => command.id)
        expect(captureIds).toEqual([
            'daily-note',
            'inbox-capture',
            'clip-to-note',
            'clip-to-editor',
            'ocr-insert',
            'ocr-copy'
        ])
    })
})

describe('1.5.2 E3 可选能力过滤：featureImageOcr', () => {
    const ocrCommandIds = ['ocr-insert', 'ocr-copy']

    it('开关关闭时图片 OCR 命令不注册（命令面板不出现入口，无执行副作用）', () => {
        const filtered = buildPaletteCommands(handlers, { isFeatureEnabled: () => false })
        const ids = filtered.map((command) => command.id)
        for (const id of ocrCommandIds) {
            expect(ids).not.toContain(id)
        }
        expect(ids).toContain('save')
        expect(ids).toContain('attachments')
    })

    it('仅开启 imageOcr 时注册两条 OCR 命令，且分类为 capture', () => {
        const filtered = buildPaletteCommands(handlers, {
            isFeatureEnabled: (id) => id === 'imageOcr'
        })
        for (const id of ocrCommandIds) {
            const command = filtered.find((item) => item.id === id) as PaletteCommand
            expect(command).toBeDefined()
            expect(command.featureFlag).toBe('imageOcr')
            expect(command.categoryKey).toBe('editorUi.commandPalette.category.capture')
            expect(command.labelKey.startsWith('editorUi.commandPalette.command.')).toBe(true)
            expect(command.menuAction).toBeUndefined()
            expect(typeof command.run).toBe('function')
        }
        // 未开启的能力命令仍不注册（开关互相独立）
        const ids = filtered.map((command) => command.id)
        expect(ids).not.toContain('daily-note')
        expect(ids).not.toContain('clip-to-note')
    })

    it('未提供 isFeatureEnabled 时视为全部开启（兼容既有调用方/单测）', () => {
        const ids = buildPaletteCommands(handlers).map((command) => command.id)
        for (const id of ocrCommandIds) {
            expect(ids).toContain(id)
        }
    })
})

describe('filterPaletteCommands：REQ-10 使用权重排序', () => {
    /** 排序测试用伪翻译（标签语义清晰，便于断言匹配层级） */
    const SORT_LABELS: Record<string, string> = {
        'test.exact': 'Save',
        'test.prefix': 'Save As',
        'test.other': 'Open Save',
        'test.other2': 'Auto Save',
        'test.other3': 'Quick Save',
        'test.category': 'Test'
    }
    const sortTranslate = (key: string): string => SORT_LABELS[key] ?? key

    /** 构造排序测试命令（id 与 labelKey 一致，便于断言） */
    function sortCommand(id: string): PaletteCommand {
        return {
            id,
            labelKey: `test.${id}`,
            categoryKey: 'test.category',
            keywords: []
        }
    }

    const sortCommands: PaletteCommand[] = [
        sortCommand('exact'),
        sortCommand('prefix'),
        sortCommand('other'),
        sortCommand('other2'),
        sortCommand('other3')
    ]

    it('匹配层级优先：完全匹配 > 前缀 > 其他（其他命令最近使用也不能越层）', () => {
        const usage = { other: { lastUsed: 9_999, count: 99 } }
        const ids = filterPaletteCommands(sortCommands, 'save', sortTranslate, usage).map(
            (command) => command.id
        )
        expect(ids.slice(0, 2)).toEqual(['exact', 'prefix'])
        expect(ids).toContain('other')
    })

    it('同层级内最近使用优先（lastUsed 新者更靠前）', () => {
        const usage = {
            other3: { lastUsed: 300, count: 1 },
            other2: { lastUsed: 100, count: 1 }
        }
        const ids = filterPaletteCommands(sortCommands, 'save', sortTranslate, usage).map(
            (command) => command.id
        )
        expect(ids).toEqual(['exact', 'prefix', 'other3', 'other2', 'other'])
    })

    it('同层级且 lastUsed 相同时按使用频率（count 大者优先）', () => {
        const usage = {
            other: { lastUsed: 100, count: 1 },
            other2: { lastUsed: 100, count: 8 }
        }
        const ids = filterPaletteCommands(sortCommands, 'save', sortTranslate, usage).map(
            (command) => command.id
        )
        expect(ids.slice(2)).toEqual(['other2', 'other', 'other3'])
    })

    it('无使用历史时按匹配精度后原始注册顺序（稳定可测）', () => {
        const ids = filterPaletteCommands(sortCommands, 'save', sortTranslate).map(
            (command) => command.id
        )
        expect(ids).toEqual(['exact', 'prefix', 'other', 'other2', 'other3'])
    })

    it('未传 usage 与传 undefined 行为一致（向后兼容既有调用方）', () => {
        expect(
            filterPaletteCommands(sortCommands, 'save', sortTranslate).map((command) => command.id)
        ).toEqual(
            filterPaletteCommands(sortCommands, 'save', sortTranslate, undefined).map(
                (command) => command.id
            )
        )
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
