import { BrowserWindow, ipcMain } from 'electron'
import { getCurrentThemeStyles } from '../themes/theme-config'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'
import * as EditorSettingUtils from '../utils/editor-setting'
import { FontFamily } from '../utils/common'

let editorSettingDialog: Electron.BrowserWindow | null

// 创建编辑器设置对话框
export function ShowEditorSettingDialog(mainWindow: Electron.BrowserWindow) {
    if (editorSettingDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    editorSettingDialog = new BrowserWindow({
        width: 800,
        height: 600,
        parent: mainWindow,
        modal: false,
        resizable: false,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    const themeStyles = getCurrentThemeStyles()
    const htmlContent = generateEditorSettingHTML(themeStyles)

    editorSettingDialog.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
    )

    editorSettingDialog.on('closed', () => {
        editorSettingDialog = null
    })

    // 加载已保存的设置
    const savedSettings = EditorSettingUtils.getEditorSetting()
    editorSettingDialog.webContents.on('did-finish-load', () => {
        editorSettingDialog?.webContents.send('load-saved-editor-settings', savedSettings)
    })

    // 应用设置
    ipcMain.on('dialog-editor-setting-apply', (_event, settings) => {
        EditorSettingUtils.saveEditorSetting(settings)
        // 通知主窗口更新编辑器设置
        mainWindow.webContents.send('baize-notes:editor-setting-updated', settings)
    })

    // 取消设置
    ipcMain.on('dialog-editor-setting-cancel', () => {
        editorSettingDialog?.close()
    })

    // 重置默认设置
    ipcMain.on('dialog-editor-setting-reset', () => {
        EditorSettingUtils.resetEditorSetting()
        const defaultSettings = EditorSettingUtils.getDefaultEditorSetting()
        editorSettingDialog?.webContents.send('load-saved-editor-settings', defaultSettings)
    })

    // 确定按钮 - 保存并关闭
    ipcMain.on('dialog-editor-setting-ok', (_event, settings) => {
        EditorSettingUtils.saveEditorSetting(settings)
        // 通知主窗口更新编辑器设置
        mainWindow.webContents.send('baize-notes:editor-setting-updated', settings)
        editorSettingDialog?.close()
    })
}

function generateEditorSettingHTML(themeStyles: any): string {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
    const document = dom.window.document

    // 添加样式
    const style = document.createElement('style')
    style.textContent = `
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

        /* 标题栏 */
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

        .title-text {
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

        /* 主容器 */
        .main-content {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* 侧边栏 */
        .sidebar {
            width: 180px;
            background: var(--card-bg);
            border-right: 1px solid var(--border-color);
            flex-shrink: 0;
            overflow-y: auto;
            padding: 12px 0;
        }

        .sidebar-item {
            padding: 10px 16px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
            color: var(--text-color);
            display: flex;
            align-items: center;
            gap: 8px;
            border-left: 3px solid transparent;
        }

        .sidebar-item:hover {
            background: var(--hover-bg);
        }

        .sidebar-item.active {
            background: var(--hover-bg);
            border-left-color: var(--accent-color);
            color: var(--accent-color);
            font-weight: 600;
        }

        .sidebar-icon {
            font-size: 16px;
        }

        /* 内容区域 */
        .content-area {
            flex: 1;
            padding: 20px 24px;
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
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-color);
            color: var(--text-color);
        }

        /* 设置行 - 左右布局 */
        .setting-group {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            gap: 12px;
        }

        .setting-label {
            width: 160px;
            flex-shrink: 0;
            font-size: 13px;
            color: var(--text-color);
            text-align: right;
        }

        .setting-value {
            flex: 1;
        }

        .setting-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: 13px;
        }

        .setting-input:focus {
            outline: none;
            border-color: var(--accent-color);
        }

        .setting-select {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: 13px;
            cursor: pointer;
        }

        .setting-select:focus {
            outline: none;
            border-color: var(--accent-color);
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
        }

        .setting-checkbox label {
            font-size: 13px;
            cursor: pointer;
            color: var(--text-color);
        }

        .number-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: 13px;
        }

        .number-input:focus {
            outline: none;
            border-color: var(--accent-color);
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
            padding: 8px 24px;
            font-size: 13px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
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
    document.head.appendChild(style)
    // 创建标题栏
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'
    titleBar.innerHTML = `
        <span class="title-text">编辑器设置</span>
        <button class="close-btn" id="close-dialog-btn">×</button>
    `
    document.body.appendChild(titleBar)

    // 创建主内容区域
    const mainContent = document.createElement('div')
    mainContent.className = 'main-content'

    // 创建侧边栏
    const sidebar = document.createElement('div')
    sidebar.className = 'sidebar'
    sidebar.innerHTML = `
        <div class="sidebar-item active" data-section="basic"><span class="sidebar-icon">⚙</span> 基础配置</div>
        <div class="sidebar-item" data-section="display"><span class="sidebar-icon">🖥</span> 显示配置</div>
        <div class="sidebar-item" data-section="performance"><span class="sidebar-icon">⚡</span> 性能配置</div>
        <div class="sidebar-item" data-section="font"><span class="sidebar-icon">🔤</span> 字体配置</div>
        <div class="sidebar-item" data-section="cursor"><span class="sidebar-icon">👆</span> 光标配置</div>
        <div class="sidebar-item" data-section="suggestions"><span class="sidebar-icon">💡</span> 智能提示</div>
        <div class="sidebar-item" data-section="autoClosing"><span class="sidebar-icon">🔗</span> 自动闭合</div>
        <div class="sidebar-item" data-section="guides"><span class="sidebar-icon">📏</span> 指南配置</div>
        <div class="sidebar-item" data-section="scroll"><span class="sidebar-icon">📜</span> 滚动配置</div>
        <div class="sidebar-item" data-section="whitespace"><span class="sidebar-icon">📝</span> 空白折叠</div>
        <div class="sidebar-item" data-section="highlight"><span class="sidebar-icon">✨</span> 高亮装饰</div>
        <div class="sidebar-item" data-section="links"><span class="sidebar-icon">🔗</span> 链接装饰器</div>
    `
    mainContent.appendChild(sidebar)

    // 创建内容区域
    const contentArea = document.createElement('div')
    contentArea.className = 'content-area'

    // 基础配置
    const basicSection = createBasicSection(document)
    contentArea.appendChild(basicSection)

    // 显示配置
    const displaySection = createDisplaySection(document)
    contentArea.appendChild(displaySection)

    // 性能配置
    const performanceSection = createPerformanceSection(document)
    contentArea.appendChild(performanceSection)

    // 字体配置
    const fontSection = createFontSection(document)
    contentArea.appendChild(fontSection)

    // 光标配置
    const cursorSection = createCursorSection(document)
    contentArea.appendChild(cursorSection)

    // 智能提示配置
    const suggestionsSection = createSuggestionsSection(document)
    contentArea.appendChild(suggestionsSection)

    // 自动闭合配置
    const autoClosingSection = createAutoClosingSection(document)
    contentArea.appendChild(autoClosingSection)

    // 指南配置
    const guidesSection = createGuidesSection(document)
    contentArea.appendChild(guidesSection)

    // 滚动配置
    const scrollSection = createScrollSection(document)
    contentArea.appendChild(scrollSection)

    // 空白和折叠配置
    const whitespaceSection = createWhitespaceSection(document)
    contentArea.appendChild(whitespaceSection)

    // 高亮和装饰配置
    const highlightSection = createHighlightSection(document)
    contentArea.appendChild(highlightSection)

    // 链接和装饰器
    const linksSection = createLinksSection(document)
    contentArea.appendChild(linksSection)

    mainContent.appendChild(contentArea)
    document.body.appendChild(mainContent)

    // 创建按钮组
    const buttonGroup = document.createElement('div')
    buttonGroup.className = 'button-group'
    buttonGroup.innerHTML = `
        <button class="btn btn-secondary" id="editor-setting-reset">重置默认</button>
        <button class="btn btn-secondary" id="editor-setting-cancel">取消</button>
        <button class="btn btn-secondary" id="editor-setting-apply">应用</button>
        <button class="btn btn-primary" id="editor-setting-ok">确定</button>
    `
    document.body.appendChild(buttonGroup)

    // 添加脚本
    const script = document.createElement('script')
    script.textContent = `
        const { ipcRenderer } = require('electron');

        // 监听主题更新
        ipcRenderer.on('baize-notes:theme-updated', (event, themeData) => {
            if (themeData && themeData.themeStyles) {
                const root = document.documentElement;
                const styles = themeData.themeStyles;

                // 更新CSS变量
                root.style.setProperty('--bg-color', styles.backgroundColor);
                root.style.setProperty('--card-bg', styles.cardBackground);
                root.style.setProperty('--text-color', styles.textColor);
                root.style.setProperty('--secondary-text-color', styles.secondaryTextColor);
                root.style.setProperty('--border-color', styles.borderColor);
                root.style.setProperty('--accent-color', styles.accentColor);
                root.style.setProperty('--hover-bg', styles.hoverBackground);
                root.style.setProperty('--title-bar-gradient', styles.titleBarGradient);
            }
        });

        // 侧边栏切换
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                document.querySelectorAll('.setting-section').forEach(s => s.classList.remove('active'));
                item.classList.add('active');
                const sectionId = item.getAttribute('data-section');
                const sectionElement = document.getElementById('section-' + sectionId);
                if (sectionElement) {
                    sectionElement.classList.add('active');
                } else {
                    console.warn('找不到section元素:', 'section-' + sectionId);
                }
            });
        });

        // 编辑器设置对象
        let EditorSetting = {
            wordWrap: 'on',
            minimap: false,
            lineNumbers: 'on',
            fontSize: 14,
            fontFamily: 'Hack',
            tabSize: 4,
            renderWhitespace: 'all',
            folding: true,
            renderLineHighlight: 'all',
            largeFileOptimizations: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            dragAndDrop: false,
            scrollBeyondLastLine: false,
            mouseWheelScrollSensitivity: 1,
            // 字体配置
            fontLigatures: false,
            letterSpacing: 0,
            lineHeight: 0,
            // 光标配置
            cursorStyle: 'line',
            cursorWidth: 1,
            // 智能提示配置
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            tabCompletion: 'off',
            snippetSuggestions: 'inline',
            // 自动闭合配置
            autoClosingBrackets: 'languageDefined',
            autoClosingQuotes: 'languageDefined',
            autoClosingOvertype: 'auto',
            autoSurround: 'languageDefined',
            // 指南配置
            renderIndentGuides: true,
            highlightActiveIndentGuide: true,
            rulers: '',
            guides: true,
            // 滚动配置
            fastScrollSensitivity: 5,
            // 空白和折叠配置
            showFoldingControls: 'mouseover',
            unfoldOnClick: true,
            // 高亮和装饰配置
            renderValidationDecorations: 'editable',
            occurrencesHighlight: true,
            selectionHighlight: true,
            // 链接和装饰器
            links: true,
            colorDecorators: true,
            decorators: true
        };

        // 加载已保存的设置
        ipcRenderer.on('load-saved-editor-settings', (event, savedSettings) => {
            EditorSetting = { ...EditorSetting, ...savedSettings };

            // 辅助函数：安全设置元素值
            const setElementValue = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = value;
                else console.warn('找不到元素:', id);
            };

            // 辅助函数：安全设置元素checked状态
            const setElementChecked = (id, checked) => {
                const el = document.getElementById(id);
                if (el) el.checked = checked;
                else console.warn('找不到元素:', id);
            };

            // 基础配置
            setElementValue('word-wrap', EditorSetting.wordWrap);
            setElementChecked('minimap', EditorSetting.minimap);
            setElementValue('line-numbers', EditorSetting.lineNumbers);
            setElementValue('tab-size', EditorSetting.tabSize);

            // 显示配置
            setElementValue('render-whitespace', EditorSetting.renderWhitespace);
            setElementChecked('folding', EditorSetting.folding);
            setElementValue('render-line-highlight', EditorSetting.renderLineHighlight);

            // 性能配置
            setElementChecked('large-file-optimizations', EditorSetting.largeFileOptimizations);
            setElementChecked('smooth-scrolling', EditorSetting.smoothScrolling);
            setElementValue('cursor-blinking', EditorSetting.cursorBlinking);
            setElementValue('cursor-smooth-caret-animation', EditorSetting.cursorSmoothCaretAnimation);

            // 其他配置
            setElementChecked('drag-and-drop', EditorSetting.dragAndDrop);
            setElementChecked('scroll-beyond-last-line', EditorSetting.scrollBeyondLastLine);
            setElementValue('mouse-wheel-scroll-sensitivity', EditorSetting.mouseWheelScrollSensitivity);

            // 字体配置
            setElementValue('font-family', EditorSetting.fontFamily);
            setElementValue('font-size', EditorSetting.fontSize);
            setElementChecked('font-ligatures', EditorSetting.fontLigatures);
            setElementValue('letter-spacing', EditorSetting.letterSpacing);
            setElementValue('line-height', EditorSetting.lineHeight);

            // 光标配置
            setElementValue('cursor-style', EditorSetting.cursorStyle);
            setElementValue('cursor-width', EditorSetting.cursorWidth);
            setElementValue('cursor-blinking-cursor', EditorSetting.cursorBlinking);
            setElementValue('cursor-smooth-caret-animation-cursor', EditorSetting.cursorSmoothCaretAnimation);

            // 智能提示配置
            setElementChecked('quick-suggestions', EditorSetting.quickSuggestions);
            setElementChecked('suggest-on-trigger-characters', EditorSetting.suggestOnTriggerCharacters);
            setElementValue('accept-suggestion-on-enter', EditorSetting.acceptSuggestionOnEnter);
            setElementValue('tab-completion', EditorSetting.tabCompletion);
            setElementValue('snippet-suggestions', EditorSetting.snippetSuggestions);

            // 自动闭合配置
            setElementValue('auto-closing-brackets', EditorSetting.autoClosingBrackets);
            setElementValue('auto-closing-quotes', EditorSetting.autoClosingQuotes);
            setElementValue('auto-closing-overtype', EditorSetting.autoClosingOvertype);
            setElementValue('auto-surround', EditorSetting.autoSurround);

            // 指南配置
            setElementChecked('render-indent-guides', EditorSetting.renderIndentGuides);
            setElementChecked('highlight-active-indent-guide', EditorSetting.highlightActiveIndentGuide);
            setElementValue('rulers', EditorSetting.rulers);
            setElementChecked('guides', EditorSetting.guides);

            // 滚动配置
            setElementChecked('smooth-scrolling-scroll', EditorSetting.smoothScrolling);
            setElementChecked('scroll-beyond-last-line-scroll', EditorSetting.scrollBeyondLastLine);
            setElementValue('mouse-wheel-scroll-sensitivity-scroll', EditorSetting.mouseWheelScrollSensitivity);
            setElementValue('fast-scroll-sensitivity', EditorSetting.fastScrollSensitivity);

            // 空白和折叠配置
            setElementValue('render-whitespace-whitespace', EditorSetting.renderWhitespace);
            setElementChecked('folding-whitespace', EditorSetting.folding);
            setElementValue('show-folding-controls', EditorSetting.showFoldingControls);
            setElementChecked('unfold-on-click', EditorSetting.unfoldOnClick);

            // 高亮和装饰配置
            setElementValue('render-line-highlight-highlight', EditorSetting.renderLineHighlight);
            setElementValue('render-validation-decorations', EditorSetting.renderValidationDecorations);
            setElementChecked('occurrences-highlight', EditorSetting.occurrencesHighlight);
            setElementChecked('selection-highlight', EditorSetting.selectionHighlight);

            // 链接和装饰器
            setElementChecked('links', EditorSetting.links);
            setElementChecked('color-decorators', EditorSetting.colorDecorators);
            setElementChecked('decorators', EditorSetting.decorators);
        });

        // 辅助函数：安全添加事件监听器
        const addSafeEventListener = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener(event, handler);
            } else {
                console.warn('找不到元素:', id);
            }
        };

        // 基础配置事件监听
        addSafeEventListener('word-wrap', 'change', (e) => {
            EditorSetting.wordWrap = e.target.value;
        });
        addSafeEventListener('minimap', 'change', (e) => {
            EditorSetting.minimap = e.target.checked;
        });
        addSafeEventListener('line-numbers', 'change', (e) => {
            EditorSetting.lineNumbers = e.target.value;
        });
        addSafeEventListener('font-size', 'input', (e) => {
            EditorSetting.fontSize = parseInt(e.target.value);
        });
        addSafeEventListener('font-family', 'input', (e) => {
            EditorSetting.fontFamily = e.target.value;
        });
        addSafeEventListener('tab-size', 'input', (e) => {
            EditorSetting.tabSize = parseInt(e.target.value);
        });

        // 显示配置事件监听
        addSafeEventListener('render-whitespace', 'change', (e) => {
            EditorSetting.renderWhitespace = e.target.value;
        });
        addSafeEventListener('folding', 'change', (e) => {
            EditorSetting.folding = e.target.checked;
        });
        addSafeEventListener('render-line-highlight', 'change', (e) => {
            EditorSetting.renderLineHighlight = e.target.value;
        });

        // 性能配置事件监听
        addSafeEventListener('large-file-optimizations', 'change', (e) => {
            EditorSetting.largeFileOptimizations = e.target.checked;
        });
        addSafeEventListener('smooth-scrolling', 'change', (e) => {
            EditorSetting.smoothScrolling = e.target.checked;
        });
        addSafeEventListener('cursor-blinking', 'change', (e) => {
            EditorSetting.cursorBlinking = e.target.value;
        });
        addSafeEventListener('cursor-smooth-caret-animation', 'change', (e) => {
            EditorSetting.cursorSmoothCaretAnimation = e.target.value;
        });

        // 其他配置事件监听
        addSafeEventListener('drag-and-drop', 'change', (e) => {
            EditorSetting.dragAndDrop = e.target.checked;
        });
        addSafeEventListener('scroll-beyond-last-line', 'change', (e) => {
            EditorSetting.scrollBeyondLastLine = e.target.checked;
        });
        addSafeEventListener('mouse-wheel-scroll-sensitivity', 'input', (e) => {
            EditorSetting.mouseWheelScrollSensitivity = parseFloat(e.target.value);
        });

        // 字体配置事件监听
        addSafeEventListener('font-family', 'change', (e) => {
            EditorSetting.fontFamily = e.target.value;
        });
        addSafeEventListener('font-size', 'input', (e) => {
            EditorSetting.fontSize = parseInt(e.target.value);
        });
        addSafeEventListener('font-ligatures', 'change', (e) => {
            EditorSetting.fontLigatures = e.target.checked;
        });
        addSafeEventListener('letter-spacing', 'input', (e) => {
            EditorSetting.letterSpacing = parseInt(e.target.value);
        });
        addSafeEventListener('line-height', 'input', (e) => {
            EditorSetting.lineHeight = parseFloat(e.target.value);
        });

        // 光标配置事件监听
        addSafeEventListener('cursor-style', 'change', (e) => {
            EditorSetting.cursorStyle = e.target.value;
        });
        addSafeEventListener('cursor-width', 'input', (e) => {
            EditorSetting.cursorWidth = parseInt(e.target.value);
        });
        addSafeEventListener('cursor-blinking-cursor', 'change', (e) => {
            EditorSetting.cursorBlinking = e.target.value;
        });
        addSafeEventListener('cursor-smooth-caret-animation-cursor', 'change', (e) => {
            EditorSetting.cursorSmoothCaretAnimation = e.target.value;
        });

        // 智能提示配置事件监听
        addSafeEventListener('quick-suggestions', 'change', (e) => {
            EditorSetting.quickSuggestions = e.target.checked;
        });
        addSafeEventListener('suggest-on-trigger-characters', 'change', (e) => {
            EditorSetting.suggestOnTriggerCharacters = e.target.checked;
        });
        addSafeEventListener('accept-suggestion-on-enter', 'change', (e) => {
            EditorSetting.acceptSuggestionOnEnter = e.target.value;
        });
        addSafeEventListener('tab-completion', 'change', (e) => {
            EditorSetting.tabCompletion = e.target.value;
        });
        addSafeEventListener('snippet-suggestions', 'change', (e) => {
            EditorSetting.snippetSuggestions = e.target.value;
        });

        // 自动闭合配置事件监听
        addSafeEventListener('auto-closing-brackets', 'change', (e) => {
            EditorSetting.autoClosingBrackets = e.target.value;
        });
        addSafeEventListener('auto-closing-quotes', 'change', (e) => {
            EditorSetting.autoClosingQuotes = e.target.value;
        });
        addSafeEventListener('auto-closing-overtype', 'change', (e) => {
            EditorSetting.autoClosingOvertype = e.target.value;
        });
        addSafeEventListener('auto-surround', 'change', (e) => {
            EditorSetting.autoSurround = e.target.value;
        });

        // 指南配置事件监听
        addSafeEventListener('render-indent-guides', 'change', (e) => {
            EditorSetting.renderIndentGuides = e.target.checked;
        });
        addSafeEventListener('highlight-active-indent-guide', 'change', (e) => {
            EditorSetting.highlightActiveIndentGuide = e.target.checked;
        });
        addSafeEventListener('rulers', 'input', (e) => {
            EditorSetting.rulers = e.target.value;
        });
        addSafeEventListener('guides', 'change', (e) => {
            EditorSetting.guides = e.target.checked;
        });

        // 滚动配置事件监听
        addSafeEventListener('smooth-scrolling-scroll', 'change', (e) => {
            EditorSetting.smoothScrolling = e.target.checked;
        });
        addSafeEventListener('scroll-beyond-last-line-scroll', 'change', (e) => {
            EditorSetting.scrollBeyondLastLine = e.target.checked;
        });
        addSafeEventListener('mouse-wheel-scroll-sensitivity-scroll', 'input', (e) => {
            EditorSetting.mouseWheelScrollSensitivity = parseFloat(e.target.value);
        });
        addSafeEventListener('fast-scroll-sensitivity', 'input', (e) => {
            EditorSetting.fastScrollSensitivity = parseFloat(e.target.value);
        });

        // 空白和折叠配置事件监听
        addSafeEventListener('render-whitespace-whitespace', 'change', (e) => {
            EditorSetting.renderWhitespace = e.target.value;
        });
        addSafeEventListener('folding-whitespace', 'change', (e) => {
            EditorSetting.folding = e.target.checked;
        });
        addSafeEventListener('show-folding-controls', 'change', (e) => {
            EditorSetting.showFoldingControls = e.target.value;
        });
        addSafeEventListener('unfold-on-click', 'change', (e) => {
            EditorSetting.unfoldOnClick = e.target.checked;
        });

        // 高亮和装饰配置事件监听
        addSafeEventListener('render-line-highlight-highlight', 'change', (e) => {
            EditorSetting.renderLineHighlight = e.target.value;
        });
        addSafeEventListener('render-validation-decorations', 'change', (e) => {
            EditorSetting.renderValidationDecorations = e.target.value;
        });
        addSafeEventListener('occurrences-highlight', 'change', (e) => {
            EditorSetting.occurrencesHighlight = e.target.checked;
        });
        addSafeEventListener('selection-highlight', 'change', (e) => {
            EditorSetting.selectionHighlight = e.target.checked;
        });

        // 链接和装饰器事件监听
        addSafeEventListener('links', 'change', (e) => {
            EditorSetting.links = e.target.checked;
        });
        addSafeEventListener('color-decorators', 'change', (e) => {
            EditorSetting.colorDecorators = e.target.checked;
        });
        addSafeEventListener('decorators', 'change', (e) => {
            EditorSetting.decorators = e.target.checked;
        });
        // 按钮事件绑定（带错误处理）
        function bindButtonEvents() {
            try {
                console.log('开始绑定按钮事件...');

                // 应用按钮
                const applyBtn = document.getElementById('editor-setting-apply');
                if (applyBtn) {
                    applyBtn.addEventListener('click', function() {
                        console.log('应用按钮被点击');
                        ipcRenderer.send('dialog-editor-setting-apply', EditorSetting);
                    });
                    console.log('应用按钮事件绑定成功');
                } else {
                    console.error('找不到应用按钮: editor-setting-apply');
                }

                // 取消按钮
                const cancelBtn = document.getElementById('editor-setting-cancel');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', function() {
                        console.log('取消按钮被点击');
                        ipcRenderer.send('dialog-editor-setting-cancel');
                    });
                    console.log('取消按钮事件绑定成功');
                } else {
                    console.error('找不到取消按钮: editor-setting-cancel');
                }

                // 重置按钮
                const resetBtn = document.getElementById('editor-setting-reset');
                if (resetBtn) {
                    resetBtn.addEventListener('click', function() {
                        console.log('重置按钮被点击');
                        ipcRenderer.send('dialog-editor-setting-reset');
                    });
                    console.log('重置按钮事件绑定成功');
                } else {
                    console.error('找不到重置按钮: editor-setting-reset');
                }

                // 确定按钮
                const okBtn = document.getElementById('editor-setting-ok');
                if (okBtn) {
                    okBtn.addEventListener('click', function() {
                        console.log('确定按钮被点击');
                        ipcRenderer.send('dialog-editor-setting-ok', EditorSetting);
                    });
                    console.log('确定按钮事件绑定成功');
                } else {
                    console.error('找不到确定按钮: editor-setting-ok');
                }

                // 关闭按钮
                const closeBtn = document.getElementById('close-dialog-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', function() {
                        console.log('关闭按钮被点击');
                        ipcRenderer.send('dialog-editor-setting-cancel');
                    });
                    console.log('关闭按钮事件绑定成功');
                } else {
                    console.error('找不到关闭按钮: close-dialog-btn');
                }

                console.log('所有按钮事件绑定完成');
            } catch (error) {
                console.error('按钮事件绑定出错:', error);
            }
        }

        // 确保DOM完全加载后再绑定事件
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindButtonEvents);
        } else {
            // DOM已经加载完成
            bindButtonEvents();
        }
    `
    document.body.appendChild(script)

    return document.documentElement.outerHTML
}

// 创建基础配置区域
function createBasicSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-basic'
    section.className = 'setting-section active'

    section.innerHTML = `
        <h3 class="section-title">基础配置</h3>

        <div class="setting-group">
            <span class="setting-label">自动换行：</span>
            <div class="setting-value">
                <select class="setting-select" id="word-wrap">
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                    <option value="bounded">受限</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">显示缩略图：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="minimap">
                    <label for="minimap">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">行号显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="line-numbers">
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                    <option value="relative">相对行号</option>
                    <option value="interval">间隔行号</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">Tab大小 (1-8)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="tab-size" min="1" max="8" value="4">
            </div>
        </div>
    `

    return section
}

// 创建显示配置区域
function createDisplaySection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-display'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">显示配置</h3>

        <div class="setting-group">
            <span class="setting-label">空白字符显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-whitespace">
                    <option value="none">不显示</option>
                    <option value="boundary">边界</option>
                    <option value="selection">选中时</option>
                    <option value="all">全部</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">代码折叠：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="folding">
                    <label for="folding">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">当前行高亮：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-line-highlight">
                    <option value="none">不显示</option>
                    <option value="line">行高亮</option>
                    <option value="all">全部高亮</option>
                    <option value="range">范围高亮</option>
                </select>
            </div>
        </div>
    `

    return section
}

