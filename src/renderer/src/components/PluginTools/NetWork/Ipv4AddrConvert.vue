<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">Ipv4地址转换器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">在ipv6中，将ip地址转换为十进制、二进制、十六进制或事件</p>
    <a href="https://tools.w3cschool.cn/ipv4-address-converter">
      https://tools.w3cschool.cn/ipv4-address-converter
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
