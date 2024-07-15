<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">BIP39密码生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">从现有或随机助记符生成BIP39密码短语，或从密码短语获取助记符。</p>
    <a href="https://tools.w3cschool.cn/bip39-generator">
      https://tools.w3cschool.cn/bip39-generator
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
