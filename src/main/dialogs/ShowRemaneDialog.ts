/**
 * 重命名对话框
 */

import { BrowserWindow, ipcMain } from 'electron'
import { RenameFileFolder } from '../utils/file-utils'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../theme-config/theme-config'

let customRenameDialog: Electron.BrowserWindow | null

export function ShowFileFolderRenameDialog(fullName: string, isFile: boolean) {
    customRenameDialog = new BrowserWindow({
        width: 500,
        height: 160,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '重命名',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    customRenameDialog.setMenu(null)

    const tempHtml = makeRenameDialogHtml(fullName)
    customRenameDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(tempHtml))

    customRenameDialog.show()

    const theme = getCurrentThemeStyles()
    customRenameDialog.webContents.send('baize-notes:init-theme-styles', theme)

    customRenameDialog.on('closed', () => {
        customRenameDialog = null
        ipcMain.removeListener('dialog-rename-file-folder-enter', processRenameFileFolder)
    })

    function processRenameFileFolder(_, newName: string) {
        RenameFileFolder(fullName, newName, isFile)
        if (customRenameDialog) {
            customRenameDialog.close()
        }
    }

    ipcMain.on('dialog-rename-file-folder-enter', processRenameFileFolder)
}

function makeRenameDialogHtml(path: string): string {
    const theme = getCurrentThemeStyles()

    // 创建一个空的HTML文档
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>重命名</title></head><body></body></html>`
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
    .input-group input:focus { outline: none; border-color: var(--accent-color); }`
    document.head.appendChild(styleElement)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '重命名'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.onclick = () => { window.close() }
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
    label.textContent = '新名称：'
    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'file-folder-name'
    input.placeholder = '请输入新名称'
    inputGroup.appendChild(label)
    inputGroup.appendChild(input)
    mainContent.appendChild(inputGroup)

    document.body.appendChild(mainContent)

    // 创建脚本
    const scriptElement = document.createElement('script')
    scriptElement.textContent = `
    const { ipcRenderer } = require("electron");
    const inputElement = document.getElementById("file-folder-name");
    inputElement.focus();
    inputElement.addEventListener("keyup", function(event) {
        if (event.key === "Enter") {
            ipcRenderer.send("dialog-rename-file-folder-enter", inputElement.value);
        }
    });
    ipcRenderer.on("baize-notes:theme-updated", function() {
        location.reload();
    });`
    document.body.appendChild(scriptElement)

    return document.documentElement.outerHTML
}
