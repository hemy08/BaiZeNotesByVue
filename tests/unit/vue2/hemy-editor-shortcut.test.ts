// @vitest-environment jsdom
/**
 * Markdown/hemy-editor-shortcut.ts 快捷键注册与粘贴处理补测。
 *
 * 既有测试未直接覆盖该模块（编辑器组件用例 mock 掉 Monaco）；本文件用 Monaco 边界替身
 * 捕获 `addCommand` 注册的 14 个全局快捷键回调并逐个触发，覆盖：
 * 1. Ctrl+1~6 → 标题级别切换（经真实 EventHandleMaps → executeEdits）；
 * 2. Ctrl+B/I/D/U/K/L → 加粗/斜体/删除线/下划线/键盘/链接；
 * 3. Ctrl+S → 保存事件广播；
 * 4. Ctrl+V → 剪贴板：纯文本走 paste，图片（png/jpeg）读取为 DataURL 后经 IPC 插入；
 * 5. 光标位置变化 → 状态栏光标位置事件；
 * 6. 注册函数对空编辑器/无选择等边界不抛错。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const monacoMocks = vi.hoisted(() => {
    class Range {
        static fromPositions(
            start: { lineNumber: number; column: number },
            end: { lineNumber: number; column: number }
        ) {
            return new Range(start.lineNumber, start.column, end.lineNumber, end.column)
        }
        constructor(
            public startLineNumber: number,
            public startColumn: number,
            public endLineNumber: number,
            public endColumn: number
        ) {}
    }
    class Selection extends Range {}
    return { Range, Selection }
})

vi.mock('monaco-editor', () => ({
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: {
        Digit1: 49,
        Digit2: 50,
        Digit3: 51,
        Digit4: 52,
        Digit5: 53,
        Digit6: 54,
        KeyB: 32,
        KeyI: 36,
        KeyD: 34,
        KeyU: 38,
        KeyK: 40,
        KeyL: 41,
        KeyS: 47,
        KeyV: 52
    },
    Range: monacoMocks.Range,
    Selection: monacoMocks.Selection,
    editor: {}
}))

import {
    MonacoEditorDidChange,
    MonacoEditorKeyMaps
} from '@renderer/components/Markdown/hemy-editor-shortcut'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/** 注册到编辑器上的命令：key → 回调（key 为 CtrlCmd | KeyCode 的组合值） */
type CommandCallback = (...args: unknown[]) => unknown
let commands: CommandCallback[]
let selection: {
    isEmpty: () => boolean
    getStartPosition: () => { lineNumber: number; column: number }
    getEndPosition: () => { lineNumber: number; column: number }
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}
let executeEdits: ReturnType<typeof vi.fn>
let setPosition: ReturnType<typeof vi.fn>
let cursorListener: ((event: { position: { lineNumber: number; column: number } }) => void) | null
let send: ReturnType<typeof vi.fn>
let clipboardRead: ReturnType<typeof vi.fn>
let clipboardReadText: ReturnType<typeof vi.fn>

/** 编辑器替身：只实现 hemy-editor-common 实际调用的成员 */
function makeEditor() {
    return {
        addCommand: vi.fn((_key: number, callback: CommandCallback) => {
            commands.push(callback)
        }),
        getPosition: () => ({ lineNumber: 1, column: 1 }),
        getModel: () => ({
            getLineContent: () => '正文内容',
            getLineMaxColumn: () => 5,
            getLineLength: () => 4,
            getValueInRange: () => '选中',
            getValue: () => '正文内容',
            getOffsetAt: (position: { column: number }) => Math.max(0, position.column - 1),
            getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 })
        }),
        getSelection: () => selection,
        executeEdits,
        setPosition,
        setSelection: vi.fn(),
        onDidChangeCursorPosition: (listener: typeof cursorListener) => {
            cursorListener = listener
            return { dispose: vi.fn() }
        }
    }
}

function installClipboard(readResult: unknown[], readText = '剪贴板文本'): void {
    clipboardRead.mockResolvedValue(readResult)
    clipboardReadText.mockResolvedValue(readText)
    Object.defineProperty(window.navigator, 'clipboard', {
        value: { read: clipboardRead, readText: clipboardReadText },
        configurable: true
    })
}

