/**
 * EventBus 事件「谁发 / 谁收」契约（结构优化第 4 批 4.3 / M5）
 *
 * 背景：`event-bus-events.ts` 只保证「事件名常量集中 + 无字面量」，但没有任何地方
 * 记录/校验每个事件由哪个文件发射、哪个文件订阅。组件改名/迁移后容易出现：
 * - 事件常量仍被引用，但接收方已删除（静默空发，如 MONACO_SWITCH_EXPLORER）；
 * - 新增发射点未登记，排查链路时漏看。
 *
 * 本文件把 EVENT_BUS 全部事件的收发关系写成机器可读契约（当前 27 个），由
 * `tests/unit/event-bus-contract.test.ts` 静态扫描 `src/renderer/src` 交叉核对：
 * 1. 常量表与契约表键集合必须完全一致（新增事件必须补契约）；
 * 2. 契约中每个 emitters / receivers 文件必须真实存在且确实出现对应事件名；
 * 3. 源码中每处 `EventBus.$emit(EVENT_BUS.X)` / `onEventBus(EVENT_BUS.X)` /
 *    `fileSelectedEvent: EVENT_BUS.X` 都必须登记在契约里（双向防漂移）。
 *
 * 路径均相对 `src/renderer/src`，统一正斜杠。修改收发关系时请同步本文件与
 * `docs/` 下的 4.3 报告事件清单。
 */
import { EVENT_BUS } from './event-bus-events'

/** 契约表键（= EVENT_BUS 常量键） */
export type EventBusEventKey = keyof typeof EVENT_BUS

/** 单个事件的收发契约 */
export interface EventBusContractEntry {
    /** 事件负载说明（文档字段，与 event-bus-events.ts 常量注释保持一致） */
    payload: string
    /** 发射方文件（相对 src/renderer/src；必须真实出现 EventBus.$emit(EVENT_BUS.<键>)） */
    emitters: readonly string[]
    /**
     * 订阅方文件（相对 src/renderer/src；必须真实以 EVENT_BUS.<键> 注册监听）。
     * 经 useFileViewerState 动态传入事件名的场景，登记「传入事件名的调用方文件」，
     * 由 note 说明中间层。
     */
    receivers: readonly string[]
    /** 补充说明（动态事件名中间层、空处理器、已知空发事件等） */
    note?: string
}

/**
 * EVENT_BUS 全部事件的收发契约（当前 27 个，顺序与 EVENT_BUS 常量表一致）。
 * 1.5.6 新增 PLUGIN_SEARCH_SHOW（插件搜索入口，菜单动作 → 面板搜索视图）；
 * 1.5.7 迁移批次新增 LLM_WIKI_COMPILE_REQUEST（迁移弹窗 → 批量编译批次，M2 实现订阅方）。
 *
 * 类型 `Record<EventBusEventKey, ...>` 在编译期强制「每个常量都有契约」，
 * 测试再做运行时双向核对。
 */
