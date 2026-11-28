// 菜单数据结构
import { ref, markRaw } from 'vue'
import type { BaiZeMenuItem } from '../../../../shared/types'
import * as MenuConst from './menu-consts'
import * as Templates from '../../common/templates'
// M3（结构优化第 5 批）：Material 15 项扩展语法收敛为 shared 单一 manifest，菜单项由 manifest 生成。
import {
    MATERIAL_SYNTAX_FEATURES,
    getMaterialSyntaxMenuAction
} from '../../../../shared/constants/material-syntax'
// M3（结构优化收尾）：38 项插件工具的菜单树/懒加载注册表收敛为 shared 单一 manifest。
import {
    PLUGIN_TOOL_MENU,
    getPluginToolGroupLabelKey,
    getPluginToolMenuAction
} from '../../../../shared/constants/plugin-tools-manifest'
import type { PluginToolMenuNode } from '../../../../shared/constants/plugin-tools-manifest'

// CMP-30：菜单数据只存 labelKey（menu 命名空间键，见 shared/i18n/messages/*/menu.ts），
// 由 MenuBar.vue 在渲染时调用 t(labelKey) 输出，切换语言即时生效；
// 品牌名/版本号/扩展名等不翻译文案仍用 label 原样展示。
//
// task-49：顶层菜单为纯文字菜单（MenuBar.vue 模板只渲染 label/labelKey，无图标节点）。
// assets/icons 下与 11 个顶层菜单同名的 icon-*.svg 全部是同一个「占位圆」文件
// （dark/light 两份字节完全一致，stroke="currentColor" 在 <img> 中也不继承主题色），
// 历史的图标渲染实现（模板 img 在 62ee568 移除、getIconPath/useThemeIcons 在 dff0f3f 移除）。
// 故删除 BaiZeMenuItem 的 icon 字段与 11 处菜单数据，避免「数据存在但不生效」的误导。
export interface BaiZeMenuEntry extends BaiZeMenuItem {
    labelKey?: string
    submenu?: BaiZeMenuEntry[]
    /**
     * 可选能力开关（1.5.1）：设置项关闭时 MenuBar 运行时过滤该菜单项。
     * 只用于 UI 可见性，动作 handler 仍需自行防守（命令面板/快捷键可绕过菜单）。
     */
    featureFlag?: import('../../../../shared/constants/feature-flags').OptionalFeatureFlagId
    /** 写作体验开关（P0）：关闭时 MenuBar 运行时隐藏该菜单项 */
    writingFlag?: import('../../../../shared/constants/feature-flags').WritingExperienceFlagId
    /**
     * 菜单项稳定标识（可选）。用于 MenuBar.vue 在运行时定位并注入动态子菜单
     * （当前为「最近文件」/「最近文件夹」两个占位项）。
     */
    id?: string
    /**
     * 顶层菜单 `Alt + 字母` 助记符（REQ-13，1.5.6）：单个 A-Z 字母，大小写不敏感。
     *
     * 仅顶层菜单声明：MenuBar.vue 在全局 keydown 中把 `Alt + 该字母` 映射到对应下拉
     * （激活菜单栏并打开/切换菜单）；Alt 激活态下由 CSS 在菜单标签末尾以「字母下划线」
     * 提示（`:data-mnemonic` + `::after`，不改变菜单 DOM 文案与可访问名称）。
     *
     * 映射表真源：导出后由 `TOP_MENU_ACCESS_KEYS` 从本字段派生，交互/测试/帮助文档
     * 共用一份数据；同一菜单栏内字母必须唯一（`tests/unit/vue/menubar-keyboard.test.ts`）。
     */
    accessKey?: string
    /**
     * 「动态子菜单占位项」标记：初始 submenu 为空数组，由 MenuBar.vue 打开「文件」
     * 菜单时按最近列表注入真实子项（无记录时注入禁用占位项）。
     * pruneEmptySubmenus 对该标记项豁免空组剪枝，避免占位项在导出前被剪掉。
     */
    recentMenuPlaceholder?: boolean
}

// 辅助函数：从菜单映射表生成菜单项。
// 2026-11-19 重构：映射项中的死数据 url 字段已删除（渲染层从不消费 URL，
// 真正跳转地址由主进程 menu-tools.ts 按 id 命中 shared/constants/urls.ts 的真源），
// 故入参类型只保留渲染层实际使用的 id / label / labelKey。
function generateMenuItems(
    urlMaps: Array<{ id: string; label?: string; labelKey?: string }>
): BaiZeMenuEntry[] {
    return urlMaps.map((item) =>
        item.labelKey
            ? { labelKey: item.labelKey, menuAction: item.id }
            : { label: item.label, menuAction: item.id }
    )
}

const importMenu: BaiZeMenuEntry = {
    labelKey: 'menu.file.import.label',
    submenu: [
        { labelKey: 'menu.file.import.word', menuAction: 'baize:menu:file:import:word' },
        { labelKey: 'menu.file.import.html', menuAction: 'baize:menu:file:import:html' },
        { labelKey: 'menu.file.import.json', menuAction: 'baize:menu:file:import:json' },
        { labelKey: 'menu.file.import.yaml', menuAction: 'baize:menu:file:import:yaml' },
        { labelKey: 'menu.file.import.xml', menuAction: 'baize:menu:file:import:xml' },
        { labelKey: 'menu.file.import.text', menuAction: 'baize:menu:file:import:text' }
    ]
}

const exportMenu: BaiZeMenuEntry = {
    labelKey: 'menu.file.export.label',
    submenu: [
        { labelKey: 'menu.file.export.word', menuAction: 'baize:menu:file:export:word' },
        { labelKey: 'menu.file.export.json', menuAction: 'baize:menu:file:export:json' },
        { labelKey: 'menu.file.export.xml', menuAction: 'baize:menu:file:export:xml' },
        { labelKey: 'menu.file.export.yaml', menuAction: 'baize:menu:file:export:yaml' },
        { labelKey: 'menu.file.export.html', menuAction: 'baize:menu:file:export:html' },
        { labelKey: 'menu.file.export.pdf', menuAction: 'baize:menu:file:export:pdf' },
        { labelKey: 'menu.file.export.epub', menuAction: 'baize:menu:file:export:epub' },
        { labelKey: 'menu.file.export.slides', menuAction: 'baize:menu:file:export:slides' }
    ]
}

