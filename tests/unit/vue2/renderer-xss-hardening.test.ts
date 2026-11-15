// @vitest-environment jsdom
/**
 * P1 渲染层 XSS 修复回归测试。
 *
 * 覆盖点：
 * 1. N-03：Markdown 目录（TOC）——markdown-it 的 text token 已完成实体解码，
 *    恶意标题 `<img onerror>` 经 ResourceManager 渲染时必须只作为纯文本出现，
 *    DOM 中不得产生可执行元素（v-html 已改为文本插值）；
 * 2. N-06：NaviTab 快速链接 svg 图标——iconContent 经 DOMPurify（svg+svgFilters
 *    profile）消毒，脚本/事件处理器/foreignObject 等被剥离，正常图标保留；
 * 3. 非 svg 分支（text/img/emoji）保持原有绑定方式（文本插值/属性绑定），不引入 HTML 注入面。
 *
 * N-04（HTML 查看器 iframe sandbox）断言见 tests/unit/vue2/hemytools-html-view.test.ts。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

// ResourceManager 的子组件 FileTreeNode 依赖右键菜单组件，mock 后避免真实渲染/加载副作用
vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: vi.fn() }
}))

import ResourceManager from '@renderer/components/ResourceManager/ResourceManager.vue'
import NaviTab from '@renderer/components/WorkSpaceArea/NaviTab.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import type { MarkdownTOC, QuickLinkItem } from '../../../src/shared/types'

let wrapper: VueWrapper | null = null

/** 以 preload 暴露形态 stub 全局 electron（与既有 Vue 组件测试一致） */
function stubElectron(ipcRenderer: Record<string, unknown>): void {
    vi.stubGlobal('electron', { ipcRenderer })
}

/** 构造一条恶意目录项：text 为 markdown-it 实体解码后的原始 HTML */
function maliciousTocItem(overrides: Partial<MarkdownTOC> = {}): MarkdownTOC {
    return {
        id: 'toc-evil-0',
        level: 'h1',
        text: '<img src=x onerror="window.__tocXss = 1">',
        lineNumber: 0,
        ...overrides
    }
}

