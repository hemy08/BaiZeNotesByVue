<!--
  Unicode 与中文互转插件入口（plugin-tools-const.ts 的 lazyTool 动态导入路径与 id 保持不变）。

  第 3 批重构（子任务 A2）：模板/交互统一由 Codec/TextCodecTool.vue 提供，本文件只保留
  本工具专属配置（i18n 前缀、DOM id 前缀、4 个转换动作的纯函数映射），行为与迁移前一致。
-->
<template>
    <TextCodecTool
        :work-area-width="props.workAreaWidth"
        i18n-prefix="toolsConvert.unicode"
        id-prefix="unicode"
        :actions="actions"
    />
</template>

<script setup lang="ts">
import TextCodecTool from './TextCodecTool.vue'
import { asciiToEntity, entityToAscii, textToUnicode, unicodeToText } from './unicode-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

// 文本 ↔ \uXXXX、文本 ↔ &#数字实体; 四向转换
const actions = [
    { id: 'unicode-to-unicode', labelKey: 'toUnicodeButton', transform: textToUnicode },
    { id: 'unicode-to-text', labelKey: 'toTextButton', transform: unicodeToText },
    { id: 'unicode-to-entity', labelKey: 'toEntityButton', transform: asciiToEntity },
    {
        id: 'unicode-entity-to-text',
        labelKey: 'entityToTextButton',
        transform: entityToAscii
    }
]
</script>
