// @vitest-environment jsdom
/**
 * MarkdownMonacoEditor.vue 折叠提供器测试（CQ-15 非空断言收敛回归 / FUN-09 防回归）
 *
 * 背景：FUN-09 的 markdown 折叠提供器（ATX 标题层级 + 围栏代码块）此前没有任何单测，
 * CQ-15 把 `headingStack.pop()!` 的非空断言改为「先取栈顶 → 判 level → 再 pop」后，
 * 循环语义必须保持不变，因此这里直接驱动真实组件注册到 Monaco 的 provideFoldingRanges
 * 回调，用同一组文档断言折叠范围。
 *
 * 隔离策略：MarkdownMonacoEditor.vue 是真实组件，但其 onMounted 依赖 Monaco 实例与
 * worker/语言注册副作用（node/jsdom 环境不可用）。这里只 mock 外部边界：
 * - monaco-editor 根入口（只保留折叠提供器注册与最小 editor 桩）；
 * - monaco-worker-setup / register-languages / hemy-editor（副作用模块）；
 * 折叠提供器本身是纯函数式逻辑，不做任何替换，确保跑的是组件内真实实现。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/** 折叠范围（Monaco FoldingRange 的最小结构） */
interface FoldingRangeLike {
    start: number
    end: number
    kind: string
}

/** 提供器回调签名（仅本测试用到的 provideFoldingRanges） */
interface FoldingProviderLike {
    provideFoldingRanges(model: {
        getLineCount: () => number
        getLineContent: (line: number) => string
    }): FoldingRangeLike[]
}

/** 假 Monaco 模型：按行数组提供行数/行内容 */
function createModel(lines: string[]): {
    getLineCount: () => number
    getLineContent: (line: number) => string
} {
    return {
        getLineCount: () => lines.length,
        getLineContent: (line: number) => lines[line - 1] ?? ''
    }
}

const monacoMock = vi.hoisted(() => {
    const editorStub = {
        onDidChangeModelContent: vi.fn(),
        // 1.5.0（滚动同步）：编辑器创建后会注册滚动/光标订阅，桩必须提供这两个 API
        onDidScrollChange: vi.fn(),
        onDidChangeCursorPosition: vi.fn(),
        getVisibleRanges: (): Array<{ startLineNumber: number; endLineNumber: number }> => [],
        getScrollTop: (): number => 0,
        getScrollHeight: (): number => 0,
        getLayoutInfo: (): { height: number } => ({ height: 0 }),
        layout: vi.fn(),
        getModel: vi.fn(() => null),
        setModel: vi.fn(),
        dispose: vi.fn(),
        getValue: vi.fn(() => ''),
        setValue: vi.fn(),
        trigger: vi.fn()
    }
    return {
        editorStub,
        registerFoldingRangeProvider: vi.fn(),
        create: vi.fn(() => editorStub),
        getModels: vi.fn(() => [] as unknown[])
    }
})

vi.mock('monaco-editor', () => ({
    languages: {
        registerFoldingRangeProvider: monacoMock.registerFoldingRangeProvider,
        FoldingRangeKind: { Region: 'region', Comment: 'comment', Imports: 'imports' }
    },
    editor: {
        create: monacoMock.create,
        getModels: monacoMock.getModels,
        ScrollType: { Smooth: 0 }
    }
}))

// 副作用模块（worker 注册 / 语言注册 / 编辑器动作）与折叠逻辑无关，统一隔离
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

describe('MarkdownMonacoEditor markdown 折叠提供器（FUN-09）', () => {
    let wrapper: ReturnType<typeof mount> | null = null
    let provider: FoldingProviderLike

    /** 对给定文档行调用真实 provideFoldingRanges 并返回折叠范围 */
    function foldLines(lines: string[]): FoldingRangeLike[] {
        return provider.provideFoldingRanges(createModel(lines))
    }

    beforeAll(async () => {
        // 组件模块作用域会调用 window.electron.ipcRenderer.on，必须在动态 import 前挂好桩
        const ipcRenderer = {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn(async () => null),
            removeListener: vi.fn()
        }
        Object.assign(window, { electron: { ipcRenderer } })

        const { default: MdMonacoEditor } =
            await import('@renderer/components/Markdown/MarkdownMonacoEditor.vue')
        wrapper = mount(MdMonacoEditor)
        // onMounted 内同步注册折叠提供器（早于首个 await），flushPromises 只用于完成挂载副作用
        await flushPromises()

        const calls = monacoMock.registerFoldingRangeProvider.mock.calls as unknown[][]
        expect(calls).toHaveLength(1)
        expect(calls[0][0]).toBe('markdown')
        provider = calls[0][1] as FoldingProviderLike
    })

    afterAll(() => {
        wrapper?.unmount()
        wrapper = null
    })

    it('同级/上级标题关闭开放标题时：等价于「length>0 && 栈顶 level>=level」循环条件', () => {
        const ranges = foldLines(['# A', '## B', 'text', '## C', 'text', '# D'])
        // B 被 C 关闭（2-3）、C 被 D 关闭（4-5）、A 被 D 关闭（1-5）
        expect(ranges).toEqual([
            { start: 1, end: 5, kind: 'region' },
            { start: 2, end: 3, kind: 'region' },
            { start: 4, end: 5, kind: 'region' }
        ])
    })

    it('更高层级标题不关闭任何开放标题（命中 break 分支）', () => {
        // A(1) 遇到 B(2) 时栈顶 level 1 < 2，不得 pop/不得生成范围；B 保持开放到文件末尾
        const ranges = foldLines(['# A', '## B', 'text'])
        expect(ranges).toEqual([
            { start: 1, end: 3, kind: 'region' },
            { start: 2, end: 3, kind: 'region' }
        ])
    })

    it('围栏代码块闭合后生成折叠范围', () => {
        const ranges = foldLines(['```js', 'code', '```'])
        expect(ranges).toEqual([{ start: 1, end: 3, kind: 'region' }])
    })

    it('未闭合围栏在文件末尾生成折叠范围', () => {
        const ranges = foldLines(['```', 'code'])
        expect(ranges).toEqual([{ start: 1, end: 2, kind: 'region' }])
    })

    it('空文档与无标题/围栏文本不产生折叠范围', () => {
        expect(foldLines([])).toEqual([])
        expect(foldLines(['plain text', 'another line'])).toEqual([])
    })

    it('超长行按大文件保护跳过扫描', () => {
        const longLine = `# ${'x'.repeat(600)}`
        expect(foldLines([longLine, '## B', 'text'])).toEqual([
            { start: 2, end: 3, kind: 'region' }
        ])
    })
})
