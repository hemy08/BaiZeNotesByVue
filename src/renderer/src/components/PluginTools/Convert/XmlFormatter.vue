<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">XML 格式化</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">将XML字符串修饰为友好的可读格式。</p>
    <a href="https://tools.w3cschool.cn/xml-formatter">
      https://tools.w3cschool.cn/xml-formatter
    </a>
    <div :style="{ width: props.viewWidth }">TEST</div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
  // 编辑器宽度
  viewWidth: {
    type: String,
    default: '100%'
  }
})
</script>

<style scoped></style>
