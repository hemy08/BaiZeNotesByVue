/**
 * preview-markdown-it.ts 单元测试（P0/PF-1）
 *
 * 覆盖：
 * 1. 修复后的 markdown-it 实例不再触发 highlight.js 全语言自动探测（highlightAuto）；
 * 2. 行内代码/无语言围栏/未知语言围栏：内容保留、HTML 转义、不抛异常、不做语言探测；
 * 3. 显式声明且已注册的语言仍正常高亮（行内 `{:.js}` 标注与 js 围栏）；
 * 4. 修复前基线配置（对照）：同一份文档会触发与行内代码数等量的 highlightAuto 调用，
 *    证明测试确实能捕获该回归（防止插件升级后 auto:false 失效而测试静默通过）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import hljs from 'highlight.js'
import plantuml from 'markdown-it-plantuml'
import { full as emoji } from 'markdown-it-emoji'

import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'

/** 修复前基线配置：逐字复刻 MarkdownPreviewComponent.vue 原实现（仅供对照测试） */
function createLegacyMarkdownIt() {
    return MarkdownIt({
        html: true,
        xhtmlOut: true,
        linkify: true,
        langPrefix: 'language-',
        breaks: true
    })
        .use(highlightjs, {
            inline: true,
            hljs: hljs,
            highlight: function (str: string, lang: string): string {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(str, { language: lang }).value
                }
                return ''
            }
        })
        .use(plantuml)
        .use(emoji)
}

/** 取 options.highlight 并收窄为两参调用签名 */
function getHighlight(md: InstanceType<typeof MarkdownIt>) {
    const highlight = md.options.highlight
    expect(highlight).toBeTypeOf('function')
    return highlight as (str: string, lang: string) => string
}

describe('preview-markdown-it（P0/PF-1 高亮性能修复）', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should never call highlightAuto for inline code (PF-1)', () => {
        const autoSpy = vi.spyOn(hljs, 'highlightAuto')
        const md = createPreviewMarkdownIt()

        md.render('行内代码 `const a = 1` 与 `npm run build`')

        expect(autoSpy).not.toHaveBeenCalled()
    })

    it('should keep inline code content escaped instead of dropping it', () => {
        const md = createPreviewMarkdownIt()

        const html = md.render('文本 `a < b && c` 结束')

        expect(html).toContain('a &lt; b &amp;&amp; c')
    })

    it('should keep unlabeled fenced code content escaped without language detection', () => {
        const autoSpy = vi.spyOn(hljs, 'highlightAuto')
        const md = createPreviewMarkdownIt()

        const html = md.render('```\nplain <text> & stuff\n```')

        expect(html).toContain('plain &lt;text&gt; &amp; stuff')
        expect(autoSpy).not.toHaveBeenCalled()
    })

    it('should escape unknown languages without throwing or probing', () => {
        const autoSpy = vi.spyOn(hljs, 'highlightAuto')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const md = createPreviewMarkdownIt()

        const html = md.render('```vue-not-a-language\n<div/>\n```')

        expect(html).toContain('&lt;div/&gt;')
        expect(autoSpy).not.toHaveBeenCalled()
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('should still highlight explicitly declared and registered languages', () => {
        const md = createPreviewMarkdownIt()

        const fenced = md.render('```js\nconst answer = 42\n```')
        expect(fenced).toContain('hljs-keyword')
        expect(fenced).toContain('answer')

        // 插件 inline:true 的语言标注语法：`code`{:.js} → 行内代码也按声明语言高亮
        const inline = md.render('行内 `const answer = 42`{:.js} 结束')
        expect(inline).toContain('hljs-keyword')
    })

    it('should return escaped text from the highlight guard for unspecified language', () => {
        const md = createPreviewMarkdownIt()
        const highlight = getHighlight(md)

        expect(highlight('x < y', '')).toBe('x &lt; y')
        expect(highlight('x < y', 'not-a-real-language')).toBe('x &lt; y')
    })

    it('should install our guarded highlight after the plugin (not the plugin bound auto)', () => {
        const md = createPreviewMarkdownIt()

        expect(md.options.highlight).toBeTypeOf('function')
        // 插件 auto 实现是绑定的 highlightAuto（name 为 'bound highlightAuto'），
        // 修复后 options.highlight 必须是我们重新赋回的守卫实现
        expect(md.options.highlight?.name).not.toBe('bound highlightAuto')
    })

    it('should expose a legacy baseline that does trigger highlightAuto (control)', () => {
        const autoSpy = vi.spyOn(hljs, 'highlightAuto')
        const legacy = createLegacyMarkdownIt()

        legacy.render('行内 `const a = 1` 与 `npm run build`')

        // 对照：修复前每个行内代码一次 highlightAuto（此即 12×~155× 放大的来源）
        expect(autoSpy).toHaveBeenCalledTimes(2)
    })

    it('should install the mkdocs-material plugin without breaking the guarded highlight (PF-1)', () => {
        const md = createPreviewMarkdownIt()

        // 插件已注册：admonition / tabbed set 在 markdown-it 解析阶段被识别
        const admonition = md.render('!!! note "提示"\n    内容')
        expect(admonition).toContain('<div class="admonition note">')
        expect(admonition).toContain('<p class="admonition-title">提示</p>')

        const tabbed = md.render('=== "A"\n    ```js\n    const a = 1\n    ```')
        expect(tabbed).toContain('tabbed-set tabbed-alternate')
        expect(tabbed).toContain('hljs language-js')
        expect(tabbed).not.toContain('```')

        // PF-1 防护不回退：插件注册后 options.highlight 仍是重新赋回的守卫实现
        expect(md.options.highlight).toBeTypeOf('function')
        expect(md.options.highlight?.name).not.toBe('bound highlightAuto')
    })
})
