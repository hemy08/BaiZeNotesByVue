// @vitest-environment jsdom
/**
 * `Markdown/MarkdownMonacoEditor.vue` 覆盖率补测（第二批，原 53% 语句 / 25.9% 分支）。
 *
 * 覆盖目标（只 mock monaco/electron 边界，组件内真实逻辑不替换）：
 * 1. 挂载装配：monaco.editor.create、初始内容回填、DidChange/KeyMaps/AddActions、
 *    markdown 折叠提供器首次注册（第二次挂载走幂等早退）、perf 标记、延迟二次 layout；
 * 2. IPC 监听（AFTER_CURSOR / TEXT_BLOCK_TEMPLATES / UPDATE_OPTIONS / UNDO_REDO /
 *    INIT_SETTING）：负载转发与未知 option 容错；
 * 3. 三个 watch：code（值变化守卫）/ filePath（旧 model 销毁 + 新 model 复用/创建，
 *    含 UNC 路径 4 斜杠 → 2 斜杠的 Monaco URI 修正）/ editorAreaWidth（rAF 合帧）；
 * 4. EventBus 动作：更新上下文/插入/定位行/重排、折叠（fold-all/expand-all/
 *    fold-level 钳制/无 payload 时的「有折叠则展开」幂等切换）、查找/替换、
 *    跳行（越界钳制 + 警告）、大纲（提取/层级/末尾 # 清理/空标题回退/超长行跳过/
 *    点击跳转/再次切换关闭/外部点击关闭/Esc 关闭/内部点击不关闭）；
 * 5. 内容变化回调：emit('update:code') + STATUS_BAR_CONTEXT_LENGTH 事件；
 * 6. 卸载清理：IPC removeListener、document/window 监听解绑、model 与编辑器销毁、
 *    仅销毁未附加 model、取消未执行的 layout 帧；
 * 7. GET_SETTING 主动拉取配置成功 / 失败（logger.warn）两条路径。
 */
