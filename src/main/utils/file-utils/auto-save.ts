/**
 * 自动保存模块
 * 提供文件自动保存定时器功能
 * 注意：不直接从 file-operations 导入 SaveActiveFile，避免循环依赖
 */

// 自动保存定时器
let autoSaveTimer: NodeJS.Timeout | null = null
let saveInterval = 30000 // 默认30秒

/**
 * 启动文件自动保存
 * @param interval 保存间隔时间（毫秒），默认30秒
 */
export function StartAutoSaveFileTime(interval: number = 30000): void {
    return
    // 如果已经在运行，先停止
    if (autoSaveTimer) {
        StopAutoSaveFileTime()
    }

    saveInterval = interval
    global.SaveFileInterval = interval.toString()
    global.SavingFile = true

    // 启动定时器
    autoSaveTimer = setInterval(() => {
        // 只有当文件有修改时才保存
        if (global.current_active_file && global.current_active_file.content) {
            // 延迟导入避免循环依赖
            const { SaveActiveFile } = require('./file-operations')
            SaveActiveFile()
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
        global.SavingFile = false
    }
}

/**
 * 检查自动保存是否正在运行
 */
export function IsAutoSaveRunning(): boolean {
    return autoSaveTimer !== null
}
