<template>
  <div ref="monacoEditorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount, defineEmits, defineProps } from 'vue'
import EventBus from '../../event-bus'
import { EditSetFontStyle, EditCvtToHeader, EditInsTextAfterCursor } from './markdown-edit'

const props = defineProps({
  // 代码内容
  code: {
    type: String,
    default: 'test'
  },
  // 编辑器语言
  language: {
    type: String,
    default: 'typescript'
  },
  // 编辑器宽度
  editorAreaWidth: {
    type: String,
    default: '50%'
  },
  // 编辑器主题
  theme: {
    type: String,
    default: 'vs-light' // 或 'vs-dark'
  }
})

const monacoEditorContainer = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor
// 定义 emit 函数
const emit = defineEmits(['update:code'])

// 初始化编辑器
onMounted(() => {
  if (monacoEditorContainer.value) {
    monacoEditorContainer.value.style.width = '100%'
    monacoEditorContainer.value.style.height = '100%'
    editorInstance = monaco.editor.create(monacoEditorContainer.value, {
      value: props.code,
      language: props.language,
      theme: props.theme,
      wordWrap: 'on', // 启用自动换行
      automaticLayout: true, // 设置自动布局为 true
      minimap: {
        enabled: false //关闭小型缩略图，它显示整个文档的概览，并且允许用户快速导航到文档的不同部分。
      },
      lineNumbers: 'on'
    })

    editorInstance.setPosition({ lineNumber: 1, column: 1 })

    // 监听编辑器内容变化
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance != null) {
        const context = editorInstance.getValue()
        emit('update:code', context)
        EventBus.$emit('monaco-editor-content-length', context.length)
      }
    })

    // 监听光标位置
    editorInstance.onDidChangeCursorPosition((e) => {
      if (editorInstance != null) {
        EventBus.$emit('monaco-editor-cursor-position', e.position)
      }
    })

    global.mdEditor = editorInstance
  }
})

window.electron.ipcRenderer.on('monaco-insert-text-block-templates', (_, context: string) => {
  if (context) {
    EditInsTextAfterCursor(editorInstance, context)
  }
})

// 监听代码内容变化
watch(
  () => props.code,
  (newCode) => {
    //console.log('newCode length', newCode.length)
    if (editorInstance) {
      //console.log('newCode length', newCode.length)
      editorInstance.setValue(newCode)
    }
  }
)

// 监听父组件区域变化
watch(
  () => props.editorAreaWidth,
  (newWidth) => {
    if (editorInstance && monacoEditorContainer.value) {
      monacoEditorContainer.value.style.width = newWidth
      //console.log('newWidth', newWidth)
      editorInstance.layout()
    }
  }
)

onMounted(() => {
  EventBus.$on('monaco-editor-update-header-format', (value: string) => {
    EditCvtToHeader(editorInstance, value)
  })
  EventBus.$on('monaco-editor-update-font-format', (value: string) => {
    EditSetFontStyle(editorInstance, value)
  })

  EventBus.$on('monaco-editor-insert-text', (value: string) => {
    EditInsTextAfterCursor(editorInstance, value)
  })

  onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-update-header-format', (value: string) => {
      EditCvtToHeader(editorInstance, value)
    })
    EventBus.$off('monaco-editor-update-font-format', (value: string) => {
      EditSetFontStyle(editorInstance, value)
    })
    EventBus.$off('monaco-editor-insert-text', (value: string) => {
      EditInsTextAfterCursor(editorInstance, value)
    })
  })
})

onMounted(() => {
  function handleEditCompResize() {
    if (editorInstance && monacoEditorContainer.value) {
      // 使用 Monaco Editor 的 layout 方法来更新大小
      editorInstance.layout()
    }
  }

  window.addEventListener('resize', handleEditCompResize)

  // 销毁编辑器实例
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleEditCompResize)
    if (editorInstance) {
      editorInstance.dispose()
    }
  })
})
</script>

<style scoped>
.monaco-editor-container {
  height: 100%;
  width: 100%;
  overflow: auto;
  /* 隐藏水平滚动条 */
  overflow-x: hidden;
  overflow-y: hidden;
}
</style>
