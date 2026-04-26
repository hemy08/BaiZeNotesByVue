import { getCurrentThemeStyles } from '../themes/theme-config'
import { JSDOM } from 'jsdom'
import * as digcom from './dialog_common'
import * as EditorSettingUtils from '../settings/editor-setting'
import * as SystemSettingUtils from '../themes/system-setting'
import { FontFamily } from '../utils/common'
import { windowManager } from '../settings/window-manager'
import { ipcListenerManager } from '../settings/ipc-listener-manager'

// 创建编辑器设置对话框
export function ShowEditorSettingDialog(mainWindow: Electron.BrowserWindow) {
    const existingWindow = windowManager.getWindowByType('editor-setting-dialog')
    if (existingWindow) {
        digcom.ShowAlreadyExistDialog()
        return
    }

    const editorSettingDialog = windowManager.createWindow(
        'editor-setting-dialog',
        {
            width: 800,
            height: 1000,
            minWidth: 700,
            minHeight: 800,
            parent: mainWindow,
            modal: false,
            resizable: true,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        },
        'editor-setting-dialog',
        true
    )

    const themeStyles = getCurrentThemeStyles()
    const systemSettings = SystemSettingUtils.getSystemSetting()
    const htmlContent = generateEditorSettingHTML(themeStyles, systemSettings)

    editorSettingDialog.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
    )

    // 加载已保存的设置
    const savedSettings = EditorSettingUtils.getEditorSetting()
    editorSettingDialog.webContents.on('did-finish-load', () => {
        editorSettingDialog?.webContents.send('load-saved-editor-settings', savedSettings)
    })

    const componentId = 'editor-setting-dialog'

    // 应用设置
    ipcListenerManager.register('dialog-editor-setting-apply', (_event, settings) => {
        EditorSettingUtils.saveEditorSetting(settings)
        // 通知主窗口更新编辑器设置（检查窗口是否已销毁）
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('baize-notes:editor-setting-updated', settings)
        }
    }, componentId)

    // 取消设置
    ipcListenerManager.register('dialog-editor-setting-cancel', () => {
        editorSettingDialog?.close()
    }, componentId)

    // 重置默认设置
    ipcListenerManager.register('dialog-editor-setting-reset', () => {
        EditorSettingUtils.resetEditorSetting()
        const defaultSettings = EditorSettingUtils.getDefaultEditorSetting()
        editorSettingDialog?.webContents.send('load-saved-editor-settings', defaultSettings)
    }, componentId)

    // 确定按钮 - 保存并关闭
    ipcListenerManager.register('dialog-editor-setting-ok', (_event, settings) => {
        EditorSettingUtils.saveEditorSetting(settings)
        // 通知主窗口更新编辑器设置（检查窗口是否已销毁）
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('baize-notes:editor-setting-updated', settings)
        }
        editorSettingDialog?.close()
    }, componentId)
}

