import * as monaco from 'monaco-editor'

export function UpdateLineNumber(editor: monaco.editor.IStandaloneCodeEditor) {
    const showLine = editor.getOption(monaco.editor.EditorOption.lineNumbers)
    if (showLine.renderType) {
        editor.updateOptions({ lineNumbers: 'off' })
    } else {
        editor.updateOptions({ lineNumbers: 'on' })
    }
}

export function UpdateEditorTheme(_, newTheme: string) {
    monaco.editor.setTheme(newTheme)
}

export function UpdateTableSize(editor: monaco.editor.IStandaloneCodeEditor, newSize: number) {
    editor.updateOptions({ tabIndex: newSize })
}

export function UpdateFontSize(editor: monaco.editor.IStandaloneCodeEditor, newSize: number) {
    editor.updateOptions({ fontSize: newSize })
}

export function UpdateRenderWhitespace(editor: monaco.editor.IStandaloneCodeEditor) {
    const whiteSpace = editor.getOption(monaco.editor.EditorOption.renderWhitespace)
    if (whiteSpace === 'all') {
        editor.updateOptions({ renderWhitespace: 'none' })
    } else {
        editor.updateOptions({ renderWhitespace: 'all' })
    }
}

export const MonacoEditorOpMaps = {
    lineNumbers: UpdateLineNumber,
    theme: UpdateEditorTheme,
    tabSize: UpdateTableSize,
    fontSize: UpdateFontSize,
    renderWhitespace: UpdateRenderWhitespace
}
