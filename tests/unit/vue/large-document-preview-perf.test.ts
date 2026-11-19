// @vitest-environment jsdom
/**
 * 大文档预览渲染性能回归（P1 性能基线化）。
 *
 * 只做「宽松阈值」防退化断言，不追求精确基准：
 * - 样本：≈50KB+ Markdown / 500 个二级标题 + 段落 + 代码块（贴近长笔记/文档大纲场景）；
 * - 链路：MarkdownPreviewComponent 真实预览链路（真实 markdown-it 插件链 + DOMPurify +
 *   v-html DOM 写入；仅 hemy-editor-render 的异步图表门面 mock 为直通，避免 mermaid/PlantUML
 *   在 jsdom 中不可用）；
 * - 阈值：初次渲染与内容变更后的重渲染均要求 < 8000ms（宽松上限，只为捕获数量级退化）。
 *
 * 说明：耗时来自 jsdom + CI 机器，波动较大；阈值特意留出 5~10 倍余量，避免偶发抖动误报。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@renderer/components/Markdown/hemy-editor-render', () => ({
    PreMarkdownRender: async (text: string) => text,
    PostMarkdownRender: (text: string) => text,
    ParserMarkdownChapters: () => undefined
}))

import MarkdownPreviewComponent from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import {
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'

/** 大文档预览渲染宽松耗时上限（毫秒）：捕获数量级退化，不用于精确基准 */
const LARGE_DOC_RENDER_BUDGET_MS = 8000
/** 样本标题数（任务口径：500 标题） */
const HEADING_COUNT = 500

/** 构造 ≈50KB、500 个二级标题的 Markdown 样本 */
function buildLargeMarkdown(): string {
    const blocks: string[] = []
    for (let index = 1; index <= HEADING_COUNT; index += 1) {
        blocks.push(`## 第 ${index} 节：性能基线样本标题 ${index}`)
        blocks.push('')
        blocks.push(
            `第 ${index} 节正文：包含 **加粗**、*斜体*、\`inline code\` 与 [链接](https://example.com/${index})，用于模拟长笔记的常见行内结构。`
        )
        blocks.push('')
        blocks.push('```js')
        blocks.push(`const section${index} = { index: ${index}, name: 'section-${index}' }`)
        blocks.push('```')
        blocks.push('')
    }
    return blocks.join('\n')
}

/** 等待预览渲染出指定数量标题（轮询，直到超时） */
async function waitForHeadings(
    wrapper: ReturnType<typeof mount>,
    expected: number,
    timeoutMs = 20000
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        await flushPromises()
        if (wrapper.findAll('h2').length >= expected) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(
        `等待预览渲染 ${expected} 个标题超时（当前 ${wrapper.findAll('h2').length} 个，` +
            `耗时上限 ${timeoutMs}ms）`
    )
}

describe('大文档预览渲染性能（50KB+/500 标题，宽松阈值）', () => {
    let wrapper: ReturnType<typeof mount> | null = null

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    function setupEnv(): void {
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
        setPreviewActiveFilePath(null)
        setPreviewAllowRemoteImages(false)
    }

    it('初次渲染 500 标题大文档：耗时低于宽松阈值且全部标题进入 DOM', async () => {
        setupEnv()
        const markdown = buildLargeMarkdown()
        // 样本规模护栏：确保覆盖「50KB 级大文档」而非小样本
        expect(markdown.length).toBeGreaterThan(50 * 1024)
        expect((markdown.match(/^## /gm) ?? []).length).toBe(HEADING_COUNT)

        const startedAt = performance.now()
        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent: markdown, active: true },
            attachTo: document.body
        })
        // 预览内部有 150ms 防抖，先等首个渲染周期，再轮询标题数量
        await new Promise((resolve) => setTimeout(resolve, 180))
        await waitForHeadings(wrapper, HEADING_COUNT)
        const elapsedMs = performance.now() - startedAt

        // 宽松阈值断言：捕获数量级退化（jsdom 环境实测远低于该值）
        expect(elapsedMs).toBeLessThan(LARGE_DOC_RENDER_BUDGET_MS)
        expect(wrapper.findAll('h2')).toHaveLength(HEADING_COUNT)
        expect(wrapper.text()).toContain('第 500 节：性能基线样本标题 500')
        expect(wrapper.findAll('pre').length).toBeGreaterThanOrEqual(HEADING_COUNT)
    }, 30_000)

    it('大文档内容变更后的重渲染：耗时同样低于宽松阈值', async () => {
        setupEnv()
        const markdown = buildLargeMarkdown()
        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent: markdown, active: true },
            attachTo: document.body
        })
        await new Promise((resolve) => setTimeout(resolve, 180))
        await waitForHeadings(wrapper, HEADING_COUNT)

        // 修改全部标题文本（模拟大纲结构变化后的整篇重渲染）
        const updatedMarkdown = markdown.replace(/性能基线样本标题/g, '性能基线复测标题')
        const startedAt = performance.now()
        await wrapper.setProps({ editorContent: updatedMarkdown })
        await new Promise((resolve) => setTimeout(resolve, 180))
        await waitForHeadings(wrapper, HEADING_COUNT)
        const elapsedMs = performance.now() - startedAt

        expect(elapsedMs).toBeLessThan(LARGE_DOC_RENDER_BUDGET_MS)
        expect(wrapper.text()).toContain('第 500 节：性能基线复测标题 500')
        expect(wrapper.findAll('h2')).toHaveLength(HEADING_COUNT)
    }, 30_000)
})
