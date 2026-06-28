/**
 * 剪贴板操作模块
 * 提供文件/文件夹的复制、剪切、粘贴等功能
 */

import { promises as fs } from 'fs'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsExtra = require('fs-extra')
import { showErrorMessageBox } from './dialog-helpers'
import { ReloadDirFromDisk } from './file-operations'
import { appState } from '../app-state'

const reloadFromDiskTime = 100

/**
 * 复制文件或文件夹到剪贴板
 * @param fromPath 源路径
 * @param isFile 是否为文件
 */
export function FileManagerContextMenuCopy(fromPath: string, _isFile: boolean): void {
    appState.srcDirCopyCut = fromPath
    appState.isCopyOrCut = 'copy'
    global.isCopyCutFile = _isFile
}

/**
 * 剪切文件或文件夹到剪贴板
 * @param fromPath 源路径
 * @param isFile 是否为文件
 */
export function FileManagerContextMenuCut(fromPath: string, _isFile: boolean): void {
    appState.srcDirCopyCut = fromPath
    appState.isCopyOrCut = 'cut'
    global.isCopyCutFile = _isFile
}

/**
 * 粘贴文件或文件夹
 * @param toPath 目标路径
 * @param isFile 是否为文件
 */
export async function FileManagerContextMenuPaste(toPath: string, isFile: string): Promise<void> {
    if (isFile) {
        showErrorMessageBox(`目标不是一个目录！`)
        return
    }

    const src = appState.srcDirCopyCut
    if (src.length === 0) {
        showErrorMessageBox(`未拷贝/剪切源文件！`)
        return
    }

    if (src === toPath) {
        showErrorMessageBox(`源路径和目标路径相同！`)
        return
    }

    // 先在目标目录中创建一个与原目录同名文件夹，返回进行拷贝
    const lastIndex = Math.max(src.lastIndexOf('\\'), src.lastIndexOf('//'))
    const srcName = src.substring(lastIndex)
    const destPath = require('path').join(toPath, srcName)
    try {
        await fs.access(destPath)
        showErrorMessageBox(`文件/文件夹已经存在！\r\n` + destPath)
        return
    } catch {
        // destPath doesn't exist, proceed
    }

    try {
        await fsExtra.copy(src, destPath, { recursive: true })
    } catch (err) {
        showErrorMessageBox((err as Error).message)
        return
    }

    // 如果是剪切动作，需要删除原目录
    if (appState.isCopyOrCut === 'cut') {
        try {
            await fsExtra.remove(src)
        } catch (err) {
            showErrorMessageBox((err as Error).message)
            return
        }
    }

    setTimeout(async () => {
        appState.srcDirCopyCut = ''
        appState.isCopyOrCut = ''
        try {
            await ReloadDirFromDisk()
        } catch (err) {
            console.error('Failed to reload from disk:', err)
        }
    }, reloadFromDiskTime)

    // 防止重新加载时，前面操作还没有完成，这里设置100ms的定时器处理
    setTimeout(async () => {
        if (appState.isCopyOrCut === 'cut') {
            fsExtra.remove(src)
        }
        appState.srcDirCopyCut = ''
        appState.isCopyOrCut = ''
        try {
            await ReloadDirFromDisk()
        } catch (err) {
            console.error('Failed to reload from disk:', err)
        }
    }, reloadFromDiskTime)
}