/**
 * 1.5.7 LLM Wiki L1：「文件 → 初始化 LLM Wiki」动作 id（单一真源，菜单数据/渲染层拦截共用）。
 *
 * 动作 id 命名沿用 `baize:<domain>:<name>` 三段式（不占用 `baize:menu:` 前缀），对应
 * 主进程白名单 invoke 通道 `IPC.FILE.INITIALIZE_LLM_WIKI`（'baize:file:initialize-llm-wiki'，
 * 见 shared/ipc-channels.ts）。与其它菜单动作不同：本动作**不转发 IPC.MENU.ACTION**，
 * 而是由 menu-actions.ts 在通用分发之前精确拦截，直接 invoke 主进程初始化通道。
 */
export const INITIALIZE_LLM_WIKI_MENU_ACTION = 'baize:file:initialize-llm-wiki'

const fileMenu: BaiZeMenuEntry = {
    labelKey: 'menu.file.label',
    // REQ-13（1.5.6）：顶层菜单 Alt+字母助记符（文件 → Alt+F）
    accessKey: 'F',
    // FUN-26：原 accelerator 'Alt+N' 未绑定任何快捷键且顶层菜单不渲染 accelerator
    // 文案（MenuBar.vue 仅子菜单项展示），属误导性标注，已移除。
    submenu: [
        { labelKey: 'menu.file.new', accelerator: 'Ctrl+N', menuAction: 'baize:menu:file:new' },
        { labelKey: 'menu.file.openFile', menuAction: 'baize:menu:file:open-file' },
        {
            labelKey: 'menu.file.openFolder',
            accelerator: 'Ctrl+O',
            menuAction: 'baize:menu:file:open-folder'
        },
        // 1.5.7 LLM Wiki L1：初始化工作区（在工作区根下创建 raw/ 与 wiki/，幂等）；
        // 与「打开文件/打开文件夹」同组，方便用户在工作区就绪后立即初始化。
        {
            labelKey: 'menu.file.initializeLlmWiki',
            menuAction: INITIALIZE_LLM_WIKI_MENU_ACTION
        },
        { type: 'separator' },
        // 「最近文件 / 最近文件夹」：占位子菜单，子项由 MenuBar.vue 打开「文件」菜单时
        // 经 window.api.file.recentList() 动态注入（各最多 20 项；无记录时注入禁用占位项）。
        // id 用于 MenuBar 运行时定位；recentMenuPlaceholder 使 pruneEmptySubmenus 跳过
        // 空组剪枝（否则导出前会被当作 FE-16 的空组剔除）。
        {
            id: 'recent-files',
            labelKey: 'menu.file.recentFiles',
            submenu: [],
            recentMenuPlaceholder: true
        },
        {
            id: 'recent-folders',
            labelKey: 'menu.file.recentFolders',
            submenu: [],
            recentMenuPlaceholder: true
        },
        { type: 'separator' },
        importMenu,
        exportMenu,
        { type: 'separator' },
        { labelKey: 'menu.file.printPreview', menuAction: 'baize:menu:file:print-preview' },
        {
            labelKey: 'menu.file.print',
            menuAction: 'baize:menu:file:print',
            accelerator: 'Ctrl+Alt+P'
        },
        { type: 'separator' },
        // FUN-26：Ctrl+S 已由编辑器侧绑定（hemy-editor-shortcut.ts 的 Monaco addCommand
        // + MarkdownEditComponent.vue 窗口级监听），菜单标注如实保留，不再全局重复注册。
        { labelKey: 'common.save', accelerator: 'Ctrl+S', menuAction: 'baize:menu:file:save' },
        { labelKey: 'menu.file.saveAs', menuAction: 'baize:menu:file:save-as' },
        {
            labelKey: 'menu.file.reload',
            accelerator: 'Ctrl+R',
            menuAction: 'baize:menu:file:reload'
        },
        { type: 'separator' },
        {
            labelKey: 'menu.file.relaunch',
            accelerator: 'Ctrl+Shift+R',
            menuAction: 'baize:menu:file:relaunch'
        },
        { type: 'separator' },
        { labelKey: 'menu.file.exit', accelerator: 'F4', menuAction: 'baize:menu:file:exit' }
    ]
}

const editMenu: BaiZeMenuEntry = {
    labelKey: 'menu.edit.label',
    // REQ-13：编辑 → Alt+E
    accessKey: 'E',
    submenu: [
        { labelKey: 'common.undo', accelerator: 'Ctrl+Z', menuAction: 'baize:menu:edit:undo' },
        { labelKey: 'common.redo', accelerator: 'Ctrl+Y', menuAction: 'baize:menu:edit:redo' },
        { type: 'separator' },
        // FUN-09：剪切/复制/粘贴已走既有 Monaco IPC（monaco-editor-trigger-undo-redo 通道
        // 触发 Monaco 内建剪贴板动作）；Ctrl+X/C/V 为 Monaco 原生键绑定，标注如实保留。
        { labelKey: 'common.cut', accelerator: 'Ctrl+X', menuAction: 'baize:menu:edit:cut' },
        { labelKey: 'common.copy', accelerator: 'Ctrl+C', menuAction: 'baize:menu:edit:copy' },
        { labelKey: 'common.paste', accelerator: 'Ctrl+V', menuAction: 'baize:menu:edit:paste' },
        { type: 'separator' },
        // FUN-09：跳转到行/查找/替换已由渲染层 emit EventBus 事件
        // （editor-jump-line / editor-trigger-find），Ctrl+G/F/H 为 Monaco 原生键绑定。
        {
            labelKey: 'menu.edit.goLine',
            accelerator: 'Ctrl+G',
            menuAction: 'baize:menu:edit:go-line'
        },
        {
            labelKey: 'menu.edit.find',
            accelerator: 'Ctrl+F',
            menuAction: 'baize:menu:edit:find-in-file'
        },
        {
            labelKey: 'menu.edit.replace',
            accelerator: 'Ctrl+H',
            menuAction: 'baize:menu:edit:replace-in-file'
        },
        { type: 'separator' },
        // 1.5.1 默认能力：全工作区搜索 / 命令面板（用户选定常开）
        {
            labelKey: 'menu.edit.workspaceSearch',
            accelerator: 'Ctrl+Shift+F',
            menuAction: 'baize:menu:edit:workspace-search'
        },
        {
            labelKey: 'menu.edit.commandPalette',
            accelerator: 'Ctrl+Shift+P',
            menuAction: 'baize:menu:edit:command-palette'
        },
        {
            labelKey: 'menu.edit.quickOpen',
            accelerator: 'Ctrl+P',
            menuAction: 'baize:menu:edit:quick-open'
        },
        { type: 'separator' },
        // 1.5.1 可选能力：关闭时 MenuBar 过滤（默认关闭）
        {
            labelKey: 'menu.edit.documentHistory',
            menuAction: 'baize:menu:edit:document-history',
            featureFlag: 'documentHistory'
        },
        {
            labelKey: 'menu.edit.markdownLint',
            menuAction: 'baize:menu:edit:markdown-lint',
            featureFlag: 'markdownLint'
        },
        {
            labelKey: 'menu.edit.writingStyleCheck',
            menuAction: 'baize:menu:edit:writing-style-check',
            writingFlag: 'writingStyleCheck'
        },
        { type: 'separator' },
        // 1.5.1 本地知识库基座：属性 / 标签 / 链接 / 反链
        {
            labelKey: 'menu.edit.frontMatter',
            menuAction: 'baize:menu:edit:front-matter'
        },
        {
            labelKey: 'menu.edit.knowledge',
            submenu: [
                {
                    labelKey: 'menu.edit.knowledgeTags',
                    menuAction: 'baize:menu:edit:knowledge-tags'
                },
                {
                    labelKey: 'menu.edit.knowledgeLinks',
                    menuAction: 'baize:menu:edit:knowledge-links'
                },
                {
                    labelKey: 'menu.edit.knowledgeBacklinks',
                    menuAction: 'baize:menu:edit:knowledge-backlinks'
                },
                {
                    labelKey: 'menu.edit.attachments',
                    menuAction: 'baize:menu:edit:attachments'
                }
            ]
        }
        // FUN-09：在文件中查找/替换（Ctrl+Shift+F/H）需要主进程目录遍历与结果面板，
        // 本轮无法低成本实现，暂时从菜单隐藏（A-4 模式，数据保留）。
        // Roadmap：目录级全文检索。原主进程 handler 为 console.warn 空实现，已删除。
        // { label: '在文件中查找', accelerator: 'Ctrl+Shift+F', menuAction: 'baize:menu:edit:find-in-dir' },
        // { label: '在文件中替换', accelerator: 'Ctrl+Shift+H', menuAction: 'baize:menu:edit:replace-in-dir' }
    ]
}

