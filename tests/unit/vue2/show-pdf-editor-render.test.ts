// @vitest-environment jsdom
/**
 * ShowPdfEditor.vue 的 pdf.js 渲染链路补测（既有测试只覆盖「文档加载 + 页码」，
 * 本文件补齐 canvas 绘制、缩放/翻页重绘、渲染取消/失败、竞态与卸载守卫）。
 *
 * 背景：jsdom 无 canvas 2D 实现，既有用例因此跳过绘制分支（组件渲染覆盖率仅 50%）。
 * 本文件 mock `HTMLCanvasElement.prototype.getContext` 返回替身上下文，从而进入
 * renderPage 真实渲染路径，覆盖：
 * 1. 首屏绘制（viewport 尺寸写回 canvas、render 入参、缩放比例）；
 * 2. 缩放上下限（0.3~3.0）与每次缩放重绘；
 * 3. 翻页边界守卫（首页上一页、末页下一页、页数越界）；
 * 4. 「在资源管理器中显示」仅在有文件时发送；
 * 5. 渲染取消异常（RenderingCancelledException）静默；普通渲染失败/取页失败展示错误；
 * 6. 新渲染取消在途任务、旧渲染结果按代次丢弃、卸载后结果丢弃、取消失败忽略；
 * 7. 加载代次守卫：CHECK_EXISTS / READ_BINARY / getDocument 每个 await 后卸载均丢弃结果；
 * 8. 空字节 / 零页文档按不可读处理并销毁加载任务；被新加载取代的旧任务不误清句柄。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

const pdfjsMocks = vi.hoisted(() => ({
    getDocument: vi.fn()
}))

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: pdfjsMocks.getDocument
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf-worker-url' }))

import ShowPdfEditor from '@renderer/components/HemyTools/ShowPdfEditor.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/** 可手动落定的 Promise（用于制造在途渲染/加载） */
interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

/** 单页渲染结果（promise 由用例控制是否立即落定） */
function makePage(render: () => { promise: Promise<void>; cancel: () => void }) {
    return {
        getViewport: vi.fn(({ scale }: { scale: number }) => ({
            width: 100 * scale,
            height: 200 * scale
        })),
        render: vi.fn(render),
        getPage: undefined
    }
}

/** pdf.js 文档替身：按页返回用例给定的页面对象 */
function makeDocument(pages: Array<ReturnType<typeof makePage>>) {
    return {
        numPages: pages.length,
        getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
        destroy: vi.fn()
    }
}

/** 典型的立即成功渲染任务 */
function immediateRender(): { promise: Promise<void>; cancel: () => void } {
    return { promise: Promise.resolve(), cancel: vi.fn() }
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
let context2d: Record<string, unknown>
const mountedWrappers: VueWrapper[] = []

function mountEditor(): VueWrapper {
    const editor = mount(ShowPdfEditor)
    mountedWrappers.push(editor)
    return editor
}

function unmountEditor(editor: VueWrapper): void {
    const index = mountedWrappers.indexOf(editor)
    if (index >= 0) {
        mountedWrappers.splice(index, 1)
    }
    editor.unmount()
}

function unmountAll(): void {
    while (mountedWrappers.length > 0) {
        mountedWrappers.pop()?.unmount()
    }
}

/** 走 EventBus 文件选择入口；等待加载状态落定（在途渲染不会阻塞此等待） */
async function selectPdf(path = 'C:\\docs\\a.pdf', name = 'a.pdf'): Promise<void> {
    EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path, name })
    await flushPromises()
    await nextTick()
    await flushPromises()
}

/** 默认成功链路（文档 N 页、立即渲染完成） */
function mockSuccessfulLoad(pages = 2): ReturnType<typeof makeDocument> {
    const doc = makeDocument(Array.from({ length: pages }, () => makePage(immediateRender)))
    pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
    invoke.mockImplementation(async (channel: string) => {
        if (channel === IPC.FILE.CHECK_EXISTS) return true
        if (channel === IPC.FILE.READ_BINARY) return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        return null
    })
    return doc
}

/** 工具栏按钮顺序：上一页 / 下一页 / 放大 / 缩小 / 资源管理器 */
function toolbarButtons(editor: VueWrapper) {
    const buttons = editor.findAll('.toolbar-btn')
    expect(buttons).toHaveLength(5)
    return {
        prev: buttons[0],
        next: buttons[1],
        zoomIn: buttons[2],
        zoomOut: buttons[3],
        reveal: buttons[4]
    }
}

