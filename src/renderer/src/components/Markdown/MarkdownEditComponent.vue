<template>
  <div
    v-show="isShowEditArea"
    id="md-edit-component"
    class="md-edit-component"
    :style="{ width: monacoEditorWidth }"
  >
    <MdMonacoEdit
      v-model="markdownEditorCode"
      :code="initialCodeContent"
      :editor-area-width="monacoEditorWidthPx"
      @update:code="handleMarkdownCodeUpdate"
    />
  </div>
  <div
    v-show="isShowResizer"
    id="resizer-md"
    class="resizer-md"
    :style="{ left: resizerLeft }"
    @mousedown="onEditorResizerMouseDown($event)"
  ></div>
  <div
    v-show="isShowPreviewArea"
    id="md-preview"
    class="md-preview"
    :style="{ width: editPreviewAreaWidth, left: editPreviewAreaLeft }"
  >
    <MdPreview :editor-content="markdownEditorContent" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, defineProps, watch } from 'vue'
import MdMonacoEdit from './MarkdownMonacoEditor.vue'
import MdPreview from './MarkdownPreviewComponent.vue'
import EventBus from '../../event-bus'

const props = defineProps({
  // 编辑器宽度
  editorPreviewWidth: {
    type: String,
    default: '100%'
  }
})

// 使用 ref 来创建响应式引用
const isShowEditArea = ref(true)
const isShowResizer = ref(true)
const isShowPreviewArea = ref(true)
const markdownEditorCode = ref('')
const markdownEditorContent = ref('')
const monacoEditorWidth = ref('50%')
const resizerWidth = ref(4)
const initialCodeContent = ref('# ')
let editorMouseStart = 0

// 存储窗口宽度
const windowWidth = ref(props.editorPreviewWidth)

// 假设 windowWidth.value 是视口宽度（以像素为单位）
// 转换函数，将像素值转换为百分比字符串
function pxToPercent(pxValue: number, totalWidth: number) {
  if (!totalWidth) return '0%' // 如果没有总宽度，则返回 0%
  return ((pxValue / totalWidth) * 100).toFixed(2) + '%' // 保留两位小数
}

// 预览区域宽度（百分比），基于 Monaco Editor 的宽度计算
const monacoEditorWidthPx = computed(() => {
  const windowWidthValue = parseInt(windowWidth.value.replace('px', ''), 10)
  return (parseFloat(monacoEditorWidth.value.replace('%', '')) / 100) * windowWidthValue + 'px'
})

// 预览区域宽度（百分比），基于 Monaco Editor 的宽度计算
const editPreviewAreaWidth = computed(() => {
  const windowWidthValue = parseInt(windowWidth.value.replace('px', ''), 10)
  const editAreaWidth = parseFloat(monacoEditorWidth.value.replace('%', '')) / 100
  const previewAreaWidth = 1 - editAreaWidth - resizerWidth.value / windowWidthValue
  //console.log('windowWidthValue', windowWidthValue)
  //console.log('previewAreaWidth', previewAreaWidth)
  return pxToPercent(previewAreaWidth * windowWidthValue, windowWidthValue)
})

// 预览区域左边距（百分比），基于 Monaco Editor 的宽度计算
const editPreviewAreaLeft = computed(() => {
  const windowWidthValue = parseInt(windowWidth.value.replace('px', ''), 10)
  const editAreaWidth = parseFloat(monacoEditorWidth.value.replace('%', '')) / 100
  return pxToPercent(
    (editAreaWidth + resizerWidth.value / windowWidthValue) * windowWidthValue,
    windowWidthValue
  )
})

// 分隔符左边距（百分比）
const resizerLeft = computed(() => {
  return monacoEditorWidth.value
})