function generateEditorSettingHTML(themeStyles: any, systemSettings: any): string {
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
            --system-font-family: ${systemSettings.fontFamily};
            --system-font-size: ${systemSettings.fontSize}px;
            --font-size-xs: calc(var(--system-font-size) - 2px);
            --font-size-sm: calc(var(--system-font-size) - 1px);
            --font-size-base: var(--system-font-size);
            --font-size-lg: calc(var(--system-font-size) + 1px);
            --font-size-xl: calc(var(--system-font-size) + 2px);
            --font-size-2xl: calc(var(--system-font-size) + 4px);
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
            margin-bottom: 16px;
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
        <div class="sidebar-item active" data-section="basic">基础配置</div>
        <div class="sidebar-item" data-section="display">显示与布局</div>
        <div class="sidebar-item" data-section="cursor">光标与选择</div>
        <div class="sidebar-item" data-section="scroll">滚动配置</div>
        <div class="sidebar-item" data-section="folding">换行、缩进与渲染</div>
        <div class="sidebar-item" data-section="autoClosing">自动闭合与修饰</div>
        <div class="sidebar-item" data-section="suggestions">智能提示与补全</div>
        <div class="sidebar-item" data-section="hover">Hover与编码行为</div>
        <div class="sidebar-item" data-section="find">查找与替换</div>
        <div class="sidebar-item" data-section="unicode">差异编辑器配置</div>
        <div class="sidebar-item" data-section="subobjects">子对象详细配置</div>
    `
    mainContent.appendChild(sidebar)

    // 创建内容区域
    const contentArea = document.createElement('div')
    contentArea.className = 'content-area'

    // 1. 基础配置
    const basicSection = createBasicSection(document)
    contentArea.appendChild(basicSection)

    // 2. 显示与布局
    const displaySection = createDisplaySection(document)
    contentArea.appendChild(displaySection)

    // 3. 光标与选择
    const cursorSection = createCursorSection(document)
    contentArea.appendChild(cursorSection)

    // 4. 滚动配置
    const scrollSection = createScrollSection(document)
    contentArea.appendChild(scrollSection)

    // 5. 换行、缩进与渲染（合并了原来的换行与缩进和渲染选项）
    const foldingSection = createFoldingSection(document)
    contentArea.appendChild(foldingSection)

    // 6. 自动闭合与修饰
    const autoClosingSection = createAutoClosingSection(document)
    contentArea.appendChild(autoClosingSection)

    // 8. 智能提示与补全
    const suggestionsSection = createSuggestionsSection(document)
    contentArea.appendChild(suggestionsSection)

    // 9. Hover与编码行为
    const hoverSection = createHoverSection(document)
    contentArea.appendChild(hoverSection)

    // 10. 查找与替换
    const findSection = createFindSection(document)
    contentArea.appendChild(findSection)

    // 11. 差异编辑器配置
    const unicodeSection = createUnicodeSection(document)
    contentArea.appendChild(unicodeSection)

    // 子对象详细配置
    const subobjectsSection = createSubobjectsSection(document)
    contentArea.appendChild(subobjectsSection)

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
            setElementChecked('insert-spaces', EditorSetting.insertSpaces);
            setElementChecked('detect-indentation', EditorSetting.detectIndentation || true);
            setElementChecked('read-only', EditorSetting.readOnly);
            setElementChecked('dom-read-only', EditorSetting.domReadOnly || false);
            setElementChecked('editable', EditorSetting.editable);
            setElementChecked('automatic-layout', EditorSetting.automaticLayout || false);
            setElementChecked('drag-and-drop', EditorSetting.dragAndDrop);
            setElementValue('accessibility-support', EditorSetting.accessibilitySupport);

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
            setElementChecked('show-adjust-setting-tip', EditorSetting.showAdjustSettingTip);

            // Unicode高亮配置
            if (EditorSetting.unicodeHighlight) {
                setElementChecked('unicode-non-basic-ascii', EditorSetting.unicodeHighlight.nonBasicASCII);
                setElementChecked('unicode-invisible-characters', EditorSetting.unicodeHighlight.invisibleCharacters);
                setElementChecked('unicode-ambiguous-characters', EditorSetting.unicodeHighlight.ambiguousCharacters);
            }
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
        addSafeEventListener('insert-spaces', 'change', (e) => {
            EditorSetting.insertSpaces = e.target.checked;
        });
        addSafeEventListener('detect-indentation', 'change', (e) => {
            EditorSetting.detectIndentation = e.target.checked;
        });
        addSafeEventListener('read-only', 'change', (e) => {
            EditorSetting.readOnly = e.target.checked;
        });
        addSafeEventListener('dom-read-only', 'change', (e) => {
            EditorSetting.domReadOnly = e.target.checked;
        });
        addSafeEventListener('editable', 'change', (e) => {
            EditorSetting.editable = e.target.checked;
        });
        addSafeEventListener('automatic-layout', 'change', (e) => {
            EditorSetting.automaticLayout = e.target.checked;
        });
        addSafeEventListener('drag-and-drop', 'change', (e) => {
            EditorSetting.dragAndDrop = e.target.checked;
        });
        addSafeEventListener('accessibility-support', 'change', (e) => {
            EditorSetting.accessibilitySupport = e.target.value;
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
        addSafeEventListener('show-adjust-setting-tip', 'change', (e) => {
            EditorSetting.showAdjustSettingTip = e.target.checked;
        });

        // Unicode高亮配置事件监听
        addSafeEventListener('unicode-non-basic-ascii', 'change', (e) => {
            if (!EditorSetting.unicodeHighlight) {
                EditorSetting.unicodeHighlight = { nonBasicASCII: false, invisibleCharacters: true, ambiguousCharacters: false };
            }
            EditorSetting.unicodeHighlight.nonBasicASCII = e.target.checked;
        });
        addSafeEventListener('unicode-invisible-characters', 'change', (e) => {
            if (!EditorSetting.unicodeHighlight) {
                EditorSetting.unicodeHighlight = { nonBasicASCII: false, invisibleCharacters: true, ambiguousCharacters: false };
            }
            EditorSetting.unicodeHighlight.invisibleCharacters = e.target.checked;
        });
        addSafeEventListener('unicode-ambiguous-characters', 'change', (e) => {
            if (!EditorSetting.unicodeHighlight) {
                EditorSetting.unicodeHighlight = { nonBasicASCII: false, invisibleCharacters: true, ambiguousCharacters: false };
            }
            EditorSetting.unicodeHighlight.ambiguousCharacters = e.target.checked;
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

/**
 * 创建基础配置区域
 * 包含Tab、只读、自动布局等基础编辑器配置
 */
function createBasicSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-basic'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">基础配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            编辑器的基础行为配置,包括Tab大小、只读模式、自动布局等核心设置
        </p>

        <div class="setting-group">
            <span class="setting-label">Tab大小：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="tab-size" value="4" min="1" max="16">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">空格数</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">插入空格：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="insert-spaces" checked>
                    <label for="insert-spaces">按Tab键时插入空格而非制表符</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">检测缩进：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="detect-indentation" checked>
                    <label for="detect-indentation">自动检测文件缩进风格</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">只读模式：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="read-only">
                    <label for="read-only">禁止编辑内容</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">DOM只读：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="dom-read-only">
                    <label for="dom-read-only">DOM层面禁止输入(更严格的只读)</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">可编辑：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="editable" checked>
                    <label for="editable">允许编辑器输入</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">自动布局：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="automatic-layout">
                    <label for="automatic-layout">容器尺寸变化时自动重新布局</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">拖放功能：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="drag-and-drop">
                    <label for="drag-and-drop">启用拖放文本功能</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">辅助功能：</span>
            <div class="setting-value">
                <select class="setting-select" id="accessibility-support">
                    <option value="auto">自动检测</option>
                    <option value="off">关闭</option>
                    <option value="on">开启</option>
                </select>
            </div>
        </div>
    </div>`

    return section
}

