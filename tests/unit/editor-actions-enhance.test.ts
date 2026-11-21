// @vitest-environment jsdom
/**
 * hemy-editor-actions 能力接线单测（A7 智能输入 + A8 复制/粘贴增强）：
 * - 注册契约：Enter 动作 + 两个固定 id 的复制命令（含快捷键）+ Ctrl+V 粘贴命令；
 * - A7：`flags.smartInput` 关闭时回车走原实现（逐字保持一致），开启时按纯函数计划插入，
 *   行中间回车仍回退原实现；
 * - A8：复制为 Markdown / 复制为 HTML 的实际剪贴板载荷；Ctrl+V 的 HTML → Markdown。
 *
 * 依赖边界：monaco / hemy-editor-common / 能力开关均以调用契约 mock，本文件只验证
 * 「编辑意图 → 插入/剪贴板调用」的接线，真实 Monaco 渲染与系统剪贴板由 E2E 覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const flagState = vi.hoisted(() => ({ smartInput: false, writingSmartInput: false }))

vi.mock('../../src/renderer/src/composables/useFeatureFlags', () => ({
    useFeatureFlags: () => ({
        flags: flagState,
        isFeatureEnabled: (id: string) => Boolean((flagState as Record<string, boolean>)[id])
    }),
    initFeatureFlags: vi.fn(async () => undefined),
    refreshFeatureFlags: vi.fn(async () => undefined)
}))

const commonMocks = vi.hoisted(() => ({
    OnInsertAfterCursor: vi.fn(),
    replaceSelection: vi.fn(),
    EventHandleMaps: {
        insertimage: vi.fn<(dataUrl: string) => void>(),
        paste: vi.fn<(editor: unknown, text: string) => void>()
    }
}))

vi.mock('../../src/renderer/src/components/Markdown/hemy-editor-common', () => ({
    OnInsertAfterCursor: commonMocks.OnInsertAfterCursor,
    replaceSelection: commonMocks.replaceSelection,
    EventHandleMaps: commonMocks.EventHandleMaps
}))

const monacoMocks = vi.hoisted(() => ({
    Range: vi.fn(function MockRange(this: { args: unknown[] }, ...args: unknown[]) {
        this.args = args
    }),
    KeyCode: { Enter: 3, Backspace: 8, KeyC: 33, KeyM: 77, KeyV: 55 },
    KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512 }
}))

vi.mock('monaco-editor', () => ({
    KeyCode: monacoMocks.KeyCode,
    KeyMod: monacoMocks.KeyMod,
    Range: monacoMocks.Range
}))

const loggerMocks = vi.hoisted(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
}))

vi.mock('@renderer/common/logger', () => ({
    logger: loggerMocks
}))

import type * as monaco from 'monaco-editor'
import {
    COPY_AS_HTML_ACTION_ID,
    COPY_AS_MARKDOWN_ACTION_ID,
    MonacoEditorAddActions
} from '../../src/renderer/src/components/Markdown/hemy-editor-actions'

/* ==================== 编辑器替身 ==================== */

interface CapturedAction {
    id: string
    label?: string
    keybindings?: number[]
    run: (editor: monaco.editor.ICodeEditor) => unknown
}

interface FakeEditorOptions {
    lineNumber?: number
    column?: number
    lineText?: string
    lineTexts?: string[]
    documentText?: string
    selectionEmpty?: boolean
    domNode?: HTMLElement | null
    modelNull?: boolean
}

interface ExecutedEdit {
    range: { args: unknown[] }
    text: string
}

interface FakeEditorHandle {
    editor: monaco.editor.IStandaloneCodeEditor
    actions: CapturedAction[]
    commands: Array<{ keybinding: number; handler: () => void }>
    edits: ExecutedEdit[][]
    keydownHandlers: Array<(event: Record<string, unknown>) => void>
    compositionStart: () => void
    compositionEnd: () => void
    position: { lineNumber: number; column: number }
}