const viewMenu: BaiZeMenuEntry = {
    labelKey: 'menu.view.label',
    // REQ-13：视图 → Alt+V
    accessKey: 'V',
    submenu: [
        {
            labelKey: 'menu.view.editMode',
            accelerator: 'F9',
            menuAction: 'baize:menu:view:edit-mode'
        },
        {
            labelKey: 'menu.view.previewMode',
            accelerator: 'F10',
            menuAction: 'baize:menu:view:preview-mode'
        },
        {
            labelKey: 'menu.view.editPreviewMode',
            accelerator: 'F11',
            menuAction: 'baize:menu:view:edit-preview-mode'
        },
        {
            labelKey: 'menu.view.devTools',
            accelerator: 'F12',
            menuAction: 'baize:menu:view:dev-tools'
        },
        { type: 'separator' },
        {
            labelKey: 'menu.view.toggleResourceManager',
            menuAction: 'baize:menu:view:toggle-resource-manager'
        },
        {
            labelKey: 'menu.view.toggleLineNumber',
            menuAction: 'baize:menu:view:toggle-line-number'
        },
        { labelKey: 'menu.view.toggleWhitespace', menuAction: 'baize:menu:view:toggle-whitespace' },
        // FUN-09：大纲开关由渲染层 emit 'editor-toggle-outline'（原主进程实现与
        // 资源管理器开关串线，已修复）；折叠子菜单 emit 'editor-toggle-fold'
        // （payload { mode: 'fold-all' | 'expand-all' | 'fold-level', level }）。
        { labelKey: 'menu.view.toggleOutline', menuAction: 'baize:menu:view:toggle-outline' },
        {
            labelKey: 'menu.view.writingMode',
            menuAction: 'baize:menu:view:writing-mode',
            writingFlag: 'writingMode'
        },
        {
            labelKey: 'menu.view.layoutProfiles',
            menuAction: 'baize:menu:view:layout-profiles'
        },
        { type: 'separator' },
        {
            labelKey: 'menu.view.fold.label',
            submenu: [
                { labelKey: 'menu.view.fold.allFold', menuAction: 'baize:menu:view:fold:all-fold' },
                {
                    labelKey: 'menu.view.fold.allExpand',
                    menuAction: 'baize:menu:view:fold:all-expand'
                },
                { labelKey: 'menu.view.fold.level1', menuAction: 'baize:menu:view:fold:level1' },
                { labelKey: 'menu.view.fold.level2', menuAction: 'baize:menu:view:fold:level2' },
                { labelKey: 'menu.view.fold.level3', menuAction: 'baize:menu:view:fold:level3' },
                { labelKey: 'menu.view.fold.level4', menuAction: 'baize:menu:view:fold:level4' },
                { labelKey: 'menu.view.fold.level5', menuAction: 'baize:menu:view:fold:level5' },
                { labelKey: 'menu.view.fold.level6', menuAction: 'baize:menu:view:fold:level6' }
            ]
        }
    ]
}

const opeFileEncoding: BaiZeMenuEntry = {
    labelKey: 'menu.coding.reopen',
    submenu: [
        { labelKey: 'menu.coding.utf8', menuAction: 'baize:menu:coding:encoding:utf8' },
        { labelKey: 'menu.coding.utf16le', menuAction: 'baize:menu:coding:encoding:utf16-le' },
        { labelKey: 'menu.coding.utf16be', menuAction: 'baize:menu:coding:encoding:utf16-be' },
        { type: 'separator' },
        { labelKey: 'menu.coding.gbk', menuAction: 'baize:menu:coding:encoding:gbk' },
        { labelKey: 'menu.coding.gb2312', menuAction: 'baize:menu:coding:encoding:gb2312' },
        { labelKey: 'menu.coding.gb18030', menuAction: 'baize:menu:coding:encoding:gb18030' },
        { labelKey: 'menu.coding.big5', menuAction: 'baize:menu:coding:encoding:big5' },
        { labelKey: 'menu.coding.big5hkscs', menuAction: 'baize:menu:coding:encoding:big5-hkscs' },
        { type: 'separator' },
        { labelKey: 'menu.coding.hex', menuAction: 'baize:menu:coding:encoding:hex' },
        { labelKey: 'menu.coding.warning' }
    ]
}

