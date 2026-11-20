// @vitest-environment jsdom
/**
 * ShowHtmlView.vue 的 iframe 载入与链接守卫补测（既有测试覆盖三态/IPC/报告导航注入，
 * 本文件补齐 iframe onload 与文档级链接事件委托、加载代次守卫、打开浏览器按钮）。
 *
 * 背景：组件在 `sandbox="allow-same-origin"` 的 srcdoc iframe 上做父页面事件委托，
 * 拦截「纯 fragment 锚点」与「本地 .html 跨文档链接」；jsdom 不渲染 srcdoc 文档，
 * 因此用例用 `Object.defineProperty` 给 iframe 元素注入替身 document，验证：
 * 1. iframe load 事件 → 结束加载态 + 绑定文档级 click 守卫（重复 load 只绑定一次）；
 * 2. 纯 fragment：阻止默认行为、按 id 查找锚点并只在 iframe 内 scrollTo（预留 72px 偏移）；
 * 3. 非法/不存在的 fragment、空 fragment 的安全早退；
 * 4. 本地 .html 跨文档链接改走查看器加载器（READ_HTML + 路径切换），http/同页链接放行；
 * 5. 点击目标非链接、document 缺失时的防御早退；
 * 6. 报告导航片段为空 → 不注入（保持原内容）；
 * 7. 加载代次守卫：READ_HTML 与导航片段读取期间卸载，均不写回内容；
 * 8. 内容态「在浏览器中打开」走专用通道。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

import ShowHtmlView from '@renderer/components/HemyTools/ShowHtmlView.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/** 替身 iframe document：只实现守卫用到的成员 */
interface FakeIframeDocument {
    __baizeAnchorGuardBound?: boolean
    listeners: Array<(event: MouseEvent) => void>
    anchors: Map<string, { getBoundingClientRect: () => { top: number } }>
    scrollTo: ReturnType<typeof vi.fn>
    defaultView: { scrollY: number; scrollTo: ReturnType<typeof vi.fn> } | null
    addEventListener: (
        type: string,
        listener: (event: MouseEvent) => void,
        capture?: boolean
    ) => void
    getElementById: (id: string) => { getBoundingClientRect: () => { top: number } } | null
}

function makeFakeDocument(
    options: { withView?: boolean; anchors?: string[] } = {}
): FakeIframeDocument {
    const anchors = new Map<string, { getBoundingClientRect: () => { top: number } }>()
    for (const id of options.anchors ?? []) {
        anchors.set(id, { getBoundingClientRect: () => ({ top: 200 }) })
    }
    const scrollTo = vi.fn()
    const doc: FakeIframeDocument = {
        listeners: [],
        anchors,
        scrollTo,
        defaultView: options.withView === false ? null : { scrollY: 100, scrollTo },
        addEventListener: (type, listener) => {
            if (type === 'click') doc.listeners.push(listener)
        },
        getElementById: (id) => anchors.get(id) ?? null
    }
    return doc
}

/** 给 iframe 元素注入替身 contentDocument（jsdom 不渲染 srcdoc） */
function installFakeDocument(iframe: HTMLIFrameElement, doc: FakeIframeDocument | null): void {
    Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        get: () => doc
    })
}

/** 链接替身：rawHref 为 DOM 属性值，resolvedHref 为浏览器解析后的绝对 URL */
interface FakeLink {
    closest: (selector: string) => FakeLink | null
    getAttribute: (name: string) => string | null
    href: string
}

function makeLinkElement(rawHref: string, resolvedHref: string): FakeLink {
    const link: FakeLink = {
        href: resolvedHref,
        getAttribute: (name: string) => (name === 'href' ? rawHref : null),
        closest: () => null
    }
    link.closest = (selector: string) => (selector === 'a' ? link : null)
    return link
}

/** 构造点击事件替身：target 为链接元素时返回该链接 */
function makeClickEvent(link: FakeLink | null): {
    event: MouseEvent
    preventDefault: ReturnType<typeof vi.fn>
} {
    const preventDefault = vi.fn()
    const event = {
        target: link,
        preventDefault
    } as unknown as MouseEvent
    return { event, preventDefault }
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
const mountedViews: VueWrapper[] = []

function mountView(): VueWrapper {
    const view = mount(ShowHtmlView)
    mountedViews.push(view)
    return view
}

function unmountAll(): void {
    while (mountedViews.length > 0) {
        mountedViews.pop()?.unmount()
    }
}

async function selectHtmlFile(path: string, name: string): Promise<void> {
    EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, { path, name })
    await flushPromises()
    await nextTick()
}

