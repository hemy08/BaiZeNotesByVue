/**
 * Markdown 编辑器 glue 模块补测（0% 盲区）：
 * 1. src/renderer/src/components/Markdown/hemy-editor-actions.ts（25 语句/3 函数）
 *    - MonacoEditorAddActions 注册的自定义 Enter 动作契约（id / keybinding / run）
 *    - EnterAction 全部分支：无光标位置、前两行、无 model、Markdown 列表续行
 *      （`- ` / `- [` 前缀）、普通行 replaceSelection 兜底
 * 2. src/renderer/src/components/Markdown/hemy-editor.ts（9 语句）
 *    - 作为「编辑器公共入口」的 re-export 契约：既要原样导出底层能力，
 *      又要保证 updateEditorOptions 等对外入口可调用（防止聚合层误删导出）。
 *
 * 依赖边界：monaco-editor 与 hemy-editor-common 均以「调用契约」最小 mock，
 * 本文件验证的是 actions 层把编辑意图映射成 insert/replace 调用的逻辑，
 * 不做真实 Monaco 渲染（真实集成由 E2E 覆盖）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const commonMocks = vi.hoisted(() => ({
    OnInsertAfterCursor: vi.fn(),
    replaceSelection: vi.fn(),
    UpdateContextFormat: vi.fn(),
    // A8：粘贴增强复用既有图片/纯文本粘贴能力（本文件仅验证注册契约，不触发调用）
    EventHandleMaps: { insertimage: vi.fn(), paste: vi.fn() }
}))

vi.mock('../../src/renderer/src/components/Markdown/hemy-editor-common', () => ({
    OnInsertAfterCursor: commonMocks.OnInsertAfterCursor,
    replaceSelection: commonMocks.replaceSelection,
    UpdateContextFormat: commonMocks.UpdateContextFormat,
    EventHandleMaps: commonMocks.EventHandleMaps
}))

const monacoMocks = vi.hoisted(() => ({
    Range: vi.fn(function MockRange(this: { args: unknown[] }, ...args: unknown[]) {
        this.args = args
    }),
    KeyCode: { Enter: 3, KeyC: 33, KeyM: 77, KeyV: 55 },
    KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512 }
}))

vi.mock('monaco-editor', () => ({
    KeyCode: monacoMocks.KeyCode,
    KeyMod: monacoMocks.KeyMod,
    Range: monacoMocks.Range
}))

// hemy-editor.ts 是聚合入口，依赖的编辑器子模块各自还有 monaco/UI 依赖；
// 本文件只验证聚合层的 re-export 关系，故对这些子模块做最小契约 mock。
vi.mock('../../src/renderer/src/components/Markdown/hemy-editor-quick-access', () => ({
    MdEditQuickAccess: { id: 'quick-access-stub' }
}))

vi.mock('../../src/renderer/src/components/Markdown/hemy-editor-shortcut', () => ({
    MonacoEditorDidChange: { id: 'did-change-stub' },
    MonacoEditorKeyMaps: { id: 'key-maps-stub' }
}))

vi.mock('../../src/renderer/src/components/Markdown/hemy-editor-render', () => ({
    renderMarkdown: vi.fn()
}))

vi.mock('../../src/renderer/src/components/Markdown/editor-options', () => ({
    MonacoEditorOptions: { id: 'options-stub' },
    MonacoEditorOverride: { id: 'override-stub' }
}))

vi.mock('../../src/renderer/src/components/Markdown/editor-option-maps', () => ({
    updateEditorOptions: vi.fn()
}))

vi.mock('../../src/renderer/src/components/Markdown/editor-utils', () => ({
    UpdateLineNumber: vi.fn(),
    UpdateEditorTheme: vi.fn(),
    UpdateTableSize: vi.fn(),
    UpdateFontSize: vi.fn(),
    UpdateRenderWhitespace: vi.fn(),
    MonacoEditorOpMaps: { id: 'op-maps-stub' }
}))

interface FakePosition {
    lineNumber: number
    column: number
}

interface FakeEditor {
    getPosition: () => FakePosition | null
    getModel: () => { getLineContent: (lineNumber: number) => string } | null
    addAction: (action: { id: string; run: (editor: FakeEditor) => void }) => void
}

interface FakeEditorOptions {
    position?: FakePosition | null
    model?: { getLineContent: (lineNumber: number) => string } | null
    content?: string
}

function makeEditor(options: FakeEditorOptions = {}): FakeEditor {
    const position =
        options.position === undefined ? { lineNumber: 3, column: 1 } : options.position
    const content = options.content ?? '普通正文'
    const model =
        options.model === undefined ? { getLineContent: vi.fn(() => content) } : options.model
    return {
        getPosition: vi.fn(() => position),
        getModel: vi.fn(() => model),
        addAction: vi.fn()
    }
}

/** 通过 MonacoEditorAddActions 拿到注册的 Enter 动作 run 回调 */
async function getEnterAction(): Promise<(editor: FakeEditor) => void> {
    const { MonacoEditorAddActions } =
        await import('../../src/renderer/src/components/Markdown/hemy-editor-actions')
    const editor = makeEditor()
    MonacoEditorAddActions(editor as never)
    // A8：除 Enter 动作外还注册「复制为 Markdown / 复制为 HTML」两个命令
    expect(editor.addAction).toHaveBeenCalledTimes(3)
    const actions = (editor.addAction as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[0]
    ) as Array<{ id: string; keybindings?: number[]; run: (e: FakeEditor) => void }>
    const action = actions.find((item) => item.id === 'hemy-custom-enter-action')
    expect(action).toBeTruthy()
    expect(action!.keybindings).toEqual([monacoMocks.KeyCode.Enter])
    return action!.run
}

