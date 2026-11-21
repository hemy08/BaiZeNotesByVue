/**
 * A9 命令面板 —— 命令注册表（渲染层，2026-11-21，默认开启）
 *
 * 设计原则：
 * - **不复制实现**：能由既有菜单/编辑器事件完成的动作，一律复用 `menu-actions.ts` 的
 *   `HandleMenuAction(menuAction)`（与菜单栏点击同一条分发链路），本表只登记
 *   「展示信息 + 稳定 menuAction / 自定义处理函数」；
 * - 命令数据只存 `labelKey`（i18n 键），由组件渲染时 `t(key)` 输出（I18N-08），
 *   过滤时用「translated label + category + id + keywords」联合匹配；
 * - 菜单动作 id 与 `menu-config.ts` 的菜单树一致性由单测守护（不在本文件写死第二份
 *   可执行逻辑，只登记引用）。
 *
 * 新增命令只需在 `buildPaletteCommands` 的数组里加一条（titleKey 走
 * `editorUi.commandPalette.*` 命名空间，最终由词典统一补齐）。
 */

import { isSubsequenceMatch } from './workspace-search-utils'

/** 命令执行依赖（组件注入；单测可传替身） */
export interface PaletteCommandHandlers {
    /** 复用菜单栏动作分发（与 MenuBar 点击同一入口，不复制实现） */
    runMenuAction: (menuAction: string) => void
    /** 打开 A2 全工作区搜索对话框 */
    openWorkspaceSearch: () => void
    /** 切换命令面板模式（command = 命令列表，file = 文件 Quick Open） */
    switchMode: (mode: PaletteMode) => void
}

/** 命令面板模式：命令列表 / 文件 Quick Open */
export type PaletteMode = 'command' | 'file'

/** 一条命令的静态定义（不包含执行副作用，便于单测与过滤） */
export interface PaletteCommand {
    /** 稳定命令 id（过滤关键词也会用到，如 'save' / 'open-folder'） */
    id: string
    /** 命令显示名 i18n 键（`editorUi.commandPalette.command.*`） */
    labelKey: string
    /** 分组标签 i18n 键（`editorUi.commandPalette.category.*`） */
    categoryKey: string
    /** 额外过滤关键词（中英混合，便于中文界面输入英文命令名） */
    keywords: string[]
    /** 仅在命令面板内使用的菜单动作 id（与 menu-config 菜单树一致；自定义动作缺省） */
    menuAction?: string
    /** 自定义执行函数（命令面板自身动作）；与 menuAction 二选一 */
    run?: () => void
    /** 执行后是否关闭命令面板（缺省 true；模式切换类命令保持面板打开） */
    closeOnRun?: boolean
}

/**
 * 构建命令面板命令列表。
 *
 * 命令 = 既有能力（保存/打开文件夹/查找/替换/跳行/大纲/插入表格·数学·Mermaid）
 * + A2 工作区搜索 + 面板自身（命令列表/Quick Open 切换）。
 */
