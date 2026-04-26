import { globalShortcut } from 'electron'

export function RegisterShortKeys(mainWindow: Electron.BrowserWindow)  {
    // F9 编辑模式
    globalShortcut.register('F9', () => {
        mainWindow.webContents.send('markdown-edit-model', null)
    })
    // F10 预览模式
    globalShortcut.register('F10', () => {
        mainWindow.webContents.send('markdown-preview-model', null)
    })
    // F11 编辑预览模式
    globalShortcut.register('F11', () => {
        mainWindow.webContents.send('markdown-edit-preview-model', null)
    })
    // F12 切换 DevTools 打开/关闭
    globalShortcut.register('F12', () => {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools()
        } else {
            mainWindow.webContents.openDevTools()
        }
    })
}
