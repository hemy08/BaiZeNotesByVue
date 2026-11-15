import * as monaco from 'monaco-editor'

/**
 * Monaco 编辑器操作处理器统一签名（IPC EDITOR.UPDATE_OPTIONS 动态分发契约）。
 *
 * CQ-1：原先各处理器参数不一致（1 个或 2 个参数、第二个参数类型为 number 或 string），
 * 经 `MonacoEditorOpMaps[option]` 字符串索引分发时无法静态收敛（TS7053/TS7006）。
 * 这里统一为「编辑器实例 + 可选配置值」两参数签名，各处理器按需忽略不使用的参数。
 */
export type MonacoEditorOpHandler = (
    editor: monaco.editor.IStandaloneCodeEditor,
    value?: string | number
) => void

export function UpdateLineNumber(editor: monaco.editor.IStandaloneCodeEditor) {
    const showLine = editor.getOption(monaco.editor.EditorOption.lineNumbers)
    if (showLine.renderType) {
        editor.updateOptions({ lineNumbers: 'off' })
    } else {
        editor.updateOptions({ lineNumbers: 'on' })
    }
}

export function UpdateEditorTheme(
    _editor: monaco.editor.IStandaloneCodeEditor,
    newTheme?: string | number
) {
    // 主题名必须是非空字符串：菜单通道可能只下发选项名（无值），此时保持当前主题
    if (typeof newTheme === 'string' && newTheme.length > 0) {
        monaco.editor.setTheme(newTheme)
    }
}

export function UpdateTableSize(
    editor: monaco.editor.IStandaloneCodeEditor,
    newSize?: string | number
) {
    // IPC 载荷可能以字符串形式到达（结构化克隆自配置存储），统一转数值后再应用
    const tabSize = Number(newSize)
    if (!Number.isFinite(tabSize) || tabSize <= 0) {
        return
    }
    // FUN-28：原误写为 tabIndex（DOM 属性），应为 Monaco 的 tabSize 选项
    editor.updateOptions({ tabSize })
}

export function UpdateFontSize(
    editor: monaco.editor.IStandaloneCodeEditor,
    newSize?: string | number
) {
    const fontSize = Number(newSize)
    if (!Number.isFinite(fontSize) || fontSize <= 0) {
        return
    }
    editor.updateOptions({ fontSize })
}

export function UpdateRenderWhitespace(editor: monaco.editor.IStandaloneCodeEditor) {
    const whiteSpace = editor.getOption(monaco.editor.EditorOption.renderWhitespace)
    if (whiteSpace === 'all') {
        editor.updateOptions({ renderWhitespace: 'none' })
    } else {
        editor.updateOptions({ renderWhitespace: 'all' })
    }
}

export const MonacoEditorOpMaps: Record<string, MonacoEditorOpHandler> = {
    lineNumbers: UpdateLineNumber,
    theme: UpdateEditorTheme,
    tabSize: UpdateTableSize,
    fontSize: UpdateFontSize,
    renderWhitespace: UpdateRenderWhitespace
}