const switchEncodingMenu: BaiZeMenuEntry = {
    labelKey: 'menu.coding.convert',
    submenu: [
        { labelKey: 'menu.coding.utf8', menuAction: 'baize:menu:coding:switch:utf8' },
        { labelKey: 'menu.coding.utf16le', menuAction: 'baize:menu:coding:switch:utf16-le' },
        { labelKey: 'menu.coding.utf16be', menuAction: 'baize:menu:coding:switch:utf16-be' },
        { type: 'separator' },
        { labelKey: 'menu.coding.gbk', menuAction: 'baize:menu:coding:switch:gbk' },
        { labelKey: 'menu.coding.gb2312', menuAction: 'baize:menu:coding:switch:gb2312' },
        { labelKey: 'menu.coding.gb18030', menuAction: 'baize:menu:coding:switch:gb18030' },
        { labelKey: 'menu.coding.big5', menuAction: 'baize:menu:coding:switch:big5' },
        { labelKey: 'menu.coding.big5hkscs', menuAction: 'baize:menu:coding:switch:big5-hkscs' },
        { type: 'separator' },
        { labelKey: 'menu.coding.hex', menuAction: 'baize:menu:coding:switch:hex' },
        { labelKey: 'menu.coding.warning' }
    ]
}
const codingMenu: BaiZeMenuEntry = {
    labelKey: 'menu.coding.label',
    // REQ-13：编码 → Alt+C（Coding / Character encoding 首字母）
    accessKey: 'C',
    submenu: [
        opeFileEncoding, // 编码
        switchEncodingMenu // 切换编码
    ]
}

// FE-28：下列模板分组标签原为硬编码 label（Material/Mermaid/PlantUML/Part1/Part2），
// 现统一存 menu 命名空间 labelKey，由 MenuBar.vue 渲染时 t(labelKey) 输出。
// Material 语法插入扩展（15 项 mkdocs-material 语法入口，排在 Admonition 之后）。
// 动作 id 契约：baize:menu:insert:material:<featureId>，由 menu-actions.ts 统一拦截并
// 打开 materialSyntax 对话框（configStore 名为 'materialSyntax'，第二参 preset 指定语法
// 类型，见 useConfigStore 的 DialogState）。labelKey 采用 menu.insert.material.<camelCase>，
// 中英文案见 shared/i18n/messages/{zh-CN,en-US}/menu.ts。
// 顺序即菜单展示顺序：折叠提示块/任务列表/高亮/插入删除/上下标/键盘按键/属性列表/脚注/
// 定义列表/网格卡片/代码块增强/Material 图标/块语法/文件片段/标签页深链。
// 现有 material:admonition 保持原有链路（主进程 Vue 对话框）不变。
// M3（结构优化第 5 批）：15 项扩展语法的 labelKey/menuAction 不再手写，统一由
// shared/constants/material-syntax.ts 的 MATERIAL_SYNTAX_FEATURES 生成（单一真源）；
// 菜单顺序即 manifest 顺序。
const insertMaterial: BaiZeMenuEntry = {
    labelKey: 'menu.insert.material.label',
    submenu: [
        {
            labelKey: 'menu.insert.material.admonition',
            menuAction: 'baize:menu:insert:material:admonition'
        },
        ...MATERIAL_SYNTAX_FEATURES.map((feature) => ({
            labelKey: feature.menuLabelKey,
            menuAction: getMaterialSyntaxMenuAction(feature.id)
        }))
    ]
}

const insertMermaid: BaiZeMenuEntry = {
    labelKey: 'menu.insert.mermaid.label',
    submenu: [
        { labelKey: 'menu.insert.mermaid.part1', submenu: Templates.MermaidPart1 },
        { labelKey: 'menu.insert.mermaid.part2', submenu: Templates.MermaidPart2 }
    ]
}

const insertPlantUML: BaiZeMenuEntry = {
    labelKey: 'menu.insert.plantuml.label',
    submenu: [
        { labelKey: 'menu.insert.plantuml.part1', submenu: Templates.PlantUMLPart1 },
        { labelKey: 'menu.insert.plantuml.part2', submenu: Templates.PlantUMLPart2 }
    ]
}

const insertMenu: BaiZeMenuEntry = {
    labelKey: 'menu.insert.label',
    // REQ-13：插入 → Alt+I
    accessKey: 'I',
    submenu: [
        // 绘图入口（从「工具 → 绘图工具」提升为插入菜单一级项，单独分组）
        {
            labelKey: 'menu.tools.drawing.mermaid',
            menuAction: 'baize:menu:tools:drawing:mermaid'
        },
        {
            labelKey: 'menu.tools.drawing.plantuml',
            menuAction: 'baize:menu:tools:drawing:plantuml'
        },
        { type: 'separator' },
        { labelKey: 'menu.insert.writing', submenu: Templates.Writing },
        { labelKey: 'menu.insert.textBlock', submenu: Templates.TextBlock },
        { labelKey: 'menu.insert.fromFile', submenu: Templates.InsertFromFiles },
        { type: 'separator' },
        insertMaterial,
        insertMermaid, // 编码
        insertPlantUML // 切换编码
        // FUN-09：自定义模板/模板管理原为主进程 console.warn 空实现（点击无任何反应），
        // 完整模板编辑与管理体系无法低成本实现，暂时从菜单隐藏（A-4 模式，数据保留）。
        // Roadmap：自定义模板编辑与模板管理界面。
        // { type: 'separator' },
        // { label: '自定义模板', menuAction: 'baize:menu:insert:custom-template' },
        // { label: '模板管理', menuAction: 'baize:menu:insert:template-manager' }
    ]
}

const settingMenu: BaiZeMenuEntry = {
    labelKey: 'menu.setting.label',
    // REQ-13：设置 → Alt+S
    accessKey: 'S',
    submenu: [
        { labelKey: 'menu.setting.system', menuAction: 'baize:menu:setting:system' },
        { labelKey: 'menu.setting.theme', menuAction: 'baize:menu:setting:theme' },
        { type: 'separator' },
        { labelKey: 'menu.setting.quickLink', menuAction: 'baize:menu:setting:quick-link' },
        { labelKey: 'menu.setting.editor', menuAction: 'baize:menu:setting:monaco-editor' }
    ]
}

