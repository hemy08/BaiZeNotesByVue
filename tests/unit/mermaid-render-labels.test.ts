// @vitest-environment jsdom
/**
 * Mermaid 标签渲染回归测试（2026-11-15 实机问题）
 *
 * 问题现象：预览里 Mermaid 图表只剩空矩形与连线，节点文字（c1/a2/b1…）、
 * 子图标题（one/two/three）全部丢失。
 *
 * 根因：预览管线用 DOMPurify 消毒（USE_PROFILES 含 svg），其 svg 白名单**不含
 * `<foreignObject>`**；而 Mermaid 默认 `htmlLabels: true` 会把标签渲染进 foreignObject，
 * 消毒时整块被移除。
 *
 * 修复：Mermaid 初始化统一使用 `MERMAID_INIT_CONFIG`（根级 `htmlLabels: false`），
 * 标签改用 SVG 原生 `<text>`（在白名单内）。本测试锁定：
 * 1. 初始化配置必须是 htmlLabels: false（Mermaid 11 推荐根级写法）；
 * 2. DOMPurify 的消毒配置确实会移除 foreignObject、但保留 text —— 证明修复方向有效；
 * 3. 渲染层 Mermaid 双管线已清理：死组件 MermaidRender.vue 已删除，唯一渲染路径是
 *    `hemy-editor-render.ts`（懒加载 mermaid 时用 `MERMAID_INIT_CONFIG` 初始化，
 *    渲染失败降级为源码回显 + 错误提示块）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import DOMPurify from 'dompurify'
import { MERMAID_INIT_CONFIG } from '../../src/renderer/src/components/Markdown/hemy-editor-render'

// 与 MarkdownPreviewComponent.vue 的 DOMPURIFY_CONFIG 保持一致的消毒档位
const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
}

describe('Mermaid 初始化配置（文字丢失修复）', () => {
    it('必须使用 htmlLabels: false（SVG 原生 text 渲染）', () => {
        expect(MERMAID_INIT_CONFIG.htmlLabels).toBe(false)
        expect(MERMAID_INIT_CONFIG.startOnLoad).toBe(false)
        expect(MERMAID_INIT_CONFIG.securityLevel).toBe('strict')
    })

    it('DOMPurify 消毒配置会移除 foreignObject，但保留 SVG text（修复依据）', () => {
        // Mermaid 默认 htmlLabels: true 的产物形态：标签在 foreignObject 里
        const foreignObjectSvg = `<svg><g class="node"><rect width="50" height="30"/>
            <foreignObject width="50" height="30"><div xmlns="http://www.w3.org/1999/xhtml">c1</div></foreignObject>
        </g></svg>`
        const sanitizedWithForeignObject = DOMPurify.sanitize(foreignObjectSvg, DOMPURIFY_CONFIG)
        expect(sanitizedWithForeignObject).not.toContain('foreignObject')
        expect(sanitizedWithForeignObject).not.toContain('c1')

        // htmlLabels: false 的产物形态：标签在 <text> 里，消毒后保留
        const textSvg = `<svg><g class="node"><rect width="50" height="30"/>
            <text x="10" y="20">c1</text>
        </g></svg>`
        const sanitizedWithText = DOMPurify.sanitize(textSvg, DOMPURIFY_CONFIG)
        expect(sanitizedWithText).toContain('<text')
        expect(sanitizedWithText).toContain('c1')
        // 连线标记（marker）与样式同样应保留
        expect(
            DOMPurify.sanitize('<svg><style>.x{fill:red}</style></svg>', DOMPURIFY_CONFIG)
        ).toContain('<style')
    })
})

// hemy-editor-render 懒加载 mermaid 时必须用 MERMAID_INIT_CONFIG 初始化（覆盖原 MermaidRender.vue 挂载断言）
const mermaidMock = vi.hoisted(() => ({
    initialize: vi.fn(),
    render: vi.fn()
}))
vi.mock('mermaid', () => ({ default: mermaidMock }))

describe('hemy-editor-render Mermaid 单管线（死组件已删除）', () => {
    it('死组件 MermaidRender.vue 已删除（双管线收敛为单管线）', () => {
        expect(
            fs.existsSync(
                path.join(process.cwd(), 'src/renderer/src/components/Markdown/MermaidRender.vue')
            )
        ).toBe(false)
    })

    it('首次渲染 mermaid 块时用 MERMAID_INIT_CONFIG 初始化；失败时降级为错误块', async () => {
        mermaidMock.render.mockResolvedValueOnce({
            svg: '<svg><text>ok</text></svg>',
            diagramType: 'flowchart'
        })
        const { preRenderMermaidProc } =
            await import('../../src/renderer/src/components/Markdown/hemy-editor-render')

        const okResult = await preRenderMermaidProc(
            'before\n```mermaid\ngraph TD; A-->B\n```\nafter'
        )

        // 懒加载初始化：只初始化一次，且参数就是 MERMAID_INIT_CONFIG（htmlLabels: false 修复）
        expect(mermaidMock.initialize).toHaveBeenCalledTimes(1)
        expect(mermaidMock.initialize).toHaveBeenCalledWith(MERMAID_INIT_CONFIG)
        const initArg = mermaidMock.initialize.mock.calls[0]![0] as Record<string, unknown>
        expect(initArg.htmlLabels).toBe(false)
        expect(initArg.startOnLoad).toBe(false)
        expect(initArg.securityLevel).toBe('strict')
        // 渲染成功路径：包装为预览所需 HTML 结构
        expect(mermaidMock.render).toHaveBeenCalledTimes(1)
        expect(okResult).toContain('before')
        expect(okResult).toContain('after')
        expect(okResult).toContain('<pre class="mermaid">')
        expect(okResult).toContain('<svg><text>ok</text></svg>')
        expect(okResult).not.toContain('```mermaid')

        // 失败路径（FUN-21）：源码回显 + 错误提示块（原 MermaidRender.vue 覆盖的降级行为）
        mermaidMock.render.mockRejectedValueOnce(new Error('render failed'))
        const errorResult = await preRenderMermaidProc('```mermaid\nBROKEN-CODE\n```')
        expect(errorResult).toContain('class="mermaid-render-error"')
        expect(errorResult).toContain('Mermaid 图表渲染失败')
        expect(errorResult).toContain('BROKEN-CODE')
        expect(errorResult).toContain('render failed')
        // 模块级 import Promise 缓存：转失败路径不会重复初始化
        expect(mermaidMock.initialize).toHaveBeenCalledTimes(1)
    })
})
