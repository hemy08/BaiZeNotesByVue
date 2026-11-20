// @vitest-environment jsdom
/**
 * 「重复打开/关闭无累积」生命周期回归（内存与生命周期治理 P3）
 *
 * 用 mock 计数验证两条高频生命周期路径不会随开关次数累积资源：
 * 1. 对话框重复打开/关闭（BaseDialog）：ESC/Tab 的 document keydown 监听必须成对，
 *    顶层对话框栈必须回到 0（token 常驻栈此前会随开关次数增长）；
 * 2. Monaco 编辑器组件重复挂载/卸载：editor 实例与 IPC/DOM 监听必须逐轮释放，
 *    挂载 N 轮后的监听净增必须为 0（每次挂载 5 个 IPC 订阅 -> 卸载 5 个退订）。
 *
 * 隔离策略：monaco-editor 使用最小桩（与 markdown-monaco-dispose.test.ts 一致），
 * worker/语言注册/hemy-editor 副作用模块整体 mock；被测的是组件生命周期实现。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

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
        getModel: vi.fn((): null => null),
        setModel: vi.fn(),
        dispose: vi.fn(),
        getValue: vi.fn((): string => ''),
        setValue: vi.fn(),
        trigger: vi.fn()
    }
    return {
        editorStub,
        create: vi.fn(() => editorStub),
        getModels: vi.fn((): unknown[] => []),
        getModel: vi.fn((): null => null),
        createModel: vi.fn()
    }
})

vi.mock('monaco-editor', () => ({
    editor: {
        create: monacoMock.create,
        getModels: monacoMock.getModels,
        getModel: monacoMock.getModel,
        createModel: monacoMock.createModel,
        ScrollType: { Smooth: 0 }
    },
    Uri: { parse: (value: string) => ({ toString: () => value }) },
    languages: {
        registerFoldingRangeProvider: vi.fn(),
        FoldingRangeKind: { Region: 'region', Comment: 'comment', Imports: 'imports' }
    }
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

import MarkdownMonacoEditor from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'
import BaseDialog from '@renderer/components/dialogs/BaseDialog.vue'
import { getOpenDialogCount } from '@renderer/components/dialogs/dialog-stack'

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let wrappers: Array<ReturnType<typeof mount>> = []

beforeAll(() => {
    ipcRenderer = {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(async () => null),
        removeListener: vi.fn()
    }
    Object.assign(window, { electron: { ipcRenderer } })
})

beforeEach(() => {
    ipcRenderer.on.mockClear()
    ipcRenderer.send.mockClear()
    ipcRenderer.invoke.mockClear()
    ipcRenderer.removeListener.mockClear()
    monacoMock.create.mockClear()
    monacoMock.editorStub.dispose.mockClear()
    monacoMock.editorStub.setModel.mockClear()
    monacoMock.getModels.mockClear()
    document.body.innerHTML = ''
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

function track<T extends ReturnType<typeof mount>>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

describe('BaseDialog：重复打开/关闭不累积（对话框栈 + document 监听）', () => {
    it('开关 10 轮后顶层对话框栈回到 0，document keydown 监听净增为 0', async () => {
        const addSpy = vi.spyOn(document, 'addEventListener')
        const removeSpy = vi.spyOn(document, 'removeEventListener')

        const wrapper = track(
            mount(BaseDialog, {
                global: { stubs: { teleport: true } },
                props: { visible: true, title: '标题' }
            })
        )
        await nextTick()
        expect(getOpenDialogCount()).toBe(1)

        for (let round = 0; round < 10; round += 1) {
            await wrapper.setProps({ visible: false })
            await nextTick()
            expect(getOpenDialogCount()).toBe(0)

            await wrapper.setProps({ visible: true })
            await nextTick()
            expect(getOpenDialogCount()).toBe(1)
        }

        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)
        expect(getOpenDialogCount()).toBe(0)

        const addedKeydown = addSpy.mock.calls.filter((call) => call[0] === 'keydown').length
        const removedKeydown = removeSpy.mock.calls.filter((call) => call[0] === 'keydown').length
        expect(addedKeydown).toBeGreaterThan(0)
        expect(removedKeydown).toBe(addedKeydown)
    })
})

describe('MarkdownMonacoEditor：重复挂载/卸载不累积（实例 + 监听）', () => {
    it('挂载/卸载 5 轮：editor 逐轮 dispose，IPC/窗口/DOM 监听净增为 0', async () => {
        const windowAddSpy = vi.spyOn(window, 'addEventListener')
        const windowRemoveSpy = vi.spyOn(window, 'removeEventListener')
        const documentAddSpy = vi.spyOn(document, 'addEventListener')
        const documentRemoveSpy = vi.spyOn(document, 'removeEventListener')

        for (let round = 0; round < 5; round += 1) {
            const wrapper = mount(MarkdownMonacoEditor, {
                props: { code: '', filePath: '' }
            })
            await flushPromises()
            wrapper.unmount()
        }

        // editor 实例逐轮释放（无实例常驻）
        expect(monacoMock.create).toHaveBeenCalledTimes(5)
        expect(monacoMock.editorStub.dispose).toHaveBeenCalledTimes(5)
        // IPC 订阅/退订成对：净增 0
        expect(ipcRenderer.on.mock.calls.length).toBeGreaterThan(0)
        expect(ipcRenderer.on.mock.calls.length).toBe(ipcRenderer.removeListener.mock.calls.length)
        // 窗口 resize 监听成对
        const addedResize = windowAddSpy.mock.calls.filter((call) => call[0] === 'resize').length
        const removedResize = windowRemoveSpy.mock.calls.filter(
            (call) => call[0] === 'resize'
        ).length
        expect(addedResize).toBeGreaterThan(0)
        expect(addedResize).toBe(removedResize)
        // document click/keydown（大纲关闭监听）成对
        for (const eventName of ['click', 'keydown']) {
            const added = documentAddSpy.mock.calls.filter((call) => call[0] === eventName).length
            const removed = documentRemoveSpy.mock.calls.filter(
                (call) => call[0] === eventName
            ).length
            expect(added).toBeGreaterThan(0)
            expect(added).toBe(removed)
        }
    })
})
