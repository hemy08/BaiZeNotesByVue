import { describe, it, expect, beforeEach, vi } from 'vitest'

// 模拟 monaco-editor：仅需 EditorOption 常量与 setTheme 静态方法
vi.mock('monaco-editor', () => ({
    editor: {
        EditorOption: { lineNumbers: 101, renderWhitespace: 102 },
        setTheme: vi.fn()
    }
}))

import * as monaco from 'monaco-editor'
import {
    UpdateLineNumber,
    UpdateEditorTheme,
    UpdateTableSize,
    UpdateFontSize,
    UpdateRenderWhitespace,
    MonacoEditorOpMaps
} from '../../src/renderer/src/components/Markdown/editor-utils'

// 构造记录 updateOptions 调用的假编辑器
function makeEditor(getOptionResult: unknown) {
    return {
        getOption: vi.fn(() => getOptionResult),
        updateOptions: vi.fn()
    }
}

describe('UpdateLineNumber', () => {
    it('should turn line numbers off when renderType is set', () => {
        const editor = makeEditor({ renderType: 2 })
        UpdateLineNumber(editor as never)
        expect(editor.getOption).toHaveBeenCalledWith(monaco.editor.EditorOption.lineNumbers)
        expect(editor.updateOptions).toHaveBeenCalledWith({ lineNumbers: 'off' })
    })

    it('should turn line numbers on when renderType is missing', () => {
        const editor = makeEditor('on')
        UpdateLineNumber(editor as never)
        expect(editor.updateOptions).toHaveBeenCalledWith({ lineNumbers: 'on' })
    })
})

describe('UpdateEditorTheme', () => {
    beforeEach(() => {
        vi.mocked(monaco.editor.setTheme).mockClear()
    })

    it('should delegate the theme change to monaco', () => {
        UpdateEditorTheme(undefined as never, 'vs-dark')
        expect(monaco.editor.setTheme).toHaveBeenCalledWith('vs-dark')
    })
})

describe('UpdateTableSize', () => {
    it('should apply the tab size via the tabSize option', () => {
        const editor = makeEditor(null)
        UpdateTableSize(editor as never, 2)
        // FUN-28：原实现误写 tabIndex（DOM 属性），已修正为 Monaco 的 tabSize 选项
        expect(editor.updateOptions).toHaveBeenCalledWith({ tabSize: 2 })
    })
})

describe('UpdateFontSize', () => {
    it('should apply the font size option', () => {
        const editor = makeEditor(null)
        UpdateFontSize(editor as never, 20)
        expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 20 })
    })
})

describe('UpdateRenderWhitespace', () => {
    it('should switch from all to none', () => {
        const editor = makeEditor('all')
        UpdateRenderWhitespace(editor as never)
        expect(editor.getOption).toHaveBeenCalledWith(monaco.editor.EditorOption.renderWhitespace)
        expect(editor.updateOptions).toHaveBeenCalledWith({ renderWhitespace: 'none' })
    })

    it('should switch from any other value to all', () => {
        const editor = makeEditor('none')
        UpdateRenderWhitespace(editor as never)
        expect(editor.updateOptions).toHaveBeenCalledWith({ renderWhitespace: 'all' })
    })
})

describe('MonacoEditorOpMaps', () => {
    it('should map every operation name to its handler', () => {
        expect(MonacoEditorOpMaps.lineNumbers).toBe(UpdateLineNumber)
        expect(MonacoEditorOpMaps.theme).toBe(UpdateEditorTheme)
        expect(MonacoEditorOpMaps.tabSize).toBe(UpdateTableSize)
        expect(MonacoEditorOpMaps.fontSize).toBe(UpdateFontSize)
        expect(MonacoEditorOpMaps.renderWhitespace).toBe(UpdateRenderWhitespace)
        expect(Object.keys(MonacoEditorOpMaps).sort()).toEqual([
            'fontSize',
            'lineNumbers',
            'renderWhitespace',
            'tabSize',
            'theme'
        ])
    })
})
