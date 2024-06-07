import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// let mainWin: Electron.CrossProcessExports.BrowserWindow
let mermaidRenderWindow: Electron.CrossProcessExports.BrowserWindow
let mermaidRenderResult: string | PromiseLike<string> // 假设这是一个全局变量

export async function mermaidHandleGetRenderResult(text: string): Promise<string> {
  updateMermaidWindowHtml(text)
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      console.log('mermaidHandleGetRenderResult setTimeout 11111')
      if (mermaidRenderResult != '') {
        console.log('mermaidHandleGetRenderResult setTimeout 22222', mermaidRenderResult)
        resolve(mermaidRenderResult)
      } else {
        reject(new Error('Wait mermaid render result time out'))
      }
    }, 2000)
  })
}

export function createMermaidRenderFrame(graphDesc: string) {
  mermaidRenderWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: '文字样式选择',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })
  // let mermaidSvgData = ''
  // mainWin = mainWindow
  const mermaidFrame = createMermaidRenderHtmlContent(graphDesc)
  const tempHtml = mermaidFrame.documentElement.outerHTML

  // 加载一个 HTML 文件作为对话框的内容
  mermaidRenderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)
  // mermaidRenderWindow.show()

  function processMermaidRenderResult(_, result) {
    mermaidRenderResult = result
    ipcMain.removeListener('mermaid-render-svg-result', processMermaidRenderResult)
  }

  ipcMain.on('mermaid-render-svg-result', processMermaidRenderResult)

  // 当窗口关闭时，清除引用
  mermaidRenderWindow.on('closed', () => {
    ipcMain.removeListener('mermaid-render-svg-result', processMermaidRenderResult)
  })
}

export function updateMermaidWindowHtml(graphDesc: string) {
  console.log('updateMermaidWindowHtml ', graphDesc)
  mermaidRenderWindow.webContents.send('update-mermaid-render-graph', graphDesc)
}

function createMermaidRenderHtmlContent(mermaidGraphDesc: string): Document {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>Mermaid Render</title></head><body></body></html>`
  ).window

  const ele_head_link = document.createElement('link')
  ele_head_link.rel = 'stylesheet'
  ele_head_link.href = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.css'

  const ele_head_script = document.createElement('script')
  ele_head_script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'

  const ele_body_mermaidGraph = document.createElement('div')
  ele_body_mermaidGraph.id = 'mermaidGraph'
  ele_body_mermaidGraph.className = 'mermaid'
  ele_body_mermaidGraph.textContent = mermaidGraphDesc

  const ele_body_script = document.createElement('script')
  ele_body_script.textContent =
    "    const { ipcRenderer, ipcMain } = require('electron');\n" +
    '    mermaid.initialize({ startOnLoad: true });\n' +
    "    var graphDefinition = document.getElementById('mermaidGraph').textContent;\n" +
    "    mermaid.render('mermaidGraph', graphDefinition, svgObject => document.appendChild(svgObject));\n" +
    '    function updateGraph(event, message) {\n' +
    "      document.getElementById('mermaidGraph').innerHTML = message\n" +
    "      mermaidGraph = document.getElementById('mermaidGraph').innerHTML\n" +
    '      mermaid.init(undefined, mermaidGraph)\n' +
    "      console.log('message', message);\n" +
    '      const graphDefinition = mermaid.parse(graphDesc)\n' +
    "      console.log('mermaid.parse(graphDesc) ', graphDefinition)" +
    '      const svgGraph = mermaid.renderSvg(graphDefinition)\n' +
    "      console.log('mermaid.parse(graphDesc) ', svgGraph)" +
    "      ipcRenderer.send('mermaid-render-svg-result', chartHtml)\n" +
    '    }\n' +
    "    ipcMain.on('update-mermaid-render-graph', updateGraph)\n" +
    '    setTimeout(function() {\n' +
    "      var chartHtml = document.getElementById('mermaidGraph').outerHTML;\n" +
    "      console.log('chartHtml', chartHtml);\n" +
    "      ipcRenderer.send('mermaid-render-svg-result', chartHtml)\n" +
    '    }, 1000);\n'

  document.head.appendChild(ele_head_link)
  document.head.appendChild(ele_head_script)
  document.body.appendChild(ele_body_mermaidGraph)
  document.body.appendChild(ele_body_script)

  return document
}

export { createMermaidRenderHtmlContent }
