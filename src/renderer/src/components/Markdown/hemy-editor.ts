import * as monaco from 'monaco-editor'
import { UpdateContextFormat, OnInsertAfterCursor, replaceSelection } from './hemy-editor-common'
import { MdEditQuickAccess } from './hemy-editor-quick-access'
import { MonacoEditorKeyMaps, MonacoEditorDidChange } from './hemy-editor-shortcut'
import { MonacoEditorAddActions, LoadLocalScript } from './hemy-editor-actions'
import * as Render from './hemy-editor-render'

// @ts-ignore
const MonacoEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: '',
    language: 'markdown',
    theme: 'default',
    wordWrap: 'on', // 启用自动换行
    automaticLayout: false, // 改为手动布局，提升性能
    minimap: {
        enabled: false, // 关闭小型缩略图
        renderCharacters: false, // 不渲染字符，提升性能
        maxColumn: 120 // 限制宽度
    },
    tabSize: 4,
    fontFamily: 'Hack',
    fontSize: 14,
    lineNumbers: 'on',
    tabCompletion: 'on',
    renderWhitespace: 'all',
    accessibilitySupport: 'off', // 启用或禁用辅助功能支持
    snippetSuggestions: 'none', // 控制代码片段建议的显示方式
    unicodeHighlight: {
        ambiguousCharacters: false,
        nonBasicASCII: false,
        includeStrings: true
    }, // 控制 Unicode 字符的高亮
    inlineSuggest: {
        enabled: false
    }, // 控制内联建议的启用或禁用
    dragAndDrop: false, // 启用或禁用拖放功能
    renderValidationDecorations: 'off', // 启用或禁用验证装饰的渲染
    folding: true, // 启用或禁用代码折叠

    // ========== 性能优化配置 ==========
    largeFileOptimizations: true, // 大文件优化，自动禁用某些功能
    maxTokenizationLineLength: 10000, // 限制语法高亮行数，提升大文件性能
    renderLineHighlight: 'all', // 优化行高亮
    scrollBeyondLastLine: false, // 减少渲染区域
    foldingMaximumRegions: 5000, // 限制折叠区域数量，防止内存占用过高
    //stableMinimapScroll: true, // 稳定minimap滚动，提升性能

    // 优化建议配置
    quickSuggestions: {
        other: false, // 禁用其他建议
        comments: false, // 禁用注释建议
        strings: false // 禁用字符串建议
    },

    // 性能相关
    smoothScrolling: true, // 平滑滚动
    cursorBlinking: 'smooth', // 光标闪烁动画
    cursorSmoothCaretAnimation: 'on', // 光标移动动画
    mouseWheelScrollSensitivity: 1, // 鼠标滚轮灵敏度
    fastScrollSensitivity: 5, // 快速滚动灵敏度

    // 减少不必要的渲染
    hideCursorInOverviewRuler: true, // 在概览标尺中隐藏光标
    overviewRulerBorder: false, // 禁用概览标尺边框
    overviewRulerLanes: 1, // 减少概览标尺车道数

    // 禁用不需要的功能
    links: false, // 禁用链接检测
    colorDecorators: false, // 禁用颜色装饰器
    renderControlCharacters: false, // 不渲染控制字符
    glyphMargin: false, // 禁用字形边距

    // 优化编辑器行为
    //readOnlyMessage: null, // 禁用只读消息
    occurrencesHighlight: 'off', // 禁用出现高亮
    selectionHighlight: false, // 禁用选择高亮
    //wordHighlight: 'off', // 禁用单词高亮
    //wordHighlightStrong: 'off', // 禁用强单词高亮
    bracketPairColorization: {
        enabled: false // 禁用括号对颜色化，提升性能
    }
}

function UpdateLineNumber(editor: monaco.editor.IStandaloneCodeEditor) {
    const showLine = editor.getOption(monaco.editor.EditorOption.lineNumbers)
    if (showLine.renderType) {
        editor.updateOptions({ lineNumbers: 'off' })
    } else {
        editor.updateOptions({ lineNumbers: 'on' })
    }
}

function UpdateEditorTheme(editor: monaco.editor.IStandaloneCodeEditor, newTheme: string) {
    const oldSize = editor.getOption(monaco.editor.EditorOption.tabIndex)
    console.log('oldSize', oldSize)
    monaco.editor.setTheme(newTheme)
    console.log('newSize', newTheme)
}

function UpdateTableSize(editor: monaco.editor.IStandaloneCodeEditor, newSize: string) {
    const oldSize = editor.getOption(monaco.editor.EditorOption.tabIndex)
    console.log('oldSize', oldSize)
    console.log('newSize', newSize)
}

function UpdateFontSize(editor: monaco.editor.IStandaloneCodeEditor, newSize: string) {
    const oldSize = editor.getOption(monaco.editor.EditorOption.fontSize)
    console.log('oldSize', oldSize)
    console.log('newSize', newSize)
}

function UpdateRenderWhitespace(editor: monaco.editor.IStandaloneCodeEditor) {
    const whiteSpace = editor.getOption(monaco.editor.EditorOption.renderWhitespace)
    console.log('renderWhitespace', whiteSpace)
    if (whiteSpace === 'all') {
        editor.updateOptions({ renderWhitespace: 'none' })
    } else {
        editor.updateOptions({ renderWhitespace: 'all' })
    }
}

const MonacoEditorOpMaps = {
    lineNumbers: UpdateLineNumber,
    theme: UpdateEditorTheme,
    tabSize: UpdateTableSize,
    fontSize: UpdateFontSize,
    renderWhitespace: UpdateRenderWhitespace
}

const MonacoEditorOverride: monaco.editor.IEditorOverrideServices = {}
const Options = MonacoEditorOptions
const Override = MonacoEditorOverride
const OptMaps = MonacoEditorOpMaps
const QuickAccess = MdEditQuickAccess
const KeyMaps = MonacoEditorKeyMaps
const DidChange = MonacoEditorDidChange
const InsertAfterCursor = OnInsertAfterCursor
const UpdateContext = UpdateContextFormat
const AddActions = MonacoEditorAddActions
const LoadScript = LoadLocalScript

export {
    UpdateContext,
    InsertAfterCursor,
    KeyMaps,
    DidChange,
    AddActions,
    replaceSelection,
    LoadScript,
    Options,
    Override,
    QuickAccess,
    Render,
    OptMaps
}
