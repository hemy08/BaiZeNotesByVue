// @vitest-environment jsdom
/**
 * P0-6 写作气泡工具栏单测（jsdom）
 *
 * 覆盖两层：
 * 1. 纯函数：浮层定位（翻转/钳制/非法输入）、按钮尺寸推导、按钮动作分发；
 * 2. 组件：编辑器监听生命周期（null 不监听 / 卸载与切换实例全部 dispose）、
 *    选区显示、滚动/失焦/空选区隐藏、按钮点击复用既有格式化/菜单动作、
 *    键盘 Tab 进入工具栏 + Esc 退出、失焦微任务判定（焦点移入工具栏时保留）。
 *
 * 依赖隔离：hemy-editor-common（格式化实现）与 menu-actions（菜单分发）以调用契约 mock，
 * monaco 编辑器以「最小接口替身」驱动，不启动真实 Monaco。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const { updateContextFormatMock, handleMenuActionMock } = vi.hoisted(() => ({
    updateContextFormatMock: vi.fn(),
    handleMenuActionMock: vi.fn()
}))

vi.mock('@renderer/components/Markdown/hemy-editor-common', () => ({
    UpdateContextFormat: updateContextFormatMock
}))
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

import {
    BUBBLE_BUTTONS,
    EditorBubbleToolbar,
    computeBubblePosition,
    computeBubbleToolbarSize,
    computeSlashMenuPosition,
    computeSlashMenuSize,
    executeBubbleAction,
    resolveGap,
    resolveMargin,
    clampValue
} from '@renderer/components/Markdown/writing-bubble'
import { logger } from '@renderer/common/logger'

// ==================== 纯函数：浮层定位 ====================

const VIEWPORT = { width: 1024, height: 768 }

describe('computeBubblePosition：气泡工具栏定位', () => {
    it('上方空间充足时显示在选区行上方（不遮挡文字）', () => {
        const position = computeBubblePosition({
            editorRect: { top: 50, left: 100 },
            lineRect: { top: 20, left: 30, height: 18 },
            bubbleSize: { width: 316, height: 36 },
            viewport: VIEWPORT
        })
        // 锚点 (70, 130)，上方空间 70-8-8=54 ≥ 36 → above；top = 70-8-36 = 26
        expect(position).toEqual({ top: 26, left: 130, placement: 'above' })
    })

    it('上方空间不足时翻转到选区行下方', () => {
        const position = computeBubblePosition({
            editorRect: { top: 0, left: 100 },
            lineRect: { top: 10, left: 30, height: 18 },
            bubbleSize: { width: 316, height: 36 },
            viewport: VIEWPORT
        })
        // 锚点 top=10，上方空间 -6；below = 10+18+8 = 36
        expect(position).toEqual({ top: 36, left: 130, placement: 'below' })
    })

    it('水平方向超右边界时钳制到视口内（左/上同理）', () => {
        const position = computeBubblePosition({
            editorRect: { top: 50, left: 1000 },
            lineRect: { top: 20, left: 30, height: 18 },
            bubbleSize: { width: 316, height: 36 },
            viewport: VIEWPORT
        })
        // maxLeft = 1024 - 8 - 316 = 700
        expect(position?.left).toBe(700)
    })

    it('支持自定义间距与边距', () => {
        const position = computeBubblePosition({
            editorRect: { top: 50, left: 100 },
            lineRect: { top: 100, left: 30, height: 18 },
            bubbleSize: { width: 316, height: 36 },
            viewport: VIEWPORT,
            gap: 2,
            margin: 20
        })
        // 锚点 top=150；above = 150-2-36 = 112（left 130 在边距内）
        expect(position).toEqual({ top: 112, left: 130, placement: 'above' })
    })

    it('底部空间不足时 at least 钳制到视口内不会越界', () => {
        const position = computeBubblePosition({
            editorRect: { top: 700, left: 100 },
            lineRect: { top: 100, left: 30, height: 18 },
            bubbleSize: { width: 316, height: 36 },
            viewport: VIEWPORT
        })
        // maxTop = 768 - 8 - 36 = 724 → 794 被钳制到 724
        expect(position?.top).toBe(724)
    })

    it('视口/浮层尺寸非法（0 或 NaN）时返回 null', () => {
        const base = {
            editorRect: { top: 50, left: 100 },
            lineRect: { top: 20, left: 30, height: 18 },
            bubbleSize: { width: 316, height: 36 }
        }
        expect(computeBubblePosition({ ...base, viewport: { width: 0, height: 768 } })).toBeNull()
        expect(
            computeBubblePosition({ ...base, viewport: { width: 1024, height: Number.NaN } })
        ).toBeNull()
        expect(
            computeBubblePosition({
                ...base,
                bubbleSize: { width: 0, height: 36 },
                viewport: VIEWPORT
            })
        ).toBeNull()
        expect(
            computeBubblePosition({
                ...base,
                bubbleSize: { width: 316, height: Number.POSITIVE_INFINITY },
                viewport: VIEWPORT
            })
        ).toBeNull()
    })

    it('编辑器/行锚点非法（NaN、负高度）时返回 null', () => {
        const base = {
            bubbleSize: { width: 316, height: 36 },
            viewport: VIEWPORT
        }
        expect(
            computeBubblePosition({
                ...base,
                editorRect: { top: Number.NaN, left: 0 },
                lineRect: { top: 20, left: 30, height: 18 }
            })
        ).toBeNull()
        expect(
            computeBubblePosition({
                ...base,
                editorRect: { top: 0, left: 0 },
                lineRect: { top: 20, left: 30, height: -1 }
            })
        ).toBeNull()
    })

    it('resolveGap / resolveMargin / clampValue 对非法输入回落默认值', () => {
        expect(resolveGap()).toBe(8)
        expect(resolveGap(-1)).toBe(8)
        expect(resolveGap(Number.NaN)).toBe(8)
        expect(resolveGap(0)).toBe(0)
        expect(resolveMargin()).toBe(8)
        expect(resolveMargin(-5)).toBe(8)
        expect(resolveMargin(12)).toBe(12)
        expect(clampValue(5, 10, 20)).toBe(10)
        expect(clampValue(50, 10, 20)).toBe(20)
        // max < min 时取下限，保证有限值
        expect(clampValue(15, 10, 5)).toBe(10)
    })
})

describe('尺寸推导：气泡工具栏 / Slash 菜单', () => {
    it('气泡工具栏尺寸由按钮数量推导（11 个按钮 = 316×36，与 CSS 常量一致）', () => {
        expect(BUBBLE_BUTTONS).toHaveLength(11)
        expect(computeBubbleToolbarSize(11)).toEqual({ width: 316, height: 36 })
        // 非法数量按 0 处理，只剩内边距与边框
        expect(computeBubbleToolbarSize(-3)).toEqual({ width: 10, height: 36 })
        expect(computeBubbleToolbarSize(1.5)).toEqual({ width: 10, height: 36 })
    })

    it('Slash 菜单尺寸按条数估算并封顶 240', () => {
        expect(computeSlashMenuSize(7)).toEqual({ width: 240, height: 228 })
        expect(computeSlashMenuSize(1)).toEqual({ width: 240, height: 72 })
        expect(computeSlashMenuSize(20)).toEqual({ width: 240, height: 240 })
        expect(computeSlashMenuSize(-1)).toEqual({ width: 240, height: 46 })
    })

    it('Slash 菜单：下方空间不足时翻转到光标行上方', () => {
        const position = computeSlashMenuPosition({
            editorRect: { top: 600, left: 100 },
            cursorRect: { top: 100, left: 30, height: 18 },
            menuSize: { width: 240, height: 228 },
            viewport: VIEWPORT
        })
        // below = 600+100+18+8 = 726 > maxTop(768-8-228=532)；
        // above = 700-8-228 = 464 ≥ minTop(8) → 翻转
        expect(position).toEqual({ top: 464, left: 130, placement: 'above' })
    })

    it('Slash 菜单：下方空间不足时翻转到上方（上方也放不下时仍钳制在视口内）', () => {
        const flipped = computeSlashMenuPosition({
            editorRect: { top: 600, left: 100 },
            cursorRect: { top: 100, left: 30, height: 18 },
            menuSize: { width: 240, height: 228 },
            viewport: VIEWPORT
        })
        // below = 600+100+18+8 = 726 > maxTop(768-8-228=532)；
        // above = 700-8-228 = 464 ≥ minTop(8) → 翻转
        expect(flipped).toEqual({ top: 464, left: 130, placement: 'above' })

        // 上下都放不下（视口高 100 < 菜单高 240）→ 仍放下方并钳制到上边距
        const clamped = computeSlashMenuPosition({
            editorRect: { top: 0, left: 100 },
            cursorRect: { top: 0, left: 30, height: 18 },
            menuSize: { width: 240, height: 240 },
            viewport: { width: 1024, height: 100 }
        })
        expect(clamped).toEqual({ top: 8, left: 130, placement: 'below' })
    })

    it('Slash 菜单：非法输入返回 null', () => {
        expect(
            computeSlashMenuPosition({
                editorRect: { top: 0, left: 0 },
                cursorRect: { top: 0, left: 0, height: 18 },
                menuSize: { width: 240, height: 0 },
                viewport: VIEWPORT
            })
        ).toBeNull()
        expect(
            computeSlashMenuPosition({
                editorRect: { top: 0, left: Number.NaN },
                cursorRect: { top: 0, left: 0, height: 18 },
                menuSize: { width: 240, height: 100 },
                viewport: VIEWPORT
            })
        ).toBeNull()
    })
})

// ==================== 纯函数：按钮动作分发 ====================

describe('executeBubbleAction：复用既有动作', () => {
    const editor = {} as never

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('format 按钮 → UpdateContextFormat(editor, style)', () => {
        const handled = executeBubbleAction(editor, {
            id: 'bold',
            labelKey: 'editorUi.toolbar.bold',
            glyph: 'B',
            kind: 'format',
            style: 'bold'
        })
        expect(handled).toBe(true)
        expect(updateContextFormatMock).toHaveBeenCalledWith(editor, 'bold')
    })

    it('menu 按钮 → HandleMenuAction(menuAction)', () => {
        const handled = executeBubbleAction(editor, {
            id: 'link',
            labelKey: 'editorUi.toolbar.webLinks',
            glyph: '🔗',
            kind: 'menu',
            menuAction: 'baize:menu:insert:web-link'
        })
        expect(handled).toBe(true)
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:insert:web-link')
    })

    it('定义不完整（缺 style/menuAction）时不执行并返回 false', () => {
        expect(
            executeBubbleAction(editor, {
                id: 'unknown',
                labelKey: 'x',
                glyph: '?',
                kind: 'format'
            })
        ).toBe(false)
        expect(
            executeBubbleAction(editor, { id: 'unknown', labelKey: 'x', glyph: '?', kind: 'menu' })
        ).toBe(false)
        expect(updateContextFormatMock).not.toHaveBeenCalled()
        expect(handleMenuActionMock).not.toHaveBeenCalled()
    })
})

// ==================== 编辑器最小接口替身 ====================

interface FakeSelection {
    isEmpty(): boolean
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}

interface FakeKeyboardEvent {
    browserEvent: { key: string }
    shiftKey: boolean
    ctrlKey: boolean
    altKey: boolean
    metaKey: boolean
    preventDefault: ReturnType<typeof vi.fn>
    stopPropagation: ReturnType<typeof vi.fn>
}

interface FakeEditorState {
    selection: FakeSelection | null
    position: { lineNumber: number; column: number } | null
    lines: string[]
    focused: boolean
    editorRect: { top: number; left: number }
    visiblePosition: { top: number; left: number; height: number } | null
    domNode: HTMLElement | null
}

interface FakeListeners {
    selection: Array<() => void>
    content: Array<() => void>
    scroll: Array<() => void>
    blur: Array<() => void>
    focus: Array<() => void>
    compositionStart: Array<() => void>
    compositionEnd: Array<() => void>
    keydown: Array<(event: FakeKeyboardEvent) => void>
}

interface FakeEditorHandle {
    editor: Record<string, unknown>
    state: FakeEditorState
    listeners: FakeListeners
    disposables: Array<{ dispose: ReturnType<typeof vi.fn> }>
    emitSelection(): void
    emitContent(): void
    emitScroll(): void
    emitBlur(): void
    emitFocus(): void
    emitCompositionStart(): void
    emitCompositionEnd(): void
    emitKeydown(key: string, modifiers?: Partial<FakeKeyboardEvent>): FakeKeyboardEvent
}

/** 构造一个「默认选中 hello 且聚焦」的编辑器替身（可按用例覆盖任意字段） */
function createFakeEditor(overrides: Partial<FakeEditorState> = {}): FakeEditorHandle {
    const domNode = document.createElement('div')
    const state: FakeEditorState = {
        selection: {
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 6
        },
        position: { lineNumber: 1, column: 2 },
        lines: ['hello'],
        focused: true,
        editorRect: { top: 50, left: 100 },
        visiblePosition: { top: 20, left: 30, height: 18 },
        domNode,
        ...overrides
    }
    const listeners: FakeListeners = {
        selection: [],
        content: [],
        scroll: [],
        blur: [],
        focus: [],
        compositionStart: [],
        compositionEnd: [],
        keydown: []
    }
    const disposables: Array<{ dispose: ReturnType<typeof vi.fn> }> = []
    function makeDisposable(): { dispose: ReturnType<typeof vi.fn> } {
        const disposable = { dispose: vi.fn() }
        disposables.push(disposable)
        return disposable
    }
    function register<K extends keyof FakeListeners>(
        key: K,
        listener: FakeListeners[K][number]
    ): { dispose: ReturnType<typeof vi.fn> } {
        listeners[key].push(listener as never)
        return makeDisposable()
    }
    domNode.getBoundingClientRect = () =>
        ({
            top: state.editorRect.top,
            left: state.editorRect.left,
            width: 800,
            height: 600,
            bottom: state.editorRect.top + 600,
            right: state.editorRect.left + 800,
            x: state.editorRect.left,
            y: state.editorRect.top,
            toJSON: () => ({})
        }) as DOMRect
    if (state.domNode && state.domNode !== domNode) {
        state.domNode.getBoundingClientRect = domNode.getBoundingClientRect
    }
    const editor: Record<string, unknown> = {
        getSelection: vi.fn(() => state.selection),
        getPosition: vi.fn(() => state.position),
        getModel: vi.fn(() => ({
            getLineContent: (lineNumber: number) => state.lines[lineNumber - 1] ?? '',
            getLinesContent: () => state.lines
        })),
        getDomNode: vi.fn(() => state.domNode),
        getScrolledVisiblePosition: vi.fn(() => state.visiblePosition),
        hasTextFocus: vi.fn(() => state.focused),
        executeEdits: vi.fn(),
        setPosition: vi.fn(),
        focus: vi.fn(),
        onDidChangeCursorSelection: (listener: () => void) => register('selection', listener),
        onDidChangeModelContent: (listener: () => void) => register('content', listener),
        onDidScrollChange: (listener: () => void) => register('scroll', listener),
        onDidBlurEditorWidget: (listener: () => void) => register('blur', listener),
        onDidFocusEditorWidget: (listener: () => void) => register('focus', listener),
        onDidCompositionStart: (listener: () => void) => register('compositionStart', listener),
        onDidCompositionEnd: (listener: () => void) => register('compositionEnd', listener),
        onKeyDown: (listener: (event: FakeKeyboardEvent) => void) => register('keydown', listener)
    }
    function emitKeydown(
        key: string,
        modifiers: Partial<FakeKeyboardEvent> = {}
    ): FakeKeyboardEvent {
        const event: FakeKeyboardEvent = {
            browserEvent: { key },
            shiftKey: false,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            ...modifiers
        }
        for (const listener of listeners.keydown) listener(event)
        return event
    }
    return {
        editor,
        state,
        listeners,
        disposables,
        emitSelection: () => listeners.selection.forEach((listener) => listener()),
        emitContent: () => listeners.content.forEach((listener) => listener()),
        emitScroll: () => listeners.scroll.forEach((listener) => listener()),
        emitBlur: () => listeners.blur.forEach((listener) => listener()),
        emitFocus: () => listeners.focus.forEach((listener) => listener()),
        emitCompositionStart: () => listeners.compositionStart.forEach((listener) => listener()),
        emitCompositionEnd: () => listeners.compositionEnd.forEach((listener) => listener()),
        emitKeydown
    }
}

