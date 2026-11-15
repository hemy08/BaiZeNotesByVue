import { describe, it, expect, beforeEach, vi } from 'vitest'

// 模拟 monaco-editor：编辑器相关函数只依赖 updateOptions 等接口，
// 通过假模块让映射逻辑在 node 环境下可测
vi.mock('monaco-editor', () => ({
    editor: {},
    languages: {
        register: vi.fn(),
        setMonarchTokensProvider: vi.fn(),
        setLanguageConfiguration: vi.fn()
    }
}))

import {
    EditorOptionMaps,
    updateEditorOption,
    updateEditorOptions
} from '../../src/renderer/src/components/Markdown/editor-option-maps'

// 构造一个记录 updateOptions 调用的假编辑器
function makeEditor() {
    return { updateOptions: vi.fn() }
}

describe('EditorOptionMaps', () => {
    it('should map the well-known option keys to monaco option names', () => {
        expect(EditorOptionMaps.wordWrap).toBe('wordWrap')
        expect(EditorOptionMaps.minimap).toBe('minimap.enabled')
        expect(EditorOptionMaps.lineNumbers).toBe('lineNumbers')
        expect(EditorOptionMaps.fontSize).toBe('fontSize')
        expect(EditorOptionMaps.fontFamily).toBe('fontFamily')
        expect(EditorOptionMaps.tabSize).toBe('tabSize')
        expect(EditorOptionMaps.insertSpaces).toBe('insertSpaces')
        expect(EditorOptionMaps.lineHeight).toBe('lineHeight')
        expect(EditorOptionMaps.ariaLabel).toBe('ariaLabel')
    })

    it('should keep every mapped value a non-empty string', () => {
        for (const [key, value] of Object.entries(EditorOptionMaps)) {
            expect(typeof value, `${key} 的映射值应为字符串`).toBe('string')
            expect(value.length, `${key} 的映射值不应为空`).toBeGreaterThan(0)
        }
    })

    it('should map unfoldOnClick to the same option as unfoldOnClickAfterEndOfLine', () => {
        // 两个键指向同一 monaco 选项（该选项在 monaco 中已改名）
        expect(EditorOptionMaps.unfoldOnClick).toBe(EditorOptionMaps.unfoldOnClickAfterEndOfLine)
    })

    it('should only rename a few keys while keeping identity for the rest', () => {
        // 除少数键外，其余键名与 monaco 选项名保持一致
        const renamed = Object.entries(EditorOptionMaps).filter(([k, v]) => k !== v)
        const renamedKeys = renamed.map(([k]) => k).sort()
        expect(renamedKeys).toEqual(['minimap', 'unfoldOnClick'])
    })
})

describe('updateEditorOption', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('should warn and skip unknown option keys', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const editor = makeEditor()

        updateEditorOption(editor as never, 'not-a-real-key', 1)

        expect(warnSpy).toHaveBeenCalledWith('未知的配置项: not-a-real-key')
        expect(editor.updateOptions).not.toHaveBeenCalled()
    })

    it('should update a plain option with the given value', () => {
        const editor = makeEditor()
        updateEditorOption(editor as never, 'fontSize', 18)
        expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 18 })
    })

    it('should convert minimap to an object with enabled flag', () => {
        const editor = makeEditor()
        updateEditorOption(editor as never, 'minimap', true)
        expect(editor.updateOptions).toHaveBeenCalledWith({ minimap: { enabled: true } })

        const editor2 = makeEditor()
        updateEditorOption(editor2 as never, 'minimap', false)
        expect(editor2.updateOptions).toHaveBeenCalledWith({ minimap: { enabled: false } })
    })

    it('should parse a rulers string into numbers and drop invalid entries', () => {
        const editor = makeEditor()
        updateEditorOption(editor as never, 'rulers', '80, 120')
        expect(editor.updateOptions).toHaveBeenCalledWith({ rulers: [80, 120] })

        const editor2 = makeEditor()
        updateEditorOption(editor2 as never, 'rulers', '80, abc, , 120')
        expect(editor2.updateOptions).toHaveBeenCalledWith({ rulers: [80, 120] })
    })

    it('should treat an empty rulers value as an empty array', () => {
        const editor = makeEditor()
        updateEditorOption(editor as never, 'rulers', '')
        expect(editor.updateOptions).toHaveBeenCalledWith({ rulers: [] })

        const editor2 = makeEditor()
        updateEditorOption(editor2 as never, 'rulers', '  ')
        expect(editor2.updateOptions).toHaveBeenCalledWith({ rulers: [] })
    })

    it('should pass a guides object through unchanged', () => {
        const editor = makeEditor()
        const guides = { indentation: true, bracketPairs: true, highlightActiveIndentation: true }
        updateEditorOption(editor as never, 'guides', guides)
        expect(editor.updateOptions).toHaveBeenCalledWith({ guides })
    })

    it('should build a guides object from a boolean value', () => {
        const editor = makeEditor()
        updateEditorOption(editor as never, 'guides', true)
        expect(editor.updateOptions).toHaveBeenCalledWith({
            guides: { indentation: true, bracketPairs: false, highlightActiveIndentation: false }
        })
    })
})

