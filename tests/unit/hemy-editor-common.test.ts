import { describe, it, expect, afterEach, vi } from 'vitest'

// 模拟 monaco-editor：提供 Range/Position 构造器，供被测代码创建范围对象
vi.mock('monaco-editor', () => {
    class MockRange {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
        constructor(sl: number, sc: number, el: number, ec: number) {
            this.startLineNumber = sl
            this.startColumn = sc
            this.endLineNumber = el
            this.endColumn = ec
        }
        static fromPositions(
            start: { lineNumber: number; column: number },
            end: { lineNumber: number; column: number }
        ) {
            return new MockRange(start.lineNumber, start.column, end.lineNumber, end.column)
        }
    }
    class MockPosition {
        lineNumber: number
        column: number
        constructor(lineNumber: number, column: number) {
            this.lineNumber = lineNumber
            this.column = column
        }
    }
    class MockSelection extends MockRange {
        constructor(sl: number, sc: number, el: number, ec: number) {
            super(sl, sc, el, ec)
        }
        getStartPosition() {
            return new MockPosition(this.startLineNumber, this.startColumn)
        }
        getEndPosition() {
            return new MockPosition(this.endLineNumber, this.endColumn)
        }
        isEmpty() {
            return (
                this.startLineNumber === this.endLineNumber && this.startColumn === this.endColumn
            )
        }
    }
    return { Range: MockRange, Position: MockPosition, Selection: MockSelection }
})

import {
    replaceSelection,
    OnInsertAfterCursor,
    EventHandleMaps,
    UpdateContextFormat,
    GetInlineMarkdownFormats
} from '../../src/renderer/src/components/Markdown/hemy-editor-common'

interface FakeSelection {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}

// 基于行数组构建简化版 monaco 模型（列号按 monaco 的 1 起始约定）
function makeLineModel(lines: string[]) {
    return {
        getLineContent: (n: number) => lines[n - 1] ?? '',
        getLineMaxColumn: (n: number) => (lines[n - 1] ?? '').length + 1,
        getLineLength: (n: number) => (lines[n - 1] ?? '').length,
        getValue: () => lines.join('\n'),
        getOffsetAt: (position: { lineNumber: number; column: number }) => {
            let offset = 0
            for (let line = 1; line < position.lineNumber; line += 1) {
                offset += (lines[line - 1] ?? '').length + 1
            }
            return offset + Math.max(0, position.column - 1)
        },
        getPositionAt: (offset: number) => {
            let remaining = Math.max(0, offset)
            for (let line = 1; line <= lines.length; line += 1) {
                const length = (lines[line - 1] ?? '').length
                if (remaining <= length) {
                    return { lineNumber: line, column: remaining + 1 }
                }
                remaining -= length + 1
            }
            return { lineNumber: lines.length, column: (lines.at(-1) ?? '').length + 1 }
        },
        getValueInRange: (range: {
            startLineNumber: number
            startColumn: number
            endLineNumber: number
            endColumn: number
        }) => {
            if (range.startLineNumber === range.endLineNumber) {
                const line = lines[range.startLineNumber - 1] ?? ''
                return line.substring(
                    Math.max(0, range.startColumn - 1),
                    Math.max(0, range.endColumn - 1)
                )
            }
            let text = (lines[range.startLineNumber - 1] ?? '').substring(
                Math.max(0, range.startColumn - 1)
            )
            for (let l = range.startLineNumber + 1; l < range.endLineNumber; l++) {
                text += '\r\n' + (lines[l - 1] ?? '')
            }
            text +=
                '\r\n' +
                (lines[range.endLineNumber - 1] ?? '').substring(
                    0,
                    Math.max(0, range.endColumn - 1)
                )
            return text
        }
    }
}

// 给假选区补充 monaco Selection 的 isEmpty 方法
function withIsEmpty(selection: FakeSelection) {
    return {
        ...selection,
        getStartPosition: () => ({
            lineNumber: selection.startLineNumber,
            column: selection.startColumn
        }),
        getEndPosition: () => ({
            lineNumber: selection.endLineNumber,
            column: selection.endColumn
        }),
        isEmpty: () =>
            selection.startLineNumber === selection.endLineNumber &&
            selection.startColumn === selection.endColumn
    }
}

