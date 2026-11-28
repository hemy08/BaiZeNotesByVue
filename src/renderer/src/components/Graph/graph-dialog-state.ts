/**
 * 1.5.7 LLM Wiki L4（T4.1）：关系图谱对话框共享状态（模块单例）。
 *
 * ## 为什么单独成模块
 * 图谱对话框由命令面板（`CommandPalette` emit → `SearchOverlayHost` 挂载）与
 * 「视图 → 关系图谱」菜单（`menu-actions.ts` 精确拦截）两个入口打开；两处入口不在
 * 同一组件上下文，需要一个最小共享的显隐状态。这里只放 `visible` 与打开/关闭函数：
 * 数据加载、布局计算、交互全部内聚在 `GraphDialog.vue`，本模块不依赖 DOM / IPC / 日志。
 *
 * ## 生命周期
 * 状态为模块级单例：宿主（`SearchOverlayHost`）只负责挂载组件并绑定 `visible`，
 * 关闭只切显隐、不销毁宿主；组件卸载/测试清理时调用 {@link closeGraphDialogState} 归零。
 */
import { reactive } from 'vue'

/**
 * 图谱入口菜单动作 id（「视图 → 关系图谱」）。
 *
 * 单一真源：`menu-config.ts` 的菜单数据、`menu-actions.ts` 的渲染层拦截与单测共同引用，
 * 避免菜单与动作分发两处字面量漂移。该动作**不转发**主进程 `IPC.MENU.ACTION`
 * （纯渲染层对话框，无需主进程参与）。
 */
export const GRAPH_DIALOG_MENU_ACTION = 'baize:menu:view:graph'

/** 图谱对话框共享状态 */
export interface GraphDialogState {
    /** 显隐（由 {@link openGraphDialogState} / {@link closeGraphDialogState} 驱动） */
    visible: boolean
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const graphDialogState = reactive<GraphDialogState>({
    visible: false
})

/** 打开关系图谱对话框（只切显隐；宿主挂载由 SearchOverlayHost 负责） */
export function openGraphDialogState(): void {
    graphDialogState.visible = true
}

/** 关闭关系图谱对话框（只切显隐，不销毁宿主；再次打开不重建组件） */
export function closeGraphDialogState(): void {
    graphDialogState.visible = false
}
