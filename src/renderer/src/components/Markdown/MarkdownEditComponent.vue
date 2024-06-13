<template>
  <div id="md-edit-component" class="md-edit-component" :style="mdEditComponentStyle">
    <MdMonacoEdit
      v-model="markdownEditorCode"
      :code="initialCodeContent"
      @update:code="handleMarkdownCodeUpdate"
    />
  </div>
  <div id="resizer-md" class="resizer-md">1</div>
  <div id="md-preview" class="md-preview" :style="mdPreviewComponentStyle">
    <MdPreview :editor-content="markdownEditorContent" />
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import MdMonacoEdit from './MarkdownMonacoEditor.vue'
import MdPreview from './MarkdownPreviewComponent.vue'

// 使用 ref 来创建响应式引用
const markdownEditorCode = ref('')
const markdownEditorContent = ref('')
let initialCodeContent = ''

// 存储窗口宽度
const windowWidth = ref(window.innerWidth)

onMounted(()=>{
  window.addEventListener('keydown', this.handleKeyDown);
})

onUnmounted(() => {
  window.removeEventListener('resize', updateWindowWidth)
})

// 监听窗口宽度变化
function updateWindowWidth() {
  windowWidth.value = window.innerWidth
}

window.addEventListener('resize', updateWindowWidth)

// 编辑区域大小计算
const mdEditComponentStyle = computed(() => {
  const editWidth = `${windowWidth.value * 0.5}px`
  return {
    width: editWidth,
    height: `100%`, // 视窗高度
    maxWidth: editWidth
  }
})

// 预览区域样式设置
const mdPreviewComponentStyle = computed(() => {
  const previewWidth = `${windowWidth.value * 0.5}px`
  return {
    width: previewWidth,
    height: '100%', // 视窗高度
    maxWidth: previewWidth
  }
})


function handleMarkdownCodeUpdate(newValue: string) {
  // window.electron.ipcRenderer.send('render-monaco-editor-content', newValue)
  markdownEditorContent.value = newValue
  CurrentActiveFile.content = newValue
}

window.electron.ipcRenderer.on('open-selected-file', (_, content) => {
  if (content) {
    initialCodeContent = content
    handleMarkdownCodeUpdate(content)
  } else {
    handleMarkdownCodeUpdate(initialCodeContent)
  }
})

window.electron.ipcRenderer.on('monaco-insert-writing-templates', (_, fileContent: string) => {
  if (fileContent) {
    initialCodeContent = fileContent
    handleMarkdownCodeUpdate(fileContent)
  } else {
    handleMarkdownCodeUpdate(initialCodeContent)
  }
})
</script>

<style scoped>
#md-edit-component {
  margin: 0;
  display: flex;
  float: left;
}

#resizer-md {
  cursor: col-resize;
  color: blue;
  display: flex;
  background-color: red;
  float: left;
  width: 2px;
}

#md-preview {
  background-color: white;
  color: black;
  display: flex;
  float: left;
}
</style>