const toolsMenu: BaiZeMenuEntry = {
    labelKey: 'menu.tools.label',
    // REQ-13：工具 → Alt+T
    accessKey: 'T',
    submenu: [
        { labelKey: 'menu.tools.mermaid', menuAction: 'baize:menu:tools:mermaid' },
        { labelKey: 'menu.tools.images', menuAction: 'baize:menu:tools:images' },
        { type: 'separator' },
        // 从「插入」菜单迁入的内容工具；公式/表格与原 tools:katex/table 重复项已合并
        { labelKey: 'menu.insert.specialText', menuAction: 'baize:menu:insert:special-text' },
        { labelKey: 'menu.insert.math', menuAction: 'baize:menu:insert:math' },
        { labelKey: 'menu.insert.mdTable', menuAction: 'baize:menu:insert:md-table' },
        { labelKey: 'menu.insert.webLink', menuAction: 'baize:menu:insert:web-link' },
        { type: 'separator' },
        // 1.5.2 E6：今日日记 / 快速收件箱（可选能力 dailyNotes，默认关闭）。
        // 菜单项保持可见以便用户发现；动作执行时由 menu-actions 校验开关并提示开启，
        // 关闭状态下不产生任何文件行为（命令面板侧则按开关不注册入口）。
        { labelKey: 'menu.tools.dailyNote', menuAction: 'baize:menu:tools:daily-note' },
        { labelKey: 'menu.tools.inboxCapture', menuAction: 'baize:menu:tools:inbox-capture' },
        // 1.5.2 E1：剪贴板剪藏（可选能力 clipCapture，默认关闭）。
        // 关闭时同样保持菜单可见，执行前由 menu-actions 提示开启，且不会读取系统剪贴板。
        { labelKey: 'menu.tools.clipToNote', menuAction: 'baize:menu:tools:clip-to-note' },
        { labelKey: 'menu.tools.clipToEditor', menuAction: 'baize:menu:tools:clip-to-editor' },
        // 1.5.2 E3：图片 OCR（可选能力 imageOcr，默认关闭，MVP 仅识别剪贴板截图）。
        // 关闭时保持菜单可见，执行前由 menu-actions 提示开启，且不会读取剪贴板/加载引擎。
        { labelKey: 'menu.tools.imageOcrInsert', menuAction: 'baize:menu:tools:ocr-insert' },
        { labelKey: 'menu.tools.imageOcrCopy', menuAction: 'baize:menu:tools:ocr-copy' }
    ]
}

// ---------------------------------------------------------------------------------------------
// FE-16/FE-17：插件菜单数据与「注册表 ↔ 菜单」一致性
//
// 三跳链路现状（task-23 核对结论）：
//   1) menu-config.ts（本文件 pluginsMenu，数据主源为 shared/constants/plugin-tools-manifest.ts）
//      —— 渲染层菜单树，MenuBar.vue 按 submenu.length > 0 决定是否有子菜单/箭头；
//   2) menu-actions.ts —— 对所有 'baize:menu:plugins:*' 动作统一拦截并
//      EventBus.$emit(PLUGIN_TOOL_SHOW, action)，由 PluginTools.vue 展示组件；
//      例外（1.5.6）：'baize:menu:plugins:search' 为「插件搜索」入口动作，在通用前缀
//      拦截之前精确命中并发 PLUGIN_SEARCH_SHOW（打开面板 + 进入搜索入口视图，不打开工具）；
//   3) main/ipc/menu-tools.ts —— 主进程 pluginsMenuHandlers 已在 P2 死代码清理中删除，
//      因为其唯一实现是向渲染层零监听的 OPEN_PLUGIN_TOOL 通道 send（双死路径），
//      插件工具实际链路是「渲染层两跳」（menu-actions → EventBus → PluginTools.vue）。
// 因此 FE-16 的修复点只在数据层：剔除空组，避免渲染出点击无反应的空条目。
// ---------------------------------------------------------------------------------------------

// M3（结构优化收尾）：38 项插件工具的分区/顺序/i18n key 统一由
// shared/constants/plugin-tools-manifest.ts 的 PLUGIN_TOOL_MENU 维护（唯一真源）。
// 本文件只做「manifest 节点 → 菜单项」的纯数据投影；plugin-tools-const.ts 的懒加载
// 注册表由同一份 manifest 生成，菜单与注册表天然一致（tests/unit/plugin_tools_manifest.test.ts
// 守护 38 项覆盖/无重复/顺序一致）。FE-17 的 4 个补入口（HTTP 状态码/子网掩码/数字大小写/
// 常见字体）已并入 manifest 原位保留。
//
// 空组（语言关键字/大小写转换/数据和命令对照表）仍在 manifest 中保留 children: []，
// 导出前由下方 pruneEmptySubmenus 剪除；数据补齐后无需改此处即自动展示（FE-16 语义不变）。

/**
 * 「插件 → 插件搜索」入口动作 id（1.5.6 新增，用户需求 2026-11-28）。
 *
 * 与 38 项插件工具动作的区别：本动作不打开某个具体工具，而是打开插件工具面板并进入
 * 「搜索入口视图」（搜索框聚焦；空白查询展示最近使用 ≤20 项 + 全部工具）。
 * menu-actions.ts 必须在通用 `PLUGIN_TOOL_ACTION_PREFIX` 前缀拦截**之前**精确命中本动作，
 * 否则会被当作工具动作 emit(PLUGIN_TOOL_SHOW, '...:search')，形成无组件的死入口。
 */
export const PLUGIN_SEARCH_MENU_ACTION = 'baize:menu:plugins:search'

/** manifest 菜单节点 → 菜单项（组节点递归展开，叶子项按 manifest 生成 menuAction） */
function toPluginMenuEntry(node: PluginToolMenuNode): BaiZeMenuEntry {
    if ('children' in node) {
        return {
            labelKey: getPluginToolGroupLabelKey(node.id),
            submenu: node.children.map(toPluginMenuEntry)
        }
    }
    return {
        labelKey: node.menuLabelKey,
        menuAction: getPluginToolMenuAction(node.id)
    }
}

const pluginsMenu: BaiZeMenuEntry = {
    labelKey: 'menu.plugins.label',
    // REQ-13：插件 → Alt+P
    accessKey: 'P',
    submenu: [
        // 1.5.6 插件搜索入口：作为「插件」菜单首项（置顶）单独声明。
        // MENU-08 边界说明：38 项工具仍 100% 由 manifest 投影生成（下方展开），本项是
        // 「面板级入口动作」而非插件工具，写入 manifest 会污染工具注册表/懒加载表，故在此声明。
        {
            labelKey: 'menu.plugins.search',
            menuAction: PLUGIN_SEARCH_MENU_ACTION
        },
        ...PLUGIN_TOOL_MENU.map(toPluginMenuEntry)
    ]
}

