/**
 * 自动保存模块
 * 提供文件自动保存定时器功能
 * 注意：不直接从 file-operations 导入 SaveActiveFile，避免循环依赖
 */
import { appState } from '../app-state'

// 自动保存定时器
let autoSaveTimer: NodeJS.Timeout | null = null
let saveInterval = 30000 // 默认30秒

/**
 * 启动文件自动保存
 * @param interval 保存间隔时间（毫秒），默认30秒
 */
export function StartAutoSaveFileTime(interval: number = 30000): void {
    // 如果已经在运行，先停止
    if (autoSaveTimer) {
        StopAutoSaveFileTime()
    }

    saveInterval = interval
    appState.saveFileInterval = interval.toString()
    appState.savingFile = true

    // 启动定时器
    autoSaveTimer = setInterval(async () => {
        // 只有当文件有修改时才保存
        if (appState.currentActiveFile && appState.currentActiveFile.content) {
            // 延迟导入避免循环依赖
            const { SaveActiveFile } = require('./file-operations')
            try {
                await SaveActiveFile()
            } catch (err) {
                console.error('Auto-save failed:', err)
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
