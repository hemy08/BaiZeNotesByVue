/**
 * preview-html-chunks.ts
 * P2-1：大文档预览 HTML 的「安全分块边界」扫描器（DOMPurify 分块净化的前置）。
 *
 * 为什么需要它：
 * 1MB 级 Markdown 的预览 HTML 约 2.6MB，单次 DOMPurify 消毒在 jsdom 下约 900ms；
 * 分块消毒 + 块间让出主线程可把长任务拆成多个短任务，并让首块内容更早显示。
 *
 * 安全设计（为什么分块消毒不会削弱 XSS 防护）：
 * 1. 只有「完整顶层元素/顶层文本的边界」才会成为切分点：扫描器维护标签栈，
 *    仅在栈空（depth 0）且刚闭合一个完整元素/自闭合元素后记录边界；
 * 2. 任何无法确定安全边界的输入（未闭合标签、结束标签与栈顶不匹配、标签内出现 '<'
 *    等畸形 HTML、未闭合注释/原始文本元素）一律返回 null，调用方回退「整篇消毒」；
 * 3. DOMPurify 的输出总是浏览器解析器序列化后的**良构** HTML；把多个「各自消毒过的
 *    良构片段」拼接起来，与整篇消毒在注入面等价（不可能通过片段拼接重新组成脚本标签），
 *    因此分块只影响渲染正确性边界，不改变安全性边界；
 * 4. 原始文本元素（script/style/textarea/title 等）内部不解析标签，扫描器整体跳过其内容，
 *    不会把内容里的 `</p>` 误判成边界。
 *
 * 本模块只做字符串扫描（无 DOM 解析），O(n) 复杂度，不产生额外 DOM 树。
 */

/** 分块区间（[start, end) 字符偏移；首尾相接覆盖完整 HTML） */
export interface PreviewHtmlChunkSpan {
    start: number
    end: number
}

/** HTML 空元素（不参与标签栈深度） */
const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
])

/**
 * 原始文本元素：内容不按 HTML 标签解析（浏览器规范中 script/style 为 raw text，
 * textarea/title 为 RCDATA，xmp/iframe/noembed/noframes 亦按文本整体消费）。
 * 扫描器遇到这些元素时整体跳到对应结束标签之后，内部 `</p>` 等文本不会被误判为边界。
 */
const RAW_TEXT_ELEMENTS = new Set([
    'script',
    'style',
    'textarea',
    'title',
    'xmp',
    'iframe',
    'noembed',
    'noframes'
])

/** 标签名字符（HTML 标签名允许字母/数字/连字符/冒号；宽松一些不损害边界保守性） */
function isTagNameChar(code: number): boolean {
    return (
        (code >= 0x61 && code <= 0x7a) || // a-z
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x30 && code <= 0x39) || // 0-9
        code === 0x2d || // -
        code === 0x3a // :
    )
}

function isAsciiLetter(code: number): boolean {
    return (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a)
}

function isHtmlWhitespace(code: number): boolean {
    return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c
}

/** 转义正则元字符（原始文本元素的结束标签名由扫描器按规范字符集得到，这里再兜底一次） */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从 from 开始查找原始文本元素的结束标签，返回结束标签之后的下标（找不到返回 -1）。
 * 结束标签允许空白（`</script >`），大小写不敏感。
 */
function findRawTextEndTag(html: string, from: number, name: string): number {
    const pattern = new RegExp(`</${escapeRegExp(name)}\\s*>`, 'gi')
    pattern.lastIndex = from
    const match = pattern.exec(html)
    if (!match) {
        return -1
    }
    return match.index + match[0].length
}

/**
 * 扫描 HTML，返回按目标大小切分的「安全块区间」。
 *
 * @param html 预览渲染产物（markdown-it Html，可能含用户原始 HTML）
 * @param targetChars 目标块大小（字符数）；单个顶层元素超过该大小时该元素独立成块
 * @returns 块区间数组；html 为空返回空数组；任何无法保证边界的输入返回 null（调用方回退整篇消毒）
 */
