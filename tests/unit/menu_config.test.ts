import { describe, it, expect } from 'vitest'
import { translate } from '../../src/shared/i18n'
import {
    menuMap,
    pruneEmptySubmenus,
    INITIALIZE_LLM_WIKI_MENU_ACTION,
    PLUGIN_SEARCH_MENU_ACTION
} from '../../src/renderer/src/components/MenuBar/menu-config'
import type { BaiZeMenuEntry } from '../../src/renderer/src/components/MenuBar/menu-config'
import { PLUGIN_TOOL_ACTION_IDS } from '../../src/shared/constants/plugin-tools-manifest'
import { GRAPH_DIALOG_MENU_ACTION } from '../../src/renderer/src/components/Graph/graph-dialog-state'

// CMP-30：菜单数据只存 labelKey，渲染时由 MenuBar.vue 调用 t(labelKey) 输出。
// 测试辅助：按指定语言还原「渲染后文本」，并对非 labelKey 的存量 label（品牌名/版本号等）原样使用。
function displayText(item: BaiZeMenuEntry, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
    return item.labelKey ? translate(item.labelKey, locale) : (item.label ?? '')
}

// 把菜单项还原成「带 label 的渲染态对象」（去掉 labelKey 字段），便于沿用原有断言
function resolved(
    item: BaiZeMenuEntry,
    locale: 'zh-CN' | 'en-US' = 'zh-CN'
): Record<string, unknown> {
    const { labelKey, ...rest } = item as BaiZeMenuEntry & { labelKey?: string }
    return { ...rest, label: labelKey ? translate(labelKey, locale) : rest.label }
}

function resolvedList(
    items: BaiZeMenuEntry[],
    locale: 'zh-CN' | 'en-US' = 'zh-CN'
): Array<Record<string, unknown>> {
    return items.map((item) => resolved(item, locale))
}

// 递归收集菜单树中所有 menuAction 值
function collectActions(items: unknown[]): string[] {
    const actions: string[] = []
    const walk = (list: unknown[]) => {
        for (const item of list as Array<{ menuAction?: string; submenu?: unknown[] }>) {
            if (item.menuAction) {
                actions.push(item.menuAction)
            }
            if (item.submenu) {
                walk(item.submenu)
            }
        }
    }
    walk(items)
    return actions
}

// 递归收集所有 labelKey
function collectLabelKeys(items: BaiZeMenuEntry[]): string[] {
    const keys: string[] = []
    const walk = (list: BaiZeMenuEntry[]) => {
        for (const item of list) {
            if (item.labelKey) keys.push(item.labelKey)
            if (item.submenu) walk(item.submenu)
        }
    }
    walk(items)
    return keys
}

