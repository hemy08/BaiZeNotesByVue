import { BrowserWindow } from 'electron'

export function OpenOnlineWebPage(url: string) {
  const localOpenWebPageDialog = new BrowserWindow({
    width: 1280,
    height: 960,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  localOpenWebPageDialog.loadURL(url)
}
