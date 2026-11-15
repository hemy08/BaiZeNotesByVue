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
 * 3. MermaidRender.vue 挂载时用该配置初始化 mermaid。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
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

// MermaidRender.vue 挂载时必须以 MERMAID_INIT_CONFIG 初始化 mermaid
const mermaidMock = vi.hoisted(() => ({
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg><text>ok</text></svg>' })
}))
vi.mock('mermaid', () => ({ default: mermaidMock }))

describe('MermaidRender.vue 初始化', () => {
    it('挂载时用 htmlLabels: false 配置初始化 mermaid', async () => {
        const { default: MermaidRender } =
            await import('../../src/renderer/src/components/Markdown/MermaidRender.vue')
        const wrapper = mount(MermaidRender, { props: { graphCode: '' } })
        expect(mermaidMock.initialize).toHaveBeenCalledTimes(1)
        const initArg = mermaidMock.initialize.mock.calls[0]![0] as Record<string, unknown>
        expect(initArg.htmlLabels).toBe(false)
        wrapper.unmount()
    })
})
