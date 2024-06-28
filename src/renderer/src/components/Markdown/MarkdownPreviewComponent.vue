<template xmlns="http://www.w3.org/1999/html">
  <div
    id="markdown-preview-html"
    class="markdown-preview-html"
    v-html="renderedMarkdownContent"
  ></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref, watchEffect } from 'vue'
import highlightjs from 'markdown-it-highlightjs'
import { full as emoji } from 'markdown-it-emoji'
import hljs from 'highlight.js'
import * as editor from './hemy-editor'
import EventBus from '../../event-bus'
//import { marked } from 'marked'
//import { Remarkable } from 'remarkable'
import 'commonmark'

const props = defineProps({
  editorContent: {
    type: String,
    default: ''
  }
})

const renderedMarkdownContent = ref('')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
//let isTocOpen = false

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MarkdownIt = require('markdown-it')
const md = MarkdownIt({
  html: true, // 在源码中启用 HTML 标签
  xhtmlOut: true, // 使用 '/' 来闭合单标签 （比如 <br />）。 这个选项只对完全的 CommonMark 模式兼容。
  linkify: true, // 将类似 URL 的文本自动转换为链接。
  langPrefix: 'language-', // 给围栏代码块的 CSS 语言前缀。对于额外的高亮代码非常有用。
  breaks: true, // 转换段落里的 '\n' 到 <br>。
  // 启用一些语言中立的替换 + 引号美化
  // 双 + 单引号替换对，当 typographer 启用时。
  // 或者智能引号等，可以是 String 或 Array。
  // 比方说，你可以支持 '«»„“' 给俄罗斯人使用， '„“‚‘'  给德国人使用。
  // 还有 ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] 给法国人使用（包括 nbsp）。
  typographer: false
})
  .use(highlightjs, { inline: true, hljs: hljs })
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  .use(require('markdown-it-plantuml'))
  .use(emoji)

// 组件挂载时，进行初始渲染
onMounted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  hljs.registerLanguage('actionscript', require('highlight.js/lib/languages/actionscript'))
})

// 监听 props.editorContent 的变化，并在变化时更新 Markdown
watchEffect(() => {
  updateMarkdownPreRender()
})

function getMarkdownChapters() {
  // isTocOpen = tocOpen
  editor.Render.ParserMarkdownChapters(md, props.editorContent)
}

onMounted(() => {
  EventBus.$on('monaco-editor-get-chapters', getMarkdownChapters)

  onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-get-chapters', getMarkdownChapters)
  })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/*function getTokens() {
  const remark = new Remarkable()
  const markedTokens = marked.lexer(props.editorContent)
  console.log('markedTokens tokens', markedTokens)
  const remarkTokens = remark.parse(props.editorContent, [])
  console.log('remarkTokens tokens', remarkTokens)
  const mdTokens = md.parse(props.editorContent, [])
  console.log('markdown-it tokens', mdTokens)
}*/

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
    const result = await editor.Render.PreMarkdownRender(context)
    updateMarkdownPostRender(md.render(result))
  }
)

// 后处理结果，输出到预览窗口
window.electron.ipcRenderer.on(
  'post-render-monaco-editor-content-result',
  async (_, context: string) => {
    renderedMarkdownContent.value = editor.Render.PostMarkdownRender(context)
  }
)

function parserFileName(filePath: string): string {
  const lastIndex = filePath.lastIndexOf('/') || filePath.lastIndexOf('\\')
  if (lastIndex === -1) {
    // 如果没有找到'/'或'\\'，则整个字符串就是文件名（或路径错误）
    return filePath
  }
  return filePath.slice(lastIndex + 1)
}

onUpdated(() => {
  const links = document.querySelectorAll('#markdown-preview-html a')
  //console.log('links', links)
  //遍历链接
  for (let i = 0; i < links.length; i++) {
    const href = links[i].getAttribute('href')
    if (!href) {
      continue
    }
    links[i].addEventListener('click', (event) => {
      event.preventDefault()
      if (href.endsWith('.md')) {
        const fileInfo: FileProperties = {
          name: parserFileName(href),
          path: href,
          type: 'file',
          content: ''
        }
        window.electron.ipcRenderer.send('open-select-file', fileInfo)
      } else if (href.startsWith('http')) {
        window.open(href, '_blank', 'noopener, noreferrer')
      }
    })
  }
})
</script>

<style scoped>
@import 'katex/dist/katex.min.css';

.markdown-preview-html {
  width: 100%;
  height: 100%;
  margin-left: 15px;
  overflow-y: auto; /* 允许垂直滚动条在需要时出现 */
  overflow-x: auto;
  display: inline-block;
}
</style>
