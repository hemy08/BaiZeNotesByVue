/**
 * P1-8 后续：hljs 冷门语言按需预取单元测试（preview-highlight.ts）
 *
 * 背景（out/tool-results/fix-katex.md §5 限制 1）：预览高亮使用 highlight.js core + 25 种
 * 精选语言（静态注册），白名单外语言由 safeHighlight 回退为转义纯文本。本轮在不破坏同步
 * 渲染契约的前提下增加增强：渲染前扫描围栏语言，对「已显式映射的常见冷门语言」动态 import
 * 语言包并注册，随后同一轮同步 md.render 即命中高亮（首轮即完整高亮，无闪烁/半渲染）。
 *
 * 覆盖：
 * 1. 围栏语言提取（``` / ~~~ / 缩进 / blockquote / info 属性 / 围栏内伪围栏 / 去重 / 快速路径）；
 * 2. 已注册的常用语言不触发任何动态 import（零新增成本）；
 * 3. 冷门已映射语言：预取一次 → 注册成功 → 同一轮同步渲染即高亮；会话级不重复 import；
 * 4. 别名（ps1 → powershell 等）反查正确；
 * 5. 未映射的未知语言：不预取、不改变行为（内容转义、无高亮、不抛异常）；
 * 6. 语言包加载失败：不抛异常、按未知语言转义、不重复重试。
 *
 * 说明：语言包为真实动态 import（不 mock 成功路径），保证与生产构建同一解析路径
 * （highlight.js exports 的 import 条件 → es/languages/*.js，default 导出语言定义函数）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

type HighlightModule = typeof import('../../src/renderer/src/components/Markdown/preview-highlight')
type MarkdownItModule =
    typeof import('../../src/renderer/src/components/Markdown/preview-markdown-it')

/** 本文件会用到的冷门语言（用于用例间清理，避免共享的 highlight.js core 实例状态串味） */
const LAZY_TEST_LANGUAGE_NAMES = ['lua', 'powershell']

/** 拿一套「新会话」状态的高亮模块 + 预览 markdown-it 实例 */
async function importFreshPipeline(): Promise<{
    highlight: HighlightModule
    md: ReturnType<MarkdownItModule['createPreviewMarkdownIt']>
}> {
    vi.resetModules()
    const highlight = await import('../../src/renderer/src/components/Markdown/preview-highlight')
    const { createPreviewMarkdownIt } =
        await import('../../src/renderer/src/components/Markdown/preview-markdown-it')
    // highlight.js 位于 node_modules（vitest 外部化）→ core 单例跨用例共享：fresh import 只重置
    // 本模块的会话状态（Set/Promise），已注册语言仍残留在共享 core 上，这里显式清理。
    for (const languageName of LAZY_TEST_LANGUAGE_NAMES) {
        highlight.default.unregisterLanguage(languageName)
    }
    return { highlight, md: createPreviewMarkdownIt() }
}

afterEach(() => {
    vi.resetModules()
})

describe('CollectPreviewFenceLanguages：围栏语言提取', () => {
    it('提取 ``` / ~~~ / 缩进 / blockquote 围栏语言并去重', async () => {
        const { highlight } = await importFreshPipeline()
        const content = [
            '```js',
            'const a = 1',
            '```',
            '',
            '~~~lua',
            'local x = 1',
            '~~~',
            '',
            '  ```python {.line-numbers}',
            'print(1)',
            '  ```',
            '',
            '> ```powershell',
            '> Get-Item .',
            '> ```',
            '',
            '```lua',
            'local y = 2',
            '```'
        ].join('\n')

        expect(highlight.CollectPreviewFenceLanguages(content)).toEqual([
            'js',
            'lua',
            'python',
            'powershell'
        ])
    })

    it('围栏内容里的伪围栏行不产生语言声明；无围栏文本走快速路径', async () => {
        const { highlight } = await importFreshPipeline()
        const content = ['```markdown', '```lua', 'local x = 1', '```', '```'].join('\n')

        // ```lua 是 markdown 围栏的内容（关闭行要求 info 为空），不应被当作新语言
        expect(highlight.CollectPreviewFenceLanguages(content)).toEqual(['markdown'])
        expect(highlight.CollectPreviewFenceLanguages('普通段落，没有代码围栏')).toEqual([])
        expect(highlight.CollectPreviewFenceLanguages('')).toEqual([])
    })
})

