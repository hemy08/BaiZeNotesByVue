<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">JSON美化和格式化</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">将JSON字符串修饰为友好的可读格式。</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/json-prettify')"
    >
      https://tools.w3cschool.cn/json-prettify
    </a>
    <h1 style="display: flex; align-items: center; justify-content: center">JSON 压缩</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">通过删除不必要的空白来缩小和压缩JSON</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/json-minify')"
    >
      https://tools.w3cschool.cn/json-minify
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
