/**
 * 写作风格检查对话框显隐状态（P0-8）
 *
 * 与文档历史 / Markdown lint 同构：对话框由 `writing-style/index.ts` 的
 * `openWritingStyleCheck()` 在独立 Vue 应用实例中挂载，显隐状态放在模块单例里，
 * 供宿主与对话框共同消费（避免宿主 / 组件双向 prop 传递）。
 * 本模块只依赖 Vue 的 reactive，不涉及 IPC / DOM。
 */
import { reactive } from 'vue'

/** 写作风格检查对话框状态 */
export interface WritingStyleDialogState {
    /** 显隐（由 openWritingStyleCheckDialog / closeWritingStyleDialog 驱动） */
    visible: boolean
}

/** 模块单例状态（对话框只读渲染） */
export const writingStyleDialogState = reactive<WritingStyleDialogState>({
    visible: false
})

/** 打开写作风格检查对话框 */
export function openWritingStyleCheckDialog(): void {
    writingStyleDialogState.visible = true
}

/** 关闭写作风格检查对话框 */
export function closeWritingStyleDialog(): void {
    writingStyleDialogState.visible = false
}
