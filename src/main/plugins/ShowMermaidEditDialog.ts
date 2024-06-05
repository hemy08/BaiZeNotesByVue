import { BrowserWindow, ipcMain } from 'electron'

let customMermaidEditDialog: Electron.BrowserWindow | null

export function showMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  createMermaidEditDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  customMermaidEditDialog = new BrowserWindow({
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

  if (!customMermaidEditDialog) {
    return
  }

  customMermaidEditDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customMermaidEditDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(mermaidEditDialogHtmlContext)}`
  )

  // 当窗口关闭时，清除引用
  customMermaidEditDialog.on('closed', () => {
    ipcMain.removeListener('user-input-mermaid-graph-context', processMermaidRenderText)
    customMermaidEditDialog = null
  })

  // 显示窗口
  customMermaidEditDialog.show()

  /*function exitCustomFontDialog() {
    if (customMermaidEditDialog) {
      ipcMain.removeListener('user-input-mermaid-graph-context', processMermaidRenderText)
      customMermaidEditDialog.close()
      customMermaidEditDialog = null
    }
  }*/

  function processMermaidRenderText(_, MermaidEdit) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', MermaidEdit + '\n')
    // exitCustomFontDialog()
    ipcMain.removeListener('user-input-mermaid-graph-context', processMermaidRenderText)
  }
  ipcMain.on('user-input-mermaid-graph-context', processMermaidRenderText)
}

const mermaidEditDialogHtmlContext =
  '<!DOCTYPE html>\n' +
  '<html lang="zh">\n' +
  '<head>\n' +
  '    <meta charset="UTF-8">\n' +
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '    <title>Mermaid编辑</title>\n' +
  '    <script src="../../../main/lib/mermaid/dist/mermaid.min.js"></script>\n' +
  '</head>\n' +
  '<body>\n' +
  '    <div id="mermaidGraph" class="mermaid">\n' +
  '      mindmap\n' +
  '        root((mindmap))\n' +
  '          Origins\n' +
  '            Long history\n' +
  '            ::icon(fa fa-book)\n' +
  '            Popularisation\n' +
  '              British popular psychology author Tony Buzan\n' +
  '          Research\n' +
  '            On effectiveness<br/>and features\n' +
  '            On Automatic creation\n' +
  '              Uses\n' +
  '                  Creative techniques\n' +
  '                  Strategic planning\n' +
  '                  Argument mapping\n' +
  '          Tools\n' +
  '            Pen and paper\n' +
  '            Mermaid\n' +
  '    </div>\n' +
  '    <script>\n' +
  "    const { ipcRenderer } = require('electron');\n" +
  "        var graphDefinition = document.getElementById('mermaidGraph').textContent;\n" +
  "        mermaid.render('myGraph', graphDefinition, svgObject => document.body.appendChild(svgObject));\n" +
  "        const svgData = document.getElementById('mermaidGraph').innerHTML\n" +
  "        console.log('svg', svgData)\n" +
  '        setTimeout(function() {\n' +
  "            var chartHtml = document.getElementById('mermaidGraph').innerHTML;\n" +
  "            ipcRenderer.send('user-input-mermaid-graph-context', chartHtml);\n" +
  "            console.log('result', chartHtml); // 输出包含 Mermaid 图表的 HTML 字符串\n" +
  '        }, 1000);\n' +
  '    </script>\n' +
  '</body>\n' +
  '</html>\n'
