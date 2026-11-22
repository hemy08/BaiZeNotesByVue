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
 *   可执行逻辑，只登记引用）；
 * - 可选能力命令带 `featureFlag`：开关关闭时**不注册**（由 `buildPaletteCommands` 的
 *   options.isFeatureEnabled 过滤，CommandPalette 注入响应式开关）。
 *
 * 新增命令只需在 `buildPaletteCommands` 的数组里加一条（titleKey 走
 * `editorUi.commandPalette.*` 命名空间，最终由词典统一补齐）。
 */

import type { OptionalFeatureFlagId } from '../../../../shared/constants/feature-flags'
import type { DailyEntryKind } from '../../../../shared/constants/daily-entries'
import { isSubsequenceMatch } from './workspace-search-utils'

/** 命令执行依赖（组件注入；单测可传替身） */
export interface PaletteCommandHandlers {
    /** 复用菜单栏动作分发（与 MenuBar 点击同一入口，不复制实现） */
    runMenuAction: (menuAction: string) => void
    /** 打开 A2 全工作区搜索对话框 */
    openWorkspaceSearch: () => void
    /** 切换命令面板模式（command = 命令列表，file = 文件 Quick Open） */
    switchMode: (mode: PaletteMode) => void
    /** 1.5.2 E6：打开/创建今日日记或快速收件箱（主进程白名单能力，渲染层只传 kind） */
    openOrCreateCaptureEntry: (kind: DailyEntryKind) => void
    /** 1.5.2 E1：从剪贴板剪藏为新笔记（读取剪贴板 + 既有 OPEN_OR_CREATE_ENTRY 通道） */
    captureClipToNote: () => void
    /** 1.5.2 E1：从剪贴板剪藏并插入当前笔记（复用 A8 insertMarkdownAtSelection） */
    captureClipToEditor: () => void
    /** 1.5.2 E3：识别剪贴板图片文字并插入当前笔记（无编辑器时回退复制） */
    ocrClipboardToEditor: () => void
    /** 1.5.2 E3：识别剪贴板图片文字并复制到剪贴板 */
    ocrClipboardToClipboard: () => void
}

/** 命令注册可选能力过滤（E6：开关关闭时不注册入口） */
export interface PaletteCommandBuildOptions {
    /**
     * 能力开关判定：返回 false 的命令不进入注册列表。
     * 缺省视为全部开启（单测/其他调用方无需关心开关）。
     */
    isFeatureEnabled?: (id: OptionalFeatureFlagId) => boolean
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
    /** 可选能力开关（E6 起）：开关关闭时该命令不注册（buildPaletteCommands 过滤） */
    featureFlag?: OptionalFeatureFlagId
}

/**
 * 构建命令面板命令列表。
 *
 * 命令 = 既有能力（保存/打开文件夹/查找/替换/跳行/大纲/插入表格·数学·Mermaid）
 * + A2 工作区搜索 + 面板自身（命令列表/Quick Open 切换）+ 1.5.2 E6 日常记录（可选能力）。
 *
 * @param handlers 执行依赖（组件注入，单测传替身）
 * @param options  可选能力过滤（缺省全部注册；CommandPalette 注入运行时开关）
 */