import { describe, it, expect, beforeAll, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

interface ModelLike {
    getLineCount(): number
    getLineContent(line: number): string
    getValue(): string
    getValueLength(): number
    dispose(): void
    isAttachedToEditor(): boolean
}

/** monaco 折叠提供器回调（本文件只用到 provideFoldingRanges 的返回结构） */
interface FoldingProviderLike {
    provideFoldingRanges(model: ModelLike): Array<{ start: number; end: number; kind: string }>
}

const M = vi.hoisted(() => {
    const state = {
        // 断言目标（全部为 vi.fn）
        layout: vi.fn(),
        create: vi.fn(),
        setModel: vi.fn(),
        disposeEditor: vi.fn(),
        trigger: vi.fn(),
        focus: vi.fn(),
        setPosition: vi.fn(),
        revealLineInCenter: vi.fn(),
        revealLines: vi.fn(),
        getAction: vi.fn(),
        getContribution: vi.fn(),
        getModels: vi.fn(),
        getModelByUri: vi.fn(),
        createModel: vi.fn(),
        uriParse: vi.fn(),
        registerFolding: vi.fn(),
        invoke: vi.fn(),
        ipcRemoveListener: vi.fn(),
        loggerWarn: vi.fn(),
        perfMark: vi.fn(),
        perfMeasure: vi.fn(),
        insertAfterCursor: vi.fn(),
        updateContext: vi.fn(),
        updateEditorOptions: vi.fn(),
        didChange: vi.fn(),
        keyMaps: vi.fn(),
        addActions: vi.fn(),
        optFontSize: vi.fn(),
        registerCustomLanguages: vi.fn(),
        // 可变状态
        editorValue: '',
        currentModel: null as ModelLike | null,
        changeHandlers: [] as Array<() => void>,
        foldingProvider: null as FoldingProviderLike | null,
        action: null as { run: Mock } | null,
        contribution: null as unknown,
        modelByUri: new Map<string, ModelLike>(),
        ipcHandlers: new Map<string, (...args: unknown[]) => unknown>()
    }
    return state
})

/** 构造假 Monaco model（行数组驱动折叠/大纲/跳行逻辑） */
function makeModel(lines: string[], attached = false): ModelLike {
    return {
        getLineCount: () => lines.length,
        getLineContent: (line: number) => lines[line - 1] ?? '',
        getValue: () => lines.join('\n'),
        getValueLength: () => lines.join('\n').length,
        dispose: vi.fn(),
        isAttachedToEditor: () => attached
    }
}

const editorStub = {
    onDidChangeModelContent: (callback: () => void) => {
        M.changeHandlers.push(callback)
    },
    // 1.5.0（滚动同步）：编辑器创建后注册滚动/光标订阅（本文件只验证挂载装配不受影响）
    onDidScrollChange: vi.fn(),
    onDidChangeCursorPosition: vi.fn(),
    getVisibleRanges: (): Array<{ startLineNumber: number; endLineNumber: number }> => [],
    getScrollTop: (): number => 0,
    getScrollHeight: (): number => 0,
    getLayoutInfo: (): { height: number } => ({ height: 0 }),
    layout: M.layout,
    getModel: (): ModelLike | null => M.currentModel,
    setModel: M.setModel,
    dispose: M.disposeEditor,
    getValue: (): string => M.editorValue,
    setValue: (value: string) => {
        M.editorValue = value
    },
    getValueLength: (): number => M.editorValue.length,
    trigger: M.trigger,
    getAction: (actionId: string) => {
        M.getAction(actionId)
        return M.action
    },
    focus: M.focus,
    setPosition: M.setPosition,
    revealLineInCenter: M.revealLineInCenter,
    revealLines: M.revealLines,
    getContribution: (id: string) => {
        M.getContribution(id)
        return M.contribution
    }
}

M.create.mockImplementation(() => editorStub)
M.getModels.mockReturnValue([])
M.getModelByUri.mockReturnValue(null)

vi.mock('monaco-editor', () => ({
    languages: {
        registerFoldingRangeProvider: (languageId: string, provider: FoldingProviderLike) => {
            M.registerFolding(languageId, provider)
            M.foldingProvider = provider
        },
        FoldingRangeKind: { Region: 'region', Comment: 'comment', Imports: 'imports' }
    },
    editor: {
        create: M.create,
        getModels: M.getModels,
        getModel: M.getModelByUri,
        createModel: (value: string, language: string, uri: { toString(): string }) => {
            const model = makeModel(value.split('\n'))
            M.modelByUri.set(String(uri), model)
            M.createModel(value, language, uri)
            return model
        },
        ScrollType: { Smooth: 0 }
    },
    Uri: {
        parse: (value: string) => {
            M.uriParse(value)
            return { toString: () => value }
        }
    }
}))

vi.mock('@renderer/components/Markdown/monaco-worker-setup', () => ({}))
vi.mock('@renderer/components/Markdown/register-languages', () => ({
    registerCustomLanguages: M.registerCustomLanguages
}))
vi.mock('@renderer/components/Markdown/hemy-editor', () => ({
    Options: {},
    Override: {},
    DidChange: M.didChange,
    KeyMaps: M.keyMaps,
    AddActions: M.addActions,
    UpdateContext: M.updateContext,
    InsertAfterCursor: M.insertAfterCursor,
    updateEditorOptions: M.updateEditorOptions,
    OptMaps: { fontSize: M.optFontSize }
}))
vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: M.loggerWarn, error: vi.fn(), debug: vi.fn() }
}))
vi.mock('@renderer/common/perf', () => ({
    PERF_MARK: { EDITOR_READY: 'editor-ready' },
    perfMark: M.perfMark,
    perfMeasure: M.perfMeasure
}))

import { nextTick } from 'vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { setLocale } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'
import type MarkdownMonacoEditorType from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'

