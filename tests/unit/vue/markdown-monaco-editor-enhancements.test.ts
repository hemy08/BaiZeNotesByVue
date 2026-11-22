// @vitest-environment jsdom
/**
 * MarkdownMonacoEditor 可选能力接线单测（A10 大纲增强 + A6 拼写检查 + A8 disposable 清理
 * + 1.5.2 E1 活动编辑器登记）：
 * - flags.outlinePlus 关闭：保持原 ATX 大纲与样式（无过滤框、setext 不识别）；
 * - flags.outlinePlus 开启：setext 标题/层级缩进/过滤输入框/空结果提示，运行时切换即时刷新；
 * - flags.spellcheck 开启：给 Monaco 实际 textarea 设置 spellcheck/lang，关闭时恢复并移除 lang；
 * - hemy-editor AddActions 返回的句柄在卸载时 dispose；
 * - 1.5.2 E1：编辑器创建后登记为活动编辑器、焦点回调更新登记、卸载时清除登记
 *   （命令面板/工具菜单「剪藏并插入当前笔记」依赖该登记）。
 *
 * 说明：monaco 与 hemy-editor 均以边界 mock，组件内真实逻辑（开关分发/大纲提取/属性切换）
 * 不替换；真实 Monaco 渲染与系统拼写词典由 E2E 覆盖。
 */
import { describe, it, expect, beforeAll, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

interface ModelLike {
    getLineCount(): number
    getLineContent(line: number): string
    getValue(): string
    getValueLength(): number
    getEOL(): string
    dispose(): void
    isAttachedToEditor(): boolean
}

const M = vi.hoisted(() => {
    const state = {
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
        addActionsDispose: vi.fn(),
        optFontSize: vi.fn(),
        registerCustomLanguages: vi.fn(),
        // 可变状态
        editorValue: '',
        currentModel: null as ModelLike | null,
        container: null as HTMLElement | null,
        changeHandlers: [] as Array<() => void>,
        focusHandlers: [] as Array<() => void>,
        ipcHandlers: new Map<string, (...args: unknown[]) => unknown>()
    }
    return state
})

/** 构造假 Monaco model（行数组驱动大纲提取/内容变化） */
function makeModel(lines: string[], attached = false): ModelLike {
    return {
        getLineCount: () => lines.length,
        getLineContent: (line: number) => lines[line - 1] ?? '',
        getValue: () => lines.join('\n'),
        getValueLength: () => lines.join('\n').length,
        getEOL: () => '\n',
        dispose: vi.fn(),
        isAttachedToEditor: () => attached
    }
}

const editorStub = {
    onDidChangeModelContent: (callback: () => void) => {
        M.changeHandlers.push(callback)
    },
    // 1.5.2 E1：活动编辑器登记依赖焦点回调（组件创建时注册）
    onDidFocusEditorText: (callback: () => void) => {
        M.focusHandlers.push(callback)
        return { dispose: vi.fn() }
    },
    onDidScrollChange: vi.fn(),
    onDidChangeCursorPosition: vi.fn(),
    getVisibleRanges: () => [],
    getScrollTop: () => 0,
    getScrollHeight: () => 0,
    getLayoutInfo: () => ({ height: 0 }),
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
        return null
    },
    focus: M.focus,
    setPosition: M.setPosition,
    revealLineInCenter: M.revealLineInCenter,
    revealLines: M.revealLines,
    // A6：组件通过 getDomNode() 找到 Monaco 输入 textarea
    getDomNode: (): HTMLElement | null => M.container
}

M.create.mockImplementation((container: HTMLElement) => {
    M.container = container
    return editorStub
})
M.getModels.mockReturnValue([])
M.getModelByUri.mockReturnValue(null)
M.addActions.mockReturnValue([{ dispose: M.addActionsDispose }])

