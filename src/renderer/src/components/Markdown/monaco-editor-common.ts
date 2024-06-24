import * as monaco from 'monaco-editor'

function replaceSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  value: string,
  moveMarks: boolean,
  range: monaco.Range
) {
  const selectionRange: monaco.Range = range || editor.getSelection()
  if (selectionRange === null) return

  const edit = {
    range: selectionRange,
    text: value,
    forceMoveMarkers: moveMarks
  }
  editor.executeEdits('', [edit])
}

function ConvertContextToHeader(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: monaco.Position,
  model: monaco.editor.ITextModel,
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
  replaceSelection(
    editor,
    selectionText,
    true,
    new monaco.Range(lineNumber, 0, lineNumber, model.getLineMaxColumn(lineNumber))
  )
}

// 定义一个函数来插入字符串
export function EditInsTextAfterCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
  textToInsert: string
) {
  const position = editor.getPosition()
  if (!position) return

  replaceSelection(
    editor,
    textToInsert,
    true,
    new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
  )
}

// 假设 editor 是您已经初始化的 Monaco Editor 实例
export function EditCvtToHeader(editor: monaco.editor.IStandaloneCodeEditor, header: string) {
  const position = editor.getPosition()
  if (!position) return

  const model = editor.getModel()
  if (!model) return

  // 获取光标所在行的内容
  ConvertContextToHeader(editor, position, model, header)
}

function EditSetFontItalic(editor: monaco.editor.IStandaloneCodeEditor) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    EditInsTextAfterCursor(editor, '**')
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: monaco.Range = selection
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

  replaceSelection(editor, newText, false, selectRange)
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

function EditUpdateFontStyleCommon(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
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
  replaceSelection(editor, newText, false, selectRange)
}

function EditUpdateFontStyle(
  editor: monaco.editor.IStandaloneCodeEditor,
  startStr: string,
  endStr: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    EditInsTextAfterCursor(editor, startStr + endStr)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: monaco.Range = selection
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

  replaceSelection(editor, newText, false, selectRange)
}

function EditSetFontAlign(
  editor: monaco.editor.IStandaloneCodeEditor,
  startStr: string,
  endStr: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    EditInsTextAfterCursor(editor, startStr + endStr)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return

  const selectedText = model.getValueInRange(selection)
  const newText = `${startStr}${selectedText}${endStr}`

  replaceSelection(editor, newText, true, selection)
}

export const EventHandleMaps = {
  fontfamily(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    EditUpdateFontStyleCommon(editor, style)
  },
  fontsize(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    EditUpdateFontStyleCommon(editor, style)
  },
  h1(editor: monaco.editor.IStandaloneCodeEditor) {
    EditCvtToHeader(editor, 'h1')
  },
  h2(editor: monaco.editor.IStandaloneCodeEditor) {
    EditCvtToHeader(editor, 'h2')
  },
  h3(editor: monaco.editor.IStandaloneCodeEditor) {
    EditCvtToHeader(editor, 'h3')
  },
  h4(editor: monaco.editor.IStandaloneCodeEditor) {
    EditCvtToHeader(editor, 'h4')
  },
  h5(editor: monaco.editor.IStandaloneCodeEditor) {
    EditCvtToHeader(editor, 'h5')
  },
  h6(editor: monaco.editor.IStandaloneCodeEditor) {
    EditCvtToHeader(editor, 'h6')
  },
  bold(editor: monaco.editor.IStandaloneCodeEditor) {
    EditUpdateFontStyle(editor, '**', '**')
  },
  italic(editor: monaco.editor.IStandaloneCodeEditor) {
    EditSetFontItalic(editor)
  },
  deleteline(editor: monaco.editor.IStandaloneCodeEditor) {
    EditUpdateFontStyle(editor, '~~', '~~')
  },
  underline(editor: monaco.editor.IStandaloneCodeEditor) {
    EditUpdateFontStyle(editor, '<u>', '</u>')
  },
  codeline(editor: monaco.editor.IStandaloneCodeEditor) {
    EditUpdateFontStyle(editor, '`', '`')
  },
  mathline(editor: monaco.editor.IStandaloneCodeEditor) {
    EditUpdateFontStyle(editor, '$', '$')
  },
  alignleft(editor: monaco.editor.IStandaloneCodeEditor) {
    EditSetFontAlign(editor, '<p style="text-align: left;">\r\n\r\n', '\r\n\r\n</p>')
  },
  aligncenter(editor: monaco.editor.IStandaloneCodeEditor) {
    EditSetFontAlign(editor, '<p style="text-align: center;">\r\n', '\r\n</p>')
  },
  alignjustify(editor: monaco.editor.IStandaloneCodeEditor) {
    EditSetFontAlign(editor, '<p style="text-align: justify;width: 100%">\r\n', '\r\n</p>')
  },
  alignright(editor: monaco.editor.IStandaloneCodeEditor) {
    EditSetFontAlign(editor, '<p style="text-align: right;">\r\n', '\r\n</p>')
  }
}

// 假设 editor 是您已经初始化的 Monaco Editor 实例
export function EditSetFontStyle(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  const handler = EventHandleMaps[style.toLowerCase()]
  if (handler) {
    handler(editor, style.toLowerCase())
  }
}
