import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import { join } from 'path'

let customMermaidEditDialog: Electron.BrowserWindow | null
const mermaidEditDialogHtml = join(__dirname, 'ShowMermaidEditDialog.html')

export function showMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  createMermaidEditDialog(mainWindow)
}
// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  const htmlContent = createMermaidEditHtmlContent()
  customMermaidEditDialog = new BrowserWindow({
    width: 1000,
    height: 1000,
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

  if (!customMermaidEditDialog) {
    return
  }

  customMermaidEditDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customMermaidEditDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

  /*function exitCustomFontDialog() {
    if (customMermaidEditDialog) {
      ipcMain.removeListener('user-input-mermaid-graph-context', processMermaidRenderText)
      customMermaidEditDialog.close()
      customMermaidEditDialog = null
    }
  }

  // 当窗口关闭时，清除引用
  customMermaidEditDialog.on('closed', () => {
    exitCustomFontDialog()
  })

  // 显示窗口
  customMermaidEditDialog.show()*/

  // 在body中增加script处理，完成mermaid渲染

  function processMermaidRenderText(_, svgData) {
    console.log('svgData', svgData)
  }
  ipcMain.on('user-input-mermaid-graph-context', processMermaidRenderText)

  mainWindow.webContents.send('mermaid-render-graph-to-svg', '')

  ipcMain.on('mermaid-render-graph-svg-result', processMermaidRenderText)
}

function createMermaidEditHtmlContent() :string {
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MermaidGraph</title></head><body></body></html>`
  ).window

  // head 部分，引入mermaid路径
  const ele_head_script_mermaid = document.createElement('script')
  ele_head_script_mermaid.type = 'module'
  ele_head_script_mermaid.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs'
  document.head.appendChild(ele_head_script_mermaid)

  const ele_head_script_mermaid_init = document.createElement('script')
  ele_head_script_mermaid_init.textContent = 'window.onload=mermaid.initialize()'
  document.head.appendChild(ele_head_script_mermaid_init)

  // BODY部分
  // 增加编辑区域，占窗口的40%宽度
  // 增加显示区域，占窗口60%宽度
  const ele_body_mermaid = document.createElement('div')
  ele_body_mermaid.id = 'mermaidGraph'
  ele_body_mermaid.className = 'mermaid'
  ele_body_mermaid.textContent =
    'mindmap\n' +
    '   root((mindmap))\n' +
    '     Origins\n' +
    '       Long history\n' +
    '       ::icon(fa fa-book)\n' +
    '       Popularisation\n' +
    '         British popular psychology author Tony Buzan\n' +
    '     Research\n' +
    '       On effectiveness<\br/>and features\n' +
    '       On Automatic creation\n' +
    '         Uses\n' +
    '             Creative techniques\n' +
    '             Strategic planning\n' +
    '             Argument mapping\n' +
    '     Tools\n' +
    '       Pen and paper\n' +
    '       Mermaid\n'
  document.body.appendChild(ele_body_mermaid)

  const ele_body_script = document.createElement('script')
  ele_body_script.textContent =
    "var graphDefinition = document.getElementById('mermaidGraph').textContent;\n" +
    "mermaid.render('mermaid-id', graphDefinition, svgObject => document.body.appendChild(svgObject));\n" +
    "const svgData = document.getElementById('mermaidGraph').innerHTML\n" +
    "console.log('svg', svgData)\n" +
    'setTimeout(function() {\n' +
    "    var chartHtml = document.getElementById('mermaidGraph').innerHTML;\n" +
    "    console.log('result', chartHtml);\n" +
    '}, 1000);\n'
  document.body.appendChild(ele_body_script)

  return document.documentElement.outerHTML
}
