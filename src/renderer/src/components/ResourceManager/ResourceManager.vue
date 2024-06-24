<template>
  <div v-if="showFileExplorer" id="resource-manager-component" class="resource-manager-component">
    <div id="resizer-navi-tab-file-manager" class="resizer-navi-tab-file-manager"></div>
    <div id="file-manager" class="file-manager">
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
  </div>
  <div v-if="showMarkdownToc">1111111</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FileTreeNode from './FileTreeNode.vue'
import { FileSysItem } from './resource-manager'
import EventBus from '../../event-bus'

const showFileExplorer = ref(true)
const showMarkdownToc = ref(false)
const fileSystemTree = ref<FileSysItem[]>([])

const props = defineProps({
  // 代码内容
  naviShow: {
    type: String,
    default: 'test'
  }
})

window.electron.ipcRenderer.on('file-system-data', (_, fileSystemData: string) => {
  try {
    // 更新响应式数据
    fileSystemTree.value = JSON.parse(fileSystemData) as FileSysItem[]
  } catch (error) {
    console.error('Error parsing file system data:', error)
  }
})

let fileTreeHtml = ''

// 监听父组件切换
watch(
  () => props.naviShow,
  (value) => {
    if (value == 'markdown-toc') {
      // 保存当前tree信息
      const fileTree = document.getElementById('.file-tree')
      if (fileTree) {
        fileTreeHtml = fileTree.innerHTML
      }
      console.log('fileTreeHtml', fileTreeHtml)
      showMarkdownToc.value = true
      showFileExplorer.value = false
      EventBus.$emit('monaco-editor-get-chapters', true)
    } else if (value == 'file-explorer') {
      showFileExplorer.value = true
      console.log('fileTreeHtml', fileTreeHtml)
      const fileTree = document.getElementById('.file-tree')
      if (fileTree) {
        console.log('fileTree.innerHTML', fileTree.innerHTML)
        fileTree.innerHTML = fileTreeHtml
      }
      showMarkdownToc.value = false
    }
  }
)

onMounted(() => {
  EventBus.$on('monaco-editor-chapters', (headings) => {
    console.log('headings', headings)
  })

  onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-chapters', () => {})
  })
})
</script>

<style scoped>
.resource-manager-component {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
}

.resizer-navi-tab-file-manager {
  width: 1px;
  height: 100%;
  background-color: #00b0ff;
  color: #00b0ff;
  fill: #00b0ff;
}

.file-manager {
  background: ghostwhite;
  color: black;
  overflow: auto;
  height: 100%;
  width: calc(100% - 1px);
}
</style>
