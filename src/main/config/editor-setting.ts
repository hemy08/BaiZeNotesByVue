/**
 * 编辑器设置管理模块
 * 用于管理Monaco编辑器的配置
 * 基于 monaco.editor.IStandaloneEditorConstructionOptions 接口
 */

// @ts-ignore
import { createStore } from '../utils/store-factory'

// 编辑器配置接口 - 完整版
export interface EditorSetting {
    // ========== 基础显示配置 ==========
    wordWrap: 'on' | 'off' | 'bounded'
    minimap: boolean
    lineNumbers: 'on' | 'off' | 'relative' | 'interval'
    fontSize: number
    fontFamily: string
    fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
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
    renderControlCharacters: boolean,
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

// 默认编辑器配置
const defaultEditorSetting: EditorSetting = {
    // 基础显示配置
        // ========== 基础编辑配置 ==========
    readOnly: false,
    domReadOnly: false,
    emptySelectionClipboard: true,
    copyWithSyntaxHighlighting: true,
    multiCursorModifier: 'alt',
    multiCursorPaste: 'spread',
    fixedOverflowWidgets: false,
    ariaLabel: '白泽笔记编辑器',
    ariaHeaderMessage: undefined,

    wordWrap: 'on',
    minimap: false,
    lineNumbers: 'on',
    fontSize: 15,
    fontFamily: 'Hack',
    fontWeight: 'normal',
    fontLigatures: false,
    fontVariations: false,
    lineHeight: 0, // 0表示自动
    letterSpacing: 0,
    tabSize: 4,
    insertSpaces: true,
    wordWrapColumn: 80,
    wordWrapBreakBeforeCharacters: false,
    wordWrapBreakAfterCharacters: false,
    wrappingIndent: 'none',
    wrappingStrategy: 'simple',
    indentSize: 'tabSize',
    detectIndentation: true,

    // 空白和折叠配置
    renderControlCharacters: false,
    renderWhitespace: 'all',
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',
    unfoldOnClickAfterEndOfLine: false,
    foldingImportsByDefault: false,
    foldingMaximumRegions: 5000,

    // 高亮和装饰配置
    renderLineHighlight: 'all',
    renderLineHighlightOnlyWhenFocus: false,
    selectOnLineNumbers: true,
    selectionHighlight: true,
    occurrencesHighlight: 'singleFile',
    glyphMargin: true,
    rangeHighlight: true,
    rulers: [],
    hover: {
        enabled: true,
        delay: 300,
        sticky: false
    },
    stickyTabStops: false,
    gotoLocation: {
        multiple: 'goto',
        multipleDefinitions: 'goto',
        multipleImplementations: 'goto',
        multipleReferences: 'goto',
        multipleTypeDefinitions: 'goto'
    },

    // 光标配置
    cursorStyle: 'line',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    cursorWidth: 0, // 0表示默认
    cursorSurroundingLines: 0,
    cursorSurroundingLinesStyle: 'default',
    cursorSurroundingLineColumns: 15,
    stopRenderingLineAfter: -1,

    // 滚动配置
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    mouseWheelScrollSensitivity: 1,
    fastScrollSensitivity: 5,
    scrollBeyondLastColumn: 0,
    scrollPredominantAxis: true,
    alwaysConsumeMouseWheel: true,
    hideHorizontalScrollbar: false,
    scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 14,
        horizontalScrollbarSize: 14,
        arrowSize: 11,
        useShadows: true,
        renderByPixels: true
    },

    // 自动完成和智能提示配置
    quickSuggestions: true,
    quickSuggestionsDelay: 10,
    acceptSuggestionOnEnter: 'on',
    acceptSuggestionOnCommitCharacter: true,
    wordBasedSuggestions: 'on',
    wordBasedSuggestionsOnlySameLanguage: false,
    horizontalScrollbarSize: 14,
    verticalScrollbarSize: 14,
    arrowSize: 11,
    useShadows: true,

    // 括号和引号配置
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoClosingComments: 'languageDefined',
    autoSurround: 'languageDefined',
    autoClosingOvertype: 'auto',
    autoIndent: 'advanced',
    autoIndentOnPaste: true,
    commentMultiLine: true,
    commentInline: true,
    matchBrackets: 'always',
    matchingBrackets: 'always',

