/**
 * P1-8 后续：KaTeX CSS 按需加载单元测试（preview-katex-assets.ts + preview-local-render.ts）
 *
 * 背景：修复前 `import 'katex/dist/katex.css'` 在 src/renderer/src/main.ts 静态引入，进入首屏
 * CSS（约 33 KB 源 / 51 处字体引用），纯文本/普通 Markdown 文档也要下载解析。修复后样式表
 * 改为与 KaTeX JS 同一会话级 Promise 按需加载（只有含公式文档才触发）。
 *
 * 覆盖：
 * 1. 无公式文档：不发起 katex JS import，也不发起 katex CSS import（首屏样式/字体零 KaTeX）；
 * 2. 有公式文档：JS 与 CSS 同一次加载（各尝试 1 次），渲染正常；
 * 3. 会话级幂等：重复调用/并发调用不重复 import CSS；
 * 4. CSS 加载失败：只告警、不抛异常；KaTeX JS 已成功时公式仍可渲染（MathML 回退），不中断预览。
 *
 * 计数口径：加载器为模块级状态，每个用例用 `vi.resetModules()` + 动态 import 拿全新会话；
 * 动态 import 次数使用生产诊断 API `GetPreviewKatexCssLoadCount()` 统计（确定性，不依赖 mock）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const katexMock = vi.hoisted(() => ({
    renderToString: vi.fn()
}))

vi.mock('katex', () => ({
    default: {
        renderToString: (latex: string) => katexMock.renderToString(latex)
    }
}))

type KatexAssetsModule =
    typeof import('../../src/renderer/src/components/Markdown/preview-katex-assets')
type PreviewModule =
    typeof import('../../src/renderer/src/components/Markdown/preview-local-render')

/** 拿一个「新会话」状态的模块集合（KaTeX 加载器状态为未加载） */
async function importFreshSession(): Promise<{
    assets: KatexAssetsModule
    preview: PreviewModule
}> {
    vi.resetModules()
    const assets = await import('../../src/renderer/src/components/Markdown/preview-katex-assets')
    const preview = await import('../../src/renderer/src/components/Markdown/preview-local-render')
    return { assets, preview }
}

beforeEach(() => {
    katexMock.renderToString.mockReset()
    katexMock.renderToString.mockImplementation(
        (latex: string) => `<katex-pass>${latex}</katex-pass>`
    )
})

afterEach(() => {
    vi.resetModules()
})

describe('P1-8 后续 KaTeX CSS 按需：无公式不加载样式', () => {
    it('纯文本 / 普通 Markdown 不发起 katex CSS 动态 import', async () => {
        const { assets, preview } = await importFreshSession()
        const content = ['# 标题', '', '普通段落：**加粗** 与 `inline code`'].join('\n')

        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(false)
        expect(preview.GetPreviewKatexLoadCount()).toBe(0)
        // 关键断言：KaTeX 样式未发起任何加载（首屏 CSS 不再含 KaTeX 样式/字体）
        expect(assets.GetPreviewKatexCssLoadCount()).toBe(0)
        expect(assets.IsPreviewKatexCssLoaded()).toBe(false)
    })

    it('只有代码块中的 $ 也不触发 CSS 加载', async () => {
        const { assets, preview } = await importFreshSession()
        const content = ['```js', 'const latex = "$x^2$"', '```'].join('\n')

        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(false)
        expect(assets.GetPreviewKatexCssLoadCount()).toBe(0)
    })
})

describe('P1-8 后续 KaTeX CSS 按需：有公式时与 JS 同批加载', () => {
    it('含公式文档加载一次 JS + 一次 CSS，公式样式随渲染可用', async () => {
        const { assets, preview } = await importFreshSession()
        const content = '行内公式 $x^2$ 与块级公式 $$a^2+b^2$$'

        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(true)
        expect(preview.GetPreviewKatexLoadCount()).toBe(1)
        expect(assets.GetPreviewKatexCssLoadCount()).toBe(1)
        expect(assets.IsPreviewKatexCssLoaded()).toBe(true)

        // JS 已加载：同一轮同步渲染输出公式 HTML（样式由 CSS 加载器保证已生效）
        const rendered = preview.HemyRenderPreLocal(content)
        expect(rendered).toContain('<katex-pass>x^2</katex-pass>')

        // 会话级复用：后续渲染不再重复 import CSS/JS
        expect(await preview.EnsurePreviewKatexLoaded('$y$')).toBe(true)
        expect(assets.GetPreviewKatexCssLoadCount()).toBe(1)
        expect(preview.GetPreviewKatexLoadCount()).toBe(1)
    })

    it('并发调用共享同一 Promise（CSS 只加载一次）', async () => {
        const { assets } = await importFreshSession()

        const results = await Promise.all([
            assets.EnsurePreviewKatexCssLoaded(),
            assets.EnsurePreviewKatexCssLoaded(),
            assets.EnsurePreviewKatexCssLoaded()
        ])
        expect(results).toEqual([true, true, true])
        expect(assets.GetPreviewKatexCssLoadCount()).toBe(1)
        expect(assets.IsPreviewKatexCssLoaded()).toBe(true)
    })
})

describe('P1-8 后续 KaTeX CSS 按需：失败降级', () => {
    it('CSS 加载失败只告警不抛异常，KaTeX JS 已加载时公式仍渲染（不中断预览）', async () => {
        vi.resetModules()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.doMock('katex/dist/katex.css', () => {
            throw new Error('模拟 katex CSS chunk 加载失败')
        })
        try {
            const assets: KatexAssetsModule =
                await import('../../src/renderer/src/components/Markdown/preview-katex-assets')
            const preview: PreviewModule =
                await import('../../src/renderer/src/components/Markdown/preview-local-render')

            const content = '公式 $x^2$'
            // CSS 失败不阻断 JS：Ensure 返回 true（公式可渲染，仅缺少 KaTeX 样式）
            expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(true)
            expect(assets.GetPreviewKatexCssLoadCount()).toBe(1)
            expect(assets.IsPreviewKatexCssLoaded()).toBe(false)
            expect(warnSpy).toHaveBeenCalled()
            expect(preview.HemyRenderPreLocal(content)).toContain('<katex-pass>x^2</katex-pass>')
            // 失败结果会话级缓存：再次调用不重复 import（也不重复刷告警）
            expect(await assets.EnsurePreviewKatexCssLoaded()).toBe(false)
            expect(assets.GetPreviewKatexCssLoadCount()).toBe(1)
        } finally {
            vi.doUnmock('katex/dist/katex.css')
            vi.resetModules()
        }
    })
})
