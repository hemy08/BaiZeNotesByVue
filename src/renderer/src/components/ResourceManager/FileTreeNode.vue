<template>
  <div class="file-tree-node" :class="{ indented: isIndented }">
    <div class="node-content" @click="handleClick(node)">
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <span v-if="node.type === 'folder'">
        <button style="border: none; background-color: transparent" @click="toggleFolder">
          <svg v-if="isExpanded == false" class="folder-collapse" viewBox="0 0 20 20">
            ${{ globalFileMgrSvg.folder_collapse_close }}
          </svg>
          <svg v-if="isExpanded == true" class="folder-collapse" viewBox="0 0 20 20">
            ${{ globalFileMgrSvg.folder_collapse_open }}
          </svg>
        </button>
        <svg v-if="isExpanded == false" class="folder-icon" viewBox="0 0 24 24">
          ${{ globalFileMgrSvg.folder_close }}
        </svg>
        <svg v-if="isExpanded == true" class="folder-icon" viewBox="0 0 24 24">
          ${{ globalFileMgrSvg.folder_open }}
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
          ${{ globalFileMgrSvg.md_file_svg }}
        </svg>
        <svg
          v-if="fileExtension == '.png'"
          class="file-icon"
          style="fill: #ff00ff"
          viewBox="0 0 24 24"
        >
          ${{ globalFileMgrSvg.png_file_svg }}
        </svg>
        <svg
          v-if="fileExtension == '.jpg'"
          class="file-icon"
          style="fill: #a846b9"
          viewBox="0 0 24 24"
        >
          ${{ globalFileMgrSvg.jpg_file_svg }}
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
import { ref, defineProps, PropType, onMounted } from 'vue'

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let globalFileMgrSvg
onMounted(() => {
  try {
    globalFileMgrSvg = window.electron.ipcRenderer.sendSync('get-global-file-manager-svg-data')
    // console.log(globalData.message); // 输出: Hello from main process!
  } catch (error) {
    console.error('Error fetching global data:', error)
  }
})

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