// 创建性能配置区域
function createPerformanceSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-performance'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">性能配置</h3>

        <div class="setting-group">
            <span class="setting-label">大文件优化：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="large-file-optimizations">
                    <label for="large-file-optimizations">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">平滑滚动：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="smooth-scrolling">
                    <label for="smooth-scrolling">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标闪烁样式：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-blinking">
                    <option value="blink">闪烁</option>
                    <option value="smooth">平滑</option>
                    <option value="phase">相位</option>
                    <option value="expand">扩展</option>
                    <option value="solid">固定</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标平滑动画：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-smooth-caret-animation">
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                    <option value="explicit">显式</option>
                </select>
            </div>
        </div>
    `

    return section
}

// 创建字体配置区域
function createFontSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-font'
    section.className = 'setting-section'

    // 生成字体选项
    const fontOptions = FontFamily.map(font =>
        `<option value="${font.value}">${font.value}</option>`
    ).join('')

    section.innerHTML = `
        <h3 class="section-title">字体配置</h3>

        <div class="setting-group">
            <span class="setting-label">字体族：</span>
            <div class="setting-value">
                <select class="setting-select" id="font-family">
                    ${fontOptions}
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字体大小 (8-32)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="font-size" min="8" max="32" value="14">
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字体连字：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="font-ligatures">
                    <label for="font-ligatures">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字符间距 (-5~20)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="letter-spacing" min="-5" max="20" value="0">
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">行高 (0~100, 0自动)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="line-height" min="0" max="100" value="0">
            </div>
        </div>
    `

    return section
}


// 创建光标配置区域
function createCursorSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-cursor'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">光标配置</h3>

        <div class="setting-group">
            <span class="setting-label">光标样式：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-style">
                    <option value="line">线条</option>
                    <option value="block">块状</option>
                    <option value="underline">下划线</option>
                    <option value="line-thin">细线条</option>
                    <option value="block-thin">细块状</option>
                    <option value="underline-thin">细下划线</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标宽度 (1-10)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="cursor-width" min="1" max="10" value="1">
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标闪烁样式：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-blinking-cursor">
                    <option value="blink">闪烁</option>
                    <option value="smooth">平滑</option>
                    <option value="phase">相位</option>
                    <option value="expand">扩展</option>
                    <option value="solid">固定</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标平滑动画：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-smooth-caret-animation-cursor">
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                    <option value="explicit">显式</option>
                </select>
            </div>
        </div>
    `

    return section
}