/**
 * 创建换行、缩进与渲染配置区域
 * 包含代码折叠、缩进指南、空白字符显示等配置
 */
function createFoldingSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-folding'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">换行、缩进与渲染配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            代码折叠、缩进指南和空白字符显示配置
        </p>

        <div class="setting-group">
            <span class="setting-label">启用折叠：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="folding" checked>
                    <label for="folding">启用代码折叠功能</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">折叠策略：</span>
            <div class="setting-value">
                <select class="setting-select" id="folding-strategy">
                    <option value="auto">自动</option>
                    <option value="indentation">基于缩进</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">显示折叠控件：</span>
            <div class="setting-value">
                <select class="setting-select" id="show-folding-controls">
                    <option value="always">始终显示</option>
                    <option value="mouseover">鼠标悬停时显示</option>
                    <option value="never">从不显示</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">最大折叠区域：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="folding-maximum-regions" value="5000" min="100" max="10000">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">个</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">默认折叠导入：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="folding-imports-by-default">
                    <label for="folding-imports-by-default">默认折叠导入语句</label>
                </div>
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

        <div class="setting-group">
            <span class="setting-label">缩进指南：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="guides-indentation" checked>
                    <label for="guides-indentation">显示缩进指南线</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">括号对指南：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="guides-bracket-pairs">
                    <label for="guides-bracket-pairs">显示括号对指南</label>
                </div>
            </div>
        </div>

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
    </div>`

    return section
}
/**
 * 创建悬停提示与编码行为配置区域
 * 包含Hover提示、选择高亮、CodeLens等配置
 */
function createHoverSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-hover'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">Hover与编码行为配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            悬停提示和编码行为配置
        </p>

        <div class="setting-group">
            <span class="setting-label">启用Hover：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="hover-enabled" checked>
                    <label for="hover-enabled">鼠标悬停时显示提示</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">Hover延迟：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="hover-delay" value="300" min="0" max="2000">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">毫秒</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">选择高亮：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="selection-highlight" checked>
                    <label for="selection-highlight">高亮相同内容</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">出现高亮：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="occurrences-highlight" checked>
                    <label for="occurrences-highlight">高亮所有出现位置</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">CodeLens：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="code-lens">
                    <label for="code-lens">显示CodeLens</label>
                </div>
            </div>
        </div>
    </div>`

    return section
}