vi.mock('monaco-editor', () => ({
    languages: {
        registerFoldingRangeProvider: (languageId: string, provider: unknown) => {
            M.registerFolding(languageId, provider)
        },
        FoldingRangeKind: { Region: 'region', Comment: 'comment', Imports: 'imports' }
    },
    editor: {
        create: M.create,
        getModels: M.getModels,
        getModel: M.getModelByUri,
        createModel: (value: string, language: string, uri: { toString(): string }) => {
            M.createModel(value, language, uri)
            return makeModel(value.split('\n'))
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

// 能力开关：mock 为响应式对象，测试可运行时切换以验证「设置保存后即时生效」
vi.mock('@renderer/composables/useFeatureFlags', async () => {
    const { reactive } = await import('vue')
    const flags = reactive({
        tabs: false,
        documentHistory: false,
        markdownLint: false,
        spellcheck: false,
        smartInput: false,
        outlinePlus: false
    })
    return {
        __flags: flags,
        useFeatureFlags: () => ({
            flags,
            isFeatureEnabled: (id: string) => Boolean(flags[id as keyof typeof flags])
        }),
        initFeatureFlags: async () => undefined,
        refreshFeatureFlags: async () => undefined
    }
})

import { nextTick } from 'vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { getActiveEditor } from '@renderer/common/active-editor'
import { setLocale } from '@renderer/common/i18n'
import type MarkdownMonacoEditorType from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'

type MdMonacoEditorComponent = typeof MarkdownMonacoEditorType
type FeatureFlagsState = {
    tabs: boolean
    documentHistory: boolean
    markdownLint: boolean
    spellcheck: boolean
    smartInput: boolean
    outlinePlus: boolean
}

let MdMonacoEditor: MdMonacoEditorComponent
let flags: FeatureFlagsState
let wrapper: VueWrapper | null = null

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
    const flagsModule = (await import('@renderer/composables/useFeatureFlags')) as unknown as {
        __flags: FeatureFlagsState
    }
    flags = flagsModule.__flags
    const module = await import('@renderer/components/Markdown/MarkdownMonacoEditor.vue')
    MdMonacoEditor = module.default
})

/** 挂载组件并完成 onMounted 副作用（invoke / 延迟 layout） */
async function mountEditor(props: Record<string, unknown> = {}): Promise<VueWrapper> {
    const mounted = mount(MdMonacoEditor, {
        props: { code: '', editorAreaWidth: '50%', filePath: '', ...props }
    })
    await flushPromises()
    wrapper = mounted
    return mounted
}

/** 向编辑器容器追加 Monaco 输入 textarea（模拟 Monaco 真实 DOM） */
function appendTextarea(): HTMLTextAreaElement {
    const textarea = document.createElement('textarea')
    textarea.className = 'inputarea'
    M.container!.appendChild(textarea)
    return textarea
}

function outlineItems(current: VueWrapper) {
    return current.findAll('.monaco-outline-item')
}

beforeEach(() => {
    vi.clearAllMocks()
    M.editorValue = ''
    M.currentModel = null
    M.container = null
    M.changeHandlers.length = 0
    M.focusHandlers.length = 0
    M.getModels.mockReturnValue([])
    M.getModelByUri.mockReturnValue(null)
    M.invoke.mockResolvedValue(null)
    M.addActions.mockReturnValue([{ dispose: M.addActionsDispose }])
    flags.spellcheck = false
    flags.outlinePlus = false
    setLocale('zh-CN')
    EventBus.$on(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, () => undefined)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
})

describe('A6 拼写检查（spellcheck 开关）', () => {
    it('关闭态：Monaco textarea 恢复 spellcheck=false 且无 lang 属性', async () => {
        await mountEditor()
        const textarea = appendTextarea()
        // 先开启再关闭，确保经历一次「关闭」同步（开关默认即关闭，不会重复触发）
        flags.spellcheck = true
        await nextTick()
        flags.spellcheck = false
        await nextTick()
        expect(textarea.getAttribute('spellcheck')).toBe('false')
        expect(textarea.hasAttribute('lang')).toBe(false)
    })

    it('运行时开启 → 设置 spellcheck=true/lang', async () => {
        await mountEditor()
        const textarea = appendTextarea()

        flags.spellcheck = true
        await nextTick()
        expect(textarea.getAttribute('spellcheck')).toBe('true')
        expect(textarea.getAttribute('lang')).toBe(navigator.language || 'zh-CN')
    })
})

describe('A10 大纲增强（outlinePlus 开关）', () => {
    // setext 一级 + ATX 二级/三级：覆盖 setext 识别与三级层级缩进
    const setextAndAtxLines = ['文档标题', '===', '## ATX 二级', '正文', '### 三级标题']

    it('关闭态：保持原 ATX 实现（setext 不识别、无过滤框）', async () => {
        flags.outlinePlus = false
        await mountEditor()
        M.currentModel = makeModel(setextAndAtxLines)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()

        expect(wrapper!.find('.monaco-outline-filter').exists()).toBe(false)
        const items = outlineItems(wrapper!)
        // 仅 ATX 标题（"## ATX 二级" 与 "### 三级标题"）
        expect(items).toHaveLength(2)
        expect(items[0].text()).toContain('ATX 二级')
        expect(items[1].text()).toContain('三级标题')
    })

    it('开启态：识别 setext、按归一化层级缩进、提供过滤输入框', async () => {
        flags.outlinePlus = true
        await mountEditor()
        M.currentModel = makeModel(setextAndAtxLines)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()

        expect(wrapper!.find('.monaco-outline-filter').exists()).toBe(true)
        const items = outlineItems(wrapper!)
        expect(items.map((item) => item.text())).toEqual([
            expect.stringContaining('文档标题'),
            expect.stringContaining('ATX 二级'),
            expect.stringContaining('三级标题')
        ])
        // 层级缩进：H1 -> 8px；H2 -> 22px；H3 -> 36px（文档最浅层级归一化为 0）
        expect(items[0].attributes('style')).toContain('padding-left: 8px')
        expect(items[1].attributes('style')).toContain('padding-left: 22px')
        expect(items[2].attributes('style')).toContain('padding-left: 36px')
    })

    it('过滤输入框：按标题文本过滤，无匹配显示空提示', async () => {
        flags.outlinePlus = true
        await mountEditor()
        M.currentModel = makeModel(setextAndAtxLines)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()

        const filter = wrapper!.find('.monaco-outline-filter')
        await filter.setValue('三级')
        await nextTick()
        expect(outlineItems(wrapper!)).toHaveLength(1)
        expect(outlineItems(wrapper!)[0].text()).toContain('三级标题')

        await filter.setValue('不存在的标题')
        await nextTick()
        expect(outlineItems(wrapper!)).toHaveLength(0)
        expect(wrapper!.find('.monaco-outline-empty').exists()).toBe(true)
    })

    it('大纲打开时运行时切换开关会即时刷新条目', async () => {
        flags.outlinePlus = false
        await mountEditor()
        M.currentModel = makeModel(setextAndAtxLines)
        EventBus.$emit(EVENT_BUS.EDITOR_TOGGLE_OUTLINE)
        await nextTick()
        expect(outlineItems(wrapper!)).toHaveLength(2)

        flags.outlinePlus = true
        await nextTick()
        expect(outlineItems(wrapper!)).toHaveLength(3)
        expect(wrapper!.find('.monaco-outline-filter').exists()).toBe(true)
    })
})

describe('A8 disposable 清理', () => {
    it('卸载时释放 AddActions 返回的句柄', async () => {
        await mountEditor()
        expect(M.addActions).toHaveBeenCalledTimes(1)
        wrapper!.unmount()
        wrapper = null
        expect(M.addActionsDispose).toHaveBeenCalledTimes(1)
    })
})

describe('1.5.2 E1 活动编辑器登记（剪藏插入当前笔记）', () => {
    it('创建后登记、焦点回调更新登记、卸载时清除登记', async () => {
        await mountEditor()
        // 编辑器创建后即登记为活动编辑器（命令/菜单动作据此取得插入目标）
        expect(getActiveEditor()).toBe(editorStub)

        // 焦点回调触发后仍登记同一实例（覆盖组件内的焦点更新分支）
        expect(M.focusHandlers.length).toBeGreaterThan(0)
        M.focusHandlers[0]()
        expect(getActiveEditor()).toBe(editorStub)

        wrapper!.unmount()
        wrapper = null
        // 卸载后不再向已销毁实例写入
        expect(getActiveEditor()).toBeNull()
    })
})
