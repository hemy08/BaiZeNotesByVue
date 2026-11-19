// @vitest-environment jsdom
/**
 * ShowHtmlView.vue 组件测试
 *
 * 覆盖点：
 * 1. 空状态 / 加载状态 / 错误状态 / 内容态 四种互斥视图；
 * 2. EventBus 两个入口事件（html-file-selected、file-tree-node-clicked）与文件类型过滤；
 * 3. IPC 读写（read-html-file、open-external-link）通道与参数；
 * 4. 错误处理、重试、刷新、二次选择文件；
 * 5. 卸载时 EventBus 监听清理；
 * 6. 报告页静态导航注入（2026-11-19：共享 assets 改造配套）——占位检测、片段探测顺序、
 *    首页深度变体优先级、读取失败静默降级、普通 HTML 零额外 IPC。
 *
 * 说明：组件本身没有 props/emits，所有输入来自 EventBus，所有输出走 window.electron IPC。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

import ShowHtmlView from '@renderer/components/HemyTools/ShowHtmlView.vue'
import {
    withBaseHref,
    hasReportNavSlot,
    injectReportNav,
    isReportHomePage,
    getReportNavCandidatePaths
} from '@renderer/components/HemyTools/html-view-utils'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/**
 * 本用例已挂载的实例：组件内 componentId 带实例 uid 唯一后缀（多实例隔离），
 * 无法再按固定 id 统一清理，必须靠卸载来清理各自的 EventBus 监听，避免跨用例串台。
 */
const mountedViews: VueWrapper[] = []

/** 由文件路径计算期望注入的 base URL（与 html-view-utils.withBaseHref 实现口径一致） */
function baseOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : normalized
    return dir.startsWith('/') ? `file://${encodeURI(dir)}` : `file:///${encodeURI(dir)}`
}

/** 断言 srcdoc = 注入 base 后的 HTML（包含 base 标签与原内容） */
function expectSrcdoc(srcdoc: string | undefined, filePath: string, content: string): void {
    expect(srcdoc).toContain(`<base href="${baseOf(filePath)}">`)
    expect(srcdoc).toContain(content)
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>

/** 挂载组件并登记，测试结束统一卸载，避免监听器串台 */
function mountView(): VueWrapper {
    const view = mount(ShowHtmlView)
    mountedViews.push(view)
    return view
}

/** 用例内主动卸载并移出登记表（避免 afterEach 二次卸载） */
function unmountView(view: VueWrapper): void {
    const index = mountedViews.indexOf(view)
    if (index >= 0) {
        mountedViews.splice(index, 1)
    }
    view.unmount()
}

/** 卸载所有残留实例（每个用例前后各执行一次，保证监听器不跨用例） */
function unmountAllViews(): void {
    while (mountedViews.length > 0) {
        mountedViews.pop()?.unmount()
    }
}

/** 通过 EventBus 走「HTML 文件被选中」入口 */
async function selectHtmlFile(path: string, name: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, { path, name })
    await flushPromises()
}

/** 构造报告页 HTML（生成脚本产出的新结构：占位注释 + 空导航容器 + 共享 assets 引用） */
function reportPageHtml(cssHref = '../assets/report.css'): string {
    return [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        `<link rel="stylesheet" href="${cssHref}">`,
        '</head>',
        '<body>',
        '<!-- baize-report-nav-slot -->',
        '<div id="report-nav"></div>',
        '<main>报告正文</main>',
        '<script src="../assets/report-nav.js" defer></script>',
        '</body>',
        '</html>'
    ].join('\n')
}

/** 报告页静态导航片段样例（分类页深度：链接带一层 ../） */
const NAV_FRAGMENT =
    '<nav class="rgnav" aria-label="报告整体导航"><a href="../README.html">🏠 报告首页</a></nav>'

