<template>
  <div class="file-tree-node" :class="{ indented: isIndented }">
    <div class="node-content" @click="handleClick(node)">
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <div v-if="node.type === 'folder'">
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
        <span
          id="file-manager-folder"
          class="file-manager-node-name"
          @contextmenu.prevent="showContextMenu($event, node)"
          >{{ node.name }}</span
        >
      </div>
      <!-- 如果是文件，只显示文件图标和名称 -->
      <div v-else>
        <svg
          v-if="fileExtension && getSvg(isExpanded, fileExtension)"
          :class="['file-icon', getSvg(isExpanded, fileExtension).className]"
          :style="getSvg(isExpanded, fileExtension).style"
          :viewBox="getSvg(isExpanded, fileExtension).viewBox"
        >
          <path :d="getSvg(isExpanded, fileExtension).path" />
        </svg>
        <span
          id="file-manager-file"
          class="file-manager-node-name"
          @contextmenu.prevent="showContextMenu($event, node)"
          >{{ node.name }}</span
        >
      </div>
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
    <FileMgrContextMenu
      v-if="isContextMenuVisible"
      :node="currentContextMenuNode"
      @click.self="hideContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, PropType } from 'vue'
import FileMgrContextMenu from './FileMgrContextMenu.vue'
import { FileSysItem, FileMgrSvgs } from './resource-manager'

const isContextMenuVisible = ref(false)
let currentContextMenuNode: FileSysItem

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
  }
})

function getSvg(isExpanded: boolean, extension: string) {
  if (extension == 'folder') {
    return isExpanded ? FileMgrSvgs['folder-open'] : FileMgrSvgs['folder-close']
  } else if (extension == 'collapse') {
    return isExpanded ? FileMgrSvgs['folder-collapse-open'] : FileMgrSvgs['folder-collapse-close']
  } else {
    return FileMgrSvgs[extension.toLowerCase()] || FileMgrSvgs['default']
  }
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

const hideContextMenu = () => {
  isContextMenuVisible.value = false
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function showContextMenu(event, node: FileSysItem) {
  hideContextMenu()
  console.log('event', event)
  console.log('node', node)
  isContextMenuVisible.value = true
  currentContextMenuNode = node
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
}

.folder-collapse {
  width: 20px;
  height: 20px;
  overflow: hidden;
}
</style>