export function buildPaletteCommands(
    handlers: PaletteCommandHandlers,
    options: PaletteCommandBuildOptions = {}
): PaletteCommand[] {
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
    const commands: PaletteCommand[] = [
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
        },
        // ========== 1.5.1 本地知识库基座 ==========
        menuCommand(
            'front-matter',
            'editorUi.commandPalette.command.frontMatter',
            'editorUi.commandPalette.category.knowledge',
            'baize:menu:edit:front-matter',
            ['frontmatter', 'property', 'meta', '属性', '元数据']
        ),
        menuCommand(
            'knowledge-tags',
            'editorUi.commandPalette.command.knowledgeTags',
            'editorUi.commandPalette.category.knowledge',
            'baize:menu:edit:knowledge-tags',
            ['tag', 'knowledge', '标签', '索引']
        ),
        menuCommand(
            'knowledge-links',
            'editorUi.commandPalette.command.knowledgeLinks',
            'editorUi.commandPalette.category.knowledge',
            'baize:menu:edit:knowledge-links',
            ['link', 'broken', 'missing', '链接', '死链', '检查']
        ),
        menuCommand(
            'knowledge-backlinks',
            'editorUi.commandPalette.command.knowledgeBacklinks',
            'editorUi.commandPalette.category.knowledge',
            'baize:menu:edit:knowledge-backlinks',
            ['backlink', 'reference', '反向链接', '反链']
        ),
        menuCommand(
            'attachments',
            'editorUi.commandPalette.command.attachments',
            'editorUi.commandPalette.category.knowledge',
            'baize:menu:edit:attachments',
            ['attachment', 'image', 'orphan', '附件', '图片', '孤儿']
        ),
        // ========== 1.5.2 E6 日常记录（可选能力 dailyNotes，默认关闭） ==========
        {
            id: 'daily-note',
            labelKey: 'editorUi.commandPalette.command.dailyNote',
            categoryKey: 'editorUi.commandPalette.category.capture',
            keywords: ['daily', 'diary', 'journal', 'today', '日记', '今日', '笔记'],
            featureFlag: 'dailyNotes',
            run: () => handlers.openOrCreateCaptureEntry('daily')
        },
        {
            id: 'inbox-capture',
            labelKey: 'editorUi.commandPalette.command.inboxCapture',
            categoryKey: 'editorUi.commandPalette.category.capture',
            keywords: ['inbox', 'capture', 'quick', 'note', '收件箱', '快速', '收集', '笔记'],
            featureFlag: 'dailyNotes',
            run: () => handlers.openOrCreateCaptureEntry('inbox')
        },
        // ========== 1.5.2 E1 剪贴板剪藏（可选能力 clipCapture，默认关闭） ==========
        {
            id: 'clip-to-note',
            labelKey: 'editorUi.commandPalette.command.clipToNote',
            categoryKey: 'editorUi.commandPalette.category.capture',
            keywords: ['clip', 'clipboard', 'capture', 'note', '剪藏', '剪贴板', '网页', '笔记'],
            featureFlag: 'clipCapture',
            run: () => handlers.captureClipToNote()
        },
        {
            id: 'clip-to-editor',
            labelKey: 'editorUi.commandPalette.command.clipToEditor',
            categoryKey: 'editorUi.commandPalette.category.capture',
            keywords: [
                'clip',
                'clipboard',
                'insert',
                'caret',
                '剪藏',
                '剪贴板',
                '插入',
                '当前笔记'
            ],
            featureFlag: 'clipCapture',
            run: () => handlers.captureClipToEditor()
        },
        // ========== 1.5.2 E3 图片 OCR（可选能力 imageOcr，默认关闭；MVP 仅剪贴板截图） ==========
        {
            id: 'ocr-insert',
            labelKey: 'editorUi.commandPalette.command.ocrInsert',
            categoryKey: 'editorUi.commandPalette.category.capture',
            keywords: [
                'ocr',
                'image',
                'picture',
                'screenshot',
                'clipboard',
                'text',
                '识别',
                '图片',
                '截图',
                '文字',
                '插入'
            ],
            featureFlag: 'imageOcr',
            run: () => handlers.ocrClipboardToEditor()
        },
        {
            id: 'ocr-copy',
            labelKey: 'editorUi.commandPalette.command.ocrCopy',
            categoryKey: 'editorUi.commandPalette.category.capture',
            keywords: [
                'ocr',
                'image',
                'picture',
                'screenshot',
                'clipboard',
                'copy',
                '识别',
                '图片',
                '截图',
                '文字',
                '复制'
            ],
            featureFlag: 'imageOcr',
            run: () => handlers.ocrClipboardToClipboard()
        }
    ]
    // 可选能力开关过滤：关闭时命令**不注册**（命令面板不出现入口，也无执行副作用）。
    const isFeatureEnabled = options.isFeatureEnabled
    if (typeof isFeatureEnabled !== 'function') {
        return commands
    }
    return commands.filter(
        (command) => command.featureFlag === undefined || isFeatureEnabled(command.featureFlag)
    )
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
