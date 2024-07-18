<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">日期时间转换器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">将日期和时间转换为各种不同的格式</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/date-converter')"
    >
      https://tools.w3cschool.cn/date-converter
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

function openUrl(link) {
  window.open(link, '_blank', 'noopener, noreferrer')
}
</script>

<style scoped></style>
