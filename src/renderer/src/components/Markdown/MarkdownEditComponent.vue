<template>
  <div id="md-edit-component" class="md-edit-component" :style="{ width: monacoEditorWidth }">
    <MdMonacoEdit
      v-model="markdownEditorCode"
      :code="initialCodeContent"
      :view-width="monacoEditorWidth"
      @update:code="handleMarkdownCodeUpdate"
    />
  </div>
  <div id="resizer-md" class="resizer-md" @mousedown="onEditorResizerMouseDown($event)"></div>
  <div id="md-preview" class="md-preview" :style="{ width: editPreviewAreaWidth }">
    <MdPreview :editor-content="markdownEditorContent" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, onBeforeUnmount, ref } from 'vue'
import MdMonacoEdit from './MarkdownMonacoEditor.vue'
import MdPreview from './MarkdownPreviewComponent.vue'

// 使用 ref 来创建响应式引用
const markdownEditorCode = ref('')
const markdownEditorContent = ref('')
const monacoEditorWidth = ref('900px')
let initialCodeContent = ''
let editorMouseStart = 0

// 存储窗口宽度
const windowWidth = ref(window.innerWidth)

// 预览区域样式设置
const editPreviewAreaWidth = computed(() => {
  // 注意这里使用了 parseInt 移除 'px' 后缀，并且确保计算是有效的
  const editAreaWidth = parseInt(monacoEditorWidth.value.replace('px', ''), 10)
  // 减去 editAreaWidth以及可能的间隙（例如 2px）
  const previewAreaWidth = windowWidth.value - editAreaWidth - 2
  return previewAreaWidth + 'px'
})

function onEditorResizerMouseDown(e: MouseEvent) {
  editorMouseStart = e.clientX
  window.addEventListener('mousemove', onEditorMouseMove)
  window.addEventListener('mouseup', onEditorMouseUp)
}

function onEditorMouseMove(e: MouseEvent) {
  const moveX = e.clientX - editorMouseStart
  const newWidth = parseInt(monacoEditorWidth.value, 10) + moveX
  // 限制最小和最大宽度（可选）
  const minWidth = 100
  const maxWidth = window.innerWidth * 0.7
  if (newWidth > maxWidth) {
    monacoEditorWidth.value = maxWidth + 'px'
  } else if (newWidth < minWidth) {
    monacoEditorWidth.value = minWidth + 'px'
  } else {
    monacoEditorWidth.value = newWidth + 'px'
  }
  editorMouseStart = e.clientX
}

function onEditorMouseUp() {
  window.removeEventListener('mousemove', onEditorMouseMove)
  window.removeEventListener('mouseup', onEditorMouseUp)
}

onUnmounted(() => {
  window.removeEventListener('resize', updateWindowWidth)
})

// 监听窗口宽度变化
function updateWindowWidth() {
  windowWidth.value = window.innerWidth
}

window.addEventListener('resize', updateWindowWidth)

function handleMarkdownCodeUpdate(newValue: string) {
  window.electron.ipcRenderer.send('update-select-file-content', newValue)
  markdownEditorContent.value = newValue
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

onMounted(() => {
  function handleKeyDownEvent(event) {
    // console.log('keyDown', event)
    if (event.ctrlKey && event.key === 's') {
      window.electron.ipcRenderer.send('save-file-content-to-disk', markdownEditorContent.value)
    }
  }

  window.addEventListener('keydown', handleKeyDownEvent)

  // 销毁编辑器实例
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDownEvent)
  })
})
</script>

<style scoped>
#md-edit-component {
  margin: 0;
  display: flex;
  float: left;
  height: 100%;
}

#resizer-md {
  cursor: ew-resize;
  color: blue;
  display: flex;
  background-color: blue;
  float: left;
  width: 2px;
}

#md-preview {
  background-color: white;
  color: black;
  display: flex;
  float: left;
  height: 100%;
}
</style>
