<template>
  <div class="markdown-content" v-html="renderedMarkdownContent"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
/*import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from "highlight.js";
import mk from '/node_mo'

const md = MarkdownIt()
md.options.html = true
md.options.linkify = true
md.options.langPrefix = 'language-'
md.options.breaks = true
md.options.typographer = true
md.use(highlightjs, { inline: true, hljs: hljs }).use(mk)
md.options.highlight = function (str, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(str, {language: lang, ignoreIllegals:true}).value
    } catch (__) {
      return ''
    }
  }

  return ''
}*/

/*// 组件挂载时，进行初始渲染
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
  renderedMarkdownContent.value = md.render(htmlContent)
}*/

const renderedMarkdownContent = ref('')

window.electron.ipcRenderer.on('markdown-rendered', (_, htmlContent: string) => {
  renderedMarkdownContent.value =  htmlContent
})
</script>

<style scoped>

@import "katex/dist/katex.min.css";

.markdown-content {
  width: 100%;
  height: 100%;
  overflow-y: auto; /* 允许垂直滚动条在需要时出现 */
  display: inline-block;
}
</style>