export function SplitPreviewHtmlForSanitize(
    html: string,
    targetChars: number
): PreviewHtmlChunkSpan[] | null {
    if (typeof html !== 'string') {
        return null
    }
    if (html.length === 0) {
        return []
    }
    const target =
        Number.isFinite(targetChars) && targetChars > 0 ? Math.floor(targetChars) : 128 * 1024

    /** 标签栈（仅记录尚未闭合的非空元素） */
    const stack: string[] = []
    /** depth 0 处的安全切分点（字符偏移，严格递增；首元素固定为 0） */
    const boundaries: number[] = [0]
    let index = 0
    while (index < html.length) {
        const openIndex = html.indexOf('<', index)
        if (openIndex === -1) {
            break
        }
        index = openIndex
        const marker = index + 1 < html.length ? html.charCodeAt(index + 1) : -1
        if (marker === -1) {
            // 文本末尾孤立 '<'：无法确定边界，回退整篇消毒
            return null
        }
        if (marker === 0x21 /* ! */) {
            // 注释 / CDATA / DOCTYPE 等标记声明：整体跳过，不影响标签栈
            if (html.startsWith('<!--', index)) {
                const close = html.indexOf('-->', index + 4)
                if (close === -1) {
                    return null
                }
                index = close + 3
            } else if (html.startsWith('<![CDATA[', index)) {
                const close = html.indexOf(']]>', index + 9)
                if (close === -1) {
                    return null
                }
                index = close + 3
            } else {
                const close = html.indexOf('>', index + 2)
                if (close === -1) {
                    return null
                }
                index = close + 1
            }
            if (stack.length === 0) {
                boundaries.push(index)
            }
            continue
        }
        if (marker === 0x3f /* ? */) {
            // 处理指令（<?xml ...?> 等）：整体跳过
            const close = html.indexOf('?>', index + 2)
            if (close === -1) {
                return null
            }
            index = close + 2
            if (stack.length === 0) {
                boundaries.push(index)
            }
            continue
        }
        if (marker === 0x2f /* / */) {
            // 结束标签：名称必须与栈顶一致，且不允许携带属性（携带属性属畸形 HTML，保守回退）
            const nameStart = index + 2
            let cursor = nameStart
            while (cursor < html.length && isTagNameChar(html.charCodeAt(cursor))) {
                cursor += 1
            }
            if (cursor === nameStart) {
                return null
            }
            const name = html.slice(nameStart, cursor).toLowerCase()
            while (cursor < html.length && isHtmlWhitespace(html.charCodeAt(cursor))) {
                cursor += 1
            }
            if (html.charCodeAt(cursor) !== 0x3e /* > */) {
                return null
            }
            cursor += 1
            if (stack.length === 0 || stack[stack.length - 1] !== name) {
                return null
            }
            stack.pop()
            index = cursor
            if (stack.length === 0) {
                boundaries.push(index)
            }
            continue
        }
        if (!isAsciiLetter(marker)) {
            // '<' 后不是标签起始（如正文里的 "a < b"）：按普通文本处理，前进一个字符
            index += 1
            continue
        }
        // 开始标签：扫描到 '>'（跳过引号内的 '>'），标签内出现 '<' 视为畸形 → 回退
        const nameStart = index + 1
        let cursor = nameStart
        while (cursor < html.length && isTagNameChar(html.charCodeAt(cursor))) {
            cursor += 1
        }
        const name = html.slice(nameStart, cursor).toLowerCase()
        let closed = false
        while (cursor < html.length) {
            const code = html.charCodeAt(cursor)
            if (code === 0x3c /* < */) {
                return null
            }
            if (code === 0x3e /* > */) {
                cursor += 1
                closed = true
                break
            }
            if (code === 0x22 /* " */ || code === 0x27 /* ' */) {
                const quote = code
                cursor += 1
                while (cursor < html.length && html.charCodeAt(cursor) !== quote) {
                    cursor += 1
                }
                if (cursor >= html.length) {
                    // 属性值引号未闭合：畸形 → 回退
                    return null
                }
                cursor += 1
                continue
            }
            cursor += 1
        }
        if (!closed) {
            return null
        }
        const tagText = html.slice(index, cursor)
        const selfClosing = /\/\s*>$/.test(tagText)
        index = cursor
        if (RAW_TEXT_ELEMENTS.has(name)) {
            // 原始文本元素：内容整体跳过（内部 `</p>` 等不会被误判为边界）
            const rawEnd = findRawTextEndTag(html, index, name)
            if (rawEnd === -1) {
                return null
            }
            index = rawEnd
            if (stack.length === 0) {
                boundaries.push(index)
            }
            continue
        }
        if (!selfClosing && !VOID_ELEMENTS.has(name)) {
            stack.push(name)
            continue
        }
        // 自闭合 / 空元素：不改变深度；顶层时记录切分点
        if (stack.length === 0) {
            boundaries.push(index)
        }
    }
    if (stack.length !== 0) {
        // 存在未闭合标签（如用户原始 HTML 只写了 <div> 没闭合）：回退整篇消毒
        return null
    }
    if (boundaries[boundaries.length - 1] !== html.length) {
        boundaries.push(html.length)
    }

    // 贪心分组：尽量让每块接近目标大小，但不越过「完整顶层元素」边界
    const spans: PreviewHtmlChunkSpan[] = []
    let start = 0
    let pendingBoundaryIndex = 0
    while (start < html.length) {
        while (
            pendingBoundaryIndex < boundaries.length &&
            boundaries[pendingBoundaryIndex] <= start
        ) {
            pendingBoundaryIndex += 1
        }
        const targetEnd = start + target
        let chosen = -1
        let probe = pendingBoundaryIndex
        while (probe < boundaries.length && boundaries[probe] <= targetEnd) {
            chosen = boundaries[probe]
            probe += 1
        }
        if (chosen === -1) {
            // 窗口内没有边界（单个顶层元素超过目标大小）：退而取下一个边界
            if (probe < boundaries.length) {
                chosen = boundaries[probe]
                probe += 1
            } else {
                return null
            }
        }
        spans.push({ start, end: chosen })
        start = chosen
        pendingBoundaryIndex = probe
    }
    // 尾部过小的块（如元素后的最后一个换行文本节点）并入前一块：
    // 两块都只包含完整顶层元素/文本，合并后仍然是安全边界，且避免为几字节内容多跑一次净化。
    if (spans.length > 1) {
        const lastSpan = spans[spans.length - 1]
        if (lastSpan.end - lastSpan.start < target / 8) {
            spans[spans.length - 2].end = lastSpan.end
            spans.pop()
        }
    }
    return spans
}
