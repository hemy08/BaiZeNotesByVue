// @vitest-environment jsdom
/**
 * ShowHtmlView.vue 组件测试
 *
 * 覆盖点：
 * 1. 空状态 / 加载状态 / 错误状态 / 内容态 四种互斥视图；
 * 2. EventBus 两个入口事件（html-file-selected、file-tree-node-clicked）与文件类型过滤；
 * 3. IPC 读写（read-html-file、open-external-link）通道与参数；
 * 4. 错误处理、重试、刷新、二次选择文件；
 * 5. 卸载时 EventBus 监听清理。
 *
 * 说明：组件本身没有 props/emits，所有输入来自 EventBus，所有输出走 window.electron IPC。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

import ShowHtmlView from '@renderer/components/HemyTools/ShowHtmlView.vue'
import { withBaseHref } from '@renderer/components/HemyTools/html-view-utils'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/** 组件内部硬编码的 componentId，用于清理 EventBus 监听 */
const COMPONENT_ID = 'ShowHtmlView'

/** 由文件路径计算期望注入的 base URL（与 html-view-utils.withBaseHref 实现口径一致） */
function baseOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : normalized
    return dir.startsWith('/') ? `file://${encodeURI(dir)}` : `file:///${encodeURI(dir)}`
}

/** 断言 srcdoc = 注入 base 后的 HTML（包含 base 标签与原内容） */
function expectSrcdoc(
    srcdoc: string | undefined,
    filePath: string,
    content: string
): void {
    expect(srcdoc).toContain(`<base href="${baseOf(filePath)}">`)
    expect(srcdoc).toContain(content)
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>

/** 挂载组件并登记，测试结束统一卸载，避免监听器串台 */
function mountView(): VueWrapper {
    return mount(ShowHtmlView)
}

/** 通过 EventBus 走「HTML 文件被选中」入口 */
async function selectHtmlFile(path: string, name: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, { path, name })
    await flushPromises()
}

/** 通过 EventBus 走「文件树节点点击」入口 */
async function clickTreeNode(node: { type?: string; name?: string; path?: string }): Promise<void> {
    EventBus.$emit(EVENT_BUS.FILE_TREE_NODE_CLICKED, node)
    await flushPromises()
}

