import { BrowserWindow } from 'electron'

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function showCreateFileFolderDialog(): Electron.BrowserWindow {
  const customCreateDialog = new BrowserWindow({
    width: 400,
    height: 120,
    minimizable: false,
    maximizable: false,
    title: '新建文件/文件夹',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  customCreateDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customCreateDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(customCreateDialogHtml)}`
  )

  // 显示窗口
  customCreateDialog.show()
  return customCreateDialog
}

const customCreateDialogHtml =
  '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8">\n' +
  '  <title>新建文件/文件夹</title>\n' +
  '</head>\n' +
  '<body>\n' +
  '<div><input type="text" id="file-folder-name" style="width: 320px; margin: 20px"></div>\n' +
  '</body>\n' +
  '<script>\n' +
  "  const { ipcRenderer } = require('electron')\n" +
  "  const inputElement = document.getElementById('file-folder-name')\n" +
  "  inputElement.addEventListener('keyup', function(event) {\n" +
  "    if (event.key === 'Enter') {\n" +
  '      const name = inputElement.value\n' +
  "      ipcRenderer.send('user-input-create-file-folder-name', name)\n" +
  '    }\n' +
  '  });\n' +
  '</script>\n' +
  '</html>'
