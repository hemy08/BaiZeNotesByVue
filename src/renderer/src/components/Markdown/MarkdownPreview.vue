<template>
  <div v-html="htmlContent"></div>
</template>

<script setup lang="ts">

import {ref, onMounted} from 'vue'
import MarkdownIt from 'markdown-it'

const htmlContent = ref('')
const md = new MarkdownIt()

// 在组件挂载后执行 Markdown 渲染
onMounted(() => {
  htmlContent.value = md.render('# Markdown Title\nThis is a paragraph.')
})
</script>

<style scoped></style>
