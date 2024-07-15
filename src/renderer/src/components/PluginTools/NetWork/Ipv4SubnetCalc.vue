<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">IPv4子网计算器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">解析IPv4 CIDR块，并获取有关子网络的所有所需信息。</p>
    <a href="https://tools.w3cschool.cn/ipv4-subnet-calculator">
      https://tools.w3cschool.cn/ipv4-subnet-calculator
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
