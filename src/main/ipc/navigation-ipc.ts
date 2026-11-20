/**
 * IPC 注册收口（P2 架构债）：导航类高风险通道（执行本地可执行文件）
 *
 * 从 `src/main/utils/utils.ts` 的 `MainWindowListenUtilsEvent` 按域拆出，
 * 唯一通道 NAVIGATION.OPEN_EXE 的多重安全校验原样保留（与拆分前逐行一致）：
 * 1) 发送方必须是主窗口（远程网页/对话框窗口一律拒绝）；
 * 2) 路径必须是绝对路径、存在且为普通文件；
 * 3) AS-7 扩展名白名单（.exe/.com 与脚本/快捷方式/安装包类扩展名）；
 * 4) P3-2 一律弹主进程级确认（系统敏感目录/用户可写目录使用强化文案与审计日志）。
 */
import { dialog, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
// 可执行文件扩展名白名单 / 系统敏感目录判定（纯策略函数保留在 utils 层，IPC 层只消费）
import {
    getExecutableExtensionDecision,
    isSensitiveSystemExecutablePath,
    isUserWritableExecutablePath
} from '../utils/utils'
import { ipcListenerManager } from './ipc-listener-manager'
import { notifyIpcAsyncError } from '../utils/error-report'
import { assertTrustedSender } from '../utils/ipc-security'
import { tMain } from '../utils/i18n'
import { logger } from '../utils/logger'
import { IPC } from '../../shared/ipc-channels'

/**
 * 注册导航域 IPC（当前仅 OPEN_EXE 一个通道）。
 *
 * @param mainWindow 主窗口（确认框与错误提示目标）
 * @param componentId 监听台账组件 ID（拆分前统一为 `global-utils-ipc`，保持不变）
 */
export function registerNavigationIpc(mainWindow: BrowserWindow, componentId: string): void {
    // ARC-01 / P3-2：navi-tab-open-exe 为"能力型"通道（执行任意本地程序），必须多重校验：
    // 1) 发送方必须是主窗口（远程网页/对话框窗口一律拒绝）；
    // 2) 路径必须是绝对路径、存在且为普通文件（AS-7 增加 isFile 校验，排除目录/设备）；
    // 3) AS-7 扩展名白名单：仅 .exe/.com 与脚本/快捷方式/安装包类扩展名（.bat/.cmd/.lnk/
    //    .msi/.ps1 等）允许进入确认流程；白名单外扩展名直接拒绝；
    // 4) P3-2：无论目标位于哪个目录，一律弹主进程级确认（系统敏感目录/用户可写目录使用
    //    强化文案与审计日志）——渲染层取得脚本执行能力后不能无提示拉起可执行文件。
    ipcListenerManager.registerOnce(
        IPC.NAVIGATION.OPEN_EXE,
        async (event: Electron.IpcMainEvent, exePath: string) => {
            try {
                // 1) 发送方校验统一走 ipc-security（主窗口 webContents 严格匹配；
                //    其他窗口/远程页面一律拒绝并 console.warn）
                if (!assertTrustedSender(event, { channel: IPC.NAVIGATION.OPEN_EXE })) {
                    return
                }

                // 2) 路径校验：拒绝相对路径、不存在的路径与非字符串入参
                if (
                    typeof exePath !== 'string' ||
                    !path.isAbsolute(exePath) ||
                    !fs.existsSync(exePath)
                ) {
                    logger.warn('[Security] navi-tab-open-exe：拒绝非法路径', exePath)
                    return
                }
                let stats: fs.Stats
                try {
                    stats = fs.statSync(exePath)
                } catch (error) {
                    logger.warn(
                        '[Security] navi-tab-open-exe：无法读取路径状态，已拒绝',
                        exePath,
                        error
                    )
                    return
                }
                if (!stats.isFile()) {
                    logger.warn('[Security] navi-tab-open-exe：目标不是普通文件，已拒绝', exePath)
                    return
                }

                // 3) AS-7 扩展名白名单：白名单外扩展名不交给系统 shell
                const extensionDecision = getExecutableExtensionDecision(exePath)
                if (extensionDecision === 'reject') {
                    logger.warn('[Security] navi-tab-open-exe：拒绝白名单外的可执行扩展名', exePath)
                    return
                }

                // 4) P3-2：执行通道一律需用户显式确认（取消「系统目录内 .exe/.com 免确认」）。
                //    系统敏感目录（Windows/System32、Program Files、macOS /System 等）与用户
                //    可写目录使用强化文案/审计日志：这些目录内的系统工具同样可能被同权限本地
                //    程序替换或滥用，渲染层取得脚本执行能力后不应能无提示拉起任意可执行文件。
                const sensitiveSystemPath = isSensitiveSystemExecutablePath(exePath)
                const userWritable = isUserWritableExecutablePath(exePath)
                if (sensitiveSystemPath) {
                    logger.warn(
                        '[Security] navi-tab-open-exe：目标位于系统敏感目录，需用户确认',
                        exePath
                    )
                } else if (userWritable) {
                    logger.warn(
                        '[Security] navi-tab-open-exe：目标位于用户可写目录，需用户确认',
                        exePath
                    )
                }
                const { response } = await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    buttons: [
                        tMain('mainMsg.dialog.cancel'),
                        tMain('mainMsg.security.openExeConfirm')
                    ],
                    defaultId: 0,
                    cancelId: 0,
                    noLink: true,
                    title: tMain('mainMsg.security.openExeTitle'),
                    message: tMain('mainMsg.security.openExeMessage'),
                    detail: sensitiveSystemPath
                        ? tMain('mainMsg.security.openExeDetailSystem', { path: exePath })
                        : tMain('mainMsg.security.openExeDetail', { path: exePath })
                })
                if (response !== 1) {
                    return
                }

                // P3-2 残余审计：执行通道是「能力型」操作，用户确认后落一条审计日志
                // （路径经 logger 主目录脱敏，不含参数/内容；便于事后排查异常拉起）。
                logger.info('[Security] navi-tab-open-exe：用户已确认执行', exePath)
                await shell.openPath(exePath)
            } catch (error) {
                // CQ-05：对话框/打开程序异常统一兜底，避免 unhandledRejection
                notifyIpcAsyncError(mainWindow, IPC.NAVIGATION.OPEN_EXE, error)
            }
        },
        componentId
    )
}
