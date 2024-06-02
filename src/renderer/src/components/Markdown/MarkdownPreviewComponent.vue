<template>
  <div class="markdown-content" v-html="renderedMarkdownContent"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, defineProps, watchEffect } from 'vue'
import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from "highlight.js";

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
md.use(highlightjs, { inline: true, hljs: hljs })
md.options.highlight = function (str, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(str, {language: lang, ignoreIllegals:true}).value
    } catch (__) {
      return ''
    }
  }

  return ''
}

// 组件挂载时，进行初始渲染
onMounted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  hljs.registerLanguage('actionscript', require('highlight.js/lib/languages/actionscript'))
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
  display: inline-block;
}
</style>