beforeEach(() => {
    unmountAll()
    pdfjsMocks.getDocument.mockReset()
    invoke = vi.fn()
    send = vi.fn()
    context2d = { canvas: null }
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke, send, on: vi.fn(), removeListener: vi.fn() }
    })
    // jsdom 无 canvas 2D：返回替身上下文以进入真实绘制分支
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context2d as unknown as CanvasRenderingContext2D
    )
})

afterEach(() => {
    unmountAll()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ShowPdfEditor 首屏绘制与缩放', () => {
    it('将第 1 页按 100% 缩放绘制到 canvas，并回写 viewport 尺寸', async () => {
        mockSuccessfulLoad(2)
        const editor = mountEditor()
        await selectPdf()

        const canvas = editor.find('canvas').element as HTMLCanvasElement
        expect(canvas.width).toBe(100)
        expect(canvas.height).toBe(200)
        expect(editor.find('.zoom-level').text()).toBe('100%')
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')

        const doc = pdfjsMocks.getDocument.mock.results[0].value as {
            promise: Promise<ReturnType<typeof makeDocument>>
        }
        const created = await doc.promise
        expect(created.getPage).toHaveBeenCalledWith(1)
        const page = await created.getPage.mock.results[0].value
        expect(page.render).toHaveBeenCalledTimes(1)
        expect(page.render.mock.calls[0][0]).toMatchObject({
            canvasContext: context2d,
            canvas
        })
    })

    it('无 canvas 2D 上下文时跳过绘制但保留文档状态', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        mockSuccessfulLoad(2)
        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.pdf-toolbar').exists()).toBe(true)
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')
        expect(editor.find('.error-container').exists()).toBe(false)
    })

    it('放大到 3.0 上限后不再增大，且每次缩放都重绘', async () => {
        mockSuccessfulLoad(1)
        const editor = mountEditor()
        await selectPdf()
        const { zoomIn } = toolbarButtons(editor)

        for (let i = 0; i < 25; i += 1) {
            await zoomIn.trigger('click')
        }
        await flushPromises()

        expect(editor.find('.zoom-level').text()).toBe('300%')
        const doc = await (
            pdfjsMocks.getDocument.mock.results[0].value as {
                promise: Promise<ReturnType<typeof makeDocument>>
            }
        ).promise
        const page = await doc.getPage.mock.results[0].value
        // 首屏 1 次 + 20 次有效放大（1.0 → 3.0）；超过 3.0 后不再重绘
        expect(page.render).toHaveBeenCalledTimes(21)
        expect(page.getViewport).toHaveBeenLastCalledWith({ scale: 3 })
    })

    it('缩小到 0.3 下限后不再减小', async () => {
        mockSuccessfulLoad(1)
        const editor = mountEditor()
        await selectPdf()
        const { zoomOut } = toolbarButtons(editor)

        for (let i = 0; i < 30; i += 1) {
            await zoomOut.trigger('click')
        }
        await flushPromises()

        expect(editor.find('.zoom-level').text()).toBe('30%')
        const doc = await (
            pdfjsMocks.getDocument.mock.results[0].value as {
                promise: Promise<ReturnType<typeof makeDocument>>
            }
        ).promise
        const page = await doc.getPage.mock.results[0].value
        // 首屏 1 次 + 7 次有效缩小（1.0 → 0.9 → ... → 0.3）；到 0.3 后不再重绘
        expect(page.render).toHaveBeenCalledTimes(8)
    })
})

describe('ShowPdfEditor 翻页边界与资源管理器', () => {
    it('首页上一页无效、末页下一页无效，中间页正常切换并重绘', async () => {
        mockSuccessfulLoad(3)
        const editor = mountEditor()
        await selectPdf()
        const { prev, next } = toolbarButtons(editor)

        await prev.trigger('click')
        await flushPromises()
        expect(editor.find('.page-indicator').text()).toBe('1 / 3')

        await next.trigger('click')
        await flushPromises()
        expect(editor.find('.page-indicator').text()).toBe('2 / 3')

        await prev.trigger('click')
        await flushPromises()
        expect(editor.find('.page-indicator').text()).toBe('1 / 3')

        await next.trigger('click')
        await next.trigger('click')
        await flushPromises()
        expect(editor.find('.page-indicator').text()).toBe('3 / 3')

        await next.trigger('click')
        await flushPromises()
        // 末页：下一页无效
        expect(editor.find('.page-indicator').text()).toBe('3 / 3')

        const doc = await (
            pdfjsMocks.getDocument.mock.results[0].value as {
                promise: Promise<ReturnType<typeof makeDocument>>
            }
        ).promise
        // 第 1/2/1/2/3 页各重绘一次（第 1 页首屏 1 次 + 翻页重绘）
        const renderedPages = doc.getPage.mock.calls.map(([page]) => page)
        expect(renderedPages).toEqual([1, 2, 1, 2, 3])
    })

    it('加载成功后在资源管理器中定位文件', async () => {
        mockSuccessfulLoad(1)
        const editor = mountEditor()
        await selectPdf('C:\\docs\\定位.pdf', '定位.pdf')
        const { reveal } = toolbarButtons(editor)

        await reveal.trigger('click')

        expect(send).toHaveBeenCalledWith(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, 'C:\\docs\\定位.pdf')
    })
})

