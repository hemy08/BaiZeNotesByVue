/**
 * P0：可视化表格编辑宿主。
 *
 * 光标位于 GFM 表格内时，点击工具栏「插入表格」会打开网格编辑器；否则返回 false，
 * 由调用方回退到原有插入表格对话框。
 */
import { createApp, type App } from 'vue'
import * as monaco from 'monaco-editor'
import { getActiveEditor } from '../../../../common/active-editor'
import { logger } from '../../../../common/logger'
import { parseMarkdownTableAtOffset } from '../../../Markdown/table-markdown'
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

/**
 * 打开当前光标所在表格的可视化编辑器。
 * @returns true 已打开；false 当前光标不在表格内（调用方回退插入对话框）
 */
export async function openTableEditorForActiveEditor(): Promise<boolean> {
    const editor = getActiveEditor()
    const model = editor?.getModel()
    if (!editor || !model) {
        return false
    }
    const selection = editor.getSelection()
    const position = selection?.getStartPosition() ?? editor.getPosition()
    if (!position) {
        return false
    }
    const table = parseMarkdownTableAtOffset(model.getValue(), model.getOffsetAt(position))
    if (!table) {
        return false
    }

    disposeHost()
    const container = document.createElement('div')
    container.id = HOST_ID
    document.body.appendChild(container)

    const apply = (markdown: string): void => {
        const startLine = table.startLine + 1
        const endLine = table.endLine + 1
        const range = new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine))
        editor.executeEdits('table-editor', [{ range, text: markdown, forceMoveMarkers: true }])
        disposeHost()
    }
    const close = (): void => disposeHost()

    try {
        const app = createApp(TableEditorDialog, { table, onApply: apply, onClose: close })
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

/** 测试/页面卸载时释放宿主（幂等） */
export function disposeTableEditorHost(): void {
    disposeHost()
}