export const EVENT_BUS_CONTRACT: Record<EventBusEventKey, EventBusContractEntry> = {
    PLUGIN_TOOL_SHOW: {
        payload: '插件工具 id（shared/constants/plugin-tools-manifest.ts 的动作 id）',
        emitters: ['components/MenuBar/menu-actions.ts'],
        receivers: ['components/PluginTools/PluginTools.vue']
    },
    PLUGIN_SEARCH_SHOW: {
        payload:
            '无载荷：打开插件工具面板并进入「插件搜索」入口视图（搜索框聚焦；空白查询展示最近使用 ≤20 项 + 全部工具）',
        emitters: ['components/MenuBar/menu-actions.ts'],
        receivers: ['components/PluginTools/PluginTools.vue']
    },
    PLUGIN_TOOLS_CONTAINER_SHOW: {
        payload: 'boolean：是否显示插件工具容器',
        emitters: ['components/ResourceManager/FileTreeNode.vue'],
        receivers: ['components/WorkSpaceArea/WorkSpace.vue']
    },
    WORKSPACE_SHOW: {
        payload: "'md' | 'html' | 'pdf' | 'plugins' | 'tools'：工作区容器切换目标",
        emitters: [
            'components/ResourceManager/FileTreeNode.vue',
            'components/HemyTools/HemyTools.vue',
            'components/Markdown/MarkdownEditComponent.vue',
            'components/PluginTools/PluginTools.vue'
        ],
        receivers: ['components/WorkSpaceArea/WorkSpace.vue']
    },
    MONACO_INSERT_TEXT: {
        payload: 'string：插入当前光标处的文本',
        emitters: [
            'components/MenuBar/menu-actions.ts',
            'components/Markdown/MarkdownEditComponent.vue',
            'components/Markdown/hemy-editor-quick-access.ts',
            'components/Markdown/hemy-quick-access-emojis.ts',
            'components/Markdown/hemy-quick-access-symbols.ts',
            'components/BaiZeNotes.vue'
        ],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    MONACO_REPLACE_TEXT: {
        payload:
            'string：全文替换（文件导入路径 / A3 文档历史恢复 / A4 格式化应用 / A5 Front matter 保存）',
        emitters: [
            'components/BaiZeNotes.vue',
            'composables/useDocumentHistory.ts',
            'components/Markdown/front-matter/FrontMatterDialog.vue'
        ],
        receivers: ['components/Markdown/MarkdownEditComponent.vue']
    },
    THEME_UPDATED: {
        payload: 'ThemeStyles：渲染层内部主题热更新（CSS 变量应用成功后广播）',
        emitters: ['composables/useTheme.ts'],
        receivers: ['components/PluginTools/PluginTools.vue'],
        note: '4.2 主题单真源后发射方收敛到 useTheme；PluginTools 的处理器为空实现（历史占位），主题实际消费在 useTheme/CSS 变量层'
    },
    MONACO_RELAYOUT: {
        payload: '无载荷：请求 Monaco 重新布局',
        emitters: ['components/Markdown/MarkdownEditComponent.vue', 'components/BaiZeNotes.vue'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    STATUS_BAR_FILE_PATH: {
        payload: 'string：状态栏显示的文件路径',
        emitters: ['components/ResourceManager/FileTreeNode.vue'],
        receivers: ['components/StatusBar.vue']
    },
    STATUS_BAR_CONTEXT_LENGTH: {
        payload: 'number：内容长度（字节/字符，用于状态栏文件大小）',
        emitters: ['components/Markdown/MarkdownMonacoEditor.vue'],
        receivers: ['components/StatusBar.vue']
    },
    STATUS_BAR_CURSOR_POSITION: {
        payload: 'monaco Position：光标行列位置',
        emitters: ['components/Markdown/hemy-editor-shortcut.ts'],
        receivers: ['components/StatusBar.vue']
    },
    MONACO_USE_TEMPLATE: {
        payload: 'string：写作模板正文（光标处插入）',
        emitters: ['components/MenuBar/menu-actions.ts'],
        receivers: ['components/Markdown/MarkdownEditComponent.vue']
    },
    EDITOR_TOGGLE_FOLD: {
        payload: "{ mode: 'fold-all' | 'expand-all' | 'fold-level', level? }：折叠/展开标题",
        emitters: ['components/MenuBar/menu-actions.ts'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    EDITOR_TOGGLE_OUTLINE: {
        payload: '无载荷：显示/隐藏文章大纲',
        emitters: ['components/MenuBar/menu-actions.ts'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    EDITOR_TRIGGER_FIND: {
        payload: "可选 { mode: 'replace' }：唤起查找/替换",
        emitters: ['components/MenuBar/menu-actions.ts'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    EDITOR_JUMP_LINE: {
        payload:
            '可选 { line: number }：直接跳转到指定行；无 payload 时唤起 Monaco 原生「跳转到行」快捷输入（菜单兜底路径，替代 window.prompt）',
        emitters: [
            'components/MenuBar/menu-actions.ts',
            'composables/useDocumentHistory.ts',
            // A2 全工作区搜索：点击搜索结果打开文件后跳转到命中行
            'composables/useWorkspaceSearch.ts'
        ],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    MONACO_GET_CHAPTERS: {
        payload: 'true：请求收集章节大纲',
        emitters: ['components/ResourceManager/ResourceManager.vue'],
        receivers: ['components/Markdown/MarkdownPreviewComponent.vue']
    },
    MONACO_SWITCH_EXPLORER: {
        payload: 'true：切换编辑器内资源管理器',
        emitters: ['components/ResourceManager/ResourceManager.vue'],
        receivers: [],
        note: '无订阅方（历史遗留空发事件）：EventBus 派发无副作用；按「不改变事件语义」保留，待第 5 批清理评估'
    },
    MONACO_LOCATE_TARGET_LINE: {
        payload: 'MarkdownTOC：定位到目标行（大纲点击）',
        emitters: ['components/ResourceManager/ResourceManager.vue'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    MONACO_CHAPTERS: {
        payload: 'MarkdownTOC[]：章节大纲数据回传',
        emitters: ['components/Markdown/hemy-editor-render.ts'],
        receivers: ['components/ResourceManager/ResourceManager.vue']
    },
    HTML_FILE_SELECTED: {
        payload: 'FileTreeNode 节点：HTML 文件被选中',
        emitters: ['components/ResourceManager/FileTreeNode.vue'],
        receivers: [
            'components/HemyTools/ShowHtmlView.vue',
            'components/WorkSpaceArea/WorkSpace.vue'
        ],
        note: 'ShowHtmlView 经 useFileViewerState 以 fileSelectedEvent 传入事件名注册；WorkSpace 负责首次激活前缓存并补发'
    },
    PDF_FILE_SELECTED: {
        payload: 'FileTreeNode 节点：PDF 文件被选中',
        emitters: ['components/ResourceManager/FileTreeNode.vue'],
        receivers: [
            'components/HemyTools/ShowPdfEditor.vue',
            'components/WorkSpaceArea/WorkSpace.vue'
        ],
        note: 'ShowPdfEditor 经 useFileViewerState 以 fileSelectedEvent 传入事件名注册；WorkSpace 负责首次激活前缓存并补发'
    },
    MONACO_UPDATE_HEADER_FORMAT: {
        payload: 'string：标题格式更新',
        emitters: ['components/Markdown/hemy-editor-quick-access.ts'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    MONACO_UPDATE_FONT_FORMAT: {
        payload: 'string：字体格式更新',
        emitters: ['components/Markdown/hemy-editor-quick-access.ts'],
        receivers: ['components/Markdown/MarkdownMonacoEditor.vue']
    },
    MONACO_FORMAT_STATE_CHANGED: {
        payload: '{ bold: boolean; italic: boolean; strike: boolean; code: boolean }：内联格式状态',
        emitters: ['components/Markdown/MarkdownMonacoEditor.vue'],
        receivers: ['components/Markdown/MarkdownEditToolsComponent.vue']
    },
    MONACO_SAVE_FILE_CONTENT_TO_DISK: {
        payload: 'true：请求保存文件内容到磁盘（编辑器内部触发）',
        emitters: ['components/Markdown/hemy-editor-shortcut.ts'],
        receivers: ['components/Markdown/MarkdownEditComponent.vue']
    },
    LLM_WIKI_COMPILE_REQUEST: {
        payload:
            "{ scope: 'all' | 'directory' | 'batch'; directory?: string; batchSize?: number }：" +
            '迁移弹窗把用户的编译选择交接给批量编译队列（M2 起由 BatchCompileHost 消费）',
        emitters: ['components/dialogs/simple/MigrationWizardDialog.vue'],
        receivers: ['components/llm-wiki/BatchCompileHost.vue'],
        note:
            'BatchCompileHost 收到后先等迁移弹窗关闭（迁移结果页），再打开批量编译对话框；' +
            '编译执行只经既有 AI.INGEST / AI.APPLY_INGEST，不新增 IPC'
    }
}
