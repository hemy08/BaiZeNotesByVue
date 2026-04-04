/**
 * 主题设置对话框
 * 用于管理应用的主题设置
 */

import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
// @ts-ignore
import {
    getCurrentTheme,
    setTheme,
    ThemeType,
    getAllThemes,
    getAllMonacoThemes,
    getSeparateEditorTheme,
    setSeparateEditorTheme,
    getMonacoTheme,
    setMonacoTheme,
    MonacoThemeType,
    getCurrentThemeStyles
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

    // 创建窗口
    themeSettingDialog = new BrowserWindow({
        width: 900,
        height: 600,
        frame: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    // 生成 HTML 内容
    const html = generateThemeSettingHTML()

    // 加载 HTML
    themeSettingDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    // 加载完成后发送初始化主题样式
    themeSettingDialog.webContents.on('did-finish-load', () => {
        const themeStyles = getCurrentThemeStyles()
        const separateEditorTheme = getSeparateEditorTheme()
        const monacoTheme = getMonacoTheme()
        themeSettingDialog?.webContents.send('baize-notes:init-theme-styles', {
            theme: themeStyles,
            separateEditorTheme,
            monacoTheme
        })
    })

    // 窗口关闭时清理
    themeSettingDialog.on('closed', () => {
        themeSettingDialog = null
    })
}

/**
 * 生成主题设置对话框 HTML
 */
function generateThemeSettingHTML(): string {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
    const document = dom.window.document

    // 获取当前主题样式用于 CSS 变量
    const themeStyles = getCurrentThemeStyles()

    // 创建标题栏（固定在顶部）
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'

    const titleSpan = document.createElement('span')
    titleSpan.className = 'title-bar-title'
    titleSpan.textContent = '主题设置'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = '×'
    closeBtn.id = 'close-dialog-btn'

    titleBar.appendChild(titleSpan)
    titleBar.appendChild(closeBtn)

    // 创建主容器（包含侧边栏和内容区域）
    const mainContainer = document.createElement('div')
    mainContainer.className = 'main-container'

    // 创建侧边栏
    const sidebar = document.createElement('div')
    sidebar.className = 'sidebar'

    // 创建侧边栏列表项
    const sidebarItems = [
        { id: 'app-theme', name: '应用主题', icon: '🎨' },
        { id: 'editor-theme', name: '编辑器主题', icon: '📝' }
    ]

    sidebarItems.forEach((item) => {
        const sidebarItem = document.createElement('div')
        sidebarItem.className = 'sidebar-item'
        sidebarItem.setAttribute('data-id', item.id)
        sidebarItem.innerHTML = `<span class="sidebar-icon">${item.icon}</span><span class="sidebar-name">${item.name}</span>`
        sidebar.appendChild(sidebarItem)
    })

    // 创建内容区域
    const contentArea = document.createElement('div')
    contentArea.className = 'content-area'

    // 创建应用主题内容
    const appThemeContent = document.createElement('div')
    appThemeContent.className = 'content-panel active'
    appThemeContent.id = 'app-theme-panel'

    // 创建单独配置编辑器主题复选框
    const separateEditorThemeContainer = document.createElement('div')
    separateEditorThemeContainer.className = 'separate-editor-theme-container'

    const separateEditorThemeCheckbox = document.createElement('input')
    separateEditorThemeCheckbox.type = 'checkbox'
    separateEditorThemeCheckbox.id = 'separate-editor-theme-checkbox'
    separateEditorThemeCheckbox.className = 'separate-editor-theme-checkbox'

    const separateEditorThemeLabel = document.createElement('label')
    separateEditorThemeLabel.htmlFor = 'separate-editor-theme-checkbox'
    separateEditorThemeLabel.className = 'separate-editor-theme-label'
    separateEditorThemeLabel.textContent = '是否单独配置编辑区主题'

    separateEditorThemeContainer.appendChild(separateEditorThemeCheckbox)
    separateEditorThemeContainer.appendChild(separateEditorThemeLabel)

    // 创建应用主题网格
    const appThemeGrid = document.createElement('div')
    appThemeGrid.className = 'theme-grid'

    // 获取所有应用主题
    const allThemes = getAllThemes()
    const currentTheme = getCurrentTheme()

    for (const { type, styles } of allThemes) {
        const themeCard = createThemeCard(document, type, styles, 'app-theme', currentTheme === type)
        appThemeGrid.appendChild(themeCard)
    }

    appThemeContent.appendChild(separateEditorThemeContainer)
    appThemeContent.appendChild(appThemeGrid)

    // 创建编辑器主题内容
    const editorThemeContent = document.createElement('div')
    editorThemeContent.className = 'content-panel'
    editorThemeContent.id = 'editor-theme-panel'

    // 创建编辑器主题网格
    const editorThemeGrid = document.createElement('div')
    editorThemeGrid.className = 'editor-theme-grid'

    // 获取所有 Monaco 编辑器主题
    const allMonacoThemes = getAllMonacoThemes()
    const currentMonacoTheme = getMonacoTheme()
    const isSeparateEditorTheme = getSeparateEditorTheme()

    for (const { type, config } of allMonacoThemes) {
        const themeCard = createMonacoThemeCard(document, type, config, currentMonacoTheme === type, isSeparateEditorTheme)
        editorThemeGrid.appendChild(themeCard)
    }

    editorThemeContent.appendChild(editorThemeGrid)

    contentArea.appendChild(appThemeContent)
    contentArea.appendChild(editorThemeContent)

    mainContainer.appendChild(sidebar)
    mainContainer.appendChild(contentArea)

    // 组装页面
    document.body.appendChild(titleBar)
    document.body.appendChild(mainContainer)

    // 创建样式
    const styleElement = document.createElement('style')
    styleElement.textContent = `
        :root {
            --bg-color: ${themeStyles.backgroundColor};
            --card-bg: ${themeStyles.cardBackground};
            --text-color: ${themeStyles.textColor};
            --secondary-text-color: ${themeStyles.secondaryTextColor};
            --border-color: ${themeStyles.borderColor};
            --accent-color: ${themeStyles.accentColor};
            --hover-bg: ${themeStyles.hoverBackground};
            --title-bar-gradient: ${themeStyles.titleBarGradient};
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background: var(--bg-color);
            color: var(--text-color);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .title-bar {
            height: 44px;
            padding: 0 20px;
            background: var(--title-bar-gradient);
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            -webkit-app-region: drag;
        }

        .title-bar-title {
            font-size: 16px;
            font-weight: 500;
        }

        .close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 20px;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            cursor: pointer;
            -webkit-app-region: no-drag;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .main-container {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        .sidebar {
            width: 200px;
            background: var(--card-bg);
            border-right: 1px solid var(--border-color);
            flex-shrink: 0;
            overflow-y: auto;
        }

        .sidebar-item {
            padding: 12px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: background 0.2s;
            border-left: 3px solid transparent;
        }

        .sidebar-item:hover {
            background: var(--hover-bg);
        }

        .sidebar-item.active {
            background: var(--hover-bg);
            border-left-color: var(--accent-color);
        }

        .sidebar-icon {
            font-size: 18px;
        }

        .sidebar-name {
            font-size: 14px;
            font-weight: 500;
        }

        .content-area {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .content-panel {
            display: none;
        }

        .content-panel.active {
            display: block;
        }

        .separate-editor-theme-container {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .separate-editor-theme-checkbox {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .separate-editor-theme-label {
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
        }

        .theme-grid, .editor-theme-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 16px;
        }

        .theme-card, .monaco-theme-card {
            background: var(--card-bg);
            border: 2px solid transparent;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
        }

        .theme-card:hover, .monaco-theme-card:hover:not(.disabled) {
            border-color: var(--accent-color);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .theme-card.selected, .monaco-theme-card.selected {
            border-color: var(--accent-color);
            background: var(--hover-bg);
        }

        .monaco-theme-card.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .monaco-theme-card.disabled:hover {
            transform: none;
            box-shadow: none;
        }

        .theme-preview, .monaco-theme-preview {
            width: 100%;
            height: 60px;
            border-radius: 6px;
            margin-bottom: 8px;
            position: relative;
            overflow: hidden;
        }

        .theme-preview-bar {
            height: 6px;
            background: var(--title-bar-gradient);
            border-radius: 6px 6px 0 0;
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

        .theme-check, .monaco-theme-check {
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

        .theme-card.selected .theme-check,
        .monaco-theme-card.selected .monaco-theme-check {
            display: flex;
        }

        .theme-name, .monaco-theme-name {
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 3px;
            font-size: 13px;
        }

        .theme-desc, .monaco-theme-desc {
            font-size: 10px;
            color: var(--secondary-text-color);
            line-height: 1.3;
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

    document.head.appendChild(styleElement)

    // 创建脚本
    const scriptElement = document.createElement('script')
    scriptElement.textContent = `
    const { ipcRenderer } = require("electron");

    // 初始化
    const separateEditorThemeCheckbox = document.getElementById('separate-editor-theme-checkbox');
    const isSeparateEditorTheme = ${isSeparateEditorTheme};
    separateEditorThemeCheckbox.checked = isSeparateEditorTheme;

    // 侧边栏切换
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const contentPanels = document.querySelectorAll('.content-panel');

    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            
            // 更新侧边栏选中状态
            sidebarItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            // 切换内容面板
            contentPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(id + '-panel').classList.add('active');
        });
    });

    // 监听复选框变化
    separateEditorThemeCheckbox.addEventListener('change', function() {
        ipcRenderer.send("baize-notes:theme-update", {
            themeType: null,
            separateEditorTheme: this.checked,
            monacoTheme: null
        });
    });

    // 更新编辑器主题卡片状态
    function updateEditorThemeCardsState(enabled) {
        const cards = document.querySelectorAll('.monaco-theme-card');
        cards.forEach(card => {
            if (enabled) {
                card.classList.remove('disabled');
            } else {
                card.classList.add('disabled');
            }
        });
    }

    // 应用主题卡片点击事件
    const appThemeCards = document.querySelectorAll('.theme-card');
    for (var i = 0; i < appThemeCards.length; i++) {
        appThemeCards[i].addEventListener('click', function() {
            var themeType = this.getAttribute('data-theme');
            // 发送主题更新请求到主进程，包含所有配置信息
            ipcRenderer.send("baize-notes:theme-update", {
                themeType: themeType,
                separateEditorTheme: separateEditorThemeCheckbox.checked,
                monacoTheme: null
            });
        });
    }

    // 编辑器主题卡片点击事件
    const editorThemeCards = document.querySelectorAll('.monaco-theme-card');
    for (var i = 0; i < editorThemeCards.length; i++) {
        editorThemeCards[i].addEventListener('click', function() {
            if (this.classList.contains('disabled')) {
                return;
            }
            var themeType = this.getAttribute('data-theme');
            // 发送主题更新请求到主进程，包含所有配置信息
            ipcRenderer.send("baize-notes:theme-update", {
                themeType: null,
                separateEditorTheme: separateEditorThemeCheckbox.checked,
                monacoTheme: themeType
            });
        });
    }

    // 关闭按钮
    document.getElementById("close-dialog-btn").onclick = function() {
        window.close();
    };

    // 监听主题更新
    ipcRenderer.on("baize-notes:theme-updated", function(event, data) {
        // 更新应用主题选中状态
        if (data.themeType) {
            var cards = document.querySelectorAll('.theme-card');
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                if (card.getAttribute('data-theme') === data.themeType) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            }
        }

        // 更新编辑器主题选中状态
        if (data.monacoTheme) {
            var editorCards = document.querySelectorAll('.monaco-theme-card');
            for (var i = 0; i < editorCards.length; i++) {
                var card = editorCards[i];
                if (card.getAttribute('data-theme') === data.monacoTheme) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            }
        }

        // 更新单独配置编辑器主题复选框
        if (data.separateEditorTheme !== undefined) {
            separateEditorThemeCheckbox.checked = data.separateEditorTheme;
            updateEditorThemeCardsState(data.separateEditorTheme);
        }

        // 更新主题样式
        if (data.themeStyles) {
            var root = document.documentElement;
            root.style.setProperty("--bg-color", data.themeStyles.backgroundColor);
            root.style.setProperty("--card-bg", data.themeStyles.cardBackground);
            root.style.setProperty("--text-color", data.themeStyles.textColor);
            root.style.setProperty("--secondary-text-color", data.themeStyles.secondaryTextColor);
            root.style.setProperty("--border-color", data.themeStyles.borderColor);
            root.style.setProperty("--accent-color", data.themeStyles.accentColor);
            root.style.setProperty("--hover-bg", data.themeStyles.hoverBackground);
            root.style.setProperty("--title-bar-gradient", data.themeStyles.titleBarGradient);
        }
    });

    // 初始化主题样式
    ipcRenderer.on("baize-notes:init-theme-styles", function(event, initData) {
        var root = document.documentElement;
        root.style.setProperty("--bg-color", initData.theme.backgroundColor);
        root.style.setProperty("--card-bg", initData.theme.cardBackground);
        root.style.setProperty("--text-color", initData.theme.textColor);
        root.style.setProperty("--secondary-text-color", initData.theme.secondaryTextColor);
        root.style.setProperty("--border-color", initData.theme.borderColor);
        root.style.setProperty("--accent-color", initData.theme.accentColor);
        root.style.setProperty("--hover-bg", initData.theme.hoverBackground);
        root.style.setProperty("--title-bar-gradient", initData.theme.titleBarGradient);

        // 更新复选框状态
        separateEditorThemeCheckbox.checked = initData.separateEditorTheme;
        updateEditorThemeCardsState(initData.separateEditorTheme);
    });
    `

    document.body.appendChild(scriptElement)

    return document.documentElement.outerHTML
}

/**
 * 创建应用主题卡片
 */
function createThemeCard(
    document: Document,
    type: ThemeType,
    styles: any,
    cardType: string,
    isSelected: boolean
): HTMLElement {
    const themeCard = document.createElement('div')
    themeCard.className = `theme-card ${isSelected ? ' selected' : ''}`
    themeCard.setAttribute('data-theme', type)
    themeCard.setAttribute('data-type', cardType)

    // 主题预览
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

    return themeCard
}

/**
 * 创建 Monaco 编辑器主题卡片
 */
function createMonacoThemeCard(
    document: Document,
    type: MonacoThemeType,
    config: any,
    isSelected: boolean,
    isEnabled: boolean
): HTMLElement {
    const themeCard = document.createElement('div')
    themeCard.className = `monaco-theme-card ${isSelected ? ' selected' : ''} ${!isEnabled ? ' disabled' : ''}`
    themeCard.setAttribute('data-theme', type)

    // 主题预览 - 使用实际的主题颜色
    const themePreview = document.createElement('div')
    themePreview.className = 'monaco-theme-preview'
    themePreview.style.background = config.backgroundColor || (config.isDark ? '#1e1e1e' : '#ffffff')

    const previewBar = document.createElement('div')
    previewBar.className = 'theme-preview-bar'
    previewBar.style.background = config.backgroundColor || (config.isDark ? '#1e1e1e' : '#ffffff')

    const previewBody = document.createElement('div')
    previewBody.className = 'theme-preview-body'

    const previewCard1 = document.createElement('div')
    previewCard1.className = 'theme-preview-card'
    previewCard1.style.background = config.cardBackground || (config.isDark ? '#2d2d2d' : '#f0f0f0')
    previewCard1.style.border = '1px solid ' + (config.borderColor || (config.isDark ? '#404040' : '#e0e0e0'))

    const previewCard2 = document.createElement('div')
    previewCard2.className = 'theme-preview-card'
    previewCard2.style.background = config.cardBackground || (config.isDark ? '#2d2d2d' : '#f0f0f0')
    previewCard2.style.border = '1px solid ' + (config.borderColor || (config.isDark ? '#404040' : '#e0e0e0'))

    previewBody.appendChild(previewCard1)
    previewBody.appendChild(previewCard2)

    const themeCheck = document.createElement('div')
    themeCheck.className = 'monaco-theme-check'
    themeCheck.textContent = '✓'

    themePreview.appendChild(previewBar)
    themePreview.appendChild(previewBody)
    themePreview.appendChild(themeCheck)

    // 主题名称和描述
    const themeName = document.createElement('div')
    themeName.className = 'monaco-theme-name'
    themeName.textContent = config.name

    const themeDesc = document.createElement('div')
    themeDesc.className = 'monaco-theme-desc'
    themeDesc.textContent = config.description

    themeCard.appendChild(themePreview)
    themeCard.appendChild(themeName)
    themeCard.appendChild(themeDesc)

    return themeCard
}

// 注册 IPC 处理器
ipcMain.on('baize-notes:theme-update', (_, data: { themeType: ThemeType | null, separateEditorTheme: boolean | null, monacoTheme: MonacoThemeType | null }) => {
    // 更新配置
    if (data.themeType) {
        setTheme(data.themeType)
    }
    if (data.separateEditorTheme !== null) {
        setSeparateEditorTheme(data.separateEditorTheme)
    }
    if (data.monacoTheme) {
        setMonacoTheme(data.monacoTheme)
    }

    // 获取当前配置
    const currentThemeType = getCurrentTheme()
    const currentSeparateEditorTheme = getSeparateEditorTheme()
    const currentMonacoTheme = getMonacoTheme()
    const currentThemeStyles = getCurrentThemeStyles()

    // 发送主题更新到所有窗口，包含所有配置信息
    const { BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('baize-notes:theme-updated', {
            themeType: currentThemeType,
            separateEditorTheme: currentSeparateEditorTheme,
            monacoTheme: currentMonacoTheme,
            themeStyles: currentThemeStyles
        })
    })
})