    // 缩进指南配置
    guides: {
        indentation: true,
        bracketPairs: false,
        highlightActiveIndentation: true
    },

    // 括号对颜色化配置
    bracketPairColorization: {
        enabled: true
    },

    // 链接配置
    links: true,
    linkDetection: true,

    // 提示配置
    showAdjustSettingTip: true, // 默认显示提示

    // 颜色装饰器配置
    colorDecorators: true,

    // Unicode高亮配置
    unicodeHighlight: {
        nonBasicASCII: false,
        invisibleCharacters: true,
        ambiguousCharacters: false // 禁用易混淆字符高亮,避免全角/半角字符提示
    },

    // 粘性滚动配置
    stickyScroll: {
        enabled: false,
        maxLineCount: 5
    },

    // 性能配置
    largeFileOptimizations: true,
    maxTokenizationLineLength: 10000,

    // 其他配置
    dragAndDrop: false,
    editable: true,
    accessibilitySupport: 'auto',
    screenReaderAnnounceInlineSuggestions: true,

    // 编辑行为配置
    tabCompletion: 'off',
    snippetSuggestions: 'inline',
    suggestOnTriggerCharacters: true,
    suggestSelection: 'recentlyUsed',
    suggestFontSize: 0,
    suggestLineHeight: 0,
    suggestPreview: false,

    // 内联提示配置
    inlineSuggest: {
        enabled: false
    },

    // 参数提示配置
    parameterHints: {
        enabled: true,
        cycle: false
    },

    // 格式化配置
    formatOnPaste: false,
    formatOnType: false,

    // 查找配置
    find: {
        addExtraSpaceOnTop: true,
        autoFindInSelection: 'multiline',
        seedSearchStringFromSelection: 'selection',
        cursorMoveOnType: true,
        loop: true,
        globalFindClipboard: false,
        highlightFindMatches: true,
        highlightFindMatchColor: true,
        highlightFindMatchSize: 1
    },

    // 差异编辑器配置
    originalEditable: false,
    renderSideBySide: true,
    renderMarginRevertIcon: true,
    renderIndicators: true,
    ignoreTrimWhitespace: true,
    maxComputationTime: 60000,
    useInlineViewWhenSpaceIsLimited: false,
    compactMode: false,

    // 注释配置
    comments: {
        insertSpace: true,
        ignoreEmptyLines: true
    },

    // 括号配置
    renderFinalNewline: 'on',
    trimAutoWhitespace: true,

    // 代码透镜配置
    codeLens: false,
    codeLensFontFamily: '',
    codeLensFontSize: 0,

    // 行装饰配置
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 0, // 减小行号区域宽度，默认5改为3
    revealHorizontalRightPadding: 10,

    // 概览标尺配置
    overviewRulerBorder: false,
    overviewRulerLanes: 1,
    hideCursorInOverviewRuler: true,

    // 固定宽度配置
    maximizedScrollbar: false
}

// 存储实例（延迟初始化）
let store: ReturnType<typeof createStore> | null = null

// 获取存储实例
function getStore() {
    if (!store) {
        store = createStore('editor-setting', {})
    }
    return store
}

/**
 * 获取编辑器设置
 */
export function getEditorSetting(): EditorSetting {
    const s = getStore()
    // @ts-ignore
    if (!s.has('editorSetting')) {
        // @ts-ignore
        s.set('editorSetting', defaultEditorSetting)
    }
    // @ts-ignore
    return s.get('editorSetting') as EditorSetting
}

/**
 * 保存编辑器设置
 */
export function saveEditorSetting(setting: EditorSetting): void {
    const s = getStore()
    // @ts-ignore
    s.set('editorSetting', setting)
}

/**
 * 重置为默认设置
 */
export function resetEditorSetting(): void {
    const s = getStore()
    // @ts-ignore
    s.set('editorSetting', defaultEditorSetting)
}

/**
 * 获取默认设置
 */
export function getDefaultEditorSetting(): EditorSetting {
    return defaultEditorSetting
}