export function buildPaletteCommands(handlers: PaletteCommandHandlers): PaletteCommand[] {
    const menuCommand = (
        id: string,
        labelKey: string,
        categoryKey: string,
        menuAction: string,
        keywords: string[]
    ): PaletteCommand => ({
        id,
        labelKey,
        categoryKey,
        keywords,
        menuAction
    })
    return [
        // ========== 文件 ==========
        menuCommand(
            'save',
            'editorUi.commandPalette.command.save',
            'editorUi.commandPalette.category.file',
            'baize:menu:file:save',
            ['save', 'write', '保存', '写入']
        ),
        menuCommand(
            'open-folder',
            'editorUi.commandPalette.command.openFolder',
            'editorUi.commandPalette.category.file',
            'baize:menu:file:open-folder',
            ['open', 'folder', 'workspace', '打开', '文件夹', '工作区']
        ),
        menuCommand(
            'open-file',
            'editorUi.commandPalette.command.openFile',
            'editorUi.commandPalette.category.file',
            'baize:menu:file:open-file',
            ['open', 'file', '打开', '文件']
        ),
        // ========== 编辑 ==========
        menuCommand(
            'find',
            'editorUi.commandPalette.command.find',
            'editorUi.commandPalette.category.edit',
            'baize:menu:edit:find-in-file',
            ['find', 'search', '查找', '搜索']
        ),
        menuCommand(
            'replace',
            'editorUi.commandPalette.command.replace',
            'editorUi.commandPalette.category.edit',
            'baize:menu:edit:replace-in-file',
            ['replace', '替换']
        ),
        menuCommand(
            'goto-line',
            'editorUi.commandPalette.command.gotoLine',
            'editorUi.commandPalette.category.edit',
            'baize:menu:edit:go-line',
            ['goto', 'line', 'jump', '跳转', '行号']
        ),
        // ========== 视图 ==========
        menuCommand(
            'outline',
            'editorUi.commandPalette.command.outline',
            'editorUi.commandPalette.category.view',
            'baize:menu:view:toggle-outline',
            ['outline', 'toc', '大纲', '目录']
        ),
        // ========== 插入 ==========
        menuCommand(
            'insert-table',
            'editorUi.commandPalette.command.insertTable',
            'editorUi.commandPalette.category.insert',
            'baize:menu:insert:md-table',
            ['insert', 'table', 'md', '插入', '表格']
        ),
        menuCommand(
            'insert-math',
            'editorUi.commandPalette.command.insertMath',
            'editorUi.commandPalette.category.insert',
            'baize:menu:insert:math',
            ['insert', 'math', 'latex', 'katex', '插入', '数学', '公式']
        ),
        menuCommand(
            'insert-mermaid',
            'editorUi.commandPalette.command.insertMermaid',
            'editorUi.commandPalette.category.insert',
            // 菜单树中 Mermaid 为模板子菜单（无独立「打开对话框」动作），复用基础框架插入动作
            'baize:menu:insert:mermaid:basic',
            ['insert', 'mermaid', 'diagram', '插入', '图表']
        ),
        // ========== 搜索（A2/A9 自身能力） ==========
        {
            id: 'workspace-search',
            labelKey: 'editorUi.commandPalette.command.workspaceSearch',
            categoryKey: 'editorUi.commandPalette.category.search',
            keywords: ['search', 'find', 'workspace', 'replace', '搜索', '查找', '工作区', '替换'],
            run: () => handlers.openWorkspaceSearch()
        },
        {
            id: 'quick-open',
            labelKey: 'editorUi.commandPalette.command.quickOpen',
            categoryKey: 'editorUi.commandPalette.category.search',
            keywords: ['quick', 'open', 'file', 'go', '快速', '打开', '文件'],
            run: () => handlers.switchMode('file'),
            closeOnRun: false
        },
        {
            id: 'command-palette',
            labelKey: 'editorUi.commandPalette.command.showCommandPalette',
            categoryKey: 'editorUi.commandPalette.category.search',
            keywords: ['command', 'palette', 'commands', '命令', '面板'],
            run: () => handlers.switchMode('command'),
            closeOnRun: false
        }
    ]
}

/** 命令显示名（渲染/过滤统一走 i18n；翻译缺失时 t 返回键名，不抛异常） */
export function getPaletteCommandLabel(
    command: PaletteCommand,
    translate: (key: string) => string
): string {
    return translate(command.labelKey)
}

/** 命令分组显示名 */
export function getPaletteCategoryLabel(
    command: PaletteCommand,
    translate: (key: string) => string
): string {
    return translate(command.categoryKey)
}

/** 命令过滤用的可搜索文本片段（翻译名 / 分类 / id / 关键词，统一小写） */
function buildSearchTokens(command: PaletteCommand, translate: (key: string) => string): string[] {
    return [
        translate(command.labelKey),
        translate(command.categoryKey),
        command.id,
        ...command.keywords
    ].map((token) => token.toLowerCase())
}

/**
 * 命令面板过滤（大小写不敏感）：
 * 1. 空查询返回全部（保持注册顺序）；
 * 2. 显示名子串命中优先，其次分类/id/关键词子串命中；
 * 3. 子串均不命中时，退化为「单个可搜索片段内的子序列匹配」
 *    （如 `wsp` 命中 `workspace-search`；不跨片段拼接，避免误命中无关命令）；
 * 4. 同分按显示名排序，保证结果稳定可测。
 */
export function filterPaletteCommands(
    commands: readonly PaletteCommand[],
    query: string,
    translate: (key: string) => string
): PaletteCommand[] {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) {
        return [...commands]
    }
    const scored: Array<{ command: PaletteCommand; score: number }> = []
    for (const command of commands) {
        const tokens = buildSearchTokens(command, translate)
        const label = tokens[0]
        // 显示名命中优先级最高（命中位置越靠前分越高；前缀命中额外加分）
        const labelIndex = label.indexOf(normalizedQuery)
        if (labelIndex >= 0) {
            const prefixBonus = label.startsWith(normalizedQuery) ? 50 : 0
            scored.push({ command, score: 1000 - labelIndex + prefixBonus })
            continue
        }
        // 分类/id/关键词子串命中次之
        let bestSecondaryIndex = -1
        for (const token of tokens.slice(1)) {
            const index = token.indexOf(normalizedQuery)
            if (index >= 0 && (bestSecondaryIndex < 0 || index < bestSecondaryIndex)) {
                bestSecondaryIndex = index
            }
        }
        if (bestSecondaryIndex >= 0) {
            scored.push({ command, score: 500 - bestSecondaryIndex })
            continue
        }
        // 单个片段内的子序列兜底（`wsp` → `workspace-search`）
        if (tokens.some((token) => isSubsequenceMatch(token, normalizedQuery))) {
            scored.push({ command, score: 100 })
        }
    }
    scored.sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score
        }
        return getPaletteCommandLabel(left.command, translate).localeCompare(
            getPaletteCommandLabel(right.command, translate)
        )
    })
    return scored.map((item) => item.command)
}