describe('ShowPdfEditor 渲染失败与取消', () => {
    it('RenderingCancelledException 视为正常路径：静默且不展示错误', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const cancelled = Object.assign(new Error('cancelled'), {
            name: 'RenderingCancelledException'
        })
        const page = makePage(() => ({
            promise: Promise.reject(cancelled),
            cancel: vi.fn()
        }))
        const doc = makeDocument([page])
        pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
        invoke.mockResolvedValue(new Uint8Array([1, 2, 3]))
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.error-container').exists()).toBe(false)
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('普通渲染异常展示加载失败文案并记录日志', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const page = makePage(() => ({
            promise: Promise.reject(new Error('render boom')),
            cancel: vi.fn()
        }))
        const doc = makeDocument([page])
        pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.error-container').exists()).toBe(true)
        expect(editor.text()).toContain('render boom')
        expect(errorSpy).toHaveBeenCalled()
    })

    it('取页失败（getPage 抛错）同样展示加载失败文案', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const doc = {
            numPages: 1,
            getPage: vi.fn(async () => {
                throw new Error('page broken')
            }),
            destroy: vi.fn()
        }
        pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        await selectPdf()

        expect(editor.find('.error-container').exists()).toBe(true)
        expect(editor.text()).toContain('page broken')
        expect(errorSpy).toHaveBeenCalled()
    })

    it('新渲染开始时取消在途渲染任务；取消失败被忽略', async () => {
        const pending = deferred<void>()
        const cancel = vi.fn(() => {
            throw new Error('cancel failed')
        })
        const page = makePage(() => ({ promise: pending.promise, cancel }))
        const doc = makeDocument([page])
        pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        await selectPdf()
        const { zoomIn } = toolbarButtons(editor)

        // 首屏渲染仍在途：放大应取消旧任务（cancel 抛错被忽略）并启动新渲染
        await zoomIn.trigger('click')
        await flushPromises()
        expect(cancel).toHaveBeenCalled()
        expect(editor.find('.error-container').exists()).toBe(false)

        pending.resolve()
        await flushPromises()
    })

    it('旧渲染结果按代次丢弃，不覆盖新渲染', async () => {
        const first = deferred<void>()
        const second = deferred<void>()
        const renders = [first, second]
        let renderIndex = 0
        const page = makePage(() => {
            const current = renders[Math.min(renderIndex, renders.length - 1)]
            renderIndex += 1
            return { promise: current.promise, cancel: vi.fn() }
        })
        const doc = makeDocument([page])
        pdfjsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy: vi.fn() })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        await selectPdf()
        const { zoomIn } = toolbarButtons(editor)
        await zoomIn.trigger('click')

        // 让第 1 次（旧代次）渲染先结束：结果应被代次守卫丢弃
        first.resolve()
        await flushPromises()
        expect(editor.find('.error-container').exists()).toBe(false)
        expect(editor.find('.zoom-level').text()).toBe('110%')

        second.resolve()
        await flushPromises()
        expect(editor.find('.error-container').exists()).toBe(false)
    })

    it('卸载后落定的渲染结果被丢弃且销毁在途任务', async () => {
        const pending = deferred<void>()
        const cancel = vi.fn()
        const page = makePage(() => ({ promise: pending.promise, cancel }))
        const doc = makeDocument([page])
        const loadingTask = { promise: Promise.resolve(doc), destroy: vi.fn() }
        pdfjsMocks.getDocument.mockReturnValue(loadingTask)
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        await selectPdf()

        unmountEditor(editor)
        // 卸载时销毁在途渲染任务与 loadingTask
        expect(cancel).toHaveBeenCalled()
        expect(loadingTask.destroy).toHaveBeenCalled()

        pending.resolve()
        await flushPromises()
        // 卸载后落定的渲染结果被代次/卸载守卫丢弃：不写错误态
        expect(editor.find('.error-container').exists()).toBe(false)
    })
})

