import { BrowserWindow, ipcMain } from 'electron'
import { CreateFileFolder } from '../utils/file-utils'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'

let customCreateDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowCreateFileFolderDialog(
  dirPath: string,
  isFolder: boolean,
  fileExtension: string
) {
  if (customCreateDialog) {
    digcom.ShowAlreadyExistDialog()
    return
  }
  customCreateDialog = new BrowserWindow({
    width: 400,
    height: 120,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '新建文件/文件夹',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  customCreateDialog.setMenu(null)

  const temphtml = makeCreateFileFolderDialogHtml()
  // 加载一个 HTML 文件作为对话框的内容
  customCreateDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(temphtml)}`)

  // 显示窗口
  customCreateDialog.show()

  customCreateDialog.on('closed', () => {
    customCreateDialog = null
    ipcMain.removeListener('dialog-create-file-folder-enter', processCreateFileFolder)
  })

  function processCreateFileFolder(_, name: string) {
    if (!isFolder && fileExtension.length == 0 && name.indexOf('.') === -1) {
      name = name + '.md'
    }
    CreateFileFolder(name, dirPath, isFolder, fileExtension)
    if (customCreateDialog) {
      customCreateDialog.close()
    }
  }

  ipcMain.on('dialog-create-file-folder-enter', processCreateFileFolder)
}

function makeCreateFileFolderDialogHtml(): string {
  // 创建一个空的HTML文档
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>新建文件/文件夹</title></head><body></body></html>`
  ).window

  const ele_body_input = document.createElement('input')
  ele_body_input.type = 'text'
  ele_body_input.id = 'file-folder-name'
  ele_body_input.style.cssText = 'width:320px;margin:20px'
  ele_body_input.placeholder = '请输入文件/文件夹名，文件默认后缀.md'

  const ele_body_script = document.createElement('script')
  ele_body_script.textContent =
    "  const { ipcRenderer } = require('electron')\n" +
    "  const inputElement = document.getElementById('file-folder-name')\n" +
    "  inputElement.addEventListener('keyup', function(event) {\n" +
    "    if (event.key === 'Enter') {\n" +
    '      const name = inputElement.value\n' +
    "      ipcRenderer.send('dialog-create-file-folder-enter', name)\n" +
    '    }\n' +
    '  });\n'

  document.body.appendChild(ele_body_input)
  document.body.appendChild(ele_body_script)

  return document.documentElement.outerHTML
}