/** 构造最小编辑器替身：记录 addAction / addCommand / executeEdits，供动作契约断言与手动触发 */
function makeEditor(options: FakeEditorOptions = {}): FakeEditorHandle {
    const lineTexts = options.lineTexts ?? [options.lineText ?? '普通正文']
    const lineNumber = options.lineNumber ?? 3
    const lineText = lineTexts[0] ?? ''
    const column = options.column ?? lineText.length + 1
    const documentText = options.documentText ?? lineTexts.join('\n')
    const actions: CapturedAction[] = []
    const commands: Array<{ keybinding: number; handler: () => void }> = []
    const edits: ExecutedEdit[][] = []
    const keydownHandlers: Array<(event: Record<string, unknown>) => void> = []
    const position = { lineNumber, column }
    const compositionStartHandlers: Array<() => void> = []
    const compositionEndHandlers: Array<() => void> = []
    const editor = {
        getPosition: () => position,
        getModel: () =>
            options.modelNull
                ? null
                : {
                      getLineContent: (line?: number) =>
                          line && line >= lineNumber
                              ? (lineTexts[line - lineNumber] ?? lineText)
                              : lineText,
                      getLineCount: () => lineNumber + lineTexts.length - 1,
                      getValue: () => documentText,
                      getValueInRange: () => documentText,
                      getEOL: () => '\n'
                  },
        getSelection: () => ({ isEmpty: () => options.selectionEmpty ?? true }),
        addAction: (action: CapturedAction) => {
            actions.push(action)
            return { dispose: vi.fn() }
        },
        addCommand: (keybinding: number, handler: () => void) => {
            commands.push({ keybinding, handler })
            return 'command-id'
        },
        executeEdits: (_source: string, executed: ExecutedEdit[]) => {
            edits.push(executed)
        },
        setPosition: (next: { lineNumber: number; column: number }) => {
            position.lineNumber = next.lineNumber
            position.column = next.column
        },
        onKeyDown: (handler: (event: Record<string, unknown>) => void) => {
            keydownHandlers.push(handler)
            return { dispose: vi.fn() }
        },
        onDidCompositionStart: (handler: () => void) => {
            compositionStartHandlers.push(handler)
            return { dispose: vi.fn() }
        },
        onDidCompositionEnd: (handler: () => void) => {
            compositionEndHandlers.push(handler)
            return { dispose: vi.fn() }
        },
        getDomNode: () => options.domNode ?? null
    } as unknown as monaco.editor.IStandaloneCodeEditor
    return {
        editor,
        actions,
        commands,
        edits,
        keydownHandlers,
        compositionStart: () => {
            for (const handler of compositionStartHandlers) handler()
        },
        compositionEnd: () => {
            for (const handler of compositionEndHandlers) handler()
        },
        position
    }
}

/** 从动作列表里取指定 id 的动作 */
function findAction(actions: CapturedAction[], id: string): CapturedAction {
    const action = actions.find((item) => item.id === id)
    expect(action, `未注册动作：${id}`).toBeTruthy()
    return action!
}

/* ==================== 剪贴板替身 ==================== */

interface WrittenClipboardItem {
    items: Record<string, Blob>
}

/** 临时替换 navigator.clipboard / ClipboardItem，返回写入记录 */
function stubClipboardWrite(): {
    written: WrittenClipboardItem[]
    restore: () => void
} {
    const written: WrittenClipboardItem[] = []
    class FakeClipboardItem {
        constructor(public readonly items: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
            write: async (items: unknown[]) => {
                written.push(items[0] as WrittenClipboardItem)
            }
        }
    })
    return { written, restore: () => Reflect.deleteProperty(navigator, 'clipboard') }
}

/** 临时替换 navigator.clipboard（读取通道） */
function stubClipboardRead(items: unknown[]): void {
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
            read: async () => items,
            readText: async () => '纯文本剪贴板'
        }
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    flagState.smartInput = false
    flagState.writingSmartInput = false
})

afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
    vi.unstubAllGlobals()
})

/* ==================== 注册契约 ==================== */

