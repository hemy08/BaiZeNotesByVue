<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">整数基转换器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">在不同的基数（十进制、十六进制、二进制、八进制、base64…）之间转换数字</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/base-converter')"
    >
      https://tools.w3cschool.cn/base-converter
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
