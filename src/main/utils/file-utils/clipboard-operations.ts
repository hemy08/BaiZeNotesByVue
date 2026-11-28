/**
 * 剪贴板操作模块
 * 提供文件/文件夹的复制、剪切、粘贴等功能
 *
 * P1-AS-1：复制/剪切只允许记录受信范围内的源路径，粘贴的源与目标都必须位于
 * 受信范围（工作区根、系统临时目录、用户经对话框选择过的路径、当前活动文件目录），
 * 越界时状态栏提示并中止，不再对渲染层传入的任意路径执行 fs-extra.copy/remove。
 */

import { promises as fs } from 'fs'
import { basename, join } from 'path'
import * as fsExtra from 'fs-extra'
import { showErrorMessageBox } from './dialog-helpers'
import {
    notifyPathAccessDenied,
    ReloadDirFromDisk,
    DescribeFileSystemError
} from './file-operations'
import { appState } from '../app-state'
import { logger } from '../logger'
import { tMain } from '../i18n'
import { isPathAllowed, isSafeFileName } from '../security'
// 1.5.7 LLM Wiki L1（T1.3）：粘贴/剪切同属写盘入口（复制写入目标 + 剪切删除源），
// llm-wiki 模式下 raw/ 只读守卫在此统一拦截
import { ensureWorkspaceWritable } from './shared'

const reloadFromDiskTime = 100

/**
 * 兼容旧行为的全局标记：记录上次复制/剪切的是否为文件。
 * 原实现直接写 `global.isCopyCutFile`，在 noImplicitAny 下 TS7017；改为显式
 * globalThis 类型断言，运行时挂载位置不变（仍可被外部以 globalThis.isCopyCutFile 读取）。
 */
interface ClipboardGlobalScope {
    isCopyCutFile?: boolean
}

function setCopyCutFileFlag(isFile: boolean): void {
    ;(globalThis as ClipboardGlobalScope).isCopyCutFile = isFile
}

/**
 * 复制文件或文件夹到剪贴板
 * @param fromPath 源路径
 * @param isFile 是否为文件
 */
export function FileManagerContextMenuCopy(fromPath: string, _isFile: boolean): void {
    // P1-AS-1：源路径必须在受信范围内，避免把任意路径带入后续粘贴流程
    if (!isPathAllowed(fromPath)) {
        notifyPathAccessDenied(fromPath, 'mainMsg.status.operationFailed')
        return
    }
    appState.srcDirCopyCut = fromPath
    appState.isCopyOrCut = 'copy'
    setCopyCutFileFlag(_isFile)
}

/**
 * 剪切文件或文件夹到剪贴板
 * @param fromPath 源路径
 * @param isFile 是否为文件
 */
export function FileManagerContextMenuCut(fromPath: string, _isFile: boolean): void {
    // P1-AS-1：剪切会删除源路径（fsExtra.remove），源路径必须受信
    if (!isPathAllowed(fromPath)) {
        notifyPathAccessDenied(fromPath, 'mainMsg.status.operationFailed')
        return
    }
    appState.srcDirCopyCut = fromPath
    appState.isCopyOrCut = 'cut'
    setCopyCutFileFlag(_isFile)
}

/**
 * 粘贴文件或文件夹
 * @param toPath 目标路径
 * @param isFile 是否为文件
 */
export async function FileManagerContextMenuPaste(toPath: string, isFile: boolean): Promise<void> {
    if (isFile) {
        showErrorMessageBox(tMain('mainMsg.file.pasteTargetNotDirectory'))
        return
    }

    const src = appState.srcDirCopyCut
    if (src.length === 0) {
        showErrorMessageBox(tMain('mainMsg.file.noCopyCutSource'))
        return
    }

    // P1-AS-1：源路径与目标目录都必须受信（源在复制/剪切时已校验，这里防御状态被外部改写）
    if (!isPathAllowed(src)) {
        notifyPathAccessDenied(src, 'mainMsg.status.operationFailed')
        return
    }
    if (!isPathAllowed(toPath)) {
        notifyPathAccessDenied(toPath, 'mainMsg.status.operationFailed')
        return
    }

    if (src === toPath) {
        showErrorMessageBox(tMain('mainMsg.file.sameSourceAndTarget'))
        return
    }

    // 先在目标目录中创建一个与原目录同名文件夹，返回进行拷贝。
    // 第 4 批 P3 清理：原手写 `Math.max(lastIndexOf('\\'), lastIndexOf('//')) + substring`
    // 再剥离前导分隔符的逻辑统一改用 Node `path.basename`（Windows 下结果一致；
    // POSIX 下正确处理正斜杠，不再把整段路径误当文件名）。
    const srcBaseName = basename(src)
    // 源名仍做文件名白名单校验，杜绝 ../ 拼出目标目录外路径（防御纵深，保留）
    if (!isSafeFileName(srcBaseName)) {
        notifyPathAccessDenied(src, 'mainMsg.status.operationFailed')
        return
    }
    const destPath = join(toPath, srcBaseName)
    if (!isPathAllowed(destPath)) {
        notifyPathAccessDenied(destPath, 'mainMsg.status.operationFailed')
        return
    }
    // 1.5.7 LLM Wiki L1（T1.3）：llm-wiki 模式下 raw/ 只读——
    // ① 目标目录/目标路径（粘贴写入）不得位于 raw/；② 剪切动作会删除源，源不得位于 raw/
    if (!ensureWorkspaceWritable(toPath) || !ensureWorkspaceWritable(destPath)) {
        return
    }
    if (appState.isCopyOrCut === 'cut' && !ensureWorkspaceWritable(src)) {
        return
    }
    try {
        await fs.access(destPath)
        showErrorMessageBox(tMain('mainMsg.file.fileOrFolderAlreadyExists', { path: destPath }))
        return
    } catch {
        // destPath doesn't exist, proceed
    }

    try {
        // fs-extra 的 copy 默认递归复制目录，无需 recursive 选项
        await fsExtra.copy(src, destPath)
    } catch (err) {
        // FE-32：复制失败把常见错误码映射为中文原因（未知错误保留原文+错误码），不再直出英文原始错误
        showErrorMessageBox(
            tMain('mainMsg.file.copyFailed', { message: DescribeFileSystemError(err) })
        )
        return
    }

    // 如果是剪切动作，需要删除原目录
    if (appState.isCopyOrCut === 'cut') {
        try {
            await fsExtra.remove(src)
        } catch (err) {
            // FE-32：剪切源删除失败同样映射中文原因
            showErrorMessageBox(
                tMain('mainMsg.file.deleteFailed', { message: DescribeFileSystemError(err) })
            )
            return
        }
    }

    setTimeout(async () => {
        appState.srcDirCopyCut = ''
        appState.isCopyOrCut = ''
        try {
            await ReloadDirFromDisk()
        } catch (err) {
            logger.error('Failed to reload from disk:', err)
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
            logger.error('Failed to reload from disk:', err)
        }
    }, reloadFromDiskTime)
}
