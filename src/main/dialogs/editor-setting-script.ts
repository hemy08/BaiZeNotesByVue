export function getEditorSettingScript(): string {
    return `
        const ipcRenderer = window.electronAPI.ipcRenderer;

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
                // 应用按钮
                const applyBtn = document.getElementById('editor-setting-apply');
                if (applyBtn) {
                    applyBtn.addEventListener('click', function() {
                        ipcRenderer.send('dialog-editor-setting-apply', EditorSetting);
                    });
                } else {
                    console.error('找不到应用按钮: editor-setting-apply');
                }

                // 取消按钮
                const cancelBtn = document.getElementById('editor-setting-cancel');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', function() {
                        ipcRenderer.send('dialog-editor-setting-cancel');
                    });
                } else {
                    console.error('找不到取消按钮: editor-setting-cancel');
                }

                // 重置按钮
                const resetBtn = document.getElementById('editor-setting-reset');
                if (resetBtn) {
                    resetBtn.addEventListener('click', function() {
                        ipcRenderer.send('dialog-editor-setting-reset');
                    });
                } else {
                    console.error('找不到重置按钮: editor-setting-reset');
                }

                // 确定按钮
                const okBtn = document.getElementById('editor-setting-ok');
                if (okBtn) {
                    okBtn.addEventListener('click', function() {
                        ipcRenderer.send('dialog-editor-setting-ok', EditorSetting);
                    });
                } else {
                    console.error('找不到确定按钮: editor-setting-ok');
                }

                // 关闭按钮
                const closeBtn = document.getElementById('close-dialog-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', function() {
                        ipcRenderer.send('dialog-editor-setting-cancel');
                    });
                } else {
                    console.error('找不到关闭按钮: close-dialog-btn');
                }
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
}
