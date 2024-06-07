<template>
  <div ref="mermaidContainer" class="mermaid-container"></div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import mermaid from 'mermaid'

const mermaidContainer = ref<HTMLElement | null>(null)

// 初始化配置
onMounted(() => {
  mermaid.initialize({})

  window.electron.ipcRenderer.on('mermaid-render-graph-to-svg', (_, graphDesc: string) => {
    console.log('mermaid-render-graph-to-svg', graphDesc)
    if (graphDesc && mermaidContainer.value) {
      /*mermaid.render('mermaidContainer', graphDesc, function (svgData) {
        if (svgData) {
          console.log('svg elem', svgData)
          window.electron.ipcRenderer.send('mermaid-render-graph-svg-result', svgData)
        }
      })*/
    }
  })
})
/*
function mermaidRenderSvg(graphDesc) {
  if (graphDesc && mermaidContainer.value) {
    try {
      mermaid.render(mermaidContainer.value, graphDesc, (svgData) => {
        if (svgData) {
          console.log('svg elem', svgData)
          window.electron.ipcRenderer.send('mermaid-render-graph-svg-result', svgData)
        }
      })
    } catch (error) {
      console.log('svg elem error', error)
    }
  }
}*/
</script>

<style scoped></style>
