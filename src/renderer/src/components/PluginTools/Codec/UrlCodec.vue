<!--
  URL 编解码插件入口（plugin-tools-const.ts 的 lazyTool 动态导入路径与 id 保持不变）。

  第 3 批重构（子任务 A2）：模板/交互统一由 Codec/TextCodecTool.vue 提供，本文件只保留
  本工具专属配置（i18n 前缀、DOM id 前缀、编码/解码纯函数映射），行为与迁移前一致。
  URL 解码遇到非法百分号序列会抛 URIError：通过动作的 errorKey 传 decodeErrorAlert，
  由通用组件统一捕获并弹出原 i18n 提示（文案 key 不变）。
-->
<template>
    <TextCodecTool
        :work-area-width="props.workAreaWidth"
        i18n-prefix="toolsConvert.urlCodec"
        id-prefix="url"
        :actions="actions"
    />
</template>

<script setup lang="ts">
import TextCodecTool from './TextCodecTool.vue'
import { decodeUrl, encodeUrl } from './url-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

// 编码：encodeURIComponent 百分号编码；解码：decodeURIComponent（非法序列由通用组件提示）
const actions = [
    { id: 'url-encode', labelKey: 'encodeButton', transform: encodeUrl },
    {
        id: 'url-decode',
        labelKey: 'decodeButton',
        transform: decodeUrl,
        errorKey: 'decodeErrorAlert'
    }
]
</script>
