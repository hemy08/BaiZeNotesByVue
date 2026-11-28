// @vitest-environment jsdom
/**
 * 帮助 → 使用指导：本地 HTML 地址解析、对话框状态、宿主挂载与卸载，
 * 以及 1.5.6「应用内搜索由父页面代理」的索引 / 检索 / 键盘 / 滚动 / 高亮回归。
 *
 * iframe 安全边界是硬约束：sandbox 必须只有 allow-same-origin，绝不允许 allow-scripts
 * （与 allow-same-origin 组合可让同源文档以父窗口身份执行脚本，属沙箱逃逸风险，SEC-12）。
 * 本文件的断言**只收紧不放宽**，并用源码级扫描锁定「不允许出现 allow-scripts」。
 *
 * jsdom 不会真实加载 iframe 的 src，因此用例用 `Object.defineProperty` 给 iframe 元素注入
 * 替身 contentDocument / contentWindow（与 ShowHtmlView 的既有测法一致），再手动触发 load，
 * 验证父页面代理搜索的完整链路。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import UsageGuideDialog from '../../../src/renderer/src/components/dialogs/help/usage-guide/UsageGuideDialog.vue'
import {
    disposeUsageGuideHost,
    openUsageGuideDialog,
    USAGE_GUIDE_HOST_ID
} from '../../../src/renderer/src/components/dialogs/help/usage-guide'
import {
    closeUsageGuideDialogState,
    getUsageGuideUrl,
    openUsageGuideDialogState,
    resolveUsageGuideUrl,
    usageGuideDialogState,
    USAGE_GUIDE_FALLBACK_URL
} from '../../../src/renderer/src/components/dialogs/help/usage-guide/usage-guide-state'
import {
    USAGE_GUIDE_HIGHLIGHT_MS,
    USAGE_GUIDE_HIT_CLASS,
    USAGE_GUIDE_MAX_HIGHLIGHTS,
    USAGE_GUIDE_MAX_RESULTS,
    buildUsageGuideIndex,
    clearUsageGuideHighlights,
    highlightUsageGuideSection,
    makeUsageGuideSnippet,
    queryUsageGuideSections,
    readUsageGuideFrame,
    scrollUsageGuideToSection,
    splitUsageGuideText,
    type UsageGuideFrame,
    type UsageGuideSection
} from '../../../src/renderer/src/components/dialogs/help/usage-guide/usage-guide-search'
import { t } from '../../../src/renderer/src/common/i18n'

/** 组件源码绝对路径（安全回归：锁定 sandbox 不含 allow-scripts） */
const DIALOG_SOURCE_PATH = join(
    process.cwd(),
    'src/renderer/src/components/dialogs/help/usage-guide/UsageGuideDialog.vue'
)

/** 生成后的帮助 HTML（用于校验父页面索引与页面悬浮目录一一对应） */
const USAGE_GUIDE_HTML_PATH = join(process.cwd(), 'src/renderer/public/usage-guide.html')

/** 替身 iframe 窗口：只实现滚动/媒体查询所需成员 */
interface FakeFrameWindow {
    scrollY: number
    scrollTo: ReturnType<typeof vi.fn>
    matchMedia?: (query: string) => { matches: boolean }
}

/** 挂载过的对话框（用例结束统一卸载，避免 BaseDialog 焦点栈跨用例残留） */
const mountedWrappers: VueWrapper[] = []

afterEach(() => {
    while (mountedWrappers.length > 0) {
        const wrapper = mountedWrappers.pop()
        try {
            wrapper?.unmount()
        } catch {
            // 用例已卸载/已失效：忽略
        }
    }
    vi.useRealTimers()
    disposeUsageGuideHost()
    closeUsageGuideDialogState()
    document.body.innerHTML = ''
})

describe('resolveUsageGuideUrl', () => {
    it('生产 app:// 入口解析为同源 guide 地址', () => {
        expect(resolveUsageGuideUrl('app://baize/index.html')).toBe('app://baize/usage-guide.html')
    })

    it('开发 http 入口解析为同源 guide 地址', () => {
        expect(resolveUsageGuideUrl('http://localhost:5173/index.html')).toBe(
            'http://localhost:5173/usage-guide.html'
        )
    })

    it('无/非法 location 使用兜底地址', () => {
        expect(resolveUsageGuideUrl(undefined)).toBe(USAGE_GUIDE_FALLBACK_URL)
        expect(resolveUsageGuideUrl('not a url')).toBe(USAGE_GUIDE_FALLBACK_URL)
    })

    it('运行时 getUsageGuideUrl 不抛错且以 usage-guide.html 结尾', () => {
        expect(getUsageGuideUrl()).toMatch(/usage-guide\.html$/)
    })
})