// 构造假编辑器：可配置光标位置、选区与模型行内容
function makeEditor(
    options: {
        lines?: string[]
        position?: { lineNumber: number; column: number } | null
        selection?: FakeSelection | null
    } = {}
) {
    const model = makeLineModel(options.lines ?? [''])
    const editor = {
        getSelection: vi.fn(() => (options.selection ? withIsEmpty(options.selection) : null)),
        getPosition: vi.fn(() => options.position ?? null),
        getModel: vi.fn(() => model),
        executeEdits: vi.fn(),
        setSelection: vi.fn()
    }
    return { editor, model }
}

// 提取最后一次 executeEdits 的编辑参数
function lastEdit(editor: { executeEdits: ReturnType<typeof vi.fn> }) {
    const call = editor.executeEdits.mock.calls.at(-1)!
    return call[1][0] as {
        range: {
            startLineNumber: number
            startColumn: number
            endLineNumber: number
            endColumn: number
        }
        text: string
        forceMoveMarkers: boolean
    }
}

describe('replaceSelection', () => {
    it('should replace the explicit range with the value and move markers', () => {
        const { editor } = makeEditor({ lines: ['hello'] })
        const range = {
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 4
        } as never
        replaceSelection(editor as never, 'xx', true, range)
        expect(editor.executeEdits).toHaveBeenCalledTimes(1)
        const edit = lastEdit(editor)
        expect(edit.text).toBe('xx')
        expect(edit.forceMoveMarkers).toBe(true)
        expect(edit.range).toEqual({
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 4
        })
    })

    it('should fall back to the current selection when no range is given', () => {
        const selection = {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 3
        }
        const { editor } = makeEditor({ lines: ['abc'], selection })
        replaceSelection(editor as never, 'z', false, null as never)
        const edit = lastEdit(editor)
        expect(edit.text).toBe('z')
        expect(edit.forceMoveMarkers).toBe(false)
        expect(edit.range).toEqual({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 3
        })
    })

    it('should do nothing when neither range nor selection exists', () => {
        const { editor } = makeEditor({ lines: ['abc'], selection: null })
        replaceSelection(editor as never, 'z', false, null as never)
        expect(editor.executeEdits).not.toHaveBeenCalled()
    })
})

describe('OnInsertAfterCursor', () => {
    it('should insert text at the cursor position', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        OnInsertAfterCursor(editor as never, '**')
        const edit = lastEdit(editor)
        expect(edit.text).toBe('**')
        expect(edit.range).toEqual({
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 2
        })
    })

    it('should do nothing without a cursor position', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: null })
        OnInsertAfterCursor(editor as never, '**')
        expect(editor.executeEdits).not.toHaveBeenCalled()
    })
})

describe('EventHandleMaps header conversion', () => {
    it('should add a level-1 header to a plain line', () => {
        const { editor } = makeEditor({
            lines: ['标题'],
            position: { lineNumber: 1, column: 1 }
        })
        EventHandleMaps.h1(editor as never)
        const edit = lastEdit(editor)
        expect(edit.text).toBe('# 标题')
        expect(edit.range.startColumn).toBe(0)
        expect(edit.range.endColumn).toBe(3)
        expect(edit.forceMoveMarkers).toBe(true)
    })

    it('should replace an existing different-level header', () => {
        const { editor } = makeEditor({
            lines: ['## 标题'],
            position: { lineNumber: 1, column: 1 }
        })
        EventHandleMaps.h1(editor as never)
        expect(lastEdit(editor).text).toBe('# 标题')
    })

    it('should remove the header when the level is the same', () => {
        const { editor } = makeEditor({
            lines: ['## 标题'],
            position: { lineNumber: 1, column: 1 }
        })
        EventHandleMaps.h2(editor as never)
        expect(lastEdit(editor).text).toBe('标题')
    })

    it('should upgrade a deeper header to the requested level', () => {
        const { editor } = makeEditor({
            lines: ['### 标题'],
            position: { lineNumber: 1, column: 1 }
        })
        EventHandleMaps.h2(editor as never)
        expect(lastEdit(editor).text).toBe('## 标题')
    })

    it('should build a level-6 header', () => {
        const { editor } = makeEditor({
            lines: ['标题'],
            position: { lineNumber: 1, column: 1 }
        })
        EventHandleMaps.h6(editor as never)
        expect(lastEdit(editor).text).toBe('###### 标题')
    })
})

