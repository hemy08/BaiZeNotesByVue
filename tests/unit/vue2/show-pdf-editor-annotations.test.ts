// @vitest-environment jsdom
/**
 * ShowPdfEditor.vue — 1.5.2 E2 PDF 标注与摘录 UI 测试
 *
 * 覆盖口径：
 * 1. 能力开关关闭（默认）：不渲染文本层/标注按钮、不调用标注 actions（与既有行为零差异）；
 * 2. 能力开关开启：渲染 pdf.js TextLayer（透明文本层）、标注 toolbar 按钮、加载侧车标注；
 * 3. 文本选择 → 添加标注：selection 矩形相对 canvas 归一化后交给 addPdfAnnotation，
 *    并调度防抖保存（切文件时立即 flush 落盘到旧路径）；
 * 4. 标注列表：空态/条目/摘录/删除/跳页（只显示当前页高亮 overlay）；
 * 5. 运行时开关切换：开启后补建文本层并加载标注；关闭后清理标注 UI。
 *
 * 说明：pdf.js 与 worker URL 均被 mock；jsdom 无 canvas 2D 实现，用替身上下文进入绘制分支；
 * 标注 actions 被替身化（IPC 细节由 pdf-annotations-actions.test.ts 覆盖），本文件只验证
 * 组件接线与用户可见交互。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

const pdfjsMocks = vi.hoisted(() => ({
    getDocument: vi.fn(),
    textLayers: [] as Array<{
        container: HTMLElement
        viewport: { scale: number }
        render: ReturnType<typeof vi.fn>
        cancel: ReturnType<typeof vi.fn>
    }>,
    /** 下一次 TextLayer.render 抛出的错误（单次消费；用于失败/取消路径） */
    nextRenderError: null as unknown,
    /** 下一次 TextLayer.render 先等待该 Promise 落定（用于在途渲染竞态） */
    renderGate: null as Promise<void> | null
}))

const actionMocks = vi.hoisted(() => ({
    load: vi.fn(),
    save: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    excerpt: vi.fn()
}))

const featureMock = vi.hoisted(() => ({
    flags: null as unknown as { pdfAnnotations: boolean }
}))

// pdf.js 替身：TextLayer mock 会向容器注入一个文本 span（模拟官方行为）
vi.mock('pdfjs-dist', () => {
    class MockTextLayer {
        container: HTMLElement
        viewport: { scale: number }
        render = vi.fn(async () => {
            const error = pdfjsMocks.nextRenderError
            pdfjsMocks.nextRenderError = null
            const gate = pdfjsMocks.renderGate
            pdfjsMocks.renderGate = null
            if (gate) {
                await gate
            }
            if (error) {
                throw error
            }
            const span = document.createElement('span')
            span.textContent = 'PDF 文本内容'
            this.container.append(span)
        })
        cancel = vi.fn()
        constructor(options: { container: HTMLElement; viewport: { scale: number } }) {
            this.container = options.container
            this.viewport = options.viewport
            pdfjsMocks.textLayers.push(this)
        }
    }
    return {
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: pdfjsMocks.getDocument,
        TextLayer: MockTextLayer
    }
})
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf-worker-url' }))

// 能力开关替身：reactive 对象，测试内直接改 flags.pdfAnnotations 触发组件 watch
vi.mock('@renderer/composables/useFeatureFlags', async () => {
    const { reactive } = await import('vue')
    featureMock.flags = reactive<{ pdfAnnotations: boolean }>({ pdfAnnotations: false })
    return {
        useFeatureFlags: () => ({
            flags: featureMock.flags,
            isFeatureEnabled: (id: string) =>
                featureMock.flags.pdfAnnotations === (id === 'pdfAnnotations')
        })
    }
})

