/**
 * 新建文件/文件夹对话框
 */

import { CreateFileFolder } from '../utils/file-utils/file-operations'
import { showErrorMessageBox } from '../utils/file-utils/dialog-helpers'
import { getCurrentThemeStyles } from '../config'
import * as digcom from './dialog-common'
import { windowManager } from '../config/window-manager'
import {
    createDialogOptions,
    createJSDOM,
    loadDialogHtml,
    notifyReloadDirFromDisk
} from './dialog-defaults'
import { getInlineDialogThemeVariables } from './shared/dialog-shared-css'
import { IPC } from '../../shared/ipc-channels'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
// P1/C-04：对话框 IPC 直连 ipcMain.on 迁移到监听台账；
// P1/N-05：对话框通道按"窗口归属"校验 sender（仅本对话框窗口可信）
import { registerTrustedDialogWindow, withSenderCheck } from '../utils/ipc-security'
import { tMain } from '../utils/i18n'

// P1/C-04：与 windowManager.createWindow 的 componentId 保持一致——
// 对话框窗口 closed 时 windowManager.cleanupWindow 会按该 componentId 自动清理监听器。
const CREATE_FILE_FOLDER_DIALOG_COMPONENT_ID = 'create-file-folder'

export function ShowCreateFileFolderDialog(
    dirPath: string,
    isFolder: boolean,
    fileExtension: string
) {
    const existing = windowManager.getWindowByType('create-file-folder')
    if (existing) {
        digcom.ShowAlreadyExistDialog()
        return
    }

    const customCreateDialog = windowManager.createWindow(
        'create-file-folder',
        createDialogOptions({
            width: 450,
            height: 230,
            minimizable: false,
            maximizable: false,
            resizable: false,
            title: tMain('dialogMain.createFileFolder.windowTitle')
        }),
        CREATE_FILE_FOLDER_DIALOG_COMPONENT_ID,
        true
    )

    customCreateDialog.setMenu(null)

    // P1/N-05：登记本对话框窗口为受信 dialog sender（窗口 closed 自动注销）
    registerTrustedDialogWindow(customCreateDialog)

    const temphtml = makeCreateFileFolderDialogHtml()
    loadDialogHtml(customCreateDialog, temphtml)

    customCreateDialog.show()

    const theme = getCurrentThemeStyles()
    customCreateDialog.webContents.send(IPC.THEME.INIT_THEME_STYLES, theme)

    async function processCreateFileFolder(_: Electron.IpcMainEvent, name: string) {
        const submittedName = name
        if (!isFolder && fileExtension.length == 0 && name.indexOf('.') === -1) {
            name = name + '.md'
        }
        try {
            await CreateFileFolder(name, dirPath, isFolder, fileExtension)
            // 创建完成后重新加载资源管理器
            await notifyReloadDirFromDisk()
            windowManager.getWindowByType('create-file-folder')?.close()
        } catch (error) {
            // FE-09：创建失败不再静默（原实现 async 回调无 try/catch，异常无人捕获、
            // 对话框停留在原样且用户看不到任何提示）。失败时弹错误提示并保留对话框，
            // 用户可改名重试。
            showErrorMessageBox(
                tMain('dialogMain.createFileFolder.createFailed', {
                    name: submittedName,
                    error: (error as Error)?.message || String(error)
                })
            )
        }
    }

    // P1/C-04：经 ipcListenerManager 注册（台账可见）；窗口 closed 时由 windowManager
    // 按 componentId 统一 cleanupComponent，无需再手工 removeListener。
    // P1/N-05：仅登记过的本对话框窗口 sender 可信，主窗口/其他窗口一律拒绝。
    ipcListenerManager.register(
        IPC.DIALOG.CREATE_FILE_FOLDER_ENTER,
        withSenderCheck(
            IPC.DIALOG.CREATE_FILE_FOLDER_ENTER,
            async (event: Electron.IpcMainEvent, name: string) => {
                await processCreateFileFolder(event, name)
            },
            { scope: 'dialog' }
        ),
        CREATE_FILE_FOLDER_DIALOG_COMPONENT_ID
    )
}

