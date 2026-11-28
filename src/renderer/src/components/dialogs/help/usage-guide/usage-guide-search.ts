/**
 * 帮助 → 使用指导：应用内搜索（父页面代理）纯函数集合。
 *
 * ## 背景（为什么搜索在父页面而不是 iframe 内）
 * `usage-guide.html` 自带悬浮目录与内文搜索（内联脚本），浏览器/在线文档/PDF 链路完整；
 * 但应用内查看器 iframe 的 sandbox 只有 `allow-same-origin`（**禁止**加 `allow-scripts`：
 * 与 allow-same-origin 组合可让同源文档以父窗口身份执行脚本，属沙箱逃逸风险，SEC-12 明令
 * 禁止），因此 iframe 内联脚本不执行，页面内搜索框按渐进增强约定保持隐藏（不会出现死搜索框）。
 *
 * 本模块利用 `allow-same-origin` 带来的同源能力，由父页面**只读** `iframe.contentDocument`：
 * 1. 建立章节索引（h2/h3 标题 + 标题到下一个标题之间的正文文本，与页面内联脚本同口径）；
 * 2. 输入关键词过滤章节并生成摘要片段；
 * 3. 点击/回车时由父页面滚动 iframe 内标题（scrollIntoView，兜底 contentWindow.scrollTo）；
 * 4. 父页面在 iframe 文档中插入 `<mark class="search-hit">` 临时高亮命中词（纯 DOM 操作，
 *    不执行任何脚本），复用生成 HTML 自带的 `.search-hit` 样式，2.6s 后由调用方清除。
 *
 * 本模块不依赖 Vue、不写全局状态，便于直接单测；所有 DOM 访问都对「同源失败 / 文档缺失 /
 * 滚动 API 不可用」做防御，异常路径返回空结果而不是抛错（加载失败时由对话框降级提示）。
 */

/** 单次搜索最多返回的章节数（与生成 HTML 内文搜索一致，避免结果列表遮挡正文） */
export const USAGE_GUIDE_MAX_RESULTS = 20

/** 单次定位最多插入的命中高亮数（超长章节一次性插入过多 DOM 会拖慢渲染） */
export const USAGE_GUIDE_MAX_HIGHLIGHTS = 60

/** 命中高亮保留时长（与生成 HTML 内联脚本一致：约 2.6s 后清除） */
export const USAGE_GUIDE_HIGHLIGHT_MS = 2600

/** 命中高亮的 class：复用生成 HTML 自身的 `.search-hit` 样式，父页面不重复定义 iframe 样式 */
export const USAGE_GUIDE_HIT_CLASS = 'search-hit'

/** 摘要片段：命中词前保留字符数 */
const SNIPPET_BEFORE = 26

/** 摘要片段：命中词后保留字符数 */
const SNIPPET_AFTER = 70

/** 摘要片段：未命中时截断长度 */
const SNIPPET_MAX = 72

/** `NodeFilter.SHOW_TEXT` 的数值常量（跨 realm 安全：不直接引用 window.NodeFilter） */
const NODE_FILTER_SHOW_TEXT = 4

/** 参与章节索引的标题标签（与生成 HTML 的悬浮目录一致，h1 是文档大标题不计入） */
const SECTION_HEADING_TAGS: ReadonlySet<string> = new Set(['H2', 'H3'])

/** 高亮时跳过的父元素标签：脚本/样式/无脚本提示/输入区/已高亮节点 */
const SKIP_HIGHLIGHT_TAGS: ReadonlySet<string> = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEXTAREA',
    'MARK'
])

/** iframe 的文档与窗口访问面（同源限制下读取失败时二者均为 null） */
export interface UsageGuideFrame {
    contentDocument: Document | null
    contentWindow: Window | null
}

/** 一个可搜索章节：标题元素 + 该标题到下一个标题之间的正文元素 */
export interface UsageGuideSection {
    /** 标题元素 id（生成 HTML 为 sec-N；仅为可读标识，定位不依赖 id） */
    id: string
    /** 标题层级：2=h2（章）、3=h3（节） */
    level: 2 | 3
    /** 归一化后的标题文本 */
    title: string
    /** 归一化后的正文文本（标题与下一个 h2/h3 之间的全部内容） */
    text: string
    /** 章节顺序（稳定排序用，与正文顺序一致） */
    order: number
    /** iframe 文档内的标题元素（滚动定位与高亮入口） */
    heading: HTMLElement
    /** iframe 文档内的正文块元素（高亮范围） */
    elements: HTMLElement[]
}

