/**
 * 重命名对话框
 */

import { RenameFileFolder } from '../utils/file-utils/file-operations'
import { showErrorMessageBox } from '../utils/file-utils/dialog-helpers'
import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions, createJSDOM, loadDialogHtml } from './dialog-defaults'
import { getInlineDialogThemeVariables } from './shared/dialog-shared-css'
import { IPC } from '../../shared/ipc-channels'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
// P1/C-04：对话框 IPC 直连 ipcMain.on 迁移到监听台账；
// P1/N-05：对话框通道按"窗口归属"校验 sender（仅本对话框窗口可信）
import { registerTrustedDialogWindow, withSenderCheck } from '../utils/ipc-security'
import { tMain } from '../utils/i18n'

// P1/C-04：与 windowManager.createWindow 的 componentId 保持一致——
// 对话框窗口 closed 时 windowManager.cleanupWindow 会按该 componentId 自动清理监听器。
const RENAME_FILE_FOLDER_DIALOG_COMPONENT_ID = 'rename-file-folder'

export function ShowFileFolderRenameDialog(fullName: string, isFile: boolean) {
    const existing = windowManager.getWindowByType('rename-file-folder')
    if (existing) {
        existing.focus()
        return
    }

    const customRenameDialog = windowManager.createWindow(
        'rename-file-folder',
        createDialogOptions({
            width: 500,
            height: 220,
            minimizable: false,
            maximizable: false,
            resizable: false,
            title: tMain('dialogMain.rename.windowTitle')
        }),
        RENAME_FILE_FOLDER_DIALOG_COMPONENT_ID,
        true
    )

    customRenameDialog.setMenu(null)

    // P1/N-05：登记本对话框窗口为受信 dialog sender（窗口 closed 自动注销）
    registerTrustedDialogWindow(customRenameDialog)

    const tempHtml = makeRenameDialogHtml(fullName)
    loadDialogHtml(customRenameDialog, tempHtml)

    customRenameDialog.show()

    async function processRenameFileFolder(_: Electron.IpcMainEvent, newName: string) {
        try {
            await RenameFileFolder(fullName, newName, isFile)
            windowManager.getWindowByType('rename-file-folder')?.close()
        } catch (error) {
            // FE-09：重命名失败不再静默（原实现 async 回调无 try/catch，异常无人捕获、
            // 对话框留在界面且没有任何提示）。失败时弹错误提示并保留对话框，用户可改名重试。
            showErrorMessageBox(
                tMain('dialogMain.rename.renameFailed', {
                    path: fullName,
                    error: (error as Error)?.message || String(error)
                })
            )
        }
    }

    // P1/C-04：经 ipcListenerManager 注册（台账可见）；窗口 closed 时由 windowManager
    // 按 componentId 统一 cleanupComponent，无需再手工 removeListener。
    // P1/N-05：仅登记过的本对话框窗口 sender 可信，主窗口/其他窗口一律拒绝。
    ipcListenerManager.register(
        IPC.DIALOG.RENAME_FILE_FOLDER_ENTER,
        withSenderCheck(
            IPC.DIALOG.RENAME_FILE_FOLDER_ENTER,
            async (event: Electron.IpcMainEvent, newName: string) => {
                await processRenameFileFolder(event, newName)
            },
            { scope: 'dialog' }
        ),
        RENAME_FILE_FOLDER_DIALOG_COMPONENT_ID
    )
}

