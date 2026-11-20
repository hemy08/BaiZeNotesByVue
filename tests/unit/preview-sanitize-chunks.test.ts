// @vitest-environment jsdom
/**
 * P2-1 大文档分块净化单元测试（preview-html-chunks.ts + preview-sanitize.ts）。
 *
 * 覆盖：
 * 1. 安全分块边界扫描：完整顶层元素边界、块区间首尾相接且拼接等于原文；
 * 2. 不跨标签切分：`<pre>` 内容、原始文本元素（script/style/textarea）、注释/CDATA 内部不切分；
 * 3. 畸形 HTML 一律回退（返回 null）：未闭合标签、结束标签不匹配、引号未闭合、
 *    未闭合注释、标签内出现 '<'；
 * 4. 分块消毒：调用顺序/块数、块间让出主线程开关、取消回调、与整篇消毒输出等价；
 * 5. 回退整篇消毒：畸形 HTML 仍经 DOMPurify 消毒（不绕过消毒）；
 * 6. XSS 回归：跨块分布的 script / onerror / javascript: / iframe / 事件处理器全部被清理。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    SplitPreviewHtmlForSanitize,
    type PreviewHtmlChunkSpan
} from '../../src/renderer/src/components/Markdown/preview-html-chunks'
import {
    CountPreviewSanitizeChunks,
    DOMPURIFY_CONFIG,
    PREVIEW_SANITIZE_CHUNK_CHARS,
    ResetPreviewSanitizeWarningState,
    SanitizePreviewHtml,
    SanitizePreviewHtmlInChunks
} from '../../src/renderer/src/components/Markdown/preview-sanitize'
/** 校验块区间合法：首块从 0 开始、尾块到末尾、区间首尾相接且非空 */
function expectValidSpans(html: string, spans: PreviewHtmlChunkSpan[] | null): void {
    expect(spans).not.toBeNull()
    const result = spans as PreviewHtmlChunkSpan[]
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].start).toBe(0)
    expect(result[result.length - 1].end).toBe(html.length)
    for (let index = 0; index < result.length; index += 1) {
        expect(result[index].end).toBeGreaterThan(result[index].start)
        if (index > 0) {
            expect(result[index].start).toBe(result[index - 1].end)
        }
    }
}

/** 按块区间拼接（应与原文逐字一致） */
function joinSpans(html: string, spans: PreviewHtmlChunkSpan[]): string {
    return spans.map((span) => html.slice(span.start, span.end)).join('')
}

/** 恶意 HTML 样本（大小超过块目标，必然跨块分布） */
function buildMaliciousHtml(): string {
    return [
        '<h1>安全标题</h1>',
        '<p>正常段落，含 <strong>加粗</strong> 与 <code>inline</code></p>',
        '<script>alert(1)</script>',
        '<p>' + '正常文本 '.repeat(120) + '</p>',
        '<img src="x" onerror="alert(2)">',
        '<a href="javascript:alert(3)">恶意链接</a>',
        '<p>' + '更多文本 '.repeat(120) + '</p>',
        '<svg><script>alert(4)</script><circle cx="1" cy="1" r="1" /></svg>',
        '<iframe src="https://evil.example"></iframe>',
        '<div onclick="alert(5)">点击我</div>',
        '<p><a href="https://example.com/page">正常外链</a></p>',
        '<p>' + '尾部文本 '.repeat(120) + '</p>'
    ].join('')
}

