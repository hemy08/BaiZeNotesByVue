/**
 * 1.5.7 LLM Wiki L4（T4.2）：嵌入对话框共享状态（模块单例）。
 *
 * 与图谱对话框同构：命令面板（`CommandPalette` emit → `SearchOverlayHost` 挂载）
 * 是当前唯一入口，本模块只保留 `visible` 与打开/关闭函数；数据加载、raw/ 文件清单、
 * 预览与插入全部内聚在 `EmbedDialog.vue`，本模块不依赖 DOM / IPC / 日志。
 */
import { reactive } from 'vue'

/** 嵌入对话框共享状态 */
export interface EmbedDialogState {
    /** 显隐（由 {@link openEmbedDialogState} / {@link closeEmbedDialogState} 驱动） */
    visible: boolean
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const embedDialogState = reactive<EmbedDialogState>({
    visible: false
})

/** 打开嵌入对话框（只切显隐；宿主挂载由 SearchOverlayHost 负责） */
export function openEmbedDialogState(): void {
    embedDialogState.visible = true
}

/** 关闭嵌入对话框（只切显隐，不销毁宿主；再次打开不重建组件） */
export function closeEmbedDialogState(): void {
    embedDialogState.visible = false
}
