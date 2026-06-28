import * as monaco from 'monaco-editor'

export const EditorOptionMaps: Record<string, string> = {
    wordWrap: 'wordWrap',
    minimap: 'minimap.enabled',
    lineNumbers: 'lineNumbers',
    fontSize: 'fontSize',
    fontFamily: 'fontFamily',
    fontWeight: 'fontWeight',
    tabSize: 'tabSize',
    insertSpaces: 'insertSpaces',
    wordWrapColumn: 'wordWrapColumn',
    wordWrapBreakBeforeCharacters: 'wordWrapBreakBeforeCharacters',
    wordWrapBreakAfterCharacters: 'wordWrapBreakAfterCharacters',
    wrappingIndent: 'wrappingIndent',
    wrappingStrategy: 'wrappingStrategy',
    indentSize: 'indentSize',
    detectIndentation: 'detectIndentation',
    trimAutoWhitespace: 'trimAutoWhitespace',
    ignoreEmptyLines: 'ignoreEmptyLines',
    renderWhitespace: 'renderWhitespace',
    folding: 'folding',
    foldingStrategy: 'foldingStrategy',
    showFoldingControls: 'showFoldingControls',
    unfoldOnClickAfterEndOfLine: 'unfoldOnClickAfterEndOfLine',
    renderLineHighlight: 'renderLineHighlight',
    renderLineHighlightOnlyWhenFocus: 'renderLineHighlightOnlyWhenFocus',
    selectOnLineNumbers: 'selectOnLineNumbers',
    glyphMargin: 'glyphMargin',
    largeFileOptimizations: 'largeFileOptimizations',
    maxTokenizationLineLength: 'maxTokenizationLineLength',
    smoothScrolling: 'smoothScrolling',
    cursorBlinking: 'cursorBlinking',
    cursorSmoothCaretAnimation: 'cursorSmoothCaretAnimation',
    dragAndDrop: 'dragAndDrop',
    scrollBeyondLastLine: 'scrollBeyondLastLine',
    mouseWheelScrollSensitivity: 'mouseWheelScrollSensitivity',
    readOnly: 'readOnly',
    domReadOnly: 'domReadOnly',
    emptySelectionClipboard: 'emptySelectionClipboard',
    copyWithSyntaxHighlighting: 'copyWithSyntaxHighlighting',
    multiCursorModifier: 'multiCursorModifier',
    multiCursorPaste: 'multiCursorPaste',
    fixedOverflowWidgets: 'fixedOverflowWidgets',
    ariaLabel: 'ariaLabel',
    fontLigatures: 'fontLigatures',
    fontVariations: 'fontVariations',
    letterSpacing: 'letterSpacing',
    lineHeight: 'lineHeight',
    cursorStyle: 'cursorStyle',
    cursorWidth: 'cursorWidth',
    cursorSurroundingLines: 'cursorSurroundingLines',
    cursorSurroundingLinesStyle: 'cursorSurroundingLinesStyle',
    cursorSurroundingLineColumns: 'cursorSurroundingLineColumns',
    stopRenderingLineAfter: 'stopRenderingLineAfter',
    quickSuggestions: 'quickSuggestions',
    quickSuggestionsDelay: 'quickSuggestionsDelay',
    suggestOnTriggerCharacters: 'suggestOnTriggerCharacters',
    acceptSuggestionOnEnter: 'acceptSuggestionOnEnter',
    acceptSuggestionOnCommitCharacter: 'acceptSuggestionOnCommitCharacter',
    wordBasedSuggestions: 'wordBasedSuggestions',
    wordBasedSuggestionsOnlySameLanguage: 'wordBasedSuggestionsOnlySameLanguage',
    suggestSelection: 'suggestSelection',
    parameterHints: 'parameterHints',
    tabCompletion: 'tabCompletion',
    snippetSuggestions: 'snippetSuggestions',
    autoClosingBrackets: 'autoClosingBrackets',
    autoClosingQuotes: 'autoClosingQuotes',
    autoClosingOvertype: 'autoClosingOvertype',
    autoSurround: 'autoSurround',
    commentMultiLine: 'commentMultiLine',
    commentInline: 'commentInline',
    formatOnPaste: 'formatOnPaste',
    formatOnType: 'formatOnType',
    autoClosingComments: 'autoClosingComments',
    autoIndent: 'autoIndent',
    autoIndentOnPaste: 'autoIndentOnPaste',
    renderIndentGuides: 'renderIndentGuides',
    highlightActiveIndentGuide: 'highlightActiveIndentGuide',
    rulers: 'rulers',
    guides: 'guides',
    renderControlCharacters: 'renderControlCharacters',
    foldingImportsByDefault: 'foldingImportsByDefault',
    foldingMaximumRegions: 'foldingMaximumRegions',
    rangeHighlight: 'rangeHighlight',
    hover: 'hover',
    stickyTabStops: 'stickyTabStops',
    gotoLocation: 'gotoLocation',
    scrollBeyondLastColumn: 'scrollBeyondLastColumn',
    scrollPredominantAxis: 'scrollPredominantAxis',
    alwaysConsumeMouseWheel: 'alwaysConsumeMouseWheel',
    hideHorizontalScrollbar: 'hideHorizontalScrollbar',
    scrollbar: 'scrollbar',
    horizontalScrollbarSize: 'horizontalScrollbarSize',
    verticalScrollbarSize: 'verticalScrollbarSize',
    arrowSize: 'arrowSize',
    useShadows: 'useShadows',
    matchBrackets: 'matchBrackets',
    matchingBrackets: 'matchingBrackets',
    showAdjustSettingTip: 'showAdjustSettingTip',
    editable: 'editable',
    suggestFontSize: 'suggestFontSize',
    suggestLineHeight: 'suggestLineHeight',
    suggestPreview: 'suggestPreview',
    inlineSuggest: 'inlineSuggest',
    find: 'find',
    originalEditable: 'originalEditable',
    renderSideBySide: 'renderSideBySide',
    renderMarginRevertIcon: 'renderMarginRevertIcon',
    renderIndicators: 'renderIndicators',
    ignoreTrimWhitespace: 'ignoreTrimWhitespace',
    maxComputationTime: 'maxComputationTime',
    useInlineViewWhenSpaceIsLimited: 'useInlineViewWhenSpaceIsLimited',
    compactMode: 'compactMode',
    comments: 'comments',
    renderFinalNewline: 'renderFinalNewline',
    codeLens: 'codeLens',
    codeLensFontFamily: 'codeLensFontFamily',
    codeLensFontSize: 'codeLensFontSize',
    lineDecorationsWidth: 'lineDecorationsWidth',
    lineNumbersMinChars: 'lineNumbersMinChars',
    revealHorizontalRightPadding: 'revealHorizontalRightPadding',
    overviewRulerBorder: 'overviewRulerBorder',
    overviewRulerLanes: 'overviewRulerLanes',
    hideCursorInOverviewRuler: 'hideCursorInOverviewRuler',
    maximizedScrollbar: 'maximizedScrollbar',
    bracketPairColorization: 'bracketPairColorization',
    fastScrollSensitivity: 'fastScrollSensitivity',
    unfoldOnClick: 'unfoldOnClickAfterEndOfLine',
    renderValidationDecorations: 'renderValidationDecorations',
    occurrencesHighlight: 'occurrencesHighlight',
    selectionHighlight: 'selectionHighlight',
    links: 'links',
    linkDetection: 'linkDetection',
    colorDecorators: 'colorDecorators',
    decorators: 'decorators',
    unicodeHighlight: 'unicodeHighlight',
    stickyScroll: 'stickyScroll',
    accessibilitySupport: 'accessibilitySupport',
    screenReaderAnnounceInlineSuggestions: 'screenReaderAnnounceInlineSuggestions'
}

