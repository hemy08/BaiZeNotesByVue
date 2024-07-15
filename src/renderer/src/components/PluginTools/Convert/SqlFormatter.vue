<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">SQL 美化和格式化</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">格式化和美化您的 SQL 查询（它支持各种 SQL 方言）。</p>
    <a href="https://tools.w3cschool.cn/sql-prettify"> https://tools.w3cschool.cn/sql-prettify </a>
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
