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
import mermaid from 'mermaid'

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
md.options.breaks = true
md.options.typographer = true
// eslint-disable-next-line @typescript-eslint/no-var-requires
md.use(highlightjs, { inline: true, hljs: hljs }).use(require('markdown-it-plantuml'))
md.options.highlight = function (str, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
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

// 监听 props.editorContent 的变化，并在变化时更新 Markdown
watchEffect(() => {
  updateMarkdown()
})

async function mermaidRender(graphDefinition: string): Promise<string> {
  try {
    const renderSvg = await mermaid.render('mermaidContainer', graphDefinition)
    return Promise.resolve(
      '<div><pre class="mermaid"><code style="height: auto;display: flex">' +
        renderSvg.svg +
        '</code></pre></div>'
    )
  } catch (error) {
    console.log('mermaidRender error', error)
  }

  return ''
}

async function preRenderMermaidProc(text: string) {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const renderedSvg = await mermaidRender(match[1])
    renderResult = renderResult.replace(match[0], renderedSvg)
  }

  return renderResult
}

// 定义一个函数来更新 Markdown 的渲染
async function updateMarkdown() {
  window.electron.ipcRenderer.send('pre-render-monaco-editor-content', props.editorContent)
}

window.electron.ipcRenderer.on(
  'pre-render-monaco-editor-content-result',
  async (_, context: string) => {
    const result = await preRenderMermaidProc(context)
    renderedMarkdownContent.value = md.render(result)
  }
)
</script>

<style scoped>
@import 'katex/dist/katex.min.css';

.markdown-content {
  width: 100%;
  height: 100%;
  overflow-y: auto; /* 允许垂直滚动条在需要时出现 */
  display: inline-block;
}
</style>