/** 报告导航候选探测的 IPC mock 配置 */
interface ReportNavMockOptions {
    /** 被查看的 HTML 文件路径（READ_HTML 返回 pageContent） */
    pagePath: string
    /** 页面 HTML 内容 */
    pageContent: string
    /** 唯一「存在」的导航片段路径；其余候选 CHECK_EXISTS 返回 false */
    navPath?: string
    /** 命中后 READ_HTML 返回的片段内容 */
    navContent?: string
    /** 命中后 READ_HTML 是否抛错（模拟 Path Guard 拒绝 / 文件被删） */
    navReadFails?: boolean
}

/** 构造报告导航探测相关 IPC mock（区分页面读取 / 存在性探测 / 片段读取） */
function mockReportNavIpc(options: ReportNavMockOptions): void {
    invoke.mockImplementation((channel: string, target: unknown) => {
        const targetPath = String(target)
        if (channel === IPC.FILE.READ_HTML && targetPath === options.pagePath) {
            return Promise.resolve(options.pageContent)
        }
        if (channel === IPC.FILE.CHECK_EXISTS) {
            return Promise.resolve(options.navPath !== undefined && targetPath === options.navPath)
        }
        if (channel === IPC.FILE.READ_HTML && targetPath === options.navPath) {
            if (options.navReadFails) {
                return Promise.reject(new Error('read denied'))
            }
            return Promise.resolve(options.navContent ?? '')
        }
        return Promise.resolve(null)
    })
}

/** 取 invoke mock 中指定通道调用的首个参数列表（call[0] 为通道，call[1] 为首个参数） */
function invokeArgsOf(channel: string): unknown[] {
    const calls = invoke.mock.calls as unknown[][]
    return calls.filter((call) => call[0] === channel).map((call) => call[1])
}

beforeEach(() => {
    // 上一个用例可能残留未卸载的实例与监听器，先清干净
    unmountAllViews()
    invoke = vi.fn()
    send = vi.fn()
    vi.stubGlobal('electron', { ipcRenderer: { invoke, send } })
})

afterEach(() => {
    unmountAllViews()
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

    it('ignores non-html files selected from the event bus', async () => {
        const wrapper = mountView()

        await selectHtmlFile('/notes/readme.md', 'readme.md')

        expect(invoke).not.toHaveBeenCalled()
        expect(wrapper.find('.empty-container').exists()).toBe(true)
        expect(wrapper.find('iframe').exists()).toBe(false)
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
        expectSrcdoc(
            wrapper.find('iframe').attributes('srcdoc'),
            '/notes/retry.html',
            '<p>recovered</p>'
        )
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
        expectSrcdoc(
            wrapper.find('iframe').attributes('srcdoc'),
            '/notes/refresh.html',
            '<p>old</p>'
        )

        await wrapper.find('button[title="刷新"]').trigger('click')
        await nextTick()

        // 刷新期间重新进入加载态（旧内容被清空）
        expect(wrapper.find('.loading-container').text()).toContain('正在加载 HTML 文件...')
        expect(wrapper.find('iframe').exists()).toBe(false)

        resolveRefresh('<p>new</p>')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke).toHaveBeenLastCalledWith(IPC.FILE.READ_HTML, '/notes/refresh.html')
        expectSrcdoc(
            wrapper.find('iframe').attributes('srcdoc'),
            '/notes/refresh.html',
            '<p>new</p>'
        )
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
        unmountView(wrapper)

        // 卸载后再触发事件，不应再调用 IPC
        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, {
            path: '/notes/late.html',
            name: 'late.html'
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
        // 迁移（渲染层公共接口归位）：带属性的 <head> 同样按 shared injectIntoHead 语义注入
        const withAttr = withBaseHref(
            '<html><head class="head"><title>x</title></head><body>y</body></html>',
            '/notes/index.html'
        )
        expect(withAttr).toContain('<head class="head">\n    <base href="file:///notes/">')
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
        const out = withBaseHref(
            '<body>x</body>',
            'E:\\github.com\\BaiZeNotesByVue\\docs\\reports\\html\\README.html'
        )
        expect(out).toContain(
            '<base href="file:///E:/github.com/BaiZeNotesByVue/docs/reports/html/">'
        )
    })

    it('encodes non-ascii directory segments', () => {
        const out = withBaseHref('<body>x</body>', 'D:\\文档\\报告\\index.html')
        expect(out).toContain(`<base href="file:///D:/${encodeURI('文档/报告/')}">`)
    })

    it('encodes # and ? in directory names so paths are not truncated', () => {
        // 2026-11-19（P2 修复）：# 会被解析为 fragment、? 为 query，必须转义
        const out = withBaseHref('<body>x</body>', 'E:\\notes\\a#b?c\\index.html')
        expect(out).toContain('<base href="file:///E:/notes/a%23b%3Fc/">')
    })
})

