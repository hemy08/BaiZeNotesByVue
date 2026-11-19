/**
 * EventBus 事件名集中常量（ARC-14）
 *
 * 职责边界：跨进程交互一律走 IPC（通道常量见 src/shared/ipc-channels.ts）；
 * 进程内（渲染层组件间）交互一律走 EventBus，事件名统一引用本文件常量。
 * 事件名字符串本身保持不变（历史契约，勿改）。
 *
 * M5（第 4 批 4.3）：订阅方统一经 composables/useEventBus 注册（自动清理）；
 * 每个事件的「谁发/谁收」见 event-bus-contract.ts，由
 * tests/unit/event-bus-contract.test.ts 静态核对。
 *
 * 防回归：tests/unit/ipc-channel-constants.test.ts 会解析本文件与
 * 渲染层 EventBus.$on/$emit/$off 调用点做交叉核对。
 */
export const EVENT_BUS = {
    // 插件工具面板显示（menu-actions 发射，PluginTools 监听；原 menu-consts 的
    // CHANNEL_PLUGIN_TOOL_SHOW 收敛至此）
    PLUGIN_TOOL_SHOW: 'plugin-tools-show',
    // 插件工具容器显示开关（FileTreeNode 发射，WorkSpace 监听）
    PLUGIN_TOOLS_CONTAINER_SHOW: 'plugin-tools-container-show',
    // 工作区容器切换（payload：'md' | 'html' | 'pdf' | 'plugins' | 'tools'）
    WORKSPACE_SHOW: 'baize:notes:workspace:show',
    // Monaco 编辑器光标处插入文本
    MONACO_INSERT_TEXT: 'baize:notes:monaco-editor:insert-text',
    // 编辑器全文替换（文件导入路径）
    MONACO_REPLACE_TEXT: 'monaco-editor-replace-text',
    // 渲染层内部主题热更新通知
    THEME_UPDATED: 'theme-updated',
    // 编辑器重新布局
    MONACO_RELAYOUT: 'monaco-editor-relayout',
    // 状态栏文件路径
    STATUS_BAR_FILE_PATH: 'monaco-editor-statusbar-file-path',
    // 状态栏内容长度
    STATUS_BAR_CONTEXT_LENGTH: 'baize:notes:status-bar:context-length',
    // 状态栏光标位置
    STATUS_BAR_CURSOR_POSITION: 'monaco-editor-statusbar-cursor-position',
    // 写作模板全文替换
    MONACO_USE_TEMPLATE: 'baize:monaco-editor-use-template',
    // 折叠/展开标题（payload：{ mode: 'fold-all' | 'expand-all' | 'fold-level', level? }）
    EDITOR_TOGGLE_FOLD: 'editor-toggle-fold',
    // 显示/隐藏文章大纲
    EDITOR_TOGGLE_OUTLINE: 'editor-toggle-outline',
    // 查找（payload 可选 { mode: 'replace' }）
    EDITOR_TRIGGER_FIND: 'editor-trigger-find',
    // 跳转到行（payload { line }）
    EDITOR_JUMP_LINE: 'editor-jump-line',
    // 请求收集章节大纲
    MONACO_GET_CHAPTERS: 'baize:notes:monaco-editor:get-chapters',
    // 切换编辑器内资源管理器
    MONACO_SWITCH_EXPLORER: 'baize:notes:monaco-editor:switch:explorer',
    // 定位到目标行（大纲点击）
    MONACO_LOCATE_TARGET_LINE: 'monaco-editor-locate-target-line',
    // 章节大纲数据回传
    MONACO_CHAPTERS: 'monaco-editor-chapters',
    // HTML 文件被选中
    HTML_FILE_SELECTED: 'html-file-selected',
    // PDF 文件被选中
    PDF_FILE_SELECTED: 'pdf-file-selected',
    // 标题格式更新
    MONACO_UPDATE_HEADER_FORMAT: 'monaco-editor-update-header-format',
    // 字体格式更新
    MONACO_UPDATE_FONT_FORMAT: 'monaco-editor-update-font-format',
    // 请求保存文件内容到磁盘（编辑器内部触发）
    MONACO_SAVE_FILE_CONTENT_TO_DISK: 'monaco-editor-save-file-content-to-disk'
} as const

// ARC-14 兼容别名：menu-consts 与历史测试通过该名字引用
export const CHANNEL_PLUGIN_TOOL_SHOW = EVENT_BUS.PLUGIN_TOOL_SHOW
