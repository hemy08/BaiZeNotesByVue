<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 style="display: flex; align-items: center; justify-content: center">文本到 ASCII 二进制</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">将文本转换为其 ASCII 二进制表示形式，反之亦然。</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/text-to-binary')"
    >
      https://tools.w3cschool.cn/text-to-binary
    </a>
    <div :style="{ width: props.workAreaWidth }">TEST</div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

function openUrl(link) {
  window.open(link, '_blank', 'noopener, noreferrer')
}
</script>

<style scoped></style>