beforeEach(() => {
    commonMocks.OnInsertAfterCursor.mockClear()
    commonMocks.replaceSelection.mockClear()
})

describe('hemy-editor-actions：Enter 动作注册', () => {
    it('注册 hemy-custom-enter-action 并绑定 Enter 键', async () => {
        await getEnterAction()
    })
})

describe('hemy-editor-actions：EnterAction 分支', () => {
    it('无光标位置时不做任何插入', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ position: null })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).not.toHaveBeenCalled()
    })

    it('光标在前两行时直接插入换行（不读取 model）', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ position: { lineNumber: 2, column: 5 }, model: null })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '\r\n')
        expect(editor.getModel).not.toHaveBeenCalled()
    })

    it('无 model 时不做任何插入', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ model: null })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).not.toHaveBeenCalled()
    })

    it('普通正文行使用 replaceSelection 提交换行', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ content: '普通正文' })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).toHaveBeenCalledTimes(1)
        const [target, text, single, range] = commonMocks.replaceSelection.mock.calls[0]
        expect(target).toBe(editor)
        expect(text).toBe('\r\n')
        expect(single).toBe(true)
        expect(range).toBeInstanceOf(monacoMocks.Range)
        expect((range as { args: unknown[] }).args).toEqual([3, 1, 3, 1])
    })

    it('Markdown 无序列表续行：`- 内容` 后自动补 `- ` 前缀', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ content: '- 第一项' })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '\r\n- ')
        expect(commonMocks.replaceSelection).not.toHaveBeenCalled()
    })

    it('Markdown 任务列表续行：`- [ ] 内容` 后自动补 `- [` 前缀', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ content: '- [ ] 待办事项' })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '\r\n- [')
        expect(commonMocks.replaceSelection).not.toHaveBeenCalled()
    })

    it('仅含列表标记的短行（`- `）不再续行前缀，走普通换行', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ content: '- ' })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        expect(commonMocks.replaceSelection).toHaveBeenCalledTimes(1)
    })

    it('缩进列表同样识别（前导空白 + `- `）', async () => {
        const run = await getEnterAction()
        const editor = makeEditor({ content: '  - 缩进项' })

        run(editor)

        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '\r\n  - ')
    })
})

describe('hemy-editor：编辑器聚合入口 re-export 契约', () => {
    it('对外导出底层能力且 updateEditorOptions 可调用', async () => {
        const aggregate = await import('../../src/renderer/src/components/Markdown/hemy-editor')

        expect(aggregate.Options).toBeDefined()
        expect(aggregate.Override).toBeDefined()
        expect(aggregate.OptMaps).toBeDefined()
        expect(aggregate.QuickAccess).toBeDefined()
        expect(aggregate.KeyMaps).toBeDefined()
        expect(aggregate.DidChange).toBeDefined()
        expect(aggregate.AddActions).toBeTypeOf('function')
        expect(aggregate.replaceSelection).toBe(commonMocks.replaceSelection)
        expect(aggregate.InsertAfterCursor).toBe(commonMocks.OnInsertAfterCursor)
        expect(aggregate.UpdateContext).toBe(commonMocks.UpdateContextFormat)
        expect(aggregate.updateEditorOptions).toBeTypeOf('function')
        expect(aggregate.Render).toBeDefined()
        expect(aggregate.UpdateLineNumber).toBeDefined()
        expect(aggregate.UpdateEditorTheme).toBeDefined()
        expect(aggregate.UpdateTableSize).toBeDefined()
        expect(aggregate.UpdateFontSize).toBeDefined()
        expect(aggregate.UpdateRenderWhitespace).toBeDefined()
    })
})