describe('usage guide dialog state/host', () => {
    it('打开/关闭只切显隐', () => {
        openUsageGuideDialogState()
        expect(usageGuideDialogState.visible).toBe(true)
        closeUsageGuideDialogState()
        expect(usageGuideDialogState.visible).toBe(false)
    })

    it('openUsageGuideDialog 挂载宿主并打开；重复打开复用宿主', async () => {
        const first = await openUsageGuideDialog()
        expect(first).toBe(true)
        expect(usageGuideDialogState.visible).toBe(true)
        expect(document.getElementById(USAGE_GUIDE_HOST_ID)).not.toBeNull()
        const host = document.getElementById(USAGE_GUIDE_HOST_ID)
        const second = await openUsageGuideDialog()
        expect(second).toBe(true)
        expect(document.getElementById(USAGE_GUIDE_HOST_ID)).toBe(host)
    })

    it('dispose 清理宿主；之后可重新打开', async () => {
        await openUsageGuideDialog()
        disposeUsageGuideHost()
        expect(document.getElementById(USAGE_GUIDE_HOST_ID)).toBeNull()
        expect(usageGuideDialogState.visible).toBe(false)
        expect(await openUsageGuideDialog()).toBe(true)
    })
})

// =============================================================================================
// 父页面代理搜索：纯函数（索引 / 检索 / 分段 / 摘要 / 滚动 / 高亮）
// =============================================================================================

/** 构造与生成 HTML 同构的替身文档：打印目录 + h1 大标题 + h2/h3 正文块 */
function createGuideDocument(): Document {
    const doc = document.implementation.createHTMLDocument('usage-guide')
    doc.body.innerHTML = [
        '<div class="layout">',
        '<aside class="side"><nav id="help-toc"><ul><li><a href="#sec-2">1. 快速开始</a></li></ul></nav></aside>',
        '<main>',
        '<section class="print-toc"><h2>目录</h2><ul><li><a href="#sec-2">1. 快速开始</a></li></ul></section>',
        '<h1 id="sec-1">白泽笔记使用指导</h1>',
        '<blockquote><p>平台：Windows x64</p></blockquote>',
        '<h2 id="sec-2">1. 快速开始</h2>',
        '<h3 id="sec-3">1.1 打开工作区</h3>',
        '<ol><li>启动应用，在欢迎页选择「打开文件夹」。</li></ol>',
        '<h2 id="sec-9">2. 文件管理</h2>',
        '<p>打开、新建、保存与恢复；编码与换行。</p>',
        '<h3 id="sec-10">2.1 支持的文件</h3>',
        '<p>Markdown、TXT 与 PDF。</p>',
        '</main>',
        '</div>',
        '<button class="side-fab">目录与搜索</button>',
        '<script>window.__usageGuideInlineScriptRan = true</script>'
    ].join('')
    return doc
}

/** 给标题安装 scrollIntoView mock（jsdom 未实现该方法） */
function installScrollMocks(doc: Document): Map<string, ReturnType<typeof vi.fn>> {
    const scrollMocks = new Map<string, ReturnType<typeof vi.fn>>()
    for (const id of ['sec-2', 'sec-3', 'sec-9', 'sec-10']) {
        const heading = doc.getElementById(id)
        if (!heading) continue
        const scrollIntoView = vi.fn()
        Object.defineProperty(heading, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView
        })
        scrollMocks.set(id, scrollIntoView)
    }
    return scrollMocks
}

/** 构造替身 iframe 窗口 */
function createFakeFrameWindow(matchesReducedMotion = false): FakeFrameWindow {
    return {
        scrollY: 100,
        scrollTo: vi.fn(),
        matchMedia: (query: string) => ({
            matches: matchesReducedMotion && query.includes('prefers-reduced-motion')
        })
    }
}

