/**
 * 自动保存模块
 * 提供文件自动保存定时器功能
 * ARC-11：循环依赖已解除（file-operations 改依赖 file-state-store），
 * 此处恢复静态 import，不再使用 require 延迟加载。
 */
import { appState } from '../app-state'
import { SaveActiveFile } from './file-operations'
import { logger } from '../logger'
import { IPC } from '../../../shared/ipc-channels'
import { tMain } from '../i18n'

// 自动保存定时器
let autoSaveTimer: NodeJS.Timeout | null = null

/**
 * 启动文件自动保存
 * @param interval 保存间隔时间（毫秒），默认30秒
 */
export function StartAutoSaveFileTime(interval: number = 30000): void {
    // 如果已经在运行，先停止
    if (autoSaveTimer) {
        StopAutoSaveFileTime()
    }

    appState.saveFileInterval = interval.toString()
    appState.savingFile = true

    // 启动定时器
    autoSaveTimer = setInterval(async () => {
        // D-1/FUN-05：仅当文件脏（与上次保存内容不同）时才写盘；
        // 空内容（content === ''）同样需要保存（用户清空文件也要落盘）。
        if (appState.currentActiveFile && appState.isDirty()) {
            try {
                await SaveActiveFile()
            } catch (err) {
                logger.error('Auto-save failed:', err)
                // D-1/FUN-05：保存失败通过现有状态栏事件通知渲染层，用户可见
                appState.mainWindow?.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                    message: tMain('mainMsg.status.autoSaveFailed', {
                        message: (err as Error).message
                    }),
                    type: 'error'
                })
            }
        }
    }, interval)
}

/**
 * 停止文件自动保存
 */
export function StopAutoSaveFileTime(): void {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer)
        autoSaveTimer = null
        appState.savingFile = false
    }
}

/**
 * 检查自动保存是否正在运行
 */
export function IsAutoSaveRunning(): boolean {
    return autoSaveTimer !== null
}
