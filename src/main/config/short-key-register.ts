/**
 * 全局快捷键注册模块
 * 用于注册应用级别的全局快捷键
 *
 * FUN-26：统一在既有 globalShortcut 机制上补齐菜单展示但此前未绑定的快捷键，
 * 动作语义与菜单点击保持一致（通道名与既有机制一致，与 F9-F12 直接 send 相同通道的模式对齐）：
 * - Ctrl+N / Ctrl+O / Ctrl+R / Ctrl+Shift+R / F4 此前仅有菜单展示文案、无任何绑定，
 *   现通过 globalShortcut 实际注册；
 * - Ctrl+S 已由编辑器侧绑定（hemy-editor-shortcut.ts 的 Monaco addCommand +
 *   MarkdownEditComponent.vue 窗口级监听），不再全局重复注册（否则会抢占键盘事件、
 *   破坏"先 flush 再落盘"的保存契约）；
 * - Ctrl+Z/Y/X/C/V/F/H/G 为 Monaco 原生键绑定（撤销/重做/剪贴板/查找替换/跳行），
 *   编辑器聚焦时即生效，菜单标注如实保留。
 *
 * AS-12（P3）安全加固：
 * 1. F12 打开/关闭 DevTools 仅开发环境注册（生产包不允许通过全局热键打开开发者工具，
 *    否则配合渲染层能力可绕过"生产禁用 DevTools"的默认保护）；
 * 2. 快捷键只注册一次：macOS activate 重建窗口时再次调用本函数只更新目标窗口引用，
 *    不再重复 globalShortcut.register（重复注册会返回 false 且旧回调仍绑定已销毁窗口，
 *    表现为热键失效或向已销毁 webContents 发送而抛错）；
 * 3. 回调发送前取"存活的目标窗口"，窗口已销毁时跳过发送并降级为警告日志。
 *
 * 注意：globalShortcut 为系统级热键（应用失焦时仍会抢占按键，与既有 F9-F12 机制一致），
 * 建议后续迁移到 webContents before-input-event 窗口级注册（见 r2-func-menu-changes.md 遗留项）。
 */

import { app, globalShortcut } from 'electron'
import { is } from '@electron-toolkit/utils'
import { OpenDirectory, ReloadDirFromDisk, GetCurrentFileDirectory } from '../utils/file-utils'
import { logger } from '../utils/logger'
import { IPC } from '../../shared/ipc-channels'

/** AS-12：是否已完成一次注册（进程级；macOS activate 重建窗口只更新目标窗口） */
let shortcutsRegistered = false
/** AS-12：当前快捷键动作应作用的目标窗口（重建窗口时由 RegisterShortKeys 更新） */
let targetWindow: Electron.BrowserWindow | null = null

/** 取仍存活的目标窗口；窗口已销毁/缺失时返回 null（调用方跳过动作） */
function getLiveTargetWindow(): Electron.BrowserWindow | null {
    if (!targetWindow) {
        return null
    }
    try {
        const destroyed =
            typeof targetWindow.isDestroyed === 'function' ? targetWindow.isDestroyed() : false
        return destroyed ? null : targetWindow
    } catch {
        return null
    }
}

/** AS-12：向存活目标窗口发送通道消息；窗口不可用/发送异常时记录警告不抛出 */
function sendToLiveWindow(channel: string, ...args: unknown[]): void {
    const win = getLiveTargetWindow()
    if (!win) {
        logger.warn(`[ShortKey] 目标窗口不可用，跳过快捷键动作：${channel}`)
        return
    }
    try {
        win.webContents.send(channel, ...args)
    } catch (error) {
        logger.warn(`[ShortKey] 快捷键消息发送失败：${channel}`, error)
    }
}

/** AS-12：重置注册状态（仅供单元测试隔离；生产不得调用） */
export function resetShortKeysForTesting(): void {
    shortcutsRegistered = false
    targetWindow = null
}

export function RegisterShortKeys(mainWindow: Electron.BrowserWindow): void {
    // AS-12：重建窗口时只更新目标引用，不重复注册（避免旧回调残留 + register 返回 false）
    targetWindow = mainWindow
    if (shortcutsRegistered) {
        return
    }
    shortcutsRegistered = true

    // 注册辅助函数：注册失败（如被系统/其他应用占用）时打日志，不中断其余快捷键注册
    const register = (accelerator: string, callback: () => void): void => {
        const ok = globalShortcut.register(accelerator, callback)
        if (!ok) {
            logger.warn(`[ShortKey] 注册快捷键失败（可能已被占用）: ${accelerator}`)
        }
    }

    // ========== 视图切换（既有机制，保持原样） ==========

    register('F9', () => {
        sendToLiveWindow(IPC.VIEW.EDIT_MODE, null)
    })

    register('F10', () => {
        sendToLiveWindow(IPC.VIEW.PREVIEW_MODE, null)
    })

    register('F11', () => {
        sendToLiveWindow(IPC.VIEW.EDIT_PREVIEW_MODE, null)
    })

    // AS-12：仅开发环境注册 F12 DevTools 热键，生产包不提供"一键打开 DevTools"入口
    if (is.dev) {
        register('F12', () => {
            const win = getLiveTargetWindow()
            if (!win) {
                return
            }
            if (win.webContents.isDevToolsOpened()) {
                win.webContents.closeDevTools()
            } else {
                win.webContents.openDevTools()
            }
        })
    }

    // ========== FUN-26：补齐菜单标注但此前未绑定的文件菜单快捷键 ==========

    // Ctrl+N 新建：'baize:menu:file:new' 由渲染层 menu_actions.ts 接管
    // （先取当前文件目录再打开"创建文件/文件夹"对话框）。主进程侧直接取当前目录后
    // 走同一 'baize:dialog:open-vue' 通道（渲染层 handleOpenVueDialog → showDialog），
    // 行为与菜单点击一致。
    register('Ctrl+N', () => {
        sendToLiveWindow(IPC.DIALOG.OPEN_VUE_DIALOG, 'createFileFolder', {
            dirPath: GetCurrentFileDirectory()
        })
    })

    // Ctrl+O 打开文件夹：与菜单 'baize:menu:file:open-folder' 的主进程 handler 一致
    //（OpenDirectory 打开目录选择框）
    register('Ctrl+O', () => {
        const win = getLiveTargetWindow()
        if (win) {
            OpenDirectory(win).catch((err: unknown) => {
                logger.error('[ShortKey] 打开文件夹失败:', err)
            })
        }
    })

    // Ctrl+R 从磁盘重新加载：与菜单 'baize:menu:file:reload' 的 handler 一致
    //（ReloadDirFromDisk，含第一轮 D-6 脏状态保护）
    register('Ctrl+R', () => {
        ReloadDirFromDisk().catch((err: unknown) => {
            logger.error('[ShortKey] 从磁盘重新加载失败:', err)
        })
    })

    // Ctrl+Shift+R 重启应用：与菜单 'baize:menu:file:relaunch' 的 handler 一致
    register('Ctrl+Shift+R', () => {
        app.relaunch()
        app.quit()
    })

    // F4 退出：与菜单 'baize:menu:file:exit' 的 handler 一致（退出前落盘由
    // before-quit 的 flush→脏则保存链路兜底）
    register('F4', () => {
        app.quit()
    })
}