// 标注 actions 替身：验证组件接线（IPC/提示逻辑见 pdf-annotations-actions.test.ts）
vi.mock('@renderer/common/pdf-annotations-actions', () => ({
    loadPdfAnnotations: actionMocks.load,
    savePdfAnnotations: actionMocks.save,
    addPdfAnnotation: actionMocks.add,
    removePdfAnnotation: actionMocks.remove,
    excerptPdfAnnotation: actionMocks.excerpt
}))

import ShowPdfEditor from '@renderer/components/HemyTools/ShowPdfEditor.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'
import type { PdfAnnotation } from '../../../src/shared/types/pdf-annotations'

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
const mountedWrappers: VueWrapper[] = []

function mountEditor(): VueWrapper {
    const editor = mount(ShowPdfEditor)
    mountedWrappers.push(editor)
    return editor
}

function unmountAll(): void {
    while (mountedWrappers.length > 0) {
        mountedWrappers.pop()?.unmount()
    }
}

function makeAnnotation(overrides: Partial<PdfAnnotation> = {}): PdfAnnotation {
    return {
        id: 'a1',
        page: 1,
        text: '第一页的标注文本',
        createdAt: '2026-01-04T09:05:06.000Z',
        rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }],
        ...overrides
    }
}

function makeFakeDocument(
    numPages = 2,
    options: { withStreamTextContent?: boolean; withTextContent?: boolean } = {}
) {
    const { withStreamTextContent = true, withTextContent = false } = options
    return {
        numPages,
        getPage: vi.fn(async () => {
            const page: Record<string, unknown> = {
                getViewport: ({ scale }: { scale: number }) => ({
                    width: 100 * scale,
                    height: 200 * scale,
                    scale
                }),
                render: () => ({ promise: Promise.resolve(), cancel: vi.fn() })
            }
            // pdfjs-dist 6.x：TextLayer 接受 streamTextContent() 的 ReadableStream
            if (withStreamTextContent) {
                page.streamTextContent = () => ({})
            }
            // 旧版/替身页面：无 streamTextContent，组件应回退 getTextContent()
            if (withTextContent) {
                page.getTextContent = async () => ({ items: [], styles: {} })
            }
            return page
        }),
        destroy: vi.fn()
    }
}

/** 默认成功链路：CHECK_EXISTS=true、READ_BINARY 返回 PDF 字节、getDocument 返回页数文档 */
function mockSuccessfulLoad(
    numPages = 2,
    options: { withStreamTextContent?: boolean; withTextContent?: boolean } = {}
): void {
    const doc = makeFakeDocument(numPages, options)
    pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
    invoke.mockImplementation(async (channel: string) => {
        if (channel === IPC.FILE.CHECK_EXISTS) return true
        if (channel === IPC.FILE.READ_BINARY) return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        return null
    })
}

async function selectPdf(path = 'C:\\docs\\a.pdf', name = 'a.pdf'): Promise<void> {
    EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path, name })
    await flushPromises()
    await nextTick()
    await flushPromises()
    await nextTick()
}

/** 构造 window.getSelection 替身（jsdom 无布局，client rect 由用例给定） */
function stubSelection(
    text: string,
    clientRect: { left: number; top: number; width: number; height: number }
): { removeAllRanges: ReturnType<typeof vi.fn> } {
    const removeAllRanges = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
        isCollapsed: text.length === 0,
        rangeCount: text.length === 0 ? 0 : 1,
        toString: () => text,
        getRangeAt: () => ({ getClientRects: () => [clientRect] }),
        removeAllRanges
    } as unknown as Selection)
    return { removeAllRanges }
}

beforeEach(() => {
    unmountAll()
    vi.clearAllMocks()
    pdfjsMocks.getDocument.mockReset()
    pdfjsMocks.textLayers.length = 0
    pdfjsMocks.nextRenderError = null
    pdfjsMocks.renderGate = null
    featureMock.flags.pdfAnnotations = false
    actionMocks.load.mockResolvedValue([])
    actionMocks.save.mockResolvedValue(true)
    actionMocks.remove.mockImplementation((current: PdfAnnotation[], id: string) =>
        current.filter((item) => item.id !== id)
    )
    invoke = vi.fn()
    send = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke, send, on: vi.fn(), removeListener: vi.fn() }
    })
    // jsdom 无 canvas 2D：返回替身上下文以进入真实绘制/文本层分支
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        {} as unknown as CanvasRenderingContext2D
    )
    // canvas 包围盒：100×200（与 viewport 尺寸一致，便于断言归一化矩形）
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 200,
        right: 100,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({})
    } as DOMRect)
})

