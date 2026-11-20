/**
 * P1-8 后续：preview-highlight.ts 全量冷门语言按需预取覆盖（覆盖率补测第四批）
 *
 * 背景：preview-highlight.ts 的 LAZY_HIGHLIGHT_LANGUAGES 显式映射了 52 个常见冷门
 * highlight.js 语言包（每个包一个 `() => import(...)` 工厂）。既有用例
 * preview-highlight-lazy.test.ts 只真实拉起 lua / powershell 两个包，其余 50 个工厂
 * 语句/函数在覆盖率统计中始终未执行（该文件语句覆盖仅 57.72%）。
 *
 * 本文件在「同一会话」内一次拉起全部 52 个真实语言包（真实动态 import，不 mock 产品
 * 代码），验证：
 * 1. 52 个工厂全部可执行、语言包可注册（真实解析路径与生产构建一致）；
 * 2. 别名与规范名同时出现时共享同一个加载 Promise（会话级去重，不重复 import）；
 * 3. 预取完成后同一轮同步渲染即可命中高亮（行为不变量）；
 * 4. 未映射语言仍不预取、不抛异常（增强项失败不影响渲染）。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'

type HighlightModule = typeof import('../../src/renderer/src/components/Markdown/preview-highlight')

/** preview-highlight.ts 中 LAZY_HIGHLIGHT_LANGUAGES 的 52 个规范语言名（顺序与源码一致） */
const LAZY_LANGUAGES = [
    'apache',
    'arduino',
    'awk',
    'clojure',
    'cmake',
    'coffeescript',
    'crystal',
    'd',
    'dart',
    'dns',
    'dos',
    'elixir',
    'elm',
    'erlang',
    'fortran',
    'fsharp',
    'glsl',
    'gradle',
    'graphql',
    'groovy',
    'haskell',
    'http',
    'julia',
    'latex',
    'less',
    'lisp',
    'lua',
    'makefile',
    'matlab',
    'nginx',
    'nim',
    'nix',
    'objectivec',
    'ocaml',
    'perl',
    'powershell',
    'prolog',
    'properties',
    'protobuf',
    'r',
    'sas',
    'scala',
    'scheme',
    'scss',
    'stata',
    'stylus',
    'tcl',
    'vbnet',
    'verilog',
    'vhdl',
    'vim',
    'wasm'
] as const

/** 构造围栏文档（每个语言一个代码块） */
function buildFenceDocument(languages: readonly string[]): string {
    return languages.map((language) => '```' + language + '\ncode\n```').join('\n\n')
}

/** 当前高亮模块（同一用例组内共享会话状态） */
let highlight: HighlightModule

beforeAll(async () => {
    vi.resetModules()
    highlight = await import('../../src/renderer/src/components/Markdown/preview-highlight')
})

describe('preview-highlight 冷门语言按需预取：52 个语言包全覆盖', () => {
    it('别名与规范名同时出现时共享同一加载 Promise（会话级去重）', async () => {
        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(0)

        // powershell 与它的三个别名出现在同一文档：规范名首次加载，后续别名命中共享 Promise
        await highlight.EnsurePreviewHighlightLanguagesLoaded(
            buildFenceDocument(['powershell', 'ps1', 'ps', 'pwsh'])
        )

        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(1)
        expect(highlight.IsPreviewHighlightLanguagePrefetched('powershell')).toBe(true)
        expect(highlight.default.getLanguage('powershell')).toBeTruthy()
        // ps1 / ps / pwsh 是语言包自带别名，注册后同样可解析
        expect(highlight.default.getLanguage('ps1')).toBeTruthy()
        expect(highlight.default.getLanguage('pwsh')).toBeTruthy()
    })

    it('52 个显式映射语言包全部真实动态加载并注册成功', async () => {
        // 上一条用例已加载 powershell，本次文档覆盖其余 51 个（仍含 powershell 以验证幂等跳过）
        await highlight.EnsurePreviewHighlightLanguagesLoaded(buildFenceDocument(LAZY_LANGUAGES))

        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(LAZY_LANGUAGES.length)

        for (const language of LAZY_LANGUAGES) {
            expect(
                highlight.IsPreviewHighlightLanguagePrefetched(language),
                `${language} 应已通过按需预取注册`
            ).toBe(true)
            expect(
                highlight.default.getLanguage(language),
                `${language} 应可从 highlight.js core 解析`
            ).toBeTruthy()
        }

        const prefetched = highlight.GetPreviewHighlightPrefetchedLanguages()
        expect(prefetched).toHaveLength(LAZY_LANGUAGES.length)
        expect(new Set(prefetched).size).toBe(LAZY_LANGUAGES.length)
    })

    it('预取完成后同一轮同步渲染即可命中冷门语言高亮（无第二轮闪烁）', async () => {
        const { createPreviewMarkdownIt } =
            await import('../../src/renderer/src/components/Markdown/preview-markdown-it')
        const md = createPreviewMarkdownIt()
        const content = ['```haskell', 'main = putStrLn "hi"', '```'].join('\n')

        const html = md.render(content)
        expect(html).toContain('hljs language-haskell')
        expect(html).toContain('hljs-')
        expect(html).not.toContain('```')
    })

    it('未映射的未知语言不触发预取、按既有语义转义且不抛异常', async () => {
        const attemptsBefore = highlight.GetPreviewHighlightPrefetchAttemptCount()
        const { createPreviewMarkdownIt } =
            await import('../../src/renderer/src/components/Markdown/preview-markdown-it')
        const md = createPreviewMarkdownIt()
        const content = ['```not-a-real-language-xyz', '<div>raw</div>', '```'].join('\n')

        await expect(
            highlight.EnsurePreviewHighlightLanguagesLoaded(content)
        ).resolves.toBeUndefined()
        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(attemptsBefore)
        expect(highlight.IsPreviewHighlightLanguagePrefetched('not-a-real-language-xyz')).toBe(
            false
        )

        const html = md.render(content)
        expect(html).not.toContain('hljs-')
        expect(html).toContain('&lt;div&gt;raw&lt;/div&gt;')
    })

    it('全部语言名注册后可正常执行高亮（core 注册链路完整）', () => {
        const highlighted = highlight.default.highlight('SELECT * FROM t', { language: 'sql' })
        expect(highlighted.value).toContain('hljs-keyword')

        const haskell = highlight.default.highlight('main = putStrLn "hi"', { language: 'haskell' })
        expect(haskell.value).toContain('hljs-')
    })
})