beforeEach(() => {
    // 上一个用例可能残留同 componentId 的监听器，先清干净
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

describe('ShowHtmlView 空状态与加载状态', () => {
    it('renders the empty state before any html file is selected', () => {
        const wrapper = mountView()

        expect(wrapper.find('.empty-container').exists()).toBe(true)
        expect(wrapper.find('.empty-container').text()).toContain('请选择一个 HTML 文件进行预览')
        // 未加载时不渲染 iframe / 工具栏，也不应触发 IPC
        expect(wrapper.find('iframe').exists()).toBe(false)
        expect(wrapper.find('.html-toolbar').exists()).toBe(false)
        expect(invoke).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })

    it('shows the loading state while the html read is pending', async () => {
        let resolveRead!: (content: string) => void
        invoke.mockReturnValue(
            new Promise<string>((resolve) => {
                resolveRead = resolve
            })
        )
        const wrapper = mountView()

        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, {
            path: '/notes/index.html',
            name: 'index.html'
        })
        await nextTick()

        expect(wrapper.find('.loading-container').text()).toContain('正在加载 HTML 文件...')
        expect(wrapper.find('iframe').exists()).toBe(false)
        expect(wrapper.find('.empty-container').exists()).toBe(false)

        resolveRead('<html><body>done</body></html>')
        await flushPromises()

        // 加载完成后进入内容态
        expect(wrapper.find('.loading-container').exists()).toBe(false)
        expect(wrapper.find('iframe').exists()).toBe(true)
    })
})

describe('ShowHtmlView 文件选择与内容渲染', () => {
    it('loads and renders the selected html file through ipc', async () => {
        invoke.mockResolvedValue('<h1>Hello BaiZe</h1>')
        const wrapper = mountView()

        await selectHtmlFile('/notes/index.html', 'index.html')

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, '/notes/index.html')
        expect(wrapper.find('.file-name').text()).toBe('/notes/index.html')

        const iframe = wrapper.find('iframe')
        expect(iframe.exists()).toBe(true)
        // iframe 通过 srcdoc 内联渲染 HTML 内容；注入 base 使报告 HTML Wiki 等
        // 本地页面的相对链接（顶部导航）在 app 内可正确定位
        expectSrcdoc(iframe.attributes('srcdoc'), '/notes/index.html', '<h1>Hello BaiZe</h1>')
        // P1 安全修复（N-04）：sandbox 收紧为纯展示——脚本不再执行，
        // 仅保留 allow-same-origin 以加载本地相对资源（详见下方专项断言）。
        expect(iframe.attributes('sandbox')).toBe('allow-same-origin')
        expect(iframe.classes()).toContain('html-iframe')
    })

    it('P1：iframe sandbox 必须阻止脚本执行，且不得同时放开 allow-scripts 与 allow-same-origin', async () => {
        invoke.mockResolvedValue(
            '<html><body><script>window.__htmlViewXss = 1</script></body></html>'
        )
        const wrapper = mountView()

        await selectHtmlFile('/notes/xss.html', 'xss.html')

        const iframe = wrapper.find('iframe')
        expect(iframe.exists()).toBe(true)
        const tokens = (iframe.attributes('sandbox') ?? '').split(/\s+/).filter(Boolean)

        // 查看器为纯展示：脚本、表单提交、弹窗均不再允许
        expect(tokens).not.toContain('allow-scripts')
        expect(tokens).not.toContain('allow-forms')
        expect(tokens).not.toContain('allow-popups')
        // 同源保留但脚本已禁用：二者组合是官方警示的 sandbox 逃逸组合，绝不能同时出现
        expect(tokens).toEqual(['allow-same-origin'])
        expect(tokens.includes('allow-scripts') && tokens.includes('allow-same-origin')).toBe(false)
    })

    it('loads html files from file tree node click events', async () => {
        invoke.mockResolvedValue('<p>tree</p>')
        const wrapper = mountView()

        await clickTreeNode({ type: 'file', name: 'page.html', path: '/notes/page.html' })

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, '/notes/page.html')
        expectSrcdoc(wrapper.find('iframe').attributes('srcdoc'), '/notes/page.html', '<p>tree</p>')
    })

    it('ignores non-html files selected from the event bus', async () => {
        const wrapper = mountView()

        await selectHtmlFile('/notes/readme.md', 'readme.md')

        expect(invoke).not.toHaveBeenCalled()
        expect(wrapper.find('.empty-container').exists()).toBe(true)
        expect(wrapper.find('iframe').exists()).toBe(false)
    })

    it('ignores file tree clicks for folders and non-html files', async () => {
        const wrapper = mountView()

        // 文件夹即使名字以 .html 结尾也不加载
        await clickTreeNode({ type: 'folder', name: 'fake.html', path: '/notes/fake.html' })
        // 普通文件但扩展名不是 html 也不加载
        await clickTreeNode({ type: 'file', name: 'readme.md', path: '/notes/readme.md' })

        expect(invoke).not.toHaveBeenCalled()
        expect(wrapper.find('.empty-container').exists()).toBe(true)
    })

    it('replaces the preview when another html file is selected', async () => {
        invoke.mockResolvedValueOnce('<p>first</p>').mockResolvedValueOnce('<p>second</p>')
        const wrapper = mountView()

        await selectHtmlFile('/notes/a.html', 'a.html')
        expectSrcdoc(wrapper.find('iframe').attributes('srcdoc'), '/notes/a.html', '<p>first</p>')

        await selectHtmlFile('/notes/b.html', 'b.html')

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke).toHaveBeenNthCalledWith(1, IPC.FILE.READ_HTML, '/notes/a.html')
        expect(invoke).toHaveBeenNthCalledWith(2, IPC.FILE.READ_HTML, '/notes/b.html')
        expectSrcdoc(wrapper.find('iframe').attributes('srcdoc'), '/notes/b.html', '<p>second</p>')
        expect(wrapper.find('.file-name').text()).toBe('/notes/b.html')
    })
})

