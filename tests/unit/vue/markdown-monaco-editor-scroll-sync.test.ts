// @vitest-environment jsdom
/**
 * MarkdownMonacoEditor 滚动同步触发端测试（1.5.0：编辑器 → 预览单向同步）。
 *
 * 覆盖三条触发路径与清理逻辑（Monaco 用最小桩，组件内真实逻辑不替换）：
 * 1. onDidScrollChange：rAF 合帧，同一帧多次滚动只发一次，锚点 = 可见区首行 + 滚动比例；
 * 2. onDidChangeModelContent：150~200ms 尾随防抖，连续输入只发最终位置；
 * 3. onDidChangeCursorPosition（reason=Explicit）：光标兜底路径，非显式原因不触发；
 * 4. 退化输入（无可见区/无布局信息）钳制为第 1 行 + 比例 0；计算异常不影响编辑器主链路；
 * 5. 卸载：取消 rAF/尾随防抖并 dispose 全部编辑器订阅。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

interface RafState {
    callbacks: Array<FrameRequestCallback>
    cancelled: number[]
}

const M = vi.hoisted(() => {
    const state = {
        layout: vi.fn(),
        create: vi.fn(),
        registerFolding: vi.fn(),
        invoke: vi.fn(),
        loggerWarn: vi.fn(),
        perfMark: vi.fn(),
        perfMeasure: vi.fn(),
        editors: [] as Array<Record<string, unknown>>
    }
    return state
})

const rafState: RafState = { callbacks: [], cancelled: [] }
const originalRaf = globalThis.requestAnimationFrame
const originalCancelRaf = globalThis.cancelAnimationFrame

function installRafStub(): void {
    rafState.callbacks.length = 0
    rafState.cancelled.length = 0
    let nextId = 1
    ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
        callback: FrameRequestCallback
    ): number => {
        const id = nextId++
        rafState.callbacks.push((time: number) => callback(time))
        return id
    }
    ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (
        id: number
    ): void => {
        rafState.cancelled.push(id)
    }
}

/** 执行当前排队的 rAF 回调（模拟一帧） */
function flushRafFrame(): void {
    const pending = rafState.callbacks.splice(0)
    for (const callback of pending) {
        callback(0)
    }
}

/** 构造 Monaco 编辑器桩（记录事件订阅，便于测试触发与验证 dispose） */
function createEditorStub() {
    const scrollHandlers: Array<() => void> = []
    const contentHandlers: Array<() => void> = []
    const cursorHandlers: Array<(event: { reason: number }) => void> = []
    const disposables = [vi.fn(), vi.fn(), vi.fn()]
    let value = ''
    const stub = {
        scrollHandlers,
        contentHandlers,
        cursorHandlers,
        disposables,
        getVisibleRanges: vi.fn(() => [{ startLineNumber: 42, endLineNumber: 60 }]),
        getScrollTop: vi.fn(() => 250),
        getScrollHeight: vi.fn(() => 1000),
        getLayoutInfo: vi.fn((): { height: number } | null => ({ height: 500 })),
        getPosition: vi.fn(() => null),
        getModel: vi.fn(() => ({
            getValue: () => value,
            getValueLength: () => value.length,
            dispose: vi.fn(),
            isAttachedToEditor: () => true
        })),
        onDidScrollChange: vi.fn((handler: () => void) => {
            scrollHandlers.push(handler)
            return { dispose: disposables[0] }
        }),
        onDidChangeCursorPosition: vi.fn((handler: (event: { reason: number }) => void) => {
            cursorHandlers.push(handler)
            return { dispose: disposables[1] }
        }),
        onDidChangeModelContent: vi.fn((handler: () => void) => {
            contentHandlers.push(handler)
            return { dispose: disposables[2] }
        }),
        layout: M.layout,
        setModel: vi.fn(),
        dispose: vi.fn(),
        getValue: () => value,
        setValue: (next: string) => {
            value = next
        },
        getValueLength: () => value.length,
        trigger: vi.fn(),
        getAction: vi.fn(),
        getContribution: vi.fn(() => null),
        revealLineInCenterIfOutsideViewport: vi.fn(),
        focus: vi.fn(),
        setPosition: vi.fn(),
        revealLineInCenter: vi.fn(),
        revealLines: vi.fn()
    }
    return stub
}

M.create.mockImplementation(() => {
    const stub = createEditorStub()
    M.editors.push(stub as unknown as Record<string, unknown>)
    return stub
})

vi.mock('monaco-editor', () => ({
    languages: {
        registerFoldingRangeProvider: M.registerFolding,
        FoldingRangeKind: { Region: 'region', Comment: 'comment', Imports: 'imports' }
    },
    editor: {
        create: M.create,
        getModels: () => [],
        getModel: () => null,
        createModel: () => ({ dispose: vi.fn(), isAttachedToEditor: () => false }),
        ScrollType: { Smooth: 0 },
        CursorChangeReason: {
            NotSet: 0,
            ContentFlush: 1,
            RecoverFromMarkers: 2,
            Explicit: 3,
            Paste: 4,
            Undo: 5,
            Redo: 6
        }
    },
    Uri: { parse: (value: string) => ({ toString: () => value }) }
}))
vi.mock('@renderer/components/Markdown/monaco-worker-setup', () => ({}))
vi.mock('@renderer/components/Markdown/register-languages', () => ({
    registerCustomLanguages: vi.fn()
}))
vi.mock('@renderer/components/Markdown/hemy-editor', () => ({
    Options: {},
    Override: {},
    DidChange: vi.fn(),
    KeyMaps: vi.fn(),
    AddActions: vi.fn(),
    UpdateContext: vi.fn(),
    InsertAfterCursor: vi.fn(),
    updateEditorOptions: vi.fn(),
    OptMaps: {}
}))
vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: M.loggerWarn, error: vi.fn(), debug: vi.fn() }
}))
vi.mock('@renderer/common/perf', () => ({
    PERF_MARK: { EDITOR_READY: 'editor-ready' },
    perfMark: M.perfMark,
    perfMeasure: M.perfMeasure
}))

