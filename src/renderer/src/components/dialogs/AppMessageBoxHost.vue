<template>
    <!--
        通用应用内消息/确认对话框宿主（2026-11-21：替换主进程原生 dialog.showMessageBox）。

        常驻挂载在主界面（BaiZeNotes.vue）：主进程 showAppMessageBox() 经
        IPC.DIALOG.APP_MESSAGE_REQUEST 请求时，这里驱动 AppMessageDialog 展示并回传选择。
        宿主挂载/卸载经 IPC.DIALOG.APP_MESSAGE_HOST_READY 通知主进程；宿主未就绪
        （欢迎页/主界面未挂载）时主进程直接回退原生框，不白等 30s 超时。

        说明（性能预算）：宿主与对话框代码随主界面异步 chunk 加载，不进入渲染入口 chunk
        （入口 chunk 为 150 KiB 硬预算，PERF-01）。
    -->
    <AppMessageDialog
        v-if="appMessage.state.visible && appMessage.state.request"
        :visible="appMessage.state.visible"
        :kind="appMessage.state.request.kind"
        :title="appMessage.state.request.title"
        :message="appMessage.state.request.message"
        :detail="appMessage.state.request.detail"
        :buttons="appMessage.state.request.buttons"
        :default-id="appMessage.state.request.defaultId"
        :cancel-id="appMessage.state.request.cancelId"
        @choose="appMessage.choose"
    />
</template>

<script setup lang="ts">
/**
 * 通用应用内消息框宿主：只负责生命周期接线（onMounted 注册监听并发送就绪握手、
 * onBeforeUnmount 退订并发送卸载握手），状态与回传逻辑在 useAppMessageBox，
 * 展示在 AppMessageDialog（BaseDialog 外壳）。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useAppMessageBox } from '../../composables/useAppMessageBox'
import AppMessageDialog from './simple/AppMessageDialog.vue'

const appMessage = useAppMessageBox()

onMounted(() => {
    appMessage.start()
})

onBeforeUnmount(() => {
    appMessage.stop()
})
</script>
