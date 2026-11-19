/**
 * 对话框辅助模块
 * 提供错误消息框、信息消息框、警告消息框等统一消息入口
 *
 * 第 4 批 P3 清理：删除 showConfirmDialog / showSaveDialog / showOpenDialog 三个
 * 零生产调用的死包装（调用方此前直连 electron dialog），本模块只保留仍被
 * file-utils / dialogs 广泛使用的三个「经主窗口转发到渲染层 Vue 对话框」的消息框。
 */

import { sendToMainWindow } from '../app-state'
import { IPC } from '../../../shared/ipc-channels'
import { tMain } from '../i18n'

/**
 * 显示错误消息对话框
 * @param message 错误消息内容
 * @param title
 */
export function showErrorMessageBox(
    message: string,
    title: string = tMain('mainMsg.dialog.errorTitle')
): void {
    // P2 非空断言治理：主窗口可能已销毁（异步操作完成后应用正在退出），
    // 经 sendToMainWindow 安全发送，窗口不可用时静默跳过而不是抛 TypeError。
    sendToMainWindow(IPC.DIALOG.OPEN_VUE_DIALOG, 'message', {
        title: title,
        type: 'error',
        message: message
    })
}

/**
 * 显示信息消息对话框
 * @param message 信息消息内容
 * @param title 标题（可选）
 */
export function showInfoMessageBox(
    message: string,
    title: string = tMain('mainMsg.dialog.infoTitle')
): void {
    sendToMainWindow(IPC.DIALOG.OPEN_VUE_DIALOG, 'message', {
        title: title,
        type: 'info',
        message: message
    })
}

/**
 * 显示警告消息对话框
 * @param message 警告消息内容
 * @param title 标题
 * @returns 按钮索引
 */
export function showWarningMessageBox(
    message: string,
    title: string = tMain('mainMsg.dialog.warningTitle')
): void {
    sendToMainWindow(IPC.DIALOG.OPEN_VUE_DIALOG, 'message', {
        title: title,
        type: 'warning',
        message: message
    })
}
