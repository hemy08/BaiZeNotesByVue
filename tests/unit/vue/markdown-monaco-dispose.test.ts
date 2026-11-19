// @vitest-environment jsdom
/**
 * MarkdownMonacoEditor 的 Monaco model/editor 释放回归（P1 性能基线化「大文档/内存」项）。
 *
 * 背景：Monaco 的 ITextModel 与 editor 实例若不显式 dispose，会持有文档全文与撤销栈，
 * 长时间编辑大文档后切换文件/卸载主界面会累积内存。组件 onBeforeUnmount 的释放协议为：
 *   1) editorInstance.setModel(null)（先分离）；
 *   2) 当前 model.dispose()；
 *   3) editorInstance.dispose()；
 *   4) 仅兜底销毁「未附加到编辑器」的残留 model（不得误伤仍附加的 model）。
 * 另外切换文件时 watch 会先销毁旧路径 model，再为新路径复用/创建 model。
 *
 * 隔离策略（与 markdown-monaco-folding.test.ts 一致）：mock monaco-editor 的最小边界 +
 * worker/language/hemy-editor 副作用模块；真实被测逻辑是本组件的生命周期实现。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/** 最小 model 桩：dispose / isAttachedToEditor 为断言点 */
interface ModelStub {
    name: string
    dispose: ReturnType<typeof vi.fn>
    isAttachedToEditor: ReturnType<typeof vi.fn>
}

/** 组件测试使用的模型集合（用例间复用 mock，调用记录在 beforeEach 清空） */
const monacoMock = vi.hoisted(() => {
    function createModelStub(name: string, attached = false): ModelStub {
        return {
            name,
            dispose: vi.fn(),
            isAttachedToEditor: vi.fn(() => attached)
        }
    }
    const models = {
        current: createModelStub('current', true),
        oldFile: createModelStub('old-file', false),
        newFile: createModelStub('new-file', false),
        orphan: createModelStub('orphan', false),
        otherAttached: createModelStub('other-attached', true)
    }
    const editorStub = {
        onDidChangeModelContent: vi.fn(),
        layout: vi.fn(),
        getModel: vi.fn((): ModelStub | null => null),
        setModel: vi.fn(),
        dispose: vi.fn(),
        getValue: vi.fn((): string => ''),
        setValue: vi.fn(),
        trigger: vi.fn()
    }
    return {
        models,
        editorStub,
        registerFoldingRangeProvider: vi.fn(),
        create: vi.fn(() => editorStub),
        getModels: vi.fn((): ModelStub[] => [models.orphan, models.otherAttached]),
        getModel: vi.fn((): ModelStub | null => null),
        createModel: vi.fn((): ModelStub => models.newFile)
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
    Uri: {
        parse: (value: string) => ({ toString: () => value })
    },
    languages: {
        registerFoldingRangeProvider: monacoMock.registerFoldingRangeProvider,
        FoldingRangeKind: { Region: 'region', Comment: 'comment', Imports: 'imports' }
    }
}))

// 副作用模块：worker 注册 / 语言注册 / 编辑器动作聚合桶（与本用例无关，统一隔离）
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

type MountedWrapper = ReturnType<typeof mount>