type MdMonacoEditorComponent = typeof MarkdownMonacoEditorType
let MdMonacoEditor: MdMonacoEditorComponent
let wrapper: VueWrapper | null = null

interface RafState {
    callbacks: Array<() => void>
    ids: number[]
    cancelled: number[]
}

const rafState: RafState = { callbacks: [], ids: [], cancelled: [] }
let originalRaf: typeof globalThis.requestAnimationFrame | undefined
let originalCancelRaf: typeof globalThis.cancelAnimationFrame | undefined

function installRafStub(): void {
    rafState.callbacks.length = 0
    rafState.ids.length = 0
    rafState.cancelled.length = 0
    let nextId = 1
    ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
        callback: () => void
    ): number => {
        rafState.callbacks.push(callback)
        const id = nextId++
        rafState.ids.push(id)
        return id
    }
    ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = (
        id: number
    ): void => {
        rafState.cancelled.push(id)
    }
}

function flushRafFrame(): void {
    const pending = rafState.callbacks.splice(0)
    for (const callback of pending) {
        callback()
    }
}

/** 挂载组件并完成 onMounted 的异步副作用（GET_SETTING invoke / rAF 注册） */
async function mountEditor(
    props: {
        code?: string
        editorAreaWidth?: string
        filePath?: string
    } = {}
): Promise<VueWrapper> {
    const mounted = mount(MdMonacoEditor, {
        props: { code: '', editorAreaWidth: '50%', filePath: '', ...props }
    })
    await flushPromises()
    wrapper = mounted
    return mounted
}

/** 读取已注册的 IPC 处理器（组件模块作用域 + onMounted 注册） */
function ipcHandler(channel: string): (event: unknown, ...args: unknown[]) => unknown {
    const handler = M.ipcHandlers.get(channel)
    expect(handler, `IPC 通道未注册：${channel}`).toBeTruthy()
    return handler!
}

const statusLengthEvents: number[] = []
function statusLengthListener(length: number): void {
    statusLengthEvents.push(length)
}

beforeAll(async () => {
    const ipcRenderer = {
        on: (channel: string, handler: (...args: unknown[]) => unknown) => {
            M.ipcHandlers.set(channel, handler)
        },
        send: vi.fn(),
        invoke: M.invoke,
        removeListener: M.ipcRemoveListener
    }
    Object.assign(window as unknown as Record<string, unknown>, {
        electron: { ipcRenderer }
    })
    const module = await import('@renderer/components/Markdown/MarkdownMonacoEditor.vue')
    MdMonacoEditor = module.default
})

beforeEach(() => {
    vi.clearAllMocks()
    M.editorValue = ''
    M.currentModel = null
    M.changeHandlers.length = 0
    M.foldingProvider = null
    M.action = null
    M.contribution = null
    M.modelByUri.clear()
    M.getModels.mockReturnValue([])
    M.getModelByUri.mockReturnValue(null)
    M.invoke.mockResolvedValue(null)
    statusLengthEvents.length = 0
    originalRaf = globalThis.requestAnimationFrame
    originalCancelRaf = globalThis.cancelAnimationFrame
    installRafStub()
    setLocale('zh-CN')
    EventBus.$on(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, statusLengthListener)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    EventBus.$off(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, statusLengthListener)
    document.body.innerHTML = ''
    ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = originalRaf
    ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = originalCancelRaf
})

