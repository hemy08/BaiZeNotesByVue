import * as Templates from '../../common/templates'
import EventBus from '@renderer/common/event-bus/event-bus'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { IPC } from '../../../../shared/ipc-channels'
// 第 4 批 P3：裸 console.* 收敛到渲染层统一日志出口（失败降级逻辑保持不变）
import { logger } from '../../common/logger'
// ARC-14：插件工具显示事件名收敛至 EventBus 集中常量（menu-consts 仅保留兼容 re-export）
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
// M3（结构优化第 5 批）：15 项 Material 扩展语法 id 由 shared 单一 manifest 派生，
// 不再维护本文件内的字面量数组（与 menu-config 菜单、MaterialSyntaxDialog 功能项同源）。
import {
    MATERIAL_SYNTAX_FEATURE_IDS,
    getMaterialSyntaxMenuAction
} from '../../../../shared/constants/material-syntax'
// M3（结构优化收尾）：插件工具动作前缀与 38 项 id 由 shared 单一 manifest 派生。
import { PLUGIN_TOOL_ACTION_PREFIX } from '../../../../shared/constants/plugin-tools-manifest'

/**
 * mkdocs-material 扩展语法插入入口（15 项，对应 menu-config.ts 的 Material 子菜单，
 * 除既有的 material:admonition 外的 15 项新语法）。
 *
 * 动作 id 契约：`baize:menu:insert:material:<featureId>`，命中后打开
 * configStore.showDialog('materialSyntax', { preset: <featureId> })，
 * 由 MaterialSyntaxDialog 按 preset 展示对应语法的说明与插入操作。
 *
 * M3（结构优化第 5 批）：featureId 清单与动作 id 均由 shared/constants/material-syntax.ts
 * 单一 manifest 派生（原「本数组 + menu-config + i18n 三处同步」收敛为 manifest 一处新增）。
 */

/**
 * 「文件」菜单 → 最近文件/最近文件夹 的动作前缀。
 *
 * 动作 id 契约：`baize:menu:file:recent-file:<encodeURIComponent(绝对路径)>` /
 * `baize:menu:file:recent-folder:<encodeURIComponent(绝对路径)>`，由 MenuBar.vue
 * 打开「文件」菜单时按 window.api.file.recentList() 结果动态生成。
 *
 * 拦截理由：最近项数量与路径都是运行时数据，不进入静态 menuMap；本前缀动作不转发
 * 主进程 MENU.ACTION，而是直接 invoke OPEN_RECENT（主进程按当前最近列表重新做
 * 白名单校验后复用既有打开链路），避免把「最近项」变成任意路径打开后门。
 */
const RECENT_FILE_ACTION_PREFIX = 'baize:menu:file:recent-file:'
const RECENT_FOLDER_ACTION_PREFIX = 'baize:menu:file:recent-folder:'

/** 是否「最近项」菜单动作（文件/文件夹两种前缀） */
function isRecentMenuAction(action: string): boolean {
    return (
        action.startsWith(RECENT_FILE_ACTION_PREFIX) ||
        action.startsWith(RECENT_FOLDER_ACTION_PREFIX)
    )
}

/**
 * 打开最近项：解码路径 → invoke 主进程 openRecent → 失败经状态栏通道上报。
 * 失败不抛异常、不转发 MENU.ACTION（主进程失败时也会直接下发同一状态栏消息，
 * 渲染层 send 与主进程下发互不影响，不会重复打开任何文件）。
 */
function handleRecentMenuAction(action: string): void {
    const isFile = action.startsWith(RECENT_FILE_ACTION_PREFIX)
    const prefix = isFile ? RECENT_FILE_ACTION_PREFIX : RECENT_FOLDER_ACTION_PREFIX

    let target: string
    try {
        target = decodeURIComponent(action.slice(prefix.length))
    } catch (error) {
        logger.warn('[Menu] 最近项路径解码失败：', action, error)
        return
    }
    if (target.length === 0) {
        return
    }

    // 防御：测试桩/旧 preload 未暴露 file.openRecent 时静默降级（仅记录日志）
    const openRecent = window.api?.file?.openRecent
    if (typeof openRecent !== 'function') {
        logger.warn('[Menu] window.api.file.openRecent 不可用，无法打开最近项')
        return
    }

    void openRecent({ kind: isFile ? 'file' : 'folder', path: target })
        .then((result) => {
            if (!result?.ok && result?.message) {
                // 用户可见的失败提示由主进程 OPEN_RECENT 的 failRecentOpen 直接经
                // STATUS_BAR_UPDATE 下发；2026-11-18 删除原渲染层反向 send 空转分支
                // （主进程无该通道的 renderer→main 监听）。
                logger.warn('[Menu] 打开最近项失败：', result.message)
            }
        })
        .catch((error: unknown) => {
            logger.error('[Menu] 打开最近项失败：', error)
        })
}

export function HandleMenuAction(action: string) {
    // 「文件」菜单 → 最近文件/最近文件夹：最早拦截（运行时动态动作，不进入静态 menuMap，
    // 也不转发主进程 MENU.ACTION；主进程侧仅暴露受白名单约束的 OPEN_RECENT 通道）。
    if (isRecentMenuAction(action)) {
        handleRecentMenuAction(action)
        return
    }

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
        if (action === getMaterialSyntaxMenuAction(featureId)) {
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
    //   menu-config.ts（pluginsMenu 由 shared/constants/plugin-tools-manifest.ts 的 manifest
    //   生成，空组已由 pruneEmptySubmenus 剔除，4 个已注册但缺入口的工具已并入 manifest）→
    //   本分支统一拦截所有 'baize:menu:plugins:*' 动作 →
    //   EventBus(PLUGIN_TOOL_SHOW) → PluginTools.vue 按 plugin-tools-const.ts 注册表渲染组件。
    // 主进程 menu-tools.ts 的 pluginsMenuHandlers 已在 P2 死代码清理中删除（唯一实现是向
    // 零监听的 OPEN_PLUGIN_TOOL 通道 send，属双死路径），因此本渲染层分支即最终落点，
    // 无需再转发主进程。M3：前缀常量与注册表均由同一 manifest 派生，一致性由
    // tests/unit/plugin_tools_manifest.test.ts 守护。
    if (action.startsWith(PLUGIN_TOOL_ACTION_PREFIX)) {
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
    // 事件名契约（勿改）：'editor-jump-line'（payload 可选 { line }）
    // 行号收集统一复用 Monaco 自带「跳转到行」快捷输入（editor.action.gotoLine）：
    // 菜单点击只发事件（无 payload），由 MarkdownMonacoEditor 唤起 Monaco 快捷输入并校验行号；
    // 不再使用浏览器原生 window.prompt（alert/prompt 应用内化批次）。
    if (action === 'baize:menu:edit:go-line') {
        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE)
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
