/**
 * 关于对话框
 * 显示应用程序信息
 */

import { BrowserWindow } from 'electron'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../utils/theme-config'

let aboutDialog: Electron.BrowserWindow | null

// 版本信息
const APP_VERSION = '1.0.2'
const VUE_VERSION = '3.4.27'
const VITE_VERSION = '5.2.11'
const TYPESCRIPT_VERSION = '5.4.5'

// 获取构建日期
const BUILD_DATE = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
})

// 白泽图标SVG
const BAI_ZE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#764ba2;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#f093fb;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#ffd700;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#ffed4e;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#ffd700;stop-opacity:1" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.3"/>
        </filter>
        <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    </defs>
    <rect width="512" height="512" rx="100" fill="url(#bgGrad)" filter="url(#shadow)"/>
    <circle cx="256" cy="256" r="230" fill="none" stroke="rgba(255,215,0,0.3)" stroke-width="3" stroke-dasharray="20,10"/>
    <circle cx="256" cy="256" r="210" fill="none" stroke="rgba(255,215,0,0.2)" stroke-width="2" stroke-dasharray="15,8"/>
    <circle cx="256" cy="256" r="190" fill="none" stroke="rgba(255,215,0,0.15)" stroke-width="1.5" stroke-dasharray="10,5"/>
    <text x="256" y="280" font-family="STCaiyun, STXingkai, Microsoft YaHei, SimHei, sans-serif" font-size="220" font-weight="bold" fill="url(#textGrad)" text-anchor="middle" filter="url(#textShadow)" style="letter-spacing: 30px">白泽</text>
    <line x1="120" y1="320" x2="392" y2="320" stroke="rgba(255,215,0,0.5)" stroke-width="3" stroke-linecap="round"/>
    <text x="256" y="450" font-family="Microsoft YaHei, SimHei, sans-serif" font-size="100" font-weight="bold" fill="white" text-anchor="middle" filter="url(#glow)" style="letter-spacing: 20px">笔记</text>
    <g opacity="0.25">
        <circle cx="100" cy="200" r="25" fill="#fff"/>
        <circle cx="75" cy="210" r="20" fill="#fff"/>
        <circle cx="55" cy="200" r="22" fill="#fff"/>
        <circle cx="412" cy="200" r="25" fill="#fff"/>
        <circle cx="437" cy="210" r="20" fill="#fff"/>
        <circle cx="457" cy="200" r="22" fill="#fff"/>
    </g>
</svg>`

/**
 * 显示关于对话框
 */
export function ShowHelpAboutDialog() {
    if (aboutDialog) {
        aboutDialog.focus()
        return
    }

    aboutDialog = new BrowserWindow({
        width: 750,
        height: 600,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '关于 白泽笔记',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    aboutDialog.setMenu(null)

    const html = makeAboutHtml()
    aboutDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    aboutDialog.show()

    // 发送主题样式
    aboutDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        aboutDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    aboutDialog.on('closed', () => {
        aboutDialog = null
    })
}

/**
 * 生成关于页面HTML
 */
function makeAboutHtml(): string {
    const theme = getCurrentThemeStyles()
    const os = require('os')
    const sysInfo = os.type() + ' ' + os.arch() + ' ' + os.release()

    // 在主进程获取版本信息
    const electronVer = process.versions.electron
    const chromeVer = process.versions.chrome
    const nodeVer = process.versions.node
    const v8Ver = process.versions.v8
    const platform = process.platform

    // language=HTML
    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>关于 白泽笔记</title>
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
            justify-content: flex-end;
            align-items: center;
            padding: 0 10px;
            -webkit-app-region: drag;
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
            padding: 20px;
            gap: 20px;
        }

        .left-panel {
            width: 200px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding-top: 20px;
        }

        .icon-container {
            width: 150px;
            height: 150px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
        }

        .icon-container svg {
            width: 100%;
            height: 100%;
        }

        .app-name {
            font-size: 24px;
            font-weight: bold;
            color: ${theme.textColor};
            margin-top: 15px;
        }

        .app-version {
            font-size: 14px;
            color: ${theme.secondaryTextColor};
            margin-top: 5px;
        }

        .right-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .info-card {
            background: ${theme.cardBackground};
            border-radius: 8px;
            padding: 14px 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid ${theme.borderColor};
        }

        .info-card h3 {
            font-size: 13px;
            font-weight: 600;
            color: ${theme.accentColor};
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid ${theme.borderColor};
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            padding: 3px 0;
        }

        .info-row .label {
            color: ${theme.secondaryTextColor};
        }

        .info-row .value {
            color: ${theme.textColor};
            font-weight: 500;
        }

        .footer {
            padding: 10px 20px;
            text-align: center;
            font-size: 11px;
            color: ${theme.secondaryTextColor};
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground};
        }

        .footer a {
            color: ${theme.accentColor};
            text-decoration: none;
        }

        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="title-bar">
        <button class="close-btn" onclick="window.close()">x</button>
    </div>

    <div class="container">
        <div class="left-panel">
            <div class="icon-container">
                ${BAI_ZE_ICON_SVG}
            </div>
            <div class="app-name">白泽笔记</div>
            <div class="app-version">v${APP_VERSION}</div>
            <div class="app-desc">一款简洁优雅的</div>
            <div class="app-desc">Markdown</div>
            <div class="app-desc">笔记应用</div>
            <div class="app-desc">请尽情书写吧！！！</div>
        </div>

        <div class="right-panel">
            <div class="info-card">
                <h3>版本信息</h3>
                <div class="info-row">
                    <span class="label">应用版本</span>
                    <span class="value">v${APP_VERSION}</span>
                </div>
                <div class="info-row">
                    <span class="label">发布日期</span>
                    <span class="value">${BUILD_DATE}</span>
                </div>
                <div class="info-row">
                    <span class="label">Electron</span>
                    <span class="value">v${electronVer}</span>
                </div>
                <div class="info-row">
                    <span class="label">Chromium</span>
                    <span class="value">v${chromeVer}</span>
                </div>
                <div class="info-row">
                    <span class="label">Node.js</span>
                    <span class="value">v${nodeVer}</span>
                </div>
                <div class="info-row">
                    <span class="label">V8 引擎</span>
                    <span class="value">v${v8Ver}</span>
                </div>
            </div>

            <div class="info-card">
                <h3>开发框架</h3>
                <div class="info-row">
                    <span class="label">Vue</span>
                    <span class="value">v${VUE_VERSION}</span>
                </div>
                <div class="info-row">
                    <span class="label">Vite</span>
                    <span class="value">v${VITE_VERSION}</span>
                </div>
                <div class="info-row">
                    <span class="label">TypeScript</span>
                    <span class="value">v${TYPESCRIPT_VERSION}</span>
                </div>
            </div>

            <div class="info-card">
                <h3>系统环境</h3>
                <div class="info-row">
                    <span class="label">操作系统</span>
                    <span class="value">${sysInfo}</span>
                </div>
                <div class="info-row">
                    <span class="label">平台</span>
                    <span class="value">${platform}</span>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        <a href="#" onclick="openLink('https://github.com/hemy08/BaiZeNotesByVue')">GitHub</a>
        &nbsp;|&nbsp;
        <a href="#" onclick="openLink('https://hemy08.github.io/hemynotes/')">使用文档</a>
        &nbsp;|&nbsp;
        2024 Hemy08
    </div>

    <script>
        const { shell, ipcRenderer } = require('electron')

        function openLink(url) {
            shell.openExternal(url)
        }

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
