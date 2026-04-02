/**
 * 主题设置对话框
 * 用于管理应用的主题设置
 */

import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
// @ts-ignore
import {
    getCurrentTheme,
    getCurrentThemeStyles,
    setTheme,
    themes,
    ThemeType
} from '../themes/theme-config'

let themeSettingDialog: Electron.BrowserWindow | null

/**
 * 显示主题设置对话框
 */
export function ShowThemeSettingDialog() {
    if (themeSettingDialog) {
        themeSettingDialog.focus()
        return
    }

    themeSettingDialog = new BrowserWindow({
        width: 1100,
        height: 750,
        minimizable: false,
        maximizable: false,
        resizable: false,
        title: '主题设置',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    themeSettingDialog.setMenu(null)

    const html = makeThemeSettingDialogHtml()
    themeSettingDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    themeSettingDialog.webContents.on('did-finish-load', () => {
        const themeStyles = getCurrentThemeStyles()
        themeSettingDialog?.webContents.send('baize-notes:init-theme-styles', themeStyles)
    })

    themeSettingDialog.show()

    themeSettingDialog.on('closed', () => {
        themeSettingDialog = null
    })
}

/**
 * 设置主题处理函数
 */
function handleSetTheme(event: Electron.IpcMainEvent, themeType: ThemeType) {
    setTheme(themeType)
    event.reply('baize-notes:theme-changed', themeType)
    
    const newThemeStyles = getCurrentThemeStyles()
    console.log('[Theme Dialog] Applying theme:', themeType, newThemeStyles)
    
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('baize-notes:theme-updated', newThemeStyles)
        win.webContents.send('baize-notes:init-theme-styles', newThemeStyles)
    })
}

ipcMain.on('baize-notes:set-theme', handleSetTheme)

/**
 * 生成主题设置对话框 HTML
 */
