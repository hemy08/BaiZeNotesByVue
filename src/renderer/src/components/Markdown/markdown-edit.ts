import mermaid from 'mermaid'
import { Range } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import EventBus from '../../event-bus'
import MarkdownIt from 'markdown-it'

// 定义一个函数来插入字符串
export function EditInsTextAfterCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
  textToInsert: string
) {
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
export function EditCvtToHeader(editor: monaco.editor.IStandaloneCodeEditor, header: string) {
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

function editUpdateFontStyleCommon(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
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

  editor.executeEdits('editUpdateFontStyleCommon', [edit])
}

function editUpdateFontStyle(
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
  editor.executeEdits('editUpdateFontStyle', [edit])
}

function editSetFontItalic(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  if (style.toLowerCase() != 'italic') {
    return
  }
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
  editor.executeEdits('editSetFontItalic', [edit])
}

function editSetFontAlign(
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

  const edit = {
    range: selection, // 这是一个空范围，表示插入位置
    text: newText, // 要插入的文本
    forceMoveMarkers: true // 如果需要，强制移动标记（如断点）
  }
  editor.executeEdits('editSetFontAlign', [edit])
}

const fontStyleHandleFuncMap = {
  fontfamily(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return editUpdateFontStyleCommon(editor, style)
  },
  fontsize(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return editUpdateFontStyleCommon(editor, style)
  },
  underline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '<u>', '</u>')
  },
  bold(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '**', '**')
  },
  deleteline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '~~', '~~')
  },
  codeline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '`', '`')
  },
  mathline(editor: monaco.editor.IStandaloneCodeEditor) {
    return editUpdateFontStyle(editor, '$', '$')
  },
  italic(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
    return editSetFontItalic(editor, style)
  },
  alignleft(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: left;">\r\n\r\n', '\r\n\r\n</p>')
  },
  aligncenter(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: center;">\r\n', '\r\n</p>')
  },
  alignjustify(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: justify;width: 100%">\r\n', '\r\n</p>')
  },
  alignright(editor: monaco.editor.IStandaloneCodeEditor) {
    return editSetFontAlign(editor, '<p style="text-align: right;">\r\n', '\r\n</p>')
  }
}

// 假设 editor 是您已经初始化的 Monaco Editor 实例
export function EditSetFontStyle(editor: monaco.editor.IStandaloneCodeEditor, style: string) {
  const handler = fontStyleHandleFuncMap[style.toLowerCase()]
  if (handler) {
    handler(editor, style.toLowerCase())
  }
}

export class hemyMarkdown {
  editor: monaco.editor.IStandaloneCodeEditor

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor
  }

  SetEditor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor
  }

  GetEditor(): monaco.editor.IStandaloneCodeEditor {
    return this.editor
  }

  SetFontStyle(style: string) {
    EditSetFontStyle(this.editor, style)
  }

  CvtToHeader(header: string) {
    EditCvtToHeader(this.editor, header)
  }

  InsertAfterCursor(textToInsert: string) {
    EditInsTextAfterCursor(this.editor, textToInsert)
  }

  PreMermaidRender(text: string): Promise<string> {
    return preRenderMermaidProc(text)
  }
}

function generateRandomNumberString(length: number): string {
  let result = ''
  const characters = '0123456789'
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

function removeMermaidDiv(mermaidId: string) {
  const divElement = document.getElementById('d' + mermaidId)
  if (divElement) {
    divElement.remove()
  }
}

async function mermaidRender(graphDefinition: string): Promise<string> {
  const mermaidId = 'mermaid' + generateRandomNumberString(10)
  try {
    const renderSvg = await mermaid.render(mermaidId, graphDefinition)
    // 删除mermaid.render过程中增加的div
    removeMermaidDiv(mermaidId)
    return Promise.resolve(
      '<div><pre class="mermaid"><code style="height: auto;display: flex">' +
        renderSvg.svg +
        '</code></pre></div>'
    )
  } catch (error) {
    console.log('mermaidRender error', error)
  }
  removeMermaidDiv(mermaidId)
  return ''
}

export async function preRenderMermaidProc(text: string): Promise<string> {
  // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```mermaid([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const renderedSvg = await mermaidRender(match[1])
    renderResult = renderResult.replace(match[0], renderedSvg)
  }

  return renderResult
}

export function PreMarkdownRender(text: string): Promise<string> {
  return preRenderMermaidProc(text)
}

interface markdownTOC {
  level: string
  text: string
  lineNumber: number
}

export function ParserMarkdownChapters(md: MarkdownIt, text: string) {
  // 提取大纲
  const headings: markdownTOC[] = []
  const mdTokens = md.parse(text, [])
  console.log('markdown-it tokens', mdTokens)
  mdTokens.forEach((token) => {
    if (token.type === 'heading_open') {
      const healing: markdownTOC = {
        level: token.tag,
        text: '',
        lineNumber: 0
      }

      if (token.map) {
        healing.lineNumber = token.map[1]
      }

      let nextToken = mdTokens[mdTokens.indexOf(token) + 1]
      while (nextToken && nextToken.type !== 'heading_close') {
        if (nextToken.type === 'inline' && nextToken.children) {
          nextToken.children.forEach((child) => {
            if (child.type === 'text') {
              healing.text += child.content
            }
          })
        }
        nextToken = mdTokens[mdTokens.indexOf(nextToken) + 1]
      }

      headings.push(healing)
    }
  })
  EventBus.$emit('monaco-editor-chapters', headings)
}

export function PostMarkdownRender(text: string): string {
  return text
}