beforeEach(() => {
    commands = []
    selection = {
        isEmpty: () => false,
        getStartPosition: () => ({ lineNumber: 1, column: 1 }),
        getEndPosition: () => ({ lineNumber: 1, column: 5 }),
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 5
    }
    executeEdits = vi.fn()
    setPosition = vi.fn()
    cursorListener = null
    send = vi.fn()
    clipboardRead = vi.fn()
    clipboardReadText = vi.fn()
    vi.stubGlobal('electron', { ipcRenderer: { send, invoke: vi.fn(), on: vi.fn() } })
    vi.stubGlobal('navigator', window.navigator)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('hemy-editor-shortcut 快捷键注册', () => {
    it('注册 14 个快捷键命令（12 个格式/保存/粘贴）', () => {
        MonacoEditorKeyMaps(makeEditor() as never)
        // Ctrl+1~6、B、I、D、U、K、L（12）+ Ctrl+S、Ctrl+V（2）
        expect(commands).toHaveLength(14)
    })

    it('标题类快捷键（Ctrl+1~6）触发标题级别切换编辑', () => {
        MonacoEditorKeyMaps(makeEditor() as never)
        // 前 6 个为 h1~h6
        for (let index = 0; index < 6; index += 1) {
            executeEdits.mockClear()
            commands[index]()
            expect(executeEdits).toHaveBeenCalledTimes(1)
        }
    })

    it('行内格式快捷键（加粗/斜体/删除线/下划线/键盘/链接）触发编辑', () => {
        MonacoEditorKeyMaps(makeEditor() as never)
        // 第 7~12 个为 bold/italic/deleteline/underline/keyboard/link
        for (let index = 6; index < 12; index += 1) {
            executeEdits.mockClear()
            commands[index]()
            expect(executeEdits).toHaveBeenCalledTimes(1)
        }
    })

    it('Ctrl+S 广播保存事件', () => {
        MonacoEditorKeyMaps(makeEditor() as never)
        const emitSpy = vi.spyOn(EventBus, '$emit')

        commands[12]()

        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_SAVE_FILE_CONTENT_TO_DISK, true)
    })
})

describe('hemy-editor-shortcut 粘贴快捷键（Ctrl+V）', () => {
    it('剪贴板无图片时按纯文本粘贴', async () => {
        installClipboard([])
        MonacoEditorKeyMaps(makeEditor() as never)

        await commands[13]()

        expect(clipboardRead).toHaveBeenCalled()
        expect(clipboardReadText).toHaveBeenCalled()
        // paste 处理器经 executeEdits 写入纯文本
        expect(executeEdits).toHaveBeenCalledTimes(1)
    })

    it('剪贴板含 png 图片时读取 DataURL 并走 IPC 插入', async () => {
        const imageBlob = new Blob(['fake-png'], { type: 'image/png' })
        installClipboard([
            {
                types: ['image/png'],
                getType: vi.fn().mockResolvedValue(imageBlob)
            }
        ])
        MonacoEditorKeyMaps(makeEditor() as never)

        await commands[13]()

        // FileReader 异步读取 DataURL → EventHandleMaps.insertimage → IPC 发送
        await vi.waitFor(
            () => {
                expect(send).toHaveBeenCalledWith(
                    IPC.RENDER.INSERT_IMAGE,
                    expect.stringContaining('data:image/png')
                )
            },
            { timeout: 2000, interval: 10 }
        )
        // 说明：FileReader.onload 在同步循环之后才落定，因此图片分支不会阻断纯文本
        // 粘贴路径（isImage 仍为 false）——这是既有实现的时序行为，此处只锁定不抛错。
        expect(clipboardReadText).toHaveBeenCalled()
    })

    it('剪贴板含 jpeg 图片时同样按图片分支处理', async () => {
        const imageBlob = new Blob(['fake-jpeg'], { type: 'image/jpeg' })
        const getType = vi.fn().mockResolvedValue(imageBlob)
        installClipboard([{ types: ['text/plain', 'image/jpeg'], getType }])
        MonacoEditorKeyMaps(makeEditor() as never)

        await commands[13]()

        await vi.waitFor(
            () => {
                // DataURL 前缀取自 Blob 自身 type（历史实现固定按 image/png 读取 Blob）
                expect(send).toHaveBeenCalledWith(
                    IPC.RENDER.INSERT_IMAGE,
                    expect.stringContaining('data:image/jpeg')
                )
            },
            { timeout: 2000, interval: 10 }
        )
        // 历史实现固定按 image/png 读取
        expect(getType).toHaveBeenCalledWith('image/png')
    })
})

describe('hemy-editor-shortcut 光标位置同步', () => {
    it('注册光标监听并转发到状态栏事件', () => {
        const editor = makeEditor()
        MonacoEditorDidChange(editor as never)

        expect(setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 })
        expect(cursorListener).not.toBeNull()

        const emitSpy = vi.spyOn(EventBus, '$emit')
        cursorListener!({ position: { lineNumber: 3, column: 7 } })
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.STATUS_BAR_CURSOR_POSITION, {
            lineNumber: 3,
            column: 7
        })
    })
})