/** 等待微任务 + 宏任务（失焦判定用 queueMicrotask） */
async function flushAsync(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

let wrappers: VueWrapper[] = []

function mountToolbar(editor: FakeEditorHandle['editor'] | null): VueWrapper {
    const wrapper = mount(EditorBubbleToolbar, {
        props: { editor: editor as never },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

beforeEach(() => {
    vi.clearAllMocks()
    updateContextFormatMock.mockReset()
    handleMenuActionMock.mockReset()
})

afterEach(() => {
    for (const wrapper of wrappers) wrapper.unmount()
    wrappers = []
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
})

// ==================== 组件：气泡工具栏 ====================

describe('EditorBubbleToolbar：显隐与定位', () => {
    it('editor 为 null 时不注册监听、不渲染工具栏', async () => {
        const wrapper = mountToolbar(null)
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
        expect(wrapper.findAll('.writing-bubble__btn')).toHaveLength(0)
    })

    it('选区变化（非空 + 聚焦）时显示气泡，位置按视口坐标计算', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        const bubble = wrapper.find('.writing-bubble')
        expect(bubble.exists()).toBe(true)
        expect(bubble.attributes('style')).toContain('top: 26px')
        expect(bubble.attributes('style')).toContain('left: 130px')
        expect(wrapper.findAll('.writing-bubble__btn')).toHaveLength(11)
    })

    it('按钮 aria-label / title 走 i18n（中文界面输出既有 editorUi.toolbar 词条）', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        const bold = wrapper.find('[data-bubble-action="bold"]')
        expect(bold.attributes('aria-label')).toBe('加粗')
        expect(bold.attributes('title')).toBe('加粗')
        expect(wrapper.find('[data-bubble-action="link"]').attributes('aria-label')).toBe(
            '网站链接'
        )
        // 原生 button 保证 Tab/Enter 可操作
        expect(bold.element.tagName).toBe('BUTTON')
        expect(bold.attributes('type')).toBe('button')
    })

    it('空选区 / 编辑器失焦 / 起始行不可见时隐藏', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        env.state.selection = {
            isEmpty: () => true,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1
        }
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        env.state.selection = {
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 6
        }
        env.state.focused = false
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        env.state.focused = true
        env.state.visiblePosition = null
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })

    it('编辑器 DOM 不存在 / 选区为 null / 视口非法时隐藏', async () => {
        const env = createFakeEditor({ domNode: null })
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        env.state.domNode = document.createElement('div')
        env.state.domNode.getBoundingClientRect = () =>
            ({
                top: 0,
                left: 0,
                width: 800,
                height: 600,
                bottom: 600,
                right: 800,
                x: 0,
                y: 0,
                toJSON: () => ({})
            }) as DOMRect
        env.state.selection = null
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        // 视口宽度为 0 → 定位纯函数返回 null → 隐藏（不渲染越界浮层）
        vi.stubGlobal('innerWidth', 0)
        env.state.selection = {
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 6
        }
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })

    it('编辑器滚动时隐藏浮层', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        env.emitScroll()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })

    it('失焦后隐藏（焦点未移入工具栏）', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        env.emitBlur()
        await flushAsync()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })

    it('焦点回到编辑器且选区仍在时重新显示气泡', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        env.emitBlur()
        await flushAsync()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        env.emitFocus()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)
    })

    it('输入法组合输入期间不显示气泡，组合结束后恢复', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        env.emitCompositionStart()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        env.emitContent()
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        env.emitCompositionEnd()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)
    })

    it('window resize 时隐藏浮层', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        window.dispatchEvent(new Event('resize'))
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })
})

