/**
 * 新建文件/文件夹对话框（带路径选择）
 */

import { BrowserWindow, ipcMain } from 'electron'
import { GetSelectDir, CreateFile, CreateDirectory } from '../utils/file-utils'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../theme-config/theme-config'
import * as digcom from './dialog_common'

let customNewFileDialog: Electron.BrowserWindow | null

export function ShowNewFileFolderDialog(isFile: boolean) {
    if (customNewFileDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }

    customNewFileDialog = new BrowserWindow({
        width: 550,
        height: 250,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '新建文件/文件夹',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    customNewFileDialog.setMenu(null)

    const html = makeNewFileFolderDialogHtml(isFile)
    customNewFileDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    customNewFileDialog.show()

    const theme = getCurrentThemeStyles()
    customNewFileDialog.webContents.send('baize-notes:init-theme-styles', theme)

    customNewFileDialog.on('closed', () => {
        customNewFileDialog = null
        ipcMain.removeListener('dialog-new-file-folder-confirm', processConfirm)
        ipcMain.removeListener('dialog-new-file-folder-cancel', processCancel)
        ipcMain.removeListener('dialog-new-file-folder-show-select', processShowSelect)
    })

    function processConfirm(_, data: { name: string; path: string }) {
        if (data.name && data.path) {
            if (isFile)  {
                CreateFile(data.name, data.path, '.md')
            } else  {
                CreateDirectory(data.name, data.path)
            }
        }
        if (customNewFileDialog) customNewFileDialog.close()
    }

    function processCancel() {
        if (customNewFileDialog) customNewFileDialog.close()
    }

    function processShowSelect(event: Electron.IpcMainEvent) {
        if (customNewFileDialog) {
            GetSelectDir(customNewFileDialog, function (path) {
                if (path) {
                    event.returnValue = path
                }
            })
        }
    }

    ipcMain.on('dialog-new-file-folder-confirm', processConfirm)
    ipcMain.on('dialog-new-file-folder-cancel', processCancel)
    ipcMain.on('dialog-new-file-folder-show-select', processShowSelect)
}

function makeNewFileFolderDialogHtml(isFile: boolean): string {
    const theme = getCurrentThemeStyles()
    const title = isFile ? '新建文件' : '新建文件夹'
    const placeholder = isFile ? '文件' : '文件夹'
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>${title}</title></head><body></body></html>`
    ).window

    // 创建样式
    const styleElement = document.createElement('style')
    styleElement.textContent = `
        :root {
            --bg-color: ${theme.backgroundColor};
            --card-bg: ${theme.cardBackground};
            --text-color: ${theme.textColor};
            --secondary-text-color: ${theme.secondaryTextColor};
            --border-color: ${theme.borderColor};
            --accent-color: ${theme.accentColor};
            --hover-bg: ${theme.hoverBackground};
            --title-bar-gradient: ${theme.titleBarGradient};
        }

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
            gap: 12px;
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

        .input-group button {
            padding: 8px 16px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: var(--card-bg);
            color: var(--text-color);
            transition: all 0.2s;
        }

        .input-group button:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
        }

        .buttons {
            display: flex;
            justify-content: center;
            gap: 20px;
            padding-top: 10px;
            border-top: 1px solid var(--border-color);
            margin-top: 5px;
        }

        button.primary {
            padding: 8px 30px;
            border: 1px solid var(--accent-color);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: var(--accent-color);
            color: #fff;
        }

        button.primary:hover { opacity: 0.9; }

        button.secondary {
            padding: 8px 30px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: var(--card-bg);
            color: var(--text-color);
        }

        button.secondary:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
        }`
    document.head.appendChild(styleElement)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'

    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = title

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'

    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    // 创建主内容区域
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    // 创建名称输入组
    const inputGroup1 = document.createElement('div')
    inputGroup1.className = 'input-group'

    const label1 = document.createElement('label')
    label1.textContent = '名称：'

    const input1 = document.createElement('input')
    input1.type = 'text'
    input1.id = 'file-folder-name'
    input1.placeholder = '请输入' + placeholder + '名称'

    inputGroup1.appendChild(label1)
    inputGroup1.appendChild(input1)

    // 创建路径输入组
    const inputGroup2 = document.createElement('div')
    inputGroup2.className = 'input-group'

    const label2 = document.createElement('label')
    label2.textContent = '保存路径：'

    const input2 = document.createElement('input')
    input2.type = 'text'
    input2.id = 'file-folder-path'
    input2.placeholder = '请输入或选择保存路径'

    const selectBtn = document.createElement('button')
    selectBtn.id = 'file-folder-select'
    selectBtn.textContent = '选择'

    inputGroup2.appendChild(label2)
    inputGroup2.appendChild(input2)
    inputGroup2.appendChild(selectBtn)

    // 创建按钮区域
    const buttonsDiv = document.createElement('div')
    buttonsDiv.className = 'buttons'

    const cancelBtn = document.createElement('button')
    cancelBtn.id = 'file-folder-cancel'
    cancelBtn.className = 'secondary'
    cancelBtn.textContent = '取消'

    const confirmBtn = document.createElement('button')
    confirmBtn.id = 'file-folder-confirm'
    confirmBtn.className = 'primary'
    confirmBtn.textContent = '确定'

    buttonsDiv.appendChild(cancelBtn)
    buttonsDiv.appendChild(confirmBtn)

    // 组装主内容
    mainContent.appendChild(inputGroup1)
    mainContent.appendChild(inputGroup2)
    mainContent.appendChild(buttonsDiv)

    // 组装页面
    document.body.appendChild(titleBar)
    document.body.appendChild(mainContent)

    // 创建脚本
    const scriptElement = document.createElement('script')
    scriptElement.textContent = `
    const { ipcRenderer } = require("electron");
    let newFileFolder = { name: "", path: "" };

    document.getElementById("file-folder-name").addEventListener("input", function() {
        newFileFolder.name = this.value;
    });
    document.getElementById("file-folder-path").addEventListener("input", function() {
        newFileFolder.path = this.value;
    });
    document.getElementById("file-folder-select").onclick = function() {
        var select = ipcRenderer.sendSync("dialog-new-file-folder-show-select");
        if (select) {
            newFileFolder.path = select;
            document.getElementById("file-folder-path").value = select;
        }
    };
    document.getElementById("file-folder-confirm").onclick = function() {
        ipcRenderer.send("dialog-new-file-folder-confirm", newFileFolder);
    };
    document.getElementById("file-folder-cancel").onclick = function() {
        ipcRenderer.send("dialog-new-file-folder-cancel");
    };
    document.getElementById("close-dialog-btn").onclick = function() {
        ipcRenderer.send("dialog-new-file-folder-cancel");
    };

    ipcRenderer.on("baize-notes:theme-updated", function() {
        location.reload();
    });`

    document.body.appendChild(scriptElement)

    return document.documentElement.outerHTML
}
