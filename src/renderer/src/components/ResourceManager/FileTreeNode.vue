<template>
  <div class="file-tree-node" :class="{ indented: isIndented }">
    <div class="node-content" @click="handleClick(node)">
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <span v-if="node.type === 'folder'">
        <button style="border: none; background-color: transparent" @click="toggleFolder">
          <svg v-if="isExpanded == false" class="folder-collapse" viewBox="0 0 20 20">
            <path :d="FileMgrSvgs.folder_collapse_close" />
          </svg>
          <svg v-if="isExpanded == true" class="folder-collapse" viewBox="0 0 20 20">
            <path :d="FileMgrSvgs.folder_collapse_open" />
          </svg>
        </button>
        <svg v-if="isExpanded == false" class="folder-icon" viewBox="0 0 24 24">
          <path :d="FileMgrSvgs.folder_close" />
        </svg>
        <svg v-if="isExpanded == true" class="folder-icon" viewBox="0 0 24 24">
          <path :d="FileMgrSvgs.folder_open" />
        </svg>
        <span class="file-manager-node-name">{{ node.name }}</span>
      </span>
      <!-- 如果是文件，只显示文件图标和名称 -->
      <span v-else>
        <svg
          v-if="fileExtension == '.md'"
          class="file-icon"
          style="fill: #ff9100"
          viewBox="0 0 16 10"
        >
          <path :d="FileMgrSvgs.md_file_svg" />
        </svg>
        <svg
          v-if="fileExtension == '.png'"
          class="file-icon"
          style="fill: #ff00ff"
          viewBox="0 0 24 24"
        >
          <path :d="FileMgrSvgs.png_file_svg" />
        </svg>
        <svg
          v-if="fileExtension == '.jpg'"
          class="file-icon"
          style="fill: #a846b9"
          viewBox="0 0 24 24"
        >
          <path :d="FileMgrSvgs.jpg_file_svg" />
        </svg>
        <span class="file-manager-node-name">{{ node.name }}</span>
      </span>
    </div>
    <!-- 如果当前是文件夹并且已经展开，递归显示子节点 -->
    <div v-if="node.type === 'folder' && isExpanded">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.id"
        v-model:is-expanded="child.isExpanded"
        v-model:file-extension="child.fileExtension"
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
      fileExtension: string
      isDirectory: boolean
      isIndented: boolean
      isExpanded: boolean
      children?: {
        id: never
        name: string
        path: string
        fileExtension: string
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
  },
  fileExtension: {
    type: String,
    // eslint-disable-next-line vue/valid-define-props
    default:
      '<path d="M13 9V3.5L18.5 9M6 2c-1.11 0-2 .89-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z"/>'
  }
})

const FileMgrSvgs = {
  file_icon: 'm10 17 5-5-5-5v10Z',
  folder_collapse_close: 'm10 17 5-5-5-5v10Z',
  folder_collapse_open: 'm7 10 5 5 5-5H7Z',
  folder_close:
    'M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z',
  folder_open:
    'M19 20H4a2 2 0 0 1-2-2V6c0-1.11.89-2 2-2h6l2 2h7a2 2 0 0 1 2 2H4v10l2.14-8h17.07l-2.28 8.5c-.23.87-1.01 1.5-1.93 1.5Z',
  md_file_svg:
    'M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3ZM9 11V5H7L5.5 7 4 5H2v6h2V8l1.5 1.92L7 8v3Zm2.99.5L14.5 8H13V5h-2v3H9.5Z',
  png_file_svg:
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 11.5c0 .8-.7 1.5-1.5 1.5h-1v2H5V9h2.5c.8 0 1.5.7 1.5 1.5v1m5 3.5h-1.5l-1-2.5V15H10V9h1.5l1 2.5V9H14v6m5-4.5h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2h.1m-12.5 0h1v1h-1v-1Z',
  jpg_file_svg:
    'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 13.5c0 1.1-.9 1.5-2 1.5s-2-.4-2-1.5V12h1.5v1.5h1V9H9v4.5m5-2c0 .8-.7 1.5-1.5 1.5h-1v2H10V9h2.5c.8 0 1.5.7 1.5 1.5v1m5-1h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2m-7.4 0h1v1h-1v-1Z'
}

// eslint-disable-next-line vue/no-dupe-keys
const isExpanded = ref(false) // 控制文件夹是否展开
const toggleFolder = () => {
  isExpanded.value = !isExpanded.value
}

function handleFileSelect(node) {
  const fileInfo: FileProperties = {
    name: node.name,
    path: node.path,
    type: 'file',
    content: ''
  }
  window.electron.ipcRenderer.send('open-select-file', fileInfo)
}

function handleClick(node) {
  if (node.type === 'file' && node.name.endsWith('.md')) {
    handleFileSelect(node)
  }
}
</script>

<style scoped>
.indented {
  margin-left: 1em; /* 设置缩进 */
}

.file-tree-node {
  overflow: hidden;
  height: 100%;
  line-height: 1.6;
  white-space: nowrap;
}

.node-content {
  overflow: hidden;
}

.file-manager-node-name {
  font-size: 12pt;
  margin-left: 4px;
  white-space: nowrap;
  overflow: hidden;
}

.file-icon {
  width: 16px;
  height: 16px;
  overflow: hidden;
  margin-left: 30px;
}

.folder-icon {
  width: 16px;
  height: 16px;
  overflow: hidden;
  fill: #dcb67a;
}

.folder-collapse {
  width: 20px;
  height: 20px;
  overflow: hidden;
  fill: #414853;
}
</style>
