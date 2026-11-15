/**
 * P1/C-03：主进程主题广播单一实现
 *
 * 背景：主题更新原先有两套实现：
 * 1. src/main/index.ts 的 THEME.UPDATE_THEME 监听回调里内联遍历
 *    BrowserWindow.getAllWindows() 向所有窗口 send THEME.THEME_UPDATED；
 * 2. 已删除的 JSDOM 主题设置对话框在 ipcMain.on 回调里误用渲染层全局
 *    `window.electronAPI.broadcastTheme(...)`——主进程没有 window 全局，回调执行到
 *    广播处会抛 ReferenceError（dialogs.test.ts 旧版需 stubGlobal('window') 才能通过）。
 *
 * C-03 收口：把"向所有存活窗口广播主题"抽成主进程独立函数，统一由此模块实现，
 * 任何主进程侧主题广播（index.ts 的 UPDATE_THEME、配置写后的主题应用）都复用本函数；
 * 主进程内禁止再出现 `window.electronAPI` 形式的跨进程调用。
 */
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { logger } from '../utils/logger'

/** 主题广播载荷：与渲染层 handleThemeUpdate 的期望形态保持一致 */
export interface ThemeBroadcastPayload {
    /** 最新主题样式（ThemeStyles 对象；保持 unknown 以避免与本模块耦合主题注册表） */
    themeStyles: unknown
    /** Monaco 主题名 */
    monacoTheme: string
    /** 编辑器是否使用独立主题 */
    separateEditorTheme: boolean
}

/**
 * 向所有存活窗口广播主题更新（主进程唯一广播实现）。
 *
 * - 遍历 BrowserWindow.getAllWindows()，逐个过滤 isDestroyed() 的窗口；
 * - 单个窗口 send 抛错（窗口销毁竞态）只告警，不影响其余窗口；
 * - 返回成功发送的窗口数量（供测试与诊断断言）。
 */
export function broadcastThemeToAllWindows(payload: ThemeBroadcastPayload): number {
    const windows = BrowserWindow.getAllWindows()
    let sentCount = 0
    for (const window of windows) {
        if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) {
            continue
        }
        try {
            window.webContents.send(IPC.THEME.THEME_UPDATED, payload)
            sentCount += 1
        } catch (error) {
            logger.warn('[Theme] 主题广播失败（窗口可能已销毁）:', error)
        }
    }
    return sentCount
}