describe('MonacoEditorAddActions 注册契约', () => {
    it('注册 Enter 动作与 A8 两个固定 id 的复制命令（含快捷键）', () => {
        const { editor, actions } = makeEditor()
        const disposables = MonacoEditorAddActions(editor)

        expect(actions.map((action) => action.id)).toEqual([
            'hemy-custom-enter-action',
            COPY_AS_MARKDOWN_ACTION_ID,
            COPY_AS_HTML_ACTION_ID
        ])
        expect(findAction(actions, COPY_AS_MARKDOWN_ACTION_ID).keybindings).toEqual([
            monacoMocks.KeyMod.CtrlCmd | monacoMocks.KeyMod.Shift | monacoMocks.KeyCode.KeyM
        ])
        expect(findAction(actions, COPY_AS_HTML_ACTION_ID).keybindings).toEqual([
            monacoMocks.KeyMod.CtrlCmd | monacoMocks.KeyMod.Shift | monacoMocks.KeyCode.KeyC
        ])
        expect(Array.isArray(disposables)).toBe(true)
    })

    it('注册 Ctrl+V 粘贴增强命令（覆盖既有动态键绑定）', () => {
        const { editor, commands } = makeEditor()
        MonacoEditorAddActions(editor)
        expect(commands).toHaveLength(1)
        expect(commands[0].keybinding).toBe(monacoMocks.KeyMod.CtrlCmd | monacoMocks.KeyCode.KeyV)
    })

    it('编辑器无 DOM 根节点时也能完成注册（不抛错）', () => {
        const { editor } = makeEditor({ domNode: null })
        expect(() => MonacoEditorAddActions(editor)).not.toThrow()
    })

    it('最小测试替身（无 addCommand/getDomNode、addAction 返回 undefined）不抛错', () => {
        const editor = {
            addAction: vi.fn(() => undefined)
        } as unknown as monaco.editor.IStandaloneCodeEditor
        expect(() => MonacoEditorAddActions(editor)).not.toThrow()
    })

    it('有 DOM 根节点时返回可释放的 paste 监听句柄', () => {
        const root = document.createElement('div')
        const removeListener = vi.spyOn(root, 'removeEventListener')
        const { editor } = makeEditor({ domNode: root })
        const disposables = MonacoEditorAddActions(editor)
        // 3 个 action 句柄之后追加 paste 监听句柄
        const pasteDisposable = disposables[disposables.length - 1]
        expect(pasteDisposable).toBeTruthy()
        pasteDisposable!.dispose()
        expect(removeListener).toHaveBeenCalledWith('paste', expect.any(Function), true)
    })
})

/* ==================== A7 智能输入 ==================== */

describe('A7 Enter 增强（smartInput 关闭时逐字保持原实现）', () => {
    it('开关关闭：有序列表行按原实现回退 replaceSelection 换行', () => {
        const { editor, actions } = makeEditor({ lineText: '1. 第一项' })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).toHaveBeenCalledTimes(1)
        expect(commonMocks.replaceSelection.mock.calls[0][1]).toBe('\r\n')
    })

    it('开关关闭：第一行回车直接插入换行（不读取 model，保持原早退分支）', () => {
        const { editor, actions } = makeEditor({ lineNumber: 1, lineText: '# 标题' })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '\r\n')
    })
})

