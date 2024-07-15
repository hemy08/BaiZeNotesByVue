<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">文本到 ASCII 二进制</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">将文本转换为其 ASCII 二进制表示形式，反之亦然。</p>
    <a href="https://tools.w3cschool.cn/text-to-binary">
      https://tools.w3cschool.cn/text-to-binary
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
