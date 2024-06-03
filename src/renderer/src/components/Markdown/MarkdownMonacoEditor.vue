<template>
  <div ref="monacoEditorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount, defineEmits, defineProps } from 'vue'

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
  // 编辑器主题
  theme: {
    type: String,
    default: 'vs-light' // 或 'vs-dark'
  }
})

const monacoEditorContainer = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
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
      minimap: {
        enabled: false //关闭小型缩略图，它显示整个文档的概览，并且允许用户快速导航到文档的不同部分。
      },
      lineNumbers: 'on'
    })

    editorInstance.setPosition({ lineNumber: 1, column: 1 })

    // 监听编辑器内容变化
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance != null) {
        emit('update:code', editorInstance.getValue())
      }
    })
  }
})

window.electron.ipcRenderer.on('monaco-insert-text-block-templates', (_, context: string) => {
  if (context) {
    insertTextAfterCursor(editorInstance, context)
  }
})

// 定义一个函数来插入字符串
function insertTextAfterCursor(editor, textToInsert: string) {
  const position = editor.getPosition()
  if (!position) return

  // 创建一个编辑操作，将字符串插入到光标之后
  const edit = {
    range: new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    ), // 这是一个空范围，表示插入位置
    text: textToInsert, // 要插入的文本
    forceMoveMarkers: true // 如果需要，强制移动标记（如断点）
  }

  // 执行编辑操作
  editor.executeEdits('', [edit])
}

// 监听代码内容变化
watch(
  () => props.code,
  (newCode) => {
    if (editorInstance) {
      editorInstance.setValue(newCode)
    }
  }
)

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
      editorInstance = null
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
