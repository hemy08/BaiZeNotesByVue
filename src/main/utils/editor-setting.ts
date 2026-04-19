/**
 * 编辑器设置管理模块
 * 用于管理Monaco编辑器的配置
 * 基于 monaco.editor.IStandaloneEditorConstructionOptions 接口
 */

// @ts-ignore
import Store from 'electron-store'

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
    lineHeight: number
    letterSpacing: number
    tabSize: number
    insertSpaces: boolean

    // ========== 空白和折叠配置 ==========
    renderWhitespace: 'none' | 'boundary' | 'selection' | 'all'
    folding: boolean
    foldingStrategy: 'auto' | 'indentation'
    showFoldingControls: 'always' | 'mouseover'
    unfoldOnClickAfterEndOfLine: boolean

    // ========== 高亮和装饰配置 ==========
    renderLineHighlight: 'none' | 'line' | 'all' | 'range'
    renderLineHighlightOnlyWhenFocus: boolean
    selectOnLineNumbers: boolean
    glyphMargin: boolean

    // ========== 光标配置 ==========
    cursorStyle: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'
    cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
    cursorSmoothCaretAnimation: 'on' | 'off' | 'explicit'
    cursorWidth: number

    // ========== 滚动配置 ==========
    smoothScrolling: boolean
    scrollBeyondLastLine: boolean
    mouseWheelScrollSensitivity: number
    fastScrollSensitivity: number

    // ========== 自动完成和智能提示配置 ==========
    quickSuggestions: boolean
    quickSuggestionsDelay: number
    acceptSuggestionOnEnter: 'on' | 'off' | 'smart'
    acceptSuggestionOnCommitCharacter: boolean
    wordBasedSuggestions: 'off' | 'on' | 'allDocuments'

    // ========== 括号和引号配置 ==========
    autoClosingBrackets: 'never' | 'languageDefined' | 'beforeWhitespace' | 'always'
    autoClosingQuotes: 'never' | 'languageDefined' | 'beforeWhitespace' | 'always'
    autoClosingComments: 'never' | 'languageDefined' | 'beforeWhitespace' | 'always'
    autoSurround: 'never' | 'languageDefined' | 'quotes' | 'brackets' | 'all'
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

    // ========== 链接配置 ==========
    links: boolean
    linkDetection: boolean

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
    readOnly: boolean
    editable: boolean
    accessibilitySupport: 'auto' | 'off' | 'on'
    screenReaderAnnounceInlineSuggestions: boolean
}

// 默认编辑器配置
const defaultEditorSetting: EditorSetting = {
    // 基础显示配置
    wordWrap: 'on',
    minimap: false,
    lineNumbers: 'on',
    fontSize: 60,
    fontFamily: 'Hack',
    fontWeight: 'normal',
    fontLigatures: false,
    lineHeight: 0, // 0表示自动
    letterSpacing: 0,
    tabSize: 4,
    insertSpaces: true,

    // 空白和折叠配置
    renderWhitespace: 'all',
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',
    unfoldOnClickAfterEndOfLine: false,

    // 高亮和装饰配置
    renderLineHighlight: 'all',
    renderLineHighlightOnlyWhenFocus: false,
    selectOnLineNumbers: true,
    glyphMargin: true,

    // 光标配置
    cursorStyle: 'line',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    cursorWidth: 0, // 0表示默认

    // 滚动配置
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    mouseWheelScrollSensitivity: 1,
    fastScrollSensitivity: 5,

    // 自动完成和智能提示配置
    quickSuggestions: true,
    quickSuggestionsDelay: 10,
    acceptSuggestionOnEnter: 'on',
    acceptSuggestionOnCommitCharacter: true,
    wordBasedSuggestions: 'on',

    // 括号和引号配置
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoClosingComments: 'languageDefined',
    autoSurround: 'languageDefined',
    autoIndent: 'advanced',
    autoIndentOnPaste: true,

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

    // 颜色装饰器配置
    colorDecorators: true,

    // Unicode高亮配置
    unicodeHighlight: {
        nonBasicASCII: false,
        invisibleCharacters: true,
        ambiguousCharacters: true
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
    readOnly: false,
    editable: true,
    accessibilitySupport: 'auto',
    screenReaderAnnounceInlineSuggestions: true
}

// 创建存储实例
// @ts-ignore
const store = new Store()

/**
 * 获取编辑器设置
 */
export function getEditorSetting(): EditorSetting {
    // @ts-ignore
    if (!store.has('editorSetting')) {
        // @ts-ignore
        store.set('editorSetting', defaultEditorSetting)
    }
    // @ts-ignore
    return store.get('editorSetting') as EditorSetting
}

/**
 * 保存编辑器设置
 */
export function saveEditorSetting(setting: EditorSetting): void {
    // @ts-ignore
    store.set('editorSetting', setting)
}

/**
 * 重置为默认设置
 */
export function resetEditorSetting(): void {
    // @ts-ignore
    store.set('editorSetting', defaultEditorSetting)
}

/**
 * 获取默认设置
 */
export function getDefaultEditorSetting(): EditorSetting {
    return defaultEditorSetting
}
