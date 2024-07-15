<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">WiFi 二维码生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">生成和下载QR码以快速连接到WiFi网络。</p>
    <a href="https://tools.w3cschool.cn/wifi-qrcode-generator">
      https://tools.w3cschool.cn/wifi-qrcode-generator
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
