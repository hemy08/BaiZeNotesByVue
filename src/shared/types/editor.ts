/**
 * 编辑器设置类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前定义在 src/main/config/editor-setting.ts（模块导出），是主进程
 * editor-setting.json 的持久化结构，也是主进程 → 渲染层 init-editor-setting
 * 初始化广播的负载形状。按 ARC-13「跨进程契约类型入 shared」约定
 * 迁入本文件：
 * - 主进程 editor-setting.ts 以 `import type` 引用并 re-export，
 *   config/index 等既有引用路径不变（P2 起主进程 HTML 编辑器设置对话框
 *   ShowEditorSettingDialog 已删除，渲染层 EditorSettingDialog.vue 经
 *   IPC.EDITOR.GET_SETTING / INIT_SETTING 消费）；
 * - 渲染层目前仅以 any/unknown 方式消费该广播负载，未强制标注（见遗留项），
 *   后续可在 MarkdownMonacoEditor 等处直接 import type 使用。
 *
 * 字段名 / 类型 / 可选性与收敛前版本完全一致（接口结构逐字迁移）。
 */
export interface EditorSetting {
    // ========== 基础显示配置 ==========
    wordWrap: 'on' | 'off' | 'bounded'
    minimap: boolean
    lineNumbers: 'on' | 'off' | 'relative' | 'interval'
    fontSize: number
    fontFamily: string
    fontWeight:
        'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
    fontLigatures: boolean
    fontVariations: boolean | string
    lineHeight: number
    letterSpacing: number
    tabSize: number
    insertSpaces: boolean
    wordWrapColumn: number
    wordWrapBreakBeforeCharacters: boolean
    wordWrapBreakAfterCharacters: boolean
    wrappingIndent: 'none' | 'same' | 'indent' | 'deepIndent'
    wrappingStrategy: 'simple' | 'advanced'
    indentSize: number | 'tabSize'
    detectIndentation: boolean

    // ========== 基础编辑配置 ==========
    readOnly: boolean
    domReadOnly: boolean
    emptySelectionClipboard: boolean
    copyWithSyntaxHighlighting: boolean
    multiCursorModifier: 'ctrlCmd' | 'alt'
    multiCursorPaste: 'spread' | 'full'
    fixedOverflowWidgets: boolean
    ariaLabel: string
    ariaHeaderMessage: string | undefined

    // ========== 空白和折叠配置 ==========
    renderControlCharacters: boolean
    renderWhitespace: 'none' | 'boundary' | 'selection' | 'all'
    folding: boolean
    foldingStrategy: 'auto' | 'indentation'
    showFoldingControls: 'always' | 'mouseover'
    unfoldOnClickAfterEndOfLine: boolean

    // ========== 高亮和装饰配置 ==========
    renderLineHighlight: 'none' | 'line' | 'all' | 'range'
    renderLineHighlightOnlyWhenFocus: boolean
    selectOnLineNumbers: boolean
    selectionHighlight: boolean
    occurrencesHighlight: 'off' | 'singleFile' | 'multiFile'
    hover: {
        enabled: boolean
        delay: number
        sticky: boolean
    }
    stickyTabStops: boolean
    gotoLocation: {
        multiple: 'goto' | 'gotoAndPeek' | 'peek'
        multipleDefinitions: 'goto' | 'gotoAndPeek' | 'peek'
        multipleImplementations: 'goto' | 'gotoAndPeek' | 'peek'
        multipleReferences: 'goto' | 'gotoAndPeek' | 'peek'
        multipleTypeDefinitions: 'goto' | 'gotoAndPeek' | 'peek'
    }
    foldingImportsByDefault: boolean
    foldingMaximumRegions: number
    glyphMargin: boolean

    // ========== 光标配置 ==========
    cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'
    cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
    cursorSmoothCaretAnimation: 'on' | 'off' | 'explicit'
    cursorWidth: number
    cursorSurroundingLines: number
    cursorSurroundingLinesStyle: 'default' | 'all'
    cursorSurroundingLineColumns: number
    stopRenderingLineAfter: number

    // ========== 滚动配置 ==========
    scrollbar: {
        vertical: 'auto' | 'visible' | 'hidden'
        horizontal: 'auto' | 'visible' | 'hidden'
        verticalScrollbarSize: number
        horizontalScrollbarSize: number
        arrowSize: number
        useShadows: boolean
        renderByPixels: boolean
    }
    smoothScrolling: boolean
    scrollBeyondLastLine: boolean
    mouseWheelScrollSensitivity: number
    fastScrollSensitivity: number
    scrollBeyondLastColumn: number
    scrollPredominantAxis: boolean
    horizontalScrollbarSize: number
    verticalScrollbarSize: number
    alwaysConsumeMouseWheel: boolean
    arrowSize: number
    useShadows: boolean
    hideHorizontalScrollbar: boolean

