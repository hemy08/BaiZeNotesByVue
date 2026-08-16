<template>
    <div
        id="markdown-preview-html"
        class="markdown-preview-html md-typeset"
        v-html="renderedMarkdownContent"
    ></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import highlightjs from 'markdown-it-highlightjs'
import { full as emoji } from 'markdown-it-emoji'
import hljs from 'highlight.js'
import * as editor from './hemy-editor'
import EventBus from '../../common/event_bus/event-bus'
import MarkdownIt from 'markdown-it'
import plantuml from 'markdown-it-plantuml'
import actionscript from 'highlight.js/lib/languages/actionscript'

const props = defineProps({
    editorContent: {
        type: String,
        default: ''
    }
})

const renderedMarkdownContent = ref('')

let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null
const RENDER_DEBOUNCE_DELAY = 150

const md = MarkdownIt({
    html: true,
    xhtmlOut: true,
    linkify: true,
    langPrefix: 'language-',
    breaks: true,
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
    .use(plantuml)
    .use(emoji)

onMounted(() => {
    hljs.registerLanguage('actionscript', actionscript)
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

// 定义一个函数来更新 Markdown 的渲染，预处理
async function updateMarkdownPreRender() {
    window.electron.ipcRenderer.send('pre-render-monaco-editor-content', props.editorContent)
}

// 定义一个函数来更新 Markdown 的渲染，渲染后处理
function updateMarkdownPostRender(text: string) {
    UpdateMarkdownChapters()
    window.electron.ipcRenderer.send('post-render-monaco-editor-content', text)
}

const handlePreRenderResult = async (_: any, context: string) => {
    const result = await editor.Render.PreMarkdownRender(context)
    updateMarkdownPostRender(md.render(result))
}

const handlePostRenderResult = async (_: any, context: string) => {
    renderedMarkdownContent.value = editor.Render.PostMarkdownRender(context)
}

function parserFileName(filePath: string): string {
    const lastIndex = filePath.lastIndexOf('/') || filePath.lastIndexOf('\\')
    if (lastIndex === -1) {
        return filePath
    }
    return filePath.slice(lastIndex + 1)
}

function handlePreviewClick(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest('a')
    if (!target) return
    const href = target.getAttribute('href')
    if (!href) return
    event.preventDefault()
    if (href.endsWith('.md')) {
        const fileInfo: FileProperties = {
            name: parserFileName(href),
            path: href,
            type: 'file',
            content: ''
        }
        window.electron.ipcRenderer.send('baize:notes:open-select-file', fileInfo)
    } else if (href.startsWith('http')) {
        window.open(href, '_blank', 'noopener, noreferrer')
    }
}

onMounted(() => {
    EventBus.$on('baize:notes:monaco-editor:get-chapters', UpdateMarkdownChapters)
    window.electron.ipcRenderer.on('pre-render-monaco-editor-content-result', handlePreRenderResult)
    window.electron.ipcRenderer.on('post-render-monaco-editor-content-result', handlePostRenderResult)

    const container = document.getElementById('markdown-preview-html')
    container?.addEventListener('click', handlePreviewClick)
})

onBeforeUnmount(() => {
    EventBus.$off('baize:notes:monaco-editor:get-chapters', UpdateMarkdownChapters)
    window.electron.ipcRenderer.removeListener('pre-render-monaco-editor-content-result', handlePreRenderResult)
    window.electron.ipcRenderer.removeListener('post-render-monaco-editor-content-result', handlePostRenderResult)

    const container = document.getElementById('markdown-preview-html')
    container?.removeEventListener('click', handlePreviewClick)

    // 清理防抖定时器
    if (renderDebounceTimer) {
        clearTimeout(renderDebounceTimer)
        renderDebounceTimer = null
    }
})
</script>

<style>
.katex-math-block {
    text-align: center;
    margin-top: 20px;
    margin-bottom: 20px;
}
.katex-code-block {
    text-align: center;
}
</style>

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
