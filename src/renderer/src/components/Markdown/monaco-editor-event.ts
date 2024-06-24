import * as monaco from 'monaco-editor'
import EventBus from '../../event-bus'

function replaceSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  value: string,
  moveMarks: boolean,
  selection: monaco.Selection
) {
  const selectionRange = selection || editor.getSelection()
  if (selectionRange === null) return

  const edit = {
    range: selectionRange,
    text: value,
    forceMoveMarkers: moveMarks
  }
  editor.executeEdits('', [edit])
}

/*
function getSelectionText(
  editor: monaco.editor.IStandaloneCodeEditor,
  selection: monaco.Selection
): string {
  if (!selection || selection.isEmpty()) return ''
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return ''

  return model.getValueInRange(selection)
}*/

function ConvertContextToHeader(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: monaco.Position,
  model: monaco.editor.ITextModel,
  selection: monaco.Selection,
  header: string
) {
  // 获取当前光标所在行的行号
  const lineNumber = position.lineNumber
  // 获取光标所在行的内容
  const lineContent = model.getLineContent(lineNumber)
  // 编写插入的内容，获取整行内容，如果行首是#开头的，替换掉
  const headers = ['# ', '## ', '### ', '#### ', '##### ', '###### ']
  const insertHead = headers[parseInt(header.charAt(1)) - 1] || ''
  let selectionText = ''
  // 前面有#的，替换掉
  if (lineContent.trim().startsWith('#') && lineContent.length > 1) {
    // 如果文字目标lever和当前level一样，去掉前面的#
    if (lineContent.trim().startsWith(insertHead)) {
      selectionText = lineContent.replace(insertHead, '')
    } else {
      selectionText = lineContent.replace(/^#+ |\n|$/, insertHead)
    }
  } else {
    selectionText = insertHead + lineContent.trim()
  }
  replaceSelection(editor, selectionText, true, <monaco.Selection>{
    ...selection,
    startColumn: 0,
    endColumn: model.getLineMaxColumn(lineNumber)
  })
}

const handleMaps = {
  h1: ConvertContextToHeader,
  h2: ConvertContextToHeader,
  h3: ConvertContextToHeader,
  h4: ConvertContextToHeader,
  h5: ConvertContextToHeader,
  h6: ConvertContextToHeader
}

function shortCutSetHeader(editor: monaco.editor.IStandaloneCodeEditor, header: string) {
  const position = editor.getPosition()
  if (!position) return
  const model = editor.getModel()

  if (!model) return
  const selection = editor.getSelection()

  if (!selection) return
  handleMaps[header](editor, position, model, selection, header)
}

function registerEditorKeyMaps(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit1, function () {
    shortCutSetHeader(editor, 'h1')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit2, function () {
    shortCutSetHeader(editor, 'h2')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit3, function () {
    shortCutSetHeader(editor, 'h3')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit4, function () {
    shortCutSetHeader(editor, 'h4')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit5, function () {
    shortCutSetHeader(editor, 'h5')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit6, function () {
    shortCutSetHeader(editor, 'h6')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, function () {
    shortCutSetHeader(editor, 'bold')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, function () {
    shortCutSetHeader(editor, 'italic')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, function () {
    shortCutSetHeader(editor, 'deleteline')
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, function () {
    shortCutSetHeader(editor, 'underline')
  })
}

export function monacoEditorEvent(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.setPosition({ lineNumber: 1, column: 1 })

  // 监听光标位置
  editor.onDidChangeCursorPosition((e) => {
    if (editor != null) {
      EventBus.$emit('monaco-editor-cursor-position', e.position)
    }
  })

  editor.onDidPaste((e) => {
    console.log('onDidPaste ', e)
  })

  registerEditorKeyMaps(editor)
}
