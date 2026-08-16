import type { ThemeStyles } from '../../config'
import { SystemSetting } from '../../global-types'

export function getDialogThemeVariables(themeStyles: ThemeStyles, systemSettings: SystemSetting): string {
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
    `
}

export function getDialogBaseCSS(): string {
    return `
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
    `
}

export function getDialogTitleBarCSS(): string {
    return `
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
    `
}

export function getDialogSidebarCSS(): string {
    return `
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
    `
}

export function getDialogContentCSS(): string {
    return `
        .content-area {
            flex: 1;
            padding: 16px 20px;
            overflow-y: auto;
            background: var(--card-bg);
        }
    `
}

export function getDialogScrollbarCSS(): string {
    return `
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

export function getDialogSharedCSS(themeStyles: ThemeStyles, systemSettings: SystemSetting): string {
    return [
        getDialogThemeVariables(themeStyles, systemSettings),
        getDialogBaseCSS(),
        getDialogTitleBarCSS(),
        getDialogSidebarCSS(),
        getDialogContentCSS(),
        getDialogScrollbarCSS()
    ].join('\n')
}