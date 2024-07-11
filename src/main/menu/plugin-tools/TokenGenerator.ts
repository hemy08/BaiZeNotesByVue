import { BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
import { JSDOM } from 'jsdom'

let tokenGeneratorDialog: Electron.BrowserWindow | null

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TokenGeneratorDialog(mainWindow: Electron.BrowserWindow) {
  tokenGeneratorDialog = new BrowserWindow({
    width: 630,
    height: 180,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: 'Token 生成器',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  tokenGeneratorDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  tokenGeneratorDialog.loadURL(`data:text/html;charset=utf-8,${makeTokenGeneratorHtml()}`)

  // 显示窗口
  tokenGeneratorDialog.show()

  tokenGeneratorDialog.on('closed', () => {
    tokenGeneratorDialog = null
    ipcMain.removeListener('dialog-web-url-btn-insert', processWebUrlDialogInsert)
    ipcMain.removeListener('dialog-web-url-btn-cancel', () => {})
  })

  function exittokenGeneratorDialog() {
    if (tokenGeneratorDialog) {
      tokenGeneratorDialog.close()
      tokenGeneratorDialog = null
    }
  }

  function processWebUrlDialogInsert(_: IpcMainEvent, webLinks: { title: string; addr: string }) {
    // console.log('processWebUrlDialogInsert', webLinks)
    const webUrl = '[' + webLinks.title + '](' + webLinks.addr + ')'
    mainWindow.webContents.send('monaco-insert-text-block-templates', webUrl)
    if (tokenGeneratorDialog) {
      tokenGeneratorDialog.close()
    }
  }

  ipcMain.on('dialog-web-url-btn-insert', processWebUrlDialogInsert)
  ipcMain.on('dialog-web-url-btn-cancel', () => {
    exittokenGeneratorDialog()
  })
}

function makeTokenGeneratorHtml(): string {
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="zh"><head><title>Token 生成器</title></head><body></body></html>`
  ).window

  const webDivStyle = document.createElement('style')
  webDivStyle.textContent = `
    .label-style {width: 100px;margin-top: 5px;text-align: center;}
    .input-style {width: 250px;margin-top: 5px;}
    .checkbox-style {margin-top: 11px;margin-left:5px}
    .color-button {width: 18px;height: 18px;border-width:.2px;}
    .background-color-button {width: 18px;height: 18px;border-width:.2px;}`
  document.head.appendChild(webDivStyle)
}
