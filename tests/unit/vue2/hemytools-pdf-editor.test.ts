// @vitest-environment jsdom
/**
 * ShowPdfEditor.vue 组件测试
 *
 * 覆盖点：
 * 1. 空状态 / 加载状态 / 错误状态 / 内容态 四种互斥视图；
 * 2. EventBus「pdf-file-selected」入口与 .pdf 扩展名过滤；
 * 3. IPC 通道（check-file-exists、open-in-explorer）调用与参数；
 * 4. 错误处理、文件不存在、重试逻辑；
 * 5. 缩放（放大/缩小/边界）与 iframe 渲染属性；
 * 6. 卸载时 EventBus 监听清理。
 *
 * FE-11：组件已从 <webview> 改为 <iframe src="file://...">（Electron 内置 PDFium 查看器
 * 在 iframe 中渲染 PDF，不再依赖 webviewTag）。本测试验证状态机、属性绑定与 IPC 行为，
 * 不验证 PDF 实际像素渲染（需要真实 Electron 运行时）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

import ShowPdfEditor from '@renderer/components/HemyTools/ShowPdfEditor.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/** 组件内部硬编码的 componentId，用于清理 EventBus 监听 */
const COMPONENT_ID = 'ShowPdfEditor'

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>

function mountView(): VueWrapper {
    return mount(ShowPdfEditor)
}

/** 通过 EventBus 触发「PDF 文件被选中」 */
async function selectPdfFile(path: string, name: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path, name })
    await flushPromises()
}

/** 读取 iframe 上 transform: scale(x) 的实际缩放值 */
function getScale(wrapper: VueWrapper): number {
    const style = wrapper.find('iframe').attributes('style') ?? ''
    const match = style.match(/scale\(([\d.]+)\)/)
    expect(match, `iframe style 内未找到 scale：${style}`).toBeTruthy()
    return parseFloat(match![1])
}

beforeEach(() => {
    EventBus.$cleanup(COMPONENT_ID)
    invoke = vi.fn()
    send = vi.fn()
    vi.stubGlobal('electron', { ipcRenderer: { invoke, send } })
})

afterEach(() => {
    EventBus.$cleanup(COMPONENT_ID)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ShowPdfEditor 空状态与加载状态', () => {
    it('renders the empty state before any pdf file is selected', () => {
        const wrapper = mountView()

        expect(wrapper.find('.empty-container').exists()).toBe(true)
        expect(wrapper.find('.empty-container').text()).toContain('请选择一个 PDF 文件进行预览')
        expect(wrapper.find('iframe').exists()).toBe(false)
        expect(wrapper.find('.pdf-toolbar').exists()).toBe(false)
        expect(invoke).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })

    it('shows the loading state while the existence check is pending', async () => {
        let resolveExists!: (exists: boolean) => void
        invoke.mockReturnValue(
            new Promise<boolean>((resolve) => {
                resolveExists = resolve
            })
        )
        const wrapper = mountView()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, {
            path: 'C:/notes/manual.pdf',
            name: 'manual.pdf'
        })
        await nextTick()

        expect(wrapper.find('.loading-container').text()).toContain('正在加载 PDF 文件...')
        expect(wrapper.find('iframe').exists()).toBe(false)
        expect(wrapper.find('.empty-container').exists()).toBe(false)

        resolveExists(true)
        await flushPromises()

        expect(wrapper.find('.loading-container').exists()).toBe(false)
        expect(wrapper.find('iframe').exists()).toBe(true)
    })
})

describe('ShowPdfEditor 文件加载与 IPC 参数', () => {
    it('checks existence and renders the pdf iframe with a standard file url', async () => {
        invoke.mockResolvedValue(true)
        const wrapper = mountView()

        await selectPdfFile('C:/notes/manual.pdf', 'manual.pdf')

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.CHECK_EXISTS, 'C:/notes/manual.pdf')

        const frame = wrapper.find('iframe')
        expect(frame.exists()).toBe(true)
        // FE-11：标准 file URL（file:/// + 正斜杠路径），不再是 webview + 非法 file://C:/...
        expect(frame.attributes('src')).toBe('file:///C:/notes/manual.pdf')
        expect(frame.classes()).toContain('pdf-frame')
        // PDF 查看器在 iframe 中渲染，无需 webviewTag（不再出现 <webview> 标签）
        expect(wrapper.find('webview').exists()).toBe(false)

        // 工具栏展示原始文件路径（便于用户核对文件位置）
        expect(wrapper.find('.file-name').text()).toBe('C:/notes/manual.pdf')
        expect(wrapper.find('.zoom-level').text()).toBe('100%')
    })

    it('ignores non-pdf files selected from the event bus', async () => {
        const wrapper = mountView()

        await selectPdfFile('C:/notes/readme.txt', 'readme.txt')
        // 缺少 path 的事件也应被忽略
        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { name: 'manual.pdf' })
        await flushPromises()

        expect(invoke).not.toHaveBeenCalled()
        expect(wrapper.find('.empty-container').exists()).toBe(true)
        expect(wrapper.find('iframe').exists()).toBe(false)
    })

    it('updates the preview when another pdf file is selected', async () => {
        invoke.mockResolvedValue(true)
        const wrapper = mountView()

        await selectPdfFile('C:/notes/a.pdf', 'a.pdf')
        expect(wrapper.find('iframe').attributes('src')).toBe('file:///C:/notes/a.pdf')

        await selectPdfFile('C:/notes/b.pdf', 'b.pdf')

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke).toHaveBeenNthCalledWith(1, IPC.FILE.CHECK_EXISTS, 'C:/notes/a.pdf')
        expect(invoke).toHaveBeenNthCalledWith(2, IPC.FILE.CHECK_EXISTS, 'C:/notes/b.pdf')
        expect(wrapper.find('iframe').attributes('src')).toBe('file:///C:/notes/b.pdf')
        expect(wrapper.find('.file-name').text()).toBe('C:/notes/b.pdf')
    })
})

