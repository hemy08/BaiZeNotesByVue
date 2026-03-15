/**
 * 联系我们对话框
 */

import { BrowserWindow } from 'electron'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../utils/theme-config'

let contactUsDialog: Electron.BrowserWindow | null

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
 * 显示联系我们对话框
 */
export function ShowHelpContactUsDialog() {
    if (contactUsDialog) {
        contactUsDialog.focus()
        return
    }

    contactUsDialog = new BrowserWindow({
        width: 600,
        height: 400,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '联系我们',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    contactUsDialog.setMenu(null)

    const html = makeContactUsHtml()
    contactUsDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    contactUsDialog.show()

    // 发送主题样式
    contactUsDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        contactUsDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    contactUsDialog.on('closed', () => {
        contactUsDialog = null
    })
}

/**
 * 生成联系我们页面HTML
 */
function makeContactUsHtml(): string {
    const theme = getCurrentThemeStyles()

    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>联系我们</title>
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
            width: 180px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding-top: 20px;
        }

        .icon-container {
            width: 130px;
            height: 130px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
        }

        .icon-container svg {
            width: 100%;
            height: 100%;
        }

        .right-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .author-name {
            font-size: 22px;
            font-weight: bold;
            color: ${theme.textColor};
        }

        .author-desc {
            font-size: 13px;
            color: ${theme.secondaryTextColor};
            margin-top: 4px;
        }

        .contact-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 10px;
        }

        .contact-item {
            display: flex;
            align-items: center;
            padding: 12px 15px;
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .contact-item:hover {
            background: ${theme.hoverBackground};
            border-color: ${theme.accentColor};
        }

        .contact-icon {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: ${theme.titleBarGradient};
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            flex-shrink: 0;
        }

        .contact-icon svg {
            width: 18px;
            height: 18px;
            fill: #fff;
        }

        .contact-info {
            flex: 1;
            min-width: 0;
        }

        .contact-label {
            font-size: 11px;
            color: ${theme.secondaryTextColor};
            margin-bottom: 2px;
        }

        .contact-value {
            font-size: 13px;
            color: ${theme.textColor};
            word-break: break-all;
        }

        .footer {
            padding: 10px 20px;
            text-align: center;
            font-size: 11px;
            color: ${theme.secondaryTextColor};
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground};
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
        </div>

        <div class="right-panel">
            <div class="author-name">Hemy08</div>
            <div class="author-desc">白泽笔记开发者</div>

            <div class="contact-list">
                <div class="contact-item" onclick="openLink('mailto:zhaojunwei008@yeah.net')">
                    <div class="contact-icon">
                        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    </div>
                    <div class="contact-info">
                        <div class="contact-label">邮箱</div>
                        <div class="contact-value">zhaojunwei008@yeah.net</div>
                    </div>
                </div>

                <div class="contact-item" onclick="openLink('https://github.com/hemy08/BaiZeNotesByVue')">
                    <div class="contact-icon">
                        <svg viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                    </div>
                    <div class="contact-info">
                        <div class="contact-label">GitHub</div>
                        <div class="contact-value">github.com/hemy08/BaiZeNotesByVue</div>
                    </div>
                </div>

                <div class="contact-item" onclick="openLink('https://github.com/hemy08/BaiZeNotesByVue/issues')">
                    <div class="contact-icon">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    </div>
                    <div class="contact-info">
                        <div class="contact-label">问题反馈</div>
                        <div class="contact-value">提交 Issue 或建议</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        感谢您使用白泽笔记
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
