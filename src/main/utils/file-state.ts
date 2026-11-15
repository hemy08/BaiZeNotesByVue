/**
 * 文件状态模块（ARC-11 重构后）
 * 存储层已下沉至 file-state-store.ts（打破 file-state ↔ file-utils 循环依赖），
 * 本文件仅保留「恢复上次打开的目录与文件」流程，并 re-export 存储 API
 * 保持外部调用兼容（handlers.ts / index.ts / 各测试仍从本模块导入）。
 */

import * as path from 'path'
import * as fs from 'fs'
import { appState } from './app-state'
import { logger } from './logger'
import * as FileUtils from './file-utils/index'
import * as FileStateStore from './file-state-store'

// ARC-11：re-export 存储 API（file-operations 等新引用请直接 import './file-state-store'）
export type { FileState } from './file-state-store'
export {
    saveLastOpenedFile,
    getLastOpenedFile,
    clearLastOpenedFile,
    saveLastOpenedDirectory,
    getLastOpenedDirectory,
    clearLastOpenedDirectory,
    getRecentFiles,
    clearRecentFiles,
    removeRecentFile,
    resetFileState
} from './file-state-store'

/**
 * 恢复上次打开的目录和文件
 */
export async function restoreLastOpenedFile(): Promise<void> {
    const lastFile = FileStateStore.getLastOpenedFile()
    const lastDir = FileStateStore.getLastOpenedDirectory()

    // 先尝试恢复目录（如果存在）
    if (lastDir) {
        try {
            if (fs.existsSync(lastDir)) {
                // 设置全局根路径
                appState.rootPath = lastDir

                // 重新加载目录
                await FileUtils.ReloadDirFromDisk()

                // 保存上次打开的目录
                FileStateStore.saveLastOpenedDirectory(lastDir)
            } else {
                FileStateStore.clearLastOpenedDirectory()
            }
        } catch (error) {
            logger.error('restore last time opened directory failed:', error)
            FileStateStore.clearLastOpenedDirectory()
        }
    }

    // 然后尝试恢复文件（如果存在）
    if (lastFile) {
        try {
            if (fs.existsSync(lastFile)) {
                // 创建FileProperties对象
                const fileProperties = {
                    name: path.basename(lastFile),
                    path: lastFile,
                    type: 'file' as const,
                    content: ''
                }

                // 调用OpenSelectFile
                await FileUtils.OpenSelectFile(fileProperties)
            } else {
                FileStateStore.clearLastOpenedFile()
            }
        } catch (error) {
            logger.error('restore lastest open file failed:', error)
            FileStateStore.clearLastOpenedFile()
        }
    }
}
