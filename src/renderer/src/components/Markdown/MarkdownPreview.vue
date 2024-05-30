<template>
  <div v-html="renderedMarkdownContent"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineProps, watchEffect } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps({
  code: {
    type: String,
    default: ''
  }
})

const renderedMarkdownContent = ref('')

const md = MarkdownIt()

// 组件挂载时，进行初始渲染
onMounted(() => {
  updateMarkdown()
})

// 监听 props.code 的变化，并在变化时更新 Markdown
watchEffect(() => {
  updateMarkdown()
})

// 定义一个函数来更新 Markdown 的渲染
function updateMarkdown() {
  renderedMarkdownContent.value = md.render(props.code)
}
</script>

<style scoped></style>