import MarkdownMonacoEditor from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'

type EditorStub = ReturnType<typeof createEditorStub>
let wrapper: VueWrapper | null = null

/** 取最近一次创建的编辑器桩 */
function currentEditor(): EditorStub {
    const editor = M.editors[M.editors.length - 1]
    expect(editor, '编辑器实例应已创建').toBeTruthy()
    return editor as unknown as EditorStub
}

/** 挂载编辑器组件并完成 onMounted 异步副作用 */
async function mountEditor(): Promise<VueWrapper> {
    wrapper = mount(MarkdownMonacoEditor, {
        props: { code: '', editorAreaWidth: '50%', filePath: '' }
    })
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.clearAllMocks()
    M.editors.length = 0
    M.invoke.mockResolvedValue(null)
    installRafStub()
    Object.assign(window as unknown as Record<string, unknown>, {
        electron: {
            ipcRenderer: {
                on: vi.fn(),
                send: vi.fn(),
                invoke: M.invoke,
                removeListener: vi.fn()
            }
        }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = originalRaf
    ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = originalCancelRaf
    vi.restoreAllMocks()
})

describe('MarkdownMonacoEditor：滚动同步触发端', () => {
    it('滚动事件 rAF 合帧：同帧多次滚动只发一次，锚点取可见区首行与滚动比例', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        expect(editor.scrollHandlers.length).toBe(1)

        // 同帧连续滚动：rAF 未执行前只登记一帧
        editor.scrollHandlers[0]()
        editor.scrollHandlers[0]()
        expect(mounted.emitted('sync-scroll')).toBeUndefined()

        flushRafFrame()
        const emitted = mounted.emitted('sync-scroll')
        expect(emitted).toHaveLength(1)
        // 250 / (1000 - 500) = 0.5
        expect(emitted![0][0]).toEqual({ line: 42, ratio: 0.5 })

        // 下一帧再滚动 -> 再发一次
        editor.scrollHandlers[0]()
        flushRafFrame()
        expect(mounted.emitted('sync-scroll')).toHaveLength(2)
    })

    it('内容变化尾随防抖 180ms：连续输入只发最终位置', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        expect(editor.contentHandlers.length).toBe(1)

        editor.contentHandlers[0]()
        await vi.advanceTimersByTimeAsync(179)
        expect(mounted.emitted('sync-scroll')).toBeUndefined()

        // 防抖窗口内再次输入：重新计时，不连发
        editor.contentHandlers[0]()
        await vi.advanceTimersByTimeAsync(179)
        expect(mounted.emitted('sync-scroll')).toBeUndefined()

        await vi.advanceTimersByTimeAsync(1)
        expect(mounted.emitted('sync-scroll')).toHaveLength(1)
        expect(mounted.emitted('sync-scroll')![0][0]).toEqual({ line: 42, ratio: 0.5 })
    })

    it('光标变化仅显式原因（Explicit）触发兜底同步', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        expect(editor.cursorHandlers.length).toBe(1)

        // 非显式原因（内容回填等内部变化）不触发
        editor.cursorHandlers[0]({ reason: 1 })
        flushRafFrame()
        expect(mounted.emitted('sync-scroll')).toBeUndefined()

        editor.cursorHandlers[0]({ reason: 3 })
        flushRafFrame()
        expect(mounted.emitted('sync-scroll')).toHaveLength(1)
    })

    it('退化输入：无可见区/无布局信息时钳制为第 1 行 + 比例 0', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        editor.getVisibleRanges.mockReturnValue([])
        editor.getLayoutInfo.mockReturnValue(null)
        editor.getScrollHeight.mockReturnValue(0)
        editor.getScrollTop.mockReturnValue(0)

        editor.scrollHandlers[0]()
        flushRafFrame()
        expect(mounted.emitted('sync-scroll')![0][0]).toEqual({ line: 1, ratio: 0 })
    })

    it('锚点计算异常时被吞掉（记录警告）且不抛到编辑器主链路', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        editor.getVisibleRanges.mockImplementation(() => {
            throw new Error('monaco internal')
        })

        editor.scrollHandlers[0]()
        expect(() => flushRafFrame()).not.toThrow()
        expect(mounted.emitted('sync-scroll')).toBeUndefined()
        expect(M.loggerWarn).toHaveBeenCalled()
    })

    it('无 rAF 环境（极端运行时/测试）时退化为同步发出', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined

        editor.scrollHandlers[0]()
        expect(mounted.emitted('sync-scroll')).toHaveLength(1)
    })

    it('卸载时取消未执行帧/防抖并 dispose 全部编辑器订阅', async () => {
        const mounted = await mountEditor()
        const editor = currentEditor()
        editor.scrollHandlers[0]()
        editor.contentHandlers[0]()
        expect(rafState.callbacks.length, '滚动应已登记 rAF 帧').toBeGreaterThanOrEqual(1)

        mounted.unmount()
        wrapper = null
        // rAF 帧被取消，且不会再发出同步事件
        expect(rafState.cancelled.length).toBeGreaterThan(0)
        // 滚动/光标两条新增订阅必须显式 dispose（内容变化订阅随 editor.dispose 释放，维持原行为）
        expect(editor.disposables[0]).toHaveBeenCalled()
        expect(editor.disposables[1]).toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(300)
        expect(mounted.emitted('sync-scroll')).toBeUndefined()
    })
})