/** 通过 EventBus 向 ResourceManager 下发一版目录数据 */
async function emitToc(toc: MarkdownTOC[]): Promise<void> {
    EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, toc)
    await nextTick()
}

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('ResourceManager TOC 渲染（P1/N-03）', () => {
    beforeEach(() => {
        stubElectron({ on: vi.fn(), removeListener: vi.fn() })
    })

    function mountManager(): VueWrapper {
        wrapper = mount(ResourceManager)
        return wrapper
    }

    /**
     * PF-8：ResourceManager 的 TOC 面板默认隐藏（文件树模式），隐藏期间只缓存大纲不更新 DOM；
     * 本组用例验证 TOC 渲染，因此挂载后先切到 markdown-toc 视图再下发目录数据。
     */
    async function mountManagerWithTocVisible(): Promise<VueWrapper> {
        const manager = mountManager()
        await manager.setProps({ naviShow: 'markdown-toc' })
        await nextTick()
        return manager
    }

    it('should render malicious heading text as plain text without executable HTML', async () => {
        const manager = await mountManagerWithTocVisible()
        const imgPayload = '<img src=x onerror="window.__tocXss = 1">'
        const scriptPayload = '<script>window.__tocXss = 2</script>'

        await emitToc([
            maliciousTocItem({ id: 'toc-img-0', level: 'h1', text: imgPayload, lineNumber: 0 }),
            maliciousTocItem({
                id: 'toc-script-2',
                level: 'h3',
                text: scriptPayload,
                lineNumber: 2
            })
        ])

        const titles = manager.findAll('#markdown-toc-heading .markdown-toc-title')
        expect(titles).toHaveLength(2)

        // 标题以纯文本 + U+00A0 缩进展示（h1 缩进 2 个、h3 缩进 6 个）
        // 注意：wrapper.text() 会 trim 掉首尾空白（含 U+00A0），故直接读 textContent
        expect(titles[0].element.textContent).toBe('\u00A0\u00A0' + imgPayload)
        expect(titles[1].element.textContent).toBe('\u00A0'.repeat(6) + scriptPayload)

        // DOM 中不存在由标题注入的可执行元素 / 事件属性
        expect(manager.find('#markdown-toc-heading img').exists()).toBe(false)
        expect(manager.find('#markdown-toc-heading script').exists()).toBe(false)
        expect(
            manager
                .find('#markdown-toc-heading')
                .element.querySelectorAll('img, script, iframe, object, embed, a')
        ).toHaveLength(0)
        expect(manager.find('#markdown-toc-heading [onerror]').exists()).toBe(false)

        // 文本插值渲染：注入串在 innerHTML 中以转义实体形式存在
        expect(titles[0].element.innerHTML).toContain('&lt;img')
        expect(titles[0].element.innerHTML).not.toContain('<img')
        expect(manager.html()).not.toContain('<script')

        // 脚本未执行（jsdom 中注入的全局标记不存在）
        expect((window as unknown as { __tocXss?: number }).__tocXss).toBeUndefined()
    })

    it('should preserve level indentation (U+00A0) for normal headings', async () => {
        const manager = await mountManagerWithTocVisible()

        await emitToc([
            { id: 'toc-a-0', level: 'h1', text: '一级标题', lineNumber: 0 },
            { id: 'toc-b-2', level: 'h2', text: '二级标题', lineNumber: 2 },
            { id: 'toc-c-4', level: 'h3', text: '三级标题', lineNumber: 4 }
        ])

        const titles = manager.findAll('.markdown-toc-title')
        // 与改造前 `'&nbsp;'.repeat(levelNum * 2)` 的视觉宽度一致：h1=2、h2=4、h3=6
        // 注意：wrapper.text() 会 trim 掉首尾空白（含 U+00A0），故直接读 textContent
        expect(titles.map((title) => title.element.textContent)).toEqual([
            '\u00A0'.repeat(2) + '一级标题',
            '\u00A0'.repeat(4) + '二级标题',
            '\u00A0'.repeat(6) + '三级标题'
        ])
    })

    it('should still emit the locate-target-line event with the original TOC item on click', async () => {
        const manager = await mountManagerWithTocVisible()
        const item: MarkdownTOC = {
            id: 'toc-click-5',
            level: 'h2',
            text: '跳转目标',
            lineNumber: 5
        }
        const locateSpy = vi.fn()
        EventBus.$on(EVENT_BUS.MONACO_LOCATE_TARGET_LINE, locateSpy, { once: true })

        await emitToc([item])
        await manager.find('#markdown-toc-heading > div').trigger('click')

        expect(locateSpy).toHaveBeenCalledWith(item)
    })
})