describe('EditorBubbleToolbar：按钮动作（复用既有实现）', () => {
    /** 每个按钮期望的既有动作分发 */
    const EXPECTED_STYLE: Record<string, string> = {
        bold: 'bold',
        italic: 'italic',
        deleteline: 'deleteline',
        codeline: 'codeline',
        h1: 'h1',
        h2: 'h2',
        h3: 'h3',
        listbulleted: 'listbulleted',
        listnumbered: 'listnumbered',
        quote: 'fontquote'
    }

    it('文本格式化按钮全部走 UpdateContextFormat', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        for (const [actionId, style] of Object.entries(EXPECTED_STYLE)) {
            updateContextFormatMock.mockClear()
            await wrapper.find(`[data-bubble-action="${actionId}"]`).trigger('click')
            expect(updateContextFormatMock).toHaveBeenCalledWith(env.editor, style)
        }
    })

    it('链接按钮复用既有插入链接菜单动作（打开既有 WebUrlDialog 链路）', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        await wrapper.find('[data-bubble-action="link"]').trigger('click')
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:insert:web-link')
        expect(updateContextFormatMock).not.toHaveBeenCalled()
    })

    it('执行动作抛错时记录日志并隐藏浮层（不向编辑器抛出）', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        updateContextFormatMock.mockImplementationOnce(() => {
            throw new Error('format failed')
        })
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        await wrapper.find('[data-bubble-action="bold"]').trigger('click')
        await nextTick()
        expect(errorSpy).toHaveBeenCalled()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })
})