afterEach(() => {
    unmountAll()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('能力开关关闭（默认）：与既有行为零差异', () => {
    it('不渲染文本层与标注按钮，不调用标注 actions', async () => {
        mockSuccessfulLoad(2)
        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.pdf-text-layer').exists()).toBe(false)
        expect(editor.find('.pdf-annotation-add-btn').exists()).toBe(false)
        expect(editor.find('.pdf-annotation-list-btn').exists()).toBe(false)
        expect(editor.findAll('.toolbar-btn')).toHaveLength(5)
        expect(pdfjsMocks.textLayers).toHaveLength(0)
        expect(actionMocks.load).not.toHaveBeenCalled()
        expect(actionMocks.save).not.toHaveBeenCalled()
    })
})

describe('能力开关开启：文本层与标注 UI', () => {
    it('渲染 pdf.js TextLayer、两个工具栏按钮，并按路径加载标注', async () => {
        mockSuccessfulLoad(2)
        actionMocks.load.mockResolvedValue([makeAnnotation()])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf('C:\\docs\\a.pdf', 'a.pdf')

        expect(editor.find('.pdf-text-layer').exists()).toBe(true)
        expect(editor.find('.pdf-annotation-add-btn').exists()).toBe(true)
        expect(editor.find('.pdf-annotation-list-btn').exists()).toBe(true)
        expect(editor.findAll('.toolbar-btn')).toHaveLength(7)
        // TextLayer 使用当前 viewport（scale=1 → 100×200），并渲染出可选中的文本 span
        expect(pdfjsMocks.textLayers).toHaveLength(1)
        expect(pdfjsMocks.textLayers[0].viewport.scale).toBe(1)
        expect(pdfjsMocks.textLayers[0].container.querySelectorAll('span')).toHaveLength(1)
        expect(actionMocks.load).toHaveBeenCalledWith('C:\\docs\\a.pdf', { enabled: true })
    })

    it('加载到标注后仅在当前页渲染高亮 overlay', async () => {
        mockSuccessfulLoad(2)
        actionMocks.load.mockResolvedValue([
            makeAnnotation({ id: 'p1', page: 1 }),
            makeAnnotation({ id: 'p2', page: 2 })
        ])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        // 第 1 页：只显示 p1 的 1 个高亮矩形
        expect(editor.findAll('.pdf-annotation-highlight')).toHaveLength(1)

        // 切到第 2 页：高亮重算为 p2
        await editor.findAll('.toolbar-btn')[1].trigger('click')
        await flushPromises()
        expect(editor.findAll('.pdf-annotation-highlight')).toHaveLength(1)
        expect(editor.find('.page-indicator').text()).toBe('2 / 2')
    })
})

describe('文本选择与添加标注', () => {
    it('选中文本后按钮可用；点击后把页码/文本/归一化矩形交给 addPdfAnnotation', async () => {
        mockSuccessfulLoad(2)
        featureMock.flags.pdfAnnotations = true
        const created = makeAnnotation({ id: 'new', page: 1 })
        actionMocks.add.mockReturnValue([created])
        const editor = mountEditor()
        await selectPdf()

        const addButton = editor.find('.pdf-annotation-add-btn')
        expect(addButton.attributes('disabled')).toBeDefined()

        const { removeAllRanges } = stubSelection('选中的 PDF 文本', {
            left: 10,
            top: 20,
            width: 30,
            height: 10
        })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await nextTick()

        expect(editor.find('.pdf-annotation-add-btn').attributes('disabled')).toBeUndefined()
        await editor.find('.pdf-annotation-add-btn').trigger('click')
        await flushPromises()

        expect(actionMocks.add).toHaveBeenCalledTimes(1)
        const [current, input] = actionMocks.add.mock.calls[0] as [
            PdfAnnotation[],
            { page: number; text: string; rects: unknown[] }
        ]
        expect(current).toEqual([])
        expect(input.page).toBe(1)
        expect(input.text).toBe('选中的 PDF 文本')
        expect(input.rects).toEqual([{ x: 0.1, y: 0.1, w: 0.3, h: 0.05 }])
        // 添加后清空浏览器选择，便于继续选择下一段
        expect(removeAllRanges).toHaveBeenCalled()
    })

    it('切换文件时立即 flush 防抖保存（旧路径 + 当前标注列表）', async () => {
        mockSuccessfulLoad(2)
        featureMock.flags.pdfAnnotations = true
        const created = makeAnnotation({ id: 'new', page: 1 })
        actionMocks.add.mockReturnValue([created])
        const editor = mountEditor()
        await selectPdf('C:\\docs\\old.pdf', 'old.pdf')

        stubSelection('选中的 PDF 文本', { left: 0, top: 0, width: 10, height: 10 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await editor.find('.pdf-annotation-add-btn').trigger('click')
        await flushPromises()
        expect(actionMocks.save).not.toHaveBeenCalled()

        // 切到另一个 PDF：onReset 先把挂起的保存按旧路径 flush
        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([])
        await selectPdf('C:\\docs\\new.pdf', 'new.pdf')

        expect(actionMocks.save).toHaveBeenCalledWith('C:\\docs\\old.pdf', [created])
    })
})

describe('标注列表面板', () => {
    it('展开后显示空态；有标注时显示条目、时间、摘录与删除按钮', async () => {
        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([makeAnnotation()])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        expect(editor.find('.pdf-annotation-panel').exists()).toBe(true)
        expect(editor.find('.pdf-annotation-empty').exists()).toBe(false)
        expect(editor.findAll('.pdf-annotation-item')).toHaveLength(1)
        expect(editor.find('.pdf-annotation-text').text()).toContain('第一页的标注文本')
        expect(editor.find('.pdf-annotation-time').text()).toBe('2026-01-04 17:05')
        expect(editor.find('.pdf-annotation-action').exists()).toBe(true)

        // 摘录：把当前标注 + 文件名交给 actions（插入/剪贴板回退由 actions 单测覆盖）
        actionMocks.excerpt.mockResolvedValue('inserted')
        await editor.findAll('.pdf-annotation-action')[0].trigger('click')
        await flushPromises()
        expect(actionMocks.excerpt).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'a1' }),
            'a.pdf'
        )
    })

    it('空标注列表显示空态提示', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        expect(editor.find('.pdf-annotation-empty').exists()).toBe(true)
        expect(editor.findAll('.pdf-annotation-item')).toHaveLength(0)
    })

    it('删除标注：过滤后更新面板并调度保存', async () => {
        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([makeAnnotation()])
        actionMocks.remove.mockReturnValue([])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        const deleteButton = editor.findAll('.pdf-annotation-action')[1]
        expect(deleteButton.text()).toBe('删除')
        await deleteButton.trigger('click')
        await flushPromises()

        expect(actionMocks.remove).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'a1' })],
            'a1'
        )
        expect(editor.findAll('.pdf-annotation-item')).toHaveLength(0)
        expect(editor.find('.pdf-annotation-empty').exists()).toBe(true)
    })

    it('点击页码标签跳转到标注所在页（面板保持展开）', async () => {
        mockSuccessfulLoad(3)
        actionMocks.load.mockResolvedValue([makeAnnotation({ id: 'p3', page: 3 })])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        await editor.find('.pdf-annotation-page-chip').trigger('click')
        await flushPromises()

        expect(editor.find('.page-indicator').text()).toBe('3 / 3')
        expect(editor.find('.pdf-annotation-panel').exists()).toBe(true)
    })
})

