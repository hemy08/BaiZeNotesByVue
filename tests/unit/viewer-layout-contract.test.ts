/**
 * HTML/PDF 查看器布局契约测试（2026-11-19，用户反馈修复）
 *
 * 背景：`#html-containers` / `#pdf-containers` 此前缺少布局样式（display/float/height），
 * FileViewerShell 的 100% 高度与 iframe 的 flex 收缩（min-height:0）也无保障，导致
 * iframe 内部视口高度被内容撑大（实测 18501px vs 1192px 视口）：文档无法滚动，
 * 点击报告页左侧悬浮目录（锚点）时浏览器转向滚动外层布局，表现为「整个工作区上移、
 * 被菜单栏遮挡」。
 *
 * 本测试为源码级契约（jsdom 无法验证 CSS 布局），锁定关键样式声明防止回归：
 * 1. 容器：display:flex + column + float:left + height:100% + min-height:0 + overflow:hidden；
 * 2. 查看器壳层：shell/content-wrapper 的 min-height:0；
 * 3. iframe 与 PDF 滚动区：min-height:0（允许 flex 收缩，由内容自身滚动）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

const workspace = read('src/renderer/src/components/WorkSpaceArea/WorkSpace.vue')
const shell = read('src/renderer/src/components/HemyTools/FileViewerShell.vue')
const htmlView = read('src/renderer/src/components/HemyTools/ShowHtmlView.vue')
const pdfView = read('src/renderer/src/components/HemyTools/ShowPdfEditor.vue')

// 2026-11-20（用户反馈：页面满时回车后光标被状态栏遮挡）：编辑器底部布局契约
const baiZeNotes = read('src/renderer/src/components/BaiZeNotes.vue')
const markdownContainer = read('src/renderer/src/components/Markdown/MarkdownContainer.vue')
const editorOptions = read('src/renderer/src/components/Markdown/editor-options.ts')
const monacoEditor = read('src/renderer/src/components/Markdown/MarkdownMonacoEditor.vue')

/** 取某个选择器块的样式声明文本（从选择器到下一个 `}`），用于断言关键属性 */
function selectorBlock(source: string, selector: string): string {
    const idx = source.indexOf(selector)
    expect(idx, `应存在选择器 ${selector}`).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('}', idx)
    return source.slice(idx, end)
}

describe('HTML/PDF 查看器布局契约（用户反馈：点击导航后布局上移）', () => {
    it('should pin html/pdf containers to the workspace height and clip overflow', () => {
        const block = selectorBlock(workspace, '#html-containers')
        expect(block).toContain('display: flex')
        expect(block).toContain('flex-direction: column')
        expect(block).toContain('height: 100%')
        expect(block).toContain('min-height: 0')
        expect(block).toContain('overflow: hidden')
        // PDF 容器共用同一条规则
        expect(workspace).toMatch(/#html-containers,\s*#pdf-containers/)
    })

    it('should keep min-height:0 on viewer shell and content wrapper (flex shrinking)', () => {
        expect(selectorBlock(shell, '.file-viewer-shell')).toContain('min-height: 0')
        const wrapper = selectorBlock(shell, '.file-viewer-content-wrapper')
        expect(wrapper).toContain('min-height: 0')
        expect(wrapper).toContain('overflow: hidden')
    })

    it('should allow iframe and pdf canvas scroll area to shrink and scroll internally', () => {
        expect(selectorBlock(htmlView, '.html-iframe')).toContain('min-height: 0')
        const pdfScroll = selectorBlock(pdfView, '.pdf-canvas-scroll')
        expect(pdfScroll).toContain('min-height: 0')
        expect(pdfScroll).toContain('overflow: auto')
    })
})

describe('编辑器底部布局契约（用户反馈：页面满时回车后光标被状态栏遮挡）', () => {
    it('should let the workspace height follow flex layout instead of a hard-coded 100vh calc', () => {
        const block = selectorBlock(baiZeNotes, '.workspace-area')
        expect(block).toContain('flex: 1 1 auto')
        expect(block).toContain('min-height: 0')
        expect(block).toContain('height: auto')
        expect(block).not.toContain('100vh')
        // 状态栏不得被 flex 压缩，否则会覆盖编辑器底部
        expect(selectorBlock(baiZeNotes, '.status-bar')).toContain('flex-shrink: 0')
    })

    it('should fill markdown editor height from its flex parent, not viewport height', () => {
        const block = selectorBlock(markdownContainer, '#md-edit-component')
        expect(block).toContain('flex: 1 1 auto')
        expect(block).toContain('min-height: 0')
        expect(block).toContain('height: auto')
        expect(markdownContainer).not.toContain('height: calc(100vh')
        expect(selectorBlock(workspace, '#md-container')).toContain('height: 100%')
        expect(selectorBlock(workspace, '#md-container')).toContain('min-height: 0')
    })

    it('should keep one-line breathing room below the last line and reveal the cursor line', () => {
        expect(editorOptions).toContain('scrollBeyondLastLine: true')
        expect(editorOptions).toMatch(/padding:\s*\{[^}]*bottom:\s*20[^}]*\}/s)
        expect(monacoEditor).toContain('revealCursorLineWithBreathingRoom')
        expect(monacoEditor).toContain('revealLineInCenterIfOutsideViewport')
        expect(monacoEditor).toContain('requestAnimationFrame(revealCursorLineWithBreathingRoom)')
    })
})
