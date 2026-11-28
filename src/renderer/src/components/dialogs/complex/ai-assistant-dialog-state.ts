/**
 * 1.5.7 体验微调（用户反馈）：AI 助手配置独立对话框共享状态（模块单例）。
 *
 * ## 为什么单独成模块（与 `Graph/graph-dialog-state.ts` 同一既有模式）
 * AI 助手配置原本是「系统设置」对话框的第 7 个页签（`systemSetting.sidebarAiAssistant`）。
 * 用户反馈要求把它移到菜单栏「设置 → AI 助手」。菜单动作（`menu-actions.ts`）与对话框宿主
 * （`BaiZeNotes.vue`）不在同一组件上下文，需要一个最小共享的显隐状态。
 *
 * 不放进 `useConfigStore` 的 `DialogState`：`DialogState` 的键集合被
 * `tests/unit/dialog-contract.test.ts` 与 `src/shared/types/dialog.ts` 的 `VueDialogName`
 * **严格双向锁定**（主进程 OPEN_VUE_DIALOG 才能打开的对话框名）。本对话框完全由渲染层
 * （菜单动作）打开、主进程从不参与，属于纯渲染层对话框，因此沿用 1.5.7 LLM Wiki L4
 * 图谱对话框的「模块单例显隐 + 宿主只挂载」模式，避免为了一个菜单项去改跨进程契约。
 *
 * ## 生命周期
 * 状态为模块级单例：宿主（`BaiZeNotes.vue`）只负责挂载组件并绑定 `visible`，
 * 关闭只切显隐、不销毁宿主；主界面卸载/测试清理时调用 {@link closeAiAssistantDialogState} 归零。
 */
import { reactive } from 'vue'

/**
 * AI 助手对话框菜单动作 id（「设置 → AI 助手」）。
 *
 * 单一真源：`menu-config.ts` 的菜单数据、`menu-actions.ts` 的渲染层精确拦截与单测共同引用，
 * 避免菜单与动作分发两处字面量漂移。命名沿用既有设置动作的 `baize:menu:setting:*` 三段式
 * （与 `baize:menu:setting:system` 同域），该动作**不转发**主进程 `IPC.MENU.ACTION`
 * （纯渲染层对话框，无需主进程参与；主进程也没有对应 handler）。
 */
export const AI_ASSISTANT_DIALOG_MENU_ACTION = 'baize:menu:setting:ai-assistant'

/** AI 助手对话框共享状态 */
export interface AiAssistantDialogState {
    /** 显隐（由 {@link openAiAssistantDialogState} / {@link closeAiAssistantDialogState} 驱动） */
    visible: boolean
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const aiAssistantDialogState = reactive<AiAssistantDialogState>({
    visible: false
})

/** 打开 AI 助手对话框（只切显隐；宿主挂载由 BaiZeNotes.vue 负责） */
export function openAiAssistantDialogState(): void {
    aiAssistantDialogState.visible = true
}

/** 关闭 AI 助手对话框（只切显隐，不销毁宿主；再次打开时面板重新挂载并刷新配置） */
export function closeAiAssistantDialogState(): void {
    aiAssistantDialogState.visible = false
}