/**
 * FE-16：剔除「空组」菜单项，并清理因此产生的首尾/连续分隔符。
 *
 * 背景：menu-consts.ts 中一批插件映射表在 A-4/ARC-09/CMP-29 清理后是空数组，
 * 但 menu-config.ts 仍把它们渲染为菜单组；MenuBar.vue 用 `submenu.length > 0`
 * 判定箭头，空组既无箭头也没有 menuAction，点击/悬浮永远没有反应（FE-16 的
 * 9 个空条目即来源于此——4 个转换器子组 + 1 个转换器外层组 + 语言关键字组 +
 * 解析器组 + 数据和命令对照表组）。
 *
 * 修复方式：在数据层递归剔除「submenu 递归后为空」的容器项（菜单树的菜单动作
 * 叶子全部保留）。这样既修复当前空数据，也保证后续再有空数组时不会回归出
 * 点击无反应的死条目；数据补齐（组件实现并注册）后无需改动本函数即可自动重新展示。
 *
 * @param items 待剪枝的菜单树（不修改入参）
 * @returns 剪枝后的新菜单树
 */
export function pruneEmptySubmenus(items: BaiZeMenuEntry[]): BaiZeMenuEntry[] {
    const pruned: BaiZeMenuEntry[] = []
    for (const item of items) {
        if (item.submenu) {
            const children = pruneEmptySubmenus(item.submenu)
            // 最近文件/最近文件夹为「运行时注入」占位项：初始 submenu 为空属预期，
            // 由 MenuBar.vue 打开菜单时填充，不能被当作空组剪掉。
            if (children.length === 0 && item.recentMenuPlaceholder !== true) {
                continue
            }
            pruned.push({ ...item, submenu: children })
        } else {
            pruned.push(item)
        }
    }
    // 去掉被剪枝后暴露出来的连续分隔符 / 首尾分隔符（否则会出现空段与悬空横线）
    return pruned.filter((item, index, array) => {
        if (item.type !== 'separator') {
            return true
        }
        const prev = array[index - 1]
        const next = array[index + 1]
        return Boolean(prev && next && prev.type !== 'separator' && next.type !== 'separator')
    })
}

// 在线工具菜单
// 工具网站菜单
const onlineMenu: BaiZeMenuEntry = {
    labelKey: 'menu.online.label',
    // REQ-13：在线 → Alt+O
    accessKey: 'O',
    submenu: [
        {
            labelKey: 'menu.online.group.cainiao',
            submenu: generateMenuItems(MenuConst.CaiNiaoUrlMaps)
        },
        {
            labelKey: 'menu.online.group.w3school',
            submenu: generateMenuItems(MenuConst.W3SchoolUrlMaps)
        },
        {
            labelKey: 'menu.online.group.encode',
            submenu: generateMenuItems(MenuConst.EncDecUrlMaps)
        },
        {
            labelKey: 'menu.online.group.ide',
            submenu: generateMenuItems(MenuConst.IdeUrlMaps)
        },
        {
            labelKey: 'menu.online.group.dev',
            submenu: generateMenuItems(MenuConst.DevelopUrlMaps)
        },
        {
            labelKey: 'menu.online.group.team',
            submenu: generateMenuItems(MenuConst.TeamUrlMaps)
        },
        {
            labelKey: 'menu.online.group.cloud',
            submenu: generateMenuItems(MenuConst.CloudUrlMaps)
        }
    ]
}

// ---------------------------------------------------------------------------------------------
// AI 导航菜单（task-50）
//
// 数据源：菜鸟 AI 导航（https://www.jyshare.com/ai/）精选核心条目，按 9 组归类（70 个叶子）。
// 与「在线」菜单的差异：在线菜单的条目 id/URL 数据源在 menu-consts.ts，而 AI 导航是独立新增
// 菜单域，按任务约定只改 menu-config.ts（菜单树）与 menu-tools.ts（主进程 handler），故菜单数据
// 内联本文件；URL 只存主进程（渲染层不需要 URL），保证 URL 单一真源、避免两份漂移。
// 动作 id 契约：baize:menu:ai:<group>:<tool-id>，主进程 menu-tools.ts 的 aiMenuHandlers 按同
// 路径命中（menu-handle.ts 的 ai 域分发），复用既有 IPC.MENU.ACTION 通道，未新增 IPC 通道。
// ---------------------------------------------------------------------------------------------
interface AiMenuLeafDef {
    id: string
    labelKey: string
}

interface AiMenuGroupDef {
    group: string
    labelKey: string
    items: AiMenuLeafDef[]
}