describe('挂载装配', () => {
    it('创建编辑器、回填初始内容、注册动作与折叠提供器、标记 perf', async () => {
        await mountEditor({ code: '# 初始内容' })

        expect(M.create).toHaveBeenCalledTimes(1)
        expect(M.editorValue).toBe('# 初始内容')
        expect(M.registerCustomLanguages).toHaveBeenCalledTimes(1)
        expect(M.didChange).toHaveBeenCalledTimes(1)
        expect(M.keyMaps).toHaveBeenCalledTimes(1)
        expect(M.addActions).toHaveBeenCalledTimes(1)
        // onMounted 首帧 layout + perf 标记
        expect(M.layout).toHaveBeenCalled()
        expect(M.perfMark).toHaveBeenCalledWith('editor-ready')
        expect(M.perfMeasure).toHaveBeenCalledWith('editor-ready')
        // markdown 折叠提供器（模块级只注册一次）
        expect(M.registerFolding).toHaveBeenCalledWith('markdown', expect.any(Object))
        expect(M.foldingProvider).not.toBeNull()
        // 模块作用域 4 个 IPC + onMounted 的 INIT_SETTING
        expect([...M.ipcHandlers.keys()]).toEqual(
            expect.arrayContaining([
                IPC.MONACO.AFTER_CURSOR,
                IPC.MONACO.TEXT_BLOCK_TEMPLATES,
                IPC.EDITOR.UPDATE_OPTIONS,
                IPC.MONACO.UNDO_REDO,
                IPC.EDITOR.INIT_SETTING
            ])
        )
    })

    it('挂载后主动 invoke GET_SETTING 并应用返回的配置', async () => {
        M.invoke.mockResolvedValue({ fontSize: 14 })
        await mountEditor()

        expect(M.invoke).toHaveBeenCalledWith(IPC.EDITOR.GET_SETTING)
        expect(M.updateEditorOptions).toHaveBeenCalledWith(editorStub, { fontSize: 14 })
    })

    it('GET_SETTING 失败只记录警告，不阻塞挂载', async () => {
        M.invoke.mockRejectedValue(new Error('no handler'))
        await mountEditor()

        expect(M.loggerWarn).toHaveBeenCalledWith(
            'Failed to get editor setting on mount:',
            expect.any(Error)
        )
    })

    it('延迟 100ms 的二次 layout 会执行', async () => {
        await mountEditor()
        const callsAfterMount = M.layout.mock.calls.length
        await new Promise((resolve) => setTimeout(resolve, 120))
        expect(M.layout.mock.calls.length).toBeGreaterThan(callsAfterMount)
    })

    it('第二次挂载时折叠提供器注册幂等早退（不重复注册）', async () => {
        await mountEditor()
        wrapper!.unmount()
        wrapper = null
        M.registerFolding.mockClear()
        await mountEditor()
        expect(M.registerFolding).not.toHaveBeenCalled()
    })
})

describe('IPC 监听器', () => {
    it('AFTER_CURSOR / TEXT_BLOCK_TEMPLATES 转发插入动作，空上下文忽略', async () => {
        await mountEditor()
        ipcHandler(IPC.MONACO.AFTER_CURSOR)(null, 'hello')
        ipcHandler(IPC.MONACO.TEXT_BLOCK_TEMPLATES)(null, '表格')
        expect(M.insertAfterCursor).toHaveBeenCalledTimes(2)
        expect(M.insertAfterCursor).toHaveBeenNthCalledWith(1, editorStub, 'hello')

        M.insertAfterCursor.mockClear()
        ipcHandler(IPC.MONACO.AFTER_CURSOR)(null, '')
        ipcHandler(IPC.MONACO.TEXT_BLOCK_TEMPLATES)(null, '')
        expect(M.insertAfterCursor).not.toHaveBeenCalled()
    })

    it('UPDATE_OPTIONS 按字符串索引 OptMaps 应用选项，未知选项静默', async () => {
        await mountEditor()
        ipcHandler(IPC.EDITOR.UPDATE_OPTIONS)(null, 'fontSize', 16)
        expect(M.optFontSize).toHaveBeenCalledWith(editorStub, 16)

        expect(() => ipcHandler(IPC.EDITOR.UPDATE_OPTIONS)(null, 'not-exist', 1)).not.toThrow()
    })

    it('UNDO_REDO 触发编辑器 trigger', async () => {
        await mountEditor()
        ipcHandler(IPC.MONACO.UNDO_REDO)(null, 'undo')
        expect(M.trigger).toHaveBeenCalledWith('keyboard', 'undo', {})
    })

    it('INIT_SETTING 处理器直接调用 updateEditorOptions', async () => {
        await mountEditor()
        ipcHandler(IPC.EDITOR.INIT_SETTING)(null, { tabSize: 2 })
        expect(M.updateEditorOptions).toHaveBeenCalledWith(editorStub, { tabSize: 2 })
    })
})