/**
 * 创建查找与替换配置区域
 * 包含查找行为、搜索选项等配置
 */
function createFindSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-find'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">查找与替换配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            查找和替换功能配置
        </p>

        <div class="setting-group">
            <span class="setting-label">自动查找：</span>
            <div class="setting-value">
                <select class="setting-select" id="find-auto-find-in-selection">
                    <option value="never">从不</option>
                    <option value="always">始终</option>
                    <option value="multiline">多行时</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">搜索词来源：</span>
            <div class="setting-value">
                <select class="setting-select" id="find-seed-search-string">
                    <option value="never">从不</option>
                    <option value="selection">选择内容</option>
                    <option value="selectionOrCursor">选择或光标</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">循环搜索：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="find-loop" checked>
                    <label for="find-loop">到达末尾时从头开始</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">高亮匹配：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="find-highlight-matches" checked>
                    <label for="find-highlight-matches">高亮所有匹配项</label>
                </div>
            </div>
        </div>
    </div>`

    return section
}

/**
 * 创建Unicode高亮配置区域
 * 包含非基本ASCII、不可见字符、歧义字符等检测配置
 */
function createUnicodeSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-unicode'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">Unicode高亮配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            控制编辑器如何高亮显示Unicode字符,帮助识别可能引起混淆的字符(如全角/半角字符)
        </p>

        <div class="setting-group">
            <span class="setting-label">非基本ASCII字符：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="unicode-non-basic-ascii">
                    <label for="unicode-non-basic-ascii">高亮非基本ASCII字符</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">不可见字符：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="unicode-invisible-characters" checked>
                    <label for="unicode-invisible-characters">高亮不可见字符</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">易混淆字符：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="unicode-ambiguous-characters">
                    <label for="unicode-ambiguous-characters">高亮易混淆字符(全角/半角等)</label>
                </div>
            </div>
        </div>
    </div>`

    return section
}

/**
 * 创建显示与布局配置区域
 * 包含字体、文本样式、显示元素等配置
 */