function makeRenameDialogHtml(path: string): string {
    const theme = getCurrentThemeStyles()

    // 创建一个空的HTML文档
    // MEM-12：显式持有 JSDOM 实例，流程结束（正常返回与异常路径）调用 window.close() 释放内部资源
    const dom = createJSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${tMain('dialogMain.rename.title')}</title></head><body></body></html>`
    )
    try {
        const document = dom.window.document

        // 创建样式
        const styleElement = document.createElement('style')
        // CQ-06：主题变量块统一来自 dialog-shared-css 单一来源（按原缩进输出，保持 HTML 逐字不变）
        styleElement.textContent = `
${getInlineDialogThemeVariables(theme, '    ')}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif; background: var(--bg-color); min-height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .title-bar { width: 100%; height: 32px; background: var(--title-bar-gradient); display: flex; justify-content: space-between; align-items: center; padding: 0 10px; -webkit-app-region: drag; }
    .title-bar-title { color: #fff; font-size: 13px; font-weight: 500; }
    .close-btn { width: 28px; height: 28px; border: none; background: rgba(255,255,255,0.2); border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; transition: all 0.2s; -webkit-app-region: no-drag; }
    .close-btn:hover { background: rgba(255,100,100,0.9); }
    .main-content { flex: 1; padding: 15px 20px; display: flex; flex-direction: column; gap: 10px; }
    .old-path { font-size: 12px; color: var(--secondary-text-color); padding: 8px 12px; background: var(--card-bg); border-radius: 4px; border: 1px solid var(--border-color); word-break: break-all; }
    .input-group { display: flex; align-items: center; gap: 10px; }
    .input-group label { color: var(--text-color); font-size: 13px; min-width: 70px; }
    .input-group input { flex: 1; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; background: var(--card-bg); color: var(--text-color); }
    .input-group input:focus { outline: none; border-color: var(--accent-color); }
    /* FE-09：错误提示（保留对话框内反馈，用户可改名重试） */
    .error-tip { display: none; font-size: 11px; color: #ff4757; margin-left: 80px; }
    .error-tip.visible { display: block; }
    /* FE-09：底部「取消 / 确定」按钮（此前只有回车可提交、界面无按钮） */
    .footer { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 15px; }
    .btn { min-width: 78px; height: 30px; padding: 0 16px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); font-size: 13px; cursor: pointer; transition: all 0.2s; }
    .btn:hover { border-color: var(--accent-color); color: var(--accent-color); }
    .btn-primary { border: none; background: var(--accent-color); color: #fff; }
    .btn-primary:hover { opacity: 0.9; color: #fff; }`
        document.head.appendChild(styleElement)

        // 创建标题栏
        const titleBar = document.createElement('div')
        titleBar.className = 'title-bar'
        const titleSpan = document.createElement('span')
        titleSpan.className = 'title-bar-title'
        titleSpan.textContent = tMain('dialogMain.rename.title')
        const closeBtn = document.createElement('button')
        closeBtn.className = 'close-btn'
        closeBtn.id = 'close-dialog-btn'
        closeBtn.textContent = 'x'
        titleBar.appendChild(titleSpan)
        titleBar.appendChild(closeBtn)
        document.body.appendChild(titleBar)

        // 创建主内容区域
        const mainContent = document.createElement('div')
        mainContent.className = 'main-content'

        // 创建旧路径显示
        const oldPathDiv = document.createElement('div')
        oldPathDiv.className = 'old-path'
        oldPathDiv.id = 'old-path'
        oldPathDiv.textContent = path
        mainContent.appendChild(oldPathDiv)

        // 创建输入组
        const inputGroup = document.createElement('div')
        inputGroup.className = 'input-group'
        const label = document.createElement('label')
        label.textContent = tMain('dialogMain.rename.newNameLabel')
        const input = document.createElement('input')
        input.type = 'text'
        input.id = 'file-folder-name'
        input.placeholder = tMain('dialogMain.rename.newNamePlaceholder')
        inputGroup.appendChild(label)
        inputGroup.appendChild(input)
        mainContent.appendChild(inputGroup)

        // FE-09：空名称提示（提交时做一次最小校验，避免只关闭对话框无反馈）
        const errorTip = document.createElement('div')
        errorTip.className = 'error-tip'
        errorTip.id = 'rename-error-tip'
        errorTip.textContent = tMain('dialogMain.rename.nameRequired')
        mainContent.appendChild(errorTip)

        document.body.appendChild(mainContent)

        // FE-09：底部按钮（确定/取消）——此前界面只有回车可提交，无任何可点击按钮
        const footer = document.createElement('div')
        footer.className = 'footer'

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'btn'
        cancelBtn.id = 'cancel-dialog-btn'
        cancelBtn.textContent = tMain('mainMsg.dialog.cancel')

        const confirmBtn = document.createElement('button')
        confirmBtn.className = 'btn btn-primary'
        confirmBtn.id = 'confirm-dialog-btn'
        confirmBtn.textContent = tMain('mainMsg.dialog.confirm')

        footer.appendChild(cancelBtn)
        footer.appendChild(confirmBtn)
        document.body.appendChild(footer)

        // 创建脚本
        const scriptElement = document.createElement('script')
        scriptElement.textContent = `
    const ipcRenderer = window.electronAPI.ipcRenderer;
    const inputElement = document.getElementById("file-folder-name");
    const errorTipElement = document.getElementById("rename-error-tip");
    inputElement.focus();
    function submitRename() {
        const value = inputElement.value.trim();
        if (value.length === 0) {
            errorTipElement.classList.add("visible");
            inputElement.focus();
            return;
        }
        errorTipElement.classList.remove("visible");
        ipcRenderer.send('${IPC.DIALOG.RENAME_FILE_FOLDER_ENTER}', value);
    }
    inputElement.addEventListener("keyup", function(event) {
        if (event.key === "Enter") {
            submitRename();
        }
    });
    inputElement.addEventListener("input", function() {
        errorTipElement.classList.remove("visible");
    });
    document.getElementById("confirm-dialog-btn").onclick = submitRename;
    document.getElementById("cancel-dialog-btn").onclick = function() {
        window.close();
    };
    /* FE-09：关闭按钮改由脚本显式绑定——原先在 JSDOM 上设置 onclick 属性，
       序列化为 HTML 时事件处理器丢失，标题栏 × 实际不可用 */
    document.getElementById("close-dialog-btn").onclick = function() {
        window.close();
    };
    ipcRenderer.on('${IPC.THEME.THEME_UPDATED}', function() {
        location.reload();
    });`
        document.body.appendChild(scriptElement)

        return document.documentElement.outerHTML
    } finally {
        // MEM-12：无论正常返回还是异常，关闭 JSDOM 窗口释放内部资源
        dom.window.close()
    }
}
