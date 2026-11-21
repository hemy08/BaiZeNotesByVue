/**
 * Markdown lint 对话框显隐状态（A4）
 *
 * 与文档历史同理：对话框由 `lint/index.ts` 的 `openMarkdownLint()` 在独立 Vue 应用实例中挂载，
 * 显隐状态放在模块单例里，供宿主与对话框共同消费（避免宿主/组件双向 prop 传递）。
 */
import { reactive } from 'vue'

/** lint 对话框状态 */
export interface MarkdownLintDialogState {
    visible: boolean
}

/** 模块单例状态（对话框只读渲染） */
export const markdownLintDialogState = reactive<MarkdownLintDialogState>({
    visible: false
})

/** 打开 lint 对话框 */
export function openMarkdownLintDialog(): void {
    markdownLintDialogState.visible = true
}

/** 关闭 lint 对话框 */
export function closeMarkdownLintDialog(): void {
    markdownLintDialogState.visible = false
}