function onEditorResizerMouseDown(e: MouseEvent) {
  editorMouseStart = e.clientX
  window.addEventListener('mousemove', onEditorMouseMove)
  window.addEventListener('mouseup', onEditorMouseUp)
}
// 编辑器大小调整逻辑（百分比）
function onEditorMouseMove(e: MouseEvent) {
  const windowWidthValue = parseInt(windowWidth.value.replace('px', ''), 10)
  const moveX = e.clientX - editorMouseStart
  // 将当前百分比宽度转换为像素值
  const currentWidthPx =
    (parseFloat(monacoEditorWidth.value.replace('%', '')) / 100) * windowWidthValue
  const newWidthPx = currentWidthPx + moveX

  // 转换为百分比
  let newWidthPercent = pxToPercent(newWidthPx, windowWidthValue)

  // 限制最小和最大宽度（百分比）
  const minWidthPercent = '20%'
  const maxWidthPercent = '70%'

  if (newWidthPercent > maxWidthPercent) {
    newWidthPercent = maxWidthPercent
  } else if (newWidthPercent < minWidthPercent) {
    newWidthPercent = minWidthPercent
  }

  // 更新 Monaco Editor 宽度
  monacoEditorWidth.value = newWidthPercent

  editorMouseStart = e.clientX
}

function onEditorMouseUp() {
  window.removeEventListener('mousemove', onEditorMouseMove)
  window.removeEventListener('mouseup', onEditorMouseUp)
}

function handleMarkdownCodeUpdate(newValue: string) {
  window.electron.ipcRenderer.send('update-select-file-content', newValue)
  markdownEditorContent.value = newValue
}

function onHandleNewContent(content: string) {
  if (content) {
    // 编辑区域显示时，传入
    if (isShowEditArea.value) {
      initialCodeContent.value = content
    }
    // 预览模式、编辑器/预览模式，才进行渲染
    if (isShowPreviewArea.value) {
      handleMarkdownCodeUpdate(content)
    }
  } else {
    // console.log('content bull')
    handleMarkdownCodeUpdate('\r\n')
  }
}

window.electron.ipcRenderer.on('show-selected-file-context', (_, content) => {
  EventBus.$emit('plugin-tools-container-show', false)
  onHandleNewContent(content)
})

window.electron.ipcRenderer.on('monaco-insert-writing-templates', (_, fileContent: string) => {
  onHandleNewContent(fileContent)
})

function onHandleEditorShow(edit: boolean, preview: boolean) {
  isShowEditArea.value = edit
  isShowPreviewArea.value = preview
  if (edit && preview) {
    isShowResizer.value = true
    monacoEditorWidth.value = '50%'
  } else {
    isShowResizer.value = false
    if (edit) {
      monacoEditorWidth.value = '100%'
    } else {
      monacoEditorWidth.value = '0%'
    }
  }
}

window.electron.ipcRenderer.on('markdown-edit-model', () => {
  onHandleEditorShow(true, false)
})

window.electron.ipcRenderer.on('markdown-preview-model', () => {
  onHandleEditorShow(false, true)
})

window.electron.ipcRenderer.on('markdown-edit-preview-model', () => {
  onHandleEditorShow(true, true)
})

watch(
  () => props.editorPreviewWidth,
  (newWidth) => {
    windowWidth.value = newWidth
  }
)

onMounted(() => {
  function handleKeyDownEvent(event) {
    // console.log('keyDown', event)
    if (event.ctrlKey && event.key === 's') {
      window.electron.ipcRenderer.send('save-file-content-to-disk', markdownEditorContent.value)
    } else if (event.ctrlKey && event.key === 'v') {
      console.log('event', event)
    }
  }

  function handleEditPaste(event) {
    event.preventDefault()
    const items = (event.clipboardData || global.clipboardData).items
    console.log('handleEditPaste', event.clipboardData)
    console.log('items', items)
  }

  window.addEventListener('keydown', handleKeyDownEvent)
  window.addEventListener('paste', handleEditPaste)

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
  background-color: blue;
  width: 4px;
}

.md-preview {
  background-color: white;
  color: black;
  display: flex;
  overflow: hidden;
  height: 100%;
}
</style>
