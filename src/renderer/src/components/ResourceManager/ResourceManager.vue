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
import {ref} from 'vue'
import FileTreeNode from './FileTreeNode.vue'
import {FileSysItem} from './resource-manager'

const fileSystemTree = ref<FileSysItem[]>([])

window.electron.ipcRenderer.on('file-system-data', (_, fileSystemData: string) => {
  try {
    // 解析接收到的 JSON 数据 更新响应式引用
    // 遍历数据，为第一级文件设置 isExpanded 为 true
    /*parsedData.forEach((rootItem) => {
      if (rootItem.children) {
        rootItem.children.forEach((child) => {
          child.isExpanded = true
          if (!child.children) child.isExpanded = true
        })
      }

      rootItem.isExpanded = true // 假设 rootItem 是第一级文件

      // 如果你的文件系统有嵌套结构，并且你只想设置第一级的 isExpanded，
      // 你可能需要检查 rootItem 是否有 children 属性，并据此决定是否设置 isExpanded
      if (!rootItem.children) rootItem.isExpanded = true
    })*/

    // 更新响应式数据
    fileSystemTree.value = JSON.parse(fileSystemData) as FileSysItem[]
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
