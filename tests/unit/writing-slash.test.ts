// @vitest-environment jsdom
/**
 * P0-6 Slash 命令菜单单测（jsdom）
 *
 * 覆盖三层：
 * 1. 纯函数：触发判定（行首/空白后、URL/路径/行内代码/空格查询不触达）、围栏代码块判定、
 *    命令过滤（复用命令面板过滤算法）、命令执行分发（复用既有格式化/菜单动作）；
 * 2. 展示组件 SlashCommandMenu：渲染、当前项高亮、点击/悬停回传、空状态；
 * 3. 宿主组件集成：输入 `/` 打开菜单、↑↓/Enter/Esc 键盘、点击执行、无匹配/代码块关闭、
 *    与气泡工具栏互斥、输入法组合期不触发、执行后删除 `/query` 文本、生命周期清理。
 *
 * 依赖隔离：hemy-editor-common / menu-actions 以调用契约 mock，Monaco 用最小接口替身。
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
    EditorBubbleToolbar,
    SLASH_COMMANDS,
    SlashCommandMenu,
    executeSlashCommand,
    filterSlashCommands,
    isInsideFencedCodeBlock,
    matchSlashTrigger
} from '@renderer/components/Markdown/writing-bubble'
import { logger } from '@renderer/common/logger'

// ==================== 纯函数：Slash 触发判定 ====================

describe('matchSlashTrigger：Slash 触发判定', () => {
    const triggerOf = (lineText: string, column: number) => matchSlashTrigger(lineText, column)

    it('行首输入 / 立即触发（query 为空）', () => {
        expect(triggerOf('/', 2)).toEqual({ query: '', startColumn: 1 })
    })

    it('行首输入 /query 触发并返回查询文本', () => {
        expect(triggerOf('/tab', 5)).toEqual({ query: 'tab', startColumn: 1 })
        expect(triggerOf('/page-break', 12)).toEqual({ query: 'page-break', startColumn: 1 })
        expect(triggerOf('/h1', 4)).toEqual({ query: 'h1', startColumn: 1 })
    })

    it('空白后的 / 也触发（行首缩进场景）', () => {
        expect(triggerOf('  /tab', 7)).toEqual({ query: 'tab', startColumn: 3 })
        expect(triggerOf('\t/表格', 5)).toEqual({ query: '表格', startColumn: 2 })
    })

    it('支持中文查询（/表格、/标题）', () => {
        expect(triggerOf('/表格', 4)).toEqual({ query: '表格', startColumn: 1 })
        expect(triggerOf('/标题', 4)).toEqual({ query: '标题', startColumn: 1 })
    })

    it('URL / 路径 / 连续斜杠不触发（前一个字符非空白）', () => {
        expect(triggerOf('https://example.com', 20)).toBeNull()
        expect(triggerOf('/a/b', 5)).toBeNull()
        expect(triggerOf('//', 3)).toBeNull()
        expect(triggerOf('C:/docs/a', 10)).toBeNull()
    })

    it('行内代码中的 / 不触发', () => {
        expect(triggerOf('`/cmd`', 6)).toBeNull()
        // 空白后但仍在未闭合行内代码内：由反引号奇偶判定拦截
        expect(triggerOf('`code /cmd`', 11)).toBeNull()
        // 行内代码闭合后重新触发
        expect(triggerOf('`code` /tab', 12)).toEqual({ query: 'tab', startColumn: 8 })
    })

    it('查询文本含空格或特殊符号时不触发（视为普通正文）', () => {
        expect(triggerOf('/tab x', 7)).toBeNull()
        expect(triggerOf('/a.b', 5)).toBeNull()
        expect(triggerOf('/a b', 5)).toBeNull()
    })

    it('无斜杠 / 光标在斜杠前 / 列号非法时返回 null', () => {
        expect(triggerOf('hello', 6)).toBeNull()
        expect(triggerOf('/tab', 1)).toBeNull()
        expect(triggerOf('/tab', 0)).toBeNull()
        expect(triggerOf('/tab', 6)).toBeNull()
        expect(triggerOf('/tab', 2.5)).toBeNull()
        // 行尾（列号 = 长度 + 1）合法
        expect(triggerOf('/tab', 5)).not.toBeNull()
        // 防御：非字符串入参按未命中处理
        expect(matchSlashTrigger(123 as never, 2)).toBeNull()
    })
})

describe('isInsideFencedCodeBlock：围栏代码块判定', () => {
    it('普通正文行不处于代码块内', () => {
        expect(isInsideFencedCodeBlock(['# 标题', '/cmd'], 2)).toBe(false)
    })

    it('未闭合围栏内的行返回 true，闭合后返回 false', () => {
        const lines = ['```', '/cmd', '```', '/after']
        expect(isInsideFencedCodeBlock(lines, 2)).toBe(true)
        expect(isInsideFencedCodeBlock(lines, 4)).toBe(false)
    })

    it('带信息串的开围栏、波浪线围栏、不同字符不互闭', () => {
        expect(isInsideFencedCodeBlock(['```js', '/cmd'], 2)).toBe(true)
        expect(isInsideFencedCodeBlock(['~~~', '/cmd'], 2)).toBe(true)
        // ``` 开启后用 ~~~ 不能闭合
        expect(isInsideFencedCodeBlock(['```', '~~~', '/cmd'], 3)).toBe(true)
    })

    it('闭合围栏长度不短于开启围栏才算闭合', () => {
        expect(isInsideFencedCodeBlock(['````', 'x', '```', '/cmd'], 4)).toBe(true)
        expect(isInsideFencedCodeBlock(['````', 'x', '````', '/cmd'], 4)).toBe(false)
    })

    it('闭合围栏后带非空白字符不算闭合（视为内容）', () => {
        expect(isInsideFencedCodeBlock(['```', 'x', '```js', '/cmd'], 4)).toBe(true)
        expect(isInsideFencedCodeBlock(['```', 'x', '```   ', '/cmd'], 4)).toBe(false)
    })

    it('最多 3 个前导空格的围栏才算围栏', () => {
        expect(isInsideFencedCodeBlock(['   ```', '/cmd'], 2)).toBe(true)
        expect(isInsideFencedCodeBlock(['    ```', '/cmd'], 2)).toBe(false)
    })

    it('行号非法/越界返回 false', () => {
        expect(isInsideFencedCodeBlock(['```', 'x'], 0)).toBe(false)
        expect(isInsideFencedCodeBlock(['```', 'x'], 4)).toBe(false)
        expect(isInsideFencedCodeBlock(['```', 'x'], 2.5)).toBe(false)
        // 防御：行内容非字符串时跳过该行（模型行数组理论上不会出现）
        expect(isInsideFencedCodeBlock([null as never, '```', 'x'], 3)).toBe(true)
    })
})

// ==================== 纯函数：命令过滤与执行 ====================

describe('filterSlashCommands：命令过滤（复用命令面板过滤）', () => {
    const translate = (key: string) => key

    it('空查询返回全部 7 项并保持注册顺序', () => {
        const result = filterSlashCommands(SLASH_COMMANDS, '', translate)
        expect(result.map((command) => command.id)).toEqual([
            'heading',
            'table',
            'math',
            'image',
            'template',
            'divider',
            'link'
        ])
    })

    it('中文标签命中（表格 / 链接）', () => {
        expect(filterSlashCommands(SLASH_COMMANDS, '表格', translate).map((c) => c.id)).toEqual([
            'table'
        ])
        expect(filterSlashCommands(SLASH_COMMANDS, '链接', translate).map((c) => c.id)).toEqual([
            'link'
        ])
    })

    it('英文关键词/拼音命中（table / biaoti / fgx，大小写不敏感）', () => {
        expect(filterSlashCommands(SLASH_COMMANDS, 'table', translate).map((c) => c.id)).toEqual([
            'table'
        ])
        expect(filterSlashCommands(SLASH_COMMANDS, 'TABLE', translate).map((c) => c.id)).toEqual([
            'table'
        ])
        expect(filterSlashCommands(SLASH_COMMANDS, 'biaoti', translate).map((c) => c.id)).toEqual([
            'heading'
        ])
        expect(filterSlashCommands(SLASH_COMMANDS, 'fgx', translate).map((c) => c.id)).toEqual([
            'divider'
        ])
    })

    it('无命中返回空数组', () => {
        expect(filterSlashCommands(SLASH_COMMANDS, 'zzzz', translate)).toEqual([])
    })
})

describe('executeSlashCommand：复用既有动作', () => {
    const editor = {} as never

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('style 命令 → UpdateContextFormat', () => {
        const divider = SLASH_COMMANDS.find((command) => command.id === 'divider')
        expect(divider).toBeDefined()
        const handled = executeSlashCommand(editor, divider as never)
        expect(handled).toBe(true)
        expect(updateContextFormatMock).toHaveBeenCalledWith(editor, 'linescan')
    })

    it('menuAction 命令 → HandleMenuAction（既有菜单动作链路）', () => {
        const table = SLASH_COMMANDS.find((command) => command.id === 'table')
        expect(table).toBeDefined()
        const handled = executeSlashCommand(editor, table as never)
        expect(handled).toBe(true)
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:insert:md-table')
    })

    it('定义不完整时返回 false 且不执行', () => {
        const handled = executeSlashCommand(editor, {
            id: 'unknown',
            labelKey: 'x',
            categoryKey: 'editorUi.commandPalette.category.insert',
            keywords: []
        })
        expect(handled).toBe(false)
        expect(updateContextFormatMock).not.toHaveBeenCalled()
        expect(handleMenuActionMock).not.toHaveBeenCalled()
    })
})

// ==================== 展示组件：SlashCommandMenu ====================

describe('SlashCommandMenu：列表渲染、高亮与选择回传', () => {
    let wrapper: VueWrapper | null = null

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        document.body.innerHTML = ''
    })

    it('渲染命令标签与列表语义，当前项高亮（aria-selected）', async () => {
        wrapper = mount(SlashCommandMenu, {
            props: { commands: SLASH_COMMANDS.slice(0, 3), activeIndex: 1 },
            attachTo: document.body
        })
        const options = wrapper.findAll('[role="option"]')
        expect(options).toHaveLength(3)
        expect(options[0].text()).toBe('一级标题')
        expect(options[1].text()).toBe('表格')
        expect(options[2].text()).toBe('数学公式')
        expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe('命令列表')
        expect(options[0].attributes('aria-selected')).toBe('false')
        expect(options[1].attributes('aria-selected')).toBe('true')
        expect(options[1].classes()).toContain('writing-slash-menu__option--active')
        expect(wrapper.find('.writing-slash-menu__hint').text()).toBe(
            '↑↓ 选择，Enter 执行，Esc 关闭'
        )
    })

    it('点击命令项回传 select 事件', async () => {
        const commands = SLASH_COMMANDS.slice(0, 3)
        wrapper = mount(SlashCommandMenu, {
            props: { commands, activeIndex: 0 },
            attachTo: document.body
        })
        await wrapper.findAll('[role="option"]')[2].trigger('click')
        expect(wrapper.emitted('select')?.[0]).toEqual([commands[2]])
    })

    it('鼠标悬停回传 update:activeIndex 事件', async () => {
        wrapper = mount(SlashCommandMenu, {
            props: { commands: SLASH_COMMANDS.slice(0, 3), activeIndex: 0 },
            attachTo: document.body
        })
        await wrapper.findAll('[role="option"]')[1].trigger('mousemove')
        expect(wrapper.emitted('update:activeIndex')?.[0]).toEqual([1])
    })

    it('空列表展示空状态提示，不渲染 listbox', () => {
        wrapper = mount(SlashCommandMenu, {
            props: { commands: [], activeIndex: 0 },
            attachTo: document.body
        })
        expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
        expect(wrapper.find('.writing-slash-menu__empty').text()).toBe('没有匹配的命令')
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
    hasModel: boolean
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

/** 构造 Slash 场景的编辑器替身（默认：第 1 行为空 `/` 行首、光标在第 2 列） */
function createFakeEditor(overrides: Partial<FakeEditorState> = {}): FakeEditorHandle {
    const domNode = document.createElement('div')
    const state: FakeEditorState = {
        selection: {
            isEmpty: () => true,
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 1,
            endColumn: 2
        },
        position: { lineNumber: 1, column: 2 },
        lines: ['/'],
        focused: true,
        hasModel: true,
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
        getModel: vi.fn(() =>
            state.hasModel
                ? {
                      getLineContent: (lineNumber: number) => state.lines[lineNumber - 1] ?? '',
                      getLinesContent: () => state.lines
                  }
                : null
        ),
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

let wrappers: VueWrapper[] = []

function mountToolbar(editor: FakeEditorHandle['editor'] | null): VueWrapper {
    const wrapper = mount(EditorBubbleToolbar, {
        props: { editor: editor as never },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

/** 打开菜单（行首 `/`）并返回包裹器 */
async function openMenu(): Promise<{ env: FakeEditorHandle; wrapper: VueWrapper }> {
    const env = createFakeEditor()
    const wrapper = mountToolbar(env.editor)
    env.emitContent()
    await nextTick()
    return { env, wrapper }
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

// ==================== 宿主组件：Slash 菜单集成 ====================

describe('EditorBubbleToolbar：Slash 菜单打开与定位', () => {
    it('行首输入 / 打开菜单：渲染 7 条命令并按光标位置定位', async () => {
        const { wrapper } = await openMenu()
        expect(wrapper.find('.writing-slash').exists()).toBe(true)
        const options = wrapper.findAll('[role="option"]')
        expect(options).toHaveLength(7)
        expect(wrapper.find('.writing-slash').attributes('style')).toContain('top: 96px')
        expect(wrapper.find('.writing-slash').attributes('style')).toContain('left: 130px')
        expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe('命令列表')
    })

    it('输入查询文本后过滤命令（/tab → 表格）', async () => {
        const env = createFakeEditor({ position: { lineNumber: 1, column: 5 }, lines: ['/tab'] })
        const wrapper = mountToolbar(env.editor)
        env.emitContent()
        await nextTick()

        const options = wrapper.findAll('[role="option"]')
        expect(options).toHaveLength(1)
        expect(options[0].text()).toBe('表格')
    })

    it('无匹配 / 查询含空格 / URL / 行内代码 / 围栏代码块内均不打开', async () => {
        const cases: Array<Partial<FakeEditorState>> = [
            { lines: ['/zzz'], position: { lineNumber: 1, column: 5 } },
            { lines: ['/tab x'], position: { lineNumber: 1, column: 7 } },
            { lines: ['https://example.com'], position: { lineNumber: 1, column: 20 } },
            { lines: ['`/cmd`'], position: { lineNumber: 1, column: 6 } },
            { lines: ['```', '/tab'], position: { lineNumber: 2, column: 5 } }
        ]
        for (const overrides of cases) {
            const env = createFakeEditor(overrides)
            const wrapper = mountToolbar(env.editor)
            env.emitContent()
            await nextTick()
            expect(wrapper.find('.writing-slash').exists()).toBe(false)
            wrapper.unmount()
            wrappers = wrappers.filter((item) => item !== wrapper)
        }
    })

    it('模型/位置/DOM/光标矩形/视口异常时隐藏菜单', async () => {
        // 无模型
        const noModel = createFakeEditor({ hasModel: false })
        const wrapper = mountToolbar(noModel.editor)
        noModel.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)

        // 无光标位置
        noModel.state.hasModel = true
        noModel.state.position = null
        noModel.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)

        // 无编辑器 DOM
        noModel.state.position = { lineNumber: 1, column: 2 }
        noModel.state.domNode = null
        noModel.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)

        // 光标行不可见
        noModel.state.domNode = document.createElement('div')
        noModel.state.domNode.getBoundingClientRect = () =>
            ({
                top: 50,
                left: 100,
                width: 800,
                height: 600,
                bottom: 650,
                right: 900,
                x: 100,
                y: 50,
                toJSON: () => ({})
            }) as DOMRect
        noModel.state.visiblePosition = null
        noModel.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)

        // 视口宽度为 0（定位纯函数返回 null）
        vi.stubGlobal('innerWidth', 0)
        noModel.state.visiblePosition = { top: 20, left: 30, height: 18 }
        noModel.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })

    it('editor 置空后残留监听回调不再抛错（全部隐藏）', async () => {
        const { env, wrapper } = await openMenu()
        await wrapper.setProps({ editor: null })
        // 直接触发已 dispose 的替身监听：组件内 editor 为 null 分支应安全返回
        expect(() => env.emitContent()).not.toThrow()
        expect(() => env.emitSelection()).not.toThrow()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })
})

describe('EditorBubbleToolbar：Slash 菜单键盘与点击', () => {
    it('↑↓ 循环移动高亮项（阻止 Monaco 默认行为）', async () => {
        const { env, wrapper } = await openMenu()
        const selectedText = () =>
            wrapper
                .findAll('[role="option"]')
                .find((option) => option.attributes('aria-selected') === 'true')
                ?.text()

        const downEvent = env.emitKeydown('ArrowDown')
        await nextTick()
        expect(downEvent.preventDefault).toHaveBeenCalled()
        expect(downEvent.stopPropagation).toHaveBeenCalled()
        expect(selectedText()).toBe('表格')

        env.emitKeydown('ArrowUp')
        await nextTick()
        expect(selectedText()).toBe('一级标题')

        // 首项再 ↑ 循环到末项
        env.emitKeydown('ArrowUp')
        await nextTick()
        expect(selectedText()).toBe('网页链接')

        // 末项再 ↓ 循环回首项
        env.emitKeydown('ArrowDown')
        await nextTick()
        expect(selectedText()).toBe('一级标题')
    })

    it('Enter 执行选中命令：删除 /query 文本并复用既有菜单动作', async () => {
        const { env, wrapper } = await openMenu()
        env.emitKeydown('ArrowDown')
        await nextTick()

        const enterEvent = env.emitKeydown('Enter')
        await nextTick()

        expect(enterEvent.preventDefault).toHaveBeenCalled()
        expect(env.editor.executeEdits).toHaveBeenCalledWith('writing-bubble', [
            {
                range: {
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: 1,
                    endColumn: 2
                },
                text: ''
            }
        ])
        expect(env.editor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 })
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:insert:md-table')
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })

    it('Enter 执行文本格式化命令（/h1 → UpdateContextFormat）', async () => {
        const env = createFakeEditor({ lines: ['/h1'], position: { lineNumber: 1, column: 4 } })
        const wrapper = mountToolbar(env.editor)
        env.emitContent()
        await nextTick()
        expect(wrapper.findAll('[role="option"]')).toHaveLength(1)

        env.emitKeydown('Enter')
        await nextTick()
        expect(updateContextFormatMock).toHaveBeenCalledWith(env.editor, 'h1')
        expect(env.editor.executeEdits).toHaveBeenCalled()
    })

    it('Esc 关闭菜单且不执行、不删除文本', async () => {
        const { env, wrapper } = await openMenu()
        const escapeEvent = env.emitKeydown('Escape')
        await nextTick()

        expect(escapeEvent.preventDefault).toHaveBeenCalled()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
        expect(env.editor.executeEdits).not.toHaveBeenCalled()
        expect(handleMenuActionMock).not.toHaveBeenCalled()
        expect(updateContextFormatMock).not.toHaveBeenCalled()
    })

    it('普通字符按键不拦截（继续输入查询文本）', async () => {
        const { env } = await openMenu()
        const keyEvent = env.emitKeydown('a')
        expect(keyEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('点击命令项执行；鼠标悬停同步高亮', async () => {
        const { env, wrapper } = await openMenu()
        const options = wrapper.findAll('[role="option"]')

        await options[1].trigger('mousemove')
        await nextTick()
        expect(options[1].attributes('aria-selected')).toBe('true')

        await options[1].trigger('click')
        await nextTick()
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:insert:md-table')
        expect(env.editor.executeEdits).toHaveBeenCalled()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })

    it('光标已离开触发行时不删除文本（防御范围失效）', async () => {
        const { env } = await openMenu()
        env.state.position = { lineNumber: 2, column: 1 }
        env.emitKeydown('Enter')
        await nextTick()
        expect(env.editor.executeEdits).not.toHaveBeenCalled()
        expect(updateContextFormatMock).toHaveBeenCalledWith(env.editor, 'h1')
    })

    it('菜单打开期间光标移动会按新位置重算（离开触发行即关闭）', async () => {
        const { env, wrapper } = await openMenu()
        expect(wrapper.find('.writing-slash').exists()).toBe(true)

        env.state.position = { lineNumber: 1, column: 5 }
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })

    it('过滤结果变少后当前高亮索引越界时重置为首项', async () => {
        const { env, wrapper } = await openMenu()
        env.emitKeydown('ArrowDown')
        env.emitKeydown('ArrowDown')
        await nextTick()
        expect(wrapper.findAll('[role="option"]')[2].attributes('aria-selected')).toBe('true')

        env.state.lines = ['/tab']
        env.state.position = { lineNumber: 1, column: 5 }
        env.emitContent()
        await nextTick()
        expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
        expect(wrapper.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('true')
    })

    it('执行命令抛错时记录日志并关闭菜单', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        handleMenuActionMock.mockImplementationOnce(() => {
            throw new Error('menu action failed')
        })
        const { env, wrapper } = await openMenu()
        env.emitKeydown('ArrowDown')
        await nextTick()
        env.emitKeydown('Enter')
        await nextTick()
        expect(errorSpy).toHaveBeenCalled()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })
})

describe('EditorBubbleToolbar：Slash 与气泡互斥 / 输入法 / 生命周期', () => {
    it('Slash 菜单打开时隐藏气泡工具栏（互斥）', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.state.selection = {
            isEmpty: () => false,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1
        }
        env.state.focused = true
        env.emitSelection()
        await nextTick()
        expect(wrapper.find('.writing-bubble').exists()).toBe(true)

        env.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(true)
        expect(wrapper.find('.writing-bubble').exists()).toBe(false)
    })

    it('输入法组合期不触发菜单，组合结束后恢复', async () => {
        const env = createFakeEditor()
        const wrapper = mountToolbar(env.editor)
        env.emitCompositionStart()
        env.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)

        env.emitCompositionEnd()
        env.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(true)
    })

    it('滚动 / 失焦时关闭菜单', async () => {
        const { env, wrapper } = await openMenu()
        env.emitScroll()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)

        env.emitContent()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(true)
        env.emitBlur()
        await nextTick()
        expect(wrapper.find('.writing-slash').exists()).toBe(false)
    })

    it('组件卸载后 dispose 全部编辑器监听', async () => {
        const { env, wrapper } = await openMenu()
        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)
        for (const disposable of env.disposables) {
            expect(disposable.dispose).toHaveBeenCalledTimes(1)
        }
    })
})