/** 用标题/正文替身文档组装可搜索章节（复用真实索引逻辑） */
function loadSections(doc: Document): UsageGuideSection[] {
    return buildUsageGuideIndex(doc)
}

function findSection(sections: UsageGuideSection[], id: string): UsageGuideSection {
    const section = sections.find((item) => item.id === id)
    expect(section, `缺少章节 ${id}`).toBeDefined()
    return section as UsageGuideSection
}

describe('buildUsageGuideIndex 章节索引', () => {
    it('按 main 直接子元素建立 h2/h3 索引，跳过打印目录与 h1', () => {
        const doc = createGuideDocument()
        const sections = loadSections(doc)
        expect(sections.map((section) => section.id)).toEqual(['sec-2', 'sec-3', 'sec-9', 'sec-10'])
        expect(sections.map((section) => section.level)).toEqual([2, 3, 2, 3])
        expect(sections.map((section) => section.order)).toEqual([0, 1, 2, 3])
        // 打印目录不是正文，不参与索引
        expect(sections.map((section) => section.title)).not.toContain('目录')
        // 标题元素即 iframe 文档内的真实节点（滚动/高亮直接使用）
        expect(sections[2].heading).toBe(doc.getElementById('sec-9'))
    })

    it('正文文本按「标题到下一个 h2/h3 之间」聚合，空白归一化', () => {
        const doc = createGuideDocument()
        const sections = loadSections(doc)
        expect(findSection(sections, 'sec-3').text).toBe('启动应用，在欢迎页选择「打开文件夹」。')
        expect(findSection(sections, 'sec-9').text).toBe('打开、新建、保存与恢复；编码与换行。')
        expect(findSection(sections, 'sec-10').text).toBe('Markdown、TXT 与 PDF。')
        expect(findSection(sections, 'sec-2').text).toBe('')
    })

    it('真实生成 HTML 的章节索引与页面悬浮目录一一对应（内容更新/重新生成后仍成立）', () => {
        const html = readFileSync(USAGE_GUIDE_HTML_PATH, 'utf8')
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const sections = buildUsageGuideIndex(doc)
        expect(sections.length).toBeGreaterThan(0)
        // 生成 HTML 的悬浮目录来自 md 单一真源：索引 id 序列必须与目录锚点序列完全一致，
        // 避免「目录有但父页面搜不到」或「索引了打印目录/h1」的漂移。
        const tocIds = [...doc.querySelectorAll('#help-toc a[href^="#"]')].map((link) =>
            (link.getAttribute('href') ?? '').slice(1)
        )
        expect(sections.map((section) => section.id)).toEqual(tocIds)
        // 每个索引章节都能在正文中定位到真实标题元素，且首个章节标题可检索命中
        for (const section of sections.slice(0, 5)) {
            expect(section.heading).toBe(doc.getElementById(section.id))
            expect(section.title).not.toBe('')
        }
        const outcome = queryUsageGuideSections(sections, sections[0].title)
        expect(outcome.results[0]?.section.id).toBe(sections[0].id)
    })

    it('没有 main 时退回 body；文档/正文缺失时返回空数组', () => {
        const bodyOnly = document.implementation.createHTMLDocument('body-only')
        bodyOnly.body.innerHTML = '<h2 id="sec-1">仅正文标题</h2><p>内容</p>'
        const sections = loadSections(bodyOnly)
        expect(sections).toHaveLength(1)
        expect(sections[0].title).toBe('仅正文标题')
        expect(sections[0].text).toBe('内容')

        expect(buildUsageGuideIndex(null)).toEqual([])
        const empty = document.implementation.createHTMLDocument('empty')
        empty.body.innerHTML = ''
        expect(buildUsageGuideIndex(empty)).toEqual([])
    })
})

