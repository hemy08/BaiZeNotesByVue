<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 style="display: flex; align-items: center; justify-content: center">IPv6 ULA生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">根据RFC4193在网络上生成您自己的本地不可路由IP地址。</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/ipv6-ula-generator')"
    >
      https://tools.w3cschool.cn/ipv6-ula-generator
    </a>
    <div :style="{ width: props.workAreaWidth }">TEST</div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

function openUrl(link) {
  window.open(link, '_blank', 'noopener, noreferrer')
}
</script>

<style scoped></style>