describe('hasReportNavSlot / injectReportNav（报告导航注入纯函数）', () => {
    /** 报告页占位结构（生成脚本新契约：body 顶部标记 + 空容器） */
    const pageHtml = `<html><body>
<!-- baize-report-nav-slot -->
<div id="report-nav"></div>
<main>x</main>
</body></html>`

    it('detects the slot comment marker only', () => {
        expect(hasReportNavSlot(pageHtml)).toBe(true)
        // 注释内多余空白/大小写容忍
        expect(hasReportNavSlot('<!--   BAIZE-REPORT-NAV-SLOT   -->')).toBe(true)
        // 仅空容器不算占位（普通用户 HTML 不会被探测）
        expect(hasReportNavSlot('<html><body><div id="report-nav"></div></body></html>')).toBe(
            false
        )
        expect(hasReportNavSlot('<html><body>plain</body></html>')).toBe(false)
        expect(hasReportNavSlot('')).toBe(false)
    })

    it('replaces the slot comment and the adjacent empty nav container', () => {
        const out = injectReportNav(pageHtml, NAV_FRAGMENT)

        expect(out).toContain('<div id="report-nav">\n<nav class="rgnav"')
        expect(out).toContain('</nav>\n</div>')
        // 占位标记与空容器都必须消失，否则 srcdoc 内出现重复 id / 空导航
        expect(out).not.toContain('baize-report-nav-slot')
        expect(out).not.toContain('<div id="report-nav"></div>')
        // 页面其余内容原样保留
        expect(out).toContain('<main>x</main>')
    })

    it('cleans up the empty container when the slot and container are separated by content', () => {
        const html =
            '<body><!-- baize-report-nav-slot -->\n<p>中间内容</p>\n<div id="report-nav"></div></body>'
        const out = injectReportNav(html, NAV_FRAGMENT)

        expect(out).toContain('<p>中间内容</p>')
        expect(out).toContain('class="rgnav"')
        // 注入后文档中只允许一个 report-nav 容器（残留空容器被清理）
        expect(out.match(/id="report-nav"/g)).toHaveLength(1)
    })

    it('injects when the slot comment has no nav container following it', () => {
        const html = '<body><!-- baize-report-nav-slot --><main>y</main></body>'
        const out = injectReportNav(html, NAV_FRAGMENT)

        expect(out).toContain('<div id="report-nav">')
        expect(out).toContain('class="rgnav"')
        expect(out).toContain('<main>y</main>')
    })

    it('returns unchanged html for ordinary pages without a slot', () => {
        const html = '<html><body><p>plain</p></body></html>'
        expect(injectReportNav(html, NAV_FRAGMENT)).toBe(html)
    })

    it('returns unchanged html when the fragment is empty (read failure degradation)', () => {
        expect(injectReportNav(pageHtml, '')).toBe(pageHtml)
        expect(injectReportNav(pageHtml, '   \n ')).toBe(pageHtml)
    })

    it('inserts trusted fragment markup as-is (no escaping / no $ replacement patterns)', () => {
        // 片段含 `$&`/`$1` 等字符时不能被 String.replace 当作替换模式
        const fragment =
            '<nav class="rgnav"><a href="../assets/report.css?x=1&amp;y=2">A &amp; B $&amp; $1</a></nav>'
        const out = injectReportNav(pageHtml, fragment)
        expect(out).toContain(fragment)
    })
})