describe('EnsurePreviewHighlightLanguagesLoaded：按需预取', () => {
    it('已注册的常用语言不触发任何动态 import', async () => {
        const { highlight, md } = await importFreshPipeline()
        const content = ['```js', 'const a = 1', '```', '', '```python', 'print(1)', '```'].join(
            '\n'
        )

        await highlight.EnsurePreviewHighlightLanguagesLoaded(content)

        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(0)
        expect(highlight.GetPreviewHighlightPrefetchedLanguages()).toEqual([])
        // 常用语言照常高亮（行为不变）
        expect(md.render(content)).toContain('hljs-keyword')
    })

    it('冷门已映射语言：预取一次后同一轮同步渲染即高亮（会话级不重复 import）', async () => {
        const { highlight, md } = await importFreshPipeline()
        const content = ['```lua', 'local answer = 42', '```'].join('\n')

        // 预取前：未注册，按既有语义转义（不会触发异步渲染）
        expect(highlight.default.getLanguage('lua')).toBeFalsy()

        await highlight.EnsurePreviewHighlightLanguagesLoaded(content)
        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(1)
        expect(highlight.IsPreviewHighlightLanguagePrefetched('lua')).toBe(true)
        expect(highlight.default.getLanguage('lua')).toBeTruthy()

        // 同一轮同步渲染即可命中高亮（不是「下次渲染才生效」）
        const html = md.render(content)
        expect(html).toContain('hljs language-lua')
        expect(html).toContain('hljs-keyword')
        expect(html).not.toContain('```')

        // 再次调用：已有注册/已预取，不重复动态 import
        await highlight.EnsurePreviewHighlightLanguagesLoaded(content)
        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(1)
    })

    it('常见别名可反查到对应语言包（ps1 → powershell）', async () => {
        const { highlight, md } = await importFreshPipeline()
        const content = ['```ps1', 'Get-ChildItem -Path .', '```'].join('\n')

        await highlight.EnsurePreviewHighlightLanguagesLoaded(content)

        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(1)
        // 注册后语言包自带的别名同样可用
        expect(highlight.default.getLanguage('ps1')).toBeTruthy()
        const html = md.render(content)
        expect(html).toContain('hljs language-ps1')
        expect(html).toContain('hljs-')
    })

    it('未映射的未知语言：不预取、保持既有转义行为', async () => {
        const { highlight, md } = await importFreshPipeline()
        const content = ['```vue-not-a-real-language', '<div/>', '```'].join('\n')

        await highlight.EnsurePreviewHighlightLanguagesLoaded(content)

        expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(0)
        const html = md.render(content)
        expect(html).toContain('&lt;div/&gt;')
        expect(html).not.toContain('hljs-')
    })

    it('语言包加载失败：不抛异常、按未知语言转义、不重复重试', async () => {
        vi.resetModules()
        // 模拟「语言包模块存在但不导出语言定义函数」：覆盖加载失败降级路径，
        // 同时避免 mock 工厂抛错污染 vitest 的错误报告。
        vi.doMock('highlight.js/lib/languages/lua', () => ({ default: null }))
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            const highlight: HighlightModule =
                await import('../../src/renderer/src/components/Markdown/preview-highlight')
            // 清掉共享 core 上可能残留的注册（见 importFreshPipeline 注释）
            for (const languageName of LAZY_TEST_LANGUAGE_NAMES) {
                highlight.default.unregisterLanguage(languageName)
            }
            const { createPreviewMarkdownIt } =
                await import('../../src/renderer/src/components/Markdown/preview-markdown-it')
            const md = createPreviewMarkdownIt()
            const content = ['```lua', 'local x = 1', '```'].join('\n')

            // 不抛异常（预取是增强项）
            await expect(
                highlight.EnsurePreviewHighlightLanguagesLoaded(content)
            ).resolves.toBeUndefined()
            expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(1)
            expect(highlight.IsPreviewHighlightLanguagePrefetched('lua')).toBe(false)
            expect(warnSpy).toHaveBeenCalled()

            const html = md.render(content)
            expect(html).toContain('local x = 1')
            expect(html).not.toContain('hljs-')

            // 失败结果会话级缓存：再次调用不重复 import
            await highlight.EnsurePreviewHighlightLanguagesLoaded(content)
            expect(highlight.GetPreviewHighlightPrefetchAttemptCount()).toBe(1)
        } finally {
            vi.doUnmock('highlight.js/lib/languages/lua')
            vi.resetModules()
        }
    })
})
