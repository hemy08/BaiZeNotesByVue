// @vitest-environment jsdom
/**
 * P0：可视化表格编辑宿主（光标在表格内打开；应用后替换表格并清理宿主）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActiveEditor, clearActiveEditor } from '../../../src/renderer/src/common/active-editor'
import {
    disposeTableEditorHost,
    openTableEditorForActiveEditor
} from '../../../src/renderer/src/components/dialogs/medium/table-editor'

function makeFakeEditor(text: string, offset: number) {
    const executeEdits = vi.fn()
    const model = {
        getValue: () => text,
        getOffsetAt: () => offset,
        getLineMaxColumn: (lineNumber: number) => {
            const line = text.split(/\r?\n/)[lineNumber - 1] ?? ''
            return line.length + 1
        }
    }
    const editor = {
        getModel: () => model,
        getSelection: () => ({
            getStartPosition: () => ({ lineNumber: 1, column: 1 })
        }),
        getPosition: () => ({ lineNumber: 1, column: 1 }),
        executeEdits
    }
    return { editor, executeEdits }
}

afterEach(() => {
    disposeTableEditorHost()
    clearActiveEditor()
    document.body.innerHTML = ''
})

describe('openTableEditorForActiveEditor', () => {
    it('无活动编辑器/光标不在表格内返回 false', async () => {
        await expect(openTableEditorForActiveEditor()).resolves.toBe(false)
        const { editor } = makeFakeEditor('普通文本', 0)
        setActiveEditor(editor as never)
        await expect(openTableEditorForActiveEditor()).resolves.toBe(false)
    })

    it('光标在表格内打开宿主，应用后替换表格', async () => {
        const text = '| A | B |\n| --- | --- |\n| 1 | 2 |'
        const { editor, executeEdits } = makeFakeEditor(text, 2)
        setActiveEditor(editor as never)
        await expect(openTableEditorForActiveEditor()).resolves.toBe(true)
        expect(document.getElementById('baize-table-editor-host')).not.toBeNull()

        const applyButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === '应用'
        )
        expect(applyButton).toBeTruthy()
        applyButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        expect(executeEdits).toHaveBeenCalledTimes(1)
        const edit = executeEdits.mock.calls[0][1][0] as { text: string }
        expect(edit.text).toContain('| A | B |')
        expect(document.getElementById('baize-table-editor-host')).toBeNull()
    })
})
