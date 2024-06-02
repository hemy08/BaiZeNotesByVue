<template>
  <div id="file-tree">
    <FileTreeNode
      v-for="(rootItem, index) in fileSystemTree"
      :key="index"
      v-model:is-expanded="rootItem.isExpanded"
      :is-indented="false"
      :node="rootItem"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FileTreeNode from './FileTreeNode.vue'

const fileSystemTree = ref<[]>([])

window.electron.ipcRenderer.on('file-system-data', (_, fileSystemData: string) => {
  try {
    // 解析接收到的 JSON 数据
    // 更新响应式引用
    fileSystemTree.value = JSON.parse(fileSystemData)
  } catch (error) {
    console.error('Error parsing file system data:', error)
  }
})

</script>

<style scoped>

#file-tree {
  background: whitesmoke;
  color: black;
  margin-left: 4px;
}

</style>
