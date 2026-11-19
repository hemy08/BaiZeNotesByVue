/**
 * 主进程错误上报统一入口（结构优化第 4 批 4.4 / M2 剩余）
 *
 * 收敛前 `ipc/handlers.ts` 与 `utils/utils.ts` 各有一份逐字相同的
 * `notifyIpcAsyncError`（CQ-05 异步 IPC 回调异常兜底），两份都手写
 * 「logger.error + tMain 组装文案 + webContents.send + try/catch」。
 * 本模块把该实现收敛为唯一一份，发送细节交给 status-notify.notifyStatus，
 * 异常文案归一化交给 status-notify.toUserError。
 *
 * 依赖说明：本模块静态依赖 i18n（tMain），供启动早期即可安全加载的模块使用；
 * `ipc/menu-handle.ts` 因「启动早期不得静态拉入 i18n/config 链」的既有约定，
 * 只复用 status-notify 的纯发送/归一化能力，翻译仍走其动态 import 路径。
 */
import { tMain } from './i18n'
import { logger } from './logger'
import { notifyStatus, toUserError, type StatusNotifyTarget } from './status-notify'

/**
 * CQ-05：异步 ipcMain.on 回调异常兜底——主进程留错误日志，并经状态栏通道
 * （STATUS_BAR_UPDATE）向渲染层提示，避免 rejection 变成 unhandledRejection 后静默丢失。
 *
 * @param mainWindow 目标主窗口（可为空/已销毁，发送失败静默降级）
 * @param channel 出错的 IPC 通道（写入日志便于定位）
 * @param error 捕获到的任意异常值
 */
export function notifyIpcAsyncError(
    mainWindow: StatusNotifyTarget | null | undefined,
    channel: string,
    error: unknown
): void {
    logger.error(`[IPC] 通道 "${channel}" 异步处理失败:`, error)
    notifyStatus(
        {
            message: tMain('mainMsg.status.operationFailed', {
                message: toUserError(error, tMain('common.unknown'))
            }),
            type: 'error'
        },
        mainWindow
    )
}