describe('ShowPdfEditor 错误处理与重试', () => {
    it('shows the missing-file error when the existence check returns false', async () => {
        invoke.mockResolvedValue(false)
        const wrapper = mountView()

        await selectPdfFile('C:/notes/gone.pdf', 'gone.pdf')

        expect(wrapper.find('.error-container').exists()).toBe(true)
        expect(wrapper.find('.error-container').text()).toContain('文件不存在')
        expect(wrapper.find('.retry-button').exists()).toBe(true)
        expect(wrapper.find('iframe').exists()).toBe(false)
    })

    it('shows the failure detail when the existence check throws', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValue(new Error('ipc broken'))
        const wrapper = mountView()

        await selectPdfFile('C:/notes/broken.pdf', 'broken.pdf')

        expect(consoleError).toHaveBeenCalledWith('加载 PDF 文件失败:', expect.any(Error))
        expect(wrapper.find('.error-container').text()).toContain('加载失败')
        expect(wrapper.find('.error-container').text()).toContain('ipc broken')
        expect(wrapper.find('.loading-container').exists()).toBe(false)
    })

    it('documents the dead retry path: retry does nothing after load failure', async () => {
        // 疑似缺陷记录：错误状态下 pdfPath 已被清空（''），retryLoad 的 if (pdfPath.value)
        // 恒为假，因此「重试」按钮在错误态下点击无效，无法重新发起 IPC 校验。
        invoke.mockResolvedValue(false)
        const wrapper = mountView()

        await selectPdfFile('C:/notes/gone.pdf', 'gone.pdf')
        expect(wrapper.find('.retry-button').exists()).toBe(true)

        await wrapper.find('.retry-button').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(wrapper.find('.error-container').text()).toContain('文件不存在')
    })
})

describe('ShowPdfEditor 缩放与工具栏', () => {
    it('zooms in and out through the toolbar buttons', async () => {
        invoke.mockResolvedValue(true)
        const wrapper = mountView()
        await selectPdfFile('C:/notes/manual.pdf', 'manual.pdf')

        expect(wrapper.find('.zoom-level').text()).toBe('100%')
        expect(getScale(wrapper)).toBe(1)

        await wrapper.find('button[title="放大"]').trigger('click')
        expect(wrapper.find('.zoom-level').text()).toBe('110%')
        expect(getScale(wrapper)).toBeCloseTo(1.1, 10)
        // 缩放锚点在左上角，避免内容偏移
        expect(wrapper.find('iframe').attributes('style')).toContain('transform-origin: top left')

        await wrapper.find('button[title="缩小"]').trigger('click')
        expect(wrapper.find('.zoom-level').text()).toBe('100%')
        expect(getScale(wrapper)).toBe(1)
    })

    it('clamps the zoom level after repeated clicks', async () => {
        invoke.mockResolvedValue(true)
        const wrapper = mountView()
        await selectPdfFile('C:/notes/manual.pdf', 'manual.pdf')

        for (let i = 0; i < 30; i++) {
            await wrapper.find('button[title="放大"]').trigger('click')
        }
        // 上限为 3 倍（0.1 步长浮点累加会有极小溢出，用容差断言）
        expect(getScale(wrapper)).toBeGreaterThanOrEqual(2.9)
        expect(getScale(wrapper)).toBeLessThanOrEqual(3.1)
        expect(wrapper.find('.zoom-level').text()).toBe('300%')
        const atMax = getScale(wrapper)
        await wrapper.find('button[title="放大"]').trigger('click')
        expect(getScale(wrapper)).toBe(atMax)

        for (let i = 0; i < 30; i++) {
            await wrapper.find('button[title="缩小"]').trigger('click')
        }
        // 已知浮点缺陷：0.4 - 0.1 = 0.30000000000000004 仍 > 0.3，会多缩一步到约 0.2，
        // 低于代码意图的 30% 下限，图标显示 20%（详见报告）。
        const atMin = getScale(wrapper)
        expect(atMin).toBeLessThanOrEqual(0.3)
        expect(atMin).toBeGreaterThanOrEqual(0.19)
        expect(wrapper.find('.zoom-level').text()).toBe('20%')
        await wrapper.find('button[title="缩小"]').trigger('click')
        expect(getScale(wrapper)).toBe(atMin)
    })

    // FE-11：原「在浏览器中打开」把本地文件路径发给 OPEN_EXTERNAL_LINK，
    // 主进程只放行 http/https 协议 → 本地文件被静默拒绝（死按钮）。
    // 现改为既有 FILE_MANAGER.OPEN_IN_EXPLORER 通道在资源管理器中定位文件。
    it('reveals the loaded pdf in the file explorer through the existing ipc', async () => {
        invoke.mockResolvedValue(true)
        const wrapper = mountView()
        await selectPdfFile('C:/notes/manual.pdf', 'manual.pdf')

        await wrapper.find('button[title="在资源管理器打开"]').trigger('click')

        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, 'C:/notes/manual.pdf')
        expect(invoke).toHaveBeenCalledTimes(1)
    })
})

describe('ShowPdfEditor 生命周期', () => {
    it('cleans up event bus listeners when unmounted', async () => {
        const wrapper = mountView()
        wrapper.unmount()

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, { path: 'C:/notes/late.pdf', name: 'late.pdf' })
        await flushPromises()

        expect(invoke).not.toHaveBeenCalled()
    })
})
