<template>
  <div ref="mermaidContainer" class="mermaid"></div>
</template>

<script setup lang="ts">
import { ref, defineEmits, onMounted, watch, defineProps } from 'vue'
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

onMounted(() => {
  mermaid.initialize({ startOnLoad: false })
})

// 监听代码内容变化
watch(
  () => props.graphCode,
  async (newCode) => {
    try {
      const renderSvg = await mermaid.render('mermaidContainer', newCode)
      emit('mermaid-render-result', '<pre class="mermaid"><code>' + renderSvg.svg + '</code></pre>')
    } catch (error) {
      console.log('waitAsyncRenderResult error', error)
    }
  }
)

emit('mermaid-render-result', 'mermaid-render-result mermaid-render-result mermaid-render-result')

window.electron.ipcRenderer.on('mermaid-graph-definition', async (_, graphData: string) => {
  let renderSvg
  try {
    renderSvg = await mermaid.render('mermaidContainer', graphData)
  } catch (error) {
    console.log('waitAsyncRenderResult error', error)
  }
  console.log('renderSvg', renderSvg.svg)
})
</script>

<style scoped>
.mermaid {
  width: 100%;
  font-size: 14px;
}
</style>