/** 一条搜索结果 */
export interface UsageGuideSearchResult {
    /** 命中的章节 */
    section: UsageGuideSection
    /** 标题命中词数（用于排序：标题命中优先） */
    titleHits: number
    /** 正文摘要片段（围绕首个命中词，含省略号） */
    snippet: string
}

/** 一次查询的完整结果（total 为未截断的命中章节总数） */
export interface UsageGuideSearchOutcome {
    /** 归一化并小写后的查询词（按空格分词，空格表示「同时包含」） */
    terms: string[]
    /** 命中章节总数（可能大于 results.length） */
    total: number
    /** 截断后的结果列表（最多 USAGE_GUIDE_MAX_RESULTS 条） */
    results: UsageGuideSearchResult[]
}

/** 文本分段：用于结果标题/摘要的命中着色（父页面用文本插值渲染，不拼 HTML） */
export interface UsageGuideTextSegment {
    text: string
    hit: boolean
}

/**
 * 归一化文本：合并连续空白、去首尾空白。
 * 生成 HTML 的正文含换行/缩进，索引与摘要必须先归一化才能保证跨元素文本可搜索。
 */
export function normalizeUsageGuideText(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
}

/** 拆分查询词：归一化 + 小写 + 按空格分词（空查询返回空数组） */
export function splitUsageGuideTerms(rawQuery: string): string[] {
    const normalized = normalizeUsageGuideText(rawQuery).toLowerCase()
    return normalized === '' ? [] : normalized.split(' ').filter((term) => term.length > 0)
}

/**
 * 读取 iframe 的同源文档与窗口。
 * 跨源（理论上不会发生：指南与本窗口同源 + allow-same-origin）或属性访问抛错时返回 null，
 * 由调用方降级为「搜索不可用」提示，**不为此放宽 sandbox 安全边界**。
 */
export function readUsageGuideFrame(iframe: HTMLIFrameElement | null): UsageGuideFrame {
    if (!iframe) return { contentDocument: null, contentWindow: null }
    try {
        return {
            contentDocument: iframe.contentDocument ?? null,
            contentWindow: iframe.contentWindow ?? null
        }
    } catch {
        // 跨源访问被拒绝：按不可读取处理（不改 sandbox、不退化为脚本注入）
        return { contentDocument: null, contentWindow: null }
    }
}

/**
 * 建立章节索引。
 *
 * 口径与生成 HTML 的内联搜索脚本一致：遍历 `<main>` 的直接子元素，h2/h3 开启新章节，
 * 其余元素计入当前章节正文；打印目录 `.print-toc` 跳过（它不是正文章节）。
 *
 * @param doc iframe 文档（null / 无 main / 无标题时返回空数组，由调用方降级）
 */
export function buildUsageGuideIndex(doc: Document | null): UsageGuideSection[] {
    if (!doc) return []
    const container = doc.querySelector('main') ?? doc.body
    if (!container) return []
    const printToc = container.querySelector('.print-toc')
    const sections: UsageGuideSection[] = []
    let current: UsageGuideSection | null = null
    for (const child of Array.from(container.children)) {
        const element = child as HTMLElement
        if (printToc !== null && element === printToc) continue
        const tagName = element.tagName
        if (SECTION_HEADING_TAGS.has(tagName)) {
            current = {
                id: element.id,
                level: tagName === 'H2' ? 2 : 3,
                title: normalizeUsageGuideText(element.textContent),
                text: '',
                order: sections.length,
                heading: element,
                elements: []
            }
            sections.push(current)
            continue
        }
        if (current === null) continue
        current.elements.push(element)
        current.text = `${current.text} ${normalizeUsageGuideText(element.textContent)}`
    }
    for (const section of sections) {
        section.text = normalizeUsageGuideText(section.text)
    }
    return sections
}