/** 成功加载普通 HTML 并返回 iframe 元素 */
async function loadSimpleHtml(
    path = '/notes/a.html',
    content = '<html><body><a href="#sec-1">跳转</a></body></html>'
): Promise<{ wrapper: VueWrapper; iframe: HTMLIFrameElement }> {
    invoke.mockImplementation(async (channel: string) => {
        if (channel === IPC.FILE.READ_HTML) return content
        return null
    })
    const wrapper = mountView()
    await selectHtmlFile(path, path.split('/').pop() ?? 'a.html')
    const iframe = wrapper.find('iframe').element as HTMLIFrameElement
    return { wrapper, iframe }
}

/** 绑定守卫并返回替身 document（触发 load 事件） */
async function bindGuard(iframe: HTMLIFrameElement, doc: FakeIframeDocument): Promise<void> {
    installFakeDocument(iframe, doc)
    iframe.dispatchEvent(new Event('load'))
    await flushPromises()
}

beforeEach(() => {
    unmountAll()
    invoke = vi.fn()
    send = vi.fn()
    vi.stubGlobal('electron', { ipcRenderer: { invoke, send } })
})

afterEach(() => {
    unmountAll()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ShowHtmlView iframe 载入与链接守卫', () => {
    it('iframe load 后绑定文档级点击守卫，且重复 load 只绑定一次', async () => {
        const { iframe } = await loadSimpleHtml()
        const doc = makeFakeDocument({ anchors: ['sec-1'] })

        await bindGuard(iframe, doc)
        expect(doc.listeners).toHaveLength(1)
        expect(doc.__baizeAnchorGuardBound).toBe(true)

        // 再次 load（iframe 内部导航后重新触发）不应重复绑定
        await bindGuard(iframe, doc)
        expect(doc.listeners).toHaveLength(1)
    })

    it('纯 fragment 链接仅滚动 iframe 内部（预留 72px 顶部偏移）', async () => {
        const { iframe } = await loadSimpleHtml()
        const doc = makeFakeDocument({ anchors: ['sec-1'] })
        await bindGuard(iframe, doc)

        const link = makeLinkElement('#sec-1', 'file:///notes/a.html#sec-1')
        const { event, preventDefault } = makeClickEvent(link)
        doc.listeners[0](event)

        expect(preventDefault).toHaveBeenCalled()
        // top = 200（锚点相对文档顶部）+ 100（scrollY） - 72（导航高度）
        expect(doc.scrollTo).toHaveBeenCalledWith({ top: 228 })
    })

    it('fragment 解码失败按原文查找；锚点不存在或 fragment 为空时安全早退', async () => {
        const { iframe } = await loadSimpleHtml()
        const doc = makeFakeDocument({ anchors: ['%E4%B8'] })
        await bindGuard(iframe, doc)

        // 非法百分号编码（截断的 UTF-8）：decodeURIComponent 抛错 → 按原文查找
        const encodedLink = makeLinkElement('#%E4%B8', 'file:///notes/a.html#%E4%B8')
        const first = makeClickEvent(encodedLink)
        doc.listeners[0](first.event)
        expect(first.preventDefault).toHaveBeenCalled()
        expect(doc.scrollTo).toHaveBeenCalledWith({ top: 228 })

        // 锚点不存在：阻止默认行为但不滚动
        doc.scrollTo.mockClear()
        const missingLink = makeLinkElement('#missing', 'file:///notes/a.html#missing')
        const second = makeClickEvent(missingLink)
        doc.listeners[0](second.event)
        expect(second.preventDefault).toHaveBeenCalled()
        expect(doc.scrollTo).not.toHaveBeenCalled()

        // 空 fragment（'#'）：长度 <= 1 → 早退
        const emptyLink = makeLinkElement('#', 'file:///notes/a.html#')
        const third = makeClickEvent(emptyLink)
        doc.listeners[0](third.event)
        expect(third.preventDefault).toHaveBeenCalled()
        expect(doc.scrollTo).not.toHaveBeenCalled()
    })

    it('fragment 目标 id 为百分号编码时解码后查找锚点', async () => {
        const { iframe } = await loadSimpleHtml()
        const doc = makeFakeDocument({ anchors: ['中'] })
        await bindGuard(iframe, doc)

        const link = makeLinkElement('#%E4%B8%AD', 'file:///notes/a.html#%E4%B8%AD')
        const { event } = makeClickEvent(link)
        doc.listeners[0](event)
        expect(doc.scrollTo).toHaveBeenCalledWith({ top: 228 })
    })

    it('本地 .html 跨文档链接改走查看器加载器（重新读取并切换路径）', async () => {
        const { wrapper, iframe } = await loadSimpleHtml('/notes/a.html', '<p>first</p>')
        const doc = makeFakeDocument()
        await bindGuard(iframe, doc)

        invoke.mockImplementation(async (channel: string, target: unknown) => {
            if (channel === IPC.FILE.READ_HTML && target === '/notes/b.html') return '<p>second</p>'
            return null
        })

        const link = makeLinkElement('./b.html', 'file:///notes/b.html')
        const { event, preventDefault } = makeClickEvent(link)
        doc.listeners[0](event)
        await flushPromises()

        expect(preventDefault).toHaveBeenCalled()
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, '/notes/b.html')
        expect(wrapper.find('.file-name').text()).toBe('/notes/b.html')
        expect(wrapper.find('iframe').attributes('srcdoc')).toContain('second')
    })

    it('http 链接与当前页自身链接放行浏览器默认行为', async () => {
        const { iframe } = await loadSimpleHtml('/notes/a.html', '<p>first</p>')
        const doc = makeFakeDocument()
        await bindGuard(iframe, doc)

        // http(s)：默认行为
        const externalLink = makeLinkElement('https://example.com/x', 'https://example.com/x')
        const external = makeClickEvent(externalLink)
        doc.listeners[0](external.event)
        expect(external.preventDefault).not.toHaveBeenCalled()

        // 当前页自身（file:// 同路径）：默认行为
        const samePageLink = makeLinkElement('a.html', 'file:///notes/a.html')
        const samePage = makeClickEvent(samePageLink)
        doc.listeners[0](samePage.event)
        expect(samePage.preventDefault).not.toHaveBeenCalled()
    })

    it('点击目标不是链接时忽略；document 缺失时 load 不绑定守卫', async () => {
        const { iframe } = await loadSimpleHtml()
        const doc = makeFakeDocument()
        await bindGuard(iframe, doc)

        // target 无 closest（如文本节点）：忽略
        const { event, preventDefault } = makeClickEvent(null)
        doc.listeners[0](event)
        expect(preventDefault).not.toHaveBeenCalled()

        // contentDocument 为 null：load 事件不抛错、不绑定
        installFakeDocument(iframe, null)
        iframe.dispatchEvent(new Event('load'))
        await flushPromises()
    })

    it('报告导航片段为空时不注入（保持原内容）', async () => {
        const pageContent =
            '<html><body><!-- baize-report-nav-slot --><div id="report-nav"></div><main>正文</main></body></html>'
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.READ_HTML) return pageContent
            // CHECK_EXISTS 命中、片段读取返回空串 → 继续下一个候选，最终不注入
            if (channel === IPC.FILE.CHECK_EXISTS) return true
            return ''
        })
        const wrapper = mountView()
        await selectHtmlFile('/reports/html/README.html', 'README.html')

        const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
        expect(srcdoc).toContain('baize-report-nav-slot')
        expect(srcdoc).not.toContain('rgnav')
    })

    it('READ_HTML 返回前卸载：内容丢弃不写回', async () => {
        let resolveRead!: (content: string) => void
        invoke.mockReturnValue(
            new Promise<string>((resolve) => {
                resolveRead = resolve
            })
        )
        const wrapper = mountView()
        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, {
            path: '/notes/slow.html',
            name: 'slow.html'
        })
        await flushPromises()
        wrapper.unmount()
        mountedViews.splice(mountedViews.indexOf(wrapper), 1)

        resolveRead('<p>late</p>')
        await flushPromises()
        expect(wrapper.find('iframe').exists()).toBe(false)
    })

    it('导航片段读取期间卸载：内容丢弃不写回', async () => {
        const pageContent =
            '<html><body><!-- baize-report-nav-slot --><div id="report-nav"></div></body></html>'
        let resolveCheck!: (exists: boolean) => void
        invoke.mockImplementation((channel: string) => {
            if (channel === IPC.FILE.READ_HTML) return Promise.resolve(pageContent)
            if (channel === IPC.FILE.CHECK_EXISTS) {
                return new Promise<boolean>((resolve) => {
                    resolveCheck = resolve
                })
            }
            return Promise.resolve(null)
        })
        const wrapper = mountView()
        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, {
            path: '/reports/html/README.html',
            name: 'README.html'
        })
        await flushPromises()
        wrapper.unmount()
        mountedViews.splice(mountedViews.indexOf(wrapper), 1)

        // 卸载后导航探测仍会完成，但加载上下文已过期 → 不写回内容
        resolveCheck(false)
        await flushPromises()
        expect(wrapper.find('iframe').exists()).toBe(false)
    })

    it('内容态「在浏览器中打开」走专用通道', async () => {
        const { wrapper } = await loadSimpleHtml('/notes/open.html', '<p>open</p>')

        const openButton = wrapper.findAll('.toolbar-btn')[0]
        await openButton.trigger('click')

        expect(send).toHaveBeenCalledWith(IPC.FILE.OPEN_IN_BROWSER, '/notes/open.html')
    })
})
