import * as monaco from 'monaco-editor'

// @ts-ignore
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
    fontSize: 16,
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
    foldingStrategy: 'indentation',
    largeFileOptimizations: true,
    maxTokenizationLineLength: 10000,
    renderLineHighlight: 'none',
    scrollBeyondLastLine: false,
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
    glyphMargin: false,
    lineDecorationsWidth: 0,
    hover: {
        enabled: 'on',
        delay: 300,
        sticky: false
    },
    stickyTabStops: true,
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
    ariaLabel: '白泽笔记编辑器'
}

export const MonacoEditorOverride: monaco.editor.IEditorOverrideServices = {}
