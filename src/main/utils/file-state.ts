/**
 * 文件状态管理
 * 保存和恢复上次打开的文件和目录
 */

import Store from 'electron-store'
import { BrowserWindow } from 'electron'

// 创建存储实例
const fileStateStore = new Store({
    name: 'file-state',
    defaults: {
        lastOpenedFile: null as string | null,
        lastOpenedDirectory: null as string | null,
        recentFiles: [] as string[],
        maxRecentFiles: 10
    }
})

/**
 * 保存上次打开的文件
 */
export function saveLastOpenedFile(filePath: string): void {
    fileStateStore.set('lastOpenedFile', filePath)
    
    // 同时更新最近文件列表
    const recentFiles = getRecentFiles()
    const index = recentFiles.indexOf(filePath)
    if (index > -1) {
        recentFiles.splice(index, 1)
    }
    recentFiles.unshift(filePath)
    
    // 限制最近文件数量
    const maxRecent = fileStateStore.get('maxRecentFiles') as number
    if (recentFiles.length > maxRecent) {
        recentFiles.splice(maxRecent)
    }
    
    fileStateStore.set('recentFiles', recentFiles)
}

/**
 * 保存上次打开的目录
 */
export function saveLastOpenedDirectory(dirPath: string): void {
    fileStateStore.set('lastOpenedDirectory', dirPath)
}

/**
 * 获取上次打开的文件
 */
export function getLastOpenedFile(): string | null {
    return fileStateStore.get('lastOpenedFile') as string | null
}

/**
 * 获取上次打开的目录
 */
export function getLastOpenedDirectory(): string | null {
    return fileStateStore.get('lastOpenedDirectory') as string | null
}

/**
 * 获取最近文件列表
 */
export function getRecentFiles(): string[] {
    return fileStateStore.get('recentFiles') as string[]
}

/**
 * 清除上次打开的文件
 */
export function clearLastOpenedFile(): void {
    fileStateStore.set('lastOpenedFile', null)
}

/**
 * 清除上次打开的目录
 */
export function clearLastOpenedDirectory(): void {
    fileStateStore.set('lastOpenedDirectory', null)
}

/**
 * 清除所有文件状态
 */
export function clearAllFileState(): void {
    fileStateStore.clear()
}

/**
 * 恢复上次打开的文件
 */
export function restoreLastOpenedFile(mainWindow: BrowserWindow): void {
    const lastFile = getLastOpenedFile()
    const lastDir = getLastOpenedDirectory()
    
    // 优先恢复文件
    if (lastFile) {
        try {
            const fs = require('fs')
            if (fs.existsSync(lastFile)) {
                // 导入文件打开函数
                const { OpenSelectFile } = require('./file-utils')
                const path = require('path')
                OpenSelectFile(mainWindow, lastFile, path.basename(lastFile))
                console.log('已恢复上次打开的文件:', lastFile)
            } else {
                console.log('上次打开的文件不存在:', lastFile)
                // 文件不存在，清除记录
                clearLastOpenedFile()
            }
        } catch (error) {
            console.error('恢复上次打开的文件失败:', error)
        }
    }
    
    // 如果没有文件，恢复目录
    if (!lastFile && lastDir) {
        try {
            const fs = require('fs')
            if (fs.existsSync(lastDir)) {
                // 发送目录路径到渲染进程
                mainWindow.webContents.send('restore-last-directory', lastDir)
                console.log('已恢复上次打开的目录:', lastDir)
            } else {
                console.log('上次打开的目录不存在:', lastDir)
                // 目录不存在，清除记录
                clearLastOpenedDirectory()
            }
        } catch (error) {
            console.error('恢复上次打开的目录失败:', error)
        }
    }
}
