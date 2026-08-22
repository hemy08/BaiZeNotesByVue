<template>
    <div ref="mermaidContainer" class="mermaid"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import mermaid from 'mermaid'

// 使用 ref 来获取 DOM 元素
const mermaidContainer = ref(null)

const props = defineProps({
    graphCode: {
        type: String,
        default: ''
    }
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(['mermaid-render-result'])

const handleMermaidGraphDef = async (_: any, graphData: string) => {
    try {
        await mermaid.render('mermaidContainer', graphData)
    } catch (error) {
        console.error('waitAsyncRenderResult error', error)
    }
}

onMounted(() => {
    mermaid.initialize({ startOnLoad: false })
    window.electron.ipcRenderer.on('mermaid-graph-definition', handleMermaidGraphDef)
})

onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener('mermaid-graph-definition', handleMermaidGraphDef)
})

let mermaidDebounceTimer: ReturnType<typeof setTimeout> | null = null
const MERMAID_DEBOUNCE_DELAY = 300

// 监听代码内容变化（带防抖）
watch(
    () => props.graphCode,
    async (newCode) => {
        if (mermaidDebounceTimer) {
            clearTimeout(mermaidDebounceTimer)
        }
        mermaidDebounceTimer = setTimeout(async () => {
            try {
                const renderSvg = await mermaid.render('mermaidContainer', newCode)
                emit(
                    'mermaid-render-result',
                    '<pre class="mermaid"><code>' + renderSvg.svg + '</code></pre>'
                )
            } catch (error) {
                console.error('waitAsyncRenderResult error', error)
            }
        }, MERMAID_DEBOUNCE_DELAY)
    }
)

onBeforeUnmount(() => {
    if (mermaidDebounceTimer) {
        clearTimeout(mermaidDebounceTimer)
    }
})

emit('mermaid-render-result', 'mermaid-render-result mermaid-render-result mermaid-render-result')
</script>

<style scoped>
.mermaid {
    width: 100%;
    font-size: 14px;
}
</style>
