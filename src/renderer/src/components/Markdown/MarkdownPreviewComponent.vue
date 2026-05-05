<template>
    <div
        id="markdown-preview-html"
        class="markdown-preview-html md-typeset"
        v-html="renderedMarkdownContent"
    ></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref, watchEffect } from 'vue'
import highlightjs from 'markdown-it-highlightjs'
import { full as emoji } from 'markdown-it-emoji'
import hljs from 'highlight.js'
import * as editor from './hemy-editor'
import EventBus from '../../common/event_bus/event-bus'
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

// ========== 防抖优化 ==========
let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null
const RENDER_DEBOUNCE_DELAY = 150 // 防抖延迟150ms

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
    .use(highlightjs, {
        inline: true,
        hljs: hljs,
        highlight: function (str: string, lang: string): string {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(str, { language: lang }).value
                } catch (__) {
                    console.warn(`Highlight.js error for language '${lang}':`, __)
                }
            }
            return ''
        }
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    .use(require('markdown-it-plantuml'))
    .use(emoji)

// 组件挂载时，进行初始渲染
onMounted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    hljs.registerLanguage('actionscript', require('highlight.js/lib/languages/actionscript'))
})

// 监听 props.editorContent 的变化，并在变化时更新 Markdown（带防抖优化）
watchEffect(() => {
    // 读取props.editorContent以建立响应式依赖
    const content = props.editorContent

    // 清除之前的定时器
    if (renderDebounceTimer) {
        clearTimeout(renderDebounceTimer)
    }
    // 设置新的防抖定时器
    renderDebounceTimer = setTimeout(() => {
        updateMarkdownPreRender()
        renderDebounceTimer = null
    }, RENDER_DEBOUNCE_DELAY)
})

function UpdateMarkdownChapters() {
    // isTocOpen = tocOpen
    editor.Render.ParserMarkdownChapters(md, props.editorContent)
}

onMounted(() => {
    EventBus.$on('monaco-editor-get-chapters', UpdateMarkdownChapters)

    onBeforeUnmount(() => {
        EventBus.$off('monaco-editor-get-chapters', UpdateMarkdownChapters)

        // 清理防抖定时器
        if (renderDebounceTimer) {
            clearTimeout(renderDebounceTimer)
            renderDebounceTimer = null
        }
    })
})

// 定义一个函数来更新 Markdown 的渲染，预处理
async function updateMarkdownPreRender() {
    window.electron.ipcRenderer.send('pre-render-monaco-editor-content', props.editorContent)
}

// 定义一个函数来更新 Markdown 的渲染，渲染后处理
function updateMarkdownPostRender(text: string) {
    UpdateMarkdownChapters()
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
    width: calc(100% - 15px);
    height: 100%;
    margin-left: 15px;
    overflow-y: scroll;
    overflow-x: auto;
    display: inline-block;
}

/* 代码块样式优化 */
.markdown-preview-html :deep(pre) {
    background-color: #f8f9fa;
    border-radius: 4px;
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
    border: 1px solid #e0e0e0;
}

.markdown-preview-html :deep(code) {
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    color: #333;
}

.markdown-preview-html :deep(pre code) {
    background-color: transparent;
    padding: 0;
    border: none;
}

/* 行内代码样式 */
.markdown-preview-html :deep(p code),
.markdown-preview-html :deep(li code) {
    background-color: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
}

/* 代码高亮样式 */
.markdown-preview-html :deep(.hljs) {
    background-color: #f8f9fa;
    color: #333;
}

.markdown-preview-html :deep(.hljs-comment),
.markdown-preview-html :deep(.hljs-quote) {
    color: #998;
    font-style: italic;
}

.markdown-preview-html :deep(.hljs-keyword),
.markdown-preview-html :deep(.hljs-selector-tag),
.markdown-preview-html :deep(.hljs-subst) {
    color: #333;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-number),
.markdown-preview-html :deep(.hljs-literal),
.markdown-preview-html :deep(.hljs-variable),
.markdown-preview-html :deep(.hljs-template-variable),
.markdown-preview-html :deep(.hljs-tag .hljs-attr) {
    color: #008080;
}

.markdown-preview-html :deep(.hljs-string),
.markdown-preview-html :deep(.hljs-doctag) {
    color: #d14;
}

.markdown-preview-html :deep(.hljs-title),
.markdown-preview-html :deep(.hljs-section),
.markdown-preview-html :deep(.hljs-selector-id) {
    color: #900;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-type),
.markdown-preview-html :deep(.hljs-class .hljs-title) {
    color: #458;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-tag),
.markdown-preview-html :deep(.hljs-name),
.markdown-preview-html :deep(.hljs-attribute) {
    color: #000080;
    font-weight: normal;
}

.markdown-preview-html :deep(.hljs-regexp),
.markdown-preview-html :deep(.hljs-link) {
    color: #009926;
}

.markdown-preview-html :deep(.hljs-symbol),
.markdown-preview-html :deep(.hljs-bullet) {
    color: #990073;
}

.markdown-preview-html :deep(.hljs-built_in),
.markdown-preview-html :deep(.hljs-builtin-name) {
    color: #0086b3;
}

.markdown-preview-html :deep(.hljs-meta) {
    color: #999;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-deletion) {
    background: #fdd;
}

.markdown-preview-html :deep(.hljs-addition) {
    background: #dfd;
}

.markdown-preview-html :deep(.hljs-emphasis) {
    font-style: italic;
}

.markdown-preview-html :deep(.hljs-strong) {
    font-weight: bold;
}
</style>