describe('MarkdownMonacoEditor Monaco 模型释放（P1 性能基线）', () => {
    let wrapper: MountedWrapper | null = null

    /** 清空全部 mock 调用记录与可变返回值，避免用例间串味 */
    function resetMocks(): void {
        for (const model of Object.values(monacoMock.models)) {
            model.dispose.mockClear()
            model.isAttachedToEditor.mockClear()
            model.isAttachedToEditor.mockReturnValue(
                model === monacoMock.models.current || model === monacoMock.models.otherAttached
            )
        }
        monacoMock.editorStub.onDidChangeModelContent.mockClear()
        monacoMock.editorStub.layout.mockClear()
        monacoMock.editorStub.setModel.mockClear()
        monacoMock.editorStub.dispose.mockClear()
        monacoMock.editorStub.getValue.mockClear()
        monacoMock.editorStub.setValue.mockClear()
        monacoMock.editorStub.getModel.mockReset()
        monacoMock.editorStub.getModel.mockReturnValue(null)
        monacoMock.create.mockClear()
        monacoMock.getModel.mockReset()
        monacoMock.getModel.mockReturnValue(null)
        monacoMock.createModel.mockClear()
        monacoMock.createModel.mockReturnValue(monacoMock.models.newFile)
        monacoMock.getModels.mockClear()
        monacoMock.getModels.mockReturnValue([
            monacoMock.models.orphan,
            monacoMock.models.otherAttached
        ])
    }

    beforeAll(() => {
        // 组件挂载时会访问 window.electron.ipcRenderer，先挂最小桩
        const ipcRenderer = {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn(async () => null),
            removeListener: vi.fn()
        }
        Object.assign(window, { electron: { ipcRenderer } })
    })

    beforeEach(() => {
        resetMocks()
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
    })

    it('卸载时先分离再销毁当前 model，并清理未附加的残留模型（不误伤已附加模型）', async () => {
        wrapper = mount(MarkdownMonacoEditor, { props: { code: '', filePath: '' } })
        await flushPromises()

        // Monaco 真实行为：editor 已创建并持有当前模型；此处模拟其 getModel 返回
        monacoMock.editorStub.getModel.mockReturnValue(monacoMock.models.current)

        wrapper.unmount()
        wrapper = null

        const { editorStub, models } = monacoMock
        // 1) 当前模型：setModel(null) 分离 + dispose
        expect(editorStub.setModel).toHaveBeenCalledWith(null)
        expect(models.current.dispose).toHaveBeenCalledTimes(1)
        // 2) editor 实例 dispose
        expect(editorStub.dispose).toHaveBeenCalledTimes(1)
        // 3) getModels 中的未附加模型被兜底销毁；仍附加的模型不得被误销毁
        expect(models.orphan.dispose).toHaveBeenCalledTimes(1)
        expect(models.otherAttached.dispose).not.toHaveBeenCalled()
        // 4) 释放顺序：先 setModel(null)，再销毁 model，最后销毁 editor
        const orderOf = (calls: number[]): number => calls[0]
        expect(orderOf(editorStub.setModel.mock.invocationCallOrder)).toBeLessThan(
            orderOf(models.current.dispose.mock.invocationCallOrder)
        )
        expect(orderOf(models.current.dispose.mock.invocationCallOrder)).toBeLessThan(
            orderOf(editorStub.dispose.mock.invocationCallOrder)
        )
    })

    it('无当前模型时卸载：不调用 setModel(null)，editor 与未附加模型仍被释放', async () => {
        // getModel 返回 null：模拟 editor 未持有模型（如创建后模型被外部先行释放）
        monacoMock.editorStub.getModel.mockReturnValue(null)
        wrapper = mount(MarkdownMonacoEditor, { props: { code: '', filePath: '' } })
        await flushPromises()

        wrapper.unmount()
        wrapper = null

        expect(monacoMock.editorStub.setModel).not.toHaveBeenCalled()
        expect(monacoMock.editorStub.dispose).toHaveBeenCalledTimes(1)
        // 兜底清理仍执行：仅销毁未附加模型
        expect(monacoMock.models.orphan.dispose).toHaveBeenCalledTimes(1)
        expect(monacoMock.models.otherAttached.dispose).not.toHaveBeenCalled()
    })

    it('切换文件路径时销毁旧 model，并为新路径创建/绑定 model', async () => {
        const oldPathUri = 'file:///notes/a.md'
        monacoMock.editorStub.getModel.mockReturnValue(null)
        monacoMock.getModel.mockImplementation((uri?: { toString(): string }) => {
            const key = uri?.toString() ?? ''
            if (key === oldPathUri) {
                return monacoMock.models.oldFile
            }
            return null
        })
        monacoMock.createModel.mockReturnValue(monacoMock.models.newFile)

        wrapper = mount(MarkdownMonacoEditor, {
            props: { code: '# A', filePath: '/notes/a.md' }
        })
        await flushPromises()

        await wrapper.setProps({ filePath: '/notes/b.md' })
        await flushPromises()

        // 旧路径模型已销毁；新路径模型被创建并绑回 editor
        expect(monacoMock.models.oldFile.dispose).toHaveBeenCalledTimes(1)
        expect(monacoMock.createModel).toHaveBeenCalledTimes(1)
        expect(monacoMock.editorStub.setModel).toHaveBeenCalledWith(monacoMock.models.newFile)
    })
})