/** 断言消毒输出中不存在任何可执行注入面 */
function expectNoExecutableInjection(html: string): void {
    expect(html).not.toContain('<script')
    expect(html).not.toContain('</script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('alert(')
}

beforeEach(() => {
    ResetPreviewSanitizeWarningState()
})

describe('P2-1 安全分块边界扫描（SplitPreviewHtmlForSanitize）', () => {
    it('空 HTML 返回空数组', () => {
        expect(SplitPreviewHtmlForSanitize('', 128)).toEqual([])
    })

    it('常规顶层元素按目标大小分块，区间首尾相接且拼接等于原文', () => {
        const html =
            '<h1>标题</h1>' +
            '<p>段落 <strong>加粗</strong></p>' +
            '<pre><code class="hljs">const a = 1</code></pre>' +
            '<ul><li>一</li><li>二</li></ul>'
        const spans = SplitPreviewHtmlForSanitize(html, 40)
        expectValidSpans(html, spans)
        expect((spans as PreviewHtmlChunkSpan[]).length).toBeGreaterThan(1)
        expect(joinSpans(html, spans as PreviewHtmlChunkSpan[])).toBe(html)
    })

    it('单个超大顶层元素（如超长段落）独立成块，不在元素内部切分', () => {
        const html = '<p>' + 'x'.repeat(5000) + '</p>'
        const spans = SplitPreviewHtmlForSanitize(html, 128)
        expectValidSpans(html, spans)
        expect(spans).toHaveLength(1)
        expect(spans![0]).toEqual({ start: 0, end: html.length })
    })

    it('不切分 <pre> 内部内容（即使内部出现块级标签形态文本）', () => {
        const html = '<pre>' + '<p>x</p>'.repeat(100) + '</pre>'
        const spans = SplitPreviewHtmlForSanitize(html, 16)
        expectValidSpans(html, spans)
        expect(spans).toHaveLength(1)
    })

    it('原始文本元素内部不解析标签：script 内容里的 </p> 不会成为边界', () => {
        const scriptEnd = '<script>var s = "</p><p>x</p>";</script>'.length
        const html = '<script>var s = "</p><p>x</p>";</script><p>a</p>'
        const spans = SplitPreviewHtmlForSanitize(html, 8)
        expectValidSpans(html, spans)
        expect(joinSpans(html, spans as PreviewHtmlChunkSpan[])).toBe(html)
        // 第一个块必须完整覆盖 script（不能在其内部切分）
        expect(spans![0].end).toBeGreaterThanOrEqual(scriptEnd)
    })

    it('注释 / CDATA / DOCTYPE 内部不切分，且整体跳过不影响标签栈', () => {
        const html = '<!DOCTYPE html><!-- <p>注释里的假标签</p> --><![CDATA[<div>]]><p>正文</p>'
        const spans = SplitPreviewHtmlForSanitize(html, 8)
        expectValidSpans(html, spans)
        expect(joinSpans(html, spans as PreviewHtmlChunkSpan[])).toBe(html)
    })

    it('空元素 / 自闭合元素不参与深度，仍可成为安全边界', () => {
        const html = '<br><img src="x"><hr><p>a</p><svg><circle cx="1" cy="1" r="1" /></svg>'
        const spans = SplitPreviewHtmlForSanitize(html, 8)
        expectValidSpans(html, spans)
        expect(joinSpans(html, spans as PreviewHtmlChunkSpan[])).toBe(html)
    })

    it('正文中的 "<"（如 a < b）按文本处理，不误判为标签，也不回退', () => {
        const html = '<p>a &lt; b 与 c &lt; d</p><p>下一段</p>'
        const spans = SplitPreviewHtmlForSanitize(html, 8)
        expectValidSpans(html, spans)
        expect(joinSpans(html, spans as PreviewHtmlChunkSpan[])).toBe(html)
    })

    it.each([
        ['未闭合的 div', '<div><p>x</p>'],
        ['多余的结束标签', '<p>a</p></div>'],
        ['原始文本元素未闭合', '<script>alert(1)'],
        ['开始标签属性引号未闭合', '<p class="x>文本</p>'],
        ['未闭合注释', '<p>a</p><!-- 未闭合'],
        ['结束标签携带属性（畸形）', '<div>x</div class="y">'],
        ['标签内出现 "<"（畸形）', '<div <span>>x</div>']
    ])('畸形 HTML 一律回退整篇消毒：%s', (_label, html) => {
        expect(SplitPreviewHtmlForSanitize(html, 8)).toBeNull()
    })

    it('分块数量诊断（CountPreviewSanitizeChunks）：空 0 / 单块 1 / 多块 >1 / 畸形回退 1', () => {
        expect(CountPreviewSanitizeChunks('')).toBe(0)
        expect(CountPreviewSanitizeChunks('<p>' + 'x'.repeat(1000) + '</p>', 64)).toBe(1)
        const multi = '<p>a</p>'.repeat(200)
        expect(CountPreviewSanitizeChunks(multi, 64)).toBeGreaterThan(1)
        expect(CountPreviewSanitizeChunks('<div><p>x</p>', 64)).toBe(1)
    })
})

describe('P2-1 整篇消毒（SanitizePreviewHtml，XSS 防线）', () => {
    it('剥离 script / 事件处理器 / javascript: 链接，保留正常结构与 class', () => {
        const html = [
            '<h2>标题</h2>',
            '<p>正常 <strong>加粗</strong></p>',
            '<pre><code class="language-js hljs">const a = 1</code></pre>',
            '<script>alert(1)</script>',
            '<img src="x" onerror="alert(2)">',
            '<a href="javascript:alert(3)">链接</a>',
            '<div onclick="alert(4)">点击</div>'
        ].join('')
        const sanitized = SanitizePreviewHtml(html)
        expectNoExecutableInjection(sanitized)
        expect(sanitized).toContain('<h2>标题</h2>')
        expect(sanitized).toContain('language-js')
        expect(sanitized).toContain('正常')
        expect(sanitized).toContain('<img')
    })

    it('空输入返回空串（不抛异常）', () => {
        expect(SanitizePreviewHtml('')).toBe('')
    })

    it('保留预览必需的 file:// 本地图片与 data: 图片（FE-12 / AS-9 语义）', () => {
        const html =
            '<img src="file:///home/user/notes/img/a.png"><img src="data:image/png;base64,iVBORw0KGgo=">'
        const sanitized = SanitizePreviewHtml(html)
        expect(sanitized).toContain('file:///home/user/notes/img/a.png')
        expect(sanitized).toContain('data:image/png;base64')
    })

    it('保留 mermaid SVG 与 KaTeX MathML 所需的 svg/mathMl 档位', () => {
        expect(DOMPURIFY_CONFIG.USE_PROFILES.svg).toBe(true)
        expect(DOMPURIFY_CONFIG.USE_PROFILES.mathMl).toBe(true)
        const html =
            '<div><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg></div>' +
            '<span class="katex"><math><semantics><mrow><mi>x</mi></mrow></semantics></math></span>'
        const sanitized = SanitizePreviewHtml(html)
        expect(sanitized).toContain('<svg')
        expect(sanitized).toContain('<circle')
        expect(sanitized).toContain('<math>')
    })
})

describe('P2-1 分块消毒（SanitizePreviewHtmlInChunks）', () => {
    const sampleHtml =
        '<h1>标题</h1>' +
        '<p>段落 <strong>加粗</strong> <a href="https://example.com">链接</a></p>' +
        '<pre><code class="language-js">const a = 1 &amp;&amp; 2</code></pre>' +
        '<ul><li>一</li><li>二</li></ul>' +
        '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>' +
        '<div class="admonition note"><p class="admonition-title">提示</p><p>内容</p></div>'

    it('按块消毒并按顺序回调，拼接输出与整篇消毒逐字一致', async () => {
        expect(PREVIEW_SANITIZE_CHUNK_CHARS).toBeGreaterThan(0)
        const chunkChars = 64
        const calls: Array<{ index: number; count: number; html: string }> = []
        const chunked = await SanitizePreviewHtmlInChunks(sampleHtml, {
            chunkChars,
            yieldBetweenChunks: false,
            onChunk: (sanitizedChunk, chunkIndex, chunkCount) => {
                calls.push({ index: chunkIndex, count: chunkCount, html: sanitizedChunk })
            }
        })
        const expected = SanitizePreviewHtml(sampleHtml)
        expect(chunked).toBe(expected)
        expect(calls.length).toBe(CountPreviewSanitizeChunks(sampleHtml, chunkChars))
        expect(calls.length).toBeGreaterThan(1)
        expect(calls.map((call) => call.index)).toEqual(calls.map((_call, index) => index))
        expect(calls.every((call) => call.count === calls.length)).toBe(true)
        // 回调收到的块拼接 = 返回的完整 HTML
        expect(calls.map((call) => call.html).join('')).toBe(expected)
    })

    it('取消回调生效：块间取消后返回 null（丢弃本轮结果）', async () => {
        let chunkCalls = 0
        const result = await SanitizePreviewHtmlInChunks(sampleHtml, {
            chunkChars: 64,
            yieldBetweenChunks: false,
            isCancelled: () => chunkCalls >= 1,
            onChunk: () => {
                chunkCalls += 1
            }
        })
        expect(result).toBeNull()
        expect(chunkCalls).toBe(1)
    })

    it('单块 HTML 不做分块开销，直接整篇消毒并回调一次', async () => {
        const html = '<p>' + 'x'.repeat(1000) + '</p>'
        const calls: number[] = []
        const result = await SanitizePreviewHtmlInChunks(html, {
            chunkChars: 64,
            yieldBetweenChunks: false,
            onChunk: (_chunk, index, count) => {
                calls.push(count)
            }
        })
        expect(calls).toEqual([1])
        expect(result).toBe(SanitizePreviewHtml(html))
    })

    it('畸形 HTML 回退整篇消毒，仍然经过 DOMPurify（不绕过消毒）', async () => {
        const malformed = '<div><script>alert(1)</script><p>x</p></div><p>未闭合'
        const calls: Array<{ index: number; count: number }> = []
        const result = await SanitizePreviewHtmlInChunks(malformed, {
            chunkChars: 8,
            yieldBetweenChunks: false,
            onChunk: (_chunk, index, count) => {
                calls.push({ index, count })
            }
        })
        expect(result).not.toBeNull()
        expectNoExecutableInjection(result as string)
        expect(calls).toHaveLength(1)
        expect(calls[0]).toEqual({ index: 0, count: 1 })
    })

    it('XSS 回归：大文档中跨块分布的恶意内容全部被清理', async () => {
        const malicious = buildMaliciousHtml()
        const chunked = await SanitizePreviewHtmlInChunks(malicious, {
            chunkChars: 256,
            yieldBetweenChunks: false,
            onChunk: () => undefined
        })
        expect(chunked).not.toBeNull()
        expectNoExecutableInjection(chunked as string)
        // 正常内容仍然保留（分块消毒不丢正文）
        expect(chunked).toContain('安全标题')
        expect(chunked).toContain('https://example.com/page')
    })

    it('分块数 >1 时每块都独立消毒：任一单块输入都不含未消毒的可执行内容', async () => {
        const malicious = buildMaliciousHtml()
        const chunks: string[] = []
        await SanitizePreviewHtmlInChunks(malicious, {
            chunkChars: 256,
            yieldBetweenChunks: false,
            onChunk: (sanitizedChunk) => {
                chunks.push(sanitizedChunk)
            }
        })
        expect(chunks.length).toBeGreaterThan(1)
        for (const chunk of chunks) {
            expectNoExecutableInjection(chunk)
        }
    })

    it('空 HTML：回调一次空串并返回空串', async () => {
        const result = await SanitizePreviewHtmlInChunks('', {
            yieldBetweenChunks: false,
            onChunk: () => undefined
        })
        expect(result).toBe('')
    })
})