// 创建智能提示配置区域
function createSuggestionsSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-suggestions'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">智能提示配置</h3>

        <div class="setting-group">
            <span class="setting-label">快速建议：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="quick-suggestions" checked>
                    <label for="quick-suggestions">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">触发字符建议：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="suggest-on-trigger-characters" checked>
                    <label for="suggest-on-trigger-characters">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">Enter键接受建议：</span>
            <div class="setting-value">
                <select class="setting-select" id="accept-suggestion-on-enter">
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                    <option value="smart">智能</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">Tab补全：</span>
            <div class="setting-value">
                <select class="setting-select" id="tab-completion">
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                    <option value="onlySnippets">仅代码片段</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">代码片段建议位置：</span>
            <div class="setting-value">
                <select class="setting-select" id="snippet-suggestions">
                    <option value="top">顶部</option>
                    <option value="bottom">底部</option>
                    <option value="inline">内联</option>
                    <option value="none">不显示</option>
                </select>
            </div>
        </div>
    `

    return section
}

// 创建自动闭合配置区域
function createAutoClosingSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-autoClosing'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">自动闭合配置</h3>

        <div class="setting-group">
            <span class="setting-label">自动闭合括号：</span>
            <div class="setting-value">
                <select class="setting-select" id="auto-closing-brackets">
                    <option value="always">总是</option>
                    <option value="languageDefined">语言定义</option>
                    <option value="beforeWhitespace">空白前</option>
                    <option value="never">从不</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">自动闭合引号：</span>
            <div class="setting-value">
                <select class="setting-select" id="auto-closing-quotes">
                    <option value="always">总是</option>
                    <option value="languageDefined">语言定义</option>
                    <option value="beforeWhitespace">空白前</option>
                    <option value="never">从不</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">自动覆盖闭合：</span>
            <div class="setting-value">
                <select class="setting-select" id="auto-closing-overtype">
                    <option value="always">总是</option>
                    <option value="auto">自动</option>
                    <option value="never">从不</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">自动包围：</span>
            <div class="setting-value">
                <select class="setting-select" id="auto-surround">
                    <option value="languageDefined">语言定义</option>
                    <option value="quotes">引号</option>
                    <option value="brackets">括号</option>
                    <option value="never">从不</option>
                </select>
            </div>
        </div>
    `

    return section
}

