<template>
  <div ref="monacoEditorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, defineEmits, defineProps } from 'vue'

// 引入 Monaco Editor
import * as monaco from 'monaco-editor'

const props = defineProps({
  // 代码内容
  code: {
    type: String,
    default: 'test'
  },
  // 编辑器语言
  language: {
    type: String,
    default: 'javascript'
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

    console.log(editorInstance)

    // 监听编辑器内容变化
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance != null) {
        emit('update:code', editorInstance.getValue())
      }
    })
  }
})

// 监听代码内容变化
watch(
  () => props.code,
  (newCode) => {
    if (editorInstance) {
      editorInstance.setValue(newCode)
    }
  }
)

// 销毁编辑器实例
onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})
</script>

<style scoped>
.monaco-editor-container {
  height: 100%;
  width: 100%;
  margin: 0;
  overflow: auto;
  /* 隐藏水平滚动条 */
  overflow-x: hidden;
}
</style>
