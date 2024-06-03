<template>
  <div class="file-tree-node" :class="{ indented: isIndented }">
    <div class="node-content" @click="handleClick(node)">
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <span v-if="node.type === 'folder'">
        <button @click="toggleFolder">
          {{ isExpanded ? '<' : 'v' }}
        </button>
        <i class="folder-icon">📁</i>
        <span>{{ node.name }}</span>
      </span>
      <!-- 如果是文件，只显示文件图标和名称 -->
      <span v-else>
        <i class="file-icon">📄</i>
        <span>{{ node.name }}</span>
      </span>
    </div>
    <!-- 如果当前是文件夹并且已经展开，递归显示子节点 -->
    <div v-if="node.type === 'folder' && isExpanded">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.id"
        v-model:is-expanded="child.isExpanded"
        :node="child"
        :is-indented="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, PropType } from 'vue'

// 定义 props 类型
// @ts-ignore eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  node: {
    type: Object as PropType<{
      id: never
      name: string
      path: string
      type: 'folder' | 'file'
      isDirectory: boolean
      isIndented: boolean
      isExpanded: boolean
      children?: {
        id: never
        name: string
        path: string
        type: 'folder' | 'file'
        isDirectory: boolean
        isIndented: boolean
        isExpanded: boolean
        children?: never[]
      }[]
    }>,
    required: true
  },
  isIndented: {
    type: Boolean,
    default: false // 根据你的需求设置默认值
  },
  isExpanded: {
    type: Boolean,
    default: false
  }
})

// eslint-disable-next-line vue/no-dupe-keys
const isExpanded = ref(false) // 控制文件夹是否展开
const toggleFolder = () => {
  isExpanded.value = !isExpanded.value
}

function handleFileSelect(path: string) {
  window.electron.ipcRenderer.send('open-select-file', path)
}

function handleClick(node) {
  if (node.type === 'file' && node.name.endsWith('.md')) {
    handleFileSelect(node.path)
  }
}
</script>

<style scoped>
.indented {
  margin-left: 1em; /* 设置缩进 */
}

.file-tree-node {
  overflow-y: auto;
  height: 100%;
}
</style>
