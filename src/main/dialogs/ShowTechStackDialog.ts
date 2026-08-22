/**
 * 技术栈对话框
 * 显示项目使用的技术栈信息
 */

import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

/**
 * 显示技术栈对话框
 */
export function ShowTechStackDialog() {
    const existing = windowManager.getWindowByType('tech-stack-dialog')
    if (existing) {
        existing.focus()
        return
    }

    const techStackDialog = windowManager.createWindow('tech-stack-dialog', createDialogOptions({
        width: 900,
        height: 700,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '技术栈 - 白泽笔记'
    }), 'tech-stack-dialog', true)

    techStackDialog.setMenu(null)

    const html = makeTechStackHtml()
    techStackDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    techStackDialog.show()

    // 发送主题样式
    techStackDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        techStackDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })
}

/**
 * 生成技术栈页面HTML
 */
function makeTechStackHtml(): string {
    const theme = getCurrentThemeStyles()

    // language=HTML
    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>技术栈 - 白泽笔记</title>
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
            padding: 20px;
            overflow-y: auto;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 28px;
            color: ${theme.textColor};
            margin-bottom: 10px;
        }

        .header p {
            font-size: 14px;
            color: ${theme.secondaryTextColor};
        }

        .section {
            margin-bottom: 30px;
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: ${theme.textColor};
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid ${theme.accentColor};
        }

        .tech-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
        }

        .tech-card {
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 8px;
            padding: 15px;
            transition: all 0.3s;
            cursor: pointer;
        }

        .tech-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-color: ${theme.accentColor};
        }

        .tech-name {
            font-size: 16px;
            font-weight: 600;
            color: ${theme.accentColor};
            margin-bottom: 8px;
        }

        .tech-version {
            font-size: 12px;
            color: ${theme.secondaryTextColor};
            margin-bottom: 5px;
        }

        .tech-desc {
            font-size: 13px;
            color: ${theme.textColor};
            margin-bottom: 10px;
        }

        .tech-url {
            font-size: 11px;
            color: ${theme.accentColor};
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .tech-url:hover {
            text-decoration: underline;
        }

        .external-icon {
            font-size: 10px;
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
        <span class="title-text">技术栈</span>
        <button class="close-btn" onclick="window.close()">x</button>
    </div>
    
    <div class="container">
        <div class="header">
            <h1>🛠️ 技术栈</h1>
            <p>白泽笔记使用以下技术构建</p>
        </div>

        <div class="section">
            <div class="section-title">核心框架</div>
            <div class="tech-grid">
                <div class="tech-card" onclick="openLink('https://www.electronjs.org/')">
                    <div class="tech-name">Electron</div>
                    <div class="tech-version">版本: ^43.0.0</div>
                    <div class="tech-desc">跨平台桌面应用框架</div>
                    <div class="tech-url">
                        <span>https://www.electronjs.org/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://vuejs.org/')">
                    <div class="tech-name">Vue 3</div>
                    <div class="tech-version">版本: ^3.5.41</div>
                    <div class="tech-desc">渐进式 JavaScript 框架</div>
                    <div class="tech-url">
                        <span>https://vuejs.org/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://www.typescriptlang.org/')">
                    <div class="tech-name">TypeScript</div>
                    <div class="tech-version">版本: ^6.0.2</div>
                    <div class="tech-desc">JavaScript 的超集</div>
                    <div class="tech-url">
                        <span>https://www.typescriptlang.org/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://vitejs.dev/')">
                    <div class="tech-name">Vite</div>
                    <div class="tech-version">版本: ^8.2.2</div>
                    <div class="tech-desc">下一代前端构建工具</div>
                    <div class="tech-url">
                        <span>https://vitejs.dev/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://electron-vite.org/')">
                    <div class="tech-name">electron-vite</div>
                    <div class="tech-version">版本: ^6.0.0-beta.1</div>
                    <div class="tech-desc">Electron 专用 Vite 构建工具</div>
                    <div class="tech-url">
                        <span>https://electron-vite.org/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">编辑器与渲染</div>
            <div class="tech-grid">
                <div class="tech-card" onclick="openLink('https://microsoft.github.io/monaco-editor/')">
                    <div class="tech-name">Monaco Editor</div>
                    <div class="tech-version">版本: ^0.56.0</div>
                    <div class="tech-desc">VS Code 同款代码编辑器</div>
                    <div class="tech-url">
                        <span>https://microsoft.github.io/monaco-editor/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://markdown-it.github.io/')">
                    <div class="tech-name">markdown-it</div>
                    <div class="tech-version">版本: ^15.0.0</div>
                    <div class="tech-desc">Markdown 解析器</div>
                    <div class="tech-url">
                        <span>https://markdown-it.github.io/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://mermaid-js.github.io/mermaid/')">
                    <div class="tech-name">Mermaid</div>
                    <div class="tech-version">版本: ^11.17.0</div>
                    <div class="tech-desc">流程图/时序图渲染</div>
                    <div class="tech-url">
                        <span>https://mermaid-js.github.io/mermaid/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://katex.org/')">
                    <div class="tech-name">KaTeX</div>
                    <div class="tech-version">版本: ^0.18.4</div>
                    <div class="tech-desc">数学公式渲染</div>
                    <div class="tech-url">
                        <span>https://katex.org/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://highlightjs.org/')">
                    <div class="tech-name">highlight.js</div>
                    <div class="tech-version">版本: ^11.12.0</div>
                    <div class="tech-desc">代码语法高亮</div>
                    <div class="tech-url">
                        <span>https://highlightjs.org/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">数据与存储</div>
            <div class="tech-grid">
                <div class="tech-card" onclick="openLink('https://github.com/sindresorhus/electron-store')">
                    <div class="tech-name">electron-store</div>
                    <div class="tech-version">版本: ^11.0.2</div>
                    <div class="tech-desc">Electron 数据持久化</div>
                    <div class="tech-url">
                        <span>https://github.com/sindresorhus/electron-store</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://www.electron.build/auto-update')">
                    <div class="tech-name">electron-updater</div>
                    <div class="tech-version">版本: ^6.8.9</div>
                    <div class="tech-desc">应用自动更新</div>
                    <div class="tech-url">
                        <span>https://www.electron.build/auto-update</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">工具库</div>
            <div class="tech-grid">
                <div class="tech-card" onclick="openLink('https://cryptojs.gitbook.io/docs/')">
                    <div class="tech-name">crypto-js</div>
                    <div class="tech-version">版本: ^4.2.0</div>
                    <div class="tech-desc">JavaScript 加密库</div>
                    <div class="tech-url">
                        <span>https://cryptojs.gitbook.io/docs/</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://github.com/mwilliamson/mammoth.js')">
                    <div class="tech-name">mammoth</div>
                    <div class="tech-version">版本: ^1.12.1</div>
                    <div class="tech-desc">Word 文档解析</div>
                    <div class="tech-url">
                        <span>https://github.com/mwilliamson/mammoth.js</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
                <div class="tech-card" onclick="openLink('https://github.com/mixmark-io/turndown')">
                    <div class="tech-name">turndown</div>
                    <div class="tech-version">版本: ^7.2.0</div>
                    <div class="tech-desc">HTML 转 Markdown</div>
                    <div class="tech-url">
                        <span>https://github.com/mixmark-io/turndown</span>
                        <span class="external-icon">↗</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        点击卡片访问官网了解更多信息
    </div>

    <script>
        const ipcRenderer = window.electronAPI.ipcRenderer

        function openLink(url) {
            window.electronAPI.shell.openExternal(url)
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
