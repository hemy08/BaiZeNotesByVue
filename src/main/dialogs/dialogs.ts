import { OpenOnlineWebPage } from './OpenOnlineWebPages'
import { ShowCreateFileFolderDialog } from './ShowCreateFileFolderDialog'
import { ShowFileFolderRenameDialog } from './ShowRenameDialog'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
import { ShowUpdateLogDialog } from './ShowUpdateLogDialog'
import { ShowReleaseNotesDialog } from './ShowReleaseNotesDialog'
import { ShowShortcutKeysDialog } from './ShowShortcutKeysDialog'
import { dialog, shell } from 'electron'
import { DeleteFileFolder, InsertImportFormFile } from '../utils/file-utils'
import { IPC } from '../../shared/ipc-channels'
import { tMain } from '../utils/i18n'
// P1/N-05：文件管理器右键通道（新建/导入/删除/重命名/定位）为文件系统高风险入口，
// 统一校验发送方必须为主窗口
import { setTrustedMainWindow, withSenderCheck } from '../utils/ipc-security'
// AS-8：资源管理器定位目标路径校验（拒绝 UNC/设备命名空间，仅允许受信根内路径）
import { isSafeShowItemInFolderPath } from '../utils/security'
import { logger } from '../utils/logger'

async function ShowConfirmDeleteDialog(path: string, isFile: boolean) {
    try {
        const result = await dialog.showMessageBox({
            type: 'question',
            buttons: [tMain('dialogMain.confirmDelete.yes'), tMain('dialogMain.confirmDelete.no')],
            title: tMain('dialogMain.confirmDelete.title'),
            message: tMain('dialogMain.confirmDelete.message', { path })
        })
        if (result.response === 0) {
            await DeleteFileFolder(path, isFile)
        }
    } catch (err) {
        logger.error('显示对话框时出错:', err)
    }
}

export {
    OpenOnlineWebPage,
    ShowCreateFileFolderDialog,
    ShowFileFolderRenameDialog,
    ShowConfirmDeleteDialog,
    ShowUpdateLogDialog,
    ShowReleaseNotesDialog,
    ShowShortcutKeysDialog
}

export function MainWindowListenDialogsEvent(mainWindow: Electron.BrowserWindow) {
    const componentId = 'main-window-dialogs'
    // P1/N-05：注册即登记受信主窗口（sender 校验依据；与 setMainWindow 同源）
    setTrustedMainWindow(mainWindow)

    ipcListenerManager.register(
        IPC.FILE_MANAGER.CREATE_FILE,
        withSenderCheck(IPC.FILE_MANAGER.CREATE_FILE, (_, dirPath, isFolder, fileExtension) => {
            ShowCreateFileFolderDialog(dirPath, isFolder, fileExtension)
        }),
        componentId
    )

    ipcListenerManager.register(
        IPC.FILE_MANAGER.IMPORT_FROM,
        withSenderCheck(IPC.FILE_MANAGER.IMPORT_FROM, (_, fileType) => {
            // FUN-24：右键"导入"复用主菜单的文本导入流程
            // （打开文件对话框 + 编码探测 + 插入编辑器光标处），入口真正可用
            const type = typeof fileType === 'string' && fileType ? fileType : 'text'
            void InsertImportFormFile(mainWindow, type, false).catch((err: unknown) => {
                logger.error('右键菜单导入失败:', err)
            })
        }),
        componentId
    )

    ipcListenerManager.register(
        IPC.FILE_MANAGER.DELETE,
        withSenderCheck(IPC.FILE_MANAGER.DELETE, (_, value, isFile) => {
            ShowConfirmDeleteDialog(value, isFile)
        }),
        componentId
    )

    ipcListenerManager.register(
        IPC.FILE_MANAGER.FIND_IN,
        withSenderCheck(IPC.FILE_MANAGER.FIND_IN, (_, targetPath) => {
            // FUN-24：右键"在文件夹中显示"接 shell.showItemInFolder，
            // 在系统资源管理器中定位该文件/文件夹
            // AS-8：目标路径必须位于受信根内，且拒绝 UNC/设备命名空间（NTLM 泄露面）
            if (!isSafeShowItemInFolderPath(targetPath)) {
                logger.warn('[Security] 已拒绝在资源管理器中定位不受信的路径（AS-8）:', targetPath)
                return
            }
            shell.showItemInFolder(targetPath as string)
        }),
        componentId
    )

    ipcListenerManager.register(
        IPC.FILE_MANAGER.RENAME,
        withSenderCheck(IPC.FILE_MANAGER.RENAME, (_, path, isFile) => {
            ShowFileFolderRenameDialog(path, isFile)
        }),
        componentId
    )
}

export function CleanupMainWindowDialogsEvent() {
    ipcListenerManager.cleanupComponent('main-window-dialogs')
}