describe('menu-config', () => {
    it('should expose menuMap as a vue ref with 12 top-level menus', () => {
        expect(menuMap.value.length).toBe(12)
    })

    it('should declare the expected top-level labels in order (zh-CN renders verbatim)', () => {
        const labels = menuMap.value.map((item) => displayText(item))
        expect(labels).toEqual([
            '文件',
            '编辑',
            '视图',
            '编码',
            '插入',
            '设置',
            '工具',
            '插件',
            '在线',
            'AI 导航',
            'GitHub',
            '帮助'
        ])
    })

    it('should translate top-level labels to English when locale is en-US', () => {
        const labels = menuMap.value.map((item) => displayText(item, 'en-US'))
        expect(labels).toEqual([
            'File',
            'Edit',
            'View',
            'Encoding',
            'Insert',
            'Settings',
            'Tools',
            'Plugins',
            'Online',
            'AI Navigation',
            'GitHub',
            'Help'
        ])
    })

    it('should keep every top-level menu with a submenu', () => {
        for (const menu of menuMap.value) {
            expect(menu.submenu).toBeDefined()
            expect(menu.submenu!.length).toBeGreaterThan(0)
        }
    })

    it('should keep every menuAction value unique across the whole tree', () => {
        const actions = collectActions(menuMap.value)
        expect(actions.length).toBeGreaterThan(50)
        expect(new Set(actions).size).toBe(actions.length)
    })

    it('should store visible labels as i18n keys instead of literal Chinese', () => {
        // 递归校验：labelKey 必须能在中英词典中解析；仍使用 label 的项不得含中文（品牌名/版本号/格式名）
        const walk = (list: BaiZeMenuEntry[]) => {
            for (const item of list) {
                if (item.labelKey) {
                    expect(translate(item.labelKey, 'zh-CN')).not.toBe(item.labelKey)
                    expect(translate(item.labelKey, 'en-US')).not.toBe(item.labelKey)
                }
                if (item.label) {
                    expect(item.label).not.toMatch(/[\u4e00-\u9fff]/)
                }
                if (!item.labelKey && item.label === undefined && item.type !== 'separator') {
                    expect(item.submenu, '菜单项应至少具有 labelKey 或 label').toBeDefined()
                }
                if (item.submenu) walk(item.submenu)
            }
        }
        walk(menuMap.value)
        expect(collectLabelKeys(menuMap.value).length).toBeGreaterThan(100)
    })

    it('should mark separator items with type separator and no menuAction', () => {
        const walk = (list: unknown[]) => {
            for (const item of list as Array<{
                type?: string
                menuAction?: string
                submenu?: unknown[]
            }>) {
                if (item.type === 'separator') {
                    expect(item.menuAction).toBeUndefined()
                } else if (item.submenu) {
                    walk(item.submenu)
                }
            }
        }
        walk(menuMap.value)
    })

    it('should declare file menu with expected actions and accelerators', () => {
        const fileMenu = menuMap.value.find((item) => displayText(item) === '文件')!
        // FUN-26：顶层 'Alt+N' 未绑定且菜单栏不渲染顶层 accelerator，已移除
        expect(fileMenu.accelerator).toBeUndefined()
        const submenu = resolvedList(fileMenu.submenu!)
        expect(submenu).toContainEqual({
            label: '新建',
            accelerator: 'Ctrl+N',
            menuAction: 'baize:menu:file:new'
        })
        expect(submenu).toContainEqual({
            label: '保存',
            accelerator: 'Ctrl+S',
            menuAction: 'baize:menu:file:save'
        })
        expect(submenu).toContainEqual({
            label: '退出',
            accelerator: 'F4',
            menuAction: 'baize:menu:file:exit'
        })
    })

    // 「文件」菜单 → 最近文件 / 最近文件夹：占位子菜单（运行时由 MenuBar.vue 注入，
    // 初始 submenu 为空，pruneEmptySubmenus 必须豁免 recentMenuPlaceholder 项）。
    // 1.5.7 LLM Wiki L1：打开文件夹与最近项之间新增「初始化 LLM Wiki」（与打开类动作同组）。
    it('should declare recent-files/recent-folders placeholders after open-folder', () => {
        const fileMenu = menuMap.value.find((item) => item.labelKey === 'menu.file.label')!
        const labels = fileMenu.submenu!.map((item) => displayText(item))
        const openFolderIndex = labels.indexOf('打开文件夹')
        expect(openFolderIndex).toBeGreaterThanOrEqual(0)

        const recentFiles = fileMenu.submenu!.find((item) => item.id === 'recent-files')
        const recentFolders = fileMenu.submenu!.find((item) => item.id === 'recent-folders')
        expect(recentFiles).toMatchObject({
            id: 'recent-files',
            labelKey: 'menu.file.recentFiles',
            submenu: [],
            recentMenuPlaceholder: true
        })
        expect(recentFolders).toMatchObject({
            id: 'recent-folders',
            labelKey: 'menu.file.recentFolders',
            submenu: [],
            recentMenuPlaceholder: true
        })
        expect(displayText(recentFiles!)).toBe('最近文件')
        expect(displayText(recentFolders!)).toBe('最近文件夹')
        expect(displayText(recentFiles!, 'en-US')).toBe('Recent Files')
        expect(displayText(recentFolders!, 'en-US')).toBe('Recent Folders')

        // 顺序契约：打开文件夹之后（1.5.7 起中间为「初始化 LLM Wiki」）紧跟分隔符，
        // 分隔符后是最近文件/最近文件夹，且二者相邻。
        const recentFilesIndex = fileMenu.submenu!.indexOf(recentFiles!)
        expect(recentFilesIndex).toBe(openFolderIndex + 3)
        expect(fileMenu.submenu![openFolderIndex + 2].type).toBe('separator')
        expect(fileMenu.submenu![recentFilesIndex + 1]).toBe(recentFolders)
    })

    // 1.5.7 LLM Wiki L1：文件 → 初始化 LLM Wiki（动作 id 沿用 baize:file:* 三段式，
    // 由渲染层 menu-actions.ts 在通用分发前精确拦截 → 主进程白名单 invoke 通道）。
    it('should declare initialize LLM Wiki entry in file menu (L1)', () => {
        const fileMenu = menuMap.value.find((item) => item.labelKey === 'menu.file.label')!
        const initializeItem = fileMenu.submenu!.find(
            (item) => item.labelKey === 'menu.file.initializeLlmWiki'
        )
        expect(initializeItem).toBeDefined()
        // 动作 id 单一真源：menu-config 导出的常量与菜单项一致（menu-actions 拦截同源）
        expect(initializeItem!.menuAction).toBe(INITIALIZE_LLM_WIKI_MENU_ACTION)
        expect(initializeItem!.menuAction).toBe('baize:file:initialize-llm-wiki')
        expect(displayText(initializeItem!)).toBe('初始化 LLM Wiki')
        expect(displayText(initializeItem!, 'en-US')).toBe('Initialize LLM Wiki')
        // 与打开文件/打开文件夹同组（位于打开文件夹之后、最近项分隔符之前）
        const labels = fileMenu.submenu!.map((item) => displayText(item))
        expect(labels.indexOf('初始化 LLM Wiki')).toBe(labels.indexOf('打开文件夹') + 1)
    })

    it('should declare import and export submenus inside file menu', () => {
        const fileMenu = menuMap.value.find((item) => displayText(item) === '文件')!
        const importMenu = fileMenu.submenu!.find((item) => displayText(item) === '从文件导入')
        const exportMenu = fileMenu.submenu!.find((item) => displayText(item) === '导出到文件')
        expect(importMenu?.submenu).toHaveLength(6)
        expect(exportMenu?.submenu).toHaveLength(8)
        expect(resolvedList(importMenu!.submenu!)).toContainEqual({
            label: '从 Word 导入',
            menuAction: 'baize:menu:file:import:word'
        })
        expect(resolvedList(exportMenu!.submenu!)).toContainEqual({
            label: '导出为PDF',
            menuAction: 'baize:menu:file:export:pdf'
        })
        expect(resolvedList(exportMenu!.submenu!)).toContainEqual({
            label: '导出为EPUB电子书',
            menuAction: 'baize:menu:file:export:epub'
        })
        expect(resolvedList(exportMenu!.submenu!)).toContainEqual({
            label: '导出为幻灯片（HTML）',
            menuAction: 'baize:menu:file:export:slides'
        })
    })

    it('should declare edit menu with standard editing actions', () => {
        const editMenu = menuMap.value.find((item) => displayText(item) === '编辑')!
        const actions = editMenu.submenu!.map((item) => item.menuAction)
        expect(actions).toContain('baize:menu:edit:undo')
        expect(actions).toContain('baize:menu:edit:redo')
        expect(actions).toContain('baize:menu:edit:cut')
        expect(actions).toContain('baize:menu:edit:copy')
        expect(actions).toContain('baize:menu:edit:paste')
        expect(actions).toContain('baize:menu:edit:go-line')
        // FUN-09：在文件中查找/替换无法低成本实现，已隐藏（A-4 模式）
        expect(actions).not.toContain('baize:menu:edit:find-in-dir')
        expect(actions).not.toContain('baize:menu:edit:replace-in-dir')
    })

    it('should promote drawing entries before writing templates as a separate group', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        expect(insertMenu.submenu!.slice(0, 4)).toMatchObject([
            {
                labelKey: 'menu.tools.drawing.mermaid',
                menuAction: 'baize:menu:tools:drawing:mermaid'
            },
            {
                labelKey: 'menu.tools.drawing.plantuml',
                menuAction: 'baize:menu:tools:drawing:plantuml'
            },
            { type: 'separator' },
            { labelKey: 'menu.insert.writing' }
        ])
        expect(insertMenu.submenu!.find((item) => displayText(item) === '绘图工具')).toBeUndefined()

        const toolsMenu = menuMap.value.find((item) => displayText(item) === '工具')!
        expect(toolsMenu.submenu!.find((item) => displayText(item) === '绘图工具')).toBeUndefined()
    })

    // 1.5.2 E6：工具菜单新增今日日记 / 快速收件箱两项（能力开关 featureDailyNotes 默认关闭，
    // 菜单项保持可见，动作执行时由 menu-actions 校验开关并提示开启）。
    it('should declare daily note / inbox capture entries in tools menu (E6)', () => {
        const toolsMenu = menuMap.value.find((item) => displayText(item) === '工具')!
        const dailyNote = toolsMenu.submenu!.find(
            (item) => item.labelKey === 'menu.tools.dailyNote'
        )
        const inboxCapture = toolsMenu.submenu!.find(
            (item) => item.labelKey === 'menu.tools.inboxCapture'
        )
        expect(dailyNote?.menuAction).toBe('baize:menu:tools:daily-note')
        expect(inboxCapture?.menuAction).toBe('baize:menu:tools:inbox-capture')
        expect(displayText(dailyNote!)).toBe('今日日记')
        expect(displayText(inboxCapture!)).toBe('快速收件箱')
        expect(displayText(dailyNote!, 'en-US')).toBe('Daily Note')
        expect(displayText(inboxCapture!, 'en-US')).toBe('Quick Inbox')
    })

    // 1.5.2 E1：工具菜单新增剪贴板剪藏两项（能力开关 featureClipCapture 默认关闭，
    // 菜单项保持可见，动作执行时由 menu-actions 校验开关并提示开启）。
    it('should declare clipboard capture entries in tools menu (E1)', () => {
        const toolsMenu = menuMap.value.find((item) => displayText(item) === '工具')!
        const clipToNote = toolsMenu.submenu!.find(
            (item) => item.labelKey === 'menu.tools.clipToNote'
        )
        const clipToEditor = toolsMenu.submenu!.find(
            (item) => item.labelKey === 'menu.tools.clipToEditor'
        )
        expect(clipToNote?.menuAction).toBe('baize:menu:tools:clip-to-note')
        expect(clipToEditor?.menuAction).toBe('baize:menu:tools:clip-to-editor')
        expect(displayText(clipToNote!)).toBe('剪藏为新笔记')
        expect(displayText(clipToEditor!)).toBe('剪藏并插入当前笔记')
        expect(displayText(clipToNote!, 'en-US')).toBe('Clip to Note')
        expect(displayText(clipToEditor!, 'en-US')).toBe('Clip into Current Note')
    })

    // 1.5.2 E3：工具菜单新增图片 OCR 两项（能力开关 featureImageOcr 默认关闭，
    // 菜单项保持可见，动作执行时由 menu-actions 校验开关并提示开启）。
    it('should declare image OCR entries in tools menu (E3)', () => {
        const toolsMenu = menuMap.value.find((item) => displayText(item) === '工具')!
        const imageOcrInsert = toolsMenu.submenu!.find(
            (item) => item.labelKey === 'menu.tools.imageOcrInsert'
        )
        const imageOcrCopy = toolsMenu.submenu!.find(
            (item) => item.labelKey === 'menu.tools.imageOcrCopy'
        )
        expect(imageOcrInsert?.menuAction).toBe('baize:menu:tools:ocr-insert')
        expect(imageOcrCopy?.menuAction).toBe('baize:menu:tools:ocr-copy')
        expect(displayText(imageOcrInsert!)).toBe('识别剪贴板图片文字并插入')
        expect(displayText(imageOcrCopy!)).toBe('识别剪贴板图片文字并复制')
        expect(displayText(imageOcrInsert!, 'en-US')).toBe(
            'Recognize Clipboard Image Text and Insert'
        )
        expect(displayText(imageOcrCopy!, 'en-US')).toBe('Recognize Clipboard Image Text and Copy')
    })

    it('should hide unimplemented insert template items (FUN-09)', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        const actions = collectActions(insertMenu.submenu!)
        expect(actions).not.toContain('baize:menu:insert:custom-template')
        expect(actions).not.toContain('baize:menu:insert:template-manager')
    })

    it('should declare view menu with F9-F12 accelerators and fold levels', () => {
        const viewMenu = menuMap.value.find((item) => displayText(item) === '视图')!
        const submenu = resolvedList(viewMenu.submenu!)
        expect(submenu).toContainEqual({
            label: '编辑模式',
            accelerator: 'F9',
            menuAction: 'baize:menu:view:edit-mode'
        })
        expect(submenu).toContainEqual({
            label: '预览模式',
            accelerator: 'F10',
            menuAction: 'baize:menu:view:preview-mode'
        })
        expect(submenu).toContainEqual({
            label: '编辑/预览模式',
            accelerator: 'F11',
            menuAction: 'baize:menu:view:edit-preview-mode'
        })
        expect(submenu).toContainEqual({
            label: '开发人员工具',
            accelerator: 'F12',
            menuAction: 'baize:menu:view:dev-tools'
        })
        expect(submenu).toContainEqual({
            label: '布局配置…',
            menuAction: 'baize:menu:view:layout-profiles'
        })
        const fold = viewMenu.submenu!.find((item) => displayText(item) === '折叠/展开标题')
        expect(fold?.submenu).toHaveLength(8)
        expect(resolved(fold!.submenu![0])).toEqual({
            label: '全部折叠',
            menuAction: 'baize:menu:view:fold:all-fold'
        })
        expect(resolved(fold!.submenu![7])).toEqual({
            label: '六级标题',
            menuAction: 'baize:menu:view:fold:level6'
        })
    })

    it('should declare relationship graph entry in view menu (L4)', () => {
        const viewMenu = menuMap.value.find((item) => item.labelKey === 'menu.view.label')!
        const graphItem = viewMenu.submenu!.find(
            (item) => item.menuAction === GRAPH_DIALOG_MENU_ACTION
        )
        expect(graphItem).toBeDefined()
        expect(graphItem!.labelKey).toBe('editorUi.graphDialog.menuLabel')
        expect(displayText(graphItem!)).toBe('关系图谱')
        expect(displayText(graphItem!, 'en-US')).toBe('Relationship graph')
        // 动作 id 为视图域四段式，且不占用主进程菜单动作处理器（纯渲染层对话框）
        expect(GRAPH_DIALOG_MENU_ACTION).toBe('baize:menu:view:graph')
    })

    it('should declare encoding menu with two nested encoding groups', () => {
        const codingMenu = menuMap.value.find((item) => displayText(item) === '编码')!
        expect(codingMenu.submenu).toHaveLength(2)
        expect(displayText(codingMenu.submenu![0])).toBe('重新用...编码打开')
        expect(displayText(codingMenu.submenu![1])).toBe('转为...编码')
        expect(resolvedList(codingMenu.submenu![0].submenu!)).toContainEqual({
            label: 'UTF-8',
            menuAction: 'baize:menu:coding:encoding:utf8'
        })
        expect(resolvedList(codingMenu.submenu![1].submenu!)).toContainEqual({
            label: 'GBK(简体中文)',
            menuAction: 'baize:menu:coding:switch:gbk'
        })
    })

    it('should declare insert menu with material/mermaid/plantuml/drawing groups', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        const labels = insertMenu.submenu!.map((item) => displayText(item))
        // 特殊字体/数学公式/Markdown 表格/网页链接已迁至工具菜单
        expect(labels).not.toContain('特殊字体')
        expect(labels).not.toContain('数学公式')
        expect(labels).toContain('Mermaid 绘图')
        expect(labels).toContain('PlantUML 绘图')
        expect(labels).toContain('写作模板')
        expect(labels).toContain('文本块')
        expect(labels).toContain('Material')
        expect(labels).toContain('Mermaid')
        expect(labels).toContain('PlantUML')
    })

    it('should move insert content tools into tools menu and remove duplicate entries', () => {
        const toolsMenu = menuMap.value.find((item) => displayText(item) === '工具')!
        const actions = collectActions(toolsMenu.submenu!)
        expect(actions).toContain('baize:menu:insert:special-text')
        expect(actions).toContain('baize:menu:insert:math')
        expect(actions).toContain('baize:menu:insert:md-table')
        expect(actions).toContain('baize:menu:insert:web-link')
        // 旧重复入口已合并
        expect(actions).not.toContain('baize:menu:tools:katex')
        expect(actions).not.toContain('baize:menu:tools:table')
        expect(actions).not.toContain('baize:menu:tools:drawing:mermaid')
        expect(actions).not.toContain('baize:menu:tools:drawing:plantuml')
    })

    it('should declare plugins menu with encrypt/network/info groups (FE-16：空组已剔除)', () => {
        const pluginsMenu = menuMap.value.find((item) => displayText(item) === '插件')!
        const labels = pluginsMenu.submenu!.map((item) => displayText(item))
        // FE-16：无数据的空组（语言关键字 / 数据和命令 / 大小写转换）不再渲染
        expect(labels).not.toContain('语言语法关键字对照表')
        expect(labels).not.toContain('数据和命令对照表')
        expect(labels).not.toContain('大小写转换')
        // 仍有数据的组保留；1.3.5 jyshare 集成后转换器组与常用小工具组恢复展示
        expect(labels).toContain('加解密插件')
        expect(labels).toContain('各类转换器')
        expect(labels).toContain('常用小工具')
        expect(labels).toContain('网络计算插件')
        expect(labels).toContain('常用对照表')
        const encrypt = pluginsMenu.submenu!.find((item) => displayText(item) === '加解密插件')
        expect(encrypt?.submenu).toHaveLength(8)
    })

    // 1.5.6（用户需求 2026-11-28）：插件菜单首项新增「插件搜索」子项——点击打开插件工具
    // 面板并进入搜索入口视图（不是具体工具动作）；既有 38 项工具结构与顺序不变。
    it('should declare plugin search entry as the first plugins item (1.5.6)', () => {
        const pluginsMenu = menuMap.value.find((item) => item.labelKey === 'menu.plugins.label')!
        const first = pluginsMenu.submenu![0]
        expect(first).toMatchObject({
            labelKey: 'menu.plugins.search',
            menuAction: PLUGIN_SEARCH_MENU_ACTION
        })
        // 叶子动作（无子菜单），动作 id 为菜单契约值
        expect(first.submenu).toBeUndefined()
        expect(PLUGIN_SEARCH_MENU_ACTION).toBe('baize:menu:plugins:search')
        // 中英文案均可解析（MENU-01/MENU-03）
        expect(displayText(first)).toBe('插件搜索')
        expect(displayText(first, 'en-US')).toBe('Plugin Search')

        // 38 项工具入口在搜索项之后保持 manifest 原顺序（结构/顺序不变）
        expect(collectActions(pluginsMenu.submenu!.slice(1))).toEqual([...PLUGIN_TOOL_ACTION_IDS])
        // 搜索入口动作不得与任何工具动作重复
        expect(PLUGIN_TOOL_ACTION_IDS).not.toContain(PLUGIN_SEARCH_MENU_ACTION)
    })

    it('should expose every registered plugin tool in the plugins menu (FE-17)', () => {
        const pluginsMenu = menuMap.value.find((item) => displayText(item) === '插件')!
        const actions = collectActions(pluginsMenu.submenu!)
        // plugin-tools-const.ts 注册表中已实现但此前无菜单入口的 4 个工具
        expect(actions).toContain('baize:menu:plugins:net:http-status-codes')
        expect(actions).toContain('baize:menu:plugins:net:subnet-mask-map-table')
        expect(actions).toContain('baize:menu:plugins:info:numeric-case-table')
        expect(actions).toContain('baize:menu:plugins:info:normal-font-style-table')

        // 新条目使用 menu 命名空间的 i18n key，中英文案均可解析
        const network = pluginsMenu.submenu!.find((item) => displayText(item) === '网络计算插件')!
        expect(resolvedList(network.submenu!)).toContainEqual({
            label: 'HTTP状态码对照表',
            menuAction: 'baize:menu:plugins:net:http-status-codes'
        })
        expect(resolvedList(network.submenu!)).toContainEqual({
            label: '子网掩码对照表',
            menuAction: 'baize:menu:plugins:net:subnet-mask-map-table'
        })
        expect(resolvedList(network.submenu!, 'en-US')).toContainEqual({
            label: 'Subnet Mask Table',
            menuAction: 'baize:menu:plugins:net:subnet-mask-map-table'
        })
        const cheatSheet = pluginsMenu.submenu!.find((item) => displayText(item) === '常用对照表')!
        const cheatSheet1 = cheatSheet.submenu!.find((item) => displayText(item) === '对照表一')!
        expect(resolvedList(cheatSheet1.submenu!)).toContainEqual({
            label: '数字大小写对照表',
            menuAction: 'baize:menu:plugins:info:numeric-case-table'
        })
        expect(resolvedList(cheatSheet1.submenu!)).toContainEqual({
            label: '常见字体样式对照表',
            menuAction: 'baize:menu:plugins:info:normal-font-style-table'
        })
    })

    it('should not render any empty submenu group (FE-16 回归防护)', () => {
        // 空组既没有箭头也没有 menuAction，点击永远无反应；剪枝后菜单树中不允许存在
        // 例外：最近文件/最近文件夹为运行时注入占位项（recentMenuPlaceholder），初始为空属预期。
        const walk = (list: BaiZeMenuEntry[], path: string): void => {
            for (const item of list) {
                if (item.submenu) {
                    if (item.recentMenuPlaceholder !== true) {
                        expect(
                            item.submenu.length,
                            `空子菜单组: ${path} > ${displayText(item)}`
                        ).toBeGreaterThan(0)
                    }
                    walk(item.submenu, `${path} > ${displayText(item)}`)
                } else if (item.type !== 'separator') {
                    // 叶子项必须有可触发的动作（或为纯展示文案）
                    const hasAction = Boolean(item.menuAction)
                    expect(
                        hasAction || item.enabled === false || displayText(item).length > 0,
                        `不可触发的叶子菜单项: ${path} > ${displayText(item)}`
                    ).toBe(true)
                }
            }
        }
        walk(menuMap.value, 'menu')
    })

    it('should declare online menu with seven tool groups', () => {
        const onlineMenu = menuMap.value.find((item) => displayText(item) === '在线')!
        expect(onlineMenu.submenu).toHaveLength(7)
        const labels = onlineMenu.submenu!.map((item) => displayText(item))
        expect(labels).toContain('菜鸟在线工具')
        expect(labels).toContain('编程狮在线工具')
        expect(labels).toContain('在线编解码工具')
        expect(labels).toContain('在线IDE编辑器')
        expect(labels).toContain('开发者工具')
        expect(labels).toContain('国内知名前端团队')
        expect(labels).toContain('云计算平台')
        // 在线菜单项由 menu-consts.ts 的映射表生成：渲染层只取 labelKey + menuAction(id)
        // （url 字段已删除，跳转地址真源在主进程/ shared constants）
        const cainiao = onlineMenu.submenu!.find((item) => displayText(item) === '菜鸟在线工具')
        expect(resolved(cainiao!.submenu![0])).toEqual({
            label: '菜鸟SVG图片编辑器',
            menuAction: 'baize:menu:online:cainiao:svg-editor'
        })
    })

    // task-50：AI 导航菜单——数据源为菜鸟 AI 导航（https://www.jyshare.com/ai/）的 70 条精选链接，
    // 放在「在线」之后、「GitHub」之前；9 组 + 70 个叶子全部使用 baize:menu:ai:<group>:<id> 动作 id。
    it('should declare ai menu after online with nine groups and seventy action leaves (task-50)', () => {
        const aiMenu = menuMap.value.find((item) => item.labelKey === 'menu.ai.label')!
        expect(aiMenu).toBeDefined()
        expect(aiMenu.submenu).toHaveLength(9)

        const groupLabels = aiMenu.submenu!.map((item) => displayText(item))
        expect(groupLabels).toEqual([
            '热门 AI',
            'AI 编程',
            'AI 作图',
            'AI 写作',
            'AI 办公',
            'AI 影音',
            'AI 智能体',
            'AI 模型与榜单',
            '更多 AI 工具'
        ])
        const groupLabelsEn = aiMenu.submenu!.map((item) => displayText(item, 'en-US'))
        expect(groupLabelsEn).toEqual([
            'Popular AI',
            'AI Coding',
            'AI Image',
            'AI Writing',
            'AI Office',
            'AI Media',
            'AI Agents',
            'AI Models & Leaderboards',
            'More AI Tools'
        ])

        // 叶子数与分组分布固定（14 / 9 / 10 / 7 / 3 / 8 / 10 / 5 / 4 = 70）
        expect(aiMenu.submenu!.map((group) => group.submenu!.length)).toEqual([
            14, 9, 10, 7, 3, 8, 10, 5, 4
        ])
        const actions = collectActions(aiMenu.submenu!)
        expect(actions).toHaveLength(70)
        expect(actions.every((action) => action.startsWith('baize:menu:ai:'))).toBe(true)
        expect(new Set(actions).size).toBe(70)

        // 首末条目抽检 labelKey → 中英文案 + 动作 id 契约
        const hot = aiMenu.submenu![0]
        expect(resolved(hot.submenu![0])).toEqual({
            label: 'ChatGPT',
            menuAction: 'baize:menu:ai:hot:chatgpt'
        })
        expect(resolved(hot.submenu![0], 'en-US')).toEqual({
            label: 'ChatGPT',
            menuAction: 'baize:menu:ai:hot:chatgpt'
        })
        const more = aiMenu.submenu![8]
        expect(resolved(more.submenu![0])).toEqual({
            label: '菜鸟 AI 导航',
            menuAction: 'baize:menu:ai:more:jyshare-ai'
        })
        expect(resolved(more.submenu![0], 'en-US')).toEqual({
            label: 'Jyshare AI Navigation',
            menuAction: 'baize:menu:ai:more:jyshare-ai'
        })

        // 顺序：紧跟在「在线」之后、「GitHub」之前
        const topLabels = menuMap.value.map((item) => displayText(item))
        expect(topLabels.indexOf('AI 导航')).toBe(topLabels.indexOf('在线') + 1)
        expect(topLabels.indexOf('AI 导航')).toBe(topLabels.indexOf('GitHub') - 1)
    })

    it('should declare github menu with five project entries', () => {
        const gitHubMenu = menuMap.value.find((item) => displayText(item) === 'GitHub')!
        expect(gitHubMenu.submenu).toHaveLength(5)
        expect(resolved(gitHubMenu.submenu![0])).toEqual({
            label: 'IT TOOLS 助力开发人员和IT工作者',
            menuAction: 'baize:menu:github:it-tools'
        })
    })

    it('should declare help menu with release notes ordered newest first', () => {
        const helpMenu = menuMap.value.find((item) => displayText(item) === '帮助')!
        const releases = helpMenu.submenu!.find((item) => displayText(item) === '版本发布')
        expect(releases?.submenu).toHaveLength(19)
        const versions = releases!.submenu!.map((item) => resolved(item))
        expect(versions[0]).toEqual({
            label: 'v1.5.6',
            menuAction: 'baize:menu:help:release-notes:v1.5.6'
        })
        expect(versions[1]).toEqual({
            label: 'v1.5.5',
            menuAction: 'baize:menu:help:release-notes:v1.5.5'
        })
        expect(versions.slice(2).map((item) => item.label)).toEqual([
            'v1.5.2',
            'v1.5.1',
            'v1.5.0',
            'v1.3.9',
            'v1.3.5',
            'v1.3.0',
            'v1.2.2',
            'v1.2.1',
            'v1.2.0',
            'v1.1.5',
            'v1.1.3',
            'v1.1.2',
            'v1.1.1',
            'v1.1.0',
            'v1.0.2',
            'v1.0.1',
            'v1.0.0'
        ])
        expect(versions[18]).toEqual({
            label: 'v1.0.0',
            menuAction: 'baize:menu:help:release-notes:v1.0.0'
        })
    })

    it('should expose hemy08.github.io and HTML/PDF usage guide entries', () => {
        const helpMenu = menuMap.value.find((item) => displayText(item) === '帮助')!
        const usage = helpMenu.submenu!.find((item) => displayText(item) === 'hemy08.github.io')
        expect(resolved(usage!)).toEqual({
            label: 'hemy08.github.io',
            menuAction: 'baize:menu:help:usage'
        })
        const guide = helpMenu.submenu!.find((item) => displayText(item) === '使用指导')
        expect(guide?.submenu).toHaveLength(2)
        expect(resolved(guide!.submenu![0])).toEqual({
            label: 'HTML 版',
            menuAction: 'baize:menu:help:guide-html'
        })
        expect(resolved(guide!.submenu![1])).toEqual({
            label: 'PDF 版',
            menuAction: 'baize:menu:help:guide-pdf'
        })
    })

    it('should keep top-level accelerator values unique', () => {
        const accelerators = menuMap.value
            .map((item) => item.accelerator)
            .filter((value): value is string => typeof value === 'string')
        expect(new Set(accelerators).size).toBe(accelerators.length)
    })

    // P1/C-06：contact 动作 id 必须与渲染层 menu-actions 拦截值一致，
    // 否则会漏到主进程 JSDOM 联系对话框（两套对话框并存）
    it('should declare contact menu action matching the renderer interception id', () => {
        const helpMenu = menuMap.value.find((item) => displayText(item) === '帮助')!
        const contact = helpMenu.submenu!.find((item) => displayText(item) === '联系我们')
        expect(contact ?? null).toMatchObject({ menuAction: 'baize:menu:help:contact-us' })
    })

    // FE-28：插入菜单的 Material/Mermaid/PlantUML 分组与 Part1/Part2 子组
    // 原为硬编码 label，现全部改走 menu 命名空间 labelKey（中英均可解析）。
    it('should resolve insert template group labels through i18n keys (FE-28)', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        const insertLabels = insertMenu.submenu!.map((item) => displayText(item))
        for (const label of ['Material', 'Mermaid', 'PlantUML']) {
            expect(insertLabels).toContain(label)
        }

        const mermaidGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.mermaid.label'
        )!
        expect(mermaidGroup.submenu!.map((item) => item.labelKey)).toEqual([
            'menu.insert.mermaid.part1',
            'menu.insert.mermaid.part2'
        ])
        const mermaidLabelsEn = mermaidGroup.submenu!.map((item) => displayText(item, 'en-US'))
        expect(mermaidLabelsEn).toEqual(['Mermaid Part 1', 'Mermaid Part 2'])
        const mermaidLabelsZh = mermaidGroup.submenu!.map((item) => displayText(item))
        expect(mermaidLabelsZh).toEqual(['Mermaid 第一部分', 'Mermaid 第二部分'])

        const plantUmlGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.plantuml.label'
        )!
        expect(plantUmlGroup.submenu!.map((item) => displayText(item, 'en-US'))).toEqual([
            'PlantUML Part 1',
            'PlantUML Part 2'
        ])

        const materialGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.material.label'
        )!
        expect(materialGroup.submenu!.map((item) => item.labelKey)).toEqual([
            'menu.insert.material.admonition',
            'menu.insert.material.collapsible',
            'menu.insert.material.taskList',
            'menu.insert.material.highlight',
            'menu.insert.material.insertDelete',
            'menu.insert.material.supSub',
            'menu.insert.material.keys',
            'menu.insert.material.attrList',
            'menu.insert.material.footnote',
            'menu.insert.material.definitionList',
            'menu.insert.material.gridCards',
            'menu.insert.material.codeBlock',
            'menu.insert.material.icon',
            'menu.insert.material.blocks',
            'menu.insert.material.snippet',
            'menu.insert.material.tabLink'
        ])
    })

    // mkdocs-material 扩展语法插入入口（15 项）：Material 子组共 16 项（Admonition + 15 项语法）。
    // 数据契约：labelKey 为 menu.insert.material.<camelCase>；menuAction 为
    // baize:menu:insert:material:<featureId>（featureId 顺序即菜单顺序）。
    it('should declare 16 material entries in feature order with resolvable zh/en labels', () => {
        const insertMenu = menuMap.value.find((item) => item.labelKey === 'menu.insert.label')!
        const materialGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.material.label'
        )!
        const items = materialGroup.submenu!

        // 顺序契约：admonition 保持首位，其后为 15 项新语法（与任务约定顺序一致）
        expect(items).toHaveLength(16)
        expect(items.map((item) => item.menuAction)).toEqual([
            'baize:menu:insert:material:admonition',
            'baize:menu:insert:material:collapsible',
            'baize:menu:insert:material:task-list',
            'baize:menu:insert:material:highlight',
            'baize:menu:insert:material:insert-delete',
            'baize:menu:insert:material:sup-sub',
            'baize:menu:insert:material:keys',
            'baize:menu:insert:material:attr-list',
            'baize:menu:insert:material:footnote',
            'baize:menu:insert:material:definition-list',
            'baize:menu:insert:material:grid-cards',
            'baize:menu:insert:material:code-block',
            'baize:menu:insert:material:icon',
            'baize:menu:insert:material:blocks',
            'baize:menu:insert:material:snippet',
            'baize:menu:insert:material:tab-link'
        ])

        // labelKey 全部可在中英词典解析（i18n-dict 用例覆盖键存在性，这里做菜单渲染态显式断言）
        for (const item of items) {
            expect(item.labelKey).toBeDefined()
            expect(translate(item.labelKey!, 'zh-CN')).not.toBe(item.labelKey)
            expect(translate(item.labelKey!, 'en-US')).not.toBe(item.labelKey)
        }
        // 首末项抽检中英文案
        expect(displayText(items[1])).toBe('折叠提示块')
        expect(displayText(items[15])).toBe('标签页深链')
        expect(displayText(items[1], 'en-US')).toBe('Collapsible admonition')
        expect(displayText(items[15], 'en-US')).toBe('Tab deep link')

        // 15 个新动作 id 全局唯一且以 material: 前缀（全树唯一性另由通用用例守护）
        const materialActions = collectActions(menuMap.value).filter((action) =>
            action.startsWith('baize:menu:insert:material:')
        )
        expect(materialActions).toHaveLength(16)
        expect(new Set(materialActions).size).toBe(16)
    })

    // FE-28：菜单树中不允许残留「结构性」硬编码中文/英文标签——
    // 保留 label 的仅限品牌名/版本号/扩展名/图格式名等豁免项（不含中文，且在白名单内）。
    it('should keep non-i18n literal labels limited to documented exemptions (FE-28)', () => {
        const literalLabels: string[] = []
        const walk = (list: BaiZeMenuEntry[]) => {
            for (const item of list) {
                if (!item.labelKey && item.label) {
                    literalLabels.push(item.label)
                }
                if (item.submenu) walk(item.submenu)
            }
        }
        walk(menuMap.value)

        // 品牌名 / 版本号 / 模板图格式名（flowchart、*.json 等）之外的硬编码标签均应已 key 化
        const exemptions = new Set([
            'GitHub',
            'WebIDE Online',
            'THX from Alimama FE',
            'flowchart',
            'BlockDiagram',
            'Packet',
            'XYChart',
            'Zenuml',
            'AsciiMath',
            '*.json',
            '*.txt;*.log',
            '*.ini',
            '*.yaml;*.yml',
            '*.xml',
            '*.html',
            '*.csv',
            '*.xls;*.xlsx'
        ])
        const unexpected = literalLabels.filter(
            (label) => !exemptions.has(label) && !/^v\d+\.\d+\.\d+$/.test(label)
        )
        expect(unexpected).toEqual([])
    })
})