function makeThemeSettingDialogHtml(): string {
    const theme = getCurrentThemeStyles()
    const currentThemeType = getCurrentTheme()
    const { document } = new JSDOM(
        `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>主题设置</title></head><body></body></html>`
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
            height: 36px;
            background: var(--title-bar-gradient);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 12px;
            -webkit-app-region: drag;
        }

        .title-bar-title {
            color: #fff;
            font-size: 14px;
            font-weight: 500;
        }

        .close-btn {
            width: 30px;
            height: 30px;
            border: none;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            color: #fff;
            transition: all 0.2s;
            -webkit-app-region: no-drag;
        }

        .close-btn:hover { background: rgba(255,100,100,0.9); }

        .main-content {
            flex: 1;
            padding: 20px 25px;
            overflow-y: auto;
        }

        .theme-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 16px;
        }

        .theme-card {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.3s;
            border: 2px solid var(--border-color);
        }

        .theme-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.12);
        }

        .theme-card.selected {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px var(--accent-color);
        }

        .theme-preview {
            height: 70px;
            border-radius: 8px;
            margin-bottom: 8px;
            position: relative;
            overflow: hidden;
        }

        .theme-preview-bar {
            height: 18px;
            border-radius: 8px 8px 0 0;
        }

        .theme-preview-body {
            padding: 8px;
            display: flex;
            gap: 6px;
        }

        .theme-preview-card {
            flex: 1;
            height: 26px;
            border-radius: 4px;
        }

        .theme-check {
            position: absolute;
            top: 5px;
            right: 5px;
            width: 20px;
            height: 20px;
            background: var(--accent-color);
            border-radius: 50%;
            display: none;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
        }

        .theme-card.selected .theme-check { display: flex; }

        .theme-name {
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 3px;
            font-size: 13px;
        }

        .theme-desc {
            font-size: 10px;
            color: var(--secondary-text-color);
            line-height: 1.3;
        }

        .footer {
            margin-top: 16px;
            text-align: center;
            font-size: 12px;
            color: var(--secondary-text-color);
        }`
    document.head.appendChild(styleElement)

    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'

    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '主题设置'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = 'x'
    closeBtn.id = 'close-dialog-btn'

    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    // 创建主内容区域
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    // 创建主题网格
    const themeGrid = document.createElement('div')
    themeGrid.className = 'theme-grid'
    themeGrid.id = 'themeGrid'

    // 生成主题卡片
    for (const [type, styles] of Object.entries(themes)) {
        const isSelected = type === currentThemeType

        const themeCard = document.createElement('div')
        themeCard.className = 'theme-card' + (isSelected ? ' selected' : '')
        themeCard.setAttribute('data-theme', type)

        // 预览区域
        const themePreview = document.createElement('div')
        themePreview.className = 'theme-preview'
        themePreview.style.background = styles.backgroundColor

        const previewBar = document.createElement('div')
        previewBar.className = 'theme-preview-bar'
        previewBar.style.background = styles.titleBarGradient

        const previewBody = document.createElement('div')
        previewBody.className = 'theme-preview-body'

        const previewCard1 = document.createElement('div')
        previewCard1.className = 'theme-preview-card'
        previewCard1.style.background = styles.cardBackground
        previewCard1.style.border = '1px solid ' + styles.borderColor

        const previewCard2 = document.createElement('div')
        previewCard2.className = 'theme-preview-card'
        previewCard2.style.background = styles.cardBackground
        previewCard2.style.border = '1px solid ' + styles.borderColor

        previewBody.appendChild(previewCard1)
        previewBody.appendChild(previewCard2)

        const themeCheck = document.createElement('div')
        themeCheck.className = 'theme-check'
        themeCheck.textContent = '✓'

        themePreview.appendChild(previewBar)
        themePreview.appendChild(previewBody)
        themePreview.appendChild(themeCheck)

        // 主题名称和描述
        const themeName = document.createElement('div')
        themeName.className = 'theme-name'
        themeName.textContent = styles.name

        const themeDesc = document.createElement('div')
        themeDesc.className = 'theme-desc'
        themeDesc.textContent = styles.description

        themeCard.appendChild(themePreview)
        themeCard.appendChild(themeName)
        themeCard.appendChild(themeDesc)

        themeGrid.appendChild(themeCard)
    }

    // 创建页脚
    const footer = document.createElement('div')
    footer.className = 'footer'
    footer.textContent = '主题更改后立即生效，无需重启'

    mainContent.appendChild(themeGrid)
    mainContent.appendChild(footer)

    // 组装页面
    document.body.appendChild(titleBar)
    document.body.appendChild(mainContent)

    // 创建脚本
    const scriptElement = document.createElement('script')
    scriptElement.textContent = `
    const { ipcRenderer } = require("electron");

    var cards = document.querySelectorAll(".theme-card");
    for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener("click", function() {
            var themeType = this.getAttribute("data-theme");
            ipcRenderer.send("baize-notes:set-theme", themeType);
        });
    }

    document.getElementById("close-dialog-btn").onclick = function() {
        window.close();
    };

    ipcRenderer.on("baize-notes:theme-changed", function(event, themeType) {
        var cards = document.querySelectorAll(".theme-card");
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            if (card.getAttribute("data-theme") === themeType) {
                card.classList.add("selected");
            } else {
                card.classList.remove("selected");
            }
        }
    });

    ipcRenderer.on("baize-notes:init-theme-styles", function(event, theme) {
        var root = document.documentElement;
        root.style.setProperty("--bg-color", theme.backgroundColor);
        root.style.setProperty("--card-bg", theme.cardBackground);
        root.style.setProperty("--text-color", theme.textColor);
        root.style.setProperty("--secondary-text-color", theme.secondaryTextColor);
        root.style.setProperty("--border-color", theme.borderColor);
        root.style.setProperty("--accent-color", theme.accentColor);
        root.style.setProperty("--title-bar-gradient", theme.titleBarGradient);
    });`

    document.body.appendChild(scriptElement)

    return document.documentElement.outerHTML
}
