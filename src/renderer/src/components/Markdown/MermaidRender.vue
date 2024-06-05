<template>
  <div ref="mermaidContainer" class="mermaid"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import mermaid from 'mermaid'

// 使用 ref 来获取 DOM 元素
const mermaidContainer = ref(null)

window.electron.ipcRenderer.on('mermaid-graph-definition', (_, graphData: string) => {
  console.log('graphData', graphData)
  if (graphData) {
    mermaid.initialize
    const result = mermaid.render('mermaidContainer', graphData)
    if (result) {
      console.log('mermaidEle outerHTML', result)
      window.electron.ipcRenderer.send('mermaid-graph-svg-data-to-main', result)
    } else { /* empty */ }
  }
})

</script>

<style scoped>
.mermaid {
  width: 100%;
  font-size: 14px;
}
</style>
