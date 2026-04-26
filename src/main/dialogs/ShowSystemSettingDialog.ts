import { BrowserWindow, ipcMain } from 'electron'
import { getCurrentThemeStyles } from '../themes/theme-config'
import { JSDOM } from 'jsdom'
import * as SystemSettingUtils from '../themes/system-setting'
import { StartAutoSaveFileTime } from '../utils/file-utils'
import { SystemSetting } from '../global-types'

let systemSettingDialog: Electron.BrowserWindow | null

export function ShowSystemSettingDialog(mainWindow: Electron.BrowserWindow) {
    if (systemSettingDialog) {
        return
    }
    systemSettingDialog = new BrowserWindow({
        width: 800,
        height: 700,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '系统设置',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    systemSettingDialog.setMenu(null)

    const tempHtml = makeSystemSettingDialogHtml()
    systemSettingDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)
    systemSettingDialog.show()

    const theme = getCurrentThemeStyles()
    systemSettingDialog?.webContents.send('baize-notes:init-theme-styles', theme)

    const savedSettings = SystemSettingUtils.getSystemSetting()
    systemSettingDialog?.webContents.send('load-saved-settings', savedSettings)

    systemSettingDialog.on('closed', () => {
        systemSettingDialog = null
        ipcMain.removeListener('dialog-system-setting-apply', processApplySysSetting)
        ipcMain.removeListener('dialog-system-setting-confirm', processConfirmSysSetting)
    })

    function processApplySysSetting(_, SysSetting: SystemSetting) {
        SystemSettingUtils.saveSystemSetting(SysSetting)

        // 只有在启用自动保存时才启动定时器
        if (SysSetting.autoSaveEnabled) {
            const autoSaveInterval = (SysSetting.autoSaveInterval || 60) * 1000
            StartAutoSaveFileTime(autoSaveInterval)
        }

        // 注入字体设置到主窗口
        const fontCss = `body, .title-bar, .menu-bar, .menu-label, .menu-item-label, .workspace-area, .status-bar, .navi-tab, .resource-manager, .md-edit-tools, .md-preview, .resizer-md, .resizer-main, #file-bar { font-family: ${SysSetting.fontFamily} !important; font-size: ${SysSetting.fontSize}px !important; }`
        mainWindow.webContents.insertCSS(fontCss)

        mainWindow.webContents.send('baize-notes:system-setting-update', SysSetting)
    }

    function processConfirmSysSetting(_, SysSetting: SystemSetting) {
        // 先保存，再关闭
        processApplySysSetting(_, SysSetting)
        if (systemSettingDialog) {
            systemSettingDialog.close()
            systemSettingDialog = null
        }
    }

    ipcMain.on('dialog-system-setting-apply', processApplySysSetting)
    ipcMain.on('dialog-system-setting-confirm', processConfirmSysSetting)
    ipcMain.on('dialog-system-setting-cancel', () => {
        if (systemSettingDialog) {
            systemSettingDialog.close()
            systemSettingDialog = null
        }
    })
}

function makeSystemSettingDialogHtml(): string {
    const systemSettings = SystemSettingUtils.getSystemSetting()
    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>系统设置</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            height: 100%;
            overflow: hidden;
            font-family: ${systemSettings.fontFamily};
            font-size: ${systemSettings.fontSize}px;
            background: var(--bg-color);
            color: var(--text-color);
        }
        :root {
            --bg-color: #f5f5f5;
            --card-bg: #ffffff;
            --text-color: #333333;
            --secondary-text-color: #666666;
            --border-color: #e0e0e0;
            --accent-color: #764ba2;
            --hover-bg: #f0e8ff;
            --title-bar-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --system-font-family: ${systemSettings.fontFamily};
            --system-font-size: ${systemSettings.fontSize}px;
            --font-size-xs: calc(var(--system-font-size) - 2px);
            --font-size-sm: calc(var(--system-font-size) - 1px);
            --font-size-base: var(--system-font-size);
            --font-size-lg: calc(var(--system-font-size) + 1px);
            --font-size-xl: calc(var(--system-font-size) + 2px);
            --font-size-2xl: calc(var(--system-font-size) + 4px);
        }

        .app-layout {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* 标题栏 */
        .title-bar {
            height: 48px;
            background: var(--title-bar-gradient);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 24px;
            -webkit-app-region: drag;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .title-bar-title {
            color: #fff;
            font-size: var(--font-size-lg);
            font-weight: 600;
            letter-spacing: 0.3px;
        }
        .close-btn {
            width: 32px;
            height: 32px;
            border: none;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-size-xl);
            color: #fff;
            transition: all 0.2s ease;
            -webkit-app-region: no-drag;
        }
        .close-btn:hover {
            background: rgba(255, 255, 255, 0.25);
            transform: scale(1.05);
        }

        /* 主容器：侧边栏 + 内容 */
        .main-container {
            flex: 1;
            display: flex;
            min-height: 0;
            overflow: hidden;
        }

        /* 侧边栏 */
        .sidebar {
            width: 30%;
            flex-shrink: 0;
            background: var(--card-bg);
            border-right: 1px solid var(--border-color);
            padding: 16px 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            overflow-y: auto;
        }
        .sidebar-item {
            padding: 12px 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            font-size: var(--font-size-base);
            color: var(--text-color);
            transition: all 0.2s ease;
            border-left: 3px solid transparent;
            margin: 2px 0;
        }
        .sidebar-item:hover { background: var(--hover-bg); }
        .sidebar-item.active {
            background: var(--hover-bg);
            border-left-color: var(--accent-color);
            color: var(--accent-color);
            font-weight: 500;
        }
        .sidebar-icon { font-size: var(--font-size-lg); opacity: 0.8; }

        /* 内容区域 */
        .content-area {
            flex: 1;
            padding: 16px 20px;
            overflow-y: auto;
            background: var(--card-bg);
        }
        .content-panel { display: none; }
        .content-panel.active { display: block; }

        .panel-title {
            font-size: var(--font-size-2xl);
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--border-color);
            letter-spacing: 0.3px;
        }
        .panel-description {
            font-size: var(--font-size-sm);
            color: var(--secondary-text-color);
            margin-bottom: 16px;
            padding: 8px 12px;
            background: var(--hover-bg);
            border-radius: 4px;
            border-left: 3px solid var(--accent-color);
        }

        /* 配置项容器 */
        .settings-grid {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* 设置行 */
        .setting-group {
            display: grid;
            grid-template-columns: 180px 1fr;
            align-items: center;
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
        .setting-hint {
            font-size: var(--font-size-xs);
            color: var(--secondary-text-color);
            margin-top: 4px;
        }

        /* 设置分组 */
        .setting-section {
            margin-bottom: 16px;
            padding: 12px;
            background: var(--card-bg);
            border-radius: 6px;
            border: 1px solid var(--border-color);
        }
        .section-title {
            font-size: var(--font-size-base);
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border-color);
        }

        select {
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: var(--font-size-base);
            background: var(--bg-color);
            color: var(--text-color);
            outline: none;
            width: 200px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        select:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(118, 75, 162, 0.1);
        }

        input[type="number"], input[type="text"] {
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: var(--font-size-base);
            background: var(--bg-color);
            color: var(--text-color);
            outline: none;
            width: 100px;
            transition: all 0.2s ease;
        }
        input[type="number"]:focus, input[type="text"]:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 3px rgba(118, 75, 162, 0.1);
        }

        input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: var(--accent-color);
        }

        label {
            font-size: var(--font-size-base);
            cursor: pointer;
            color: var(--text-color);
        }

        /* 字体预览 */
        .font-preview {
            margin-top: 16px;
            padding: 12px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-color);
        }
        .font-preview-title {
            font-size: var(--font-size-xs);
            color: var(--secondary-text-color);
            margin-bottom: 8px;
        }
        .font-preview-content {
            line-height: 1.6;
        }

        /* 底部按钮栏 */
        .footer-bar {
            flex-shrink: 0;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 12px 20px;
            background: var(--card-bg);
            border-top: 1px solid var(--border-color);
        }
        .footer-bar button {
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
        .footer-bar button:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .footer-bar button.primary {
            background: var(--accent-color);
            color: var(--card-bg);
            border-color: var(--accent-color);
        }
        .footer-bar button.primary:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
    </style>
</head>
<body>
    <div class="app-layout">
        <div class="title-bar">
            <span class="title-bar-title">系统设置</span>
            <button class="close-btn" onclick="cancelClose()">✕</button>
        </div>
        <div class="main-container">
            <div class="sidebar">
                <div class="sidebar-item active" data-panel="general" onclick="switchPanel('general')">
                    <span class="sidebar-icon">⚙</span> 通用设置
                </div>
                <div class="sidebar-item" data-panel="window" onclick="switchPanel('window')">
                    <span class="sidebar-icon">🪟</span> 窗口设置
                </div>
                <div class="sidebar-item" data-panel="font" onclick="switchPanel('font')">
                    <span class="sidebar-icon">🔤</span> 字体设置
                </div>
            </div>
            <div class="content-area">
                <!-- 通用设置面板 -->
                <div id="general-panel" class="content-panel active">
                    <div class="panel-title">通用设置</div>
                    <div class="settings-grid">
                        <div class="setting-group">
                            <span class="setting-label">系统语言：</span>
                            <div class="setting-value">
                                <select id="system-language">
                                    <option value="zh-cn">简体中文(默认)</option>
                                    <option value="zh-tw">繁體中文</option>
                                    <option value="en-us">English(US)</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">资源管理器：</span>
                            <div class="setting-value">
                                <select id="system-resource-manager">
                                    <option value="default">显示(默认)</option>
                                    <option value="hide">隐藏</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">编辑器视图：</span>
                            <div class="setting-value">
                                <select id="system-editor-view-model">
                                    <option value="default">编辑/预览模式(默认)</option>
                                    <option value="editor-preview-model">编辑/预览模式</option>
                                    <option value="editor-model">编辑模式</option>
                                    <option value="preview-model">预览模式</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">插件打开方式：</span>
                            <div class="setting-value">
                                <select id="system-plugin-open-model">
                                    <option value="default">浏览器网页(默认)</option>
                                    <option value="browser">浏览器网页</option>
                                    <option value="local-dialog">app对话框</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">菜单栏样式：</span>
                            <div class="setting-value">
                                <select id="system-menu-bar-style">
                                    <option value="electron">Electron样式(默认)</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">自动保存：</span>
                            <div class="setting-value">
                                <input type="checkbox" id="system-auto-save-enabled" onchange="toggleAutoSaveInterval()">
                                <label for="system-auto-save-enabled">启用自动保存</label>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">自动保存周期(秒)：</span>
                            <div class="setting-value">
                                <input type="number" id="system-auto-save-interval" min="5" max="86400" value="60">
                                <div class="setting-hint">最小5秒，最大86400秒(24小时)</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 窗口设置面板 -->
                <div id="window-panel" class="content-panel">
                    <div class="panel-title">窗口设置</div>
                    <div class="panel-description">配置各类对话框窗口的显示模式，勾选后窗口浮动在主窗口上方，无法操作主窗口。</div>
                    <div class="settings-grid">
                        <div class="setting-section">
                            <div class="section-title">📝 编辑器相关</div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-editor-setting-modal">
                                    <span class="setting-label">编辑器设置窗口</span>
                                </div>
                            </div>
                        </div>
                        <div class="setting-section">
                            <div class="section-title">⚙️ 系统相关</div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-system-setting-modal">
                                    <span class="setting-label">系统设置窗口</span>
                                </div>
                            </div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-theme-setting-modal">
                                    <span class="setting-label">主题设置窗口</span>
                                </div>
                            </div>
                        </div>
                        <div class="setting-section">
                            <div class="section-title">➕ 插入相关</div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-insert-image-modal">
                                    <span class="setting-label">插入图片窗口</span>
                                </div>
                            </div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-math-text-modal">
                                    <span class="setting-label">数学公式窗口</span>
                                </div>
                            </div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-web-url-modal">
                                    <span class="setting-label">网页链接窗口</span>
                                </div>
                            </div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-md-sheet-modal">
                                    <span class="setting-label">Markdown速查表窗口</span>
                                </div>
                            </div>
                        </div>
                        <div class="setting-section">
                            <div class="section-title">❓ 帮助相关</div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-help-about-modal">
                                    <span class="setting-label">帮助关于窗口</span>
                                </div>
                            </div>
                            <div class="setting-group">
                                <div class="setting-value">
                                    <input type="checkbox" id="system-help-contact-us-modal">
                                    <span class="setting-label">帮助联系我们窗口</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 字体设置面板 -->
                <div id="font-panel" class="content-panel">
                    <div class="panel-title">字体设置</div>
                    <div class="settings-grid">
                        <div class="setting-group">
                            <span class="setting-label">界面字体：</span>
                            <div class="setting-value">
                                <select id="system-font-family" onchange="updateFontPreview()">
                                    <option value='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif'>系统默认</option>
                                    <option value='"Microsoft YaHei", sans-serif'>微软雅黑</option>
                                    <option value='"SimSun", serif'>宋体</option>
                                    <option value='"SimHei", sans-serif'>黑体</option>
                                    <option value='"KaiTi", serif'>楷体</option>
                                    <option value='"FangSong", serif'>仿宋</option>
                                    <option value='"Segoe UI", sans-serif'>Segoe UI</option>
                                    <option value='"PingFang SC", sans-serif'>苹方-简</option>
                                    <option value='"Noto Sans SC", sans-serif'>Noto Sans SC</option>
                                    <option value='"Source Han Sans SC", sans-serif'>思源黑体</option>
                                    <option value='monospace'>等宽字体</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-group">
                            <span class="setting-label">界面字体大小：</span>
                            <div class="setting-value">
                                <select id="system-font-size" onchange="updateFontPreview()">
                                    <option value="10">10px</option>
                                    <option value="11">11px</option>
                                    <option value="12">12px</option>
                                    <option value="13" selected>13px(默认)</option>
                                    <option value="14">14px</option>
                                    <option value="15">15px</option>
                                    <option value="16">16px</option>
                                    <option value="18">18px</option>
                                    <option value="20">20px</option>
                                    <option value="22">22px</option>
                                    <option value="24">24px</option>
                                </select>
                                <div class="setting-hint">范围 10-24px，影响所有对话框和界面文字</div>
                            </div>
                        </div>
                    </div>
                    <div class="font-preview">
                        <div class="font-preview-title">字体预览</div>
                        <div class="font-preview-content" id="fontPreview">
                            白泽笔记 - Markdown Editor<br>
                            这是一段预览文字，用于展示当前字体设置效果。The quick brown fox jumps over the lazy dog.<br>
                            0123456789 !@#$%^&*()
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="footer-bar">
            <button onclick="cancelClose()">取消</button>
            <button class="primary" onclick="applySettings()">应用</button>
            <button class="primary" onclick="confirmSettings()">确定</button>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require('electron')

        function initThemeStyles(theme) {
            document.documentElement.style.setProperty('--bg-color', theme.backgroundColor)
            document.documentElement.style.setProperty('--card-bg', theme.cardBackground)
            document.documentElement.style.setProperty('--text-color', theme.textColor)
            document.documentElement.style.setProperty('--secondary-text-color', theme.secondaryTextColor)
            document.documentElement.style.setProperty('--border-color', theme.borderColor)
            document.documentElement.style.setProperty('--accent-color', theme.accentColor)
            document.documentElement.style.setProperty('--hover-bg', theme.hoverBackground)
            document.documentElement.style.setProperty('--title-bar-gradient', theme.titleBarGradient)
        }

        ipcRenderer.on('baize-notes:init-theme-styles', (event, theme) => { initThemeStyles(theme) })
        ipcRenderer.on('baize-notes:theme-updated', () => { location.reload() })

        // 切换面板
        function switchPanel(panelId) {
            document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'))
            document.querySelectorAll('.content-panel').forEach(panel => panel.classList.remove('active'))
            document.querySelector(\`.sidebar-item[data-panel="\${panelId}"]\`).classList.add('active')
            document.getElementById(panelId + '-panel').classList.add('active')
        }

        // 加载已保存的设置
        ipcRenderer.on('load-saved-settings', (event, s) => {
            if (s.language) document.getElementById('system-language').value = s.language
            if (s.resourceManager) document.getElementById('system-resource-manager').value = s.resourceManager
            if (s.editorModel) document.getElementById('system-editor-view-model').value = s.editorModel
            if (s.pluginOpen) document.getElementById('system-plugin-open-model').value = s.pluginOpen
            if (s.menuBarStyle) document.getElementById('system-menu-bar-style').value = s.menuBarStyle
            if (s.autoSaveEnabled !== undefined) {
                document.getElementById('system-auto-save-enabled').checked = s.autoSaveEnabled
                toggleAutoSaveInterval()
            }
            if (s.autoSaveInterval) document.getElementById('system-auto-save-interval').value = s.autoSaveInterval
            if (s.fontFamily) document.getElementById('system-font-family').value = s.fontFamily
            if (s.fontSize) document.getElementById('system-font-size').value = s.fontSize
            // 窗口浮动控制
            if (s.editorSettingModal !== undefined) {
                document.getElementById('system-editor-setting-modal').checked = s.editorSettingModal
            }
            if (s.systemSettingModal !== undefined) {
                document.getElementById('system-system-setting-modal').checked = s.systemSettingModal
            }
            if (s.themeSettingModal !== undefined) {
                document.getElementById('system-theme-setting-modal').checked = s.themeSettingModal
            }
            if (s.helpAboutModal !== undefined) {
                document.getElementById('system-help-about-modal').checked = s.helpAboutModal
            }
            if (s.helpContactUsModal !== undefined) {
                document.getElementById('system-help-contact-us-modal').checked = s.helpContactUsModal
            }
            updateFontPreview()
        })

        // 切换自动保存时间输入框的启用状态
        function toggleAutoSaveInterval() {
            const enabled = document.getElementById('system-auto-save-enabled').checked
            const intervalInput = document.getElementById('system-auto-save-interval')
            intervalInput.disabled = !enabled
        }

        // 更新字体预览
        function updateFontPreview() {
            const fontFamily = document.getElementById('system-font-family').value
            const fontSize = document.getElementById('system-font-size').value
            const preview = document.getElementById('fontPreview')
            if (preview) {
                preview.style.fontFamily = fontFamily
                preview.style.fontSize = fontSize + 'px'
            }
        }

        // 应用设置（不关闭对话框）
        function applySettings() {
            const SysSetting = gatherSettings()
            ipcRenderer.send('dialog-system-setting-apply', SysSetting)
        }

        // 确定设置（保存并关闭对话框）
        function confirmSettings() {
            const SysSetting = gatherSettings()
            ipcRenderer.send('dialog-system-setting-confirm', SysSetting)
        }

        // 收集设置数据
        function gatherSettings() {
            let autoSaveInterval = parseInt(document.getElementById('system-auto-save-interval').value)
            if (isNaN(autoSaveInterval) || autoSaveInterval < 5) autoSaveInterval = 5
            if (autoSaveInterval > 86400) autoSaveInterval = 86400

            let fontSize = parseInt(document.getElementById('system-font-size').value)
            if (isNaN(fontSize) || fontSize < 10) fontSize = 10
            if (fontSize > 24) fontSize = 24

            return {
                language: document.getElementById('system-language').value,
                resourceManager: document.getElementById('system-resource-manager').value,
                editorModel: document.getElementById('system-editor-view-model').value,
                pluginOpen: document.getElementById('system-plugin-open-model').value,
                menuBarStyle: document.getElementById('system-menu-bar-style').value,
                autoSaveEnabled: document.getElementById('system-auto-save-enabled').checked,
                autoSaveInterval: autoSaveInterval,
                fontFamily: document.getElementById('system-font-family').value,
                fontSize: fontSize
            }
        }

        // 取消关闭
        function cancelClose() {
            ipcRenderer.send('dialog-system-setting-cancel')
        }
    </script>
</body>
</html>
    `).window

    return document.documentElement.outerHTML
}