describe('props watch', () => {
    it('code 变化时 setValue，值未变时不重复设置', async () => {
        await mountEditor({ code: 'old' })
        M.setModel.mockClear()
        await wrapper!.setProps({ code: 'new' })
        expect(M.editorValue).toBe('new')

        M.editorValue = 'same'
        await wrapper!.setProps({ code: 'same' })
        // 值相同：不再触发 setValue（getValue === newCode）
        expect(M.editorValue).toBe('same')
    })

    it('filePath 变化：销毁旧 model、创建新 model 并 setModel', async () => {
        await mountEditor()
        const firstModel = makeModel(['a'])
        M.getModelByUri.mockReturnValueOnce(null)
        // 首次设置路径：getModel(uri) 为空 → createModel
        await wrapper!.setProps({ filePath: 'C:\\notes\\a.md' })
        expect(M.uriParse).toHaveBeenCalled()
        expect(M.createModel).toHaveBeenCalledWith('', 'markdown', expect.any(Object))
        expect(M.setModel).toHaveBeenCalledTimes(1)

        // 再次切换：旧 model 存在 → dispose；新路径复用已存在 model（不重复 create）
        const secondModel = makeModel(['b'])
        M.getModelByUri.mockImplementation((uri: { toString(): string }) =>
            String(uri).includes('a.md') ? firstModel : secondModel
        )
        M.createModel.mockClear()
        await wrapper!.setProps({ filePath: 'C:\\notes\\b.md' })
        expect(firstModel.dispose).toHaveBeenCalledTimes(1)
        expect(M.createModel).not.toHaveBeenCalled()
        expect(M.setModel).toHaveBeenCalledTimes(2)
    })

    it('UNC 路径的 4 斜杠 file:// URL 修正为 2 斜杠，避免 Monaco Uri.parse 抛错', async () => {
        await mountEditor()
        await wrapper!.setProps({ filePath: '\\\\server\\share\\a.md' })
        const parsedValues = M.uriParse.mock.calls.map((call) => String(call[0]))
        expect(parsedValues.some((value) => value.startsWith('file://server/share/a.md'))).toBe(
            true
        )
        expect(parsedValues.some((value) => value.startsWith('file:////'))).toBe(false)
    })

    it('editorAreaWidth 变化：rAF 合帧，每帧最多 layout 一次', async () => {
        await mountEditor()
        M.layout.mockClear()

        await wrapper!.setProps({ editorAreaWidth: '60%' })
        expect(rafState.callbacks).toHaveLength(1)
        await wrapper!.setProps({ editorAreaWidth: '61%' })
        // 已有待执行帧：不重复调度
        expect(rafState.callbacks).toHaveLength(1)
        expect(M.layout).not.toHaveBeenCalled()

        flushRafFrame()
        expect(M.layout).toHaveBeenCalledTimes(1)

        await wrapper!.setProps({ editorAreaWidth: '62%' })
        expect(rafState.callbacks).toHaveLength(1)
        flushRafFrame()
        expect(M.layout).toHaveBeenCalledTimes(2)
    })

    it('无 rAF 环境退化为立即 layout', async () => {
        ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined
        await mountEditor()
        M.layout.mockClear()
        await wrapper!.setProps({ editorAreaWidth: '70%' })
        expect(M.layout).toHaveBeenCalledTimes(1)
    })
})