function createDisplaySection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-display'
    section.className = 'setting-section'

    // 生成字体选项
    const fontOptions = FontFamily.map(font =>
        `<option value="${font.value}">${font.value}</option>`
    ).join('')

    section.innerHTML = `
        <h3 class="section-title">显示与布局配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            编辑器显示、字体、布局相关配置
        </p>

        <h4 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-color);">字体设置</h4>

        <div class="setting-group">
            <span class="setting-label">字体族：</span>
            <div class="setting-value">
                <select class="setting-select" id="font-family" style="width: 200px;">
                    ${fontOptions}
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字体大小：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="font-size" value="16" min="8" max="72">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">像素</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字体粗细：</span>
            <div class="setting-value">
                <select class="setting-select" id="font-weight" style="width: 200px;">
                    <option value="normal">正常</option>
                    <option value="bold">粗体</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="300">300</option>
                    <option value="400">400</option>
                    <option value="500">500</option>
                    <option value="600">600</option>
                    <option value="700">700</option>
                    <option value="800">800</option>
                    <option value="900">900</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字体连字：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="font-ligatures">
                    <label for="font-ligatures">启用字体连字</label>
                </div>
            </div>
        </div>

        <h4 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-color);">文本样式</h4>

        <div class="setting-group">
            <span class="setting-label">行高：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="line-height" value="0" min="0" max="5" step="0.1">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">0表示自动</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字间距：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="letter-spacing" value="0" min="-5" max="20" step="0.5">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">像素</span>
            </div>
        </div>

        <h4 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-color);">显示设置</h4>

        <div class="setting-group">
            <span class="setting-label">自动换行：</span>
            <div class="setting-value">
                <select class="setting-select" id="word-wrap" style="width: 200px;">
                    <option value="on">启用</option>
                    <option value="off">禁用</option>
                    <option value="bounded">限制宽度</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">行号显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="line-numbers" style="width: 200px;">
                    <option value="on">显示</option>
                    <option value="off">隐藏</option>
                    <option value="relative">相对行号</option>
                    <option value="interval">间隔显示</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">行号最小字符数：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="line-numbers-min-chars" value="1" min="1" max="10">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">字符</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">行装饰宽度：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="line-decorations-width" value="10" min="0" max="50">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">像素</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">标尺列：</span>
            <div class="setting-value">
                <input type="text" class="setting-input" id="rulers" placeholder="例如: 80,120">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">用逗号分隔</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">概览标尺轨道数：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="overview-ruler-lanes" value="3" min="0" max="10">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">条轨道</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">概览标尺隐藏光标：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="hide-cursor-in-overview-ruler">
                    <label for="hide-cursor-in-overview-ruler">在概览标尺中隐藏光标</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">缩略图：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="minimap">
                    <label for="minimap">显示代码缩略图</label>
                </div>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">空白字符显示：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-whitespace" style="width: 200px;">
                    <option value="none">不显示</option>
                    <option value="boundary">边界</option>
                    <option value="selection">选中时</option>
                    <option value="all">全部显示</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">当前行高亮：</span>
            <div class="setting-value">
                <select class="setting-select" id="render-line-highlight" style="width: 200px;">
                    <option value="none">不显示</option>
                    <option value="line">行高亮</option>
                    <option value="all">全部高亮</option>
                    <option value="range">范围高亮</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">字形边距：</span>
            <div class="setting-value">
                <div class="setting-checkbox">
                    <input type="checkbox" id="glyph-margin" checked>
                    <label for="glyph-margin">显示字形边距区域</label>
                </div>
            </div>
        </div>
    </div>`
    return section
}


/**
 * 创建光标与选择配置区域
 * 包含光标样式、动画、选择行为等配置
 */
function createCursorSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-cursor'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">光标与选择配置</h3>
        <div class="settings-grid"><p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            光标样式、动画、可见性等配置
        </p>

        <h4 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-color);">光标样式</h4>

        <div class="setting-group">
            <span class="setting-label">光标样式：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-style" style="width: 200px;">
                    <option value="line">线条</option>
                    <option value="block">块状</option>
                    <option value="underline">下划线</option>
                    <option value="line-thin">细线条</option>
                    <option value="block-outline">块状轮廓</option>
                    <option value="underline-thin">细下划线</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标宽度：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="cursor-width" value="0" min="0" max="20">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">像素(仅块状光标)</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">光标闪烁：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-blinking" style="width: 200px;">
                    <option value="blink">闪烁</option>
                    <option value="smooth">平滑</option>
                    <option value="phase">相位</option>
                    <option value="expand">扩展</option>
                    <option value="solid">固定(不闪烁)</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">平滑移动动画：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-smooth-caret-animation" style="width: 200px;">
                    <option value="off">关闭</option>
                    <option value="explicit">显式</option>
                    <option value="on">开启</option>
                </select>
            </div>
        </div>

        <h4 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-color);">光标可见性</h4>

        <div class="setting-group">
            <span class="setting-label">光标上下最小可见行数：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="cursor-surrounding-lines" value="0" min="0" max="20">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">行</span>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">周围行数样式：</span>
            <div class="setting-value">
                <select class="setting-select" id="cursor-surrounding-lines-style" style="width: 200px;">
                    <option value="default">默认</option>
                    <option value="all">全部</option>
                </select>
            </div>
        </div>

        <div class="setting-group">
            <span class="setting-label">水平居中时两侧显示列数：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="cursor-surrounding-line-columns" value="15" min="0" max="100">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">列</span>
            </div>
        </div>

        <h4 style="margin-top: 20px; margin-bottom: 12px; color: var(--accent-color);">渲染限制</h4>

        <div class="setting-group">
            <span class="setting-label">行尾最大渲染字符数：</span>
            <div class="setting-value">
                <input type="number" class="number-input" id="stop-rendering-line-after" value="-1" min="-1" max="100000">
                <span style="margin-left: 8px; color: var(--secondary-text-color); font-size: var(--font-size-xs);">-1表示无限制</span>
            </div>
        </div>
    </div>`

    return section
}

/**
 * 创建智能提示与补全配置区域
 * 包含快速建议、参数提示、内联建议等配置
 */
function createSuggestionsSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-suggestions'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">智能提示配置</h3>

        <div class="settings-grid"><div class="setting-group">
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
    </div>`

    return section
}

/**
 * 创建自动闭合与修饰配置区域
 * 包含括号、引号自动闭合、自动包围等配置
 */
function createAutoClosingSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-autoClosing'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">自动闭合配置</h3>

        <div class="settings-grid"><div class="setting-group">
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
    </div>`

    return section
}


/**
 * 创建滚动与视口配置区域
 * 包含滚动行为、视口配置等
 */
function createScrollSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-scroll'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">滚动配置</h3>

        <div class="settings-grid"><div class="setting-group">
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
    </div>`

    return section
}

/**
 * 创建子对象详细配置区域
 * 包含minimap、scrollbar、suggest、gotoLocation等子对象配置
 */
