import { BrowserWindow } from 'electron'
import { join } from 'path'

// 创建一个自定义对话框的函数
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ShowThemeSettingDialog() {
  const ThemeWindow = new BrowserWindow({
    width: 450,
    height: 240,
    minimizable: false,
    maximizable: false,
    resizable: false,
    title: '主题设置',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  ThemeWindow.setMenu(null)

  ThemeWindow.on('ready-to-show', () => {
    // ThemeWindow.maximize()
    ThemeWindow.show()
    ThemeWindow.webContents.openDevTools()
  })
  // 加载一个 HTML 文件作为对话框的内容
  ThemeWindow.loadFile(join(__dirname, '../renderer/src/dialogs/ThemeSet/index.html'))
}