/** 生成正文摘要：围绕首个命中词截取，未命中时截取开头 */
export function makeUsageGuideSnippet(text: string, terms: readonly string[]): string {
    const normalized = normalizeUsageGuideText(text)
    if (normalized === '') return ''
    const lowerText = normalized.toLowerCase()
    let firstHit = -1
    for (const term of terms) {
        if (term === '') continue
        const hitIndex = lowerText.indexOf(term)
        if (hitIndex !== -1 && (firstHit === -1 || hitIndex < firstHit)) {
            firstHit = hitIndex
        }
    }
    if (firstHit === -1) {
        return normalized.length > SNIPPET_MAX ? `${normalized.slice(0, SNIPPET_MAX)}…` : normalized
    }
    const start = Math.max(0, firstHit - SNIPPET_BEFORE)
    const end = Math.min(normalized.length, firstHit + SNIPPET_AFTER)
    return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${
        end < normalized.length ? '…' : ''
    }`
}

/**
 * 在章节索引上执行查询。
 * 规则与生成 HTML 内联脚本一致：所有查询词都必须出现（标题 + 正文），标题命中数多者优先，
 * 同分按正文顺序稳定排列，最多返回 USAGE_GUIDE_MAX_RESULTS 条。
 */
export function queryUsageGuideSections(
    sections: readonly UsageGuideSection[],
    rawQuery: string
): UsageGuideSearchOutcome {
    const terms = splitUsageGuideTerms(rawQuery)
    if (terms.length === 0 || sections.length === 0) {
        return { terms, total: 0, results: [] }
    }
    const matched: Array<{ section: UsageGuideSection; titleHits: number }> = []
    for (const section of sections) {
        const title = section.title.toLowerCase()
        const haystack = `${title} ${section.text.toLowerCase()}`
        let titleHits = 0
        let matchesEveryTerm = true
        for (const term of terms) {
            if (!haystack.includes(term)) {
                matchesEveryTerm = false
                break
            }
            if (title.includes(term)) titleHits += 1
        }
        if (matchesEveryTerm) matched.push({ section, titleHits })
    }
    matched.sort(
        (left, right) =>
            right.titleHits - left.titleHits || left.section.order - right.section.order
    )
    return {
        terms,
        total: matched.length,
        results: matched.slice(0, USAGE_GUIDE_MAX_RESULTS).map((item) => ({
            section: item.section,
            titleHits: item.titleHits,
            snippet: makeUsageGuideSnippet(item.section.text, terms)
        }))
    }
}

/**
 * 把文本按命中词切成「命中/非命中」片段，供父页面以文本插值渲染高亮
 * （禁止拼 HTML：避免把文档内容当富文本注入，XSS 纵深）。
 */
export function splitUsageGuideText(
    text: string,
    terms: readonly string[]
): UsageGuideTextSegment[] {
    if (text === '') return []
    if (terms.length === 0) return [{ text, hit: false }]
    const lowerText = text.toLowerCase()
    const segments: UsageGuideTextSegment[] = []
    let position = 0
    while (position < text.length) {
        let bestIndex = -1
        let bestLength = 0
        for (const term of terms) {
            if (term === '') continue
            const hitIndex = lowerText.indexOf(term, position)
            if (hitIndex === -1) continue
            if (
                bestIndex === -1 ||
                hitIndex < bestIndex ||
                (hitIndex === bestIndex && term.length > bestLength)
            ) {
                bestIndex = hitIndex
                bestLength = term.length
            }
        }
        if (bestIndex === -1 || bestLength === 0) {
            segments.push({ text: text.slice(position), hit: false })
            break
        }
        if (bestIndex > position) {
            segments.push({ text: text.slice(position, bestIndex), hit: false })
        }
        segments.push({ text: text.slice(bestIndex, bestIndex + bestLength), hit: true })
        position = bestIndex + bestLength
    }
    return segments
}

/** 是否处于「减少动效」偏好（iframe 窗口不可用时退回父窗口；都不可用时按平滑处理） */
function prefersReducedMotion(frame: UsageGuideFrame): boolean {
    try {
        const target = frame.contentWindow ?? (typeof window === 'undefined' ? null : window)
        return Boolean(target?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    } catch {
        return false
    }
}

/**
 * 滚动 iframe 到指定章节标题。
 * 优先 `scrollIntoView`（尊重 iframe 页面自身的 scroll-margin-top）；不可用时退回
 * `contentWindow.scrollTo` 计算偏移。返回是否实际执行了滚动（供测试/诊断）。
 */
export function scrollUsageGuideToSection(
    section: UsageGuideSection,
    frame: UsageGuideFrame
): boolean {
    const heading = section.heading
    if (!heading) return false
    const behavior: ScrollBehavior = prefersReducedMotion(frame) ? 'auto' : 'smooth'
    if (typeof heading.scrollIntoView === 'function') {
        try {
            heading.scrollIntoView({ behavior, block: 'start' })
            return true
        } catch {
            // 受限文档可能不支持滚动参数：继续走下面的坐标滚动兜底
        }
    }
    const frameWindow = frame.contentWindow
    if (!frameWindow || typeof frameWindow.scrollTo !== 'function') return false
    const top = resolveSectionTop(heading, frameWindow)
    if (top === null) return false
    const targetTop = Math.max(0, top)
    try {
        frameWindow.scrollTo({ top: targetTop, behavior })
    } catch {
        try {
            frameWindow.scrollTo(0, targetTop)
        } catch {
            return false
        }
    }
    return true
}

/** 计算标题在 iframe 文档中的滚动目标位置（取不到坐标时返回 null，调用方安全早退） */
function resolveSectionTop(heading: HTMLElement, frameWindow: Window): number | null {
    try {
        return heading.getBoundingClientRect().top + (frameWindow.scrollY || 0)
    } catch {
        return null
    }
}

/**
 * 在章节（标题 + 正文块）内插入命中高亮 mark。
 *
 * 只做纯 DOM 操作（父页面在 iframe 文档中创建/替换文本节点），不注入脚本、不改页面内容
 * 真源；mark 复用生成 HTML 的 `.search-hit` 样式。返回插入的 mark 列表，调用方负责在
 * USAGE_GUIDE_HIGHLIGHT_MS 后调用 clearUsageGuideHighlights 恢复原文本。
 */
export function highlightUsageGuideSection(
    doc: Document,
    section: UsageGuideSection,
    terms: readonly string[]
): HTMLElement[] {
    if (!doc || terms.length === 0) return []
    const marks: HTMLElement[] = []
    const budget = { left: USAGE_GUIDE_MAX_HIGHLIGHTS }
    highlightElementText(doc, section.heading, terms, marks, budget)
    for (const element of section.elements) {
        if (budget.left <= 0) break
        highlightElementText(doc, element, terms, marks, budget)
    }
    return marks
}

/** 遍历元素下的文本节点并高亮（预算用尽即停） */
function highlightElementText(
    doc: Document,
    element: HTMLElement,
    terms: readonly string[],
    marks: HTMLElement[],
    budget: { left: number }
): void {
    if (!element || budget.left <= 0) return
    if (typeof doc.createTreeWalker !== 'function') return
    const walker = doc.createTreeWalker(element, NODE_FILTER_SHOW_TEXT)
    const textNodes: Text[] = []
    let node: Node | null = walker.nextNode()
    while (node !== null) {
        textNodes.push(node as Text)
        node = walker.nextNode()
    }
    for (const textNode of textNodes) {
        if (budget.left <= 0) break
        markHighlightTextNode(doc, textNode, terms, marks, budget)
    }
}

/** 单个文本节点：按命中词替换为 mark + 文本节点片段 */
function markHighlightTextNode(
    doc: Document,
    textNode: Text,
    terms: readonly string[],
    marks: HTMLElement[],
    budget: { left: number }
): void {
    const text = textNode.nodeValue
    if (!text || !text.trim()) return
    const parentElement = textNode.parentElement
    if (parentElement && SKIP_HIGHLIGHT_TAGS.has(parentElement.tagName)) return
    const segments = splitUsageGuideText(text, terms)
    if (!segments.some((segment) => segment.hit)) return
    const fragment = doc.createDocumentFragment()
    let highlighted = false
    for (const segment of segments) {
        if (segment.hit && budget.left > 0) {
            const mark = doc.createElement('mark')
            mark.className = USAGE_GUIDE_HIT_CLASS
            mark.textContent = segment.text
            fragment.appendChild(mark)
            marks.push(mark)
            budget.left -= 1
            highlighted = true
        } else {
            fragment.appendChild(doc.createTextNode(segment.text))
        }
    }
    if (!highlighted) return
    textNode.parentNode?.replaceChild(fragment, textNode)
}

/** 清除高亮：把 mark 子节点还原到父节点并合并文本（幂等，传空数组不做事） */
export function clearUsageGuideHighlights(marks: HTMLElement[]): void {
    for (const mark of marks) {
        const parent = mark.parentNode
        if (!parent) continue
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark)
        }
        parent.removeChild(mark)
        if (typeof parent.normalize === 'function') {
            parent.normalize()
        }
    }
    marks.length = 0
}