describe('运行时能力开关切换', () => {
    it('PDF 已打开后开启：补建文本层并加载标注；关闭后清理标注 UI', async () => {
        mockSuccessfulLoad(2)
        const editor = mountEditor()
        await selectPdf()
        expect(editor.find('.pdf-text-layer').exists()).toBe(false)
        expect(actionMocks.load).not.toHaveBeenCalled()

        // 开启：重绘当前页（重建文本层）+ 加载标注
        featureMock.flags.pdfAnnotations = true
        await flushPromises()
        await nextTick()
        await flushPromises()

        expect(editor.find('.pdf-text-layer').exists()).toBe(true)
        expect(pdfjsMocks.textLayers.length).toBeGreaterThanOrEqual(1)
        expect(actionMocks.load).toHaveBeenCalledWith('C:\\docs\\a.pdf', { enabled: true })

        // 打开列表面板后关闭能力：文本层与面板立即清理
        await editor.find('.pdf-annotation-list-btn').trigger('click')
        expect(editor.find('.pdf-annotation-panel').exists()).toBe(true)
        featureMock.flags.pdfAnnotations = false
        await flushPromises()

        expect(editor.find('.pdf-text-layer').exists()).toBe(false)
        expect(editor.find('.pdf-annotation-panel').exists()).toBe(false)
        expect(editor.find('.pdf-annotation-add-btn').exists()).toBe(false)
    })
})

