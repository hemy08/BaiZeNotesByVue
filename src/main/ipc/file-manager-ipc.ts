/**
 * IPC 注册收口（P2 架构债）：文件打开 / 文件管理器右键动作 / 插入图片
 *
 * 从 `src/main/utils/utils.ts` 的 `MainWindowListenUtilsEvent` 按域拆出，通道集合、
 * 注册方式（on/handle）、sender 校验、日志与返回契约均保持不变：
 * - 打开用户选择后的本地文件（FILE.OPEN_SELECT_FILE）；
 * - 文件管理器右键动作：复制相对路径 / 图片链接 / 文件链接 / 复制 / 剪切 / 粘贴 /
 *   在资源管理器中打开 / 从磁盘重载（FILE_MANAGER.*，均为文件系统高风险 send 通道，
 *   仅接受主窗口发送方）；
 * - 插入图片（RENDER.INSERT_IMAGE）：写入 ./images/ 后回推 Markdown 模板。
 *
 * 注册顺序约束：本模块内通道顺序与拆分前一致；入口 `utils-ipc.ts` 按拆分前顺序调用
 * 各域模块，保证进程级 IPC 台账（MEM-10 inventory）与启动期注册序列不变。
 */
import type { BrowserWindow } from 'electron'
import * as FileUtils from '../utils/file-utils/index'
import { ipcListenerManager } from './ipc-listener-manager'
import { notifyIpcAsyncError } from '../utils/error-report'
import { withSenderCheck } from '../utils/ipc-security'
import { IPC } from '../../shared/ipc-channels'
import type { FileProperties } from '../../shared/types'

/**
 * 注册「文件打开 + 文件管理器右键 + 插入图片」域 IPC（切换主窗口：窗口级 sender 校验依据）。
 *
 * @param mainWindow 主窗口（注册时登记为受信发送方；回调内取活窗口发送数据事件）
 * @param componentId 监听台账组件 ID（拆分前统一为 `global-utils-ipc`，保持不变）
 */
export function registerFileManagerIpc(mainWindow: BrowserWindow, componentId: string): void {
    // P1/N-05：打开文件（读取用户选择后的本地文件）仅主窗口可信
    ipcListenerManager.registerOnce(
        IPC.FILE.OPEN_SELECT_FILE,
        withSenderCheck(
            IPC.FILE.OPEN_SELECT_FILE,
            async (_: Electron.IpcMainEvent, message: FileProperties) => {
                try {
                    await FileUtils.OpenSelectFile(message)
                } catch (error) {
                    notifyIpcAsyncError(mainWindow, IPC.FILE.OPEN_SELECT_FILE, error)
                }
            }
        ),
        componentId
    )

    // PF-02：预览渲染已收敛到渲染层单跳链路（preview-local-render.ts），
    // 不再注册 PRE_RENDER / POST_RENDER 主进程渲染通道。

    // P1/N-05：文件管理器右键动作（路径复制/剪切/粘贴/定位）与文件系统相关，
    // 统一仅接受主窗口发送方（send 通道：非法 sender 直接 return）。
    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_RELATIVE_PATH,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_RELATIVE_PATH,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.CopyRelativePath(path)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_IMAGELINK,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_IMAGELINK,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.CopyImageLink(path)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_FILELINK,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_FILELINK,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.CopyFileLink(path)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_FILE,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_FILE,
            (_: Electron.IpcMainEvent, path: string, isFile: boolean) => {
                FileUtils.FileManagerContextMenuCopy(path, isFile)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.CUT,
        withSenderCheck(
            IPC.FILE_MANAGER.CUT,
            (_: Electron.IpcMainEvent, path: string, isFile: boolean) => {
                FileUtils.FileManagerContextMenuCut(path, isFile)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.PASTE,
        withSenderCheck(
            IPC.FILE_MANAGER.PASTE,
            (_: Electron.IpcMainEvent, value: string, isFile: boolean) => {
                FileUtils.FileManagerContextMenuPaste(value, isFile)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.OPEN_IN_EXPLORER,
        withSenderCheck(
            IPC.FILE_MANAGER.OPEN_IN_EXPLORER,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.OpenFolderExplorer(path)
            }
        ),
        componentId
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.RELOAD_FROM_DISK,
        withSenderCheck(IPC.FILE_MANAGER.RELOAD_FROM_DISK, async () => {
            try {
                await FileUtils.ReloadDirFromDisk()
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.FILE_MANAGER.RELOAD_FROM_DISK, error)
            }
        }),
        componentId
    )

    // P1/N-05：插入图片会写入 ./images/ 磁盘文件，仅主窗口可信
    ipcListenerManager.registerOnce(
        IPC.RENDER.INSERT_IMAGE,
        withSenderCheck(IPC.RENDER.INSERT_IMAGE, async (_, context: string) => {
            try {
                const imageName = await FileUtils.InsertImagesToFile(context)
                if (imageName.length !== 0) {
                    mainWindow.webContents.send(
                        IPC.MONACO.TEXT_BLOCK_TEMPLATES,
                        '\r\n\r\n![](./images/' + imageName + ')\r\n\r\n'
                    )
                }
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.RENDER.INSERT_IMAGE, error)
            }
        }),
        componentId
    )
}
