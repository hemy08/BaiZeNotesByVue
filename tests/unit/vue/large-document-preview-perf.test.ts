// @vitest-environment jsdom
/**
 * 大文档预览渲染性能回归（P1 性能基线化 / P2-1 分级降级）。
 *
 * 只做「宽松阈值」防退化断言，不追求精确基准：
 * - 样本：≈50KB+ Markdown / 500 个二级标题 + 段落 + 代码块（贴近长笔记/文档大纲场景）；
 * - 链路：MarkdownPreviewComponent 真实预览链路（真实 markdown-it 插件链 + DOMPurify +
 *   v-html DOM 写入；仅 hemy-editor-render 的异步图表门面 mock 为直通，避免 mermaid/PlantUML
 *   在 jsdom 中不可用）；
 * - 阈值：初次渲染与内容变更后的重渲染均要求 < 8000ms（宽松上限，只为捕获数量级退化）。
 * - P2-1：新增 200KB/1MB 档「纯管线」耗时预算（HemyRenderPreLocal + md.render + DOMPurify），
 *   并断言分级阈值命中（200KB→简化档、1MB→渐进档），捕获「阈值/净化策略被回退」的数量级退化。
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
    HemyRenderPreLocal,
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'
import { createPreviewMarkdownIt } from '@renderer/components/Markdown/preview-markdown-it'
import { createTabDeepLinkEnv } from '@renderer/components/Markdown/preview-mkdocs-material'
import { SanitizePreviewHtml } from '@renderer/components/Markdown/preview-sanitize'
import { ResolvePreviewRenderPlan } from '@renderer/components/Markdown/preview-large-doc'

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

/* ==================== P2-1：200KB / 1MB 纯管线耗时预算 ====================
 * 只测「预览渲染管线」本身（预渲染 + md.render + DOMPurify 整篇消毒），不测 DOM 插入，
 * 与 out/tool-results/scan-perf.md 的口径一致。阈值按 jsdom 实测的 8~12 倍设置，
 * 仅捕获数量级退化（例如降级策略失效导致 KaTeX/图表被全量渲染、返回全量消毒被去掉）。
 */
describe('P2-1 大文档预览管线耗时预算（200KB / 1MB）', () => {
    /** 构造指定字节规模的 Markdown 样本（标题/正文/代码围栏，贴近长笔记） */
    function buildSizedMarkdown(targetChars: number): string {
        const blocks: string[] = []
        let index = 0
        let size = 0
        while (size < targetChars) {
            index += 1
            const block = [
                `## 第 ${index} 节：大文档性能样本 ${index}`,
                '',
                `第 ${index} 节正文：包含 **加粗**、*斜体*、\`inline code\` 与 [链接](https://example.com/${index})。`,
                '',
                '```js',
                `const section${index} = { index: ${index} }`,
                '```',
                ''
            ].join('\n')
            blocks.push(block)
            size += block.length + 1
        }
        return blocks.join('\n')
    }

    /** 跑一轮纯管线并返回耗时（毫秒） */
    function runPreviewPipeline(source: string): number {
        const md = createPreviewMarkdownIt()
        const plan = ResolvePreviewRenderPlan(source)
        const startedAt = performance.now()
        const preRendered = HemyRenderPreLocal(source, { skipKatex: plan.skipKatex })
        const renderedHtml = md.render(preRendered, createTabDeepLinkEnv())
        SanitizePreviewHtml(renderedHtml)
        return performance.now() - startedAt
    }

    it('200KB 文档进入简化档，纯管线耗时低于宽松上限（jsdom 实测约 0.4s）', () => {
        const source = buildSizedMarkdown(200 * 1024)
        expect(ResolvePreviewRenderPlan(source).tier).toBe('degraded')
        expect(runPreviewPipeline(source)).toBeLessThan(5000)
    }, 60_000)

    it('1MB 文档进入渐进档，纯管线耗时低于宽松上限（jsdom 实测约 1.1s）', () => {
        const source = buildSizedMarkdown(1024 * 1024)
        expect(ResolvePreviewRenderPlan(source).tier).toBe('progressive')
        expect(runPreviewPipeline(source)).toBeLessThan(12_000)
    }, 120_000)
})
