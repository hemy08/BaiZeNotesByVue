import * as Templates from '../../common/templates'
import EventBus from '@renderer/common/event-bus/event-bus'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
// ARC-14：插件工具显示事件名收敛至 EventBus 集中常量（menu-consts 仅保留兼容 re-export）
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'

/**
 * mkdocs-material 扩展语法插入入口（15 项，对应 menu-config.ts 的 Material 子菜单，
 * 除既有的 material:admonition 外的 15 项新语法）。
 *
 * 动作 id 契约：`baize:menu:insert:material:<featureId>`，命中后打开
 * configStore.showDialog('materialSyntax', { preset: <featureId> })，
 * 由 MaterialSyntaxDialog 按 preset 展示对应语法的说明与插入操作。
 *
 * 顺序与菜单展示顺序一致（collapsible → tab-link）。新增语法时需三处同步：
 * 本数组、menu-config.ts 的 insertMaterial.submenu、menu 命名空间 i18n（zh-CN/en-US）。
 */
const MATERIAL_SYNTAX_FEATURE_IDS = [
    'collapsible',
    'task-list',
    'highlight',
    'insert-delete',
    'sup-sub',
    'keys',
    'attr-list',
    'footnote',
    'definition-list',
    'grid-cards',
    'code-block',
    'icon',
    'blocks',
    'snippet',
    'tab-link'
] as const