describe('EditorBubbleToolbar：键盘可达性与生命周期', () => {
    it('Tab 把焦点移入工具栏第一个按钮（Enter 由原生 button 触发）', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        const event = env.emitKeydown('Tab')
        await nextTick()
        expect(event.preventDefault).toHaveBeenCalled()
        expect(event.stopPropagation).toHaveBeenCalled()
        expect(document.activeElement).toBe(wrapper.find('[data-bubble-action="bold"]').element)
    })

    it('气泡不可见时 Tab 不拦截；带修饰键的 Tab 也不拦截', async () => {
        const env = createFakeEditor()
        mountToolbar(env.editor)
        const hiddenEvent = env.emitKeydown('Tab')
        expect(hiddenEvent.preventDefault).not.toHaveBeenCalled()

        env.emitSelection()
        await nextTick()
        const ctrlEvent = env.emitKeydown('Tab', { ctrlKey: true })
        expect(ctrlEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('焦点移入工具栏后失焦微任务不会隐藏浮层；焦点移出时隐藏', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        env.emitKeydown('Tab')
        await nextTick()
        env.emitBlur()
        await flushAsync()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        // relatedTarget 在工具栏内部：不隐藏
        const bubble = wrapper.find('.writing-bubble')
        bubble.element.dispatchEvent(
            new FocusEvent('focusout', {
                relatedTarget: wrapper.find('[data-bubble-action="bold"]').element
            })
        )
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        // relatedTarget 在工具栏外部：隐藏
        bubble.element.dispatchEvent(
            new FocusEvent('focusout', { relatedTarget: document.createElement('button') })
        )
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })

    it('工具栏内 Esc 隐藏浮层并把焦点归还编辑器', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitSelection()
        await nextTick()

        const bubble = wrapper.find('.writing-bubble')
        bubble.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
        expect(env.editor.focus).toHaveBeenCalled()
    })

    it('编辑器实例切换 / 置空时 dispose 全部监听并隐藏浮层', async () => {
        const first = createFakeEditor()
        const wrapper = mountToolbar(first.editor)
        first.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)
        expect(first.disposables).toHaveLength(8)

        await wrapper.setProps({ editor: null })
        await nextTick()
        for (const disposable of first.disposables) {
            expect(disposable.dispose).toHaveBeenCalledTimes(1)
        }
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)

        // 传入新实例：重新注册监听（旧监听不再生效）
        const second = createFakeEditor()
        await wrapper.setProps({ editor: second.editor })
        await nextTick()
        expect(second.disposables).toHaveLength(8)
        second.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)
    })

    it('组件卸载时 dispose 监听并移除 window resize 监听', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        const removeListener = vi.spyOn(window, 'removeEventListener')

        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)

        for (const disposable of env.disposables) {
            expect(disposable.dispose).toHaveBeenCalledTimes(1)
        }
        expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('dispose 抛错不阻断其余监听清理', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.disposables[0].dispose.mockImplementationOnce(() => {
            throw new Error('editor already disposed')
        })
        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)
        expect(env.disposables[1].dispose).toHaveBeenCalledTimes(1)
    })
})