    // ========== 自动完成和智能提示配置 ==========
    quickSuggestions: boolean
    quickSuggestionsDelay: number
    acceptSuggestionOnEnter: 'on' | 'off' | 'smart'
    acceptSuggestionOnCommitCharacter: boolean
    wordBasedSuggestions: 'off' | 'on' | 'allDocuments'
    wordBasedSuggestionsOnlySameLanguage: boolean

    // ========== 括号和引号配置 ==========
    autoClosingBrackets: 'never' | 'languageDefined' | 'beforeWhitespace' | 'always'
    autoClosingQuotes: 'never' | 'languageDefined' | 'beforeWhitespace' | 'always'
    autoClosingComments: 'never' | 'languageDefined' | 'beforeWhitespace' | 'always'
    autoSurround: 'never' | 'languageDefined' | 'quotes' | 'brackets' | 'all'
    autoClosingOvertype: 'always' | 'auto' | 'never'
    commentMultiLine: boolean
    commentInline: boolean
    autoIndent: 'none' | 'keep' | 'brackets' | 'advanced' | 'full'
    autoIndentOnPaste: boolean

    // ========== 缩进指南配置 ==========
    guides: {
        indentation: boolean
        bracketPairs: boolean
        highlightActiveIndentation: boolean
    }

    // ========== 括号对颜色化配置 ==========
    bracketPairColorization: {
        enabled: boolean
    }
    matchBrackets: 'never' | 'near' | 'always'
    rangeHighlight: boolean

    // ========== 链接配置 ==========
    links: boolean
    linkDetection: boolean

    // ========== 提示配置 ==========
    showAdjustSettingTip: boolean // 是否显示"Adjust Setting"提示

    // ========== 颜色装饰器配置 ==========
    colorDecorators: boolean

    // ========== Unicode高亮配置 ==========
    unicodeHighlight: {
        nonBasicASCII: boolean
        invisibleCharacters: boolean
        ambiguousCharacters: boolean
    }

    // ========== 粘性滚动配置 ==========
    stickyScroll: {
        enabled: boolean
        maxLineCount: number
    }

    // ========== 性能配置 ==========
    largeFileOptimizations: boolean
    maxTokenizationLineLength: number

    // ========== 其他配置 ==========
    dragAndDrop: boolean
    editable: boolean
    accessibilitySupport: 'auto' | 'off' | 'on'
    screenReaderAnnounceInlineSuggestions: boolean

    // ========== 编辑行为配置 ==========
    tabCompletion: 'on' | 'off' | 'onlySnippets'
    snippetSuggestions: 'top' | 'bottom' | 'inline' | 'none'
    suggestOnTriggerCharacters: boolean
    suggestSelection: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix'
    suggestFontSize: number
    suggestLineHeight: number
    suggestPreview: boolean

    // ========== 内联提示配置 ==========
    inlineSuggest: {
        enabled: boolean
    }

    // ========== 参数提示配置 ==========
    parameterHints: {
        enabled: boolean
        cycle: boolean
    }

    // ========== 格式化配置 ==========
    formatOnPaste: boolean
    formatOnType: boolean

    // ========== 查找配置 ==========
    find: {
        addExtraSpaceOnTop: boolean
        autoFindInSelection: 'never' | 'always' | 'multiline'
        seedSearchStringFromSelection: 'never' | 'selection' | 'selectionOrCursor'
        cursorMoveOnType: boolean
        loop: boolean
        globalFindClipboard: boolean
        highlightFindMatches: boolean
        highlightFindMatchColor: boolean
        highlightFindMatchSize: number
    }

    // ========== 差异编辑器配置 ==========
    originalEditable: boolean
    renderSideBySide: boolean
    renderMarginRevertIcon: boolean
    renderIndicators: boolean
    ignoreTrimWhitespace: boolean
    maxComputationTime: number
    useInlineViewWhenSpaceIsLimited: boolean
    compactMode: boolean

    // ========== 注释配置 ==========
    comments: {
        insertSpace: boolean
        ignoreEmptyLines: boolean
    }

    // ========== 括号配置 ==========
    matchingBrackets: 'always' | 'never' | 'near'
    renderFinalNewline: 'on' | 'off' | 'dimmed'
    trimAutoWhitespace: boolean

    // ========== 代码透镜配置 ==========
    codeLens: boolean
    codeLensFontFamily: string
    codeLensFontSize: number

    // ========== 行装饰配置 ==========
    lineDecorationsWidth: number | string
    lineNumbersMinChars: number
    revealHorizontalRightPadding: number

    // ========== 概览标尺配置 ==========
    overviewRulerBorder: boolean
    overviewRulerLanes: number
    rulers: number[]
    hideCursorInOverviewRuler: boolean

    // ========== 固定宽度配置 ==========
    maximizedScrollbar: boolean
}
