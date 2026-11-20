// @vitest-environment jsdom
/**
 * P2-1 大文档渐进渲染（组件级）回归。
 *
 * 覆盖：
 * 1. 渐进档（>512KiB）首次渲染：防抖等待期间立即显示骨架屏（避免白屏），
 *    渲染完成后骨架被真实内容替换、全部标题进入 DOM（分块渐进补全正确性）；
 * 2. 渐进档显示降级提示条（跳过 KaTeX/图表）且确实未加载 KaTeX；
 * 3. 渲染链路仍走真实 markdown-it + DOMPurify（hemy-editor-render 仅图表门面 mock）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const renderMocks = vi.hoisted(() => ({
    PreMarkdownRender: vi.fn(),
    PostMarkdownRender: vi.fn(),
    ParserMarkdownChapters: vi.fn()
}))

vi.mock('@renderer/components/Markdown/hemy-editor-render', () => renderMocks)

import MarkdownPreviewComponent from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import {
    GetPreviewKatexLoadCount,
    resetPreviewLocalRenderState,
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'
import {
    ClearPreviewRenderCache,
    ResetPreviewRenderPlanCache
} from '@renderer/components/Markdown/preview-large-doc'

/** 渐进档样本大小：略超 512KiB 阈值 */
const PROGRESSIVE_SOURCE_CHARS = 520 * 1024

/** 构造大文档（每个块含标题/正文/代码围栏/公式，用于验证降级跳过 KaTeX） */
function buildMarkdown(targetChars: number): string {
    const blocks: string[] = []
    let index = 0
    let size = 0
    while (size < targetChars) {
        index += 1
        const block = [
            `## 第 ${index} 节：渐进渲染样本标题 ${index}`,
            '',
            `第 ${index} 节正文：包含 **加粗**、*斜体*、\`inline code\` 与行内公式 $x_{${index}}^2$，用于模拟长笔记的常见结构。`,
            '',
            '```js',
            `const section${index} = { index: ${index}, name: 'section-${index}' }`,
            '```',
            ''
        ].join('\n')
        blocks.push(block)
        size += block.length + 1
    }
    return blocks.join('\n')
}

/** 等待函数：轮询直到条件满足或超时 */
async function waitUntil(
    condition: () => boolean,
    timeoutMs: number,
    message: string
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        await flushPromises()
        if (condition()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`等待超时：${message}`)
}

describe('P2-1 大文档渐进渲染（组件级）', () => {
    let wrapper: ReturnType<typeof mount> | null = null

    beforeEach(() => {
        renderMocks.PreMarkdownRender.mockReset()
        renderMocks.PreMarkdownRender.mockImplementation(async (text: string) => text)
        renderMocks.PostMarkdownRender.mockReset()
        renderMocks.PostMarkdownRender.mockImplementation((text: string) => text)
        renderMocks.ParserMarkdownChapters.mockReset()
        resetPreviewLocalRenderState()
        setPreviewActiveFilePath(null)
        setPreviewAllowRemoteImages(false)
        ClearPreviewRenderCache()
        ResetPreviewRenderPlanCache()
        vi.stubGlobal('electron', {
            ipcRenderer: {
                on: vi.fn(),
                send: vi.fn(),
                invoke: vi.fn().mockResolvedValue(null),
                removeListener: vi.fn()
            }
        })
        vi.stubGlobal('api', {
            config: {
                read: vi.fn().mockResolvedValue(null),
                write: vi.fn().mockResolvedValue(true)
            }
        })
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('首次渲染：骨架屏立即出现 → 分块渐进补全 → 提示条与全部标题最终就绪', async () => {
        const markdown = buildMarkdown(PROGRESSIVE_SOURCE_CHARS)
        const expectedHeadings = (markdown.match(/^## /gm) ?? []).length
        // 样本规模护栏：必须进入渐进档（>512KiB）
        expect(markdown.length).toBeGreaterThan(512 * 1024)
        expect(expectedHeadings).toBeGreaterThan(1000)

        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent: markdown, active: true },
            attachTo: document.body
        })
        const root = document.getElementById('markdown-preview-html')
        expect(root).not.toBeNull()
        // 150ms 防抖 + 整篇渲染期间：应立即显示大文档骨架屏（避免白屏）
        await waitUntil(
            () => (root?.innerHTML ?? '').includes('preview-rendering-skeleton'),
            2000,
            '大文档骨架屏未出现'
        )
        expect(root!.textContent).toContain('正在渲染大文档')
        // 防抖尚未到期，渲染链路还没有开始
        expect(renderMocks.PreMarkdownRender).not.toHaveBeenCalled()

        // 等待渐进渲染完成：全部标题进入 DOM，骨架被真实内容替换
        await waitUntil(
            () => (root?.querySelectorAll('h2').length ?? 0) >= expectedHeadings,
            120_000,
            `渐进渲染未在超时内完成（当前 ${root?.querySelectorAll('h2').length ?? 0}/${expectedHeadings} 标题）`
        )
        expect(root!.querySelectorAll('h2')).toHaveLength(expectedHeadings)
        expect(root!.innerHTML).not.toContain('preview-rendering-skeleton')
        // 大文档降级提示条（渐进档文案）存在，说明公式/图表已跳过但正文正常渲染
        expect(root!.textContent).toContain('大文档分块渐进渲染')
        // 降级路径确实跳过了图表渲染，且没有加载 KaTeX（仅跳过高成本渲染，不绕过消毒）
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ skipDiagrams: true })
        )
        expect(GetPreviewKatexLoadCount()).toBe(0)
        // 代码围栏正常高亮（基础 Markdown 渲染未被降级破坏）
        expect(root!.querySelectorAll('pre code').length).toBeGreaterThan(0)
    }, 150_000)
})
