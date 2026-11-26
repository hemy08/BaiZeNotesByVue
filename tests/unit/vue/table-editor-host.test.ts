// @vitest-environment jsdom
/**
 * P0：统一表格编辑宿主。
 * 光标在表格内 → edit；不在表格内 → insert；应用后分别替换/插入。
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
        getLineContent: (lineNumber: number) => text.split(/\r?\n/)[lineNumber - 1] ?? '',
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
        executeEdits,
        setPosition: vi.fn(),
        focus: vi.fn()
    }
    return { editor, executeEdits }
}

function clickButton(label: string): void {
    const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label
    )
    expect(button, `button ${label}`).toBeTruthy()
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

afterEach(() => {
    disposeTableEditorHost()
    clearActiveEditor()
    document.body.innerHTML = ''
})

describe('openTableEditorForActiveEditor 统一入口', () => {
    it('无活动编辑器返回 false', async () => {
        await expect(openTableEditorForActiveEditor()).resolves.toBe(false)
    })

    it('光标不在表格内打开插入模式，应用后插入 Markdown 表格', async () => {
        const { editor, executeEdits } = makeFakeEditor('正文', 0)
        setActiveEditor(editor as never)
        await expect(openTableEditorForActiveEditor()).resolves.toBe(true)
        expect(document.getElementById('baize-table-editor-host')).not.toBeNull()
        clickButton('插入表格')
        await nextTick()
        expect(executeEdits).toHaveBeenCalledTimes(1)
        const edit = executeEdits.mock.calls[0][1][0] as { text: string }
        expect(edit.text).toContain('| 列 1 | 列 2 | 列 3 |')
        expect(edit.text).toContain('| --- | --- | --- |')
        expect(document.getElementById('baize-table-editor-host')).toBeNull()
    })

    it('光标在表格内打开编辑模式，应用后替换表格', async () => {
        const text = '| A | B |\n| --- | --- |\n| 1 | 2 |'
        const { editor, executeEdits } = makeFakeEditor(text, 2)
        setActiveEditor(editor as never)
        await expect(openTableEditorForActiveEditor()).resolves.toBe(true)
        clickButton('应用修改')
        await nextTick()
        expect(executeEdits).toHaveBeenCalledTimes(1)
        const edit = executeEdits.mock.calls[0][1][0] as { text: string }
        expect(edit.text).toContain('| A | B |')
        expect(document.getElementById('baize-table-editor-host')).toBeNull()
    })
})