describe('ShowHtmlView 错误处理与重试', () => {
    it('shows an error when the html read returns empty content', async () => {
        invoke.mockResolvedValue('')
        const wrapper = mountView()

        await selectHtmlFile('/notes/empty.html', 'empty.html')

        expect(wrapper.find('.error-container').exists()).toBe(true)
        expect(wrapper.find('.error-container').text()).toContain('无法读取文件内容')
        expect(wrapper.find('.retry-button').exists()).toBe(true)
        expect(wrapper.find('iframe').exists()).toBe(false)
    })

    it('shows the failure detail when the html read throws', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValue(new Error('disk error'))
        const wrapper = mountView()

        await selectHtmlFile('/notes/broken.html', 'broken.html')

        expect(consoleError).toHaveBeenCalledWith('加载 HTML 文件失败:', expect.any(Error))
        expect(wrapper.find('.error-container').text()).toContain('加载失败')
        expect(wrapper.find('.error-container').text()).toContain('disk error')
        // 失败后必须结束加载态，不能一直转圈
        expect(wrapper.find('.loading-container').exists()).toBe(false)
    })

    it('retries the same file after an error and renders the recovered content', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce('<p>recovered</p>')
        const wrapper = mountView()

        await selectHtmlFile('/notes/retry.html', 'retry.html')
        expect(wrapper.find('.retry-button').exists()).toBe(true)

        await wrapper.find('.retry-button').trigger('click')
        await flushPromises()

        expect(consoleError).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke).toHaveBeenNthCalledWith(1, IPC.FILE.READ_HTML, '/notes/retry.html')
        expect(invoke).toHaveBeenNthCalledWith(2, IPC.FILE.READ_HTML, '/notes/retry.html')
        expect(wrapper.find('.error-container').exists()).toBe(false)
        expectSrcdoc(wrapper.find('iframe').attributes('srcdoc'), '/notes/retry.html', '<p>recovered</p>')
    })

    it('reloads the current file through the toolbar refresh button', async () => {
        invoke.mockResolvedValueOnce('<p>old</p>')
        let resolveRefresh!: (content: string) => void
        invoke.mockReturnValueOnce(
            new Promise<string>((resolve) => {
                resolveRefresh = resolve
            })
        )
        const wrapper = mountView()

        await selectHtmlFile('/notes/refresh.html', 'refresh.html')
        expectSrcdoc(wrapper.find('iframe').attributes('srcdoc'), '/notes/refresh.html', '<p>old</p>')

        await wrapper.find('button[title="刷新"]').trigger('click')
        await nextTick()

        // 刷新期间重新进入加载态（旧内容被清空）
        expect(wrapper.find('.loading-container').text()).toContain('正在加载 HTML 文件...')
        expect(wrapper.find('iframe').exists()).toBe(false)

        resolveRefresh('<p>new</p>')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke).toHaveBeenLastCalledWith(IPC.FILE.READ_HTML, '/notes/refresh.html')
        expectSrcdoc(wrapper.find('iframe').attributes('srcdoc'), '/notes/refresh.html', '<p>new</p>')
    })
})

describe('ShowHtmlView 工具栏与生命周期', () => {
    it('opens the loaded file externally through the external-link ipc', async () => {
        invoke.mockResolvedValue('<p>x</p>')
        const wrapper = mountView()
        await selectHtmlFile('/notes/index.html', 'index.html')

        await wrapper.find('button[title="在浏览器中打开"]').trigger('click')

        // 2026-11-18（遗留清单 #1）：本地 HTML 改走专用通道
        // （OPEN_EXTERNAL_LINK 仅放行 http/https，原实现点击无效）
        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith(IPC.FILE.OPEN_IN_BROWSER, '/notes/index.html')
        // 打开外部浏览器不应重新读取文件
        expect(invoke).toHaveBeenCalledTimes(1)
    })

    it('cleans up event bus listeners when unmounted', async () => {
        const wrapper = mountView()
        wrapper.unmount()

        // 卸载后再触发事件，不应再调用 IPC
        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, {
            path: '/notes/late.html',
            name: 'late.html'
        })
        EventBus.$emit(EVENT_BUS.FILE_TREE_NODE_CLICKED, {
            type: 'file',
            name: 'late.html',
            path: '/notes/late.html'
        })
        await flushPromises()

        expect(invoke).not.toHaveBeenCalled()
    })
})

describe('withBaseHref（srcdoc 相对链接基准修复）', () => {
    it('injects base into an existing <head>', () => {
        const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>x</body></html>'
        const out = withBaseHref(html, '/notes/index.html')
        expect(out).toContain('<base href="file:///notes/">')
        expect(out).toContain('<meta charset="utf-8">')
        // base 必须位于 head 内（紧跟 <head> 之后）
        expect(out.indexOf('<base href=')).toBeLessThan(out.indexOf('</head>'))
    })

    it('creates a <head> when only <html> exists', () => {
        const out = withBaseHref('<html><body>x</body></html>', '/notes/index.html')
        expect(out).toBe('<html>\n<head><base href="file:///notes/"></head><body>x</body></html>')
    })

    it('prepends base for fragments without html/head', () => {
        const out = withBaseHref('<h1>Hello</h1>', '/notes/index.html')
        expect(out).toBe('<base href="file:///notes/">\n<h1>Hello</h1>')
    })

    it('builds a Windows drive-letter file url', () => {
        const out = withBaseHref('<body>x</body>', 'E:\\github.com\\BaiZeNotesByVue\\docs\\reports\\html\\README.html')
        expect(out).toContain('<base href="file:///E:/github.com/BaiZeNotesByVue/docs/reports/html/">')
    })

    it('encodes non-ascii directory segments', () => {
        const out = withBaseHref('<body>x</body>', 'D:\\文档\\报告\\index.html')
        expect(out).toContain(`<base href="file:///D:/${encodeURI('文档/报告/')}">`)
    })
})
