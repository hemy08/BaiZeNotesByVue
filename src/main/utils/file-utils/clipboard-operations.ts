/**
 * 剪贴板操作模块
 * 提供文件/文件夹的复制、剪切、粘贴等功能
 */

import * as fs from 'fs'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fsExtra = require('fs-extra')
import { showErrorMessageBox } from './dialog-helpers'
import { ReloadDirFromDisk } from './file-operations'

const reloadFromDiskTime = 100

/**
 * 复制文件或文件夹到剪贴板
 * @param fromPath 源路径
 * @param isFile 是否为文件
 */
export function FileManagerContextMenuCopy(fromPath: string, isFile: boolean): void {
    global.srcDirCopyCut = fromPath
    global.isCopyOrCut = 'copy'
    global.isCopyCutFile = isFile
}

/**
 * 剪切文件或文件夹到剪贴板
 * @param fromPath 源路径
 * @param isFile 是否为文件
 */
export function FileManagerContextMenuCut(fromPath: string, isFile: boolean): void {
    global.srcDirCopyCut = fromPath
    global.isCopyOrCut = 'cut'
    global.isCopyCutFile = isFile
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

    const src = global.srcDirCopyCut
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
    if (fs.existsSync(destPath)) {
        showErrorMessageBox(`文件/文件夹已经存在！\r\n` + destPath)
        return
    }

    try {
        await fsExtra.copy(src, destPath, { recursive: true })
    } catch (err) {
        showErrorMessageBox((err as Error).message)
        return
    }

    // 如果是剪切动作，需要删除原目录
    if (global.isCopyOrCut === 'cut') {
        try {
            await fsExtra.remove(src)
        } catch (err) {
            showErrorMessageBox((err as Error).message)
            return
        }
    }

    setTimeout(() => {
        global.srcDirCopyCut = ''
        global.isCopyOrCut = ''
        ReloadDirFromDisk()
    }, reloadFromDiskTime)

    // 防止重新加载时，前面操作还没有完成，这里设置100ms的定时器处理
    setTimeout(() => {
        if (global.isCopyOrCut === 'cut') {
            fsExtra.remove(src)
        }
        global.srcDirCopyCut = ''
        global.isCopyOrCut = ''
        ReloadDirFromDisk()
    }, reloadFromDiskTime)
}