/** 可手动落定的 Promise（制造在途文本层渲染） */
interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
        resolve = res
    })
    return { promise, resolve }
}

describe('1.5.2 E2 文本层与交互边界', () => {
    it('标注列表关闭按钮收起面板', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')
        expect(editor.find('.pdf-annotation-panel').exists()).toBe(true)

        await editor.find('.pdf-annotation-panel-close').trigger('click')
        expect(editor.find('.pdf-annotation-panel').exists()).toBe(false)
    })

    it('文本层渲染失败仅记录 WARN，不影响 canvas 预览与标注加载', async () => {
        pdfjsMocks.nextRenderError = new Error('text layer boom')
        mockSuccessfulLoad(2)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.error-container').exists()).toBe(false)
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')
        // 文本层容器仍挂载（失败仅降级为不可选择文本）
        expect(editor.find('.pdf-text-layer').exists()).toBe(true)
        expect(actionMocks.load).toHaveBeenCalledWith('C:\\docs\\a.pdf', { enabled: true })
    })

    it('文本层取消异常（AbortException / cancel 消息）静默处理', async () => {
        for (const error of [
            Object.assign(new Error('cancelled'), { name: 'AbortException' }),
            Object.assign(new Error('operation was cancel'), { name: 'Error' })
        ]) {
            pdfjsMocks.nextRenderError = error
            mockSuccessfulLoad(1)
            featureMock.flags.pdfAnnotations = true
            const editor = mountEditor()
            await selectPdf()
            expect(editor.find('.error-container').exists()).toBe(false)
            unmountAll()
        }
    })

    it('页面无 streamTextContent 时回退 getTextContent 创建文本层', async () => {
        mockSuccessfulLoad(1, { withStreamTextContent: false, withTextContent: true })
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.pdf-text-layer').exists()).toBe(true)
        expect(pdfjsMocks.textLayers).toHaveLength(1)
    })

    it('缩放后重建文本层并取消旧层', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        expect(pdfjsMocks.textLayers).toHaveLength(1)
        const firstLayer = pdfjsMocks.textLayers[0]

        // 工具栏按钮（开启能力后第 5 个）为放大
        await editor.findAll('.toolbar-btn')[4].trigger('click')
        await flushPromises()

        expect(pdfjsMocks.textLayers).toHaveLength(2)
        expect(firstLayer.cancel).toHaveBeenCalled()
        expect(pdfjsMocks.textLayers[1].viewport.scale).toBe(1.1)
    })

    it('摘录进行中重复点击被忽略', async () => {
        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([makeAnnotation()])
        actionMocks.excerpt.mockImplementation(() => new Promise(() => {}))
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        const excerptButton = editor.findAll('.pdf-annotation-action')[0]
        await excerptButton.trigger('click')
        await excerptButton.trigger('click')
        await flushPromises()

        expect(actionMocks.excerpt).toHaveBeenCalledTimes(1)
    })

    it('无选择 / 空白选择时添加标注按钮保持禁用', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        // 折叠选择（rangeCount=0）
        stubSelection('', { left: 0, top: 0, width: 10, height: 10 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await nextTick()
        expect(editor.find('.pdf-annotation-add-btn').attributes('disabled')).toBeDefined()

        // 非折叠但纯空白文本
        stubSelection('   ', { left: 0, top: 0, width: 10, height: 10 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await nextTick()
        expect(editor.find('.pdf-annotation-add-btn').attributes('disabled')).toBeDefined()
    })

    it('标注在当前页时点击页码标签不重复渲染', async () => {
        mockSuccessfulLoad(2)
        actionMocks.load.mockResolvedValue([makeAnnotation({ id: 'p1', page: 1 })])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        const doc = (await (
            pdfjsMocks.getDocument.mock.results[0].value as {
                promise: Promise<{ getPage: ReturnType<typeof vi.fn> }>
            }
        ).promise) as { getPage: ReturnType<typeof vi.fn> }
        doc.getPage.mockClear()

        await editor.find('.pdf-annotation-page-chip').trigger('click')
        await flushPromises()

        expect(doc.getPage).not.toHaveBeenCalled()
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')
    })

    it('删除时列表未变化（id 不存在）则跳过保存', async () => {
        mockSuccessfulLoad(1)
        const annotation = makeAnnotation()
        actionMocks.load.mockResolvedValue([annotation])
        // 模拟幂等删除：列表长度不变
        actionMocks.remove.mockReturnValue([annotation])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        await editor.findAll('.pdf-annotation-action')[1].trigger('click')
        await flushPromises()

        expect(editor.findAll('.pdf-annotation-item')).toHaveLength(1)
        expect(actionMocks.save).not.toHaveBeenCalled()
    })

    it('切换文件时在途文本层渲染结果被丢弃并取消', async () => {
        const gate = deferred<void>()
        pdfjsMocks.renderGate = gate.promise
        mockSuccessfulLoad(2)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, {
            path: 'C:\\docs\\slow.pdf',
            name: 'slow.pdf'
        })
        await flushPromises()
        await nextTick()
        expect(pdfjsMocks.textLayers).toHaveLength(1)
        const inFlightLayer = pdfjsMocks.textLayers[0]

        // 在途期间切换到另一个 PDF：旧渲染代次失效
        mockSuccessfulLoad(1)
        await selectPdf('C:\\docs\\next.pdf', 'next.pdf')

        gate.resolve()
        await flushPromises()

        expect(inFlightLayer.cancel).toHaveBeenCalled()
        expect(pdfjsMocks.textLayers.length).toBeGreaterThanOrEqual(2)
        expect(editor.find('.error-container').exists()).toBe(false)
    })

    it('开启后再次关闭：挂起保存立即落盘到原路径', async () => {
        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([])
        const created = makeAnnotation({ id: 'new', page: 1 })
        actionMocks.add.mockReturnValue([created])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        stubSelection('选中的 PDF 文本', { left: 0, top: 0, width: 10, height: 10 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await editor.find('.pdf-annotation-add-btn').trigger('click')
        await flushPromises()
        expect(actionMocks.save).not.toHaveBeenCalled()

        featureMock.flags.pdfAnnotations = false
        await flushPromises()

        expect(actionMocks.save).toHaveBeenCalledWith('C:\\docs\\a.pdf', [created])
    })
})

describe('1.5.2 E2 选择读取与失败防御', () => {
    it('选择矩形宽高为 0 时跳过该矩形（rects 为空仍可添加）', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        stubSelection('选中的 PDF 文本', { left: 10, top: 10, width: 0, height: 0 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await nextTick()

        expect(editor.find('.pdf-annotation-add-btn').attributes('disabled')).toBeUndefined()
        actionMocks.add.mockReturnValue([])
        await editor.find('.pdf-annotation-add-btn').trigger('click')
        await flushPromises()
        expect(actionMocks.add.mock.calls[0][1].rects).toEqual([])
    })

    it('canvas 包围盒为 0 时不换算矩形（rects 为空，文本仍有效）', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            right: 0,
            bottom: 0,
            x: 0,
            y: 0,
            toJSON: () => ({})
        } as DOMRect)
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        stubSelection('选中的 PDF 文本', { left: 0, top: 0, width: 10, height: 10 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await nextTick()

        actionMocks.add.mockReturnValue([])
        await editor.find('.pdf-annotation-add-btn').trigger('click')
        await flushPromises()
        expect(actionMocks.add.mock.calls[0][1].rects).toEqual([])
    })

    it('getSelection 返回 undefined / 空文本时不误启用添加按钮', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        vi.spyOn(window, 'getSelection').mockReturnValue(undefined as unknown as Selection)
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await nextTick()
        expect(editor.find('.pdf-annotation-add-btn').attributes('disabled')).toBeDefined()
    })

    it('addPdfAnnotation 返回 null（非法输入）时不调度保存', async () => {
        mockSuccessfulLoad(1)
        actionMocks.add.mockReturnValue(null)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()

        stubSelection('选中的 PDF 文本', { left: 0, top: 0, width: 10, height: 10 })
        await editor.find('.pdf-text-layer').trigger('mouseup')
        await editor.find('.pdf-annotation-add-btn').trigger('click')
        await flushPromises()

        expect(actionMocks.add).toHaveBeenCalledTimes(1)
        expect(actionMocks.save).not.toHaveBeenCalled()
    })

    it('切换文件后旧标注加载结果被丢弃（不覆盖新文件列表）', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const gate = deferred<PdfAnnotation[]>()
        actionMocks.load.mockReturnValueOnce(gate.promise)
        const editor = mountEditor()
        await selectPdf('C:\\docs\\old.pdf', 'old.pdf')

        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([makeAnnotation({ id: 'new-file', page: 1 })])
        await selectPdf('C:\\docs\\new.pdf', 'new.pdf')

        gate.resolve([makeAnnotation({ id: 'stale', page: 1 })])
        await flushPromises()

        await editor.find('.pdf-annotation-list-btn').trigger('click')
        const items = editor.findAll('.pdf-annotation-item')
        expect(items).toHaveLength(1)
        expect(editor.find('.pdf-annotation-text').text()).toContain('第一页的标注文本')
    })

    it('标注时间非法时原样展示（不显示 Invalid Date）', async () => {
        mockSuccessfulLoad(1)
        actionMocks.load.mockResolvedValue([makeAnnotation({ createdAt: 'not-a-date' })])
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        await editor.find('.pdf-annotation-list-btn').trigger('click')

        expect(editor.find('.pdf-annotation-time').text()).toBe('not-a-date')
    })

    it('关闭能力开关后残留文本层节点派发 mouseup 不致异常', async () => {
        mockSuccessfulLoad(1)
        featureMock.flags.pdfAnnotations = true
        const editor = mountEditor()
        await selectPdf()
        const layerElement = editor.find('.pdf-text-layer').element

        featureMock.flags.pdfAnnotations = false
        await flushPromises()

        expect(() => layerElement.dispatchEvent(new Event('mouseup'))).not.toThrow()
        expect(editor.find('.pdf-annotation-add-btn').exists()).toBe(false)
    })
})
