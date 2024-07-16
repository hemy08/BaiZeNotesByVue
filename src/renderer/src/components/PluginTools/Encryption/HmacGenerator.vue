<template>
  <div :style="{ width: props.viewWidth }">
    <h1 style="display: flex; align-items: center; justify-content: center">Hmac 生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用密钥和您喜欢的哈希函数计算基于哈希的消息身份验证代码（HMAC）。</p>
    <a href="https://tools.w3cschool.cn/hmac-generator">
      https://tools.w3cschool.cn/hmac-generator
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
