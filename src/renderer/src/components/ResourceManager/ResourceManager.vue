<template>
  <div id="file-manager">
    <div id="file-tree">
      <FileTreeNode
        v-for="(rootItem, index) in fileSystemTree"
        :key="index"
        v-model:is-expanded="rootItem.isExpanded"
        v-model:file-extension="rootItem.fileExtension"
        :is-indented="false"
        :node="rootItem"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FileTreeNode from './FileTreeNode.vue'

interface FileSysItem {
  id: never
  name: string
  path: string
  type: 'file' | 'folder'
  fileExtension: string
  isDirectory: boolean
  isIndented: boolean
  isExpanded: boolean
  children?: []
}

const fileSystemTree = ref<FileSysItem[]>([])

window.electron.ipcRenderer.on('file-system-data', (_, fileSystemData: string) => {
  try {
    // 解析接收到的 JSON 数据
    // 更新响应式引用
    fileSystemTree.value = JSON.parse(fileSystemData)
    console.log('fileSystemTree', fileSystemTree)
  } catch (error) {
    console.error('Error parsing file system data:', error)
  }
})
</script>

<style scoped>
#file-manager {
  background: ghostwhite;
  color: black;
  margin-left: 4px;
  overflow: auto;
  height: 100%;
}
</style>
