import { OnInsertAfterCursor, replaceSelection } from './hemy-editor-common'
import * as monaco from 'monaco-editor'

function matchStartWith(
    str: string,
    matcher: { [Symbol.match](string: string): RegExpMatchArray | null }
): string | null {
    const match = str.match(matcher)
    return match ? match[0] : null
}

function EnterAction(editor: monaco.editor.IStandaloneCodeEditor) {
    // 获取鼠标当前位置
    const position = editor.getPosition()
    if (!position) return

    if (position.lineNumber <= 2) {
        OnInsertAfterCursor(editor, '\r\n')
        return
    }

    const model = editor.getModel()
    if (!model) return

    const content = model.getLineContent(position.lineNumber)
    // 获取上一行内容，如果是- [开头，插入\r\n- []()
    // 获取上一行内容，如果是- 开头，插入\r\n-
    const start_list = matchStartWith(content, /^\s*- /)
    const start_link = matchStartWith(content, /^\s*- \[/)
    let insertText = '\r\n'
    if (start_link != null) {
        if (start_link.length != content.length) {
            insertText = '\r\n' + start_link
        }
    } else if (start_list != null && start_list.length != content.length) {
        insertText = '\r\n' + start_list
    } else {
        insertText = '\r\n'
    }

    if (insertText != '\r\n') {
        OnInsertAfterCursor(editor, insertText)
    } else {
        replaceSelection(
            editor,
            '\r\n',
            true,
            new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            )
        )
    }
}

export function MonacoEditorAddActions(editor: monaco.editor.IStandaloneCodeEditor) {
    editor.addAction({
        id: 'hemy-custom-enter-action',
        label: 'Hemy Custom Enter Action',
        keybindings: [monaco.KeyCode.Enter], // 例如，绑定到 Shift + Enter
        // 回调函数
        run: EnterAction
    })
    editor.addAction({
        id: 'hemy-custom-contextmenu',
        label: 'Hemy Custom ContextMenu',
        contextMenuGroupId: 'navigation',
        // 回调函数
        run: (_editor, ...args) => {
            alert('args' + args)
        }
    })
}

export function LoadLocalScript() {
    // Monaco editor is loaded via ESM import, no need for dynamic script loading
}
