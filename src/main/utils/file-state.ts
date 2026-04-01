/**
 * 文件状态管理模块
 * 用于管理文件的打开状态、最近文件列表等
 */

// @ts-ignore
import Store from 'electron-store'
import * as path from 'path'
// @ts-ignore
import * as FileUtils from './file-utils'

// 文件状态配置接口
export interface FileState {
    lastOpenedFile: string | null
    lastOpenedDirectory: string | null
    recentFiles: string[]
}

// 创建文件状态存储实例
const fileStateStore = new Store<FileState>({
    name: 'file-state',
    defaults: {
        lastOpenedFile: null,
        lastOpenedDirectory: null,
        recentFiles: []
    }
})

/**
 * 保存上次打开的文件
 */
export function saveLastOpenedFile(filePath: string): void {
    fileStateStore.set('lastOpenedFile', filePath)
    
    // 添加到最近文件列表
    const recentFiles = fileStateStore.get('recentFiles', []) as string[]
    const updatedRecentFiles = [filePath, ...recentFiles.filter(f => f !== filePath)].slice(0, 10)
    fileStateStore.set('recentFiles', updatedRecentFiles)
}

/**
 * 获取上次打开的文件
 */
export function getLastOpenedFile(): string | null {
    return fileStateStore.get('lastOpenedFile') as string | null
}

/**
 * 清除上次打开的文件记录
 */
export function clearLastOpenedFile(): void {
    fileStateStore.set('lastOpenedFile', null)
}

/**
 * 保存上次打开的目录
 */
export function saveLastOpenedDirectory(dirPath: string): void {
    fileStateStore.set('lastOpenedDirectory', dirPath)
}

/**
 * 获取上次打开的目录
 */
export function getLastOpenedDirectory(): string | null {
    return fileStateStore.get('lastOpenedDirectory') as string | null
}

/**
 * 清除上次打开的目录记录
 */
export function clearLastOpenedDirectory(): void {
    fileStateStore.set('lastOpenedDirectory', null)
}

/**
 * 获取最近文件列表
 */
export function getRecentFiles(): string[] {
    return fileStateStore.get('recentFiles', []) as string[]
}

/**
 * 清除最近文件列表
 */
export function clearRecentFiles(): void {
    fileStateStore.set('recentFiles', [])
}

/**
 * 从最近文件列表中移除指定文件
 */
export function removeRecentFile(filePath: string): void {
    const recentFiles = fileStateStore.get('recentFiles', []) as string[]
    const updatedRecentFiles = recentFiles.filter(f => f !== filePath)
    fileStateStore.set('recentFiles', updatedRecentFiles)
}

/**
 * 恢复上次打开的文件
 */
export function restoreLastOpenedFile(): void {
    const lastFile = getLastOpenedFile()
    const lastDir = getLastOpenedDirectory()
    
    // 优先恢复文件
    if (lastFile) {
        try {
            const fs = require('fs')
            if (fs.existsSync(lastFile)) {
                // 创建FileProperties对象
                const fileProperties = {
                    name: path.basename(lastFile),
                    path: lastFile,
                    type: 'file' as const,
                    content: ''
                }
                
                // 调用OpenSelectFile
                FileUtils.OpenSelectFile(fileProperties)
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
    
    // 如果没有文件，尝试恢复目录
    else if (lastDir) {
        try {
            const fs = require('fs')
            if (fs.existsSync(lastDir)) {
                console.log('上次打开的目录:', lastDir)
                // 可以在这里添加打开目录的逻辑
            } else {
                console.log('上次打开的目录不存在:', lastDir)
                clearLastOpenedDirectory()
            }
        } catch (error) {
            console.error('恢复上次打开的目录失败:', error)
        }
    }
}

/**
 * 重置所有文件状态
 */
export function resetFileState(): void {
    fileStateStore.clear()
}
