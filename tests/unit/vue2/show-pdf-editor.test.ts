// @vitest-environment jsdom
/**
 * ShowPdfEditor.vue 组件测试（2026-11-18，遗留清单 #9：PDF 预览改走 pdf.js）
 *
 * 覆盖：
 * 1. 空状态 / 加载 / 错误 / 内容态；
 * 2. 文件选择 → 主进程 CHECK_EXISTS + READ_BINARY（二进制）→ pdf.js getDocument；
 * 3. 文件不存在 / IPC 读取失败的错误提示；
 * 4. 加载失败 → 点击重试 → 成功（回归：重试按钮此前因 pdfPath 被清空而永远无效）；
 * 5. 翻页交互（页码状态变化）；
 * 6. 卸载时销毁 pdf 文档；
 * 7. 多实例事件隔离（componentId 实例唯一，一个实例卸载不清掉另一实例的监听）。
 *
 * 说明：pdf.js 与 worker URL 均被 mock；jsdom 无 canvas 2D 实现，组件在无 context 时
 * 跳过绘制（只验证文档加载与页码逻辑）。
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

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
/** 本用例已挂载的实例：componentId 实例唯一，必须靠卸载来清理各自的 EventBus 监听 */
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

function makeFakeDocument(numPages = 2) {
    return {
        numPages,
        getPage: vi.fn().mockResolvedValue({
            getViewport: () => ({ width: 100, height: 200 }),
            render: () => ({ promise: Promise.resolve(), cancel: vi.fn() })
        }),
        destroy: vi.fn()
    }
}

/** 默认成功链路：CHECK_EXISTS=true、READ_BINARY 返回 PDF 字节、getDocument 返回指定页数文档 */
function mockSuccessfulLoad(numPages = 2): ReturnType<typeof makeFakeDocument> {
    const doc = makeFakeDocument(numPages)
    pdfjsMocks.getDocument.mockReturnValue({
        promise: Promise.resolve(doc),
        destroy: vi.fn()
    })
    invoke.mockImplementation(async (channel: string) => {
        if (channel === IPC.FILE.CHECK_EXISTS) return true
        if (channel === IPC.FILE.READ_BINARY) return new Uint8Array([0x25, 0x50, 0x44, 0x46])
        return null
    })
    return doc
}

async function selectPdf(path: string, name: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path, name })
    await flushPromises()
    await nextTick()
}

beforeEach(() => {
    unmountAll()
    pdfjsMocks.getDocument.mockReset()
    invoke = vi.fn()
    send = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke, send, on: vi.fn(), removeListener: vi.fn() }
    })
})

afterEach(() => {
    unmountAll()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ShowPdfEditor 空状态与加载', () => {
    it('renders the empty state before any pdf is selected', () => {
        const editor = mountEditor()
        expect(editor.find('.empty-container').exists()).toBe(true)
        expect(editor.find('.pdf-toolbar').exists()).toBe(false)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('loads a pdf through CHECK_EXISTS + READ_BINARY and renders via pdf.js', async () => {
        mockSuccessfulLoad(3)
        const editor = mountEditor()

        await selectPdf('C:\\docs\\手册.pdf', '手册.pdf')

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.CHECK_EXISTS, 'C:\\docs\\手册.pdf')
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_BINARY, 'C:\\docs\\手册.pdf')
        expect(pdfjsMocks.getDocument).toHaveBeenCalledTimes(1)
        expect(editor.find('.pdf-toolbar').exists()).toBe(true)
        expect(editor.find('.file-name').text()).toBe('C:\\docs\\手册.pdf')
        expect(editor.find('.page-indicator').text()).toBe('1 / 3')
        expect(editor.find('.zoom-level').text()).toBe('100%')
    })

    it('accepts uppercase .PDF extension and ignores other files', async () => {
        mockSuccessfulLoad(1)
        const editor = mountEditor()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, {
            path: 'C:\\docs\\note.txt',
            name: 'note.txt'
        })
        await flushPromises()
        expect(invoke).not.toHaveBeenCalled()

        await selectPdf('C:\\docs\\manual.PDF', 'manual.PDF')

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.CHECK_EXISTS, 'C:\\docs\\manual.PDF')
        expect(editor.find('.pdf-toolbar').exists()).toBe(true)
    })
})