export function updateEditorOption(
    editor: monaco.editor.IStandaloneCodeEditor,
    key: string,
    value: any
): void {
    const optionKey = EditorOptionMaps[key]
    if (!optionKey) {
        console.warn(`未知的配置项: ${key}`)
        return
    }

    if (key === 'minimap') {
        editor.updateOptions({ minimap: { enabled: value } })
    } else if (key === 'rulers') {
        const rulersArray = value
            ? value.split(',').map((v: string) => parseInt(v.trim())).filter((v: number) => !isNaN(v))
            : []
        editor.updateOptions({ rulers: rulersArray })
    } else if (key === 'guides') {
        if (typeof value === 'object' && value !== null) {
            editor.updateOptions({ guides: value })
        } else {
            editor.updateOptions({
                guides: {
                    indentation: !!value,
                    bracketPairs: false,
                    highlightActiveIndentation: false
                }
            })
        }
    } else {
        editor.updateOptions({ [optionKey]: value })
    }

}

export function updateEditorOptions(
    editor: monaco.editor.IStandaloneCodeEditor,
    settings: any
): void {
    const options: any = {}
    for (const [key, value] of Object.entries(settings)) {
        const optionKey = EditorOptionMaps[key]
        if (!optionKey) {
            console.warn(`未知的配置项: ${key}`)
            continue
        }

        if (key === 'minimap') {
            options.minimap = { enabled: !!value }
        } else if (key === 'rulers') {
            if (typeof value === 'string') {
                options.rulers = value
                    ? value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v))
                    : []
            } else if (Array.isArray(value)) {
                options.rulers = value
            } else {
                options.rulers = []
            }
        } else if (key === 'guides') {
            if (typeof value === 'object' && value !== null) {
                options.guides = value
            } else {
                options.guides = { indentation: !!value, bracketPairs: false, highlightActiveIndentation: !!value }
            }
        } else if (key === 'bracketPairColorization') {
            if (typeof value === 'object' && value !== null) {
                options.bracketPairColorization = value
            } else {
                options.bracketPairColorization = { enabled: !!value }
            }
        } else if (key === 'unicodeHighlight') {
            if (typeof value === 'object' && value !== null) {
                options.unicodeHighlight = value
            }
        } else if (key === 'stickyScroll') {
            if (typeof value === 'object' && value !== null) {
                options.stickyScroll = value
            } else {
                options.stickyScroll = { enabled: !!value }
            }
        } else if (key === 'quickSuggestions') {
            if (typeof value === 'boolean') {
                options.quickSuggestions = { other: value, comments: value, strings: value }
            } else if (typeof value === 'object' && value !== null) {
                options.quickSuggestions = value
            }
        } else if (key === 'occurrencesHighlight') {
            if (typeof value === 'boolean') {
                options.occurrencesHighlight = value ? 'singleFile' : 'off'
            } else {
                options.occurrencesHighlight = value
            }
        } else if (key === 'selectionHighlight') {
            if (typeof value === 'boolean') {
                options.selectionHighlight = value ? 'always' : 'never'
            } else {
                options.selectionHighlight = value
            }
        } else if (key === 'renderIndentGuides') {
            if (!options.guides) options.guides = {}
            options.guides.indentation = !!value
        } else if (key === 'highlightActiveIndentGuide') {
            if (!options.guides) options.guides = {}
            options.guides.highlightActiveIndentation = !!value
        } else if (key === 'unfoldOnClick') {
            options.unfoldOnClickAfterEndOfLine = !!value
        } else if (key === 'showAdjustSettingTip') {
            if (!options.hover) options.hover = {}
            options.hover.enabled = !!value
        } else {
            options[optionKey] = value
        }
    }

    editor.updateOptions(options)
}