// 创建指南配置区域
function createGuidesSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-guides'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">指南配置</h3>

        <div class="setting-group">
            <span class="setting-label">缩进指南：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="render-indent-guides" checked>
                    <label for="render-indent-guides">显示</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">高亮活动缩进：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="highlight-active-indent-guide" checked>
                    <label for="highlight-active-indent-guide">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">标尺列 (逗号分隔)：</span>
            <div class="setting-value">
                <input type="text" class="setting-input" id="rulers" placeholder="例如: 80,120">
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">启用指南：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="guides" checked>
                    <label for="guides">启用</label>
                </div>
            </div>
        </div>
    `
    return section
}

// 创建滚动配置区域
function createScrollSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-scroll'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">滚动配置</h3>

        <div class="setting-group">
            <span class="setting-label">平滑滚动：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="smooth-scrolling-scroll" checked>
                    <label for="smooth-scrolling-scroll">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">超过最后一行：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="scroll-beyond-last-line-scroll">
                    <label for="scroll-beyond-last-line-scroll">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">滚轮灵敏度 (0.1~10)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="mouse-wheel-scroll-sensitivity-scroll"
                       min="0.1" max="10" step="0.1" value="1">
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">快速滚动灵敏度 (1~20)：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="fast-scroll-sensitivity"
                       min="1" max="20" step="0.5" value="5">
            </div>
        </div>
    `

    return section
}

