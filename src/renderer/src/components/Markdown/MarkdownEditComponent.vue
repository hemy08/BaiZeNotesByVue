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
        :style="{ left: resizerPosition }"
        @mousedown="startResizing"
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import MdMonacoEdit from './MarkdownMonacoEditor.vue'
import MdPreview from './MarkdownPreviewComponent.vue'
import EventBus from '../../event-bus'

const props = defineProps({
    editorPreviewWidth: {
        type: String,
        default: '100%'
    }
})

const windowWidth = ref(props.editorPreviewWidth)
const isShowEditArea = ref(true)
const isShowPreviewArea = ref(true)
const isShowResizer = ref(true)
const resizerWidth = ref(4)
const resizerPosition = ref('50%')
const initialCodeContent = ref('')
const markdownEditorCode = ref('')
const markdownEditorContent = ref('')

const windowWidthValue = computed(() => {
    return parseFloat(windowWidth.value)
})

const monacoEditorWidthPx = computed(() => {
    return resizerPosition.value
})

const monacoEditorWidth = computed(() => {
    return resizerPosition.value
})

const editPreviewAreaWidth = computed(() => {
    const editAreaWidth = parseFloat(resizerPosition.value) / 100
    const previewAreaWidth = 1 - editAreaWidth - resizerWidth.value / windowWidthValue.value
    return pxToPercent(previewAreaWidth * windowWidthValue.value, windowWidthValue.value)
})

const editPreviewAreaLeft = computed(() => {
    const editAreaWidth = parseFloat(resizerPosition.value) / 100
    const resizerOffset = resizerWidth.value / windowWidthValue.value
    return pxToPercent((editAreaWidth + resizerOffset) * windowWidthValue.value, windowWidthValue.value)
})

function pxToPercent(px: number, totalPx: number): string {
    return `${(px / totalPx) * 100}%`
}

let isResizing = false
let startX = 0
let startWidth = 0

function startResizing(event: MouseEvent) {
    isResizing = true
    startX = event.clientX
    startWidth = parseFloat(resizerPosition.value)
    document.addEventListener('mousemove', handleResizing)
    document.addEventListener('mouseup', stopResizing)
}

function handleResizing(event: MouseEvent) {
    if (!isResizing) return
    const deltaX = event.clientX - startX
    const deltaPercent = (deltaX / windowWidthValue.value) * 100
    let newWidth = startWidth + deltaPercent
    const minWidth = 10
    const maxWidth = 90
    if (newWidth < minWidth) newWidth = minWidth
    if (newWidth > maxWidth) newWidth = maxWidth
    resizerPosition.value = `${newWidth}%`
}

function stopResizing() {
    isResizing = false
    document.removeEventListener('mousemove', handleResizing)
    document.removeEventListener('mouseup', stopResizing)
}

function handleMarkdownCodeUpdate(newValue: string) {
    //console.log('handleMarkdownCodeUpdate', newValue)
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
    // 文件加载后通知编辑器重新布局
    setTimeout(() => {
      EventBus.$emit('monaco-editor-relayout')
    }, 150)
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
        resizerPosition.value = '50%'
    } else {
        isShowResizer.value = false
        if (edit) {
            resizerPosition.value = '100%'
        } else {
            resizerPosition.value = '0%'
        }
    }

    // 视图切换后，通知Monaco编辑器重新布局
    setTimeout(() => {
        EventBus.$emit('monaco-editor-relayout')
    }, 100)
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

// 定义事件处理函数
const handleSaveFileContent = () => {
    window.electron.ipcRenderer.send('save-file-content-to-disk', markdownEditorContent.value)
}

const handleUseTemplate = (value: string) => {
    onHandleNewContent(value)
}

function handleKeyDownEvent(event) {
    // console.log('keyDown', event)
    if (event.ctrlKey && event.key === 's') {
        window.electron.ipcRenderer.send(
            'save-file-content-to-disk',
            markdownEditorContent.value
        )
    }
}

// 监听窗口大小变化
const handleResize = () => {
    const parentElement = document.getElementById('md-edit-component')?.parentElement
    if (parentElement) {
        windowWidth.value = parentElement.clientWidth.toString()
    }
}

onMounted(() => {
    // 初始化容器宽度
    const parentElement = document.getElementById('md-edit-component')?.parentElement
    if (parentElement) {
        windowWidth.value = parentElement.clientWidth.toString()
    }

    EventBus.$on('monaco-editor-save-file-content-to-disk', handleSaveFileContent)
    EventBus.$on('baize:monaco-editor-use-template', handleUseTemplate)


    window.addEventListener('resize', handleResize)
})

// 销毁编辑器实例
onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDownEvent)
    window.removeEventListener('resize', handleResize)
    EventBus.$off('monaco-editor-save-file-content-to-disk', handleSaveFileContent)
    EventBus.$off('baize:monaco-editor-use-template', handleUseTemplate)
})
</script>

<style scoped>
#md-edit-component {
    margin: 0;
    padding: 0;
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    overflow: hidden;
}

#resizer-md {
    cursor: ew-resize;
    position: absolute;
    top: 0;
    height: 100%;
    background-color: var(--theme-border-color, #00b0ff);
    width: 4px;
    z-index: 10;
}

.md-preview {
    background-color: var(--theme-card-background);
    color: var(--theme-text-color);
    position: absolute;
    top: 0;
    overflow: hidden;
    height: 100%;
}
</style>
