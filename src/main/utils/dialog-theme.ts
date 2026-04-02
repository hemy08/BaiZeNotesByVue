/**
 * 通用主题样式模块
 * 为对话框提供统一的主题样式
 */

import { getCurrentThemeStyles, ThemeStyles } from '../themes/theme-config'

/**
 * 获取主题CSS变量样式
 */
export function getThemeCssVariables(theme?: ThemeStyles): string {
    const t = theme || getCurrentThemeStyles()
    return `
        :root {
            --bg-color: ${t.backgroundColor};
            --card-bg: ${t.cardBackground};
            --text-color: ${t.textColor};
            --secondary-text-color: ${t.secondaryTextColor};
            --border-color: ${t.borderColor};
            --accent-color: ${t.accentColor};
            --hover-bg: ${t.hoverBackground};
            --title-bar-gradient: ${t.titleBarGradient};
            --button-bg: ${t.buttonBackground};
            --button-text: ${t.buttonTextColor};
        }
    `
}

/**
 * 获取通用对话框样式
 */
export function getCommonDialogStyles(): string {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background-color: var(--bg-color);
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
            justify-content: flex-end;
            align-items: center;
            padding: 0 10px;
            -webkit-app-region: drag;
            flex-shrink: 0;
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
        
        .main-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .container {
            background: var(--card-bg);
            border-radius: 8px;
            padding: 20px;
            border: 1px solid var(--border-color);
        }
        
        h2, h3 {
            color: var(--text-color);
            margin-bottom: 15px;
        }
        
        label {
            color: var(--text-color);
            font-weight: 500;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 14px;
            background: var(--card-bg);
            color: var(--text-color);
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--accent-color);
        }
        
        button {
            padding: 8px 16px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        
        button:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
        }
        
        button.primary {
            background: var(--accent-color);
            color: var(--card-bg);
            border-color: var(--accent-color);
        }
        
        button.primary:hover {
            opacity: 0.9;
        }
        
        .form-group {
            margin-bottom: 15px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 6px;
        }
        
        .btn-list-style {
            margin-top: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 50px;
        }
    `
}

/**
 * 获取主题初始化脚本
 */
export function getThemeInitScript(): string {
    return `
        // 初始化主题变量
        function initThemeStyles(theme) {
            document.documentElement.style.setProperty('--bg-color', theme.backgroundColor);
            document.documentElement.style.setProperty('--card-bg', theme.cardBackground);
            document.documentElement.style.setProperty('--text-color', theme.textColor);
            document.documentElement.style.setProperty('--secondary-text-color', theme.secondaryTextColor);
            document.documentElement.style.setProperty('--border-color', theme.borderColor);
            document.documentElement.style.setProperty('--accent-color', theme.accentColor);
            document.documentElement.style.setProperty('--hover-bg', theme.hoverBackground);
            document.documentElement.style.setProperty('--title-bar-gradient', theme.titleBarGradient);
            document.documentElement.style.setProperty('--button-bg', theme.buttonBackground);
            document.documentElement.style.setProperty('--button-text', theme.buttonTextColor);
        }
        
        // 监听主题初始化
        ipcRenderer.on('baize-notes:init-theme-styles', (event, theme) => {
            initThemeStyles(theme);
        });
        
        // 监听主题更新
        ipcRenderer.on('baize-notes:theme-updated', () => {
            location.reload();
        });
    `
}

/**
 * 获取标题栏HTML
 */
export function getTitleBarHtml(): string {
    return `
    <div class="title-bar">
        <button class="close-btn" onclick="window.close()">✕</button>
    </div>
    `
}
