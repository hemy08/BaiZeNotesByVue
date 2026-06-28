/**
 * 对话框辅助模块
 * 提供错误消息框、信息消息框等对话框功能
 */

import { dialog, BrowserWindow, SaveDialogOptions, OpenDialogOptions, MessageBoxOptions } from 'electron'
import { appState } from '../app-state'

/**
 * 显示错误消息对话框
 * @param message 错误消息内容
 * @param title
 */
export function showErrorMessageBox(message: string, title: string = '错误!'): void {
    appState.mainWindow!.webContents.send('open-vue-dialog', 'message', {
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
export function showInfoMessageBox(message: string, title: string = '提示'): void {
    appState.mainWindow!.webContents.send('open-vue-dialog', 'message', {
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
    title: string = '警告'
): void {
    appState.mainWindow!.webContents.send('open-vue-dialog', 'message', {
        title: title,
        type: 'warning',
        message: message
    })
}

/**
 * 显示确认对话框
 * @param message 确认消息内容
 * @param title 标题
 * @param mainWindow 主窗口
 * @returns 是否确认
 */
export function showConfirmDialog(message: string, title: string = '确认', mainWindow?: BrowserWindow): boolean {
    const options: MessageBoxOptions = {
        type: 'question',
        title: title,
        message: message,
        buttons: ['确认', '取消'],
        defaultId: 0,
        cancelId: 1
    }

    if (mainWindow) {
        return dialog.showMessageBoxSync(mainWindow, options) === 0
    } else {
        return dialog.showMessageBoxSync(options) === 0
    }
}

/**
 * 显示保存文件对话框
 * @param mainWindow 主窗口
 * @param options 保存对话框选项
 * @returns 保存结果
 */
export async function showSaveDialog(mainWindow: BrowserWindow, options: SaveDialogOptions) {
    return await dialog.showSaveDialog(mainWindow, options)
}

/**
 * 显示打开文件对话框
 * @param mainWindow 主窗口
 * @param options 打开对话框选项
 * @returns 打开结果
 */
export async function showOpenDialog(mainWindow: BrowserWindow, options: OpenDialogOptions) {
    return await dialog.showOpenDialog(mainWindow, options)
}