function createSubobjectsSection(document: Document): HTMLElement {
    const section = document.createElement('div')
    section.id = 'section-subobjects'
    section.className = 'setting-section'

    section.innerHTML = `
        <h3 class="section-title">子对象详细配置</h3>
        <p style="color: var(--secondary-text-color); font-size: var(--font-size-xs); margin-bottom: 16px;">
            配置Monaco Editor的子对象属性，包括minimap缩略图、scrollbar滚动条、suggest建议小部件等
        </p>

        <div class="settings-group-container">
            <div class="settings-group-title">minimap 缩略图</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">启用：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="minimap-enabled" checked>
                            <label for="minimap-enabled">启用缩略图</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">自动隐藏：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="minimap-autohide">
                            <label for="minimap-autohide">自动隐藏</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">显示位置：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="minimap-side">
                            <option value="right">右侧</option>
                            <option value="left">左侧</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">尺寸策略：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="minimap-size">
                            <option value="proportional">比例</option>
                            <option value="fill">填充</option>
                            <option value="fit">适应</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">滑块显示：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="minimap-show-slider">
                            <option value="mouseover">鼠标悬停</option>
                            <option value="always">总是</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">渲染字符：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="minimap-render-characters" checked>
                            <label for="minimap-render-characters">渲染字符</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">最大列数：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="minimap-max-column"
                               min="1" max="200" value="120">
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">缩放比例：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="minimap-scale"
                               min="0.1" max="3" step="0.1" value="1">
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-group-container">
            <div class="settings-group-title">scrollbar 滚动条</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">垂直滚动条：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="scrollbar-vertical">
                            <option value="auto">自动</option>
                            <option value="visible">可见</option>
                            <option value="hidden">隐藏</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">水平滚动条：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="scrollbar-horizontal">
                            <option value="auto">自动</option>
                            <option value="visible">可见</option>
                            <option value="hidden">隐藏</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">垂直大小：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="scrollbar-vertical-size"
                               min="1" max="30" value="14">
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">水平大小：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="scrollbar-horizontal-size"
                               min="1" max="30" value="12">
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">箭头大小：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="scrollbar-arrow-size"
                               min="1" max="20" value="11">
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">阴影效果：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="scrollbar-use-shadows" checked>
                            <label for="scrollbar-use-shadows">显示阴影</label>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-group-container">
            <div class="settings-group-title">suggest 建议小部件</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">显示图标：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="suggest-show-icons" checked>
                            <label for="suggest-show-icons">显示图标</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">显示状态栏：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="suggest-show-status-bar" checked>
                            <label for="suggest-show-status-bar">显示状态栏</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">插入方式：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="suggest-insert-mode">
                            <option value="insert">插入</option>
                            <option value="replace">替换</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">最大可见条目：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="suggest-max-visible"
                               min="1" max="20" value="8">
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">预览效果：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="suggest-preview">
                            <label for="suggest-preview">预览选中效果</label>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-group-container">
            <div class="settings-group-title">gotoLocation 跳转</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">多目标跳转：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="goto-location-multiple">
                            <option value="goto">跳转</option>
                            <option value="gotoAndPeek">跳转并查看</option>
                            <option value="peek">查看</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">多定义跳转：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="goto-location-multiple-definitions">
                            <option value="goto">跳转</option>
                            <option value="gotoAndPeek">跳转并查看</option>
                            <option value="peek">查看</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">多实现跳转：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="goto-location-multiple-implementations">
                            <option value="goto">跳转</option>
                            <option value="gotoAndPeek">跳转并查看</option>
                            <option value="peek">查看</option>
                        </select>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">多引用跳转：</span>
                    <div class="setting-value">
                        <select class="setting-select" id="goto-location-multiple-references">
                            <option value="goto">跳转</option>
                            <option value="gotoAndPeek">跳转并查看</option>
                            <option value="peek">查看</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-group-container">
            <div class="settings-group-title">hover 悬停提示</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">启用：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="hover-enabled" checked>
                            <label for="hover-enabled">启用悬停提示</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">延迟时间：</span>
                    <div class="setting-value">
                        <input type="number" class="number-input" id="hover-delay"
                               min="0" max="2000" step="50" value="300">
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">粘性显示：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="hover-sticky">
                            <label for="hover-sticky">粘性显示</label>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-group-container">
            <div class="settings-group-title">parameterHints 参数提示</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">启用：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="parameter-hints-enabled" checked>
                            <label for="parameter-hints-enabled">启用参数提示</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">循环：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="parameter-hints-cycle">
                            <label for="parameter-hints-cycle">循环显示</label>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-group-container">
            <div class="settings-group-title">bracketPairColorization 括号对颜色化</div>
            <div class="settings-grid">
                <div class="setting-group">
                    <span class="setting-label">启用：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="bracket-pair-colorization-enabled" checked>
                            <label for="bracket-pair-colorization-enabled">启用括号对颜色化</label>
                        </div>
                    </div>
                </div>

                <div class="setting-group">
                    <span class="setting-label">独立颜色池：</span>
                    <div class="setting-value">
                        <div class="setting-checkbox">
                            <input type="checkbox" id="bracket-pair-independent-color-pool">
                            <label for="bracket-pair-independent-color-pool">每种括号类型独立颜色池</label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
    return section
}
