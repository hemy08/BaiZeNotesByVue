/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译对话框共享状态（模块单例）。
 *
 * ## 为什么单独成模块
 * 编译请求来自 EventBus（迁移弹窗 → `BatchCompileHost`），宿主只负责「收到事件 →
 * 更新共享状态」，对话框组件只读消费显隐与请求；两者不在同一组件上下文，需要一个
 * 最小共享状态（与 `MigrationWizardDialog` 的 `workspaceModeSwitchState` 同口径）。
 *
 * ## 生命周期
 * - `openBatchCompileDialog(request)`：记录本次归一化请求并打开（sequence 递增用于
 *   强制以 `:key` 重新挂载对话框，保证新请求不会复用上一次队列状态）；
 * - `closeBatchCompileDialog()`：只切显隐并清空请求；对话框卸载时自行 `dispose()` 队列
 *   （未应用的草案不写盘，取消语义由 `BatchCompileDialog` 关闭前触发）；
 * - 状态为模块级单例：主界面卸载/测试清理时调用
 *   {@link resetBatchCompileDialogStateForTesting} 归零。
 */
import { reactive } from 'vue'
import type { NormalizedBatchCompileRequest } from '../../common/batch-compile'
import { createDefaultBatchCompileRequest } from '../../common/batch-compile'

/** 批量编译对话框共享状态 */
export interface BatchCompileDialogState {
    /** 是否展开 */
    visible: boolean
    /** 本次编译请求（归一化后；null = 无请求，按全量编译准备） */
    request: NormalizedBatchCompileRequest | null
    /** 打开序号：同一次会话多次打开时用于 `:key` 强制重新挂载对话框 */
    sequence: number
}

/** 模块单例状态（对话框只读渲染，写操作走下方函数） */
export const batchCompileDialogState = reactive<BatchCompileDialogState>({
    visible: false,
    request: null,
    sequence: 0
})

/** 打开批量编译对话框（记录请求 + 递增序号；宿主负责挂载） */
export function openBatchCompileDialog(request: NormalizedBatchCompileRequest | null): void {
    batchCompileDialogState.request = request ? { ...request } : createDefaultBatchCompileRequest()
    batchCompileDialogState.sequence += 1
    batchCompileDialogState.visible = true
}

/** 关闭批量编译对话框（只切显隐；请求清空避免下次误用旧范围） */
export function closeBatchCompileDialog(): void {
    batchCompileDialogState.visible = false
    batchCompileDialogState.request = null
}

/** 仅供单元测试：重置模块单例状态 */
export function resetBatchCompileDialogStateForTesting(): void {
    batchCompileDialogState.visible = false
    batchCompileDialogState.request = null
    batchCompileDialogState.sequence = 0
}
