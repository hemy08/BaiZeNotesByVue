<template>
    <!--
        关闭/退出「未保存修改」确认宿主（2026-11-20 应用内 BaseDialog 改造）。

        常驻挂载在主界面（BaiZeNotes.vue）：脏文件只可能存在于主界面编辑场景，因此宿主随
        主界面挂载/卸载即可保证「有未保存修改时监听一定在位」。主进程 close / before-quit
        经 IPC.DIALOG.UNSAVED_CLOSE_REQUEST 请求时，这里驱动 UnsavedChangesDialog 展示并回传选择。

        说明（性能预算）：宿主与对话框代码随主界面异步 chunk（BaiZeNotes-*.js）加载，
        不进入渲染入口 chunk（入口 chunk 为 150 KiB 硬预算，PERF-01）。
    -->
    <UnsavedChangesDialog
        v-if="unsavedClose.state.visible"
        :visible="unsavedClose.state.visible"
        :minimize-to-tray="unsavedClose.state.minimizeToTray"
        :busy="unsavedClose.state.busy"
        :error="unsavedClose.state.error"
        @save="unsavedClose.confirmSave"
        @discard="unsavedClose.confirmDiscard"
        @cancel="unsavedClose.confirmCancel"
    />
</template>

<script setup lang="ts">
/**
 * 关闭确认宿主：只负责生命周期接线（onMounted 注册主进程请求监听、onBeforeUnmount 退订），
 * 状态与回传逻辑在 useUnsavedCloseConfirm，展示在 UnsavedChangesDialog（BaseDialog 外壳）。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useUnsavedCloseConfirm } from '../../composables/useUnsavedCloseConfirm'
import UnsavedChangesDialog from './simple/UnsavedChangesDialog.vue'

const unsavedClose = useUnsavedCloseConfirm()

onMounted(() => {
    unsavedClose.start()
})

onBeforeUnmount(() => {
    unsavedClose.stop()
})
</script>
