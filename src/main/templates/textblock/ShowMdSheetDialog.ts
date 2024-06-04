import { BrowserWindow, ipcMain } from 'electron'

let customMarkdownSheetDialog: Electron.BrowserWindow | null

export function showMarkdownSheetDialog(mainWindow: Electron.BrowserWindow) {
  createMarkdownSheetDialog(mainWindow)
}
// 创建一个自定义对话框的函数
function createMarkdownSheetDialog(mainWindow: Electron.BrowserWindow) {
  customMarkdownSheetDialog = new BrowserWindow({
    width: 400,
    height: 150,
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

  if (!customMarkdownSheetDialog) {
    return
  }

  customMarkdownSheetDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customMarkdownSheetDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(mdSheetDialogHtmlContext)}`
  )

  // 当窗口关闭时，清除引用
  customMarkdownSheetDialog.on('closed', () => {
    customMarkdownSheetDialog = null
    ipcMain.removeListener('user-input-custom-font-dialog-apply', processMarkdownSheetInsert)
    ipcMain.removeListener('user-input-custom-font-dialog-cancel', () => {})
  })

  // 显示窗口
  customMarkdownSheetDialog.show()

  function exitCustomFontDialog() {
    if (customMarkdownSheetDialog) {
      ipcMain.removeListener('user-input-custom-font-dialog-apply', processMarkdownSheetInsert)
      ipcMain.removeListener('user-input-custom-font-dialog-cancel', () => {})
      customMarkdownSheetDialog.close()
      customMarkdownSheetDialog = null
    }
  }

  function processMarkdownSheetInsert(_, sheetData) {
    let rowContent = '|'
    let titleContent = '|'
    const sheetCol = sheetData.col
    const sheetRow = sheetData.row
    for (let i = 0; i < sheetCol; i++) {
      rowContent += '  |'
      titleContent += ' :-- |'
    }

    rowContent += '\n'
    titleContent += '\n'

    let inputSheet = rowContent + titleContent
    for (let i = 0; i < sheetRow; i++) {
      inputSheet += rowContent
    }

    mainWindow.webContents.send('monaco-insert-text-block-templates', inputSheet)
    exitCustomFontDialog()
  }

  ipcMain.on('user-input-sheet-row-col-insert', processMarkdownSheetInsert)

  ipcMain.on('user-input-sheet-row-col-cancel', () => {
    exitCustomFontDialog()
  })
}

const mdSheetDialogHtmlContext =
  '<!DOCTYPE html>\n' +
  '<html lang="zh">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8">\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '  <title>选择表格大小</title>\n' +
  '  <style>\n' +
  '      .label-style {\n' +
  '        width: 40px;\n' +
  '        margin-top: 12px;\n' +
  '        text-align: center;\n' +
  '      }\n' +
  '      .input-style  {\n' +
  '        width: 100px;\n' +
  '        margin-top: 10px;\n' +
  '      }\n' +
  '      .color-button {\n' +
  '        width: 80px;\n' +
  '        margin-top: 20px;\n' +
  '      }\n' +
  '    </style>\n' +
  '  </head>\n' +
  '  <body>\n' +
  '    <div style="display: flex; flex-direction: row; margin-left: 20px;">\n' +
  '        <div class="label-style"><label for="sheet-row">行：</label></div>\n' +
  '        <div class="input-style"><input type="text" id="sheet-row" style="width: 100px"></div>\n' +
  '        <div style="margin-top: 10px; margin-left: 20px; width: 2px; display: flex;"></div>\n' +
  '        <div class="label-style"><label for="sheet-col">列：</label></div>\n' +
  '        <div class="input-style"><input type="text" id="sheet-col" style="width: 100px"></div>\n' +
  '    </div>\n' +
  '    <button id="insertButton" onClick="sendUserInputSheetStyle()" class="color-button" style="margin-left: 60px;">插入</button>\n' +
  '    <button id="cancelButton" onClick="sendDialogCancelSheetStyle()" class="color-button" style="margin-left: 90px;">取消</button>\n' +
  '    <script>\n' +
  "      const { ipcRenderer } = require('electron');\n" +
  '      let sheetStyle = {\n' +
  '        row:1,\n' +
  '        col:1\n' +
  '      };\n' +
  '      function updateSheetRow(event) {\n' +
  '        sheetStyle.row = event.target.value\n' +
  '      }\n' +
  '      function updateSheetCol(event) {\n' +
  '        sheetStyle.col = event.target.value\n' +
  '      }\n' +
  '      // 监听文本输入和样式输入的变化\n' +
  "      document.getElementById('sheet-row').addEventListener('input', updateSheetRow);\n" +
  "      document.getElementById('sheet-col').addEventListener('input', updateSheetCol);\n" +
  '      function sendUserInputSheetStyle() {\n' +
  "        ipcRenderer.send('user-input-sheet-row-col-insert', sheetStyle);\n" +
  '      }\n' +
  '      function sendDialogCancelSheetStyle() {\n' +
  "        ipcRenderer.send('user-input-sheet-row-col-cancel');\n" +
  '      }\n' +
  '    </script>\n' +
  '  </body>\n' +
  '</html>'