// 9 组 70 个叶子；组名即动作 id 的 <group> 段，id 即 <tool-id> 段，两者共同决定主进程可路由路径。
const aiMenuGroups: AiMenuGroupDef[] = [
    {
        group: 'hot',
        labelKey: 'menu.ai.group.hot',
        items: [
            { id: 'chatgpt', labelKey: 'menu.ai.hot.chatgpt' },
            { id: 'deepseek', labelKey: 'menu.ai.hot.deepseek' },
            { id: 'doubao', labelKey: 'menu.ai.hot.doubao' },
            { id: 'kimi', labelKey: 'menu.ai.hot.kimi' },
            { id: 'tongyi', labelKey: 'menu.ai.hot.tongyi' },
            { id: 'wenxin', labelKey: 'menu.ai.hot.wenxin' },
            { id: 'yuanbao', labelKey: 'menu.ai.hot.yuanbao' },
            { id: 'claude', labelKey: 'menu.ai.hot.claude' },
            { id: 'gemini', labelKey: 'menu.ai.hot.gemini' },
            { id: 'grok', labelKey: 'menu.ai.hot.grok' },
            { id: 'copilot', labelKey: 'menu.ai.hot.copilot' },
            { id: 'perplexity', labelKey: 'menu.ai.hot.perplexity' },
            { id: 'chatglm', labelKey: 'menu.ai.hot.chatglm' },
            { id: 'tiangong', labelKey: 'menu.ai.hot.tiangong' }
        ]
    },
    {
        group: 'coding',
        labelKey: 'menu.ai.group.coding',
        items: [
            { id: 'cursor', labelKey: 'menu.ai.coding.cursor' },
            { id: 'trae', labelKey: 'menu.ai.coding.trae' },
            { id: 'qoder', labelKey: 'menu.ai.coding.qoder' },
            { id: 'github-copilot', labelKey: 'menu.ai.coding.githubCopilot' },
            { id: 'opencode', labelKey: 'menu.ai.coding.opencode' },
            { id: 'google-ai-studio', labelKey: 'menu.ai.coding.googleAiStudio' },
            { id: 'coding-plan', labelKey: 'menu.ai.coding.codingPlan' },
            { id: 'zcode', labelKey: 'menu.ai.coding.zcode' },
            { id: 'deepseek-harness', labelKey: 'menu.ai.coding.deepseekHarness' }
        ]
    },
    {
        group: 'image',
        labelKey: 'menu.ai.group.image',
        items: [
            { id: 'midjourney', labelKey: 'menu.ai.image.midjourney' },
            { id: 'stable-diffusion', labelKey: 'menu.ai.image.stableDiffusion' },
            { id: 'leonardo', labelKey: 'menu.ai.image.leonardo' },
            { id: 'adobe-firefly', labelKey: 'menu.ai.image.adobeFirefly' },
            { id: 'runway', labelKey: 'menu.ai.image.runway' },
            { id: 'canva', labelKey: 'menu.ai.image.canva' },
            { id: 'figma', labelKey: 'menu.ai.image.figma' },
            { id: 'remove-bg', labelKey: 'menu.ai.image.removeBg' },
            { id: 'clipdrop', labelKey: 'menu.ai.image.clipdrop' },
            { id: 'civitai', labelKey: 'menu.ai.image.civitai' }
        ]
    },
    {
        group: 'writing',
        labelKey: 'menu.ai.group.writing',
        items: [
            { id: 'notion-ai', labelKey: 'menu.ai.writing.notionAi' },
            { id: 'grammarly', labelKey: 'menu.ai.writing.grammarly' },
            { id: 'quillbot', labelKey: 'menu.ai.writing.quillbot' },
            { id: 'gamma', labelKey: 'menu.ai.writing.gamma' },
            { id: 'notebooklm', labelKey: 'menu.ai.writing.notebooklm' },
            { id: 'metaso', labelKey: 'menu.ai.writing.metaso' },
            { id: 'poe', labelKey: 'menu.ai.writing.poe' }
        ]
    },
    {
        group: 'office',
        labelKey: 'menu.ai.group.office',
        items: [
            { id: 'miro', labelKey: 'menu.ai.office.miro' },
            { id: 'ima-copilot', labelKey: 'menu.ai.office.imaCopilot' },
            { id: 'manus', labelKey: 'menu.ai.office.manus' }
        ]
    },
    {
        group: 'media',
        labelKey: 'menu.ai.group.media',
        items: [
            { id: 'suno', labelKey: 'menu.ai.media.suno' },
            { id: 'elevenlabs', labelKey: 'menu.ai.media.elevenlabs' },
            { id: 'veed', labelKey: 'menu.ai.media.veed' },
            { id: 'reccloud', labelKey: 'menu.ai.media.reccloud' },
            { id: 'turboscribe', labelKey: 'menu.ai.media.turboscribe' },
            { id: 'genmo', labelKey: 'menu.ai.media.genmo' },
            { id: 'kling', labelKey: 'menu.ai.media.kling' },
            { id: 'hailuo', labelKey: 'menu.ai.media.hailuo' }
        ]
    },
    {
        group: 'agent',
        labelKey: 'menu.ai.group.agent',
        items: [
            { id: 'openclaw', labelKey: 'menu.ai.agent.openclaw' },
            { id: 'kimiclaw', labelKey: 'menu.ai.agent.kimiclaw' },
            { id: 'autoclaw', labelKey: 'menu.ai.agent.autoclaw' },
            { id: 'maxclaw', labelKey: 'menu.ai.agent.maxclaw' },
            { id: 'arkclaw', labelKey: 'menu.ai.agent.arkclaw' },
            { id: 'easyclaw', labelKey: 'menu.ai.agent.easyclaw' },
            { id: 'qoderwork', labelKey: 'menu.ai.agent.qoderwork' },
            { id: 'miaoda', labelKey: 'menu.ai.agent.miaoda' },
            { id: 'agent-skills', labelKey: 'menu.ai.agent.agentSkills' },
            { id: 'skillhub-qq', labelKey: 'menu.ai.agent.skillhubQq' }
        ]
    },
    {
        group: 'model',
        labelKey: 'menu.ai.group.model',
        items: [
            { id: 'hugging-face', labelKey: 'menu.ai.model.huggingFace' },
            { id: 'openrouter', labelKey: 'menu.ai.model.openrouter' },
            { id: 'arena', labelKey: 'menu.ai.model.arena' },
            { id: 'artificial-analysis', labelKey: 'menu.ai.model.artificialAnalysis' },
            { id: 'swe-bench', labelKey: 'menu.ai.model.sweBench' }
        ]
    },
    {
        group: 'more',
        labelKey: 'menu.ai.group.more',
        items: [
            { id: 'jyshare-ai', labelKey: 'menu.ai.more.jyshareAi' },
            { id: 'google-labs', labelKey: 'menu.ai.more.googleLabs' },
            { id: 'skillsmp', labelKey: 'menu.ai.more.skillsmp' },
            { id: 'character-ai', labelKey: 'menu.ai.more.characterAi' }
        ]
    }
]

const aiMenu: BaiZeMenuEntry = {
    labelKey: 'menu.ai.label',
    // REQ-13：AI 导航 → Alt+A
    accessKey: 'A',
    submenu: aiMenuGroups.map((group) => ({
        labelKey: group.labelKey,
        submenu: group.items.map((item) => ({
            labelKey: item.labelKey,
            menuAction: `baize:menu:ai:${group.group}:${item.id}`
        }))
    }))
}

// FE-28：GitHub 为品牌名，按 i18n 约定保留原文 label（不翻译，故不设 menu key）。
const gitHubMenu: BaiZeMenuEntry = {
    label: 'GitHub',
    // REQ-13：GitHub → Alt+G（品牌名不翻译，助记符固定 G）
    accessKey: 'G',
    submenu: generateMenuItems(MenuConst.GitHubUrlMaps)
}

