import { BrowserWindow, ipcMain } from 'electron'
import { katexRenderToString } from '../../utils/KatexRender'

let customMathTextDialog: Electron.BrowserWindow | null

export function showMathTextDialog(mainWindow: Electron.BrowserWindow) {
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
    title: '文字样式选择',
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
    `data:text/html;charset=utf-8,${encodeURIComponent(mdMathTextDialogHtmlContext)}`
  )

  // 当窗口关闭时，清除引用
  customMathTextDialog.on('closed', () => {
    ipcMain.removeListener('user-insert-math-line-text', processMathLineTextInsert)
    ipcMain.removeListener('user-insert-math-block-text', processMathBlockTextInsert)
    ipcMain.removeListener('user-insert-math-text-cancel', () => {})
    customMathTextDialog = null
  })

  // 显示窗口
  customMathTextDialog.show()

  function exitCustomFontDialog() {
    if (customMathTextDialog) {
      ipcMain.removeListener('user-insert-math-line-text', processMathLineTextInsert)
      ipcMain.removeListener('user-insert-math-block-text', processMathBlockTextInsert)
      ipcMain.removeListener('user-insert-math-text-cancel', () => {})
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

  ipcMain.on('user-insert-math-line-text', processMathLineTextInsert)
  ipcMain.on('user-insert-math-block-text', processMathBlockTextInsert)
  ipcMain.on('user-insert-math-text-cancel', () => {
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
  '    .btn-style {width:1200px;margin-top:20px; display:flex; justify-content:center;align-items:center;gap: 150px}\n' +
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
  '      <div><textarea id="textInput" class="text-input"></textarea></div>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '  <div class="btn-style">\n' +
  '    <button id="insert-math-line" onclick="sendInsertMathLineText()">插入行内公式</button>\n' +
  '    <button id="insert-math-block" onclick="sendInsertMathBlockText()">插入公式块</button>\n' +
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
  "    function sendInsertMathLineText() {ipcRenderer.send('user-insert-math-line-text', '$' + latexData + '$')}\n" +
  "    function sendInsertMathBlockText() {ipcRenderer.send('user-insert-math-block-text', '$$' + latexData + '$$')}\n" +
  "    function sendCancelInsertMathText() {ipcRenderer.send('user-insert-math-text-cancel')}\n" +
  '  </script>\n' +
  '</body>\n' +
  '</html>\n'