// 创建空白和折叠配置区域
function createWhitespaceSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-whitespace'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">空白和折叠配置</h3>

        <div class="setting-group">
            <span class="setting-label">空白字符显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-whitespace-whitespace">
                    <option value="none">不显示</option>
                    <option value="boundary">边界</option>
                    <option value="selection">选中时</option>
                    <option value="all">全部</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">代码折叠：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="folding-whitespace" checked>
                    <label for="folding-whitespace">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">折叠控件显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="show-folding-controls">
                    <option value="always">总是</option>
                    <option value="mouseover">鼠标悬停</option>
                    <option value="never">从不</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">点击展开：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="unfold-on-click" checked>
                    <label for="unfold-on-click">启用</label>
                </div>
            </div>
        </div>
    `

    return section
}

// 创建高亮和装饰配置区域
function createHighlightSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-highlight'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">高亮和装饰配置</h3>

        <div class="setting-group">
            <span class="setting-label">当前行高亮：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-line-highlight-highlight">
                    <option value="none">不显示</option>
                    <option value="line">行高亮</option>
                    <option value="all">全部高亮</option>
                    <option value="range">范围高亮</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">验证装饰显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-validation-decorations">
                    <option value="on">开启</option>
                    <option value="off">关闭</option>
                    <option value="editable">可编辑</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">出现位置高亮：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="occurrences-highlight" checked>
                    <label for="occurrences-highlight">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">选择高亮：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="selection-highlight" checked>
                    <label for="selection-highlight">启用</label>
                </div>
            </div>
        </div>
    `

    return section
}

// 创建链接和装饰器配置区域
function createLinksSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-links'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">链接和装饰器</h3>

        <div class="setting-group">
            <span class="setting-label">链接点击：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="links" checked>
                    <label for="links">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">颜色装饰器：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="color-decorators" checked>
                    <label for="color-decorators">启用</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">装饰器：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="decorators" checked>
                    <label for="decorators">启用</label>
                </div>
            </div>
        </div>
    `

    return section
}
