/**
 * 当前活动编辑器注册表（1.5.2 E1 剪藏「插入当前笔记」使用）
 *
 * 背景：命令面板 / 工具菜单动作执行时不在 MarkdownMonacoEditor 组件上下文内，无法直接拿到
 * Monaco 编辑器实例；A8 粘贴增强的 `insertMarkdownAtSelection(editor, markdown)` 需要实例
 * 作为参数，因此用本模块登记「当前活动编辑器」这一最小状态。
 *
 * 设计约束：
 * - 只保存实例引用（不持有内容、不订阅事件、不做 IO），与 Vue 响应式无关；
 * - 编辑器创建时注册、获得焦点时更新、卸载时清除，保证不会向已销毁实例写入；
 * - 保持最小 API（set/get/clear 三个函数），便于单测注入替身与组件测试清理。
 */
import type * as monaco from 'monaco-editor'

/** 当前活动编辑器实例（无可用编辑器时为 null） */
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null

/** 注册当前活动编辑器（编辑器创建/获得焦点时调用） */
export function setActiveEditor(editor: monaco.editor.IStandaloneCodeEditor | null): void {
    activeEditor = editor
}

/** 取当前活动编辑器（编辑器未创建/已销毁时返回 null） */
export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return activeEditor
}

/**
 * 清除活动编辑器：只有传入实例与当前注册实例相同时才清除（多编辑器场景避免误清其他实例）。
 *
 * @param editor 要清除的编辑器实例；缺省时无条件清空（测试/兜底场景）
 */
export function clearActiveEditor(editor?: monaco.editor.IStandaloneCodeEditor | null): void {
    if (!editor || activeEditor === editor) {
        activeEditor = null
    }
}