describe('isReportHomePage / getReportNavCandidatePaths（导航片段候选）', () => {
    it('recognizes the report wiki homepage README.html', () => {
        expect(isReportHomePage('/reports/html/README.html')).toBe(true)
        expect(isReportHomePage('E:\\repo\\docs\\reports\\html\\readme.HTML')).toBe(true)
        expect(isReportHomePage('/reports/html/01-scan/a.html')).toBe(false)
    })

    it('returns category-depth candidates in the contracted order', () => {
        expect(getReportNavCandidatePaths('/reports/html/01-scan/a.html')).toEqual([
            '/reports/html/01-scan/assets/report-nav.html',
            '/reports/html/01-scan/assets/report-nav-home.html',
            '/reports/html/assets/report-nav.html',
            '/reports/html/assets/report-nav-home.html'
        ])
    })

    it('prefers the home-depth variant for README.html (same assets dir holds both variants)', () => {
        expect(getReportNavCandidatePaths('/reports/html/README.html')).toEqual([
            '/reports/html/assets/report-nav-home.html',
            '/reports/html/assets/report-nav.html',
            '/reports/assets/report-nav-home.html',
            '/reports/assets/report-nav.html'
        ])
    })

    it('normalizes Windows separators for drive-letter paths', () => {
        expect(
            getReportNavCandidatePaths(
                'E:\\github.com\\BaiZeNotesByVue\\docs\\reports\\html\\01-检查与扫描\\示例.html'
            )
        ).toEqual([
            'E:/github.com/BaiZeNotesByVue/docs/reports/html/01-检查与扫描/assets/report-nav.html',
            'E:/github.com/BaiZeNotesByVue/docs/reports/html/01-检查与扫描/assets/report-nav-home.html',
            'E:/github.com/BaiZeNotesByVue/docs/reports/html/assets/report-nav.html',
            'E:/github.com/BaiZeNotesByVue/docs/reports/html/assets/report-nav-home.html'
        ])
    })

    it('returns no candidates for a bare file name (no directory information)', () => {
        expect(getReportNavCandidatePaths('a.html')).toEqual([])
        expect(getReportNavCandidatePaths('')).toEqual([])
    })
})

