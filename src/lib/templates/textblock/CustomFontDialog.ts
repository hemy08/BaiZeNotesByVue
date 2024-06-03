import { BrowserWindow } from 'electron'

let customDialogWindow: Electron.BrowserWindow | null

export function showFontDialog() {
  createCustomDialog()
}

// 创建一个自定义对话框的函数
function createCustomDialog() {
  customDialogWindow = new BrowserWindow({
    width: 400,
    height: 300,
    title: '文字选择对话框',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!customDialogWindow) {
    return
  }

  // 加载一个 HTML 文件作为对话框的内容
  customDialogWindow.loadFile('src/renderer/src/dialogs/customfontdialog/CustomFontDialog.html')

  // 当窗口关闭时，清除引用
  customDialogWindow.on('closed', () => {
    customDialogWindow = null
  })

  // 显示窗口
  customDialogWindow.show()
}
