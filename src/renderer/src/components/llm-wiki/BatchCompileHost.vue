<template>
    <!--
        1.5.7 LLM Wiki 迁移批次 M2：批量编译宿主（常驻挂载，零可见 DOM）。
        - 订阅 EventBus `LLM_WIKI_COMPILE_REQUEST`（迁移弹窗交接的编译选择）；
        - 等迁移弹窗关闭后再打开批量编译对话框，避免两个模态叠层（迁移结果页先让用户看完）；
        - 对话框本体 v-if 挂载：未打开时零 DOM/零队列副作用。
    -->
    <BatchCompileDialog
        v-if="batchCompileDialogState.visible"
        :key="batchCompileDialogState.sequence"
        :request="batchCompileDialogState.request"
        @close="closeBatchCompileDialog"
    />
</template>

<script setup lang="ts">
/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译对话框宿主。
 *
 * ## 为什么需要宿主
 * 迁移弹窗在 `MigrateWizardDialog` 内 emit `LLM_WIKI_COMPILE_REQUEST` 后并不关闭（停在结果页），
 * 而编译对话框需要「迁移结果页关闭后」再出现：宿主负责
 * 「EventBus 事件 → 等待迁移弹窗关闭 → 打开对话框」的编排，并随工作区壳常驻挂载
 * （EventBus 监听经 `useEventBus` 注册，卸载自动清理）。
 *
 * ## 与迁移弹窗的先后
 * 迁移成功且用户勾选编译时：迁移弹窗先展示「已迁移 N」结果页；用户关闭后本宿主收到
 * 状态变化（`workspaceModeSwitchState.visible=false`）立即打开编译对话框。若迁移弹窗未打开
 * （后续批次可能新增的其它编译入口），事件到达即直接打开。
 */
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'
import {
    normalizeBatchCompileRequest,
    type NormalizedBatchCompileRequest
} from '../../common/batch-compile'
import { useEventBus } from '../../composables/useEventBus'
import { workspaceModeSwitchState } from '../../composables/useWorkspaceModeSwitch'
import BatchCompileDialog from './BatchCompileDialog.vue'
import {
    batchCompileDialogState,
    closeBatchCompileDialog,
    openBatchCompileDialog
} from './batch-compile-dialog-state'

const { on: onEventBus } = useEventBus({ componentIdPrefix: 'BatchCompileHost' })

/** 等待迁移弹窗关闭的 watcher 停止函数（同一时刻最多一个待打开请求） */
let stopVisibilityWatch: (() => void) | null = null

/** 取消等待（新请求到达 / 宿主卸载时调用，避免 watcher 泄漏） */
function clearPendingWait(): void {
    if (stopVisibilityWatch !== null) {
        stopVisibilityWatch()
        stopVisibilityWatch = null
    }
}

/**
 * 打开批量编译对话框：
 * - 迁移弹窗未打开 → 立即打开；
 * - 迁移弹窗仍停在结果页 → 等其关闭后再打开（用户先看完迁移结果，避免双模态叠层）。
 */
function openWhenMigrationDialogClosed(request: NormalizedBatchCompileRequest): void {
    clearPendingWait()
    if (!workspaceModeSwitchState.visible) {
        openBatchCompileDialog(request)
        return
    }
    stopVisibilityWatch = watch(
        () => workspaceModeSwitchState.visible,
        (visible) => {
            if (!visible) {
                clearPendingWait()
                openBatchCompileDialog(request)
            }
        }
    )
}

/** EventBus 处理：宽容归一化载荷后按上述时序打开对话框 */
function handleCompileRequest(payload: unknown): void {
    const request = normalizeBatchCompileRequest(payload)
    logger.info(
        `[批量编译] 收到编译请求：scope=${request.scope} directory=${request.directory ?? '-'} ` +
            `batchSize=${request.batchSize} degraded=${request.degraded}`
    )
    openWhenMigrationDialogClosed(request)
}

onMounted(() => {
    onEventBus<unknown>(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, handleCompileRequest)
})

onBeforeUnmount(() => {
    clearPendingWait()
    // EventBus 监听由 useEventBus 自动清理（本组件在 setup 内注册，先于此处执行）
})
</script>
