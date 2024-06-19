<template>
  <div id="file-tree-node" class="file-tree-node" :class="{ indented: isIndented }">
    <div
      id="node-content"
      class="node-content"
      @click="handleClick(node)"
      @contextmenu.prevent="onContextMenu($event, node)"
    >
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <span v-if="node.type === 'folder'">
        <button style="border: none; background-color: transparent" @click="toggleFolder">
          <svg
            v-if="getSvg(isExpanded, 'collapse')"
            :class="['folder-collapse', getSvg(isExpanded, 'collapse').className]"
            :style="getSvg(isExpanded, 'collapse').style"
            :viewBox="getSvg(isExpanded, 'collapse').viewBox"
          >
            <path :d="getSvg(isExpanded, 'collapse').path" />
          </svg>
        </button>
        <svg
          v-if="getSvg(isExpanded, 'folder')"
          :class="['folder-icon', getSvg(isExpanded, 'folder').className]"
          :style="getSvg(isExpanded, 'folder').style"
          :viewBox="getSvg(isExpanded, 'folder').viewBox"
        >
          <path :d="getSvg(isExpanded, 'folder').path" />
        </svg>
      </span>
      <!-- 如果是文件，只显示文件图标和名称 -->
      <span v-else>
        <svg
          v-if="fileExtension && getSvg(false, fileExtension)"
          :class="['file-icon', getSvg(false, fileExtension).className]"
          :style="getSvg(false, fileExtension).style"
          :viewBox="getSvg(false, fileExtension).viewBox"
        >
          <path :d="getSvg(false, fileExtension).path" />
        </svg>
      </span>
      <span id="file-manager-node" class="file-manager-node">{{ node.name }}</span>
    </div>
    <!-- 如果当前是文件夹并且已经展开，递归显示子节点 -->
    <div v-if="node.type === 'folder' && isExpanded" id="file-subtree" class="file-subtree">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.id"
        v-model:is-expanded="child.isExpanded"
        v-model:file-extension="child.fileExtension"
        :node="child"
        :is-indented="true"
        @contextmenu:node="onContextMenu($event, node)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, PropType } from 'vue'
import { FileSysItem, getFileMgrSvg, handleContextMenu } from './resource-manager'

// 定义 props 类型
// @ts-ignore eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  node: {
    type: Object as PropType<FileSysItem>,
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
    default: '.md'
  },
  hasContextMenu: {
    type: Boolean,
    default: false
  }
})

function getSvg(isExpanded: boolean, extension: string) {
  return getFileMgrSvg(isExpanded, extension)
}

// eslint-disable-next-line vue/no-dupe-keys
const isExpanded = ref(false) // 控制文件夹是否展开
const toggleFolder = () => {
  isExpanded.value = !isExpanded.value
}

function handleFileSelect(node: FileSysItem) {
  const fileInfo: FileProperties = {
    name: node.name,
    path: node.path,
    type: 'file',
    content: ''
  }
  window.electron.ipcRenderer.send('open-select-file', fileInfo)
}

function handleClick(node: FileSysItem) {
  if (node.type === 'file' && node.name.endsWith('.md')) {
    handleFileSelect(node)
  }
}

function onContextMenu(e: MouseEvent, node: FileSysItem) {
  console.log('node', node)
  handleContextMenu(e, node)
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

.file-manager-node {
  font-size: 12pt;
  margin-left: 4px;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
}

.file-manager-node:hover {
  background-color: #e1e4e8;
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
}

.folder-collapse {
  width: 20px;
  height: 20px;
  overflow: hidden;
}

.custom-context-menu {
  display: none;
  border: 1px solid #eeeeee;
  border-radius: 10px;
  background-color: #fefefe;
  width: 200px;
  position: absolute; /* 相对于最近的已定位祖先元素（或body）定位 */
  z-index: 1000; /* 确保显示在其他元素之上 */
}
</style>
