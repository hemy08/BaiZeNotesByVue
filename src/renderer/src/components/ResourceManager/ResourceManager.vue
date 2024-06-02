<template>
  <div>
    <div v-for="(item, index) in fileSystemTree" :key="index">
      <div v-if="!item.isDirectory">
        <p>{{ item.name }} - {{ item.path }}</p>
      </div>
      <div v-else>
        <h2>{{ item.name }}</h2>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface FileSystemItem {
  name: string
  path: string
  isDirectory: false // 默认为文件
  children: [] // 初始化 children 为空数组
}

const fileSystemTree = ref<FileSystemItem[]>([])

window.electron.ipcRenderer.on('file-system-data', (_, fileSystemData: string) => {
  try {
    // 解析接收到的 JSON 数据
    // 更新响应式引用
    fileSystemTree.value = JSON.parse(fileSystemData) as FileSystemItem[]
  } catch (error) {
    console.error('Error parsing file system data:', error)
  }
})
</script>

<style scoped></style>