describe('NaviTab 快速链接 svg 图标消毒（P1/N-06）', () => {
    let invoke: ReturnType<typeof vi.fn>
    let on: ReturnType<typeof vi.fn>
    let removeListener: ReturnType<typeof vi.fn>

    beforeEach(() => {
        invoke = vi.fn().mockResolvedValue([])
        on = vi.fn()
        removeListener = vi.fn()
        stubElectron({ invoke, send: vi.fn(), on, removeListener })
    })

    /** 构造一个启用的快速链接配置 */
    function quickLink(overrides: Partial<QuickLinkItem> = {}): QuickLinkItem {
        return {
            id: 'link-1',
            name: '恶意图标',
            type: 'url',
            path: 'https://example.com/',
            icon: 'svg',
            iconContent: '',
            enabled: true,
            order: 0,
            position: 'left',
            ...overrides
        }
    }

    /** 挂载 NaviTab 并让其加载指定快速链接 */
    async function mountWithLinks(links: QuickLinkItem[]): Promise<VueWrapper> {
        invoke.mockResolvedValue(links)
        wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()
        return wrapper
    }

    function findLinkButton(container: VueWrapper, title: string) {
        const button = container
            .findAll('button[title]')
            .find((item) => item.attributes('title') === title)
        expect(button, `应渲染快速链接按钮：${title}`).toBeTruthy()
        return button!
    }

    it('should sanitize malicious svg iconContent and keep the svg icon itself', async () => {
        const maliciousSvg =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
            '<script>window.__naviXss = 1</script>' +
            '<path d="M0 0h24v24H0z" onclick="window.__naviXss = 2"></path>' +
            '<image href="x" onerror="window.__naviXss = 3"></image>' +
            '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">' +
            '<img src="x" onerror="window.__naviXss = 4"></body></foreignObject>' +
            '</svg>'
        const view = await mountWithLinks([quickLink({ iconContent: maliciousSvg })])
        const button = findLinkButton(view, '恶意图标')

        // 图标本体保留（viewBox/path 仍在），说明消毒不是整体丢弃
        expect(button.find('svg').exists()).toBe(true)
        expect(button.find('svg').attributes('viewBox')).toBe('0 0 24 24')
        expect(button.find('path').attributes('d')).toBe('M0 0h24v24H0z')

        // 脚本 / 事件处理器 / foreignObject 注入面被剥离
        expect(button.find('script').exists()).toBe(false)
        expect(button.find('[onclick]').exists()).toBe(false)
        expect(button.find('[onerror]').exists()).toBe(false)
        expect(button.find('img').exists()).toBe(false)
        expect(button.html()).not.toContain('<script')
        expect(button.html().toLowerCase()).not.toContain('foreignobject')

        // 脚本未执行（jsdom 中注入的全局标记不存在）
        expect((window as unknown as { __naviXss?: number }).__naviXss).toBeUndefined()
    })

    it('should strip HTML injection when svg profile does not allow HTML tags', async () => {
        const view = await mountWithLinks([
            quickLink({
                iconContent: '<div><img src=x onerror="window.__naviXss = 9"></div>'
            })
        ])
        const button = findLinkButton(view, '恶意图标')

        expect(button.find('img').exists()).toBe(false)
        expect(button.html()).not.toContain('onerror')
    })

    it('should keep a normal svg icon after sanitization', async () => {
        const normalSvg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
            '<path d="M12 2L2 7l10 5 10-5-10-5z" fill="#333"></path>' +
            '<circle cx="12" cy="17" r="3"></circle></svg>'
        const view = await mountWithLinks([quickLink({ iconContent: normalSvg })])
        const button = findLinkButton(view, '恶意图标')

        expect(button.find('svg').exists()).toBe(true)
        expect(button.find('path').attributes('fill')).toBe('#333')
        expect(button.find('circle').attributes('r')).toBe('3')
    })

    it('should leave text / img / emoji branches as escaped text or attribute bindings', async () => {
        const view = await mountWithLinks([
            quickLink({
                id: 'link-text',
                name: '文本图标',
                icon: 'text',
                iconContent: '<b>X</b>'
            }),
            quickLink({
                id: 'link-img',
                name: '图片图标',
                icon: 'img',
                iconContent: 'https://example.com/icon.png'
            }),
            quickLink({
                id: 'link-emoji',
                name: '表情图标',
                icon: 'emoji',
                iconContent: '<img src=x onerror="window.__naviXss = 5">'
            })
        ])

        // text 分支：文本插值，`<b>` 只作为字面文本出现
        const textButton = findLinkButton(view, '文本图标')
        expect(textButton.find('.text-icon').text()).toBe('<b>X</b>')
        expect(textButton.find('.text-icon b').exists()).toBe(false)

        // img 分支：属性绑定，src 原样（是否可访问由主进程/网络策略决定，非本注入面）
        const imgButton = findLinkButton(view, '图片图标')
        expect(imgButton.find('img').attributes('src')).toBe('https://example.com/icon.png')

        // emoji（默认）分支：文本插值，HTML 串只作为字面文本
        const emojiButton = findLinkButton(view, '表情图标')
        expect(emojiButton.find('span').text()).toBe('<img src=x onerror="window.__naviXss = 5">')
        expect(emojiButton.find('img').exists()).toBe(false)
        expect((window as unknown as { __naviXss?: number }).__naviXss).toBeUndefined()
    })
})
