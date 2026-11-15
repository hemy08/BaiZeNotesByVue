// 菜单数据结构
import { ref, markRaw } from 'vue'
import type { BaiZeMenuItem } from '../../../../shared/types'
import * as MenuConst from './menu-consts'
import * as Templates from '../../common/templates'

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
}

// 辅助函数：从UrlMaps生成菜单项
function generateMenuItems(
    urlMaps: Array<{ id: string; label?: string; labelKey?: string; url: string }>
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
        { labelKey: 'menu.file.export.pdf', menuAction: 'baize:menu:file:export:pdf' }
    ]
}

const fileMenu: BaiZeMenuEntry = {
    labelKey: 'menu.file.label',
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
        { type: 'separator' },
        importMenu,
        exportMenu,
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
    submenu: [
        opeFileEncoding, // 编码
        switchEncodingMenu // 切换编码
    ]
}

// FE-28：下列模板分组标签原为硬编码 label（Material/Mermaid/PlantUML/Part1/Part2），
// 现统一存 menu 命名空间 labelKey，由 MenuBar.vue 渲染时 t(labelKey) 输出。
const insertMaterial: BaiZeMenuEntry = {
    labelKey: 'menu.insert.material.label',
    submenu: [
        {
            labelKey: 'menu.insert.material.admonition',
            menuAction: 'baize:menu:insert:material:admonition'
        }
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
    submenu: [
        { labelKey: 'menu.insert.specialText', menuAction: 'baize:menu:insert:special-text' },
        { labelKey: 'menu.insert.math', menuAction: 'baize:menu:insert:math' },
        { labelKey: 'menu.insert.mdTable', menuAction: 'baize:menu:insert:md-table' },
        { labelKey: 'menu.insert.webLink', menuAction: 'baize:menu:insert:web-link' },
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
    submenu: [
        { labelKey: 'menu.tools.mermaid', menuAction: 'baize:menu:tools:mermaid' },
        { labelKey: 'menu.tools.katex', menuAction: 'baize:menu:tools:katex' },
        { labelKey: 'menu.tools.table', menuAction: 'baize:menu:tools:table' },
        { labelKey: 'menu.tools.images', menuAction: 'baize:menu:tools:images' },
        // FUN-09：原"绘图工具"单条目 send 'OpenFile' 通道全库无监听（点击无反应）。
        // 改为插入 mermaid/plantuml 基础框架模板，复用模板插入事件链路
        // （menu_actions.ts emit 'baize:notes:monaco-editor:insert-text'）。
        {
            labelKey: 'menu.tools.drawing.label',
            submenu: [
                {
                    labelKey: 'menu.tools.drawing.mermaid',
                    menuAction: 'baize:menu:tools:drawing:mermaid'
                },
                {
                    labelKey: 'menu.tools.drawing.plantuml',
                    menuAction: 'baize:menu:tools:drawing:plantuml'
                }
            ]
        }
    ]
}

// ---------------------------------------------------------------------------------------------
// FE-16/FE-17：插件菜单数据与「注册表 ↔ 菜单」一致性
//
// 三跳链路现状（task-23 核对结论）：
//   1) menu-config.ts（本文件 pluginsMenu，数据主源为 menu-consts.ts 的 Plugin*Maps）
//      —— 渲染层菜单树，MenuBar.vue 按 submenu.length > 0 决定是否有子菜单/箭头；
//   2) menu-actions.ts —— 对所有 'baize:menu:plugins:*' 动作统一拦截并
//      EventBus.$emit(PLUGIN_TOOL_SHOW, action)，由 PluginTools.vue 展示组件；
//   3) main/ipc/menu-tools.ts —— 主进程 pluginsMenuHandlers 已在 P2 死代码清理中删除，
//      因为其唯一实现是向渲染层零监听的 OPEN_PLUGIN_TOOL 通道 send（双死路径），
//      插件工具实际链路是「渲染层两跳」（menu-actions → EventBus → PluginTools.vue）。
// 因此 FE-16 的修复点只在数据层：剔除空组，避免渲染出点击无反应的空条目。
// ---------------------------------------------------------------------------------------------

// FE-17：plugin-tools-const.ts 注册表里这 4 个组件已实现且注册，但菜单数据源
// （menu-consts.ts 的 PluginNetWork / PluginInfoNormal 组）此前没有对应菜单项，导致
// 功能不可达（baize:menu:plugins:net:http-status-codes / net:subnet-mask-map-table /
// info:numeric-case-table / info:normal-font-style-table）。
// task-23 写作用域限定在 menu-config.ts，故在此补齐 4 个入口；标签使用 menu 命名空间
// 对应的 i18n key（menu.plugins.net.* / menu.plugins.info.*，中英均已补齐）。
const pluginNetExtraEntries: BaiZeMenuEntry[] = [
    {
        labelKey: 'menu.plugins.net.httpStatusCodes',
        menuAction: 'baize:menu:plugins:net:http-status-codes'
    },
    {
        labelKey: 'menu.plugins.net.subnetMaskMapTable',
        menuAction: 'baize:menu:plugins:net:subnet-mask-map-table'
    }
]

const pluginInfoExtraEntries: BaiZeMenuEntry[] = [
    {
        labelKey: 'menu.plugins.info.numericCaseTable',
        menuAction: 'baize:menu:plugins:info:numeric-case-table'
    },
    {
        labelKey: 'menu.plugins.info.normalFontStyleTable',
        menuAction: 'baize:menu:plugins:info:normal-font-style-table'
    }
]

const pluginsMenu: BaiZeMenuEntry = {
    labelKey: 'menu.plugins.label',
    submenu: [
        {
            // A-4/ARC-09/CMP-29：PluginCodeDef 目前为空（无注册组件），
            // 该组会被下方 pruneEmptySubmenus 自动隐藏；数据恢复后无需改此处即可重新展示。
            labelKey: 'menu.plugins.group.languageKeywords',
            submenu: MenuConst.PluginCodeDef
        },
        {
            labelKey: 'menu.plugins.group.encrypt',
            submenu: MenuConst.PluginGeneratorMaps
        },
        {
            // FE-16：本组 4 个子组在当前数据下均为空数据（无注册组件），
            // 会被 pruneEmptySubmenus 整体剪除，不再渲染 4 个点击无反应的条目。
            labelKey: 'menu.plugins.group.converters',
            submenu: [
                {
                    labelKey: 'menu.plugins.group.codec',
                    submenu: MenuConst.PluginCodeConvertMaps
                },
                {
                    labelKey: 'menu.plugins.group.formatConvert',
                    submenu: MenuConst.PluginConvertMaps
                },
                {
                    labelKey: 'menu.plugins.group.caseConvert',
                    submenu: MenuConst.PluginUpLowerMaps
                },
                {
                    labelKey: 'menu.plugins.group.formatTools',
                    submenu: MenuConst.PluginFormatMaps
                }
            ]
        },
        {
            labelKey: 'menu.plugins.group.network',
            submenu: [
                {
                    labelKey: 'menu.plugins.group.addressConverter',
                    submenu: MenuConst.PluginNetAddrs
                },
                // FE-17：2 个已注册网络对照表工具（HTTP 状态码 / 子网掩码）补入口。
                ...pluginNetExtraEntries,
                // FE-16：解析器组（PluginNetGenerators）当前为空数据，将被自动剪除。
                {
                    labelKey: 'menu.plugins.group.parsers',
                    submenu: MenuConst.PluginNetGenerators
                },
                ...MenuConst.PluginNetWork
            ]
        },
        {
            labelKey: 'menu.plugins.group.cheatSheets',
            submenu: [
                {
                    labelKey: 'menu.plugins.group.cheatSheet1',
                    // FE-17：2 个已注册常用对照表工具（数字大小写 / 常见字体）补入口。
                    submenu: [...MenuConst.PluginInfoNormal, ...pluginInfoExtraEntries]
                }, // 常用对照表
                {
                    // FE-16：数据和命令对照表（PluginInfoCmd）当前为空数据，将被自动剪除。
                    labelKey: 'menu.plugins.group.dataCommand',
                    submenu: MenuConst.PluginInfoCmd
                },
                {
                    labelKey: 'menu.plugins.group.science',
                    submenu: MenuConst.PluginInfoScience
                }
                // CMP-29：以下两条被注释的死菜单项（Unicode编码表/MIME类型表）已删除，
                // 属"计划中未实现"清单，统一记入 Roadmap（目录级对照表扩展）。
            ]
        }
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
            if (children.length === 0) {
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

// FE-28：GitHub 为品牌名，按 i18n 约定保留原文 label（不翻译，故不设 menu key）。
const gitHubMenu: BaiZeMenuEntry = {
    label: 'GitHub',
    submenu: generateMenuItems(MenuConst.GitHubUrlMaps)
}

const helpMenu: BaiZeMenuEntry = {
    labelKey: 'menu.help.label',
    submenu: [
        {
            labelKey: 'menu.help.release',
            submenu: [
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
            // CMP-29：被注释的死菜单项 'quickLinkMenu'（从未定义）已删除。
            gitHubMenu,
            helpMenu
        ])
    )
)