describe('ShowPdfEditor 加载代次守卫与不可读文档', () => {
    it('CHECK_EXISTS 返回前卸载：丢弃结果不继续读取', async () => {
        const exists = deferred<boolean>()
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return exists.promise
            return new Uint8Array([1, 2, 3])
        })
        const editor = mountEditor()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\x.pdf', name: 'x.pdf' })
        await flushPromises()
        unmountEditor(editor)
        exists.resolve(true)
        await flushPromises()

        expect(pdfjsMocks.getDocument).not.toHaveBeenCalled()
        const readCalls = invoke.mock.calls.filter(([channel]) => channel === IPC.FILE.READ_BINARY)
        expect(readCalls).toHaveLength(0)
    })

    it('READ_BINARY 返回前卸载：不调用 pdf.js', async () => {
        const binary = deferred<Uint8Array>()
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return binary.promise
        })
        const editor = mountEditor()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\y.pdf', name: 'y.pdf' })
        await flushPromises()
        unmountEditor(editor)
        binary.resolve(new Uint8Array([1, 2, 3]))
        await flushPromises()

        expect(pdfjsMocks.getDocument).not.toHaveBeenCalled()
    })

    it('getDocument 落定后卸载：销毁刚创建的加载任务且不渲染', async () => {
        const docDeferred = deferred<ReturnType<typeof makeDocument>>()
        const loadingTask = { promise: docDeferred.promise, destroy: vi.fn() }
        pdfjsMocks.getDocument.mockReturnValue(loadingTask)
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })
        const editor = mountEditor()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\z.pdf', name: 'z.pdf' })
        await flushPromises()
        unmountEditor(editor)
        docDeferred.resolve(makeDocument([makePage(immediateRender)]))
        await flushPromises()

        expect(loadingTask.destroy).toHaveBeenCalled()
        expect(editor.find('.pdf-toolbar').exists()).toBe(false)
    })

    it('空字节视为不可读；零页文档销毁加载任务后按不可读处理', async () => {
        // 空字节
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array(0)
        })
        const emptyEditor = mountEditor()
        await selectPdf('C:\\docs\\empty.pdf', 'empty.pdf')
        expect(emptyEditor.find('.error-container').exists()).toBe(true)
        expect(pdfjsMocks.getDocument).not.toHaveBeenCalled()
        unmountEditor(emptyEditor)

        // 零页文档
        const zeroTask = {
            promise: Promise.resolve(makeDocument([])),
            destroy: vi.fn()
        }
        pdfjsMocks.getDocument.mockReturnValue(zeroTask)
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })
        const zeroEditor = mountEditor()
        await selectPdf('C:\\docs\\zero.pdf', 'zero.pdf')
        expect(zeroEditor.find('.error-container').exists()).toBe(true)
        expect(zeroTask.destroy).toHaveBeenCalled()
    })

    it('被新一轮加载取代的旧 getDocument 任务不误清当前句柄', async () => {
        const firstDoc = deferred<ReturnType<typeof makeDocument>>()
        const secondDoc = deferred<ReturnType<typeof makeDocument>>()
        const firstTask = { promise: firstDoc.promise, destroy: vi.fn() }
        const secondTask = { promise: secondDoc.promise, destroy: vi.fn() }
        pdfjsMocks.getDocument.mockReturnValueOnce(firstTask).mockReturnValueOnce(secondTask)
        const pages = [makePage(immediateRender), makePage(immediateRender)]
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return new Uint8Array([1, 2, 3])
        })

        const editor = mountEditor()
        // 第 1 次加载（getDocument 挂起）
        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\one.pdf', name: 'one.pdf' })
        await flushPromises()
        // 第 2 次加载：loadingTask 指向第 2 个任务
        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\two.pdf', name: 'two.pdf' })
        await flushPromises()

        // 旧任务落定：context 已过期 → 销毁旧任务，但不得清空 loadingTask/文档
        firstDoc.resolve(makeDocument([makePage(immediateRender)]))
        await flushPromises()
        expect(firstTask.destroy).toHaveBeenCalled()
        expect(editor.find('.pdf-toolbar').exists()).toBe(false)

        // 新任务落定：正常展示
        secondDoc.resolve(makeDocument(pages))
        await flushPromises()
        await nextTick()
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')
    })
})
