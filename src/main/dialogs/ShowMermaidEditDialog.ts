import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as digcom from './dialog_common'

let customMermaidEditDialog: Electron.BrowserWindow | null

export function ShowMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  if (customMermaidEditDialog) {
    digcom.ShowAlreadyExistDialog()
    return
  }
  createMermaidEditDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  //console.log('createMermaidEditDialog 11111')
  customMermaidEditDialog = new BrowserWindow({
    width: 1280,
    height: 550,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: 'Mermaid绘图',
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
    join(__dirname, '../../src/renderer/src/Dialog/MermaidEditRender.html')
  )

  // 当窗口关闭时，清除引用
  customMermaidEditDialog.on('closed', () => {
    ipcMain.removeListener('dialog-mermaid-graph-insert', processMermaidRenderText)
    customMermaidEditDialog = null
  })

  // 显示窗口
  customMermaidEditDialog.show()

  function processMermaidRenderText(_, mermaidGraphData) {
    console.log(mermaidGraphData)
  }
  ipcMain.on('dialog-mermaid-graph-insert', processMermaidRenderText)
  /*function exitCustomFontDialog() {
    if (customMermaidEditDialog) {
      ipcMain.removeListener('dialog-mermaid-graph-insert', processMermaidRenderText)
      customMermaidEditDialog.close()
      customMermaidEditDialog = null
    }
  }*/

  const graphData =
    'classDiagram\n' +
    'direction LR\n' +
    'Animal ()-- Dog\n' +
    'Animal ()-- Cat\n' +
    'note for Cat "should have no members area"\n' +
    'Dog : bark()\n' +
    'Dog : species()'
  mainWindow.webContents.send('mermaid-graph-definition', graphData)

  /*function processMermaidRenderText(event, mermaidGraphData) {
    getMermaidSvg(mermaidGraphData)
      .then((svg) => {
        event.returnValue = svg
      })
      .catch((error) => {
        console.error(error)
      })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    /* require('mermaid').mermaid.render('id', mermaidGraphData, (svgData) => {
      mainWindow.webContents.send('monaco-insert-text-block-templates', svgData)
    })
    event.returnValue = mermaidGraphData
    mainWindow.webContents.send('monaco-insert-text-block-templates', mermaidGraphData)
  }
  ipcMain.on('dialog-mermaid-graph-insert', processMermaidRenderText)*/
}
/*
const mermaidEditDialogHtmlContext =
  '<!DOCTYPE html>\n' +
  '<html lang="zh">\n' +
  '<head>\n' +
  '    <meta charset="UTF-8">\n' +
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '    <title>Mermaid编辑</title>\n' +
  '</head>\n' +
  '<body>\n' +
  '    <div id="mermaidGraph" class="mermaid">\n' +
  '      mindmap\n' +
  '        root((mindmap))\n' +
  '          Origins\n' +
  '          Tools\n' +
  '            Pen and paper\n' +
  '            Mermaid\n' +
  '    </div>\n' +
  '    <script>\n' +
  '    </script>\n' +
  '</body>\n' +
  '</html>\n'
*/
