/**
 * 编辑器设置对话框 —— 表单模型 / 侧边栏页签 / 默认值（设置对话框二期拆分）
 *
 * 与 DOM / 响应式状态无关的部分收敛到本文件：
 * - 对话框全部字段类型 `EditorDialogSettings`（渲染层扩展配置，与主进程
 *   editor-setting.json 同源持久化；公开类型从原 EditorSettingDialog.vue 迁出）；
 * - 初始默认值工厂 `createDefaultEditorDialogSettings`（与拆分前 initialSettings 逐字段一致）；
 * - 侧边栏页签常量 `EDITOR_SETTING_SIDEBAR_ITEMS`（顺序即 DOM 顺序）。
 *
 * 响应式草稿 / 加载 / 保存 / 取消见 `./useEditorSettingForm.ts`，4 个页签组件见
 * 同目录 BasicPanel / AppearancePanel / MarkdownPanel / AdvancedPanel。
 */

/** 编辑器设置对话框的全部字段（渲染层扩展配置，与主进程 editor-setting.json 同源持久化） */
export interface EditorDialogSettings {
    autoSave: boolean
    autoSaveInterval: number
    enableFolding: boolean
    showLineNumbers: boolean
    enableAutoComplete: boolean
    cursorStyle: string
    cursorWidth: number
    fontSize: number
    lineHeight: number
    enableLivePreview: boolean
    previewDelay: number
    enableCodeHighlight: boolean
    enableLinkHighlight: boolean
    maxFileSize: number
    renderDelay: number
    enableExperimental: boolean
}

/** 左侧页签（顺序即展示顺序；id 与模板中的 activePanel 判定一一对应） */
export const EDITOR_SETTING_SIDEBAR_ITEMS = [
    { id: 'basic', nameKey: 'dialogRenderer.editorSetting.sidebarBasic', icon: '⚙️' },
    { id: 'appearance', nameKey: 'dialogRenderer.editorSetting.sidebarAppearance', icon: '🎨' },
    { id: 'markdown', nameKey: 'dialogRenderer.editorSetting.markdown', icon: '📝' },
    { id: 'advanced', nameKey: 'dialogRenderer.editorSetting.sidebarAdvanced', icon: '🔧' }
] as const

/** 侧边栏页签 id（壳层 activePanel 的类型真源，与 4 个 panel 组件一一对应） */
export type EditorSettingPanelId = (typeof EDITOR_SETTING_SIDEBAR_ITEMS)[number]['id']

/**
 * 初始默认值（也用于取消时恢复）：与拆分前 EditorSettingDialog.vue 的 initialSettings 逐字段一致。
 * 读取失败 / 字段缺失时的兜底；真实生效值由打开对话框时的 config:read 回填。
 */
export function createDefaultEditorDialogSettings(): EditorDialogSettings {
    return {
        autoSave: true,
        autoSaveInterval: 30,
        enableFolding: true,
        showLineNumbers: true,
        enableAutoComplete: true,
        cursorStyle: 'line',
        cursorWidth: 2,
        fontSize: 14,
        lineHeight: 1.6,
        enableLivePreview: true,
        previewDelay: 300,
        enableCodeHighlight: true,
        enableLinkHighlight: true,
        maxFileSize: 10,
        renderDelay: 100,
        enableExperimental: false
    }
}
