<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 style="display: flex; align-items: center; justify-content: center">大小写转换</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">更改字符串的大小写并在不同格式之间进行选择</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/case-converter')"
    >
      https://tools.w3cschool.cn/case-converter
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
