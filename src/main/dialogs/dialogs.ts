/**
 * 主进程对话框入口（结构优化第 2 批 2.1 / H3：双对话框体系收敛）
 *
 * ## 迁移结论
 * 原主进程 JSDOM 对话框（ShowShortcutKeysDialog / ShowUpdateLogDialog /
 * ShowReleaseNotesDialog / ShowRenameDialog / ShowCreateFileFolderDialog，以及
 * 基于 electron `dialog.showMessageBox` 的 ShowConfirmDeleteDialog）已全部删除，
 * 改为「渲染层 Vue + BaseDialog」：
 * - 主进程只负责**请求渲染层打开对话框**：`IPC.DIALOG.OPEN_VUE_DIALOG`
 *   （payload 契约见 src/shared/types/dialog.ts）；
 * - 用户在 Vue 对话框确认后，渲染层经既有/新增的 invoke 通道提交动作：
 *   - 新建文件/文件夹 → 既有 `IPC.FILE.CREATE_FILE_FOLDER`（handlers.ts，不在本文件范围）；
 *   - 重命名 → `IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT`（本文件注册）；
 *   - 删除 → `IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM`（本文件注册）。
 * - 本文件不再创建任何 BrowserWindow；唯一保留的独立窗口是
 *   「在线网页窗口」（OpenOnlineWebPages，确有独立 BrowserWindow 需求）。
 *
 * 结构优化第 2 批 2.3（H6）：原 jsdom 助手 dialog-defaults.ts 已删除，
 * 其仍在使用的 createDialogOptions / DIALOG_WEB_PREFERENCES 归并到
 * OpenOnlineWebPages.ts；主进程源码不再有任何 jsdom 运行时引用。
 *
 * ## 文件管理器右键通道（P1/N-05 安全边界保持不变）
 * 新建/导入/删除/重命名/定位为文件系统高风险入口，统一校验发送方必须为主窗口；
 * 右键通道触发后仅「转发」为 Vue 对话框请求，不再在扩展进程中弹 HTML 对话框。
 */

import { shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { DialogActionResult } from '../../shared/types/ipc'
import {
    DeleteFileFolder,
    InsertImportFormFile,
    RenameFileFolder,
    showErrorMessageBox
} from '../utils/file-utils'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
import { tMain } from '../utils/i18n'
// P1/N-05：文件管理器右键通道统一校验发送方必须为主窗口
import { setTrustedMainWindow, withSenderCheck } from '../utils/ipc-security'
// AS-8：资源管理器定位目标路径校验（拒绝 UNC/设备命名空间，仅允许受信根内路径）
import { isSafeShowItemInFolderPath } from '../utils/security'
import { logger } from '../utils/logger'

// 结构优化第 2 批 2.1：保留在线网页窗口（独立 BrowserWindow 需求）的导出路径，
// 菜单 handler 仍从本模块引用，避免调用方感知文件结构调整。
export { OpenOnlineWebPage } from './OpenOnlineWebPages'

/** 主进程 IPC 监听台账中的组件标识（窗口 closed 时按它清理 on 通道监听） */
const MAIN_WINDOW_DIALOGS_COMPONENT_ID = 'main-window-dialogs'

/* ============================================================================
 * 一、帮助类 Vue 对话框请求（原 JSDOM Show*Dialog → OPEN_VUE_DIALOG）
 * ========================================================================== */

/**
 * 请求渲染层打开「键盘快捷键」Vue 对话框（帮助 → 快捷键）。
 * 由 menu-help 的 shortkeys handler 调用。
 */
export function RequestShortcutKeysDialog(mainWindow: BrowserWindow): void {
    mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'shortcutKeys')
}

/**
 * 请求渲染层打开「更新日志」Vue 对话框（帮助 → 修改日志）。
 * 由 menu-help 的 'update-log' handler 调用。
 */
export function RequestUpdateLogDialog(mainWindow: BrowserWindow): void {
    mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'updateLog')
}

/**
 * 请求渲染层打开「版本发布说明」Vue 对话框（帮助 → 版本发布子菜单）。
 * @param version 发布版本号（如 '1.3.5'），渲染层按版本号查找发布说明数据
 */
export function RequestReleaseNotesDialog(mainWindow: BrowserWindow, version: string): void {
    mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'releaseNotes', { version })
}

/* ============================================================================
 * 二、文件管理器右键动作 → Vue 对话框请求 / 确认动作执行
 * ========================================================================== */

/**
 * 注册主窗口的文件管理器右键通道监听（新建/导入/删除/重命名/定位）。
 *
 * - 新建文件/文件夹、重命名、删除：转发为渲染层 Vue 对话框请求，
 *   由用户在 Vue 对话框中确认后经 invoke 提交动作；
 * - 导入、在文件夹中显示：行为不变（不涉及对话框/仅系统 shell）。
 */
