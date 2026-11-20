/**
 * P1-8：KaTeX 按需加载单元测试（preview-local-render.ts）
 *
 * 背景：修复前 `import katex from 'katex'` 是静态依赖，预览 chunk 的静态闭包无条件加载
 * katex-*.js（487.7 KiB），纯文本/普通 Markdown 文档也付出该成本。修复后只有检测到公式标记时
 * 才 `await import('katex')`。
 *
 * 覆盖：
 * 1. 无公式（纯文本/普通 Markdown）不发起 katex 动态 import；
 * 2. 围栏代码块（含 ```math）与行内 code 中的 `$` 不触发加载；
 * 3. 有公式时加载一次并正确渲染（会话级复用，不重复 import；LRU 缓存行为不变）；
 * 4. `\(...\)` / `\[...\]` 常见定界符参与检测；
 * 5. 检测不误判（单个 `$`、未闭合定界符、空/非法输入按无公式处理）；
 * 6. 未加载时降级：公式保持原文、不抛异常；
 * 7. 动态加载失败时按无公式处理，预览不中断。
 *
 * 计数口径：加载器是模块级状态，每个用例用 `vi.resetModules()` + 动态 import 拿全新管线模块
 * （等价于新会话首次渲染）；动态 import 次数用生产诊断 API `GetPreviewKatexLoadCount()`
 * 统计（模块内部计数，确定性不依赖 mock 缓存），katex 渲染输出用 `vi.mock('katex')` 控制。
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

type PreviewModule =
    typeof import('../../src/renderer/src/components/Markdown/preview-local-render')

/** 拿一个「新会话」状态的渲染管线模块（KaTeX 加载器状态为未加载） */
async function importFreshPreviewModule(): Promise<PreviewModule> {
    vi.resetModules()
    return import('../../src/renderer/src/components/Markdown/preview-local-render')
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

describe('P1-8 KaTeX 按需加载：无公式不加载', () => {
    it('纯文本 / 普通 Markdown 不发起 katex 动态 import', async () => {
        const preview = await importFreshPreviewModule()
        const content = [
            '# 标题',
            '',
            '普通段落：**加粗**、*斜体*、`inline code`、[链接](https://example.com)',
            '',
            '```js',
            'const price = 5',
            '```'
        ].join('\n')

        expect(preview.HasPreviewMathMarkup(content)).toBe(false)
        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(false)
        expect(preview.GetPreviewKatexLoadCount()).toBe(0)
        expect(preview.IsPreviewKatexLoaded()).toBe(false)
        // 同步预渲染保持原文（无公式时管线为纯透传）
        expect(preview.HemyRenderPreLocal(content)).toBe(content)
    })

    it('围栏代码块（含 ```math）与行内 code 中的 $ 不触发加载', async () => {
        const preview = await importFreshPreviewModule()
        const content = [
            '```js',
            'const latex = "$x^2$"',
            '```',
            '',
            '行内代码 `$a^2$` 与 ``$b$`` 不应被视为公式',
            '',
            '```math',
            'x^2',
            '```'
        ].join('\n')

        expect(preview.HasPreviewMathMarkup(content)).toBe(false)
        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(false)
        expect(preview.GetPreviewKatexLoadCount()).toBe(0)
    })

    it('检测不误判：单个 $、未闭合定界符、空/非法输入按无公式处理', async () => {
        const preview = await importFreshPreviewModule()

        // 单个 $ 不构成成对定界符
        expect(preview.HasPreviewMathMarkup('价格是 $5 元')).toBe(false)
        expect(preview.HasPreviewMathMarkup('$$ 未闭合的块级公式')).toBe(false)
        expect(preview.HasPreviewMathMarkup('只有反斜杠 \\ 与 (括号)')).toBe(false)
        // 空串 / 非字符串（防御性降级）
        expect(preview.HasPreviewMathMarkup('')).toBe(false)
        expect(preview.HasPreviewMathMarkup(null as unknown as string)).toBe(false)
        // 未闭合反引号不构成行内代码：其后的成对 $ 仍按公式检测
        expect(preview.HasPreviewMathMarkup('未闭合反引号 ` 之后是公式 $x^2$')).toBe(true)
        expect(preview.GetPreviewKatexLoadCount()).toBe(0)
    })
})

describe('P1-8 KaTeX 按需加载：有公式正确渲染', () => {
    it('含公式时加载一次并正确渲染（会话级复用 + LRU 缓存不变）', async () => {
        const preview = await importFreshPreviewModule()
        const content = '行内公式 $x^2$ 与块级公式 $$a^2+b^2$$'

        expect(preview.HasPreviewMathMarkup(content)).toBe(true)
        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(true)
        expect(preview.GetPreviewKatexLoadCount()).toBe(1)
        expect(preview.IsPreviewKatexLoaded()).toBe(true)

        const rendered = preview.HemyRenderPreLocal(content)
        expect(rendered).toContain('<katex-pass>x^2</katex-pass>')
        expect(rendered).toContain(
            '<div class="katex-math-block"><p><katex-pass>a^2+b^2</katex-pass></p></div>'
        )

        // 已加载后再调用不重复 import（同一会话只加载一次）
        expect(await preview.EnsurePreviewKatexLoaded('$y$')).toBe(true)
        expect(preview.GetPreviewKatexLoadCount()).toBe(1)

        // LRU 缓存行为不变：同一公式第二次渲染命中缓存，不再调用 katex.renderToString
        katexMock.renderToString.mockClear()
        preview.HemyRenderPreLocal(content)
        expect(katexMock.renderToString).toHaveBeenCalledTimes(0)
    })

    it('常见定界符 \\(...\\) / \\[...\\] 参与检测并触发加载', async () => {
        const preview = await importFreshPreviewModule()

        expect(preview.HasPreviewMathMarkup('行内公式 \\(x^2\\) 结束')).toBe(true)
        expect(preview.HasPreviewMathMarkup('块级公式 \\[a^2+b^2\\] 结束')).toBe(true)

        expect(await preview.EnsurePreviewKatexLoaded('行内公式 \\(x^2\\)')).toBe(true)
        expect(preview.GetPreviewKatexLoadCount()).toBe(1)
    })

    it('混排文档：公式与代码块共存时公式正确渲染、代码块保持原文', async () => {
        const preview = await importFreshPreviewModule()
        const content = ['```js', 'const a = 1', '```', '', '公式 $E=mc^2$'].join('\n')

        expect(await preview.EnsurePreviewKatexLoaded(content)).toBe(true)
        const rendered = preview.HemyRenderPreLocal(content)
        expect(rendered).toContain('<katex-pass>E=mc^2</katex-pass>')
        // 围栏代码块保持原文（不参与 KaTeX 改写）
        expect(rendered).toContain('```js\nconst a = 1\n```')
    })
})

describe('P1-8 KaTeX 按需加载：降级路径', () => {
    it('未加载 KaTeX 时公式保持原文，不抛异常（不产生半渲染 HTML）', async () => {
        const preview = await importFreshPreviewModule()

        // 直接调用同步渲染函数（未经过 Ensure 前置加载）：公式保持 `$...$` 原文
        expect(preview.HemyRenderPreLocal('公式 $x^2$ 结尾')).toBe('公式 $x^2$ 结尾')
        expect(preview.katexRenderToString('x^2')).toBe('x^2')
        // 未加载状态不产生任何动态 import 尝试
        expect(preview.GetPreviewKatexLoadCount()).toBe(0)
    })

    it('动态加载失败时按无公式处理，预览不中断', async () => {
        vi.resetModules()
        vi.doMock('katex', () => {
            throw new Error('模拟 katex chunk 加载失败')
        })
        const preview: PreviewModule =
            await import('../../src/renderer/src/components/Markdown/preview-local-render')

        expect(preview.HasPreviewMathMarkup('公式 $x^2$')).toBe(true)
        // 加载失败：Ensure 返回 false（按无公式处理），不抛异常
        expect(await preview.EnsurePreviewKatexLoaded('公式 $x^2$')).toBe(false)
        expect(preview.GetPreviewKatexLoadCount()).toBe(1)
        expect(preview.IsPreviewKatexLoaded()).toBe(false)
        // 公式保持原文，预览其余内容正常
        expect(preview.HemyRenderPreLocal('公式 $x^2$ 结尾')).toBe('公式 $x^2$ 结尾')

        vi.doUnmock('katex')
        vi.resetModules()
    })
})
