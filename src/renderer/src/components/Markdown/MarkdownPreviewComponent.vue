<template>
  <div class="markdown-content" v-html="renderedMarkdownContent"></div>
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

md.options.html = true
md.options.linkify = true
md.options.langPrefix = 'language-'
md.options.breaks = true
md.options.typographer = true
md.enable(['link']).enable('image')

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

<style scoped>
.markdown-content {
  width: 100%;
  height: 100%;
  overflow-y: auto; /* 允许垂直滚动条在需要时出现 */
}
</style>
