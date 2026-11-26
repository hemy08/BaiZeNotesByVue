/**
 * P0：统一表格编辑宿主。
 *
 * - 光标位于 GFM 表格内：打开 edit 模式，应用后替换当前表格；
 * - 光标不在表格内：打开 insert 模式（空白 3×3），应用后在光标处插入 Markdown 表格。
 *
 * 工具栏、菜单栏和源码右键菜单都复用本宿主，不再使用旧「插入表格」对话框。
 */
import { createApp, type App } from 'vue'
import * as monaco from 'monaco-editor'
import { getActiveEditor } from '../../../../common/active-editor'
import { logger } from '../../../../common/logger'
import {
    createEmptyTable,
    parseMarkdownTableAtOffset,
    type MarkdownTable
} from '../../../Markdown/table-markdown'
import TableEditorDialog from './TableEditorDialog.vue'

const HOST_ID = 'baize-table-editor-host'
let hostApp: App | null = null
let hostContainer: HTMLElement | null = null

function disposeHost(): void {
    if (hostApp) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[TableEditor] 卸载表格编辑器失败', error)
        }
        hostApp = null
    }
    if (hostContainer) {
        hostContainer.remove()
        hostContainer = null
    }
}

/** 在光标处插入表格，并尽量保证表格前后是独立块 */
function insertTableAtCursor(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    markdown: string
): void {
    const selection = editor.getSelection()
    const position = selection?.getStartPosition() ?? editor.getPosition()
    if (!position) {
        return
    }
    const lineContent = model.getLineContent(position.lineNumber)
    const before = lineContent.slice(0, Math.max(0, position.column - 1))
    const after = lineContent.slice(Math.max(0, position.column - 1))
    const prefix = before.trim() ? '\n\n' : ''
    const suffix = after.trim() ? '\n\n' : '\n'
    const insertion = `${prefix}${markdown}${suffix}`
    const range = new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column
    )
    editor.executeEdits('table-editor-insert', [{ range, text: insertion, forceMoveMarkers: true }])
    // 光标移到表格末尾，方便继续书写
    const insertedLines = insertion.split('\n').length - 1
    editor.setPosition({
        lineNumber: position.lineNumber + insertedLines,
        column: 1
    })
    editor.focus()
}

/**
 * 打开指定编辑器的统一表格编辑器。
 * @returns true 已打开；false 编辑器不可用
 */
export async function openTableEditorForEditor(
    editor: monaco.editor.IStandaloneCodeEditor
): Promise<boolean> {
    const model = editor.getModel()
    if (!model) {
        return false
    }
    const selection = editor.getSelection()
    const position = selection?.getStartPosition() ?? editor.getPosition()
    if (!position) {
        return false
    }
    const table = parseMarkdownTableAtOffset(model.getValue(), model.getOffsetAt(position))
    const mode: 'insert' | 'edit' = table ? 'edit' : 'insert'
    const initialTable: MarkdownTable = table ?? createEmptyTable(3, 3)
    if (!table) {
        logger.info('[TableEditor] 未检测到 GFM 表格，进入插入模式')
    }

    disposeHost()
    const container = document.createElement('div')
    container.id = HOST_ID
    document.body.appendChild(container)

    const apply = (markdown: string): void => {
        if (mode === 'edit' && table) {
            const startLine = table.startLine + 1
            const endLine = table.endLine + 1
            const range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine))
            editor.executeEdits('table-editor', [{ range, text: markdown, forceMoveMarkers: true }])
        } else {
            insertTableAtCursor(editor, model, markdown)
        }
        disposeHost()
    }
    const close = (): void => disposeHost()

    try {
        const app = createApp(TableEditorDialog, {
            mode,
            table: initialTable,
            onApply: apply,
            onClose: close
        })
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[TableEditor] 挂载表格编辑器失败', error)
        disposeHost()
        return false
    }
}

/** 工具栏/菜单入口：从当前活动编辑器打开统一表格编辑器 */
export async function openTableEditorForActiveEditor(): Promise<boolean> {
    const editor = getActiveEditor()
    return editor ? openTableEditorForEditor(editor) : false
}

/** 测试/页面卸载时释放宿主（幂等） */
export function disposeTableEditorHost(): void {
    disposeHost()
}
