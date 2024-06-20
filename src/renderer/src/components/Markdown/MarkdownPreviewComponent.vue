<template xmlns="http://www.w3.org/1999/html">
  <div class="markdown-content" v-html="renderedMarkdownContent"></div>
  <div v-show="isShowMermaidContainer" ref="mermaidContainer" class="mermaid"></div>
  <MermaidRender v-show="isShowMermaidComponent" />
</template>

<script setup lang="ts">
import { onMounted, ref, watchEffect } from 'vue'
import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from 'highlight.js'
import MermaidRender from './MermaidRender.vue'
import { preRenderMermaidProc } from './markdown-edit'

const props = defineProps({
  editorContent: {
    type: String,
    default: ''
  }
})

const renderedMarkdownContent = ref('')
const isShowMermaidContainer = ref(false)
const isShowMermaidComponent = ref(false)

const md = MarkdownIt()
md.options.html = true
md.options.linkify = true
md.options.langPrefix = 'language-'
md.options.breaks = false
md.options.typographer = true
// eslint-disable-next-line @typescript-eslint/no-var-requires
md.use(highlightjs, { inline: true, hljs: hljs }).use(require('markdown-it-plantuml'))

// 组件挂载时，进行初始渲染
onMounted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  hljs.registerLanguage('actionscript', require('highlight.js/lib/languages/actionscript'))
  updateMarkdownPreRender()
})

// 监听 props.editorContent 的变化，并在变化时更新 Markdown
watchEffect(() => {
  updateMarkdownPreRender()
})

// 定义一个函数来更新 Markdown 的渲染，预处理
async function updateMarkdownPreRender() {
  window.electron.ipcRenderer.send('pre-render-monaco-editor-content', props.editorContent)
}

// 定义一个函数来更新 Markdown 的渲染，渲染后处理
function updateMarkdownPostRender(text: string) {
  window.electron.ipcRenderer.send('post-render-monaco-editor-content', text)
}

// 预处理结束后，再进行mermaid渲染，调用markdown-it进行渲染，完毕后进行后处理
window.electron.ipcRenderer.on(
  'pre-render-monaco-editor-content-result',
  async (_, context: string) => {
    const result = await preRenderMermaidProc(context)
    updateMarkdownPostRender(md.render(result))
  }
)

// 后处理结果，输出到预览窗口
window.electron.ipcRenderer.on(
  'post-render-monaco-editor-content-result',
  async (_, context: string) => {
    renderedMarkdownContent.value = context
  }
)
</script>

<style scoped>
@import 'katex/dist/katex.min.css';

.markdown-content {
  width: 100%;
  height: 100%;
  margin-left: 15px;
  overflow-y: auto; /* 允许垂直滚动条在需要时出现 */
  display: inline-block;
}
</style>
