<template>
  <div v-show="showFileExplorer" id="resource-manager-component" class="resource-manager-component">
    <div id="resizer-navi-tab-file-manager" class="resizer-navi-tab-file-manager"></div>
    <div id="file-manager" class="file-manager">
      <div id="file-tree">
        <FileTreeNode
          v-for="item in fileNodes"
          :key="item.id"
          :ref="`node-${item.id}`"
          v-model:is-expanded="item.isExpanded"
          v-model:file-extension="item.fileExtension"
          :is-indented="false"
          :node="item"
        />
      </div>
    </div>
  </div>
  <div v-show="showMarkdownToc" id="markdown-toc-component" class="markdown-toc-component">
    <div id="markdown-toc-heading">
      <div v-for="item in tocArray" :key="item.id" @click="scrollToSection(item)">
        <!-- 根据 level 添加适当的缩进 -->
        <span v-html="getIndentedText(item)"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FileTreeNode from './FileTreeNode.vue'
import { FileSysItem } from './resource-manager'
import EventBus from '../../event-bus'
import { MarkdownTOC } from '../hemy'

const showFileExplorer = ref(true)
const showMarkdownToc = ref(false)
const fileNodes = ref<FileSysItem[]>([])
const tocArray = ref<[]>([])

const props = defineProps({
  // 代码内容
  naviShow: {
    type: String,
    default: 'test'
  }
})

window.electron.ipcRenderer.on('file-system-data', (_, fileTree: string) => {
  try {
    // 更新响应式数据
    fileNodes.value = JSON.parse(fileTree) as FileSysItem[]
  } catch (error) {
    console.error('Error parsing file system data:', error)
  }
})

function SwitchResourceManager(value: string) {
  if (value == 'markdown-toc') {
    // 保存当前tree信息
    showMarkdownToc.value = true
    showFileExplorer.value = false
    EventBus.$emit('monaco-editor-get-chapters', true)
  } else if (value == 'file-explorer') {
    showFileExplorer.value = true
    showMarkdownToc.value = false
    console.log('monaco-editor-switch-explorer')
    EventBus.$emit('monaco-editor-switch-explorer', true)
  }
}

// 监听父组件切换
watch(
  () => props.naviShow,
  (value) => {
    SwitchResourceManager(value)
  }
)

function getIndentedText(item: MarkdownTOC) {
  // 返回带有缩进的文本
  const indent = '&nbsp;&nbsp;&nbsp;'.repeat(item.level.slice(1) * 2)
  return `${indent}${item.text}`
}

function scrollToSection(item: MarkdownTOC) {
  EventBus.$emit('monaco-editor-locate-target-line', item)
}

onMounted(() => {
  EventBus.$on('monaco-editor-chapters', (toc: MarkdownTOC[]) => {
    tocArray.value = toc
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

.markdown-toc-component {
  display: flex;
  flex-direction: row;
  background: ghostwhite;
  color: black;
  overflow: auto;
  width: auto;
  height: 100%;
}
</style>