describe('ShowPdfEditor 错误处理', () => {
    it('shows file-not-found when CHECK_EXISTS returns false', async () => {
        invoke.mockResolvedValue(false)
        const editor = mountEditor()

        await selectPdf('C:\\docs\\missing.pdf', 'missing.pdf')

        expect(editor.find('.error-container').exists()).toBe(true)
        expect(pdfjsMocks.getDocument).not.toHaveBeenCalled()
    })

    it('shows an error when reading the binary fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            if (channel === IPC.FILE.READ_BINARY) throw new Error('EACCES')
            return null
        })
        const editor = mountEditor()

        await selectPdf('C:\\docs\\locked.pdf', 'locked.pdf')

        expect(editor.find('.error-container').exists()).toBe(true)
        expect(editor.find('.retry-button').exists()).toBe(true)
        consoleError.mockRestore()
    })

    it('retries the same file after a load failure and succeeds', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        let readShouldFail = true
        const doc = makeFakeDocument(2)
        pdfjsMocks.getDocument.mockReturnValue({
            promise: Promise.resolve(doc),
            destroy: vi.fn()
        })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            if (channel === IPC.FILE.READ_BINARY) {
                if (readShouldFail) throw new Error('EACCES')
                return new Uint8Array([0x25, 0x50, 0x44, 0x46])
            }
            return null
        })
        const editor = mountEditor()

        await selectPdf('C:\\docs\\retry.pdf', 'retry.pdf')
        expect(editor.find('.error-container').exists()).toBe(true)
        expect(editor.find('.pdf-toolbar').exists()).toBe(false)

        // 模拟文件权限恢复后点击重试按钮：应使用最近一次记录的路径重新加载
        readShouldFail = false
        invoke.mockClear()
        await editor.find('.retry-button').trigger('click')
        await flushPromises()
        await nextTick()

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.CHECK_EXISTS, 'C:\\docs\\retry.pdf')
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_BINARY, 'C:\\docs\\retry.pdf')
        expect(pdfjsMocks.getDocument).toHaveBeenCalledTimes(1)
        expect(editor.find('.error-container').exists()).toBe(false)
        expect(editor.find('.pdf-toolbar').exists()).toBe(true)
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')
        consoleError.mockRestore()
    })
})

describe('ShowPdfEditor 翻页与卸载', () => {
    it('switches pages with prev/next buttons', async () => {
        mockSuccessfulLoad(2)
        const editor = mountEditor()
        await selectPdf('C:\\docs\\a.pdf', 'a.pdf')

        const buttons = editor.findAll('.toolbar-btn')
        // 按钮顺序：上一页 / 下一页 / 放大 / 缩小 / 资源管理器
        await buttons[0].trigger('click')
        await flushPromises()
        // 已在第 1 页：上一页不应变化
        expect(editor.find('.page-indicator').text()).toBe('1 / 2')

        await buttons[1].trigger('click')
        await flushPromises()
        expect(editor.find('.page-indicator').text()).toBe('2 / 2')
        // 第 2 页时「下一页」禁用
        expect(buttons[1].attributes('disabled')).toBeDefined()
    })

    it('destroys the pdf document on unmount', async () => {
        mockSuccessfulLoad(1)
        const editor = mountEditor()
        await selectPdf('C:\\docs\\b.pdf', 'b.pdf')

        const loadingTask = pdfjsMocks.getDocument.mock.results[0].value as { destroy: () => void }
        unmountEditor(editor)
        expect(loadingTask.destroy).toHaveBeenCalled()
    })
})

describe('ShowPdfEditor 多实例事件隔离', () => {
    it('cleans up only its own listener when one instance unmounts', async () => {
        // 只验证事件分发：CHECK_EXISTS 直接返回 false，避免创建 pdf 文档
        invoke.mockResolvedValue(false)
        const first = mountEditor()
        const second = mountEditor()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\one.pdf', name: 'one.pdf' })
        await flushPromises()
        // 两个实例都应收到事件：各查询一次文件是否存在
        expect(invoke).toHaveBeenCalledTimes(2)

        unmountEditor(first)
        invoke.mockClear()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:\\docs\\two.pdf', name: 'two.pdf' })
        await flushPromises()

        // 卸载一个实例后：另一实例仍能收到事件（EventBus.$cleanup 只清自身监听）
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.CHECK_EXISTS, 'C:\\docs\\two.pdf')
        expect(second.find('.error-container').exists()).toBe(true)
    })
})
