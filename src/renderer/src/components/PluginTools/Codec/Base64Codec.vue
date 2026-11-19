<!--
  Base64 编解码插件入口（plugin-tools-const.ts 的 lazyTool 动态导入路径与 id 保持不变）。

  第 3 批重构（子任务 A2）：模板/交互统一由 Codec/TextCodecTool.vue 提供，本文件只保留
  本工具专属配置（i18n 前缀、DOM id 前缀、编码/解码纯函数映射），行为与迁移前一致。
-->
<template>
    <TextCodecTool
        :work-area-width="props.workAreaWidth"
        i18n-prefix="toolsConvert.base64"
        id-prefix="base64"
        :actions="actions"
    />
</template>

<script setup lang="ts">
import TextCodecTool from './TextCodecTool.vue'
import { decodeBase64, encodeBase64 } from './base64-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

// 编码：原文按 UTF-8 转 Base64；解码：Base64 还原为文本（容忍非法字符）
const actions = [
    { id: 'base64-encode', labelKey: 'encodeButton', transform: encodeBase64 },
    { id: 'base64-decode', labelKey: 'decodeButton', transform: decodeBase64 }
]
</script>
