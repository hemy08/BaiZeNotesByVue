/**
 * IPC 处理器模块
 * 集中管理主进程的所有 IPC 处理函数
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as os from 'os'
import { HandleBaiZeMenuAction } from './menu_handle'
import { getMonacoThemeData } from '../config'
import { getEditorSetting } from '../config'
import { CreateFileFolder, GetCurrentFileDirectory, SelectDirectory, StopAutoSaveFileTime, ReloadDirFromDisk, OpenSelectFile, ParserFileName } from '../utils/file-utils'
import { ImportCreateNewFile } from '../utils/file-utils'
import { saveLastOpenedDirectory } from '../utils/file-state'
import { appState } from '../utils/app-state'

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
    ipcMain.handle('window-get-bounds', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            return mainWindow.getBounds()
        }
        return null
    })
    ipcMain.handle('window-is-maximized', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            return mainWindow.isMaximized()
        }
        return false
    })
    ipcMain.on('window-start-drag', () => {
        // 窗口拖动由 renderer 端的 mousemove 事件通过 window-move 处理
    })
    ipcMain.on('window-move', (_, x: number, y: number) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const [currentWidth, currentHeight] = mainWindow.getSize()
            mainWindow.setBounds({ x, y, width: currentWidth, height: currentHeight })
        }
    })
    ipcMain.on('window-set-size', (_, width: number, height: number) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const [x, y] = mainWindow.getPosition()
            mainWindow.setBounds({ x, y, width, height })
        }
    })

    ipcMain.on('baize-notes:menu-action', (_, action) => {
        HandleBaiZeMenuAction(action, mainWindow)
    })

    // 打开特定文件夹
    ipcMain.on('baize:notes:open-specific-folder', async (_, folderPath: string) => {
        mainWindow.webContents.send('clear-editor-and-preview')
        appState.rootPath = folderPath
        await ReloadDirFromDisk()
        saveLastOpenedDirectory(folderPath)
    })

    // 欢迎界面 - 打开文件夹
    ipcMain.on('baize:notes:welcome:open-directory', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        
        if (!result.canceled && result.filePaths.length > 0) {
            const dirPath = result.filePaths[0]
            mainWindow.webContents.send('clear-editor-and-preview')
            appState.rootPath = dirPath
            await ReloadDirFromDisk()
            saveLastOpenedDirectory(dirPath)
            mainWindow.webContents.send('baize:notes:welcome:enter-main', { type: 'directory', path: dirPath })
        }
    })

    // 欢迎界面 - 打开文件
    ipcMain.on('baize:notes:welcome:open-file', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Markdown Files', extensions: ['md'] }]
        })
        
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0]
            const fileProperties = {
                name: ParserFileName(filePath),
                path: filePath,
                type: 'file',
                content: ''
            }
            await OpenSelectFile(fileProperties)
            mainWindow.webContents.send('baize:notes:welcome:enter-main', { type: 'file', path: filePath })
        }
    })

    ipcMain.handle('baize-notes:import-new-file', async (_, content: string) => {
        return await ImportCreateNewFile(mainWindow, content)
    })

    ipcMain.handle('baize-notes:create-file-folder', async (_, name: string, dirPath: string, isFolder: boolean, extension: string) => {
        await CreateFileFolder(name, dirPath, isFolder, extension)
        return { success: true }
    })

    ipcMain.handle('baize-notes:get-current-file-path', () => {
        return GetCurrentFileDirectory()
    })

    ipcMain.handle('baize-notes:select-directory', async () => {
        return await SelectDirectory(mainWindow)
    })

    ipcMain.handle('get-system-info', () => {
        return `${os.type()} ${os.arch()} ${os.release()}`
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

// 对话框广播主题到所有窗口
ipcMain.on('dialog-broadcast-theme', (_event, themeData) => {
    BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
            window.webContents.send('baize-notes:theme-updated', themeData)
        }
    })
})

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
