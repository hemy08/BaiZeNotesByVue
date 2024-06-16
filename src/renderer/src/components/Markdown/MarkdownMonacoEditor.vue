<template>
  <div ref="monacoEditorContainer" class="monaco-editor-container"></div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount, defineEmits, defineProps } from 'vue'
import EventBus from '../../event-bus'
import { Range } from 'monaco-editor'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// const store = useStore()

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

    global.mdEditor = editorInstance
  }
})

window.electron.ipcRenderer.on('monaco-insert-text-block-templates', (_, context: string) => {
  if (context) {
    insertTextAfterCursor(editorInstance, context)
  }
})

// 定义一个函数来插入字符串
function insertTextAfterCursor(editor: monaco.editor.IStandaloneCodeEditor, textToInsert: string) {
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

// 假设 editor 是您已经初始化的 Monaco Editor 实例
function updateConvertFontHeaderFormat(
  editor: monaco.editor.IStandaloneCodeEditor,
  header: string
) {
  // 获取当前光标的位置，确保位置存在
  const cursorPosition = editor.getPosition()
  if (!cursorPosition) return
  // 获取当前光标所在行的行号
  const lineNumber = cursorPosition.lineNumber
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  // 计算插入位置（行首）
  const insertPosition = new monaco.Position(lineNumber, 1)
  // 获取光标所在行的内容
  const lineContent = model.getLineContent(lineNumber)

  // 编写插入的内容，获取整行内容，如果行首是#开头的，替换掉
  const headers = ['# ', '## ', '### ', '#### ', '##### ', '###### ']
  const insertHead = headers[parseInt(header.charAt(1)) - 1] || ''
  let textToInsert = ''
  // 前面有#的，替换掉
  if (lineContent.trim().startsWith('#') && lineContent.length > 1) {
    // 如果文字目标lever和当前level一样，去掉前面的#
    if (lineContent.trim().startsWith(insertHead)) {
      textToInsert = lineContent.replace(insertHead, '')
    } else {
      textToInsert = lineContent.replace(/^#+ |\n|$/, insertHead)
    }
  } else {
    textToInsert = insertHead + lineContent.trim()
  }
  // 创建一个编辑操作，将字符串插入到光标之后
  const edit = {
    range: new monaco.Range(
      insertPosition.lineNumber,
      1,
      insertPosition.lineNumber,
      model.getLineMaxColumn(lineNumber)
    ), // 这是一个空范围，表示插入位置
    text: textToInsert, // 要插入的文本
    forceMoveMarkers: true // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('convertToHeader', [edit])
}

const styleHandlers = {
  underline(content: string) {
    if (content.startsWith('<u>') && content.endsWith('</u>')) {
      return content.substring(3, content.length - 4)
    } else {
      return `<u>${content}</u>`
    }
  },
  bold(content: string) {
    if (content.startsWith('**') && content.endsWith('**')) {
      return content.substring(2, content.length - 2)
    } else {
      return `**${content}**`
    }
  },
  deleteline(content: string) {
    if (content.startsWith('~~') && content.endsWith('~~')) {
      return content.substring(2, content.length - 2)
    } else {
      return `~~${content}~~`
    }
  }
}

function updateHandleFontStyleCommon(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) return
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return

  let newText = ''
  // 获取选择内容的起始和结束位置，前后增加三个字符的选择
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  const lineLength = model.getLineLength(endLineNumber)
  const start = Math.max(1, startColumn - 3)
  let end = Math.min(lineLength + 1, endColumn + 3)
  if (style.toLowerCase() == 'underline') {
    end = Math.min(lineLength + 1, endColumn + 4)
  }
  // 获取偏移后的字符
  const selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
  const content = model.getValueInRange(selectRange)
  const handler = styleHandlers[style.toLowerCase()]
  if (handler) {
    newText = handler(content)
  }
  // 创建一个编辑操作，将字符串插入到光标之后
  const edit = {
    range: selection, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: false // 如果需要，强制移动标记（如断点）
  }

  editor.executeEdits('updateHandleFontStyleCommon', [edit])
}

function updateHandleFontStyle(
  editor: monaco.editor.IStandaloneCodeEditor,
  startStr: string,
  endStr: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    insertTextAfterCursor(editor, startStr + endStr)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: Range = selection
  const selectedText = model.getValueInRange(selection)
  // 选择的部分就有*
  let newText: string
  if (selectedText.startsWith(startStr) && selectedText.endsWith(endStr)) {
    newText = selectedText.substring(startStr.length, selectedText.length - endStr.length)
  } else {
    // 选择的部分没有*，向前后增加三个字符
    const lineLength = model.getLineLength(endLineNumber)
    const start = Math.max(1, startColumn - startStr.length)
    const end = Math.min(lineLength + 1, endColumn + endStr.length)
    selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
    const content = model.getValueInRange(selectRange)
    // 三个*，说明文字本来是加粗倾斜的，去掉倾斜
    if (content.startsWith(startStr) && content.endsWith(endStr)) {
      newText = content.substring(startStr.length, content.length - endStr.length)
    } else {
      selectRange = selection
      newText = `${startStr}${selectedText}${endStr}`
    }
  }

  const edit = {
    range: selectRange, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: false // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('updateHandleFontItalic', [edit])
}

function updateHandleFontItalic(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  if (style.toLowerCase() != 'italic') {
    return
  }
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    insertTextAfterCursor(editor, '**')
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: Range = selection
  const selectedText = model.getValueInRange(selection)
  // 选择的部分就有*
  let newText: string
  if (selectedText.startsWith('***') && selectedText.endsWith('***')) {
    newText = selectedText.substring(1, selectedText.length - 1)
  } else if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
    newText = `*${selectedText}*`
  } else if (selectedText.startsWith('*') && selectedText.endsWith('*')) {
    newText = selectedText.substring(1, selectedText.length - 1)
  } else {
    // 选择的部分没有*，向前后增加三个字符
    const lineLength = model.getLineLength(endLineNumber)
    let start = Math.max(1, startColumn - 3)
    let end = Math.min(lineLength + 1, endColumn + 3)
    selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
    let content = model.getValueInRange(selectRange)
    // 三个*，说明文字本来是加粗倾斜的，去掉倾斜
    if (content.startsWith('***') && content.endsWith('***')) {
      newText = content.substring(1, content.length - 1)
    } else {
      start = Math.max(1, startColumn - 2)
      end = Math.min(lineLength + 1, endColumn + 2)
      selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
      content = model.getValueInRange(selectRange)
      // 两个*号，说明文字本身是加粗的，加上倾斜符
      if (content.startsWith('**') && content.endsWith('**')) {
        newText = `*${content}*`
      } else {
        // 一个*号，说明文字本身是倾斜的，去掉倾斜符
        start = Math.max(1, startColumn - 1)
        end = Math.min(lineLength + 1, endColumn + 1)
        selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
        content = model.getValueInRange(selectRange)
        if (content.startsWith('*') && content.endsWith('*')) {
          newText = content.substring(1, content.length - 1)
        } else {
          selectRange = selection
          const selectedText = model.getValueInRange(selection)
          newText = `*${selectedText}*`
        }
      }
    }
  }

  const edit = {
    range: selectRange, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: false // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('updateHandleFontItalic', [edit])
}

const fontStyleHandleFuncMap = {
  fontfamily(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return updateHandleFontStyleCommon(editor, style)
  },
  fontsize(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return updateHandleFontStyleCommon(editor, style)
  },
  underline(editor: monaco.editor.IStandaloneCodeEditor) {
    return updateHandleFontStyle(editor, '<u>', '</u>')
  },
  bold(editor: monaco.editor.IStandaloneCodeEditor) {
    return updateHandleFontStyle(editor, '**', '**')
  },
  deleteline(editor: monaco.editor.IStandaloneCodeEditor) {
    return updateHandleFontStyle(editor, '~~', '~~')
  },
  italic(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return updateHandleFontItalic(editor, style)
  }
}
// 假设 editor 是您已经初始化的 Monaco Editor 实例
function updateFontFormat(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  const handler = fontStyleHandleFuncMap[style.toLowerCase()]
  if (handler) {
    handler(editor, style.toLowerCase())
  }
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
  EventBus.$on('monaco-editor-update-header-format', (value: string) => {
    updateConvertFontHeaderFormat(editorInstance, value)
  })
  EventBus.$on('monaco-editor-update-font-format', (value: string) => {
    updateFontFormat(editorInstance, value)
  })

  EventBus.$on('monaco-editor-insert-text', (value: string) => {
    insertTextAfterCursor(editorInstance, value)
  })

  onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-update-header-format', (value: string) => {
      updateConvertFontHeaderFormat(editorInstance, value)
    })
    EventBus.$off('monaco-editor-update-font-format', (value: string) => {
      updateFontFormat(editorInstance, value)
    })
    EventBus.$off('monaco-editor-update-font-format', (value: string) => {
      insertTextAfterCursor(editorInstance, value)
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
