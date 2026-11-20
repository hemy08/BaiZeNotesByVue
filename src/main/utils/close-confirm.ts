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

/**
 * 弹出未保存修改确认框。
 *
 * @param parentWindow 主窗口（存在且未销毁时作为模态父窗口；否则用无父窗口对话框）
 * @returns 用户选择：保存并关闭 / 不保存 / 取消
 */
export async function confirmUnsavedChangesClose(
    parentWindow: BrowserWindow | null
): Promise<UnsavedCloseChoice> {
    const options: MessageBoxOptions = {
        type: 'warning',
        title: tMain('mainMsg.closeConfirm.title'),
        message: tMain('mainMsg.closeConfirm.message'),
        detail: tMain('mainMsg.closeConfirm.detail'),
        buttons: [
            tMain('mainMsg.closeConfirm.save'),
            tMain('mainMsg.closeConfirm.discard'),
            tMain('mainMsg.closeConfirm.cancel')
        ],
        defaultId: 0,
        // 显式 cancelId：Esc / 点关闭按钮都按「取消」处理，避免误丢未保存内容
        cancelId: 2,
        noLink: true
    }
    const { response } =
        parentWindow && !parentWindow.isDestroyed()
            ? await dialog.showMessageBox(parentWindow, options)
            : await dialog.showMessageBox(options)
    if (response === 0) {
        return 'save'
    }
    if (response === 1) {
        return 'discard'
    }
    return 'cancel'
}
