/**
 * IPC 处理器模块
 * 集中管理主进程的所有 IPC 处理函数
 */

import { ipcMain, BrowserWindow } from 'electron'
import { HandleBaiZeMenuAction } from './menu_handle'
import { getMonacoThemeData } from '../config'
import { getEditorSetting } from '../config'
import { CreateFileFolder, GetCurrentFileDirectory, SelectDirectory, StopAutoSaveFileTime } from '../utils/file-utils'
import { ImportCreateNewFile } from '../utils/file-utils'

/**
 * 注册所有 IPC 处理器
 * @param mainWindow 主窗口实例
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
    // 窗口控制 IPC
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize()
    })
    ipcMain.on('window-maximize', () => {
        if (mainWindow) mainWindow.maximize()
    })
    ipcMain.on('window-unmaximize', () => {
        if (mainWindow) mainWindow.unmaximize()
    })
    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close()
    })
    ipcMain.on('window-toggle-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize()
            } else {
                mainWindow.maximize()
            }
        }
    })

    ipcMain.on('baize-notes:menu-action', (_, action) => {
        HandleBaiZeMenuAction(action, mainWindow)
    })

    ipcMain.handle('baize-notes:import-new-file', async (_, content: string) => {
        return await ImportCreateNewFile(mainWindow, content)
    })

    ipcMain.handle('baize-notes:create-file-folder', (_, name: string, dirPath: string, isFolder: boolean, extension: string) => {
        CreateFileFolder(name, dirPath, isFolder, extension)
        return { success: true }
    })

    ipcMain.handle('baize-notes:get-current-file-path', () => {
        return GetCurrentFileDirectory()
    })

    ipcMain.handle('baize-notes:select-directory', async () => {
        return await SelectDirectory(mainWindow)
    })

    ipcMain.handle('baize-notes:load-monaco-theme', (_, themeName: string) => {
        return getMonacoThemeData(themeName)
    })

    ipcMain.handle('baize-notes:get-editor-setting', () => {
        return getEditorSetting()
    })

    ipcMain.handle('system-setting-auto-save-changed', () => {
        StopAutoSaveFileTime()
    })
}

/**
 * 获取当前主窗口实例
 * 注意：这是一个简单的方式，在实际应用中可能需要更复杂的管理
 */
let currentMainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow): void {
    currentMainWindow = window
}

export function getMainWindow(): BrowserWindow | null {
    return currentMainWindow
}
