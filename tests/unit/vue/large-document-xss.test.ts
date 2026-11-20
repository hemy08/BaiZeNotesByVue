// @vitest-environment jsdom
/**
 * P2-1 XSS 回归：大文档（简化档/渐进档）经真实预览管线渲染后，DOMPurify 消毒仍然生效。
 *
 * 安全要求（任务硬约束）：任何降级/分块策略都不得绕过 DOMPurify。
 * 本文件用真实 markdown-it 插件链 + 真实 DOMPurify 验证：
 * 1. 300KB 级大文档中的 script / onerror / javascript: / iframe / 事件处理器全部被清理；
 * 2. 分块消毒结果与整篇消毒逐字一致（分块不改变安全语义）；
 * 3. 降级跳过的只是 KaTeX/图表等「高成本渲染」，不是消毒；
 * 4. 默认远程图片策略在大文档上同样生效（不产生可请求的远程 URL）。
 */
import { describe, it, expect } from 'vitest'
import { createPreviewMarkdownIt } from '@renderer/components/Markdown/preview-markdown-it'
import {
    ApplyRemoteImagePolicy,
    HemyRenderPreLocal,
    IsLargePreviewDocument,
    resetPreviewLocalRenderState,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'
import {
    CountPreviewSanitizeChunks,
    SanitizePreviewHtml,
    SanitizePreviewHtmlInChunks
} from '@renderer/components/Markdown/preview-sanitize'
import {
    ResetPreviewRenderPlanCache,
    ResolvePreviewRenderPlan
} from '@renderer/components/Markdown/preview-large-doc'
import { createTabDeepLinkEnv } from '@renderer/components/Markdown/preview-mkdocs-material'

/** 恶意注入样本（分布在大文档不同位置） */
const MALICIOUS_FRAGMENTS = [
    '<script>alert("xss-1")</script>',
    '<img src="x" onerror="alert(\'xss-2\')">',
    '<a href="javascript:alert(\'xss-3\')">恶意链接</a>',
    '<iframe src="https://evil.example/phish"></iframe>',
    '<div onclick="alert(\'xss-4\')">点击</div>',
    '<svg><script>alert("xss-5")</script></svg>',
    '<p style="background:url(https://tracking.example/pixel)">样式注入</p>',
    '![pixel](https://tracking.example/pixel.png)'
]

/**
 * 构造 ≈300KB 的大文档（简化档），恶意片段均匀插入。
 * 正文包含代码围栏、行内公式（验证降级跳过 KaTeX 而非跳过消毒）。
 */
function buildLargeMaliciousMarkdown(): string {
    const blocks: string[] = []
    let index = 0
    let size = 0
    while (size < 300 * 1024) {
        index += 1
        const lines = [
            `## 第 ${index} 节：安全回归样本 ${index}`,
            '',
            `第 ${index} 节正文：包含 **加粗**、*斜体*、\`inline code\`、行内公式 $x_{${index}}^2$ 与 [普通链接](https://example.com/${index})。`,
            '',
            '```js',
            `const safe${index} = { index: ${index}, name: 'safe-${index}' }`,
            '```',
            ''
        ]
        if (index % 37 === 0) {
            lines.push(MALICIOUS_FRAGMENTS[index % MALICIOUS_FRAGMENTS.length], '')
        }
        const block = lines.join('\n')
        blocks.push(block)
        size += block.length + 1
    }
    return blocks.join('\n')
}

/** 断言最终 HTML 不存在任何可执行注入面（远程 URL 由独立的图片策略用例断言） */
function expectNoExecutableInjection(html: string): void {
    expect(html).not.toContain('<script')
    expect(html).not.toContain('</script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('alert(')
    expect(html).not.toContain('evil.example')
}

describe('P2-1 大文档 XSS 回归（真实预览管线 + DOMPurify）', () => {
    const md = createPreviewMarkdownIt()
    const source = buildLargeMaliciousMarkdown()

    it('样本规模护栏：确实达到简化档（>256KiB）', () => {
        expect(source.length).toBeGreaterThan(256 * 1024)
        expect(IsLargePreviewDocument(source)).toBe(true)
        expect(ResolvePreviewRenderPlan(source).degraded).toBe(true)
    })

    it('简化档渲染：跳过 KaTeX/图表但整篇消毒仍剥离全部恶意内容', () => {
        // 模拟组件的降级调用：skipKatex / skipDiagrams 为 true（仅跳过高成本渲染）
        const preRendered = HemyRenderPreLocal(source, { skipKatex: true })
        const renderedHtml = md.render(preRendered, createTabDeepLinkEnv())
        // 降级路径确实跳过了 KaTeX（公式保持原文），但消毒必须照常执行
        expect(renderedHtml).not.toContain('class="katex"')
        const sanitized = SanitizePreviewHtml(renderedHtml)
        expectNoExecutableInjection(sanitized)
        // 正常内容保留，预览不因消毒而丢正文
        expect(sanitized).toContain('安全回归样本 1')
        expect(sanitized).toContain('https://example.com/1')
    })

    it('渐进档分块消毒：与整篇消毒逐字一致，且跨块恶意内容全部清理', async () => {
        const preRendered = HemyRenderPreLocal(source, { skipKatex: true })
        const renderedHtml = md.render(preRendered, createTabDeepLinkEnv())
        expect(CountPreviewSanitizeChunks(renderedHtml, 32 * 1024)).toBeGreaterThan(3)
        const singlePass = SanitizePreviewHtml(renderedHtml)
        const chunked = await SanitizePreviewHtmlInChunks(renderedHtml, {
            chunkChars: 32 * 1024,
            yieldBetweenChunks: false,
            onChunk: () => undefined
        })
        expect(chunked).not.toBeNull()
        // 分块不改变安全语义：与整篇消毒输出逐字一致
        expect(chunked).toBe(singlePass)
        expectNoExecutableInjection(chunked as string)
        expect(chunked).toContain('安全回归样本 1')
    })

    it('默认远程图片策略在大文档上同样生效（不产生可请求远程 URL）', async () => {
        resetPreviewLocalRenderState()
        setPreviewAllowRemoteImages(false)
        const preRendered = HemyRenderPreLocal(source, { skipKatex: true })
        const renderedHtml = md.render(preRendered, createTabDeepLinkEnv())
        const sanitized = await SanitizePreviewHtmlInChunks(renderedHtml, {
            chunkChars: 32 * 1024,
            yieldBetweenChunks: false,
            onChunk: () => undefined
        })
        const finalHtml = ApplyRemoteImagePolicy(sanitized as string, { allowRemoteImages: false })
        expect(finalHtml).not.toContain('tracking.example')
        // 远程图片被替换为占位块（原始 URL 不落任何可请求属性）
        expect(finalHtml).toContain('remote-image-blocked')
        expectNoExecutableInjection(finalHtml)
        void ResetPreviewRenderPlanCache
    })
})