describe('ShowHtmlView 报告页静态导航注入（组件级）', () => {
    it('injects the static navigation fragment into report pages', async () => {
        mockReportNavIpc({
            pagePath: '/reports/html/01-scan/a.html',
            pageContent: reportPageHtml(),
            navPath: '/reports/html/assets/report-nav.html',
            navContent: NAV_FRAGMENT
        })
        const wrapper = mountView()

        await selectHtmlFile('/reports/html/01-scan/a.html', 'a.html')

        const iframe = wrapper.find('iframe')
        expect(iframe.exists()).toBe(true)
        const srcdoc = iframe.attributes('srcdoc') ?? ''
        // 注入静态导航片段（srcdoc 下脚本不执行，导航必须由渲染层补）
        expect(srcdoc).toContain('class="rgnav"')
        expect(srcdoc).toContain('<div id="report-nav">')
        expect(srcdoc).toContain('🏠 报告首页')
        // 占位与空容器均被替换，不残留
        expect(srcdoc).not.toContain('baize-report-nav-slot')
        expect(srcdoc).not.toContain('<div id="report-nav"></div>')
        // base 仍注入（srcdoc 内 ../assets/report.css 相对资源可加载）
        expect(srcdoc).toContain('<base href="file:///reports/html/01-scan/">')
        // 探测顺序：页面同级两个候选不存在 → 父级分类深度片段命中后即停止
        expect(invokeArgsOf(IPC.FILE.CHECK_EXISTS)).toEqual([
            '/reports/html/01-scan/assets/report-nav.html',
            '/reports/html/01-scan/assets/report-nav-home.html',
            '/reports/html/assets/report-nav.html'
        ])
        expect(invokeArgsOf(IPC.FILE.READ_HTML)).toEqual([
            '/reports/html/01-scan/a.html',
            '/reports/html/assets/report-nav.html'
        ])
    })

    it('does not probe nav assets for ordinary html pages (zero extra IPC)', async () => {
        invoke.mockResolvedValue('<html><body><h1>普通页面</h1></body></html>')
        const wrapper = mountView()

        await selectHtmlFile('/notes/plain.html', 'plain.html')

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, '/notes/plain.html')
        expect(invokeArgsOf(IPC.FILE.CHECK_EXISTS)).toEqual([])
        const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
        expect(srcdoc).toContain('<h1>普通页面</h1>')
        expect(srcdoc).not.toContain('rgnav')
    })

    it('prefers the home-depth nav variant when viewing the README.html homepage', async () => {
        const homeNav =
            '<nav class="rgnav"><a href="01-scan/a.html">01-检查与扫描 · 分类页</a></nav>'
        mockReportNavIpc({
            pagePath: '/reports/html/README.html',
            pageContent: reportPageHtml('assets/report.css'),
            navPath: '/reports/html/assets/report-nav-home.html',
            navContent: homeNav
        })
        const wrapper = mountView()

        await selectHtmlFile('/reports/html/README.html', 'README.html')

        // 首页位于报告根目录：第一个候选必须是首页深度片段，避免误用分类深度（多一层 ../）
        expect(invokeArgsOf(IPC.FILE.CHECK_EXISTS)[0]).toBe(
            '/reports/html/assets/report-nav-home.html'
        )
        const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
        expect(srcdoc).toContain('class="rgnav"')
        expect(srcdoc).toContain('href="01-scan/a.html"')
        expect(srcdoc).toContain('<base href="file:///reports/html/">')
    })

    it('degrades gracefully when the nav fragment cannot be read', async () => {
        mockReportNavIpc({
            pagePath: '/reports/html/01-scan/a.html',
            pageContent: reportPageHtml(),
            navPath: '/reports/html/assets/report-nav.html',
            navReadFails: true
        })
        const wrapper = mountView()

        await selectHtmlFile('/reports/html/01-scan/a.html', 'a.html')

        // 不抛错、不进入错误态：页面正常展示，仅导航缺失
        expect(wrapper.find('.error-container').exists()).toBe(false)
        expect(wrapper.find('iframe').exists()).toBe(true)
        const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
        expect(srcdoc).toContain('<main>报告正文</main>')
        expect(srcdoc).toContain('<base href="file:///reports/html/01-scan/">')
        expect(srcdoc).not.toContain('rgnav')
    })

    it('keeps the page when no nav fragment candidate exists', async () => {
        mockReportNavIpc({
            pagePath: '/reports/html/01-scan/a.html',
            pageContent: reportPageHtml(),
            navContent: NAV_FRAGMENT
        })
        const wrapper = mountView()

        await selectHtmlFile('/reports/html/01-scan/a.html', 'a.html')

        expect(wrapper.find('.error-container').exists()).toBe(false)
        const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
        expect(srcdoc).toContain('<main>报告正文</main>')
        expect(srcdoc).not.toContain('rgnav')
    })

    it('re-injects the navigation when refreshing a report page', async () => {
        // 首次读取 + 片段探测
        mockReportNavIpc({
            pagePath: '/reports/html/01-scan/a.html',
            pageContent: reportPageHtml(),
            navPath: '/reports/html/assets/report-nav.html',
            navContent: NAV_FRAGMENT
        })
        const wrapper = mountView()
        await selectHtmlFile('/reports/html/01-scan/a.html', 'a.html')
        expect(invokeArgsOf(IPC.FILE.READ_HTML)).toHaveLength(2)

        // 刷新：重新读页面并再次注入（IPC mock 保持）
        await wrapper.find('button[title="刷新"]').trigger('click')
        await flushPromises()

        // 页面读取 2 次 + 导航片段读取 2 次（每次刷新各自注入一次）
        expect(invokeArgsOf(IPC.FILE.READ_HTML)).toHaveLength(4)
        const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
        expect(srcdoc).toContain('class="rgnav"')
    })
})
