/**
 * 全局快捷键注册模块
 * 用于注册应用级别的全局快捷键
 */

import { globalShortcut } from 'electron'

export function RegisterShortKeys(mainWindow: Electron.BrowserWindow): void {
    globalShortcut.register('F9', () => {
        mainWindow.webContents.send('markdown-edit-model', null)
    })

    globalShortcut.register('F10', () => {
        mainWindow.webContents.send('markdown-preview-model', null)
    })

    globalShortcut.register('F11', () => {
        mainWindow.webContents.send('markdown-edit-preview-model', null)
    })

    globalShortcut.register('F12', () => {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools()
        } else {
            mainWindow.webContents.openDevTools()
        }
    })
}