// @vitest-environment jsdom
/**
 * ShowPdfEditor.vue 组件测试（2026-11-18，遗留清单 #9：PDF 预览改走 pdf.js）
 *
 * 覆盖：
 * 1. 空状态 / 加载 / 错误 / 内容态；
 * 2. 文件选择 → 主进程 CHECK_EXISTS + READ_BINARY（二进制）→ pdf.js getDocument；
 * 3. 文件不存在 / IPC 读取失败的错误提示；
 * 4. 翻页交互（页码状态变化）；
 * 5. 卸载时销毁 pdf 文档。
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
let wrapper: VueWrapper | null = null

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

async function selectPdf(path: string, name: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path, name })
    await flushPromises()
    await nextTick()
}

beforeEach(() => {
    EventBus.$cleanup('ShowPdfEditor')
    pdfjsMocks.getDocument.mockReset()
    invoke = vi.fn()
    send = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke, send, on: vi.fn(), removeListener: vi.fn() }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    EventBus.$cleanup('ShowPdfEditor')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ShowPdfEditor 空状态与加载', () => {
    it('renders the empty state before any pdf is selected', () => {
        wrapper = mount(ShowPdfEditor)
        expect(wrapper.find('.empty-container').exists()).toBe(true)
        expect(wrapper.find('.pdf-toolbar').exists()).toBe(false)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('loads a pdf through CHECK_EXISTS + READ_BINARY and renders via pdf.js', async () => {
        const doc = makeFakeDocument(3)
        pdfjsMocks.getDocument.mockReturnValue({
            promise: Promise.resolve(doc),
            destroy: vi.fn()
        })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            if (channel === IPC.FILE.READ_BINARY) return new Uint8Array([0x25, 0x50, 0x44, 0x46])
            return null
        })
        wrapper = mount(ShowPdfEditor)

        await selectPdf('C:\\docs\\手册.pdf', '手册.pdf')

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.CHECK_EXISTS, 'C:\\docs\\手册.pdf')
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_BINARY, 'C:\\docs\\手册.pdf')
        expect(pdfjsMocks.getDocument).toHaveBeenCalledTimes(1)
        expect(wrapper.find('.pdf-toolbar').exists()).toBe(true)
        expect(wrapper.find('.file-name').text()).toBe('C:\\docs\\手册.pdf')
        expect(wrapper.find('.page-indicator').text()).toBe('1 / 3')
        expect(wrapper.find('.zoom-level').text()).toBe('100%')
    })
})

describe('ShowPdfEditor 错误处理', () => {
    it('shows file-not-found when CHECK_EXISTS returns false', async () => {
        invoke.mockResolvedValue(false)
        wrapper = mount(ShowPdfEditor)

        await selectPdf('C:\\docs\\missing.pdf', 'missing.pdf')

        expect(wrapper.find('.error-container').exists()).toBe(true)
        expect(pdfjsMocks.getDocument).not.toHaveBeenCalled()
    })

    it('shows an error when reading the binary fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            if (channel === IPC.FILE.READ_BINARY) throw new Error('EACCES')
            return null
        })
        wrapper = mount(ShowPdfEditor)

        await selectPdf('C:\\docs\\locked.pdf', 'locked.pdf')

        expect(wrapper.find('.error-container').exists()).toBe(true)
        expect(wrapper.find('.retry-button').exists()).toBe(true)
        consoleError.mockRestore()
    })
})

describe('ShowPdfEditor 翻页与卸载', () => {
    it('switches pages with prev/next buttons', async () => {
        const doc = makeFakeDocument(2)
        pdfjsMocks.getDocument.mockReturnValue({
            promise: Promise.resolve(doc),
            destroy: vi.fn()
        })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            if (channel === IPC.FILE.READ_BINARY) return new Uint8Array([1, 2, 3])
            return null
        })
        wrapper = mount(ShowPdfEditor)
        await selectPdf('C:\\docs\\a.pdf', 'a.pdf')

        const buttons = wrapper.findAll('.toolbar-btn')
        // 按钮顺序：上一页 / 下一页 / 放大 / 缩小 / 资源管理器
        await buttons[0].trigger('click')
        await flushPromises()
        // 已在第 1 页：上一页不应变化
        expect(wrapper.find('.page-indicator').text()).toBe('1 / 2')

        await buttons[1].trigger('click')
        await flushPromises()
        expect(wrapper.find('.page-indicator').text()).toBe('2 / 2')
        // 第 2 页时「下一页」禁用
        expect(buttons[1].attributes('disabled')).toBeDefined()
    })

    it('destroys the pdf document on unmount', async () => {
        const doc = makeFakeDocument(1)
        pdfjsMocks.getDocument.mockReturnValue({
            promise: Promise.resolve(doc),
            destroy: vi.fn()
        })
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            if (channel === IPC.FILE.READ_BINARY) return new Uint8Array([1])
            return null
        })
        wrapper = mount(ShowPdfEditor)
        await selectPdf('C:\\docs\\b.pdf', 'b.pdf')

        const loadingTask = pdfjsMocks.getDocument.mock.results[0].value as { destroy: () => void }
        wrapper.unmount()
        wrapper = null
        expect(loadingTask.destroy).toHaveBeenCalled()
    })
})
