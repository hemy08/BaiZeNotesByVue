import * as monaco from 'monaco-editor'
import { t } from '../../common/i18n'

// PF-03/CMP-28（Monaco worker）：worker 注册（?worker 导入 + MonacoEnvironment.getWorker）
// 见同目录 monaco-worker-setup.ts（由 MarkdownMonacoEditor.vue 引入），本文件无需 worker 相关选项；
// 下方的大文件保护（largeFileOptimizations / maxTokenizationLineLength / foldingMaximumRegions）
// 与 worker 方案正交：主线程仍参与的部分由这些上限约束，避免超大文件拖垮 UI。
// FUN-09（editor-toggle-fold）：folding: true + foldingStrategy: 'auto' 配合
// MarkdownMonacoEditor.vue 注册的 markdown 折叠提供器（围栏代码块 + ATX 标题），
// 使 foldAll / unfoldAll / foldLevel1~6 动作真正作用于标题层级与代码块。
// FUN-28：本文件的 Monaco 初始选项与主进程 editor-setting.ts 的
// defaultEditorSetting（持久化默认值真源）保持一致，
// 避免编辑器创建后、init-editor-setting 覆盖前的默认值闪烁与漂移。
export const MonacoEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: '',
    language: 'markdown',
    theme: 'default',
    wordWrap: 'on',
    automaticLayout: false,
    minimap: {
        enabled: false,
        renderCharacters: false,
        maxColumn: 120
    },
    tabSize: 4,
    fontFamily: 'Hack',
    fontSize: 15,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    tabCompletion: 'off',
    renderWhitespace: 'all',
    accessibilitySupport: 'auto',
    snippetSuggestions: 'inline',
    unicodeHighlight: {
        ambiguousCharacters: false,
        nonBasicASCII: false,
        includeStrings: true
    },
    inlineSuggest: {
        enabled: false
    },
    dragAndDrop: false,
    renderValidationDecorations: 'off',
    folding: true,
    foldingStrategy: 'auto',
    largeFileOptimizations: true,
    maxTokenizationLineLength: 10000,
    renderLineHighlight: 'all',
    // 2026-11-20（编辑器底部光标不可见修复）：允许滚过最后一行，并在底部留一行安全距，
    // 避免在页面已满时回车产生的新行贴住状态栏。padding 不随主进程 editor-setting 覆盖。
    scrollBeyondLastLine: true,
    padding: {
        top: 0,
        bottom: 20
    },
    foldingMaximumRegions: 5000,
    find: {
        addExtraSpaceOnTop: true,
        autoFindInSelection: 'multiline',
        seedSearchStringFromSelection: 'selection',
        cursorMoveOnType: true,
        loop: true
    },
    quickSuggestions: {
        other: true,
        comments: false,
        strings: false
    },
    suggestSelection: 'first',
    wordBasedSuggestions: 'off',
    scrollbar: {
        vertical: 'visible',
        horizontal: 'visible',
        verticalScrollbarSize: 14,
        horizontalScrollbarSize: 12,
        arrowSize: 11,
        useShadows: true
    },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    mouseWheelScrollSensitivity: 1,
    fastScrollSensitivity: 5,
    scrollBeyondLastColumn: 5,
    scrollPredominantAxis: true,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    overviewRulerLanes: 1,
    links: true,
    colorDecorators: true,
    renderControlCharacters: false,
    glyphMargin: true,
    lineDecorationsWidth: 0,
    hover: {
        enabled: 'on',
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
    codeLens: false,
    codeLensFontFamily: '',
    codeLensFontSize: 0,
    foldingImportsByDefault: false,
    occurrencesHighlight: 'singleFile',
    selectionHighlight: true,
    bracketPairColorization: {
        enabled: true
    },
    renderFinalNewline: 'on',
    readOnly: false,
    domReadOnly: false,
    emptySelectionClipboard: true,
    copyWithSyntaxHighlighting: true,
    multiCursorModifier: 'alt',
    multiCursorPaste: 'spread',
    fixedOverflowWidgets: false,
    ariaLabel: t('editorUi.editor.ariaLabel')
}

export const MonacoEditorOverride: monaco.editor.IEditorOverrideServices = {}
