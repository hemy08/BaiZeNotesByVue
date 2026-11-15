import { describe, it, expect, vi } from 'vitest'

// 模拟 monaco-editor（该模块仅用于类型标注，运行时不引用）
vi.mock('monaco-editor', () => ({}))

import {
    MonacoEditorOptions,
    MonacoEditorOverride
} from '../../src/renderer/src/components/Markdown/editor-options'

describe('MonacoEditorOptions', () => {
    it('should configure the markdown editor basics', () => {
        expect(MonacoEditorOptions.value).toBe('')
        expect(MonacoEditorOptions.language).toBe('markdown')
        expect(MonacoEditorOptions.theme).toBe('default')
        expect(MonacoEditorOptions.automaticLayout).toBe(false)
    })

    it('should set wrapping, indent and font defaults', () => {
        expect(MonacoEditorOptions.wordWrap).toBe('on')
        expect(MonacoEditorOptions.tabSize).toBe(4)
        expect(MonacoEditorOptions.fontFamily).toBe('Hack')
        // FUN-28：默认值已与主进程 editor-setting.ts 的 defaultEditorSetting 统一（15）
        expect(MonacoEditorOptions.fontSize).toBe(15)
        expect(MonacoEditorOptions.lineNumbers).toBe('on')
        expect(MonacoEditorOptions.lineNumbersMinChars).toBe(3)
        expect(MonacoEditorOptions.tabCompletion).toBe('off')
        expect(MonacoEditorOptions.renderWhitespace).toBe('all')
    })

    it('should disable the minimap with a 120 column cap', () => {
        expect(MonacoEditorOptions.minimap).toEqual({
            enabled: false,
            renderCharacters: false,
            maxColumn: 120
        })
    })

    it('should relax unicode highlighting and disable inline suggest', () => {
        expect(MonacoEditorOptions.unicodeHighlight).toEqual({
            ambiguousCharacters: false,
            nonBasicASCII: false,
            includeStrings: true
        })
        expect(MonacoEditorOptions.inlineSuggest).toEqual({ enabled: false })
    })

    it('should configure the find widget behaviour', () => {
        expect(MonacoEditorOptions.find).toEqual({
            addExtraSpaceOnTop: true,
            autoFindInSelection: 'multiline',
            seedSearchStringFromSelection: 'selection',
            cursorMoveOnType: true,
            loop: true
        })
    })

    it('should configure quick suggestions and word based suggestions', () => {
        expect(MonacoEditorOptions.quickSuggestions).toEqual({
            other: true,
            comments: false,
            strings: false
        })
        expect(MonacoEditorOptions.suggestSelection).toBe('first')
        expect(MonacoEditorOptions.wordBasedSuggestions).toBe('off')
    })

    it('should configure the scrollbar details', () => {
        expect(MonacoEditorOptions.scrollbar).toEqual({
            vertical: 'visible',
            horizontal: 'visible',
            verticalScrollbarSize: 14,
            horizontalScrollbarSize: 12,
            arrowSize: 11,
            useShadows: true
        })
    })

    it('should set smooth scrolling, cursor and scrolling limits', () => {
        expect(MonacoEditorOptions.smoothScrolling).toBe(true)
        expect(MonacoEditorOptions.cursorBlinking).toBe('smooth')
        expect(MonacoEditorOptions.cursorSmoothCaretAnimation).toBe('on')
        expect(MonacoEditorOptions.mouseWheelScrollSensitivity).toBe(1)
        expect(MonacoEditorOptions.fastScrollSensitivity).toBe(5)
        expect(MonacoEditorOptions.scrollBeyondLastColumn).toBe(5)
        expect(MonacoEditorOptions.scrollPredominantAxis).toBe(true)
    })

    it('should hide minimap-adjacent UI but keep content links on', () => {
        expect(MonacoEditorOptions.hideCursorInOverviewRuler).toBe(true)
        expect(MonacoEditorOptions.overviewRulerBorder).toBe(false)
        expect(MonacoEditorOptions.overviewRulerLanes).toBe(1)
        expect(MonacoEditorOptions.links).toBe(true)
        expect(MonacoEditorOptions.colorDecorators).toBe(true)
        expect(MonacoEditorOptions.renderControlCharacters).toBe(false)
        // FUN-28：glyphMargin 已与 defaultEditorSetting 统一（true）
        expect(MonacoEditorOptions.glyphMargin).toBe(true)
        expect(MonacoEditorOptions.lineDecorationsWidth).toBe(0)
    })

    it('should configure hover and goto location behaviour', () => {
        expect(MonacoEditorOptions.hover).toEqual({ enabled: 'on', delay: 300, sticky: false })
        // FUN-28：stickyTabStops 已与 defaultEditorSetting 统一（false）
        expect(MonacoEditorOptions.stickyTabStops).toBe(false)
        expect(MonacoEditorOptions.gotoLocation).toEqual({
            multiple: 'goto',
            multipleDefinitions: 'goto',
            multipleImplementations: 'goto',
            multipleReferences: 'goto',
            multipleTypeDefinitions: 'goto'
        })
        expect(MonacoEditorOptions.codeLens).toBe(false)
        expect(MonacoEditorOptions.codeLensFontFamily).toBe('')
        expect(MonacoEditorOptions.codeLensFontSize).toBe(0)
    })

    it('should configure highlight and rendering toggles', () => {
        expect(MonacoEditorOptions.occurrencesHighlight).toBe('singleFile')
        expect(MonacoEditorOptions.selectionHighlight).toBe(true)
        expect(MonacoEditorOptions.bracketPairColorization).toEqual({ enabled: true })
        expect(MonacoEditorOptions.renderFinalNewline).toBe('on')
        expect(MonacoEditorOptions.foldingImportsByDefault).toBe(false)
    })

    it('should keep the editor editable with sane clipboard defaults', () => {
        expect(MonacoEditorOptions.readOnly).toBe(false)
        expect(MonacoEditorOptions.domReadOnly).toBe(false)
        expect(MonacoEditorOptions.emptySelectionClipboard).toBe(true)
        expect(MonacoEditorOptions.copyWithSyntaxHighlighting).toBe(true)
        expect(MonacoEditorOptions.multiCursorModifier).toBe('alt')
        expect(MonacoEditorOptions.multiCursorPaste).toBe('spread')
        expect(MonacoEditorOptions.fixedOverflowWidgets).toBe(false)
    })

    it('should set the accessibility label in Chinese', () => {
        expect(MonacoEditorOptions.ariaLabel).toBe('白泽笔记编辑器')
        expect(MonacoEditorOptions.accessibilitySupport).toBe('auto')
    })

    it('should limit large file optimizations', () => {
        expect(MonacoEditorOptions.largeFileOptimizations).toBe(true)
        expect(MonacoEditorOptions.maxTokenizationLineLength).toBe(10000)
        expect(MonacoEditorOptions.foldingMaximumRegions).toBe(5000)
        // FUN-28：renderLineHighlight/foldingStrategy 已与 defaultEditorSetting 统一
        expect(MonacoEditorOptions.renderLineHighlight).toBe('all')
        expect(MonacoEditorOptions.scrollBeyondLastLine).toBe(false)
        expect(MonacoEditorOptions.folding).toBe(true)
        expect(MonacoEditorOptions.foldingStrategy).toBe('auto')
    })
})

describe('MonacoEditorOverride', () => {
    it('should be an empty override services object', () => {
        expect(MonacoEditorOverride).toEqual({})
        expect(Object.keys(MonacoEditorOverride)).toHaveLength(0)
    })
})
