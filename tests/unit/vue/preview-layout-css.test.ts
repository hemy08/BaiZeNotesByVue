/**
 * 预览区右侧空白回归守卫（2026-11-22 截图问题）：
 * `.markdown-preview-html` 曾固定 `width: calc(100% - 15px)` + `margin-left: 15px`
 * 并 `overflow-y: scroll`，导致预览右侧永久空白条。这里锁定修复后的关键样式。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const source = fs.readFileSync(
    path.join(process.cwd(), 'src/renderer/src/components/Markdown/MarkdownPreviewComponent.vue'),
    'utf8'
)

describe('MarkdownPreviewComponent 预览布局', () => {
    it('预览根节点应全宽，不再预留右侧空白', () => {
        const block = source.match(/\.markdown-preview-html\s*\{[\s\S]*?\}/)
        expect(block).not.toBeNull()
        const css = block![0].replace(/\/\*[\s\S]*?\*\//g, '')
        expect(css).toContain('width: 100%')
        expect(css).toContain('margin-left: 0')
        expect(css).toContain('padding-left: 15px')
        expect(css).toContain('box-sizing: border-box')
        expect(css).not.toContain('calc(100% - 15px)')
    })

    it('滚动条按需出现，避免永久空白槽位', () => {
        const block = source.match(/\.markdown-preview-html\s*\{[\s\S]*?\}/)![0]
        const css = block.replace(/\/\*[\s\S]*?\*\//g, '')
        expect(css).toContain('overflow-y: auto')
        expect(css).not.toContain('overflow-y: scroll')
        expect(css).toContain('display: block')
        expect(css).not.toContain('display: inline-block')
    })
})
