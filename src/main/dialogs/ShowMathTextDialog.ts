import { BrowserWindow, ipcMain, dialog } from 'electron'
import { katexRenderToString } from '../utils/KatexRender'
import { JSDOM } from 'jsdom'

let customMathTextDialog: Electron.BrowserWindow | null = null

export function ShowMathTextDialog(mainWindow: Electron.BrowserWindow) {
  if (customMathTextDialog !== null) {
    dialog.showMessageBox({
      title: `错误！`,
      type: 'info',
      message: '出错啦',
      detail: '已经存在一个公式编辑对话框了，请先关闭！',
      noLink: true,
      buttons: ['确定']
    })
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
  divLine.style.cssText = 'width:1200px;height:2px;margin-top:10px;margin-left:20px;color:black;background-color:black'

  divContainer.appendChild(createKatexPreview(doc))
  divContainer.appendChild(divLine)
  divContainer.appendChild(createKatexEditor(doc))
  return divContainer
}

function createButtonEle(doc: Document, id: string, text: string): HTMLButtonElement {
  const buttonEle = doc.createElement('button')
  buttonEle.id = id
  buttonEle.textContent = text
  return buttonEle
}

function createButtonList(doc: Document): HTMLElement {
  const eleDiv = doc.createElement('div')
  eleDiv.className = 'btn-list-style'
  eleDiv.appendChild(createButtonEle(doc, 'insert-math-line', '插入行内公式'))
  eleDiv.appendChild(createButtonEle(doc, 'insert-math-block', '插入公式块'))
  eleDiv.appendChild(createButtonEle(doc, 'insert-math-math', '插入Math'))
  eleDiv.appendChild(createButtonEle(doc, 'insert-math-katex', '插入Katex'))
  eleDiv.appendChild(createButtonEle(doc, 'insert-math-latex', '插入Latex'))
  eleDiv.appendChild(createButtonEle(doc, 'cancel-insert-math', '取消编辑'))
  return eleDiv
}

function makeMathTextDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>系统设置</title></head><body></body></html>`
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

/*
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mdMathTextDialogHtmlContext =
  '<!DOCTYPE html>\n' +
  '<html lang="zh">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8">\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '  <title>KaTeX公式编辑器</title>\n' +
  '  <link rel="stylesheet" href="../../../main/lib/Katex/katex.css">\n' +
  '  <style>\n' +
  '    #textInput {width:1200px;height:100px;overflow-y:auto;margin-left:20px;margin-top:10px;flex-direction:column}\n' +
  '    #katex-preview {width:1200px;height:250px;display:flex;justify-content:center;align-items:center}\n' +
  '    .btn-style {width:1200px;margin-top:20px; display:flex; justify-content:center;align-items:center;gap: 50px}\n' +
  '    .katex-html {position: absolute;left: -9999px}\n' +
  '  </style>\n' +
  '</head>\n' +
  '<body>\n' +
  '  <div id="katex-container">\n' +
  '    <div style="flex-direction:row">\n' +
  '      <div><label style="width:10px;margin-left:20px;">预览：</label></div>\n' +
  '      <div id="katex-preview" style="font-size: 2em;overflow-wrap:break-word;word-break: break-all"></div>\n' +
  '    </div>\n' +
  '    <div style="width:1200px;height:2px;margin-top:10px;margin-left:20px;color:black;background-color:black"></div>\n' +
  '    <div style="margin-top:10px">\n' +
  '      <div><label style="width:10px;margin-top:10px;margin-left:20px;">公式编辑：傅里叶级数公式：x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)</label></div>\n' +
  '      <div><textarea id="textInput" class="text-input" placeholder="x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)"></textarea></div>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '  <div class="btn-style">\n' +
  '    <button id="insert-math-line" onclick="sendInsertMathLineText()">插入行内公式</button>\n' +
  '    <button id="insert-math-block" onclick="sendInsertMathBlockText()">插入公式块</button>\n' +
  '    <button id="insert-math-math" onclick="sendInsertMathCodeBlock()">插入Math</button>\n' +
  '    <button id="insert-math-katex" onclick="sendInsertKatexCodeBlock()">插入Katex</button>\n' +
  '    <button id="insert-math-latex" onclick="sendInsertLatexCodeBlock()">插入Latex</button>\n' +
  '    <button id="cancel-insert-math" onclick="sendCancelInsertMathText()">取消编辑</button>\n' +
  '  </div>\n' +
  '  <script>\n' +
  "    const { ipcRenderer } = require('electron');\n" +
  "    let latexData = ''\n" +
  "    const result = ipcRenderer.sendSync('sync-katex-render-message', latexData);\n" +
  '    document.getElementById("katex-preview").innerHTML = result\n' +
  '    document.getElementById("textInput").textContent = latexData\n' +
  '    // 处理textInput的input事件，获取内容，渲染后进行显示\n' +
  '    function updateTextInput(event) {\n' +
  '      let inputText = event.target.value\n' +
  "      let html = ''\n" +
  '      try {\n' +
  "        html = ipcRenderer.sendSync('sync-katex-render-message', inputText);" +
  '      } catch (error) {html = latex}\n' +
  '      document.getElementById("katex-preview").innerHTML = html\n' +
  '      latexData = event.target.value\n' +
  '    }\n' +
  '    // 监控textInput的input事件\n' +
  "    document.getElementById('textInput').addEventListener('input', updateTextInput);\n" +
  '    // 这里是JavaScript函数，例如：\n' +
  "    function sendInsertMathLineText() {ipcRenderer.send('dialog-math-line-text-btn-insert', '$' + latexData + '$')}\n" +
  "    function sendInsertMathBlockText() {ipcRenderer.send('dialog-math-block-text-btn-insert', '$$\\r\\n' + latexData + '\\r\\n$$\\r\\n')}\n" +
  "    function sendInsertMathCodeBlock() {ipcRenderer.send('dialog-math-math-text-btn-insert', '```math\\r\\n' + latexData + '\\r\\n```\\r\\n')}\n" +
  "    function sendInsertKatexCodeBlock() {ipcRenderer.send('dialog-math-katex-text-btn-insert', '```katex\\r\\n' + latexData + '\\r\\n```\\r\\n')}\n" +
  "    function sendInsertLatexCodeBlock() {ipcRenderer.send('dialog-math-latex-text-btn-insert', '```latex\\r\\n' + latexData + '\\r\\n```\\r\\n')}\n" +
  "    function sendCancelInsertMathText() {ipcRenderer.send('dialog-math-text-btn-cancel')}\n" +
  '  </script>\n' +
  '</body>\n' +
  '</html>\n'
*/
