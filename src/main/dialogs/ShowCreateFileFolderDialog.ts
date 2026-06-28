/**
 * 新建文件/文件夹对话框
 */

import { ipcMain } from 'electron'
import { CreateFileFolder, ReloadDirFromDisk } from '../utils/file-utils/file-operations'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../config'
import * as digcom from './dialog_common'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

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
    
    const customCreateDialog = windowManager.createWindow('create-file-folder', createDialogOptions({
        width: 450,
        height: 150,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '新建'
    }), 'create-file-folder', true)

    customCreateDialog.setMenu(null)

    const temphtml = makeCreateFileFolderDialogHtml()
    customCreateDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(temphtml))

    customCreateDialog.show()

    const theme = getCurrentThemeStyles()
    customCreateDialog.webContents.send('baize-notes:init-theme-styles', theme)

    async function processCreateFileFolder(_, name: string) {
        if (!isFolder && fileExtension.length == 0 && name.indexOf('.') === -1) {
            name = name + '.md'
        }
        await CreateFileFolder(name, dirPath, isFolder, fileExtension)
        // 创建完成后重新加载资源管理器
        await ReloadDirFromDisk()
        windowManager.getWindowByType('create-file-folder')?.close()
    }

    ipcMain.on('dialog-create-file-folder-enter', processCreateFileFolder)

    customCreateDialog.on('closed', () => {
        ipcMain.removeListener('dialog-create-file-folder-enter', processCreateFileFolder)
    })
}

function makeCreateFileFolderDialogHtml(): string {
    const theme = getCurrentThemeStyles()
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>新建</title></head><body></body></html>`
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
        }`
    document.head.appendChild(styleElement)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'

    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '新建'

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
    label.textContent = '名称：'

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'file-folder-name'
    input.placeholder = '请输入名称'

    inputGroup.appendChild(label)
    inputGroup.appendChild(input)

    // 创建提示
    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = '文件默认后缀 .md'

    mainContent.appendChild(inputGroup)
    mainContent.appendChild(hint)

    // 组装页面
    document.body.appendChild(titleBar)
    document.body.appendChild(mainContent)

    // 创建脚本
    const scriptElement = document.createElement('script')
    scriptElement.textContent = `
    const { ipcRenderer } = require("electron");
    const inputElement = document.getElementById("file-folder-name");
    inputElement.focus();
    inputElement.addEventListener("keyup", function(event) {
        if (event.key === "Enter") {
            ipcRenderer.send("dialog-create-file-folder-enter", inputElement.value);
        }
    });
    document.getElementById("close-dialog-btn").onclick = function() {
        window.close();
    };

    ipcRenderer.on("baize-notes:theme-updated", function() {
        location.reload();
    });`

    document.body.appendChild(scriptElement)

    return document.documentElement.outerHTML
}
