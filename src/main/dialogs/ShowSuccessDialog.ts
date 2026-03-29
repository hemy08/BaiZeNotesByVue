/**
 * 成功对话框
 * 显示操作成功的提示信息
 */

import { BrowserWindow } from 'electron'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../utils/theme-config'

let successDialog: Electron.BrowserWindow | null

/**
 * 显示成功对话框
 */
export function ShowSuccessDialog(title: string, message: string) {
    if (successDialog) {
        successDialog.close()
    }

    successDialog = new BrowserWindow({
        width: 450,
        height: 250,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: title,
        autoHideMenuBar: true,
        frame: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    successDialog.setMenu(null)

    const html = makeSuccessHtml(title, message)
    successDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    successDialog.show()

    // 发送主题样式
    successDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        successDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    successDialog.on('closed', () => {
        successDialog = null
    })
}

/**
 * 生成成功对话框HTML
 */
function makeSuccessHtml(title: string, message: string): string {
    const theme = getCurrentThemeStyles()

    // language=HTML
    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background: ${theme.backgroundColor};
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            user-select: none;
        }

        .title-bar {
            width: 100%;
            height: 32px;
            background: ${theme.titleBarGradient};
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 15px;
            -webkit-app-region: drag;
        }

        .title-text {
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

        .close-btn:hover {
            background: rgba(255,100,100,0.9);
        }

        .container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .success-icon {
            width: 60px;
            height: 60px;
            margin-bottom: 15px;
            animation: scaleIn 0.3s ease-out;
        }

        @keyframes scaleIn {
            from {
                transform: scale(0);
                opacity: 0;
            }
            to {
                transform: scale(1);
                opacity: 1;
            }
        }

        .success-message {
            font-size: 14px;
            color: ${theme.textColor};
            text-align: center;
            line-height: 1.6;
            max-width: 380px;
            word-wrap: break-word;
            margin-bottom: 20px;
        }

        .footer {
            padding: 15px 20px;
            display: flex;
            justify-content: center;
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground};
        }

        .btn-confirm {
            padding: 8px 30px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
            background: ${theme.accentColor};
            color: #fff;
        }

        .btn-confirm:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="title-bar">
        <span class="title-text">${title}</span>
        <button class="close-btn" onclick="window.close()">x</button>
    </div>

    <div class="container">
        <svg class="success-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="45" fill="none" stroke="${theme.accentColor}" stroke-width="3"/>
            <path d="M 30 50 L 45 65 L 70 35" fill="none" stroke="${theme.accentColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="success-message">${message}</div>
    </div>

    <div class="footer">
        <button class="btn-confirm" onclick="window.close()">确定</button>
    </div>

    <script>
        const { ipcRenderer } = require('electron')

        // 监听主题更新
        ipcRenderer.on('baize-notes:theme-updated', () => {
            location.reload()
        })
    </script>
</body>
</html>`
    ).window

    return document.documentElement.outerHTML
}
