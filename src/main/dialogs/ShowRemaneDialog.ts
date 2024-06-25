import { BrowserWindow, ipcMain } from 'electron'
import { RenameFileFolder } from '../utils/file-utils'
import { JSDOM } from 'jsdom'

let customRenameDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowFileFolderRenameDialog(fullName: string) {
  customRenameDialog = new BrowserWindow({
    width: 550,
    height: 150,
    minimizable: false,
    maximizable: false,
    title: '重命名',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  customRenameDialog.setMenu(null)

  const tempHtml = makeRenameDialogHtml(fullName)
  // 加载一个 HTML 文件作为对话框的内容
  customRenameDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

  // 显示窗口
  customRenameDialog.show()

  customRenameDialog.on('closed', () => {
    customRenameDialog = null
    ipcMain.removeListener('user-input-rename-file-folder-name', processRenameFileFolder)
  })

  function processRenameFileFolder(_, newName: string) {
    RenameFileFolder(fullName, newName)
    if (customRenameDialog) {
      customRenameDialog.close()
    }
  }

  ipcMain.on('user-input-rename-file-folder-name', processRenameFileFolder)
}

function makeRenameDialogHtml(path: string): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>重命名</title></head><body></body></html>`
  ).window

  const ele_body_old_path = document.createElement('div')
  ele_body_old_path.id = 'old-path'
  ele_body_old_path.style.margin = '10px'
  ele_body_old_path.textContent = path


  const ele_body_input = document.createElement('input')
  ele_body_input.type = 'text'
  ele_body_input.id = 'file-folder-name'
  ele_body_input.style.width = '500px'
  ele_body_input.style.margin = '10px'

  const ele_body_script = document.createElement('script')
  ele_body_script.textContent =
    "  const { ipcRenderer } = require('electron')\n" +
    "  const inputElement = document.getElementById('file-folder-name')\n" +
    "  inputElement.addEventListener('keyup', function(event) {\n" +
    "    if (event.key === 'Enter') {\n" +
    '      const name = inputElement.value\n' +
    "      ipcRenderer.send('user-input-rename-file-folder-name', name)\n" +
    '    }\n' +
    '  });\n'

  document.body.appendChild(ele_body_old_path)
  document.body.appendChild(ele_body_input)
  document.body.appendChild(ele_body_script)

  return document.documentElement.outerHTML
}