describe('P0 内联格式状态（工具栏高亮）', () => {
    it('无模型/无选区时返回全 false，不抛错', () => {
        expect(GetInlineMarkdownFormats({ getModel: () => null } as never)).toEqual({
            bold: false,
            italic: false,
            strike: false,
            code: false
        })
        const { editor } = makeEditor({ lines: ['hello'], selection: null })
        expect(GetInlineMarkdownFormats(editor as never)).toEqual({
            bold: false,
            italic: false,
            strike: false,
            code: false
        })
    })

    it('能识别加粗/斜体/删除线/行内代码', () => {
        const cases: Array<[string, Record<string, boolean>]> = [
            ['**hello**', { bold: true, italic: false, strike: false, code: false }],
            ['*hello*', { bold: false, italic: true, strike: false, code: false }],
            ['~~hello~~', { bold: false, italic: false, strike: true, code: false }],
            ['`hello`', { bold: false, italic: false, strike: false, code: true }]
        ]
        for (const [line, expected] of cases) {
            const { editor } = makeEditor({
                lines: [line],
                selection: {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: line.length + 1
                }
            })
            expect(GetInlineMarkdownFormats(editor as never)).toEqual(expected)
        }
    })
})

describe('EventHandleMaps 其余格式处理器', () => {
    it('上标/下标/对齐/列表/公式块/链接等在选区上执行不抛错', () => {
        const { editor } = makeEditor({
            lines: ['text'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
        })
        const handlers = EventHandleMaps as unknown as Record<string, (target: unknown) => void>
        for (const key of [
            'fontsub',
            'alignleft',
            'aligncenter',
            'alignjustify',
            'alignright',
            'listbulleted',
            'lineenter',
            'mathblock',
            'linelinks'
        ]) {
            expect(() => handlers[key](editor)).not.toThrow()
        }
    })
})

describe('EventHandleMaps font formats', () => {
    it('should wrap a selection with bold markers', () => {
        const { editor } = makeEditor({
            lines: ['xx text yy'],
            selection: { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 8 }
        })
        EventHandleMaps.bold(editor as never)
        expect(lastEdit(editor).text).toBe('**text**')
    })

    it('should unwrap an already bold selection', () => {
        const { editor } = makeEditor({
            lines: ['**text**'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 }
        })
        EventHandleMaps.bold(editor as never)
        expect(lastEdit(editor).text).toBe('text')
    })

    it('should wrap the word at the cursor with bold markers when nothing is selected', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        EventHandleMaps.bold(editor as never)
        expect(lastEdit(editor).text).toBe('**ab**')
    })

    it('should turn a plain selection into italic', () => {
        const { editor } = makeEditor({
            lines: ['text'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
        })
        EventHandleMaps.italic(editor as never)
        expect(lastEdit(editor).text).toBe('*text*')
    })

    it('should upgrade a bold selection to bold-italic', () => {
        const { editor } = makeEditor({
            lines: ['**text**'],
            selection: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 7 }
        })
        EventHandleMaps.italic(editor as never)
        // 选区为粗体内部文字：斜体与粗体组合为粗斜体
        expect(lastEdit(editor).text).toBe('***text***')
    })

    it('should downgrade a bold-italic selection to italic', () => {
        const { editor } = makeEditor({
            lines: ['***text***'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 11 }
        })
        EventHandleMaps.italic(editor as never)
        expect(lastEdit(editor).text).toBe('**text**')
    })

    it('should remove italic markers from an italic selection', () => {
        const { editor } = makeEditor({
            lines: ['*text*'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 7 }
        })
        EventHandleMaps.italic(editor as never)
        expect(lastEdit(editor).text).toBe('text')
    })

    it('should wrap the word at the cursor with italic marker when nothing is selected', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        EventHandleMaps.italic(editor as never)
        expect(lastEdit(editor).text).toBe('*ab*')
    })

    it('should wrap a selection with strikethrough markers', () => {
        const { editor } = makeEditor({
            lines: ['text'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
        })
        EventHandleMaps.deleteline(editor as never)
        expect(lastEdit(editor).text).toBe('~~text~~')
    })

    it('should unwrap an already underlined selection', () => {
        const { editor } = makeEditor({
            lines: ['<u>text</u>'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 12 }
        })
        EventHandleMaps.underline(editor as never)
        expect(lastEdit(editor).text).toBe('text')
    })

    it('should wrap a selection with superscript tags', () => {
        const { editor } = makeEditor({
            lines: ['text'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
        })
        EventHandleMaps.fontsuper(editor as never)
        expect(lastEdit(editor).text).toBe('<sup>text</sup>')
    })

    it('should wrap a selection with a code block', () => {
        const { editor } = makeEditor({
            lines: ['text'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
        })
        EventHandleMaps.codeblock(editor as never)
        expect(lastEdit(editor).text).toBe('\r\n```\r\ntext\r\n```\r\n')
    })
})

describe('EventHandleMaps quote and inserts', () => {
    it('should prefix each selected line except the last with a quote marker', () => {
        const { editor } = makeEditor({
            lines: ['aaa', 'bbb', 'ccc'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 }
        })
        EventHandleMaps.fontquote(editor as never)
        expect(lastEdit(editor).text).toBe('> aaa\r\n> bbb\r\n')
    })

    it('should insert a quote marker at the cursor when nothing is selected', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        EventHandleMaps.fontquote(editor as never)
        expect(lastEdit(editor).text).toBe('> ')
    })

    it('should insert a numbered list prefix at the cursor', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        EventHandleMaps.listnumbered(editor as never)
        expect(lastEdit(editor).text).toBe('\r\n1. ')
    })

    it('should insert a task list prefix at the cursor', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        EventHandleMaps.tasklists(editor as never)
        expect(lastEdit(editor).text).toBe('\r\n- [ ]')
    })

    it('should insert a horizontal rule prefix at the cursor', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        EventHandleMaps.linescan(editor as never)
        expect(lastEdit(editor).text).toBe('\r\n\r\n---------------\r\n\r\n')
    })

    it('should replace the selection with the pasted content', () => {
        const { editor } = makeEditor({
            lines: ['abc'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 }
        })
        EventHandleMaps.paste(editor as never, 'pasted')
        const edit = lastEdit(editor)
        expect(edit.text).toBe('pasted')
        expect(edit.forceMoveMarkers).toBe(true)
    })
})

describe('EventHandleMaps insertimage', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('should forward the image context to the electron renderer', () => {
        const send = vi.fn()
        vi.stubGlobal('window', { electron: { ipcRenderer: { send } } })

        EventHandleMaps.insertimage('data:image/png;base64,xxx')

        expect(send).toHaveBeenCalledWith('baize:render:insert-image', 'data:image/png;base64,xxx')
    })
})

describe('UpdateContextFormat', () => {
    it('should dispatch case-insensitively to the matching handler', () => {
        const { editor } = makeEditor({
            lines: ['text'],
            selection: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
        })
        UpdateContextFormat(editor as never, 'BOLD')
        expect(lastEdit(editor).text).toBe('**text**')
    })

    it('should do nothing for an unknown style', () => {
        const { editor } = makeEditor({ lines: ['ab'], position: { lineNumber: 1, column: 2 } })
        UpdateContextFormat(editor as never, 'no-such-style')
        expect(editor.executeEdits).not.toHaveBeenCalled()
    })
})