function makeCreateFileFolderDialogHtml(): string {
    const theme = getCurrentThemeStyles()
    // MEM-12：显式持有 JSDOM 实例，流程结束（正常返回与异常路径）调用 window.close() 释放内部资源
    const dom = createJSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${tMain('dialogMain.createFileFolder.title')}</title></head><body></body></html>`
    )
    try {
        const document = dom.window.document

        // 创建样式
        const styleElement = document.createElement('style')
        // CQ-06：主题变量块统一来自 dialog-shared-css 单一来源（按原缩进输出，保持 HTML 逐字不变）
        styleElement.textContent = `
${getInlineDialogThemeVariables(theme, '        ')}

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background: var(--bg-color);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .title-bar {
            width: 100%;
            height: 32px;
            background: var(--title-bar-gradient);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 10px;
            -webkit-app-region: drag;
        }

        .title-bar-title {
            color: #fff;
            font-size: 13px;
            font-weight: 500;
        }

        .close-btn {
            width: 28px;
            height: 28px;
            border: none;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: #fff;
            transition: all 0.2s;
            -webkit-app-region: no-drag;
        }

        .close-btn:hover { background: rgba(255,100,100,0.9); }

        .main-content {
            flex: 1;
            padding: 15px 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .input-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .input-group label {
            color: var(--text-color);
            font-size: 13px;
            min-width: 80px;
        }

        .input-group input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 13px;
            background: var(--card-bg);
            color: var(--text-color);
        }

        .input-group input:focus {
            outline: none;
            border-color: var(--accent-color);
        }

        .hint {
            font-size: 11px;
            color: var(--secondary-text-color);
            margin-left: 90px;
        }

        /* FE-09：错误提示（保留对话框内反馈，用户可改名重试） */
        .error-tip {
            display: none;
            font-size: 11px;
            color: #ff4757;
            margin-left: 90px;
        }

        .error-tip.visible { display: block; }

        /* FE-09：底部「取消 / 确定」按钮（此前只有回车可提交、界面无按钮） */
        .footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 0 20px 15px;
        }

        .btn {
            min-width: 78px;
            height: 30px;
            padding: 0 16px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            background: var(--card-bg);
            color: var(--text-color);
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn:hover { border-color: var(--accent-color); color: var(--accent-color); }

        .btn-primary {
            border: none;
            background: var(--accent-color);
            color: #fff;
        }

        .btn-primary:hover { opacity: 0.9; color: #fff; }`
        document.head.appendChild(styleElement)

        // 创建标题栏
        const titleBar = document.createElement('div')
        titleBar.className = 'title-bar'

        const titleSpan = document.createElement('span')
        titleSpan.className = 'title-bar-title'
        titleSpan.textContent = tMain('dialogMain.createFileFolder.title')

        const closeBtn = document.createElement('button')
        closeBtn.className = 'close-btn'
        closeBtn.textContent = 'x'
        closeBtn.id = 'close-dialog-btn'

        titleBar.appendChild(titleSpan)
        titleBar.appendChild(closeBtn)

        // 创建主内容区域
        const mainContent = document.createElement('div')
        mainContent.className = 'main-content'

        // 创建输入组
        const inputGroup = document.createElement('div')
        inputGroup.className = 'input-group'

        const label = document.createElement('label')
        label.textContent = tMain('dialogMain.createFileFolder.nameLabel')

        const input = document.createElement('input')
        input.type = 'text'
        input.id = 'file-folder-name'
        input.placeholder = tMain('dialogMain.createFileFolder.namePlaceholder')

        inputGroup.appendChild(label)
        inputGroup.appendChild(input)

        // 创建提示
        const hint = document.createElement('div')
        hint.className = 'hint'
        hint.textContent = tMain('dialogMain.createFileFolder.fileSuffixHint')

        // FE-09：空名称提示（提交时做一次最小校验，避免只关闭对话框无反馈）
        const errorTip = document.createElement('div')
        errorTip.className = 'error-tip'
        errorTip.id = 'create-error-tip'
        errorTip.textContent = tMain('dialogMain.createFileFolder.nameRequired')

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

        mainContent.appendChild(inputGroup)
        mainContent.appendChild(hint)
        mainContent.appendChild(errorTip)

        // 组装页面
        document.body.appendChild(titleBar)
        document.body.appendChild(mainContent)
        document.body.appendChild(footer)

        // 创建脚本
        const scriptElement = document.createElement('script')
        scriptElement.textContent = `
    const ipcRenderer = window.electronAPI.ipcRenderer;
    const inputElement = document.getElementById("file-folder-name");
    const errorTipElement = document.getElementById("create-error-tip");
    inputElement.focus();
    function submitCreate() {
        const value = inputElement.value.trim();
        if (value.length === 0) {
            errorTipElement.classList.add("visible");
            inputElement.focus();
            return;
        }
        errorTipElement.classList.remove("visible");
        ipcRenderer.send('${IPC.DIALOG.CREATE_FILE_FOLDER_ENTER}', value);
    }
    inputElement.addEventListener("keyup", function(event) {
        if (event.key === "Enter") {
            submitCreate();
        }
    });
    inputElement.addEventListener("input", function() {
        errorTipElement.classList.remove("visible");
    });
    document.getElementById("confirm-dialog-btn").onclick = submitCreate;
    document.getElementById("cancel-dialog-btn").onclick = function() {
        window.close();
    };
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
