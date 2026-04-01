/**
 * 插入网页链接对话框
 */

import { BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../theme-config/theme-config'
import * as digcom from './dialog_common'

let customWebUrlDialog: Electron.BrowserWindow | null

export function ShowWebUrlDialog(mainWindow: Electron.BrowserWindow) {
    if (customWebUrlDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }

    customWebUrlDialog = new BrowserWindow({
        width: 500,
        height: 220,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '插入链接',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    customWebUrlDialog.setMenu(null)

    const html = makeWebUrlDialogHtml()
    customWebUrlDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    customWebUrlDialog.show()

    const theme = getCurrentThemeStyles()
    customWebUrlDialog.webContents.send('baize-notes:init-theme-styles', theme)

    customWebUrlDialog.on('closed', () => {
        customWebUrlDialog = null
        ipcMain.removeListener('dialog-web-url-btn-insert', processInsertWebUrl)
        ipcMain.removeListener('dialog-web-url-btn-cancel', processCancelWebUrl)
    })

    function processInsertWebUrl(_: IpcMainEvent, webUrl: { title: string; addr: string }) {
        const text = '[' + webUrl.title + '](' + webUrl.addr + ')'
        mainWindow.webContents.send('monaco-insert-text-block-templates', text)
        if (customWebUrlDialog) customWebUrlDialog.close()
    }

    function processCancelWebUrl() {
        if (customWebUrlDialog) customWebUrlDialog.close()
    }

    ipcMain.on('dialog-web-url-btn-insert', processInsertWebUrl)
    ipcMain.on('dialog-web-url-btn-cancel', processCancelWebUrl)
}

function makeWebUrlDialogHtml(): string {
    const theme = getCurrentThemeStyles()
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>插入链接</title></head><body></body></html>`
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
            min-width: 70px;
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

        .buttons {
            display: flex;
            justify-content: center;
            gap: 20px;
            padding-top: 10px;
            border-top: 1px solid var(--border-color);
            margin-top: 5px;
        }

        button {
            padding: 8px 30px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            background: var(--card-bg);
            color: var(--text-color);
        }

        button:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
        }

        button.primary {
            background: var(--accent-color);
            color: #fff;
            border-color: var(--accent-color);
        }

        button.primary:hover { opacity: 0.9; }`
    document.head.appendChild(styleElement)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'

    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '插入链接'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'

    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    // 创建主内容区域
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    // 创建链接描述输入组
    const inputGroup1 = document.createElement('div')
    inputGroup1.className = 'input-group'

    const label1 = document.createElement('label')
    label1.textContent = '链接描述：'

    const input1 = document.createElement('input')
    input1.type = 'text'
    input1.id = 'web-title-input'
    input1.placeholder = '请输入链接描述'

    inputGroup1.appendChild(label1)
    inputGroup1.appendChild(input1)

    // 创建网站地址输入组
    const inputGroup2 = document.createElement('div')
    inputGroup2.className = 'input-group'

    const label2 = document.createElement('label')
    label2.textContent = '网站地址：'

    const input2 = document.createElement('input')
    input2.type = 'text'
    input2.id = 'web-addr-input'
    input2.placeholder = '请输入 http/https 链接'

    inputGroup2.appendChild(label2)
    inputGroup2.appendChild(input2)

    // 创建按钮区域
    const buttonsDiv = document.createElement('div')
    buttonsDiv.className = 'buttons'

    const cancelBtn = document.createElement('button')
    cancelBtn.id = 'cancel-input'
    cancelBtn.textContent = '取消'

    const insertBtn = document.createElement('button')
    insertBtn.id = 'insert-web-url'
    insertBtn.className = 'primary'
    insertBtn.textContent = '插入'

    buttonsDiv.appendChild(cancelBtn)
    buttonsDiv.appendChild(insertBtn)

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
    let webUrl = { title: "", addr: "" };

    document.getElementById("web-title-input").addEventListener("input", function() {
        webUrl.title = this.value;
    });
    document.getElementById("web-addr-input").addEventListener("input", function() {
        webUrl.addr = this.value;
    });
    document.getElementById("insert-web-url").onclick = function() {
        ipcRenderer.send("dialog-web-url-btn-insert", webUrl);
    };
    document.getElementById("cancel-input").onclick = function() {
        ipcRenderer.send("dialog-web-url-btn-cancel");
    };
    document.getElementById("close-dialog-btn").onclick = function() {
        ipcRenderer.send("dialog-web-url-btn-cancel");
    };

    ipcRenderer.on("baize-notes:theme-updated", function() {
        location.reload();
    });`

    document.body.appendChild(scriptElement)

    return document.documentElement.outerHTML
}
