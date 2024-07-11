<template>
  <div
    id="monaco-editor-container"
    ref="monacoEditorContainer"
    class="monaco-editor-container"
  ></div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount, defineProps } from 'vue'
import EventBus from '../../event-bus'
import * as editor from './hemy-editor'
import { MarkdownTOC } from '../hemy'

// 定义 emit 函数
const emit = defineEmits(['update:code'])

const props = defineProps({
  // 代码内容
  code: {
    type: String,
    default: 'test'
  },
  // 编辑器宽度
  editorAreaWidth: {
    type: String,
    default: '50%'
  }
})

const monacoEditorContainer = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor

// 初始化编辑器
onMounted(() => {
  if (monacoEditorContainer.value) {
    monacoEditorContainer.value.style.width = '100%'
    monacoEditorContainer.value.style.height = '100%'
    editorInstance = monaco.editor.create(
      monacoEditorContainer.value,
      editor.Options,
      editor.Override
    )

    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance != null) {
        const context = editorInstance.getValue()
        emit('update:code', context)
        EventBus.$emit('monaco-editor-statusbar-content-length', context.length)
      }
    })

    editor.DidChange(editorInstance)
    editor.KeyMaps(editorInstance)
    editor.AddActions(editorInstance)
    editor.LoadScript()
  }

  onBeforeUnmount(() => {
    editorInstance.dispose()
  })
})

window.electron.ipcRenderer.on('monaco-editor-insert-after-cursor', (_, context: string) => {
  if (context) {
    editor.InsertAfterCursor(editorInstance, context)
  }
})

window.electron.ipcRenderer.on('monaco-insert-text-block-templates', (_, context: string) => {
  if (context) {
    editor.InsertAfterCursor(editorInstance, context)
  }
})

window.electron.ipcRenderer.on(
  'monaco-editor-update-options',
  (_, option: string, newValue: string) => {
    editor.OptMaps[option](editorInstance, newValue)
  }
)

window.electron.ipcRenderer.on('monaco-editor-trigger-undo-redo', (_, option: string) => {
  editorInstance.trigger('keyboard', option, {})
})

// 监听代码内容变化
watch(
  () => props.code,
  (newCode) => {
    if (editorInstance) {
      if (newCode.length === 0) {
        newCode = '# '
      }
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
    editor.UpdateContext(editorInstance, value)
  })
  EventBus.$on('monaco-editor-update-font-format', (value: string) => {
    editor.UpdateContext(editorInstance, value)
  })
  EventBus.$on('monaco-editor-insert-text', (value: string) => {
    editor.InsertAfterCursor(editorInstance, value)
  })
  EventBus.$on('monaco-editor-locate-target-line', (item: MarkdownTOC) => {
    editorInstance.revealLines(
      item.lineNumber,
      item.lineNumber + 20,
      monaco.editor.ScrollType.Smooth
    )
  })

  onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-update-header-format', (value: string) => {
      editor.UpdateContext(editorInstance, value)
    })
    EventBus.$off('monaco-editor-update-font-format', (value: string) => {
      editor.UpdateContext(editorInstance, value)
    })
    EventBus.$on('monaco-editor-insert-text', (value: string) => {
      editor.InsertAfterCursor(editorInstance, value)
    })
    EventBus.$on('monaco-editor-locate-target-line', (value: string) => {
      editor.InsertAfterCursor(editorInstance, value)
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

  function handleScrollEvent(event) {
    console.log('handleScrollEvent', event)
    EventBus.$emit('monaco-editor-scroll-event', null)
  }

  editorInstance?.getDomNode()?.addEventListener('scroll', function () {
    console.log('scroll')
  })

  window.addEventListener('resize', handleEditCompResize)
  window.addEventListener('scroll', handleScrollEvent)

  // 销毁编辑器实例
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleEditCompResize)
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
