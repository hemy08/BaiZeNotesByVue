import * as myEditor from './hemy-editor'
import * as monaco from 'monaco-editor'

function EnterAction(editor: monaco.editor.IStandaloneCodeEditor, ...args) {
  // 获取鼠标当前位置
  const position = editor.getPosition()
  if (!position) return

  if (position.lineNumber <= 2) {
    myEditor.InsertAfterCursor(editor, '\r\n')
    return
  }

  const model = editor.getModel()
  if (!model) return

  const content = model.getLineContent(position.lineNumber)
  // 获取上一行内容，如果是- [开头，插入\r\n- []()
  // 获取上一行内容，如果是- 开头，插入\r\n-
  if (content.startsWith('- [')) {
    myEditor.InsertAfterCursor(editor, '\r\n- []()')
  } else if (content.startsWith('- ')) {
    myEditor.InsertAfterCursor(editor, '\r\n- ')
  } else {
    myEditor.replaceSelection(editor, '\r\n', position)
  }
}

export function MonacoEditorAddActions(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.addAction({
    id: 'hemy-custom-enter-action',
    label: 'Hemy Custom Enter Action',
    keybindings: [monaco.KeyCode.Enter], // 例如，绑定到 Shift + Enter
    // 回调函数
    run: EnterAction
  })
}
