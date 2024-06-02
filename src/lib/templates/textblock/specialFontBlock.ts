import { BrowserWindow } from 'electron'

let customDialogWindow: Electron.BrowserWindow | null

export function showFontDialog(mainWindow: Electron.BrowserWindow) {
  createCustomDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createCustomDialog(mainWindow: Electron.BrowserWindow) {
  customDialogWindow = new BrowserWindow({
    width: 400,
    height: 300,
    title: '自定义对话框',
    modal: true, // 设置为模态窗口，会阻止与父窗口的交互
    parent: mainWindow,
    autoHideMenuBar: true,
    show: false, // 初始时不显示窗口，稍后再显示
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
    }
  })

  if (!customDialogWindow) {
    return
  }

  // 加载一个 HTML 文件作为对话框的内容
  customDialogWindow.loadFile('./src/lib/templates/textblock/dialog.html')

  // 当窗口关闭时，清除引用
  customDialogWindow.on('closed', () => {
    customDialogWindow = null
  })

  // 显示窗口
  customDialogWindow.show()
}
