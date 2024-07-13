import { BrowserWindow, ipcMain } from 'electron'
import { katexRenderToString } from '../utils/KatexRender'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'

let customMathTextDialog: Electron.BrowserWindow | null = null

export function ShowMathTextDialog(mainWindow: Electron.BrowserWindow) {
  if (customMathTextDialog) {
    digcom.ShowAlreadyExistDialog()
    return
  }
  createMathTextDialog(mainWindow)
}

const latexInit =
  '傅里叶级数公式：x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)'

// 创建一个自定义对话框的函数
function createMathTextDialog(mainWindow: Electron.BrowserWindow) {
  customMathTextDialog = new BrowserWindow({
    width: 1280,
    height: 550,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '插入数学公式',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!customMathTextDialog) {
    return
  }

  customMathTextDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customMathTextDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(makeMathTextDialogHtml())}`
  )
  //customMathTextDialog.loadFile(join(__dirname, '../renderer/src/dialogs/KatexEditDialog.html'))

  // 当窗口关闭时，清除引用
  customMathTextDialog.on('closed', () => {
    ipcMain.removeListener('dialog-math-line-text-btn-insert', processMathLineTextInsert)
    ipcMain.removeListener('dialog-math-block-text-btn-insert', processMathBlockTextInsert)
    ipcMain.removeListener('dialog-math-text-btn-cancel', () => {})
    customMathTextDialog = null
  })

  // 显示窗口
  customMathTextDialog.show()

  function exitCustomFontDialog() {
    if (customMathTextDialog) {
      ipcMain.removeListener('dialog-math-line-text-btn-insert', processMathLineTextInsert)
      ipcMain.removeListener('dialog-math-block-text-btn-insert', processMathBlockTextInsert)
      ipcMain.removeListener('dialog-math-math-text-btn-insert', processMathCodeBlockInsert)
      ipcMain.removeListener('dialog-math-katex-text-btn-insert', processMathCodeBlockInsert)
      ipcMain.removeListener('dialog-math-latex-text-btn-insert', processMathCodeBlockInsert)
      ipcMain.removeListener('dialog-math-text-btn-cancel', () => {})
      customMathTextDialog.close()
      customMathTextDialog = null
    }
  }

  function processMathLineTextInsert(_, mathText) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', mathText + '\n')
    exitCustomFontDialog()
  }

  function processMathBlockTextInsert(_, mathText) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', mathText + '\n')
    exitCustomFontDialog()
  }

  function processMathCodeBlockInsert(_, mathText) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', mathText)
    exitCustomFontDialog()
  }

  ipcMain.on('dialog-math-line-text-btn-insert', processMathLineTextInsert)
  ipcMain.on('dialog-math-block-text-btn-insert', processMathBlockTextInsert)
  ipcMain.on('dialog-math-math-text-btn-insert', processMathCodeBlockInsert)
  ipcMain.on('dialog-math-katex-text-btn-insert', processMathCodeBlockInsert)
  ipcMain.on('dialog-math-latex-text-btn-insert', processMathCodeBlockInsert)
  ipcMain.on('dialog-math-text-btn-cancel', () => {
    exitCustomFontDialog()
  })

  ipcMain.on('sync-katex-render-message', (event, arg) => {
    if (arg == '') {
      event.returnValue = katexRenderToString(latexInit)
    } else {
      event.returnValue = katexRenderToString(arg)
    }
  })
}

function createKatexPreview(doc: Document): HTMLElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.cssText = 'flex-direction:row'

  const divLabel = doc.createElement('div')
  const previewLabel = doc.createElement('label')
  previewLabel.style.cssText = 'width:10px;margin-left:20px;'
  previewLabel.textContent = '预览区域'
  divLabel.appendChild(previewLabel)

  const divPreview = doc.createElement('div')
  divPreview.style.cssText = 'font-size: 2em;overflow-wrap:break-word;word-break: break-all'
  divPreview.id = 'katex-preview'

  eleDiv.appendChild(divLabel)
  eleDiv.appendChild(divPreview)
  return eleDiv
}

function createKatexEditor(doc: Document): HTMLElement {
  const eleDiv = doc.createElement('div')
  eleDiv.style.cssText = 'margin-top:10px'

  const divLabel = doc.createElement('div')
  const inputLabel = doc.createElement('label')
  inputLabel.style.cssText = 'width:10px;margin-top:10px;margin-left:20px;'
  inputLabel.textContent =
    '公式编辑：傅里叶级数公式：x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)'
  divLabel.appendChild(inputLabel)

  const divTextArea = doc.createElement('div')
  const textArea = doc.createElement('textarea')
  textArea.className = 'text-input'
  textArea.id = 'textInput'
  textArea.placeholder =
    'x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)'
  divTextArea.appendChild(textArea)

  eleDiv.appendChild(divLabel)
  eleDiv.appendChild(divTextArea)
  return eleDiv
}

function createKatexContainer(doc: Document): HTMLElement {
  const divContainer = doc.createElement('div')
  divContainer.id = 'katex-container'

  const divLine = doc.createElement('div')
  divLine.style.cssText =
    'width:1200px;height:2px;margin-top:10px;margin-left:20px;color:black;background-color:black'

  divContainer.appendChild(createKatexPreview(doc))
  divContainer.appendChild(divLine)
  divContainer.appendChild(createKatexEditor(doc))
  return divContainer
}

function createButtonList(doc: Document): HTMLElement {
  const buttons: digcom.Button[] = [
    { id: 'insert-math-line', text: '插入行内公式' },
    { id: 'insert-math-block', text: '插入公式块' },
    { id: 'insert-math-math', text: '插入Math' },
    { id: 'insert-math-katex', text: '插入Katex' },
    { id: 'insert-math-latex', text: '插入Latex' },
    { id: 'cancel-insert-math', text: '取消编辑' }
  ]

  const btnList = digcom.NewButtonList(doc, buttons)
  btnList.className = 'btn-list-style'
  return btnList
}

function makeMathTextDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>数学公式编辑</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    #textInput {width:1200px;height:100px;overflow-y:auto;margin-left:20px;margin-top:10px;flex-direction:column}
    #katex-preview {width:1200px;height:250px;display:flex;justify-content:center;align-items:center}
    .btn-list-style {width:1200px;margin-top:20px; display:flex; justify-content:center;align-items:center;gap: 50px}
    .katex-html {position: absolute;left: -9999px}`
  document.head.appendChild(webDivStyle)

  const divContainer = createKatexContainer(document)
  document.body.appendChild(divContainer)

  const btnList = createButtonList(document)
  document.body.appendChild(btnList)

  const eleScript = document.createElement('script')
  eleScript.textContent = `
    const { ipcRenderer } = require('electron');
    let latexData = ''
    const result = ipcRenderer.sendSync('sync-katex-render-message', latexData);
    document.getElementById("katex-preview").innerHTML = result
    document.getElementById("textInput").textContent = latexData
    // 处理textInput的input事件，获取内容，渲染后进行显示
    function updateTextInput(event) {
      let inputText = event.target.value
      let html = ''
      try {
        html = ipcRenderer.sendSync('sync-katex-render-message', inputText);
      } catch (error) {html = latex}
      document.getElementById("katex-preview").innerHTML = html
      latexData = event.target.value
    }
    // 监控textInput的input事件
    document.getElementById('textInput').addEventListener('input', updateTextInput);
    document.getElementById('insert-math-line').onclick = function(e) {
      ipcRenderer.send('dialog-math-line-text-btn-insert', '$' + latexData + '$')
    }
    document.getElementById('insert-math-block').onclick = function(e) {
      ipcRenderer.send('dialog-math-block-text-btn-insert', '$$\\r\\n' + latexData + '\\r\\n$$\\r\\n')
    }
    document.getElementById('insert-math-math').onclick = function(e) {
      ipcRenderer.send('dialog-math-math-text-btn-insert', '\`\`\`math\\r\\n' +  latexData + '\\r\\n\`\`\`\\r\\n')
    }
    document.getElementById('insert-math-katex').onclick = function(e) {
      ipcRenderer.send('dialog-math-katex-text-btn-insert', '\`\`\`katex\\r\\n' + latexData + '\\r\\n\`\`\`\\r\\n')
    }
    document.getElementById('insert-math-latex').onclick = function(e) {
      ipcRenderer.send('dialog-math-latex-text-btn-insert', '\`\`\`latex\\r\\n' + latexData + '\\r\\n\`\`\`\\r\\n')
    }
    document.getElementById('cancel-insert-math').onclick = function(e) {
      ipcRenderer.send('dialog-math-text-btn-cancel')
    }`

  document.body.appendChild(eleScript)
  return document.documentElement.outerHTML
}