export function HandleMenuAction(action: string) {
    // 获取配置 store
    const configStore = getConfigStore()

    // ========== 前端可直接处理的对话框 ==========

    // 主题设置对话框
    if (action === 'baize:menu:setting:theme') {
        configStore.showDialog('themeSettings')
        return
    }

    // 编辑器设置对话框
    // A-2/ARC-07：菜单实际 id 为 setting:monaco-editor（原分支误写 setting:editor，
    // 导致该动作漏到主进程路由到损坏的 HTML 对话框）；主进程树中对应 handler 已删除。
    if (action === 'baize:menu:setting:monaco-editor') {
        configStore.showDialog('editorSettings')
        return
    }

    // 系统设置对话框
    if (action === 'baize:menu:setting:system') {
        configStore.showDialog('systemSettings')
        return
    }

    // 快捷链接设置
    // A-2/ARC-07：菜单实际 id 为 setting:quick-link（原分支误写 setting:quicklinks）；
    // 主进程树中对应 handler 已删除。
    if (action === 'baize:menu:setting:quick-link') {
        configStore.showDialog('quickLinks')
        return
    }

    // 插入特殊文字
    if (action === 'baize:menu:insert:special-text') {
        configStore.showDialog('fontSelect')
        return
    }

    // 插入 Mermaid 图表
    if (action === 'baize:menu:insert:mermaid') {
        configStore.showDialog('mermaidEdit')
        return
    }

    // 插入 Admonition
    if (action === 'baize:menu:insert:admonition') {
        configStore.showDialog('admonition')
        return
    }

    // 插入 Material 扩展语法（15 项 mkdocs-material 语法，见 MATERIAL_SYNTAX_FEATURE_IDS）
    // 动作 id 精确匹配 baize:menu:insert:material:<featureId>，打开 materialSyntax 对话框并
    // 通过 preset 指明语法类型；既有 material:admonition 不在此表内，保持原主进程对话框链路。
    for (const featureId of MATERIAL_SYNTAX_FEATURE_IDS) {
        if (action === `baize:menu:insert:material:${featureId}`) {
            configStore.showDialog('materialSyntax', { preset: featureId })
            return
        }
    }

    // 插入数学公式
    if (action === 'baize:menu:insert:math') {
        configStore.showDialog('mathText')
        return
    }

    // 插入图片
    if (action === 'baize:menu:insert:image') {
        configStore.showDialog('insertImage')
        return
    }

    // 插入表格
    // A-2/ARC-07：菜单实际 id 为 insert:md-table（原分支误写 insert:table）；
    // 主进程树中对应 handler 已删除。
    if (action === 'baize:menu:insert:md-table') {
        configStore.showDialog('mdSheet')
        return
    }

    // 插入链接
    // A-2/ARC-07：菜单实际 id 为 insert:web-link（原分支误写 insert:link）；
    // 主进程树中对应 handler 已删除。
    if (action === 'baize:menu:insert:web-link') {
        configStore.showDialog('insertLink')
        return
    }

    // 新建文件/文件夹
    if (action === 'baize:menu:file:new') {
        // 获取当前打开文件的路径作为默认目录
        window.electron.ipcRenderer
            .invoke(IPC.FILE.GET_CURRENT_FILE_PATH)
            .then((dirPath: string) => {
                configStore.showDialog('createFileFolder', { dirPath })
            })
            .catch(() => {
                configStore.showDialog('createFileFolder', { dirPath: '' })
            })
        return
    }

    // 导入选项
    if (action === 'baize:menu:file:import') {
        configStore.showDialog('importOption')
        return
    }

    // 关于对话框
    if (action === 'baize:menu:help:about') {
        configStore.showDialog('helpAbout')
        return
    }

    // 联系我们
    // P1/C-06：统一 contact 动作 id——menu-config.ts 实际发送的是
    // 'baize:menu:help:contact-us'，而本文件历史分支拦截的是 'baize:menu:help:contact'
    // （id 错位），导致 contact-us 漏到主进程弹 JSDOM 版联系对话框、渲染层
    // Vue HelpContactUsDialog 永远不可达。现统一以菜单实际 id 为准并由渲染层
    // 展示 Vue 对话框（'contact' 作为历史别名保留，防止其他入口回归）。
    if (action === 'baize:menu:help:contact-us' || action === 'baize:menu:help:contact') {
        configStore.showDialog('helpContact')
        return
    }

    // 技术栈
    if (action === 'baize:menu:help:tech-stack') {
        configStore.showDialog('techStack')
        return
    }

    // ========== 需要主进程处理的菜单项 ==========

    // 插件菜单
    // FE-16/FE-17（task-23）三跳链路核对结论：
    //   menu-config.ts（pluginsMenu，空组已由 pruneEmptySubmenus 剔除，4 个已注册但
    //   缺入口的工具已补齐）→ 本分支统一拦截所有 'baize:menu:plugins:*' 动作 →
    //   EventBus(PLUGIN_TOOL_SHOW) → PluginTools.vue 按 plugin-tools-const.ts 注册表渲染组件。
    // 主进程 menu-tools.ts 的 pluginsMenuHandlers 已在 P2 死代码清理中删除（唯一实现是向
    // 零监听的 OPEN_PLUGIN_TOOL 通道 send，属双死路径），因此本渲染层分支即最终落点，
    // 无需再转发主进程。菜单动作与注册表的一致性由 tests/unit/plugin_tools_const.test.ts 守护。
    if (action.startsWith('baize:menu:plugins:')) {
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, action)
        return
    }

    // 插入 Mermaid 模板
    if (action.startsWith('baize:menu:insert:mermaid:')) {
        const item = Templates.Mermaid.find((item) => item.menuAction === action)
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, item?.context)
        return
    }

    // 插入文本块模板
    if (action.startsWith('baize:menu:insert:textblock:')) {
        const item = Templates.TextBlock.find((item) => item.menuAction === action)
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, item?.context)
        return
    }

    // 插入写作模板
    if (action.startsWith('baize:menu:insert:writing:')) {
        const item = Templates.Writing.find((item) => item.menuAction === action)
        EventBus.$emit(EVENT_BUS.MONACO_USE_TEMPLATE, item?.context)
        return
    }

    // PlantUML 模板
    if (action.startsWith('baize:menu:insert:plantuml:')) {
        const item = Templates.PlantUML.find((item) => item.menuAction === action)
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, item?.context)
        return
    }

    // ========== FUN-09：编辑器交互动作（emit EventBus 事件，编辑器侧由 Monaco 代理实现） ==========

    // 视图 → 折叠/展开标题：全部折叠 / 全部展开 / 1~6 级标题
    // 事件名契约（勿改）：'editor-toggle-fold'
    if (action.startsWith('baize:menu:view:fold:')) {
        const level = action.split(':').pop()
        if (level === 'all-fold') {
            EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'fold-all' })
        } else if (level === 'all-expand') {
            EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'expand-all' })
        } else {
            // 'level1' ~ 'level6' → 按标题级别折叠
            const match = level?.match(/^level([1-6])$/)
            if (match) {
                EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, {
                    mode: 'fold-level',
                    level: Number(match[1])
                })
            }
        }
        return
    }

    // 视图 → 显示/隐藏文章大纲
    // 事件名契约（勿改）：'editor-toggle-outline'
    // FUN-09：原主进程 handler 错误地 send 'baize:view:toggle-resource-manager'
    // （与资源管理器开关串线），现改为独立大纲事件，由 Monaco 代理实现监听。
    if (action === 'baize:menu:view:toggle-outline') {
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        return
    }

    // 编辑 → 查找（在文件中查找）
    // 事件名契约（勿改）：'editor-trigger-find'
    if (action === 'baize:menu:edit:find-in-file') {
        EventBus.$emit(EVENT_BUS.EDITOR_TRIGGER_FIND)
        return
    }

    // 编辑 → 替换（在文件中替换）：同一事件携带 { mode: 'replace' } 区分
    if (action === 'baize:menu:edit:replace-in-file') {
        EventBus.$emit(EVENT_BUS.EDITOR_TRIGGER_FIND, { mode: 'replace' })
        return
    }

    // 编辑 → 跳转到行
    // 事件名契约（勿改）：'editor-jump-line'（payload { line }）
    // 行号由 window.prompt 收集并校验（编辑器内 Ctrl+G 走 Monaco 原生跳行输入框，本路径为菜单点击兜底）。
    if (action === 'baize:menu:edit:go-line') {
        const input = window.prompt(t('menu.edit.goLinePrompt'))
        if (input !== null) {
            const line = Number(input)
            if (Number.isInteger(line) && line > 0) {
                EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line })
            } else {
                console.warn(`[Menu] 无效的行号: ${input}`)
            }
        }
        return
    }

    // 工具 → 绘图工具（mermaid/plantuml）：复用既有模板插入事件（第一轮 FUN-07 的
    // insertTextBlockTemplates 链路，渲染端统一监听 'baize:notes:monaco-editor:insert-text'），
    // 从 templates 常量中取对应"基础框架"模板。
    // FUN-09：原主进程 handler send 'OpenFile' 通道全库无监听（点击无反应），已删除。
    if (action === 'baize:menu:tools:drawing:mermaid') {
        const item = Templates.Mermaid.find(
            (item) => item.menuAction === 'baize:menu:insert:mermaid:basic'
        )
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, item?.context)
        return
    }

    if (action === 'baize:menu:tools:drawing:plantuml') {
        const item = Templates.PlantUML.find(
            (item) => item.menuAction === 'baize:menu:insert:plantuml:basic'
        )
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, item?.context)
        return
    }

    // 其他菜单动作通过 IPC 发送到主进程处理
    window.electron.ipcRenderer.send(IPC.MENU.ACTION, action)
}