export function MainWindowListenDialogsEvent(mainWindow: BrowserWindow): void {
    // P1/N-05：注册即登记受信主窗口（sender 校验依据；与 setMainWindow 同源）
    setTrustedMainWindow(mainWindow)

    // 新建文件/文件夹：统一为渲染层 CreateFileFolderDialog（菜单「新建」与右键「新建」
    // 由此收敛到同一 Vue 对话框 + 同一 IPC.FILE.CREATE_FILE_FOLDER 动作，消除双路径）。
    // 渲染层文件管理器右键「新建」区分文件/文件夹/ Markdown 三个入口，历史上通过
    // isFolder/fileExtension 传给 JSDOM 对话框；Vue 对话框内部用「新建文件/新建文件夹」
    // 两个按钮表达该选择，故这里只透传目标目录 dirPath（契约见 CreateFileFolderDialogData）。
    ipcListenerManager.register(
        IPC.FILE_MANAGER.CREATE_FILE,
        withSenderCheck(IPC.FILE_MANAGER.CREATE_FILE, (_, dirPath: string) => {
            mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'createFileFolder', {
                dirPath
            })
        }),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )

    ipcListenerManager.register(
        IPC.FILE_MANAGER.IMPORT_FROM,
        withSenderCheck(IPC.FILE_MANAGER.IMPORT_FROM, (_, fileType: string) => {
            // FUN-24：右键"导入"复用主菜单的文本导入流程
            // （打开文件对话框 + 编码探测 + 插入编辑器光标处），入口真正可用
            const type = typeof fileType === 'string' && fileType ? fileType : 'text'
            void InsertImportFormFile(mainWindow, type, false).catch((err: unknown) => {
                logger.error('右键菜单导入失败:', err)
            })
        }),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )

    // 删除：先请求渲染层 Vue ConfirmDeleteDialog；用户确认后经
    // DELETE_FILE_FOLDER_CONFIRM invoke 回到主进程执行（删除动作仍在主进程，含路径守卫）。
    ipcListenerManager.register(
        IPC.FILE_MANAGER.DELETE,
        withSenderCheck(IPC.FILE_MANAGER.DELETE, (_, path: string, isFile: boolean) => {
            mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'confirmDelete', {
                path,
                isFile
            })
        }),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )

    ipcListenerManager.register(
        IPC.FILE_MANAGER.FIND_IN,
        withSenderCheck(IPC.FILE_MANAGER.FIND_IN, (_, targetPath: string) => {
            // FUN-24：右键"在文件夹中显示"接 shell.showItemInFolder，
            // 在系统资源管理器中定位该文件/文件夹
            // AS-8：目标路径必须位于受信根内，且拒绝 UNC/设备命名空间（NTLM 泄露面）
            if (!isSafeShowItemInFolderPath(targetPath)) {
                logger.warn('[Security] 已拒绝在资源管理器中定位不受信的路径（AS-8）:', targetPath)
                return
            }
            shell.showItemInFolder(targetPath)
        }),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )

    // 重命名：先请求渲染层 Vue RenameFileFolderDialog；用户确认后经
    // RENAME_FILE_FOLDER_SUBMIT invoke 回到主进程执行。
    ipcListenerManager.register(
        IPC.FILE_MANAGER.RENAME,
        withSenderCheck(IPC.FILE_MANAGER.RENAME, (_, path: string, isFile: boolean) => {
            mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'renameFileFolder', {
                path,
                isFile
            })
        }),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )

    registerRenameSubmitHandler()
    registerDeleteConfirmHandler()
}

/**
 * 重命名确认动作（渲染层 Vue 对话框 → 主进程 invoke）。
 *
 * FE-09 行为保持：失败不静默——经 Vue 消息对话框提示失败原因、返回 ok=false，
 * 渲染层据此保留重命名对话框供用户改名重试；成功返回 ok=true，渲染层关闭对话框。
 * 安全：与文件管理器通道同级，仅受信主窗口可提交（withSenderCheck）。
 */
function registerRenameSubmitHandler(): void {
    ipcListenerManager.registerHandleOnce(
        IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
        withSenderCheck(
            IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
            async (
                _event: Electron.IpcMainInvokeEvent,
                path: string,
                isFile: boolean,
                newName: string
            ): Promise<DialogActionResult> => {
                try {
                    await RenameFileFolder(path, newName, isFile)
                    return { ok: true }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    showErrorMessageBox(
                        tMain('dialogMain.rename.renameFailed', { path, error: message })
                    )
                    return { ok: false, error: message }
                }
            },
            { kind: 'handle' }
        ),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )
}

/**
 * 删除确认动作（渲染层 Vue 对话框 → 主进程 invoke）。
 *
 * 删除仍由主进程执行并保留既有路径守卫/失败提示（DeleteFileFolder 内部提示）；
 * 返回 ok 便于渲染层决定关闭对话框。安全：仅受信主窗口可提交。
 */
function registerDeleteConfirmHandler(): void {
    ipcListenerManager.registerHandleOnce(
        IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM,
        withSenderCheck(
            IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM,
            async (
                _event: Electron.IpcMainInvokeEvent,
                path: string,
                isFile: boolean
            ): Promise<DialogActionResult> => {
                try {
                    await DeleteFileFolder(path, isFile)
                    return { ok: true }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    showErrorMessageBox(message)
                    return { ok: false, error: message }
                }
            },
            { kind: 'handle' }
        ),
        MAIN_WINDOW_DIALOGS_COMPONENT_ID
    )
}

/**
 * 清理主窗口对话框相关的 on 通道监听与确认动作 handle 注册。
 *
 * 说明：确认动作（ipcMain.handle）经 registerHandleOnce 注册，防重复注册；
 * 窗口关闭时随 componentId 一并清理，主窗口重建（macOS activate 等）时
 * MainWindowListenDialogsEvent 再次执行会重新注册，保证重建后仍可用。
 */
export function CleanupMainWindowDialogsEvent(): void {
    ipcListenerManager.cleanupComponent(MAIN_WINDOW_DIALOGS_COMPONENT_ID)
}