describe('EventBus 事件动作', () => {
    it('更新上下文字体/标题格式走 UpdateContext', async () => {
        await mountEditor()
        EventBus.$emit(EVENT_BUS.MONACO_UPDATE_HEADER_FORMAT, 'h1')
        EventBus.$emit(EVENT_BUS.MONACO_UPDATE_FONT_FORMAT, 'mono')
        expect(M.updateContext).toHaveBeenNthCalledWith(1, editorStub, 'h1')
        expect(M.updateContext).toHaveBeenNthCalledWith(2, editorStub, 'mono')
    })

    it('插入文本 / 定位行 / 重排事件', async () => {
        await mountEditor()
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, '插入内容')
        expect(M.insertAfterCursor).toHaveBeenCalledWith(editorStub, '插入内容')

        EventBus.$emit(EVENT_BUS.MONACO_LOCATE_TARGET_LINE, { lineNumber: 3 })
        expect(M.revealLines).toHaveBeenCalledWith(3, 23, 0)

        M.layout.mockClear()
        EventBus.$emit(EVENT_BUS.MONACO_RELAYOUT)
        expect(rafState.callbacks).toHaveLength(1)
        flushRafFrame()
        expect(M.layout).toHaveBeenCalledTimes(1)
    })

    it('折叠：fold-all / expand-all / fold-level 层级钳制', async () => {
        await mountEditor()
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'fold-all' })
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldAll', null)

        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'expand-all' })
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.unfoldAll', null)

        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'fold-level', level: 5 })
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldLevel5', null)

        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'fold-level', level: 0 })
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldLevel1', null)

        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD, { mode: 'fold-level', level: 99 })
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldLevel7', null)
    })

    it('折叠无 payload：存在折叠区时全部展开', async () => {
        await mountEditor()
        M.contribution = {
            getFoldingModel: async () => ({
                regions: { length: 3, isCollapsed: (index: number) => index === 1 }
            })
        }
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.unfoldAll', null)
    })

    it('折叠无 payload：无折叠区/无控制器/读取失败均降级为全部折叠', async () => {
        await mountEditor()
        // 控制器存在但无折叠区
        M.contribution = {
            getFoldingModel: async () => ({
                regions: { length: 2, isCollapsed: () => false }
            })
        }
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldAll', null)

        // 无控制器
        M.contribution = null
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldAll', null)

        // regions 缺失
        M.contribution = { getFoldingModel: async () => ({}) }
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldAll', null)

        // 内部 API 抛错 → 静默降级
        M.contribution = {
            getFoldingModel: async () => {
                throw new Error('internal api changed')
            }
        }
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldAll', null)

        // getFoldingModel 同步返回 null（无折叠模型）
        M.contribution = { getFoldingModel: () => null }
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.foldAll', null)

        // getFoldingModel 同步返回折叠模型（非 Promise）
        M.contribution = {
            getFoldingModel: () => ({
                regions: { length: 1, isCollapsed: () => true }
            })
        }
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_FOLD)
        await flushPromises()
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'editor.unfoldAll', null)
    })

    it('查找：无 action 时 trigger 兜底；有 action 时 run', async () => {
        await mountEditor()
        M.action = null
        EventBus.$emit(EVENT_BUS.EDITOR_TRIGGER_FIND)
        expect(M.getAction).toHaveBeenCalledWith('actions.find')
        expect(M.trigger).toHaveBeenLastCalledWith('menu', 'actions.find', null)
        expect(M.focus).toHaveBeenCalled()

        const run = vi.fn()
        M.action = { run }
        M.trigger.mockClear()
        EventBus.$emit(EVENT_BUS.EDITOR_TRIGGER_FIND, { mode: 'replace' })
        expect(M.getAction).toHaveBeenCalledWith('editor.action.startFindReplaceAction')
        expect(run).toHaveBeenCalledTimes(1)
        expect(M.trigger).not.toHaveBeenCalled()
    })

    it('跳行：指定行号直接跳转/越界钳制并警告；无 payload 唤起 Monaco 原生跳行输入', async () => {
        await mountEditor()
        M.currentModel = makeModel(['1', '2', '3', '4', '5'])

        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line: 2 })
        expect(M.setPosition).toHaveBeenLastCalledWith({ lineNumber: 2, column: 1 })
        expect(M.revealLineInCenter).toHaveBeenLastCalledWith(2)
        expect(M.loggerWarn).not.toHaveBeenCalled()

        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line: 100 })
        expect(M.setPosition).toHaveBeenLastCalledWith({ lineNumber: 5, column: 1 })
        expect(M.loggerWarn).toHaveBeenCalled()

        // 无 payload（菜单「跳转到行」兜底路径）：唤起 Monaco 自带跳行快捷输入，
        // 原 window.prompt 已移除；action 不存在时用 trigger 兜底
        M.setPosition.mockClear()
        M.trigger.mockClear()
        M.action = null
        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE)
        expect(M.getAction).toHaveBeenCalledWith('editor.action.gotoLine')
        expect(M.trigger).toHaveBeenCalledWith('menu', 'editor.action.gotoLine', null)
        expect(M.focus).toHaveBeenCalled()
        expect(M.setPosition).not.toHaveBeenCalled()

        // action 存在时优先 run()
        const run = vi.fn()
        M.action = { run }
        M.trigger.mockClear()
        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE)
        expect(run).toHaveBeenCalledTimes(1)
        expect(M.trigger).not.toHaveBeenCalled()

        // 非法行号 payload 仍按原行为忽略（不跳转、也不唤起快捷输入）
        M.setPosition.mockClear()
        M.getAction.mockClear()
        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line: 'x' })
        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line: Number.NaN })
        expect(M.setPosition).not.toHaveBeenCalled()
        expect(M.getAction).not.toHaveBeenCalled()

        // 无 model（行数 0）：指定行号仍忽略
        M.currentModel = null
        EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line: 1 })
        expect(M.setPosition).not.toHaveBeenCalled()
    })
})

