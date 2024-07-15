<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">JSON 转 CSV</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用自动标头检测将JSON转换为CSV。</p>
    <a href="https://tools.w3cschool.cn/json-to-csv">
      https://tools.w3cschool.cn/json-to-csv
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
