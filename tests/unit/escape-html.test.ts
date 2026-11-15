/**
 * P1：渲染层共享 HTML 转义工具单元测试。
 *
 * `escapeHtml` 由 `hemy-editor-render.ts` 的本地实现迁移到
 * `src/renderer/src/common/escape-html.ts`（唯一来源），行为必须与迁移前一致：
 * 覆盖 5 个 HTML 特殊字符，且 `&` 最先替换以避免二次解码。
 */
import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../../src/renderer/src/common/escape-html'

describe('escapeHtml', () => {
    it('should escape all five HTML special characters', () => {
        expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
    })

    it('should leave plain text untouched', () => {
        expect(escapeHtml('普通标题 2026-11-15')).toBe('普通标题 2026-11-15')
        expect(escapeHtml('')).toBe('')
    })

    it('should escape ampersands first so existing entities are not decoded again', () => {
        // `&lt;` 若不被再次转义，浏览器会把它还原成 `<`，等于绕过转义
        expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;')
        expect(escapeHtml('&amp;')).toBe('&amp;amp;')
    })

    it('should neutralize the TOC img onerror payload (N-03)', () => {
        const payload = '<img src=x onerror=alert(1)>'
        const escaped = escapeHtml(payload)

        expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;')
        // 转义后不再包含任何可被 HTML 解析器识别的标签边界
        expect(escaped).not.toContain('<')
        expect(escaped).not.toContain('>')
    })

    it('should escape quotes for attribute contexts', () => {
        expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)')
        expect(escapeHtml("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)')
    })

    it('should keep U+00A0 characters intact (TOC 缩进依赖真实空白字符)', () => {
        expect(escapeHtml('\u00A0缩进文本')).toBe('\u00A0缩进文本')
    })
})
