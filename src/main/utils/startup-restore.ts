/**
 * 启动恢复（系统设置补充实现批次 A：#1/#2 启动恢复上次文件/目录）
 *
 * 当 system store 中 autoOpenLastFile / autoOpenLastFolder 为 true 时，应用启动
 * 主界面就绪后（ready-to-show，此时渲染层 App.vue 已挂载并注册 WELCOME_ENTER_MAIN
 * 监听器）自动执行与欢迎页入口相同的恢复动作：
 *   1. 先 send IPC.FILE.WELCOME_ENTER_MAIN（渲染层隐藏欢迎页、进入主界面并注册
 *      主界面组件的 IPC 监听器）；
 *   2. 再经 runAfterMainViewEntered（handlers.ts，FE-01 时序）投递数据事件：
 *      目录走 CLEAR_EDITOR_PREVIEW + ReloadDirFromDisk 链路，文件走 OpenSelectFile 链路。
 *
 * 文件/目录已不存在时：清除持久化记录、保持欢迎页（不发送 WELCOME_ENTER_MAIN），
 * 并经状态栏提示（i18n mainMsg.status.*）。全部复用既有 IPC 通道，不新增通道。
 *
 * 与 file-state.ts 的 restoreLastOpenedFile（后台恢复、不进入主界面）并存：
 * 两个自动打开开关均未开启时，index.ts 仍调用旧的后台恢复以保持历史行为
 * （show-welcome=false 用户依赖它恢复上次会话）。
 */

import * as fs from 'fs'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
// ARC-13：FileProperties 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileProperties, SystemSetting } from '../../shared/types'
import { appState, sendToMainWindow } from './app-state'
import { tMain } from './i18n'
import { logger } from './logger'
import { OpenSelectFile, ParserFileName, ReloadDirFromDisk } from './file-utils'
import {
    clearLastOpenedDirectory,
    clearLastOpenedFile,
    getLastOpenedDirectory,
    getLastOpenedFile,
    saveLastOpenedDirectory
} from './file-state-store'
import { runAfterMainViewEntered } from '../ipc/handlers'

/**
 * 发送 WELCOME_ENTER_MAIN（进入主界面），随后经 FE-01 时序执行恢复动作。
 * 启动场景下窗口必然存活（ready-to-show 回调内），仍做轻量 isDestroyed 兜底。
 */
function enterMainAndRun(
    mainWindow: BrowserWindow,
    payload: { type: 'file' | 'directory'; path: string },
    task: () => Promise<void> | void
): Promise<void> {
    mainWindow.webContents.send(IPC.FILE.WELCOME_ENTER_MAIN, payload)
    return runAfterMainViewEntered(() => {
        if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            return
        }
        return task()
    })
}

/**
 * 启动时按 autoOpenLastFile / autoOpenLastFolder 自动恢复上次打开的文件/目录。
 * 恢复顺序与历史行为一致：先目录后文件；两者都失败时停留在欢迎页并提示。
 *
 * @param mainWindow 主窗口（ready-to-show 时机传入，必然存活）
 * @param setting 当前系统设置（由调用方传入，避免重复读 store）
 */
export async function restoreLastOpenedAtStartup(
    mainWindow: BrowserWindow,
    setting: SystemSetting
): Promise<void> {
    const lastDir = getLastOpenedDirectory()
    const lastFile = getLastOpenedFile()

    // 1. 上次打开的目录
    if (setting.autoOpenLastFolder && typeof lastDir === 'string' && lastDir.length > 0) {
        if (!fs.existsSync(lastDir)) {
            clearLastOpenedDirectory()
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.startupRestoreFolderMissing', { path: lastDir }),
                type: 'warning'
            })
        } else {
            try {
                await enterMainAndRun(
                    mainWindow,
                    { type: 'directory', path: lastDir },
                    async () => {
                        mainWindow.webContents.send(IPC.FILE.CLEAR_EDITOR_PREVIEW)
                        appState.rootPath = lastDir
                        await ReloadDirFromDisk()
                        saveLastOpenedDirectory(lastDir)
                    }
                )
            } catch (error) {
                logger.error('[StartupRestore] 自动恢复上次打开的目录失败:', error)
                clearLastOpenedDirectory()
                sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                    message: tMain('mainMsg.status.startupRestoreFailed', {
                        message: error instanceof Error ? error.message : String(error)
                    }),
                    type: 'error'
                })
            }
        }
    }

    // 2. 上次打开的文件（目录恢复后仍继续，保持"目录 + 文件"的完整恢复语义）
    if (setting.autoOpenLastFile && typeof lastFile === 'string' && lastFile.length > 0) {
        if (!fs.existsSync(lastFile)) {
            clearLastOpenedFile()
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.startupRestoreFileMissing', { path: lastFile }),
                type: 'warning'
            })
            return
        }
        // 路径守卫（P1-AS-1）：lastOpenedFile 属于 file-state「最近打开」受信历史，
        // security.ts 的受信历史 provider 已覆盖该路径，OpenSelectFile 无需额外登记。
        const fileProperties: FileProperties = {
            name: ParserFileName(lastFile),
            path: lastFile,
            type: 'file',
            content: ''
        }
        try {
            await enterMainAndRun(mainWindow, { type: 'file', path: lastFile }, async () => {
                await OpenSelectFile(fileProperties)
            })
        } catch (error) {
            logger.error('[StartupRestore] 自动恢复上次打开的文件失败:', error)
            clearLastOpenedFile()
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.startupRestoreFailed', {
                    message: error instanceof Error ? error.message : String(error)
                }),
                type: 'error'
            })
        }
    }
}