describe('A7 Enter 增强（smartInput 开启，普通模式）', () => {
    it('有序列表自动递增并保留缩进，单次 executeEdits', () => {
        flagState.smartInput = true
        const { editor, actions, edits } = makeEditor({ lineText: '  1. 第一项' })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(edits).toHaveLength(1)
        expect(edits[0][0].text).toBe('\r\n  2. ')
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
    })

    it('有序列表后续同缩进项自动重编号（插入 + 重编号合并为一次编辑）', () => {
        flagState.smartInput = true
        const { editor, actions, edits } = makeEditor({
            lineTexts: ['1. 第一项', '2. 第二项', '4. 第四项']
        })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(edits).toHaveLength(1)
        expect(edits[0].map((edit) => edit.text)).toEqual(['\r\n2. ', '3', '4'])
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
    })

    it('引用块 / 任务列表 / 嵌套无序列表 / 标题补空行', () => {
        flagState.smartInput = true
        const cases: Array<{ lineText: string; expected: string }> = [
            { lineText: '> 引用内容', expected: '\r\n> ' },
            { lineText: '- [ ] 待办', expected: '\r\n- [ ] ' },
            { lineText: '  - 嵌套列表', expected: '\r\n  - ' },
            { lineText: '# 标题', expected: '\r\n\r\n' }
        ]
        for (const testCase of cases) {
            const { editor, actions, edits } = makeEditor({ lineText: testCase.lineText })
            MonacoEditorAddActions(editor)
            findAction(actions, 'hemy-custom-enter-action').run(editor as never)
            expect(edits).toHaveLength(1)
            expect(edits[0][0].text).toBe(testCase.expected)
            expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        }
    })

    it('空列表项回车退出列表：删除行首标记并换行', () => {
        flagState.smartInput = true
        const { editor, actions, edits } = makeEditor({ lineText: '- ' })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(edits).toHaveLength(1)
        expect(edits[0][0].text).toBe('\r\n')
        expect(edits[0][0].range.args).toEqual([3, 1, 3, 3])
    })

    it('行中间回车仍回退原实现（不插入列表前缀）', () => {
        flagState.smartInput = true
        const { editor, actions } = makeEditor({
            lineText: '1. 第一项',
            column: 3
        })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).toHaveBeenCalledTimes(1)
    })

    it('开启但无 model 时回退原实现（第一行直接换行）', () => {
        flagState.smartInput = true
        const { editor, actions } = makeEditor({ lineNumber: 1, modelNull: true })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '\r\n')
    })

    it('编写体验「智能输入增强」开关在普通模式也生效', () => {
        flagState.smartInput = false
        flagState.writingSmartInput = true
        const { editor, actions, edits } = makeEditor({ lineText: '- 列表项' })
        MonacoEditorAddActions(editor)
        findAction(actions, 'hemy-custom-enter-action').run(editor as never)

        expect(edits).toHaveLength(1)
        expect(edits[0][0].text).toBe('\r\n- ')
    })

    it('中文输入法组合期回车不介入（不新增编辑）', () => {
        flagState.smartInput = true
        const handle = makeEditor({ lineText: '1. 第一项' })
        MonacoEditorAddActions(handle.editor)
        handle.compositionStart()
        findAction(handle.actions, 'hemy-custom-enter-action').run(handle.editor as never)

        expect(handle.edits).toHaveLength(0)
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).not.toHaveBeenCalled()
    })

    it('空列表项退格退出：拦截 Backspace 并一次删除整行标记', () => {
        flagState.smartInput = true
        const handle = makeEditor({ lineText: '- ' })
        MonacoEditorAddActions(handle.editor)
        const preventDefault = vi.fn()
        const stopPropagation = vi.fn()
        handle.keydownHandlers[0]({
            keyCode: monacoMocks.KeyCode.Backspace,
            preventDefault,
            stopPropagation
        })

        expect(handle.edits).toHaveLength(1)
        expect(handle.edits[0][0].range.args).toEqual([3, 1, 3, 3])
        expect(handle.edits[0][0].text).toBe('')
        expect(preventDefault).toHaveBeenCalledTimes(1)
        expect(stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('普通文本的 Backspace 完全放行', () => {
        flagState.smartInput = true
        const handle = makeEditor({ lineText: '普通正文' })
        MonacoEditorAddActions(handle.editor)
        const preventDefault = vi.fn()
        handle.keydownHandlers[0]({
            keyCode: monacoMocks.KeyCode.Backspace,
            preventDefault
        })

        expect(handle.edits).toHaveLength(0)
        expect(preventDefault).not.toHaveBeenCalled()
    })

    it('组合期 Backspace 不介入', () => {
        flagState.smartInput = true
        const handle = makeEditor({ lineText: '- ' })
        MonacoEditorAddActions(handle.editor)
        handle.compositionStart()
        const preventDefault = vi.fn()
        handle.keydownHandlers[0]({
            keyCode: monacoMocks.KeyCode.Backspace,
            preventDefault
        })

        expect(handle.edits).toHaveLength(0)
        expect(preventDefault).not.toHaveBeenCalled()
    })
})

/* ==================== A8 复制 ==================== */

describe('A8 复制为 Markdown / HTML', () => {
    it('复制为 Markdown：全文纯文本写入剪贴板', async () => {
        const { written, restore } = stubClipboardWrite()
        const { editor, actions } = makeEditor({ documentText: '# 标题\n\n正文' })
        MonacoEditorAddActions(editor)
        await findAction(actions, COPY_AS_MARKDOWN_ACTION_ID).run(editor as never)
        restore()

        expect(written).toHaveLength(1)
        const textBlob = written[0].items['text/plain']
        expect(textBlob).toBeDefined()
        expect(await textBlob.text()).toBe('# 标题\n\n正文')
        expect(written[0].items['text/html']).toBeUndefined()
    })

    it('复制为 HTML：同时写原文与转义后的结构化 HTML', async () => {
        const { written, restore } = stubClipboardWrite()
        const { editor, actions } = makeEditor({ documentText: '<b>源码</b>\n\n第二段' })
        MonacoEditorAddActions(editor)
        await findAction(actions, COPY_AS_HTML_ACTION_ID).run(editor as never)
        restore()

        expect(written).toHaveLength(1)
        expect(await written[0].items['text/plain'].text()).toBe('<b>源码</b>\n\n第二段')
        expect(await written[0].items['text/html'].text()).toBe(
            '<p>&lt;b&gt;源码&lt;/b&gt;</p>\n<p>第二段</p>'
        )
    })

    it('空文档不写剪贴板', async () => {
        const { written, restore } = stubClipboardWrite()
        const { editor, actions } = makeEditor({ documentText: '' })
        MonacoEditorAddActions(editor)
        await findAction(actions, COPY_AS_MARKDOWN_ACTION_ID).run(editor as never)
        restore()
        expect(written).toHaveLength(0)
    })

    it('有选区时复制选区文本（而非全文）', async () => {
        const { written, restore } = stubClipboardWrite()
        const { editor, actions } = makeEditor({
            documentText: '选区内容',
            selectionEmpty: false
        })
        MonacoEditorAddActions(editor)
        await findAction(actions, COPY_AS_MARKDOWN_ACTION_ID).run(editor as never)
        restore()
        expect(await written[0].items['text/plain'].text()).toBe('选区内容')
    })

    it('剪贴板通道全部不可用时记录警告（不抛错）', async () => {
        Reflect.deleteProperty(navigator, 'clipboard')
        vi.unstubAllGlobals()
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: () => false
        })
        const { editor, actions } = makeEditor({ documentText: '内容' })
        MonacoEditorAddActions(editor)
        await findAction(actions, COPY_AS_MARKDOWN_ACTION_ID).run(editor as never)
        Reflect.deleteProperty(document, 'execCommand')
        expect(loggerMocks.warn).toHaveBeenCalled()
    })
})

/* ==================== A8 Ctrl+V 粘贴 ==================== */

describe('A8 Ctrl+V HTML 粘贴增强', () => {
    it('剪贴板 HTML 转为 Markdown 插入（图片/纯文本通道不受影响）', async () => {
        stubClipboardRead([
            {
                types: ['text/html'],
                getType: async () => new Blob(['<h2>标题</h2>'], { type: 'text/html' })
            }
        ])
        const { editor, commands } = makeEditor({ lineText: '原内容' })
        MonacoEditorAddActions(editor)
        commands[0].handler()

        await vi.waitFor(() => {
            expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '## 标题')
        })
        expect(commonMocks.EventHandleMaps.paste).not.toHaveBeenCalled()
    })

    it('剪贴板只有纯文本时仍走既有 paste 处理', async () => {
        stubClipboardRead([])
        const { editor, commands } = makeEditor()
        MonacoEditorAddActions(editor)
        commands[0].handler()

        await vi.waitFor(() => {
            expect(commonMocks.EventHandleMaps.paste).toHaveBeenCalledWith(editor, '纯文本剪贴板')
        })
    })
})