describe('FUN-09 简易大纲', () => {
    const outlineLines = [
        '# 一级标题',
        '正文',
        '## 二级标题 ##',
        '```js',
        `# ${'长'.repeat(600)}`,
        '### '
    ]

    function outlinePopup(w: VueWrapper) {
        return w.find('.monaco-outline-popup')
    }

    it('提取 ATX 标题：层级/末尾 # 清理/空标题回退/超长行跳过', async () => {
        await mountEditor()
        M.currentModel = makeModel(outlineLines)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()

        const items = wrapper!.findAll('.monaco-outline-item')
        expect(items).toHaveLength(3)
        expect(items[0].text()).toContain('H1')
        expect(items[0].text()).toContain('一级标题')
        expect(items[1].text()).toContain('H2')
        expect(items[1].text()).toContain('二级标题')
        expect(items[1].text()).not.toContain('## 二级标题 ##')
        // 空标题回退为 i18n「无标题」占位
        expect(items[2].text()).toContain('H3')
        expect(items[2].text().trim().length).toBeGreaterThan('H3'.length)
    })

    it('点击大纲项跳转并关闭；再次触发关闭；空标题文档显示空提示', async () => {
        await mountEditor()
        M.currentModel = makeModel(outlineLines)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()

        await wrapper!.findAll('.monaco-outline-item')[1].trigger('click')
        expect(M.setPosition).toHaveBeenLastCalledWith({ lineNumber: 3, column: 1 })
        expect(M.revealLineInCenter).toHaveBeenLastCalledWith(3)
        expect(M.focus).toHaveBeenCalled()
        expect(outlinePopup(wrapper!).exists()).toBe(false)

        // 再次触发：打开 → 再触发关闭
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(true)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(false)

        // 无标题文档：显示空提示
        M.currentModel = makeModel(['普通文本', '```'])
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()
        expect(wrapper!.findAll('.monaco-outline-item')).toHaveLength(0)
        expect(wrapper!.find('.monaco-outline-empty').exists()).toBe(true)
    })

    it('无 model 时大纲为空（不抛错）', async () => {
        await mountEditor()
        M.currentModel = null
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()
        expect(wrapper!.find('.monaco-outline-empty').exists()).toBe(true)
    })

    it('外部点击 / Esc 关闭大纲，内部点击不关闭', async () => {
        await mountEditor()
        M.currentModel = makeModel(['# A'])
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()

        // 内部点击：目标位于 .monaco-outline-popup 内
        const popup = outlinePopup(wrapper!)
        popup.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(true)

        // 外部点击关闭
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(false)

        // Esc 关闭；非 Esc 不关闭
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(true)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(false)

        // 已关闭状态下的外部点击 / Esc 走早退分支（不重复处理）
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(outlinePopup(wrapper!).exists()).toBe(false)
    })
})

