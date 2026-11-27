/**
 * 文件打开协调器。
 *
 * 背景：未打开任何文件时编辑的内容属于“未命名草稿”，没有目标路径。
 * 直接打开文件树里的文件会触发既有 OPEN_SELECT_FILE 链路；修复前这段草稿可能
 * 被同步到主进程的活动文件，造成目标文件内容被覆盖。现在统一经本模块：
 *
 * 1. 没有草稿：直接打开；
 * 2. 有草稿：弹出「保存 / 不保存 / 取消」；
 *    - 保存：调用既有 IMPORT_NEW_FILE（系统另存为对话框 + 写盘）后再打开目标；
 *    - 不保存：清空草稿后打开目标；
 *    - 取消：保持当前编辑，不打开目标。
 */
import { IPC } from '../../../../shared/ipc-channels'
import type { FileProperties } from '../../../../shared/types'
import { logger } from '../../common/logger'
import { clearUntitledDraft, hasUntitledDraft, readUntitledDraft } from './untitled-draft'

interface ImportNewFileResultLike {
    success?: boolean
    filePath?: string
}

function sendOpenFile(fileProperties: FileProperties): boolean {
    try {
        const ipc = window.electron?.ipcRenderer
        if (!ipc || typeof ipc.send !== 'function') {
            return false
        }
        ipc.send(IPC.FILE.OPEN_SELECT_FILE, fileProperties)
        return true
    } catch (error) {
        logger.error('[OpenFile] 发送打开文件请求失败', error)
        return false
    }
}

/**
 * 把当前未命名草稿另存为文件。
 * 复用主进程既有 IMPORT_NEW_FILE：系统保存对话框选择位置/文件名，成功后打开新文件。
 * @returns 是否成功保存
 */
export async function saveUntitledDraftAs(content = readUntitledDraft()): Promise<boolean> {
    if (!content) {
        return false
    }
    try {
        const ipc = window.electron?.ipcRenderer
        if (!ipc || typeof ipc.invoke !== 'function') {
            logger.warn('[OpenFile] 当前环境不支持另存为，草稿保留在缓存中')
            return false
        }
        const result = (await ipc.invoke(
            IPC.FILE.IMPORT_NEW_FILE,
            content
        )) as ImportNewFileResultLike | null
        return result?.success === true
    } catch (error) {
        logger.error('[OpenFile] 保存未命名草稿失败', error)
        return false
    }
}

/**
 * 打开文件（带未命名草稿保护）。
 * @returns 是否已发出打开请求（取消/保存取消时为 false）
 */
export async function requestOpenFile(fileProperties: FileProperties): Promise<boolean> {
    if (!hasUntitledDraft()) {
        return sendOpenFile(fileProperties)
    }

    let choice: 'save' | 'discard' | 'cancel'
    try {
        const { showUntitledDraftPrompt } = await import('./untitled-draft-prompt')
        choice = await showUntitledDraftPrompt()
    } catch (error) {
        logger.error('[OpenFile] 无法显示未命名草稿确认框', error)
        return false
    }

    if (choice === 'cancel') {
        return false
    }

    if (choice === 'save') {
        const saved = await saveUntitledDraftAs()
        if (!saved) {
            // 用户在系统另存为对话框取消或写盘失败：保留草稿与当前编辑，不打开目标
            return false
        }
    }

    clearUntitledDraft()
    return sendOpenFile(fileProperties)
}