describe('queryUsageGuideSections 检索', () => {
    it('空查询返回空结果；单关键词按标题命中优先排序', () => {
        const sections = loadSections(createGuideDocument())
        expect(queryUsageGuideSections(sections, '   ')).toEqual({
            terms: [],
            total: 0,
            results: []
        })

        const outcome = queryUsageGuideSections(sections, '文件')
        expect(outcome.terms).toEqual(['文件'])
        expect(outcome.total).toBe(3)
        // 标题命中优先：sec-9 / sec-10 标题含「文件」排在前面，仅正文命中「打开文件夹」的 sec-3 最后
        expect(outcome.results.map((item) => item.section.id)).toEqual(['sec-9', 'sec-10', 'sec-3'])
        expect(outcome.results[0].section.title).toBe('2. 文件管理')
        expect(outcome.results[2].snippet).toContain('打开文件夹')
    })

    it('多关键词为「同时包含」关系，大小写不敏感', () => {
        const sections = loadSections(createGuideDocument())
        const outcome = queryUsageGuideSections(sections, '打开 文件夹')
        expect(outcome.total).toBe(1)
        expect(outcome.results[0].section.id).toBe('sec-3')

        const upper = queryUsageGuideSections(sections, 'markdown')
        expect(upper.total).toBe(1)
        expect(upper.results[0].section.id).toBe('sec-10')
    })

    it('命中章节数超过上限时截断但 total 保留真实值', () => {
        const doc = document.implementation.createHTMLDocument('many')
        const parts: string[] = ['<main>']
        for (let index = 0; index < USAGE_GUIDE_MAX_RESULTS + 5; index += 1) {
            parts.push(`<h2 id="sec-${index}">第 ${index} 章 关键词</h2><p>关键词正文</p>`)
        }
        parts.push('</main>')
        doc.body.innerHTML = parts.join('')
        const sections = loadSections(doc)
        const outcome = queryUsageGuideSections(sections, '关键词')
        expect(outcome.total).toBe(USAGE_GUIDE_MAX_RESULTS + 5)
        expect(outcome.results).toHaveLength(USAGE_GUIDE_MAX_RESULTS)
        expect(outcome.results[0].section.order).toBe(0)
    })
})

describe('splitUsageGuideText / makeUsageGuideSnippet 文本分段与摘要', () => {
    it('无查询词时整段为非命中；命中词切出 hit 片段', () => {
        expect(splitUsageGuideText('搜索使用指导', [])).toEqual([
            { text: '搜索使用指导', hit: false }
        ])
        expect(splitUsageGuideText('搜索使用指导', ['使用'])).toEqual([
            { text: '搜索', hit: false },
            { text: '使用', hit: true },
            { text: '指导', hit: false }
        ])
        expect(splitUsageGuideText('', ['使用'])).toEqual([])
    })

    it('分段大小写不敏感、多个命中词按出现顺序且同位置取更长词', () => {
        expect(splitUsageGuideText('MarkDown 编辑', ['markdown'])).toEqual([
            { text: 'MarkDown', hit: true },
            { text: ' 编辑', hit: false }
        ])
        expect(splitUsageGuideText('abcdef', ['ab', 'cd'])).toEqual([
            { text: 'ab', hit: true },
            { text: 'cd', hit: true },
            { text: 'ef', hit: false }
        ])
    })

    it('摘要围绕命中词截取并加省略号；无命中时截断开头', () => {
        const longText = `${'前'.repeat(80)}关键词${'后'.repeat(80)}`
        const snippet = makeUsageGuideSnippet(longText, ['关键词'])
        expect(snippet.startsWith('…')).toBe(true)
        expect(snippet.endsWith('…')).toBe(true)
        expect(snippet).toContain('关键词')

        const plain = makeUsageGuideSnippet('短文本', ['关键词'])
        expect(plain).toBe('短文本')
        const truncated = makeUsageGuideSnippet('无'.repeat(100), ['关键词'])
        expect(truncated).toBe(`${'无'.repeat(72)}…`)
    })
})