describe('内容变化与卸载清理', () => {
    it('内容变化回调：emit update:code 并广播状态栏长度', async () => {
        await mountEditor()
        M.currentModel = makeModel(['hello', 'world'])
        M.changeHandlers[0]()
        await nextTick()

        expect(wrapper!.emitted('update:code')).toEqual([['hello\nworld']])
        expect(statusLengthEvents).toEqual([11])
    })

    it('内容变化时 model 为空则忽略', async () => {
        await mountEditor()
        M.currentModel = null
        M.changeHandlers[0]()
        await nextTick()
        expect(wrapper!.emitted('update:code')).toBeUndefined()
        expect(statusLengthEvents).toEqual([])
    })

    it('window resize 触发布局合帧', async () => {
        await mountEditor()
        M.layout.mockClear()
        window.dispatchEvent(new Event('resize'))
        expect(rafState.callbacks).toHaveLength(1)
        flushRafFrame()
        expect(M.layout).toHaveBeenCalledTimes(1)
    })

    it('卸载时清理 IPC/document/window 监听、销毁 model 与编辑器、取消未执行帧', async () => {
        await mountEditor()
        M.currentModel = makeModel(['a'])
        const attachedModel = makeModel(['b'], true)
        const detachedModel = makeModel(['c'], false)
        M.getModels.mockReturnValue([attachedModel, detachedModel])

        // 制造一个待执行的 layout 帧，验证卸载时取消
        await wrapper!.setProps({ editorAreaWidth: '80%' })
        expect(rafState.callbacks).toHaveLength(1)

        wrapper!.unmount()
        wrapper = null

        // IPC 监听：AFTER_CURSOR/TEXT_BLOCK_TEMPLATES/UPDATE_OPTIONS/UNDO_REDO/INIT_SETTING
        expect(M.ipcRemoveListener).toHaveBeenCalledTimes(5)
        expect(M.ipcRemoveListener).toHaveBeenCalledWith(
            IPC.MONACO.AFTER_CURSOR,
            expect.any(Function)
        )
        // model 先 setModel(null) 再 dispose
        expect(M.setModel).toHaveBeenCalledWith(null)
        expect(M.currentModel.dispose).toHaveBeenCalledTimes(1)
        expect(M.disposeEditor).toHaveBeenCalledTimes(1)
        // 仅销毁未附加到编辑器的 model
        expect(detachedModel.dispose).toHaveBeenCalledTimes(1)
        expect(attachedModel.dispose).not.toHaveBeenCalled()
        // 取消未执行帧
        expect(rafState.cancelled).toHaveLength(1)
    })

    it('无 cancelAnimationFrame 环境下卸载不抛错（帧标记仍复位）', async () => {
        await mountEditor()
        ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = undefined
        await wrapper!.setProps({ editorAreaWidth: '75%' })
        expect(rafState.callbacks).toHaveLength(1)

        expect(() => wrapper!.unmount()).not.toThrow()
        wrapper = null
    })

    it('卸载后 EventBus 监听被清理（事件不再触达已卸载实例）', async () => {
        await mountEditor()
        wrapper!.unmount()
        wrapper = null
        M.insertAfterCursor.mockClear()
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, '不应触达')
        await flushPromises()
        expect(M.insertAfterCursor).not.toHaveBeenCalled()
    })
})
