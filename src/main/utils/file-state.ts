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
    name: 'fileState',
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

    // 同时添加到最近文件列表
    const recentFiles = fileStateStore.get('recentFiles', []) as string[]
    const updatedRecentFiles = [filePath, ...recentFiles.filter(f => f !== filePath)].slice(0, 10) // 最多保留10个
    fileStateStore.set('recentFiles', updatedRecentFiles)
}

/**
 * 获取上次打开的文件
 */
export function getLastOpenedFile(): string | null {
    return fileStateStore.get('lastOpenedFile', null)
}

/**
 * 清除上次打开的文件
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
    return fileStateStore.get('lastOpenedDirectory', null)
}

/**
 * 清除上次打开的目录
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
 * 恢复上次打开的目录和文件
 */
export function restoreLastOpenedFile(): void {
    const lastFile = getLastOpenedFile()
    const lastDir = getLastOpenedDirectory()

    // 先尝试恢复目录（如果存在）
    if (lastDir) {
        try {
            const fs = require('fs')
            if (fs.existsSync(lastDir)) {
                console.log('open last directory:', lastDir)

                // 设置全局根路径
                global.RootPath = lastDir

                // 重新加载目录
                FileUtils.ReloadDirFromDisk()

                // 保存上次打开的目录
                saveLastOpenedDirectory(lastDir)
            } else {
                console.log('last directory not exist :', lastDir)
                clearLastOpenedDirectory()
            }
        } catch (error) {
            console.error('restore last time opened directory failed:', error)
            clearLastOpenedDirectory()
        }
    }

    // 然后尝试恢复文件（如果存在）
    if (lastFile) {
        try {
            const fs = require('fs')
            if (fs.existsSync(lastFile)) {
                console.log('restore lastest open file :', lastFile)

                // 创建FileProperties对象
                const fileProperties = {
                    name: path.basename(lastFile),
                    path: lastFile,
                    type: 'file' as const,
                    content: ''
                }

                // 调用OpenSelectFile
                FileUtils.OpenSelectFile(fileProperties)
            } else {
                console.log('lastest open file not exist:', lastFile)
                clearLastOpenedFile()
            }
        } catch (error) {
            console.error('restore lastest open file failed:', error)
            clearLastOpenedFile()
        }
    }
}

/**
 * 重置所有文件状态
 */
export function resetFileState(): void {
    fileStateStore.clear()
}
