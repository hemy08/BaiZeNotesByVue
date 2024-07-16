<template>
  <div :style="{ width: props.viewWidth }">
    <h1 style="display: flex; align-items: center; justify-content: center">RSA密钥对生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">生成新的随机RSA私钥和公钥pem证书。</p>
    <a href="https://tools.w3cschool.cn/rsa-key-pair-generator">
      https://tools.w3cschool.cn/rsa-key-pair-generator
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
