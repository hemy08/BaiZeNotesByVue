import * as monaco from 'monaco-editor'

export function replaceSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  value: string,
  moveMarks: boolean,
  range: monaco.Range
) {
  const selectionRange: monaco.Range = range || editor.getSelection()
  if (selectionRange === null) return

  const edit = {
    range: new monaco.Range(
      selectionRange.startLineNumber,
      selectionRange.startColumn,
      selectionRange.endLineNumber,
      selectionRange.endColumn
    ),
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
export function OnInsertAfterCursor(
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
function editorOnChangeHeaderLevel(editor: monaco.editor.IStandaloneCodeEditor, header: string) {
  const position = editor.getPosition()
  if (!position) return

  const model = editor.getModel()
  if (!model) return

  // 获取光标所在行的内容
  ConvertContextToHeader(editor, position, model, header)
}

function updateSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  selection: monaco.Selection,
  model: monaco.editor.IModel,
  prefix: string,
  suffix: string
) {
  let newText = ''
  if (!selection || selection.isEmpty()) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  // 选择的部分没有*，向前后增加三个字符
  if (!model) return
  const lineLength = model.getLineLength(endLineNumber)
  const start = Math.max(1, startColumn - prefix.length)
  const end = Math.min(lineLength + 1, endColumn + suffix.length)
  let selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
  const content = model.getValueInRange(selectRange)
  // 三个*，说明文字本来是加粗倾斜的，去掉倾斜
  if (content.startsWith(prefix) && content.endsWith(suffix)) {
    newText = content.substring(prefix.length, content.length - suffix.length)
  } else {
    selectRange = selection
    newText = `${prefix}${content}${suffix}`
  }

  replaceSelection(editor, newText, false, selectRange)
}

function editorOnSetFontItalic(editor: monaco.editor.IStandaloneCodeEditor) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    OnInsertAfterCursor(editor, '**')
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection
  let selectRange: monaco.Range = selection
  const selectedText = model.getValueInRange(selection)
  // 选择的部分就有*
  let newText = ''
  if (selectedText.startsWith('***') && selectedText.endsWith('***')) {
    newText = selectedText.substring(1, selectedText.length - 1)
  } else if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
    newText = `*${selectedText}*`
  } else if (selectedText.startsWith('*') && selectedText.endsWith('*')) {
    newText = selectedText.substring(1, selectedText.length - 1)
  } else {
    // 选择的部分没有*，向前后增加三个字符
    const lineLength = model.getLineLength(endLineNumber)
    const start = Math.max(1, startColumn - 3)
    const end = Math.min(lineLength + 1, endColumn + 3)
    selectRange = new monaco.Range(startLineNumber, start, endLineNumber, end)
    const content = model.getValueInRange(selectRange)
    // 三个*，说明文字本来是加粗倾斜的，去掉倾斜
    if (content.startsWith('***') && content.endsWith('***')) {
      newText = content.substring(1, content.length - 1)
    } else {
      updateSelection(editor, selection, model, '*', '*')
      return
    }
  }

  replaceSelection(editor, newText, false, selectRange)
}

function editorOnUpdateFontStyle(
  editor: monaco.editor.IStandaloneCodeEditor,
  prefix: string,
  suffix: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    OnInsertAfterCursor(editor, prefix + suffix)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return
  const selectRange: monaco.Range = selection
  const selectedText = model.getValueInRange(selection)
  // 选择的部分就有*
  let newText = ''
  if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix)) {
    newText = selectedText.substring(prefix.length, selectedText.length - suffix.length)
    replaceSelection(editor, newText, false, selectRange)
  } else {
    updateSelection(editor, selection, model, prefix, suffix)
  }
}

function editorOnPrefixSuffix(
  editor: monaco.editor.IStandaloneCodeEditor,
  prefix: string,
  suffix: string
) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    OnInsertAfterCursor(editor, prefix + suffix)
    return
  }
  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return

  const selectedText = model.getValueInRange(selection)
  const newText = `${prefix}${selectedText}${suffix}`

  replaceSelection(editor, newText, true, selection)
}

function editorOnPasteHandle(editor: monaco.editor.IStandaloneCodeEditor, context: string) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    OnInsertAfterCursor(editor, context)
    return
  }

  replaceSelection(editor, context, true, selection)
}


function editorOnFontQuote(editor: monaco.editor.IStandaloneCodeEditor) {
  // 获取当前的选择范围
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) {
    // 没有选择，则直接插入字符串
    OnInsertAfterCursor(editor, '> ')
    return
  }

  // 获取编辑器模型, 确保模型存在
  const model = editor.getModel()
  if (!model) return

  // 有选择，每行行首增加 >
  console.log('selection', selection)
  let newText = ''
  for (let line = selection.startLineNumber; line < selection.endLineNumber; line++) {
    const context = model.getLineContent(line)
    newText = newText + '> ' + context + '\r\n'
  }
  console.log('newText', newText)
  replaceSelection(editor, newText, false, selection as monaco.Range)
}

