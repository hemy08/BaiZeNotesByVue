import * as monaco from 'monaco-editor'
import { UpdateContextFormat, OnInsertAfterCursor, replaceSelection } from './hemy-editor-common'
import { MdEditQuickAccess } from './hemy-editor-quick-access'
import { MonacoEditorKeyMaps, MonacoEditorDidChange } from './hemy-editor-shortcut'
import { MonacoEditorAddActions, LoadLocalScript } from './hemy-editor-actions'
import * as Render from './hemy-editor-render'

const MonacoEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: '',
    language: 'markdown',
    theme: 'default',
    wordWrap: 'on', // 启用自动换行
    automaticLayout: true, // 设置自动布局为 true
    minimap: {
        enabled: false //关闭小型缩略图，它显示整个文档的概览，并且允许用户快速导航到文档的不同部分。
    },
    tabSize: 4,
    fontFamily: 'Hack',
    fontSize: 14,
    lineNumbers: 'on',
    tabCompletion: 'on',
    renderWhitespace: 'all',
    accessibilitySupport: 'off', // 启用或禁用辅助功能支持。
    snippetSuggestions: 'none', // 控制代码片段建议的显示方式
    unicodeHighlight: {
        ambiguousCharacters: false,
        nonBasicASCII: false,
        includeStrings: true
    }, // 控制 Unicode 字符的高亮
    quickSuggestions: false, // 启用或禁用快速建议
    inlineSuggest: {
        enabled: false
    }, // 控制内联建议的启用或禁用
    dragAndDrop: false, //启用或禁用拖放功能。
    renderValidationDecorations: 'off', // 启用或禁用验证装饰的渲染。
    folding: true // 启用或禁用代码折叠
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
