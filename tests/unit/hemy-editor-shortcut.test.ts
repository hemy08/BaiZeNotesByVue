import { describe, it, expect, afterEach, vi } from 'vitest'

// 模拟 monaco-editor：提供 KeyMod/KeyCode 常量与 Range/Position 构造器
vi.mock('monaco-editor', () => {
    class MockRange {
        constructor(
            public startLineNumber: number,
            public startColumn: number,
            public endLineNumber: number,
            public endColumn: number
        ) {}
    }
    return {
        Range: MockRange,
        KeyMod: { CtrlCmd: 2048 },
        KeyCode: {
            Digit1: 30,
            Digit2: 31,
            Digit3: 32,
            Digit4: 33,
            Digit5: 34,
            Digit6: 35,
            KeyB: 40,
            KeyI: 41,
            KeyD: 42,
            KeyU: 43,
            KeyK: 44,
            KeyL: 45,
            KeyS: 46,
            KeyV: 47
        }
    }
})

import * as monaco from 'monaco-editor'
import EventBus from '../../src/renderer/src/common/event-bus/event-bus'
import {
    MonacoEditorKeyMaps,
    MonacoEditorDidChange
} from '../../src/renderer/src/components/Markdown/hemy-editor-shortcut'

interface RegisteredCommand {
    key: number
    handler: () => void | Promise<void>
}

// 构造记录 addCommand 的假编辑器
function makeEditor(
    options: {
        position?: { lineNumber: number; column: number } | null
        selection?: {
            startLineNumber: number
            startColumn: number
            endLineNumber: number
            endColumn: number
        } | null
    } = {}
) {
    const commands: RegisteredCommand[] = []
    const model = {
        getLineContent: (n: number) => (n === 1 ? '标题' : ''),
        getLineMaxColumn: (n: number) => (n === 1 ? 3 : 1)
    }
    const editor = {
        addCommand: vi.fn((key: number, handler: () => void) => {
            commands.push({ key, handler })
        }),
        getPosition: vi.fn(() => options.position ?? null),
        getSelection: vi.fn(() => options.selection ?? null),
        getModel: vi.fn(() => model),
        executeEdits: vi.fn(),
        setPosition: vi.fn(),
        onDidChangeCursorPosition: vi.fn()
    }
    return { editor, commands }
}

describe('MonacoEditorKeyMaps', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('should register 14 editor shortcuts', () => {
        const { editor, commands } = makeEditor()
        MonacoEditorKeyMaps(editor as never)
        expect(editor.addCommand).toHaveBeenCalledTimes(14)
        expect(commands).toHaveLength(14)
    })

    it('should register CtrlCmd+Digit1..6 for the six header levels', () => {
        const { editor, commands } = makeEditor()
        MonacoEditorKeyMaps(editor as never)

        const digitCodes = [
            monaco.KeyCode.Digit1,
            monaco.KeyCode.Digit2,
            monaco.KeyCode.Digit3,
            monaco.KeyCode.Digit4,
            monaco.KeyCode.Digit5,
            monaco.KeyCode.Digit6
        ]
        for (const code of digitCodes) {
            expect(
                commands.some((c) => c.key === (monaco.KeyMod.CtrlCmd | code)),
                `缺少 CtrlCmd+Digit${digitCodes.indexOf(code) + 1} 快捷键`
            ).toBe(true)
        }
    })

    it('should register CtrlCmd shortcuts for bold/italic/delete/underline/keyboard/link', () => {
        const { editor, commands } = makeEditor()
        MonacoEditorKeyMaps(editor as never)

        const codes = [
            monaco.KeyCode.KeyB,
            monaco.KeyCode.KeyI,
            monaco.KeyCode.KeyD,
            monaco.KeyCode.KeyU,
            monaco.KeyCode.KeyK,
            monaco.KeyCode.KeyL
        ]
        for (const code of codes) {
            expect(commands.some((c) => c.key === (monaco.KeyMod.CtrlCmd | code))).toBe(true)
        }
    })

    it('should emit the save event when CtrlCmd+S is pressed', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        const { editor, commands } = makeEditor()
        MonacoEditorKeyMaps(editor as never)

        const save = commands.find((c) => c.key === (monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS))
        expect(save).toBeDefined()
        save!.handler()

        expect(emitSpy).toHaveBeenCalledWith('monaco-editor-save-file-content-to-disk', true)
    })

    it('should paste clipboard text via CtrlCmd+V', async () => {
        vi.stubGlobal('navigator', {
            clipboard: {
                read: vi.fn(async () => []),
                readText: vi.fn(async () => 'hello clipboard')
            }
        })
        const { editor, commands } = makeEditor({
            position: { lineNumber: 1, column: 1 },
            selection: null
        })
        MonacoEditorKeyMaps(editor as never)

        const paste = commands.find((c) => c.key === (monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV))
        expect(paste).toBeDefined()
        await paste!.handler()

        const edit = editor.executeEdits.mock.calls.at(-1)![1][0]
        expect(edit.text).toBe('hello clipboard')
    })

    it('should convert the cursor line to a header via CtrlCmd+Digit1', () => {
        const { editor, commands } = makeEditor({ position: { lineNumber: 1, column: 1 } })
        MonacoEditorKeyMaps(editor as never)

        const h1 = commands.find((c) => c.key === (monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit1))
        expect(h1).toBeDefined()
        h1!.handler()

        const edit = editor.executeEdits.mock.calls.at(-1)![1][0]
        expect(edit.text).toBe('# 标题')
    })
})

describe('MonacoEditorDidChange', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should reset the position and forward cursor position changes', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        const { editor } = makeEditor()
        MonacoEditorDidChange(editor as never)

        expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 })
        expect(editor.onDidChangeCursorPosition).toHaveBeenCalledTimes(1)

        // 触发注册的光标位置监听回调
        const listener = editor.onDidChangeCursorPosition.mock.calls[0][0]
        listener({ position: { lineNumber: 5, column: 2 } })

        expect(emitSpy).toHaveBeenCalledWith('monaco-editor-statusbar-cursor-position', {
            lineNumber: 5,
            column: 2
        })
    })
})