const ctxMaps = {
  bold: { prefix: '**', suffix: '**' },
  deleteline: { prefix: '~~', suffix: '~~' },
  underline: { prefix: '<u>', suffix: '</u>' },
  codeline: { prefix: '`', suffix: '`' },
  codeblock: { prefix: '\r\n```\r\n', suffix: '\r\n```\r\n' },
  mathline: { prefix: '$', suffix: '$' },
  mathblock: { prefix: '\r\n$$\r\n', suffix: '\r\n$$\r\n' },
  alignleft: { prefix: '<p style="text-align: left;">\r\n\r\n', suffix: '\r\n\r\n</p>\r\n' },
  aligncenter: { prefix: '<p style="text-align: center;">\r\n', suffix: '\r\n</p>\r\n' },
  alignjustify: { prefix: '<p style="text-align: justify">\r\n', suffix: '\r\n</p>\r\n' },
  alignright: { prefix: '<p style="text-align: right;">\r\n', suffix: '\r\n</p>\r\n' },
  keyboard: { prefix: '<kbd>', suffix: '</kbd>' },
  link: { prefix: '[]()', suffix: '' },
  fontsuper: { prefix: '<sup>', suffix: '</sup>' },
  fontsub: { prefix: '<sub>', suffix: '</sub>' },
  linescan: { prefix: '\r\n\r\n---------------\r\n\r\n', suffix: '' },
  lineenter: { prefix: '\r\n\r\n', suffix: '' },
  linelinks: { prefix: '[]()', suffix: '' },
  tasklists: { prefix: '\r\n- [ ]', suffix: '' },
  listnumbered: { prefix: '\r\n1. ', suffix: '' },
  listbulleted: { prefix: '\r\n- []()', suffix: '' },
  fontquote: { prefix: '> ', suffix: '' }
}

export const EventHandleMaps = {
  h1(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnChangeHeaderLevel(editor, 'h1')
  },
  h2(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnChangeHeaderLevel(editor, 'h2')
  },
  h3(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnChangeHeaderLevel(editor, 'h3')
  },
  h4(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnChangeHeaderLevel(editor, 'h4')
  },
  h5(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnChangeHeaderLevel(editor, 'h5')
  },
  h6(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnChangeHeaderLevel(editor, 'h6')
  },
  bold(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnUpdateFontStyle(editor, ctxMaps['bold'].prefix, ctxMaps['bold'].suffix)
  },
  italic(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnSetFontItalic(editor)
  },
  deleteline(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnUpdateFontStyle(editor, ctxMaps['deleteline'].prefix, ctxMaps['deleteline'].suffix)
  },
  underline(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnUpdateFontStyle(editor, ctxMaps['underline'].prefix, ctxMaps['underline'].suffix)
  },
  fontquote(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnFontQuote(editor)
  },
  fontsuper(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['fontsuper'].prefix, ctxMaps['fontsuper'].suffix)
  },
  fontsub(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['fontsub'].prefix, ctxMaps['fontsub'].suffix)
  },
  alignleft(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['alignleft'].prefix, ctxMaps['alignleft'].suffix)
  },
  aligncenter(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['aligncenter'].prefix, ctxMaps['aligncenter'].suffix)
  },
  alignjustify(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['alignjustify'].prefix, ctxMaps['alignjustify'].suffix)
  },
  alignright(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['alignright'].prefix, ctxMaps['alignright'].suffix)
  },
  listnumbered(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['listnumbered'].prefix)
  },
  listbulleted(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['listbulleted'].prefix)
  },
  linescan(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['linescan'].prefix)
  },
  lineenter(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['lineenter'].prefix)
  },
  codeline(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnUpdateFontStyle(editor, ctxMaps['codeline'].prefix, ctxMaps['codeline'].suffix)
  },
  codeblock(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['codeblock'].prefix, ctxMaps['codeblock'].suffix)
  },
  mathline(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnUpdateFontStyle(editor, ctxMaps['mathline'].prefix, ctxMaps['mathline'].suffix)
  },
  mathblock(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['mathblock'].prefix, ctxMaps['mathblock'].suffix)
  },
  keyboard(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['keyboard'].prefix, ctxMaps['keyboard'].suffix)
  },
  link(editor: monaco.editor.IStandaloneCodeEditor) {
    editorOnPrefixSuffix(editor, ctxMaps['link'].prefix, ctxMaps['link'].suffix)
  },
  linelinks(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['linelinks'].prefix)
  },
  weblinks(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['linelinks'].prefix)
  },
  tasklists(editor: monaco.editor.IStandaloneCodeEditor) {
    OnInsertAfterCursor(editor, ctxMaps['tasklists'].prefix)
  },
  paste(editor: monaco.editor.IStandaloneCodeEditor, context: string) {
    editorOnPasteHandle(editor, context)
  },
  insertimage(context: string) {
    window.electron.ipcRenderer.send('monaco-editor-container-insert-image', context)
  }
}

// 假设 editor 是您已经初始化的 Monaco Editor 实例
export function UpdateContextFormat(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  const handler = EventHandleMaps[style.toLowerCase()]
  if (handler) {
    handler(editor, style.toLowerCase())
  }
}
