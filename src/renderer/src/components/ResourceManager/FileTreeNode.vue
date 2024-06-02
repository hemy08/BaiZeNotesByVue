<template>
  <div class="file-tree-node">
    <div class="node-content">
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <span v-if="node.type === 'folder'">
        <i class="folder-icon">📁</i>
        <span>{{ node.name }}</span>
        <button @click="toggleFolder">
          {{ isExpanded ? '-' : '+' }}
        </button>
      </span>
      <!-- 如果是文件，只显示文件图标和名称 -->
      <span v-else>
        <i class="file-icon">📄</i>
        <span>{{ node.name }}</span>
      </span>
    </div>
    <!-- 如果当前是文件夹并且已经展开，递归显示子节点 -->
    <div v-if="node.type === 'folder' && isExpanded">
      <FileTreeNode v-for="child in node.children" :key="child.id" :node="child" />
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
      type: 'folder' | 'file'
      children?: {
        id: never
        name: string
        type: 'folder' | 'file'
        children?: never[]
      }[]
    }>,
    required: true
  }
})

const isExpanded = ref(false) // 控制文件夹是否展开

const toggleFolder = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<style scoped></style>
