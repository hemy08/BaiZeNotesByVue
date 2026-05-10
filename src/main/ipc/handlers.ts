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

    // 打开特定文件夹
    ipcMain.on('baize:notes:open-specific-folder', (_, folderPath: string) => {
        const { ReloadDirFromDisk } = require('../utils/file-utils/file-operations')
        const { saveLastOpenedDirectory } = require('../utils/file-state')
        
        // 清理编辑区域和预览区域
        mainWindow.webContents.send('clear-editor-and-preview')
        
        // 设置根路径并重新加载
        global.RootPath = folderPath
        ReloadDirFromDisk()
        
        // 保存上次打开的目录
        saveLastOpenedDirectory(folderPath)
    })

    // 欢迎界面 - 打开文件夹
    ipcMain.on('baize:notes:welcome:open-directory', async () => {
        const { dialog } = require('electron')
        const { ReloadDirFromDisk } = require('../utils/file-utils/file-operations')
        const { saveLastOpenedDirectory } = require('../utils/file-state')
        
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        
        if (!result.canceled && result.filePaths.length > 0) {
            const dirPath = result.filePaths[0]
            
            // 清理编辑区域和预览区域
            mainWindow.webContents.send('clear-editor-and-preview')
            
            // 设置根路径并重新加载
            global.RootPath = dirPath
            ReloadDirFromDisk()
            
            // 保存上次打开的目录
            saveLastOpenedDirectory(dirPath)
            
            // 通知渲染进程进入主界面
            mainWindow.webContents.send('baize:notes:welcome:enter-main', { type: 'directory', path: dirPath })
        }
    })

    // 欢迎界面 - 打开文件
    ipcMain.on('baize:notes:welcome:open-file', async () => {
        const { dialog } = require('electron')
        const { OpenSelectFile, ParserFileName } = require('../utils/file-utils/file-operations')
        
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Markdown Files', extensions: ['md'] }]
        })
        
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0]
            
            // 打开选中的文件
            const fileProperties = {
                name: ParserFileName(filePath),
                path: filePath,
                type: 'file',
                content: ''
            }
            OpenSelectFile(fileProperties)
            
            // 通知渲染进程进入主界面
            mainWindow.webContents.send('baize:notes:welcome:enter-main', { type: 'file', path: filePath })
        }
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