const helpMenu: BaiZeMenuEntry = {
    labelKey: 'menu.help.label',
    // REQ-13：帮助 → Alt+H
    accessKey: 'H',
    submenu: [
        {
            labelKey: 'menu.help.release',
            submenu: [
                { label: 'v1.5.6', menuAction: 'baize:menu:help:release-notes:v1.5.6' },
                { label: 'v1.5.5', menuAction: 'baize:menu:help:release-notes:v1.5.5' },
                { label: 'v1.5.2', menuAction: 'baize:menu:help:release-notes:v1.5.2' },
                { label: 'v1.5.1', menuAction: 'baize:menu:help:release-notes:v1.5.1' },
                { label: 'v1.5.0', menuAction: 'baize:menu:help:release-notes:v1.5.0' },
                { label: 'v1.3.9', menuAction: 'baize:menu:help:release-notes:v1.3.9' },
                { label: 'v1.3.5', menuAction: 'baize:menu:help:release-notes:v1.3.5' },
                { label: 'v1.3.0', menuAction: 'baize:menu:help:release-notes:v1.3.0' },
                { label: 'v1.2.2', menuAction: 'baize:menu:help:release-notes:v1.2.2' },
                { label: 'v1.2.1', menuAction: 'baize:menu:help:release-notes:v1.2.1' },
                { label: 'v1.2.0', menuAction: 'baize:menu:help:release-notes:v1.2.0' },
                { label: 'v1.1.5', menuAction: 'baize:menu:help:release-notes:v1.1.5' },
                { label: 'v1.1.3', menuAction: 'baize:menu:help:release-notes:v1.1.3' },
                { label: 'v1.1.2', menuAction: 'baize:menu:help:release-notes:v1.1.2' },
                { label: 'v1.1.1', menuAction: 'baize:menu:help:release-notes:v1.1.1' },
                { label: 'v1.1.0', menuAction: 'baize:menu:help:release-notes:v1.1.0' },
                { label: 'v1.0.2', menuAction: 'baize:menu:help:release-notes:v1.0.2' },
                { label: 'v1.0.1', menuAction: 'baize:menu:help:release-notes:v1.0.1' },
                { label: 'v1.0.0', menuAction: 'baize:menu:help:release-notes:v1.0.0' }
            ]
        },
        {
            labelKey: 'menu.help.updateLog',
            submenu: [
                { labelKey: 'menu.help.updateLogItem', menuAction: 'baize:menu:help:update-log' }
            ]
        },
        { type: 'separator' },
        { labelKey: 'menu.help.shortkeys', menuAction: 'baize:menu:help:shortkeys' },
        { labelKey: 'menu.help.usage', menuAction: 'baize:menu:help:usage' },
        {
            labelKey: 'menu.help.guide',
            submenu: [
                { labelKey: 'menu.help.guideHtml', menuAction: 'baize:menu:help:guide-html' },
                { labelKey: 'menu.help.guidePdf', menuAction: 'baize:menu:help:guide-pdf' }
            ]
        },
        { labelKey: 'menu.help.issues', menuAction: 'baize:menu:help:issues' },
        { type: 'separator' },
        { labelKey: 'menu.help.techStack', menuAction: 'baize:menu:help:tech-stack' },
        { labelKey: 'menu.help.about', menuAction: 'baize:menu:help:about' },
        { labelKey: 'menu.help.home', menuAction: 'baize:menu:help:home' },
        { type: 'separator' },
        { labelKey: 'menu.help.update', menuAction: 'baize:menu:help:update' },
        { labelKey: 'menu.help.contactUs', menuAction: 'baize:menu:help:contact-us' }
    ]
}

// FE-16：菜单树导出前统一剪除空组（见 pruneEmptySubmenus 注释），
// 保证 MenuBar.vue 不会渲染出「无箭头、无 menuAction、点击无反应」的空条目。
export const menuMap = ref<BaiZeMenuEntry[]>(
    markRaw(
        pruneEmptySubmenus([
            fileMenu, // 文件
            editMenu, // 编辑
            viewMenu, // 视图
            codingMenu, // 编码
            insertMenu,
            settingMenu,
            toolsMenu,
            pluginsMenu,
            onlineMenu,
            aiMenu, // AI 导航（task-50，位于「在线」之后、「GitHub」之前）
            // CMP-29：被注释的死菜单项 'quickLinkMenu'（从未定义）已删除。
            gitHubMenu,
            helpMenu
        ])
    )
)

// ---------------------------------------------------------------------------------------------
// REQ-13（1.5.6）：顶层菜单 Alt+字母助记符映射表
//
// 单一真源：字母声明在顶层菜单定义的 `accessKey` 字段上，本表只做派生投影，顺序与菜单栏
// 完全一致（文件 F → 帮助 H）。MenuBar.vue 的键盘交互、帮助文档与门禁测试都消费这一份数据，
// 不允许在别处再手写一份字母表（避免菜单增删后助记符漂移）。
//
// 冲突约定：字母取英文语义首字母（文件 File→F、编辑 Edit→E、视图 View→V、编码 Coding→C、
// 插入 Insert→I、设置 Settings→S、工具 Tools→T、插件 Plugins→P、在线 Online→O、
// AI 导航→A、GitHub→G、帮助 Help→H），当前 12 个字母无冲突；若未来新增顶层菜单发生
// 冲突，必须在菜单定义处重新分配，并由 tests/unit/vue/menubar-keyboard.test.ts 的
// 「映射表」用例拦截（覆盖全部顶层菜单 + 字母唯一）。
// ---------------------------------------------------------------------------------------------

/** 顶层菜单 Alt+字母助记符条目（菜单标识 + 单个大写字母） */
export interface TopMenuAccessKeyEntry {
    /** 顶层菜单 i18n key（品牌名 GitHub 等用 label 原样展示时为 undefined） */
    labelKey?: string
    /** 不翻译的顶层菜单文案（当前仅 GitHub） */
    label?: string
    /** `Alt + accessKey` 打开/切换到该顶层菜单（单个 A-Z 字母） */
    accessKey: string
}

/** 顶层菜单 Alt+字母助记符表（由 menuMap 顶层项的 accessKey 派生，顺序即菜单栏顺序） */
export const TOP_MENU_ACCESS_KEYS: readonly TopMenuAccessKeyEntry[] = menuMap.value
    .filter(
        (item): item is BaiZeMenuEntry & { accessKey: string } =>
            typeof item.accessKey === 'string' && item.accessKey.length > 0
    )
    .map((item) => ({
        labelKey: item.labelKey,
        label: item.label,
        accessKey: item.accessKey
    }))
