/**
 * A5 Front matter 属性对话框显隐状态
 *
 * 与文档历史 / Markdown lint / 写作风格检查同构：对话框由 `front-matter/index.ts` 的
 * `openFrontMatterDialog()` 在独立 Vue 应用实例中挂载，显隐状态放在模块单例里，
 * 供宿主与对话框共同消费（避免宿主 / 组件双向 prop 传递）。
 * 本模块只依赖 Vue 的 reactive，不涉及 IPC / DOM。
 */
import { reactive } from 'vue'

/** Front matter 属性对话框状态 */
export interface FrontMatterDialogState {
    /** 显隐（由 openFrontMatterDialogState / closeFrontMatterDialogState 驱动） */
    visible: boolean
}

/** 模块单例状态（对话框只读渲染） */
export const frontMatterDialogState = reactive<FrontMatterDialogState>({
    visible: false
})

/** 打开 Front matter 属性对话框（宿主在挂载完成后调用） */
export function openFrontMatterDialogState(): void {
    frontMatterDialogState.visible = true
}

/** 关闭 Front matter 属性对话框 */
export function closeFrontMatterDialogState(): void {
    frontMatterDialogState.visible = false
}