describe('updateEditorOptions', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('should warn and skip unknown option keys while keeping valid ones', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const editor = makeEditor()

        updateEditorOptions(editor as never, { fontSize: 16, unknownKey: 1 })

        expect(warnSpy).toHaveBeenCalledWith('未知的配置项: unknownKey')
        expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 16 })
    })

    it('should merge multiple plain options into one update call', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, {
            fontSize: 16,
            fontFamily: 'Consolas',
            wordWrap: 'on'
        })
        expect(editor.updateOptions).toHaveBeenCalledTimes(1)
        expect(editor.updateOptions).toHaveBeenCalledWith({
            fontSize: 16,
            fontFamily: 'Consolas',
            wordWrap: 'on'
        })
    })

    it('should convert minimap to an enabled flag object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { minimap: false })
        expect(editor.updateOptions).toHaveBeenCalledWith({ minimap: { enabled: false } })
    })

    it('should convert a rulers string into an array', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { rulers: '80, 120' })
        expect(editor.updateOptions).toHaveBeenCalledWith({ rulers: [80, 120] })
    })

    it('should pass a rulers array through unchanged', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { rulers: [80, 120] })
        expect(editor.updateOptions).toHaveBeenCalledWith({ rulers: [80, 120] })
    })

    it('should treat a non-string rulers value as empty', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { rulers: 80 })
        expect(editor.updateOptions).toHaveBeenCalledWith({ rulers: [] })
    })

    it('should build a guides object from a boolean value', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { guides: true })
        expect(editor.updateOptions).toHaveBeenCalledWith({
            guides: { indentation: true, bracketPairs: false, highlightActiveIndentation: true }
        })
    })

    it('should pass a guides object through unchanged', () => {
        const editor = makeEditor()
        const guides = { indentation: true, bracketPairs: true, highlightActiveIndentation: true }
        updateEditorOptions(editor as never, { guides })
        expect(editor.updateOptions).toHaveBeenCalledWith({ guides })
    })

    it('should convert a bracketPairColorization boolean to an enabled object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { bracketPairColorization: false })
        expect(editor.updateOptions).toHaveBeenCalledWith({
            bracketPairColorization: { enabled: false }
        })
    })

    it('should pass a bracketPairColorization object through unchanged', () => {
        const editor = makeEditor()
        const value = { enabled: true, independentColorPoolPerBracketType: true }
        updateEditorOptions(editor as never, { bracketPairColorization: value })
        expect(editor.updateOptions).toHaveBeenCalledWith({ bracketPairColorization: value })
    })

    it('should pass a unicodeHighlight object through but ignore a boolean', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { unicodeHighlight: { allowedLocales: { zh: true } } })
        expect(editor.updateOptions).toHaveBeenCalledWith({
            unicodeHighlight: { allowedLocales: { zh: true } }
        })

        const editor2 = makeEditor()
        updateEditorOptions(editor2 as never, { unicodeHighlight: true })
        expect(editor2.updateOptions).toHaveBeenCalledWith({})
    })

    it('should convert a stickyScroll boolean to an enabled object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { stickyScroll: false })
        expect(editor.updateOptions).toHaveBeenCalledWith({ stickyScroll: { enabled: false } })
    })

    it('should pass a stickyScroll object through unchanged', () => {
        const editor = makeEditor()
        const value = { enabled: true, maxLineCount: 5 }
        updateEditorOptions(editor as never, { stickyScroll: value })
        expect(editor.updateOptions).toHaveBeenCalledWith({ stickyScroll: value })
    })

    it('should expand a quickSuggestions boolean to all suggestion kinds', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { quickSuggestions: true })
        expect(editor.updateOptions).toHaveBeenCalledWith({
            quickSuggestions: { other: true, comments: true, strings: true }
        })
    })

    it('should pass a quickSuggestions object through unchanged', () => {
        const editor = makeEditor()
        const value = { other: true, comments: false, strings: false }
        updateEditorOptions(editor as never, { quickSuggestions: value })
        expect(editor.updateOptions).toHaveBeenCalledWith({ quickSuggestions: value })
    })

    it('should map an occurrencesHighlight boolean to singleFile/off', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { occurrencesHighlight: true })
        expect(editor.updateOptions).toHaveBeenCalledWith({ occurrencesHighlight: 'singleFile' })

        const editor2 = makeEditor()
        updateEditorOptions(editor2 as never, { occurrencesHighlight: false })
        expect(editor2.updateOptions).toHaveBeenCalledWith({ occurrencesHighlight: 'off' })
    })

    it('should pass a string occurrencesHighlight value through unchanged', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { occurrencesHighlight: 'multiFile' })
        expect(editor.updateOptions).toHaveBeenCalledWith({ occurrencesHighlight: 'multiFile' })
    })

    it('should map a selectionHighlight boolean to always/never', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { selectionHighlight: true })
        expect(editor.updateOptions).toHaveBeenCalledWith({ selectionHighlight: 'always' })

        const editor2 = makeEditor()
        updateEditorOptions(editor2 as never, { selectionHighlight: false })
        expect(editor2.updateOptions).toHaveBeenCalledWith({ selectionHighlight: 'never' })
    })

    it('should pass a string selectionHighlight value through unchanged', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { selectionHighlight: 'all' })
        expect(editor.updateOptions).toHaveBeenCalledWith({ selectionHighlight: 'all' })
    })

    it('should write renderIndentGuides into the guides object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { renderIndentGuides: true })
        expect(editor.updateOptions).toHaveBeenCalledWith({ guides: { indentation: true } })
    })

    it('should write highlightActiveIndentGuide into the guides object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { highlightActiveIndentGuide: false })
        expect(editor.updateOptions).toHaveBeenCalledWith({
            guides: { highlightActiveIndentation: false }
        })
    })

    it('should merge renderIndentGuides and highlightActiveIndentGuide into one guides object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, {
            renderIndentGuides: true,
            highlightActiveIndentGuide: true
        })
        expect(editor.updateOptions).toHaveBeenCalledWith({
            guides: { indentation: true, highlightActiveIndentation: true }
        })
    })

    it('should write showAdjustSettingTip into the hover object', () => {
        const editor = makeEditor()
        updateEditorOptions(editor as never, { showAdjustSettingTip: true })
        expect(editor.updateOptions).toHaveBeenCalledWith({ hover: { enabled: true } })
    })
})
