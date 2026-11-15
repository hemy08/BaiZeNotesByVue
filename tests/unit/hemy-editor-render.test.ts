import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import MarkdownIt from 'markdown-it'

// 模拟 mermaid：渲染结果由测试控制，避免 node 环境缺少 DOM
vi.mock('mermaid', () => ({
    default: { render: vi.fn() }
}))

import mermaid from 'mermaid'
import EventBus from '../../src/renderer/src/common/event-bus/event-bus'
import {
    PreMarkdownRender,
    ParserMarkdownChapters,
    PostMarkdownRender,
    preRenderPlantumlProc,
    resetPlantumlLocalRenderState
} from '../../src/renderer/src/components/Markdown/hemy-editor-render'

const renderMock = vi.mocked(mermaid.render)

describe('PostMarkdownRender', () => {
    it('should return the text unchanged', () => {
        expect(PostMarkdownRender('anything')).toBe('anything')
        expect(PostMarkdownRender('')).toBe('')
    })
})

describe('PreMarkdownRender', () => {
    beforeEach(() => {
        renderMock.mockReset()
        vi.stubGlobal('document', { getElementById: vi.fn(() => null) })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('should return the text unchanged when no mermaid block exists', async () => {
        const text = '# 标题\n\n普通内容\n'
        await expect(PreMarkdownRender(text)).resolves.toBe(text)
        expect(renderMock).not.toHaveBeenCalled()
    })

    it('should replace one mermaid block with the wrapped svg', async () => {
        renderMock.mockResolvedValue({ svg: '<svg>MOCK-SVG</svg>', diagramType: 'flowchart' })

        const text = 'before\n```mermaid\nA-->B\n```\nafter'
        const result = await PreMarkdownRender(text)

        expect(result).toContain('before')
        expect(result).toContain('after')
        expect(result).toContain('<pre class="mermaid">')
        expect(result).toContain('<svg>MOCK-SVG</svg>')
        expect(result).not.toContain('```mermaid')
        expect(renderMock).toHaveBeenCalledTimes(1)
        // 渲染 id 必须是 10 位随机数字组成
        expect(renderMock.mock.calls[0][0]).toMatch(/^mermaid\d{10}$/)
        expect(renderMock.mock.calls[0][1]).toBe('\nA-->B\n')
    })

    it('should render each distinct mermaid block once', async () => {
        renderMock.mockResolvedValue({ svg: '<svg>S</svg>', diagramType: 'flowchart' })

        const text = 'a\n```mermaid\nB1\n```\nb\n```mermaid\nB2\n```\nc'
        const result = await PreMarkdownRender(text)

        expect(renderMock).toHaveBeenCalledTimes(2)
        expect(result).toContain('a')
        expect(result).toContain('b')
        expect(result).toContain('c')
        // 两个块都被替换为 svg 包装
        expect(result.split('<pre class="mermaid">').length - 1).toBe(2)
    })

    it('should serve a re-rendered identical block from the cache', async () => {
        renderMock.mockResolvedValue({ svg: '<svg>CACHED</svg>', diagramType: 'flowchart' })

        const text = 'x\n```mermaid\nCACHE-ME\n```\ny'
        const first = await PreMarkdownRender(text)
        expect(renderMock).toHaveBeenCalledTimes(1)

        // 第二次渲染相同文本：缓存命中，不再调用 mermaid.render
        const second = await PreMarkdownRender(text)
        expect(renderMock).toHaveBeenCalledTimes(1)
        expect(second).toBe(first)
        expect(second).toContain('<pre class="mermaid">')
    })

    it('should not deduplicate identical blocks within one concurrent batch', async () => {
        // 同一次调用中的相同块是并发渲染的，缓存尚未写入，因此各自渲染一次
        renderMock.mockResolvedValue({ svg: '<svg>N</svg>', diagramType: 'flowchart' })

        const text = 'x\n```mermaid\nBATCH-SAME\n```\ny\n```mermaid\nBATCH-SAME\n```\nz'
        const result = await PreMarkdownRender(text)

        expect(renderMock).toHaveBeenCalledTimes(2)
        expect(result.split('<pre class="mermaid">').length - 1).toBe(2)
    })

    it('should fall back to source echo plus error message when rendering fails', async () => {
        renderMock.mockRejectedValue(new Error('render failed'))

        const text = 'before\n```mermaid\nBROKEN\n```\nafter'
        const result = await PreMarkdownRender(text)

        // FUN-21：渲染失败不再静默空白，回显源码与错误提示
        expect(result).toContain('before')
        expect(result).toContain('after')
        expect(result).not.toContain('```mermaid')
        expect(result).toContain('Mermaid 图表渲染失败')
        expect(result).toContain('BROKEN')
        expect(result).toContain('render failed')
    })
})

describe('ParserMarkdownChapters', () => {
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        emitSpy = vi.spyOn(EventBus, '$emit')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // markdown-it 的类类型需用 InstanceType 表达（`MarkdownIt` 是值而非类型，TS2749）
    function collectHeadings(md: InstanceType<typeof MarkdownIt>, text: string) {
        ParserMarkdownChapters(md, text)
        const call = emitSpy.mock.calls.find((c: unknown[]) => c[0] === 'monaco-editor-chapters')
        expect(call).toBeDefined()
        return call![1] as {
            id: string
            level: string
            text: string
            lineNumber: number
        }[]
    }

    it('should extract heading level, text, line number and stable id', () => {
        const md = new MarkdownIt()
        const headings = collectHeadings(md, '# A\n\n## B\n\n### C\n')

        expect(headings).toHaveLength(3)
        expect(headings.map((h) => h.level)).toEqual(['h1', 'h2', 'h3'])
        expect(headings.map((h) => h.text)).toEqual(['A', 'B', 'C'])
        // PF-14：map[0] 为标题起始行（0 起始），点击目录定位不再偏后
        expect(headings.map((h) => h.lineNumber)).toEqual([0, 2, 4])
        for (const heading of headings) {
            // PF-14：稳定 id = 文本 hash + 起始行号，跨渲染轮次不变
            expect(heading.id).toMatch(/^toc-[0-9a-f]+-\d+$/)
        }
    })

    it('should generate identical ids across repeated renders (PF-14)', () => {
        const md = new MarkdownIt()
        const text = '# 标题甲\n\n## 标题乙\n'
        const first = collectHeadings(md, text)
        const second = collectHeadings(md, text)

        expect(first.map((h) => h.id)).toEqual(second.map((h) => h.id))
        // 不同标题（行号不同）id 互不相同，保证 Vue key 唯一
        expect(new Set(first.map((h) => h.id)).size).toBe(first.length)
    })

    it('should concatenate only text children of inline headings', () => {
        const md = new MarkdownIt()
        const headings = collectHeadings(md, '# *加粗* 普通\n')

        expect(headings).toHaveLength(1)
        expect(headings[0].level).toBe('h1')
        expect(headings[0].text).toBe('加粗 普通')
    })

    it('should emit an empty heading list for text without headings', () => {
        const md = new MarkdownIt()
        const headings = collectHeadings(md, '只有正文，没有标题。\n')

        expect(headings).toHaveLength(0)
    })

    it('should decode entity-encoded HTML into raw text (P1/N-03：目录渲染层必须转义)', () => {
        const md = new MarkdownIt()
        const decoded = '<img src=x onerror=alert(1)>'

        // 命名实体：markdown-it 会在 text token 中把 `&lt;`/`&gt;` 解码成原始 `<`/`>`
        const entityHeadings = collectHeadings(md, '# &lt;img src=x onerror=alert(1)&gt;\n')
        expect(entityHeadings).toHaveLength(1)
        expect(entityHeadings[0].text).toBe(decoded)

        // 数字实体同样会被解码；该文本是不可信数据，ResourceManager 必须用文本插值/转义渲染
        emitSpy.mockClear()
        const numericHeadings = collectHeadings(md, '# &#60;img src=x onerror=alert(1)&#62;\n')
        expect(numericHeadings).toHaveLength(1)
        expect(numericHeadings[0].text).toBe(decoded)
    })
})

// PF-08：PlantUML 本地离线渲染接入（渲染层编排）测试
describe('PlantUML 本地离线渲染接入（PF-08）', () => {
    const invokeMock = vi.fn()
    const PLANTUML_CHANNEL = 'baize:render:plantuml-local'
    const plantumlFence = '```plantuml\n@startuml\nAlice->Bob : Hello\n@enduml\n```'

    beforeEach(() => {
        resetPlantumlLocalRenderState()
        invokeMock.mockReset()
        vi.stubGlobal('window', { electron: { ipcRenderer: { invoke: invokeMock } } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        resetPlantumlLocalRenderState()
    })

    it('should replace a ```plantuml fenced block with locally rendered svg', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>LOCAL-SVG</svg>' })

        const result = await preRenderPlantumlProc('before\n' + plantumlFence + '\nafter')

        expect(result).toContain('before')
        expect(result).toContain('after')
        expect(result).toContain('<svg>LOCAL-SVG</svg>')
        expect(result).toContain('class="plantuml-diagram"')
        expect(result).not.toContain('```plantuml')
        expect(invokeMock).toHaveBeenCalledTimes(1)
        // 通道常量与主进程 plantuml-local.ts 保持一致
        expect(invokeMock.mock.calls[0][0]).toBe(PLANTUML_CHANNEL)
        expect(String(invokeMock.mock.calls[0][1])).toContain('@startuml')
    })

    it('should replace a bare @startuml block locally (原 markdown-it-plantuml 远程形式)', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>BARE-SVG</svg>' })

        const text = '说明\n@startuml\nAlice -> Bob\n@enduml\n结束'
        const result = await preRenderPlantumlProc(text)

        expect(result).toContain('<svg>BARE-SVG</svg>')
        expect(result).not.toContain('@startuml')
    })

    it('should wrap fenced content without @start markers with @startuml/@enduml', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>WRAPPED</svg>' })

        await preRenderPlantumlProc('```plantuml\nAlice -> Bob\n```')

        expect(String(invokeMock.mock.calls[0][1])).toBe('@startuml\nAlice -> Bob\n@enduml')
    })

    it('should not render plantuml examples inside other fenced code blocks', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>SHOULD-NOT-APPEAR</svg>' })

        const text = '```text\n@startuml\nA->B\n@enduml\n```'
        const result = await preRenderPlantumlProc(text)

        expect(result).toBe(text)
        expect(invokeMock).not.toHaveBeenCalled()
    })

    it('should reuse the cached html for identical source', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>CACHED</svg>' })

        const first = await preRenderPlantumlProc(plantumlFence)
        invokeMock.mockClear()
        const second = await preRenderPlantumlProc(plantumlFence)

        expect(invokeMock).not.toHaveBeenCalled()
        expect(second).toBe(first)
        expect(second).toContain('<svg>CACHED</svg>')
    })

    it('should render identical blocks once within one batch', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>DEDUP</svg>' })

        const text = plantumlFence + '\n\n' + plantumlFence
        const result = await preRenderPlantumlProc(text)

        expect(invokeMock).toHaveBeenCalledTimes(1)
        expect(result.split('<svg>DEDUP</svg>').length - 1).toBe(2)
    })

    it('should keep original text when local renderer is unavailable (远程/代码块降级)', async () => {
        invokeMock.mockResolvedValue({ status: 'unavailable', reason: '资源缺失' })

        const text = 'a\n' + plantumlFence + '\nb'
        const result = await preRenderPlantumlProc(text)

        // 本地不可用：保留原文，裸块由 markdown-it-plantuml 远程渲染兜底
        expect(result).toBe(text)

        // 本次会话已确认不可用，后续批次不再尝试 IPC
        invokeMock.mockClear()
        const second = await preRenderPlantumlProc(
            'x\n```plantuml\n@startuml\nC->D\n@enduml\n```\ny'
        )
        expect(second).toContain('```plantuml')
        expect(invokeMock).not.toHaveBeenCalled()
    })

    it('should degrade gracefully when IPC invoke rejects (通道未接线)', async () => {
        invokeMock.mockRejectedValue(new Error('No handler registered for channel'))

        const result = await preRenderPlantumlProc(plantumlFence)

        expect(result).toBe(plantumlFence)
    })

    it('should keep text unchanged when window.electron is not exposed', async () => {
        vi.stubGlobal('window', {})

        const result = await preRenderPlantumlProc(plantumlFence)

        expect(result).toBe(plantumlFence)
    })

    it('should fall back to source echo plus error message when local render fails', async () => {
        invokeMock.mockResolvedValue({ status: 'error', message: '隐藏窗口渲染异常' })

        const result = await preRenderPlantumlProc(plantumlFence)

        expect(result).toContain('PlantUML 图表渲染失败')
        expect(result).toContain('Alice-&gt;Bob : Hello')
        expect(result).toContain('隐藏窗口渲染异常')
        expect(result).not.toContain('```plantuml')
    })

    it('should render plantuml before mermaid in PreMarkdownRender', async () => {
        invokeMock.mockResolvedValue({ status: 'ok', svg: '<svg>PLANTUML-SVG</svg>' })
        renderMock.mockResolvedValue({ svg: '<svg>MERMAID-SVG</svg>', diagramType: 'flowchart' })
        vi.stubGlobal('document', { getElementById: vi.fn(() => null) })

        const text =
            '```plantuml\n@startuml\nA -> B\n@enduml\n```\n\n```mermaid\ngraph TD; A-->B\n```'
        const result = await PreMarkdownRender(text)

        expect(result).toContain('<svg>PLANTUML-SVG</svg>')
        expect(result).toContain('<svg>MERMAID-SVG</svg>')
        expect(result).not.toContain('```plantuml')
        expect(result).not.toContain('```mermaid')
    })
})
