import type { ThemeStyles } from '../config'
import { SystemSetting } from '../global-types'

export function getEditorSettingCSS(themeStyles: ThemeStyles, systemSettings: SystemSetting): string {
    return `
        :root {
            --bg-color: ${themeStyles.backgroundColor};
            --card-bg: ${themeStyles.cardBackground};
            --text-color: ${themeStyles.textColor};
            --secondary-text-color: ${themeStyles.secondaryTextColor};
            --border-color: ${themeStyles.borderColor};
            --accent-color: ${themeStyles.accentColor};
            --hover-bg: ${themeStyles.hoverBackground};
            --title-bar-gradient: ${themeStyles.titleBarGradient};
            --system-font-family: ${systemSettings.fontFamily};
            --system-font-size: ${systemSettings.fontSize}px;
            --font-size-xs: calc(var(--system-font-size) - 2px);
            --font-size-sm: calc(var(--system-font-size) - 1px);
            --font-size-base: var(--system-font-size);
            --font-size-lg: calc(var(--system-font-size) + 1px);
            --font-size-xl: calc(var(--system-font-size) + 2px);
            --font-size-2xl: calc(var(--system-font-size) + 4px);
            --spacing-xs: 8px;
            --spacing-sm: 16px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--system-font-family);
            font-size: var(--system-font-size);
            background: var(--bg-color);
            color: var(--text-color);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* 标题栏 */
        .title-bar {
            height: 48px;
            padding: 0 24px;
            background: var(--title-bar-gradient);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            -webkit-app-region: drag;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .title-text {
            font-size: var(--font-size-lg);
            font-weight: 600;
            letter-spacing: 0.3px;
        }

        .close-btn {
            background: rgba(255, 255, 255, 0.15);
            border: none;
            color: white;
            font-size: var(--font-size-xl);
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            -webkit-app-region: no-drag;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            background: rgba(255, 255, 255, 0.25);
            transform: scale(1.05);
        }

        /* 主容器 */
        .main-content {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* 侧边栏 */
        .sidebar {
            width: 30%;
            background: var(--card-bg);
            border-right: 1px solid var(--border-color);
            flex-shrink: 0;
            overflow-y: auto;
            padding: 16px 0;
        }

        .sidebar-item {
            padding: 12px 24px;
            cursor: pointer;
            font-size: var(--font-size-base);
            transition: all 0.2s ease;
            color: var(--text-color);
            display: flex;
            align-items: center;
            border-left: 3px solid transparent;
            margin: 2px 0;
        }

        .sidebar-item:hover {
            background: var(--hover-bg);
        }

        .sidebar-item.active {
            background: var(--hover-bg);
            border-left-color: var(--accent-color);
            color: var(--accent-color);
            font-weight: 500;
        }

        /* 内容区域 */
        .content-area {
            flex: 1;
            padding: 16px 20px;
            overflow-y: auto;
            background: var(--card-bg);
        }

        .setting-section {
            display: none;
        }

        .setting-section.active {
            display: block;
        }

        .section-title {
            font-size: var(--font-size-2xl);
            font-weight: 600;
            margin-bottom: var(--spacing-sm);
            padding-bottom: 8px;
            border-bottom: 2px solid var(--border-color);
            color: var(--text-color);
            letter-spacing: 0.3px;
        }

        /* 设置行 - 多列布局 */
        .setting-group {
            display: grid;
            grid-template-columns: 180px 1fr;
            align-items: center;
            margin-bottom: 6px;
            gap: 8px;
            width: 100%;
            padding: 2px 0;
        }

        .setting-label {
            font-size: var(--font-size-base);
            color: var(--text-color);
            text-align: right;
            padding-right: 8px;
            font-weight: 500;
        }

        .setting-value {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* 配置项容器 - 单列布局 */
        .settings-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* 配置项分组 */
        .settings-group-container {
            margin-bottom: 12px;
            padding: 10px;
            background: var(--bg-color);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .settings-group-title {
            font-size: var(--font-size-lg);
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-color);
            letter-spacing: 0.2px;
        }

        .setting-input {
            width: 200px;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: var(--font-size-base);
            transition: all 0.2s ease;
        }

        .setting-input:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.1);
        }

        .setting-select {
            width: 200px;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: var(--font-size-base);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .setting-select:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.1);
        }

        .setting-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .setting-checkbox input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: var(--accent-color);
            border-radius: 4px;
        }

        .setting-checkbox label {
            font-size: var(--font-size-base);
            cursor: pointer;
            color: var(--text-color);
        }

        .number-input {
            width: 100px;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: var(--font-size-base);
            transition: all 0.2s ease;
        }

        .number-input:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.1);
        }

        /* 底部按钮栏 */
        .button-group {
            flex-shrink: 0;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 12px 20px;
            background: var(--card-bg);
            border-top: 1px solid var(--border-color);
        }

        .btn {
            padding: 8px 20px;
            font-size: var(--font-size-base);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 500;
        }

        .btn:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .btn-secondary {
            background: var(--card-bg);
            color: var(--text-color);
            border-color: var(--border-color);
        }

        .btn-secondary:hover {
            background: var(--hover-bg);
        }

        .btn-primary {
            background: var(--accent-color);
            color: var(--card-bg);
            border-color: var(--accent-color);
        }

        .btn-primary:hover {
            opacity: 0.9;
        }

        /* 滚动条样式 */
        .sidebar::-webkit-scrollbar,
        .content-area::-webkit-scrollbar {
            width: 6px;
        }

        .sidebar::-webkit-scrollbar-track,
        .content-area::-webkit-scrollbar-track {
            background: transparent;
        }

        .sidebar::-webkit-scrollbar-thumb,
        .content-area::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 3px;
        }

        .sidebar::-webkit-scrollbar-thumb:hover,
        .content-area::-webkit-scrollbar-thumb:hover {
            background: var(--accent-color);
        }
    `
}