describe('scrollUsageGuideToSection 定位', () => {
    it('优先使用标题 scrollIntoView（平滑 + 顶部对齐）', () => {
        const doc = createGuideDocument()
        const scrollMocks = installScrollMocks(doc)
        const section = findSection(loadSections(doc), 'sec-9')
        const frame: UsageGuideFrame = {
            contentDocument: doc,
            contentWindow: createFakeFrameWindow() as unknown as Window
        }
        expect(scrollUsageGuideToSection(section, frame)).toBe(true)
        expect(scrollMocks.get('sec-9')).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'start'
        })
    })

    it('减少动效偏好时 behavior 降级为 auto', () => {
        const doc = createGuideDocument()
        const heading = doc.getElementById('sec-9') as HTMLElement
        Object.defineProperty(heading, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 120 }) as unknown as DOMRect
        })
        const fakeWindow = createFakeFrameWindow(true)
        const section = findSection(loadSections(doc), 'sec-9')
        const frame: UsageGuideFrame = {
            contentDocument: doc,
            contentWindow: fakeWindow as unknown as Window
        }
        expect(scrollUsageGuideToSection(section, frame)).toBe(true)
        // scrollIntoView 在 jsdom 不存在 → 退回 contentWindow.scrollTo（top = 120 + scrollY 100）
        expect(fakeWindow.scrollTo).toHaveBeenCalledWith({ top: 220, behavior: 'auto' })
    })

    it('scrollIntoView 抛错时退回坐标滚动；窗口不可用时返回 false', () => {
        const doc = createGuideDocument()
        const heading = doc.getElementById('sec-9') as HTMLElement
        Object.defineProperty(heading, 'scrollIntoView', {
            configurable: true,
            value: () => {
                throw new Error('unsupported scroll options')
            }
        })
        Object.defineProperty(heading, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 10 }) as unknown as DOMRect
        })
        const fakeWindow = createFakeFrameWindow()
        const section = findSection(loadSections(doc), 'sec-9')
        expect(
            scrollUsageGuideToSection(section, {
                contentDocument: doc,
                contentWindow: fakeWindow as unknown as Window
            })
        ).toBe(true)
        expect(fakeWindow.scrollTo).toHaveBeenCalledWith({ top: 110, behavior: 'smooth' })

        expect(
            scrollUsageGuideToSection(section, { contentDocument: doc, contentWindow: null })
        ).toBe(false)
    })
})