// FE-16：空组剪枝工具函数的边界用例
describe('pruneEmptySubmenus（FE-16）', () => {
    const action = (id: string): BaiZeMenuEntry => ({ label: id, menuAction: id })

    it('should drop a group whose submenu is empty', () => {
        const pruned = pruneEmptySubmenus([
            { label: 'empty-group', submenu: [] },
            action('baize:menu:file:new')
        ])
        expect(pruned).toEqual([action('baize:menu:file:new')])
    })

    it('should drop a group whose descendants are all empty (转换器外层组场景)', () => {
        const pruned = pruneEmptySubmenus([
            {
                label: 'converters',
                submenu: [
                    { label: 'codec', submenu: [] },
                    { label: 'formatConvert', submenu: [] }
                ]
            },
            action('baize:menu:plugins:encrypt:token-generator')
        ])
        expect(pruned.map((item) => item.label)).toEqual([
            'baize:menu:plugins:encrypt:token-generator'
        ])
    })

    it('should keep groups that still contain action leaves and preserve their order', () => {
        const pruned = pruneEmptySubmenus([
            {
                label: 'group',
                submenu: [action('a'), { label: 'nested-empty', submenu: [] }, action('b')]
            }
        ])
        expect(pruned).toHaveLength(1)
        expect(pruned[0].submenu!.map((item) => item.menuAction)).toEqual(['a', 'b'])
    })

    it('should clean leading/trailing/consecutive separators exposed by pruning', () => {
        const pruned = pruneEmptySubmenus([
            { type: 'separator' },
            action('a'),
            { type: 'separator' },
            { label: 'empty-group', submenu: [] },
            { type: 'separator' },
            action('b'),
            { type: 'separator' }
        ])
        expect(pruned.map((item) => item.type ?? item.menuAction)).toEqual(['a', 'b'])
    })

    it('should keep recent-menu placeholders even when their submenu is empty', () => {
        // 最近文件/最近文件夹占位项：初始 submenu 为空，由 MenuBar.vue 打开菜单时注入。
        const pruned = pruneEmptySubmenus([
            {
                id: 'recent-files',
                labelKey: 'menu.file.recentFiles',
                submenu: [],
                recentMenuPlaceholder: true
            },
            { label: 'empty-group', submenu: [] },
            action('baize:menu:file:new')
        ])
        expect(pruned.map((item) => item.id ?? item.menuAction)).toEqual([
            'recent-files',
            'baize:menu:file:new'
        ])
        expect(pruned[0].submenu).toEqual([])
    })

    it('should not mutate the input tree', () => {
        const input: BaiZeMenuEntry[] = [
            { label: 'group', submenu: [action('a')] },
            { label: 'empty-group', submenu: [] }
        ]
        const snapshot = JSON.parse(JSON.stringify(input))
        pruneEmptySubmenus(input)
        expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot)
    })
})
