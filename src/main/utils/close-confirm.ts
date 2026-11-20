/**
 * 关闭/退出前「未保存修改」确认对话框（2026-11-20 用户需求）。
 *
 * 背景：此前 close / before-quit 检测到脏文件时直接自动落盘（SaveActiveFile），
 * 用户没有「保存 / 不保存 / 取消」的选择权；且自动保存默认开启。现改为：
 * 1. 自动保存默认关闭（system-setting.ts default false）；
 * 2. 关闭窗口/退出应用时若文件有未保存修改，弹原生对话框让用户选择
 *    「保存并关闭 / 不保存 / 取消」；取消则保持窗口与编辑状态。
 *
 * 使用方：`src/main/index.ts` 的 window close 与 app before-quit 协议。
 * 选择结果映射：0=save、1=discard、2=cancel（cancelId 保证 Esc/关窗=取消）。
 */
import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { tMain } from './i18n'

/** 用户对「未保存修改」的处置选择 */
export type UnsavedCloseChoice = 'save' | 'discard' | 'cancel'

/** 关闭确认弹框的调用场景选项 */
export interface ConfirmUnsavedChangesCloseOptions {
    /**
     * true = 本次「关闭」动作实际是隐藏到系统托盘（minimizeToTray 开启且非显式退出，
     * 见 index.ts 的 close 协议）。托盘常驻场景下按钮/正文改用「保存并隐藏」语义，
     * 避免用户误以为应用已退出（P3 F-09）。
     */
    minimizeToTray?: boolean
}

/**
 * 弹出未保存修改确认框。
 *
 * @param parentWindow 主窗口（存在且未销毁时作为模态父窗口；否则用无父窗口对话框）
 * @param options 场景选项；默认按「保存并关闭」文案
 * @returns 用户选择：保存并关闭 / 不保存 / 取消（托盘场景为「保存并隐藏」）
 */
export async function confirmUnsavedChangesClose(
    parentWindow: BrowserWindow | null,
    options: ConfirmUnsavedChangesCloseOptions = {}
): Promise<UnsavedCloseChoice> {
    // 托盘常驻时 close 的实际结果是隐藏到托盘（应用仍在后台运行），文案随场景切换；
    // 退出（before-quit）/ 更新安装路径仍使用「关闭」语义。
    const strings =
        options.minimizeToTray === true
            ? {
                  title: tMain('mainMsg.closeConfirm.title'),
                  message: tMain('mainMsg.closeConfirm.trayMessage'),
                  detail: tMain('mainMsg.closeConfirm.trayDetail'),
                  save: tMain('mainMsg.closeConfirm.traySave'),
                  discard: tMain('mainMsg.closeConfirm.discard'),
                  cancel: tMain('mainMsg.closeConfirm.cancel')
              }
            : {
                  title: tMain('mainMsg.closeConfirm.title'),
                  message: tMain('mainMsg.closeConfirm.message'),
                  detail: tMain('mainMsg.closeConfirm.detail'),
                  save: tMain('mainMsg.closeConfirm.save'),
                  discard: tMain('mainMsg.closeConfirm.discard'),
                  cancel: tMain('mainMsg.closeConfirm.cancel')
              }
    const dialogOptions: MessageBoxOptions = {
        type: 'warning',
        title: strings.title,
        message: strings.message,
        detail: strings.detail,
        buttons: [strings.save, strings.discard, strings.cancel],
        defaultId: 0,
        // 显式 cancelId：Esc / 点关闭按钮都按「取消」处理，避免误丢未保存内容
        cancelId: 2,
        noLink: true
    }
    const { response } =
        parentWindow && !parentWindow.isDestroyed()
            ? await dialog.showMessageBox(parentWindow, dialogOptions)
            : await dialog.showMessageBox(dialogOptions)
    if (response === 0) {
        return 'save'
    }
    if (response === 1) {
        return 'discard'
    }
    return 'cancel'
}