describe('highlightUsageGuideSection / clearUsageGuideHighlights 高亮', () => {
    it('在标题与正文插入 mark（复用 .search-hit），清除后还原原文', () => {
        const doc = createGuideDocument()
        const sections = loadSections(doc)
        const marks = highlightUsageGuideSection(doc, findSection(sections, 'sec-9'), ['文件'])
        expect(marks).toHaveLength(1)
        expect(marks[0].tagName).toBe('MARK')
        expect(marks[0].className).toBe(USAGE_GUIDE_HIT_CLASS)
        expect(marks[0].textContent).toBe('文件')
        expect(doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`)).toHaveLength(1)

        clearUsageGuideHighlights(marks)
        expect(marks).toHaveLength(0)
        expect(doc.querySelectorAll('mark')).toHaveLength(0)
        expect((doc.getElementById('sec-9') as HTMLElement).textContent).toBe('2. 文件管理')
    })

    it('跳过 script/style 文本节点，不把命中词插入脚本内容', () => {
        const doc = document.implementation.createHTMLDocument('skip')
        doc.body.innerHTML =
            '<main><h2 id="sec-1">关键词标题</h2><p>关键词正文</p><script>关键词脚本</script></main>'
        const sections = loadSections(doc)
        const marks = highlightUsageGuideSection(doc, sections[0], ['关键词'])
        expect(marks).toHaveLength(2)
        expect(marks.map((mark) => mark.textContent)).toEqual(['关键词', '关键词'])
        // 脚本内容保持原样（未被插入 mark）
        expect(doc.querySelector('script')?.textContent).toBe('关键词脚本')
    })

    it('高亮数量受预算上限约束，未高亮的文本不丢失', () => {
        const doc = document.implementation.createHTMLDocument('budget')
        const hitText = '关键词'.repeat(USAGE_GUIDE_MAX_HIGHLIGHTS + 10)
        doc.body.innerHTML = `<main><h2 id="sec-1">大量命中</h2><p>${hitText}</p></main>`
        const sections = loadSections(doc)
        const paragraph = doc.querySelector('p') as HTMLElement
        const marks = highlightUsageGuideSection(doc, sections[0], ['关键词'])
        expect(marks).toHaveLength(USAGE_GUIDE_MAX_HIGHLIGHTS)
        expect(paragraph.textContent).toBe(hitText)
        clearUsageGuideHighlights(marks)
        expect(paragraph.textContent).toBe(hitText)
    })
})

describe('readUsageGuideFrame 同源读取防御', () => {
    it('无 iframe / 空引用时返回空文档与空窗口', () => {
        expect(readUsageGuideFrame(null)).toEqual({ contentDocument: null, contentWindow: null })
    })

    it('同源 iframe 返回真实 contentDocument / contentWindow', () => {
        const iframe = document.createElement('iframe')
        const doc = createGuideDocument()
        const fakeWindow = createFakeFrameWindow()
        Object.defineProperty(iframe, 'contentDocument', { configurable: true, get: () => doc })
        Object.defineProperty(iframe, 'contentWindow', {
            configurable: true,
            get: () => fakeWindow
        })
        const frame = readUsageGuideFrame(iframe)
        expect(frame.contentDocument).toBe(doc)
        expect(frame.contentWindow).toBe(fakeWindow as unknown as Window)
    })

    it('属性访问抛错（跨源）时按不可用处理，不抛错', () => {
        const iframe = document.createElement('iframe')
        Object.defineProperty(iframe, 'contentDocument', {
            configurable: true,
            get: () => {
                throw new Error('cross-origin access denied')
            }
        })
        expect(readUsageGuideFrame(iframe)).toEqual({
            contentDocument: null,
            contentWindow: null
        })
    })
})

// =============================================================================================
// UsageGuideDialog：搜索 UI 与 iframe 代理链路
// =============================================================================================

describe('UsageGuideDialog', () => {
    beforeEach(() => {
        openUsageGuideDialogState()
    })

    /** 挂载对话框并返回 iframe 元素（延后注入替身文档） */
    function mountDialog(): { wrapper: VueWrapper; iframe: HTMLIFrameElement } {
        const wrapper = mount(UsageGuideDialog, {
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        mountedWrappers.push(wrapper)
        const iframe = wrapper.find('.usage-guide-frame').element as HTMLIFrameElement
        return { wrapper, iframe }
    }

    /** 注入替身文档/窗口并手动触发 load */
    async function loadFrame(
        iframe: HTMLIFrameElement,
        doc: Document | null,
        fakeWindow: FakeFrameWindow | null = createFakeFrameWindow()
    ): Promise<void> {
        Object.defineProperty(iframe, 'contentDocument', {
            configurable: true,
            get: () => doc
        })
        Object.defineProperty(iframe, 'contentWindow', {
            configurable: true,
            get: () => fakeWindow as unknown as Window | null
        })
        iframe.dispatchEvent(new Event('load'))
        await nextTick()
    }

    /** 读取搜索输入框（未渲染时断言失败信息更直观） */
    function searchInput(wrapper: VueWrapper) {
        return wrapper.find('.usage-guide-search-input')
    }

    it('渲染 iframe，src 指向本地 usage-guide.html，sandbox 仅 same-origin', () => {
        const { wrapper } = mountDialog()
        const iframe = wrapper.find('.usage-guide-frame')
        expect(iframe.exists()).toBe(true)
        expect(iframe.attributes('src')).toMatch(/usage-guide\.html$/)
        // 安全回归锁定：sandbox 精确等于 allow-same-origin，且不包含任何脚本/导航放宽项
        expect(iframe.attributes('sandbox')).toBe('allow-same-origin')
        expect(iframe.attributes('sandbox')).not.toContain('allow-scripts')
        expect(iframe.attributes('sandbox')).not.toContain('allow-forms')
        expect(iframe.attributes('sandbox')).not.toContain('allow-popups')
        expect(iframe.attributes('sandbox')).not.toContain('allow-top-navigation')
        // 对话框内只允许一个 iframe（防止另开一个放宽 sandbox 的隐藏 iframe）
        expect(wrapper.findAll('iframe')).toHaveLength(1)
    })

    it('组件源码不出现 allow-scripts（安全回归：sandbox 不得放宽）', () => {
        const source = readFileSync(DIALOG_SOURCE_PATH, 'utf8')
        // 只扫描代码（剥离注释），避免把「说明为什么禁止 allow-scripts」的注释误判为违规
        const code = source
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
        expect(code).toContain('sandbox="allow-same-origin"')
        expect(code).not.toMatch(/allow-scripts/)
        // 搜索/高亮不通过注入脚本实现（不新增 CSP 例外、不注入 <script> 元素）
        expect(code).not.toMatch(/createElement\(\s*['"]script['"]\s*\)/)
        expect(code).not.toMatch(/\beval\s*\(|new Function/)
    })

    it('iframe 加载完成前不渲染搜索框，只显示加载提示', () => {
        const { wrapper } = mountDialog()
        expect(wrapper.find('.usage-guide-search').exists()).toBe(false)
        const status = wrapper.find('.usage-guide-status')
        expect(status.exists()).toBe(true)
        expect(status.text()).toBe(t('dialogRenderer.usageGuide.loading'))
    })

    it('加载完成后建立索引并显示搜索框；输入关键词展示章节与摘要', async () => {
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, createGuideDocument())
        // 读取 iframe 内容（父页面同源代理）不得改变 sandbox：加载后仍是仅 allow-same-origin
        expect(wrapper.find('.usage-guide-frame').attributes('sandbox')).toBe('allow-same-origin')
        expect(wrapper.find('.usage-guide-search').exists()).toBe(true)
        const input = searchInput(wrapper)
        expect(input.exists()).toBe(true)
        expect(input.attributes('placeholder')).toBe(
            t('dialogRenderer.usageGuide.searchPlaceholder')
        )
        expect(input.attributes('aria-expanded')).toBe('false')

        await input.setValue('文件')
        await nextTick()
        const results = wrapper.findAll('.usage-guide-search-result')
        expect(results).toHaveLength(3)
        expect(input.attributes('aria-expanded')).toBe('true')
        expect(wrapper.find('.usage-guide-search-meta').text()).toBe(
            t('dialogRenderer.usageGuide.searchMatches', { count: 3 })
        )
        // 标题命中优先：第一条是「2. 文件管理」，且标题中的命中词用 mark 渲染
        expect(results[0].find('.usage-guide-search-result-title').text()).toBe('2. 文件管理')
        expect(results[0].find('.usage-guide-search-result-title mark').text()).toBe('文件')
        expect(results[0].find('.usage-guide-search-result-snippet').text()).toContain(
            '打开、新建、保存与恢复'
        )
        // 仅在正文命中「打开文件夹」的 sec-3 排在标题命中的两条之后
        expect(results[2].text()).toContain('1.1 打开工作区')
        // 首条默认选中（键盘可直接 Enter）
        expect(results[0].classes()).toContain('is-active')
    })

    it('无匹配结果时显示空态提示且不渲染结果列表', async () => {
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, createGuideDocument())
        await searchInput(wrapper).setValue('完全不存在的内容')
        await nextTick()
        expect(wrapper.findAll('.usage-guide-search-result')).toHaveLength(0)
        expect(wrapper.find('.usage-guide-search-meta').text()).toBe(
            t('dialogRenderer.usageGuide.searchEmpty')
        )
    })

    it('↑↓ 循环选中，Enter 滚动 iframe 标题并高亮命中词，2.6s 后自动清除', async () => {
        vi.useFakeTimers()
        const doc = createGuideDocument()
        const scrollMocks = installScrollMocks(doc)
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, doc)
        const input = searchInput(wrapper)
        await input.setValue('文件')
        await nextTick()

        // 默认选中第 0 条；↓ 到第 1 条，↑ 回到第 0 条（循环）
        const options = () => wrapper.findAll('.usage-guide-search-result')
        expect(options()[0].classes()).toContain('is-active')
        await input.trigger('keydown', { key: 'ArrowDown' })
        expect(options()[1].classes()).toContain('is-active')
        await input.trigger('keydown', { key: 'ArrowUp' })
        expect(options()[0].classes()).toContain('is-active')

        // Enter：定位第一条（sec-9「2. 文件管理」）
        await input.trigger('keydown', { key: 'Enter' })
        expect(scrollMocks.get('sec-9')).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'start'
        })
        const marks = doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`)
        expect(marks).toHaveLength(1)
        expect(marks[0].textContent).toBe('文件')
        // 定位后结果列表收起，关键词保留
        expect(wrapper.find('.usage-guide-search-results').exists()).toBe(false)
        expect((input.element as HTMLInputElement).value).toBe('文件')

        // 2.6s 后自动清除高亮并还原标题文本
        vi.advanceTimersByTime(USAGE_GUIDE_HIGHLIGHT_MS + 10)
        await nextTick()
        expect(doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`)).toHaveLength(0)
        expect((doc.getElementById('sec-9') as HTMLElement).textContent).toBe('2. 文件管理')
    })

    it('点击结果同样定位并高亮；重新聚焦输入框可再次展开结果', async () => {
        const doc = createGuideDocument()
        const scrollMocks = installScrollMocks(doc)
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, doc)
        const input = searchInput(wrapper)
        await input.setValue('打开')
        await nextTick()
        // 「打开」命中 sec-3（标题命中优先）与 sec-9（正文命中）
        expect(wrapper.findAll('.usage-guide-search-result')).toHaveLength(2)

        await wrapper.findAll('.usage-guide-search-result')[0].trigger('click')
        expect(scrollMocks.get('sec-3')).toHaveBeenCalled()
        // sec-3 标题 + 正文各 1 处命中
        expect(doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`)).toHaveLength(2)
        expect(wrapper.find('.usage-guide-search-results').exists()).toBe(false)

        // 聚焦输入框重新展开结果（关键词未丢）
        await input.trigger('focus')
        expect(wrapper.find('.usage-guide-search-results').exists()).toBe(true)
        await input.trigger('keydown', { key: 'Escape' })
        expect((input.element as HTMLInputElement).value).toBe('')
        expect(wrapper.find('.usage-guide-search-results').exists()).toBe(false)
        // Esc 清空搜索时不应关闭对话框（继续浏览）
        expect(usageGuideDialogState.visible).toBe(true)
        expect(doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`)).toHaveLength(0)
    })

    it('无关键词时 Esc 交给 BaseDialog 关闭对话框', async () => {
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, createGuideDocument())
        await searchInput(wrapper).trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(usageGuideDialogState.visible).toBe(false)
    })

    it('contentDocument 为空（加载失败）时降级提示，不崩溃也不显示搜索框', async () => {
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, null)
        expect(wrapper.find('.usage-guide-search').exists()).toBe(false)
        const error = wrapper.find('.usage-guide-status--error')
        expect(error.exists()).toBe(true)
        expect(error.text()).toBe(t('dialogRenderer.usageGuide.unavailable'))
    })

    it('文档可读但无 h2/h3 章节时降级为「不可索引」提示', async () => {
        const doc = document.implementation.createHTMLDocument('no-headings')
        doc.body.innerHTML = '<main><p>只有正文，没有章节标题。</p></main>'
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, doc)
        expect(wrapper.find('.usage-guide-search').exists()).toBe(false)
        expect(wrapper.find('.usage-guide-status--error').text()).toBe(
            t('dialogRenderer.usageGuide.noIndex')
        )
    })

    it('iframe 重新加载时重建索引并清空旧搜索状态', async () => {
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, createGuideDocument())
        const input = searchInput(wrapper)
        await input.setValue('文件')
        await nextTick()
        expect(wrapper.findAll('.usage-guide-search-result')).toHaveLength(3)

        const nextDoc = document.implementation.createHTMLDocument('next-guide')
        nextDoc.body.innerHTML = '<main><h2 id="sec-1">新章节</h2><p>新的正文内容。</p></main>'
        await loadFrame(iframe, nextDoc)
        // 重新加载后搜索词清空、索引重建
        expect((input.element as HTMLInputElement).value).toBe('')
        await input.setValue('新章节')
        await nextTick()
        const results = wrapper.findAll('.usage-guide-search-result')
        expect(results).toHaveLength(1)
        expect(results[0].text()).toContain('新章节')
    })

    it('卸载对话框时清除 iframe 内残留高亮', async () => {
        vi.useFakeTimers()
        const doc = createGuideDocument()
        installScrollMocks(doc)
        const { wrapper, iframe } = mountDialog()
        await loadFrame(iframe, doc)
        const input = searchInput(wrapper)
        await input.setValue('文件')
        await nextTick()
        await input.trigger('keydown', { key: 'Enter' })
        expect(doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`).length).toBeGreaterThan(0)

        const mountedIndex = mountedWrappers.indexOf(wrapper)
        if (mountedIndex >= 0) mountedWrappers.splice(mountedIndex, 1)
        wrapper.unmount()
        expect(doc.querySelectorAll(`mark.${USAGE_GUIDE_HIT_CLASS}`)).toHaveLength(0)
    })

    it('点击关闭按钮切回隐藏状态', async () => {
        const { wrapper } = mountDialog()
        await wrapper.find('.btn-usage-guide-close').trigger('click')
        expect(usageGuideDialogState.visible).toBe(false)
    })
})
