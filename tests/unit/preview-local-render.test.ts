/**
 * preview-local-render.ts 单元测试（PF-02：预览渲染单跳重构）
 *
 * 覆盖：
 * 1. HemyRenderPreLocal：围栏代码块保护（含嵌套/任意语言）、admonition/tabbed/KaTeX
 *    变换管道、单片段渲染失败降级为原文、图片/文件相对 URL 绝对化（含 FUN-22 安全白名单）；
 * 2. HemyRenderPostLocal：后处理入口（当前为恒等变换）；
 * 3. IPC 零调用证据：完整本地渲染链路（PRE → mermaid/PlantUML → md.render → POST）
 *    渲染一次内容时 ipcRenderer.send 调用次数为 0；PlantUML 场景仅保留必要 invoke（恰好 1 次）。
 *
 * 说明：本文件 mock 掉 katex 以便控制渲染管道行为（追加标记 / 触发降级）；
 * KaTeX 真实输出格式由 katex-render.test.ts 覆盖。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import MarkdownIt from 'markdown-it'

const katexMock = vi.hoisted(() => ({
    renderToString: vi.fn()
}))

// mock katex：追加标记便于断言管道执行；含 BOOM 的内容抛错用于降级测试
vi.mock('katex', () => ({
    default: katexMock
}))

// mock mermaid：node 环境缺少 DOM，图表渲染结果由测试控制
const mermaidMock = vi.hoisted(() => ({
    render: vi.fn()
}))

vi.mock('mermaid', () => ({
    default: mermaidMock
}))

import {
    HemyRenderPreLocal,
    HemyRenderPostLocal,
    // P1-8：KaTeX 改为按需动态加载，用例前置显式加载一次（动态 import 会被 vi.mock 拦截）
    EnsurePreviewKatexLoaded,
    getPreviewActiveFilePath,
    resetPreviewLocalRenderState,
    setPreviewActiveFilePath,
    // PF-9：KaTeX LRU 缓存 + 超大文档降级
    GetKatexRenderCacheSize,
    IsLargePreviewDocument,
    KATEX_CACHE_MAX_ENTRIES,
    PREVIEW_LARGE_DOC_BYTE_THRESHOLD,
    PREVIEW_LARGE_DOC_LINE_THRESHOLD,
    // AS-9：远程图片隐私策略
    ApplyRemoteImagePolicy,
    getPreviewAllowRemoteImages,
    IsRemoteImageUrl,
    REMOTE_IMAGE_BLOCKED_CLASS,
    setPreviewAllowRemoteImages
} from '../../src/renderer/src/components/Markdown/preview-local-render'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import { PreMarkdownRender } from '../../src/renderer/src/components/Markdown/hemy-editor-render'
// 迁移（渲染层公共接口归位）：预览限制常量的数值真源（P2-1：简化档 256KiB / 1 万行）
import { PREVIEW_DEGRADE_FILE_SIZE, PREVIEW_DEGRADE_LINES } from '../../src/shared/constants/limits'
// 2026-11-20（file:// → app:// 迁移）：本地图片/链接在 app:// 模式下改走 app://local
import {
    resetAppProtocolStateForTesting,
    setAppProtocolActive
} from '../../src/shared/protocol/app-protocol'

/** 构造与 MarkdownPreviewComponent 等价的 markdown-it 实例（预览同款插件链，渲染链路一致性用） */
function createMarkdownIt(): InstanceType<typeof MarkdownIt> {
    return createPreviewMarkdownIt()
}

beforeEach(async () => {
    katexMock.renderToString.mockReset()
    katexMock.renderToString.mockImplementation((latex: string) => {
        if (latex.includes('BOOM')) {
            throw new Error('katex render failure')
        }
        return '<katex-pass>' + latex + '</katex-pass>'
    })
    mermaidMock.render.mockReset()
    resetPreviewLocalRenderState()
    // P1-8：KaTeX 已改为按需动态加载（vi.mock('katex') 拦截动态 import）；
    // 本文件验证同步预渲染管道的 KaTeX 分支，用例前置加载一次（加载后会话级复用）。
    await EnsurePreviewKatexLoaded('$x$')
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('HemyRenderPreLocal（原主进程 HemyRenderPre 变换）', () => {
    it('should process unprotected content through the render pipeline', () => {
        const result = HemyRenderPreLocal('hello $x^2$\n!!! note "t"\nx')
        // 本模块只做 KaTeX / URL 变换：admonition 语法保持原样，由 markdown-it 插件在渲染阶段解析
        expect(result).toContain('!!! note "t"')
        expect(result).not.toContain('admonition')
        // KaTeX 管道执行（mock 追加标记）
        expect(result).toContain('<katex-pass>x^2</katex-pass>')
    })

    it('should keep code fences intact with surrounding newlines (regression)', () => {
        // 旧实现按行分段后 join('') 会吞掉分段边界换行符，导致 markdown-it 不再识别围栏
        const input = 'before\n```js\nlet a = 1\n```\nafter'
        expect(HemyRenderPreLocal(input)).toBe(input)

        // 空白分隔、缩进围栏、未闭合围栏均原样保留
        const indented = [
            '!!! Success "标题"',
            '    === "C"',
            '        ```c',
            '        int x;',
            '        ```',
            '',
            '后文 $a^2$'
        ].join('\n')
        const rendered = HemyRenderPreLocal(indented)
        expect(rendered).toContain('        ```c\n        int x;\n        ```')
        expect(rendered).toContain('后文 <katex-pass>a^2</katex-pass>')
    })

    it('should render code fences correctly after md.render (end-to-end regression)', () => {
        const md = createMarkdownIt()
        const html = md.render(HemyRenderPreLocal('before\n```js\nlet a = 1\n```\nafter'))

        expect(html).toContain('<code class="hljs language-js">')
        expect(html).not.toContain('```')
        expect(html).toContain('<p>before</p>')
        expect(html).toContain('<p>after</p>')
    })

    it('should keep ```markdown protected blocks unrendered', () => {
        const result = HemyRenderPreLocal('```markdown\n$x^2$\n!!! note "raw"\n```\n数学 $a^2$')
        // 保护块内公式与 !!! 语法保持原文，不产生 admonition/katex HTML
        expect(result).toContain('```markdown\n$x^2$\n!!! note "raw"\n```')
        expect(result).not.toContain('admonition')
        // 块后的普通内容仍被渲染管道处理
        expect(result).toContain('<katex-pass>a^2</katex-pass>')
    })

    it('should support nested code blocks inside a protected block', () => {
        const input = '```text\nouter\n```js\ninner\n```\n```'
        expect(HemyRenderPreLocal(input)).toBe(input)
    })

    it('should protect any fenced code block, not only text/markdown (FUN-22)', () => {
        // 任意语言的围栏代码块（如 js）中的链接语法不被预渲染改写
        const result = HemyRenderPreLocal('```js\n![alt](img.png)\n[link](a.md)\n```')
        expect(result).toContain('![alt](img.png)')
        expect(result).toContain('[link](a.md)')
        expect(result).not.toContain('<img')
        expect(result).not.toContain('<a href=')
    })

    it('should fall back to the original text when a segment fails to render (FUN-08)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // 模拟极端渲染失败：katex 返回无法字符串化的伪值，异常穿透到片段级 try/catch
        katexMock.renderToString.mockReturnValue({
            toString: () => {
                throw new Error('mock render failure')
            }
        })
        expect(HemyRenderPreLocal('$boom$')).toBe('$boom$')
        expect(warnSpy).toHaveBeenCalled()
    })
})

describe('HemyRenderPreLocal 图片/文件 URL 绝对化（原主进程 appState 逻辑迁移）', () => {
    it('should convert relative image URLs to absolute file URLs', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        expect(getPreviewActiveFilePath()).toBe('C:\\notes\\dir\\file.md')
        const result = HemyRenderPreLocal('![alt](./img/a.png)')
        expect(result).toContain(
            '<p><img style="width: auto; max-width: 900px; height: auto" src="file:///C:/notes/dir/img/a.png" alt="alt"></p>'
        )
    })

    it('should convert relative file links to absolute links', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        expect(HemyRenderPreLocal('[doc](./a.md)')).toContain(
            '<a href="file:///C:/notes/dir/a.md">doc</a>'
        )
    })

    it('should leave http links unchanged', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        const result = HemyRenderPreLocal('[x](http://example.com/a)')
        expect(result).toContain('[x](http://example.com/a)')
        expect(result).not.toContain('<a href=')
    })

    it('should keep relative links untouched when no active file is open', () => {
        // 默认无活动文件（resetPreviewLocalRenderState 后）
        expect(HemyRenderPreLocal('[doc](./a.md)')).toContain('<a href="./a.md">doc</a>')
    })

    it('should keep links with unsafe protocols as raw markdown (FUN-22)', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        const result = HemyRenderPreLocal('[d](data:text/plain,hello)')
        expect(result).toContain('[d](data:text/plain,hello)')
        expect(result).not.toContain('<a href=')
    })

    it('should keep anchor links unchanged (FUN-22)', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        const result = HemyRenderPreLocal('[go](#section)')
        expect(result).toContain('[go](#section)')
        expect(result).not.toContain('<a href=')
    })

    it('should keep images with unsafe protocols as raw markdown (FUN-22)', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        const result = HemyRenderPreLocal('![x](javascript:alert(1))')
        expect(result).toContain('![x](javascript:alert(1))')
        expect(result).not.toContain('<img')
    })
})

describe('app:// 模式：本地图片/链接改走 app://local（2026-11-20 file:// → app:// 迁移）', () => {
    afterEach(() => {
        resetAppProtocolStateForTesting()
    })

    it('相对图片 → app://local/<绝对路径>（协议 handler 经 Path Guard 读取）', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        setAppProtocolActive(true)
        const result = HemyRenderPreLocal('![alt](./img/a.png)')
        expect(result).toContain('src="app://local/C:/notes/dir/img/a.png"')
    })

    it('相对文件链接 → app://local/<绝对路径>', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        setAppProtocolActive(true)
        expect(HemyRenderPreLocal('[doc](./a.md)')).toContain(
            '<a href="app://local/C:/notes/dir/a.md">doc</a>'
        )
    })

    it('用户 Markdown 中 file:// 绝对引用保持原始 FUN-22 安全口径（不引入行为变化）', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        setAppProtocolActive(true)
        // file: 不在 SAFE_URL_PROTOCOLS 白名单内，迁移前后都保持 Markdown 原文
        const result = HemyRenderPreLocal('![pic](file:///C:/notes/dir/img/b.png)')
        expect(result).toContain('![pic](file:///C:/notes/dir/img/b.png)')
        expect(result).not.toContain('<img')
    })

    it('app:// 模式下 http 链接与非文件协议仍保持原行为', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        setAppProtocolActive(true)
        expect(HemyRenderPreLocal('[x](http://example.com/a)')).toContain(
            '[x](http://example.com/a)'
        )
        expect(HemyRenderPreLocal('[d](data:text/plain,hello)')).toContain(
            '[d](data:text/plain,hello)'
        )
    })

    it('开关复位后回到 file:// 口径（dev server 兼容）', () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        setAppProtocolActive(true)
        expect(HemyRenderPreLocal('![alt](./img/a.png)')).toContain('app://local/')
        resetAppProtocolStateForTesting()
        expect(HemyRenderPreLocal('![alt](./img/a.png)')).toContain(
            'src="file:///C:/notes/dir/img/a.png"'
        )
    })
})

describe('HemyRenderPostLocal（原主进程 HemyRenderPost 变换）', () => {
    it('should return the html unchanged (postRender 恒等实现)', () => {
        const html = '<div class="admonition note">x</div>'
        expect(HemyRenderPostLocal(html)).toBe(html)
        expect(HemyRenderPostLocal('')).toBe('')
    })
})

describe('PF-02 单跳链路：渲染一次内容的 IPC 调用次数', () => {
    let ipcRenderer: {
        send: ReturnType<typeof vi.fn>
        invoke: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
        ipcRenderer = { send: vi.fn(), invoke: vi.fn() }
        vi.stubGlobal('window', { electron: { ipcRenderer } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    /** 与 MarkdownPreviewComponent 一致的本地单链路（无 PRE_RENDER/POST_RENDER IPC） */
    async function runLocalPipeline(content: string): Promise<string> {
        const md = createMarkdownIt()
        const pre = HemyRenderPreLocal(content)
        const rendered = await PreMarkdownRender(pre)
        const html = md.render(rendered)
        return HemyRenderPostLocal(html)
    }

    it('should not call ipcRenderer.send/invoke when rendering markdown-only content', async () => {
        setPreviewActiveFilePath('C:\\notes\\dir\\file.md')
        const content = [
            '# 标题',
            '',
            '行内公式 $x^2$',
            '',
            '!!! note "提示"',
            '    这是内容',
            '',
            '=== "页甲"',
            '    第一页内容',
            '',
            '![alt](./img/a.png)',
            '',
            '[文档](./a.md)'
        ].join('\n')

        const html = await runLocalPipeline(content)

        // 变换结果贯穿完整链路
        expect(html).toContain('<h1>标题</h1>')
        expect(html).toContain('<katex-pass>')
        expect(html).toContain('admonition note')
        expect(html).toContain('tabbed-set tabbed-alternate')
        expect(html).toContain('src="file:///C:/notes/dir/img/a.png"')
        expect(html).toContain('<a href="file:///C:/notes/dir/a.md">文档</a>')

        // PF-02 核心证据：预览渲染单跳后不再有任何主进程 IPC 调用
        expect(ipcRenderer.send).toHaveBeenCalledTimes(0)
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(0)
    })

    it('should keep only the necessary PlantUML invoke (1 次) and no send', async () => {
        ipcRenderer.invoke.mockResolvedValue({ status: 'ok', svg: '<svg>PLANTUML-SVG</svg>' })
        const content = 'before\n```plantuml\n@startuml\nAlice -> Bob\n@enduml\n```\nafter'

        const html = await runLocalPipeline(content)

        expect(html).toContain('before')
        expect(html).toContain('after')
        // PlantUML 本地渲染保留必要 IPC（图表渲染资源依赖），且仅调用一次；无主进程渲染 send
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1)
        expect(ipcRenderer.invoke.mock.calls[0][0]).toBe('baize:render:plantuml-local')
        expect(ipcRenderer.send).toHaveBeenCalledTimes(0)
    })
})

describe('PF-9 KaTeX LRU 缓存', () => {
    it('should reuse cached KaTeX html for the same formula across renders', () => {
        const first = HemyRenderPreLocal('公式 $x^2$ 结尾')
        const second = HemyRenderPreLocal('公式 $x^2$ 结尾')

        expect(first).toBe(second)
        // 同一公式渲染两轮，katex 只调用一次（第二轮命中 LRU 缓存）
        expect(katexMock.renderToString).toHaveBeenCalledTimes(1)
        expect(GetKatexRenderCacheSize()).toBe(1)
    })

    it('should keep the cache bounded by KATEX_CACHE_MAX_ENTRIES and evict the least recently used', () => {
        for (let index = 0; index < KATEX_CACHE_MAX_ENTRIES; index += 1) {
            HemyRenderPreLocal(`$f_{${index}}$`)
        }
        expect(GetKatexRenderCacheSize()).toBe(KATEX_CACHE_MAX_ENTRIES)

        // 再渲染一个新公式：超出上限，淘汰最早条目，条目数保持上限
        HemyRenderPreLocal('$overflow$')
        expect(GetKatexRenderCacheSize()).toBe(KATEX_CACHE_MAX_ENTRIES)

        // 最早写入的 f_0 已被淘汰 → 重新渲染会再次调用 katex
        katexMock.renderToString.mockClear()
        HemyRenderPreLocal('$f_{0}$')
        expect(katexMock.renderToString).toHaveBeenCalledTimes(1)
    })

    it('should not cache failed formulas (invalid formula degrades every time)', () => {
        // 非法公式在 renderMathInText 内降级为原 latex 文本（不带 $ 定界符，保持既有 FUN-08 行为）
        const first = HemyRenderPreLocal('$BOOM$')
        const second = HemyRenderPreLocal('$BOOM$')
        expect(first).toContain('BOOM')
        expect(first).not.toContain('<katex-pass>')
        expect(second).toBe(first)
        // 失败结果不写缓存
        expect(GetKatexRenderCacheSize()).toBe(0)
    })
})

describe('PF-9 / P2-1 大文档分级降级', () => {
    it('should detect large documents by estimated bytes or line count', () => {
        // 迁移（渲染层公共接口归位）：本地导出常量必须与 shared 数值真源同值
        // P2-1：阈值由 2MiB/5 万行下调为 256KiB/1 万行（200KB~1MB 档纳入降级保护）
        expect(PREVIEW_LARGE_DOC_BYTE_THRESHOLD).toBe(PREVIEW_DEGRADE_FILE_SIZE)
        expect(PREVIEW_LARGE_DOC_LINE_THRESHOLD).toBe(PREVIEW_DEGRADE_LINES)
        expect(IsLargePreviewDocument('')).toBe(false)
        expect(IsLargePreviewDocument('# 普通短文档\n正文 $x^2$')).toBe(false)
        // 纯 ASCII 超过字节阈值
        expect(IsLargePreviewDocument('a'.repeat(PREVIEW_LARGE_DOC_BYTE_THRESHOLD + 1))).toBe(true)
        // 行数超过行数阈值（单行较短，但行数 1 万+）
        expect(IsLargePreviewDocument('x\n'.repeat(PREVIEW_LARGE_DOC_LINE_THRESHOLD + 1))).toBe(
            true
        )
        // 中文按 UTF-8 3 字节估算：约 8.7 万汉字即超过 256KiB
        expect(
            IsLargePreviewDocument(
                '中'.repeat(Math.ceil(PREVIEW_LARGE_DOC_BYTE_THRESHOLD / 3) + 10)
            )
        ).toBe(true)
    })

    it('should skip KaTeX rendering automatically for large documents', () => {
        // 超行数阈值的大文档，内含一个公式：自动降级为跳过 KaTeX（公式保持原文）
        const largeContent = '$x^2$\n' + '# 标题\n'.repeat(PREVIEW_LARGE_DOC_LINE_THRESHOLD + 10)
        const result = HemyRenderPreLocal(largeContent)

        expect(katexMock.renderToString).not.toHaveBeenCalled()
        expect(result).toContain('$x^2$')
    })

    it('should allow explicit skipKatex option to override auto detection', () => {
        const result = HemyRenderPreLocal('公式 $x^2$', { skipKatex: true })
        expect(katexMock.renderToString).not.toHaveBeenCalled()
        expect(result).toContain('$x^2$')

        // 显式 false 时小文档正常渲染公式
        resetPreviewLocalRenderState()
        const rendered = HemyRenderPreLocal('公式 $x^2$', { skipKatex: false })
        expect(rendered).toContain('<katex-pass>x^2</katex-pass>')
    })

    it('should skip mermaid/PlantUML diagrams in PreMarkdownRender when large doc degraded', async () => {
        const content = '前置\n```mermaid\ngraph TD\nA-->B\n```\n后置'
        const result = await PreMarkdownRender(content, { skipDiagrams: true })

        // 图表源码原样保留（交给 markdown-it 按代码块高亮），不做 mermaid 渲染
        expect(result).toBe(content)
        expect(mermaidMock.render).not.toHaveBeenCalled()
    })
})

/* ==================== AS-9：远程图片隐私策略（默认不加载远程图片） ====================
 * 输入为 DOMPurify 消毒后的 HTML（属性统一双引号序列化）；这里直接构造等价形态，
 * 验证「默认拦截且不保留原始 URL / 本地与 data 图片不受影响 / 开启后原样放行」。
 */
describe('AS-9 远程图片隐私策略', () => {
    const BLOCKED_LABEL = '远程图片已拦截（可在设置中开启加载）'

    it('should default to blocking remote images (safe default)', () => {
        expect(getPreviewAllowRemoteImages()).toBe(false)

        const html = '<p><img src="https://tracking.example/pixel" alt="追踪像素"></p>'
        const output = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })

        expect(output).toContain(REMOTE_IMAGE_BLOCKED_CLASS)
        expect(output).not.toContain('<img')
        // 原始 URL 不写入任何属性（src/srcset/data-* 均不保留），浏览器不会发起请求
        expect(output).not.toContain('https://tracking.example/pixel')
        expect(output).not.toContain('src=')
        expect(output).not.toContain('srcset')
        expect(output).toContain(BLOCKED_LABEL)
        // alt 文本作为占位提示保留，便于用户识别被拦截的图片
        expect(output).toContain('追踪像素')
    })

    it('should keep the html unchanged when remote images are allowed', () => {
        const html = '<p><img src="https://tracking.example/pixel" alt="pixel"></p>'
        expect(ApplyRemoteImagePolicy(html, { allowRemoteImages: true })).toBe(html)

        // 模块级策略（系统设置同步而来）为 true 时同样放行
        setPreviewAllowRemoteImages(true)
        expect(getPreviewAllowRemoteImages()).toBe(true)
        expect(ApplyRemoteImagePolicy(html)).toBe(html)
    })

    it('should reset the module-level policy back to the safe default', () => {
        setPreviewAllowRemoteImages(true)
        resetPreviewLocalRenderState()
        expect(getPreviewAllowRemoteImages()).toBe(false)
    })

    it('should block http / https / protocol-relative / backslash-escaped URLs', () => {
        const cases = [
            '<img src="http://tracking.example/p.png">',
            '<img src="https://tracking.example/p.png">',
            '<img src="//tracking.example/p.png">',
            '<img src="HTTPS://tracking.example/p.png">',
            // 浏览器把特殊协议中的反斜杠当斜杠：http:\/\/host 等价 http://host
            '<img src="http:\\/\\/tracking.example/p.png">'
        ]
        for (const html of cases) {
            const output = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })
            expect(output, html).toContain(REMOTE_IMAGE_BLOCKED_CLASS)
            expect(output, html).not.toContain('<img')
        }
    })

    it('should still catch remote images whose earlier attribute contains ">"', () => {
        // 属性值里的 ">" 不应截断标签匹配（否则后的 src 会漏检）
        const html = '<img alt="a> b" src="https://tracking.example/p.png">'
        const output = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })

        expect(output).not.toContain('<img')
        expect(output).not.toContain('tracking.example')
        expect(output).toContain('a&gt; b')
    })

    it('should leave local / relative / data: images untouched', () => {
        const cases = [
            '<p><img src="./img/a.png" alt="相对路径"></p>',
            '<p><img src="/home/user/img/a.png" alt="绝对路径"></p>',
            '<p><img src="C:/notes/img/a.png" alt="盘符路径"></p>',
            '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="data URI"></p>',
            '<p><img src="blob:file:///local-object" alt="blob"></p>'
        ]
        for (const html of cases) {
            expect(ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL }), html).toBe(html)
        }
    })

    it('should block images whose srcset contains any remote candidate', () => {
        const remoteSrcset =
            '<img src="local.png" srcset="https://t.example/p.png 1x, ./local2.png 2x">'
        expect(ApplyRemoteImagePolicy(remoteSrcset, { blockedLabel: BLOCKED_LABEL })).not.toContain(
            '<img'
        )

        // 纯本地 srcset 不受影响
        const localSrcset = '<img src="local.png" srcset="./local2.png 2x">'
        expect(ApplyRemoteImagePolicy(localSrcset, { blockedLabel: BLOCKED_LABEL })).toBe(
            localSrcset
        )

        // data: URI 候选（逗号拆段 + base64 含 //）不得误判为远程
        const dataSrcset = '<img srcset="data:image/png;base64,AAAA//BBBB 1x">'
        expect(ApplyRemoteImagePolicy(dataSrcset, { blockedLabel: BLOCKED_LABEL })).toBe(dataSrcset)
    })

    it('should strip remote srcset from <picture> sources', () => {
        const html =
            '<picture><source srcset="https://t.example/p.png 1x"><img src="./local.png"></picture>'
        const output = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })

        expect(output).not.toContain('https://t.example')
        // source 元素保留但远程 srcset 被剥离；本地 img 正常保留
        expect(output).toContain('<source>')
        expect(output).toContain('src="./local.png"')
    })

    it('should strip remote loads from svg image / video poster / input / background / inline style', () => {
        const html = [
            '<svg><image href="https://t.example/i.png"></image></svg>',
            '<svg><image xlink:href="https://t.example/i2.png"></image></svg>',
            '<svg><filter id="f"><feImage href="https://t.example/i3.png"></feImage></filter></svg>',
            '<video poster="https://t.example/p.png"></video>',
            '<input type="image" src="https://t.example/btn.png">',
            '<table background="https://t.example/bg.png"><tbody><tr><td>x</td></tr></tbody></table>',
            '<div style="background-image:url(https://t.example/bg.png)">x</div>',
            '<div style="background-image:url(\'//t.example/bg.png\')">y</div>',
            // CSS 转义伪装的远程 URL（\68 → h）
            '<div style="background:url(\\68 ttps://t.example/bg.png)">z</div>',
            // HTML 实体包裹的引号（DOMPurify 序列化 style 属性值时会这样转义）
            '<div style="background:url(&quot;https://t.example/bg.png&quot;)">w</div>'
        ].join('')
        const output = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })

        expect(output).not.toContain('https://t.example')
        expect(output).not.toContain('//t.example')
        // 只剥离命中属性、保留元素本身，不破坏文档结构
        expect(output).toContain('<svg>')
        expect(output).toContain('<video></video>')
        expect(output).toContain('<input type="image">')
        expect(output).toContain('<table')
    })

    it('should remove SVG <style> blocks that reference remote images', () => {
        const remoteStyle =
            '<svg><style>@import url(https://t.example/x.css); rect{background:url(https://t.example/p.png)}</style><rect></rect></svg>'
        const output = ApplyRemoteImagePolicy(remoteStyle, { blockedLabel: BLOCKED_LABEL })
        expect(output).not.toContain('https://t.example')
        expect(output).not.toContain('<style')

        // 只引用本地渐变（url(#id)）的 SVG 样式保持原样（mermaid 产物）
        const localStyle = '<svg><style>.a{fill:url(#grad)}</style><rect></rect></svg>'
        expect(ApplyRemoteImagePolicy(localStyle, { blockedLabel: BLOCKED_LABEL })).toBe(localStyle)
    })

    it('should keep local inline styles and ordinary styles untouched', () => {
        const localBackground = '<div style="background-image:url(./local.png)">x</div>'
        expect(ApplyRemoteImagePolicy(localBackground, { blockedLabel: BLOCKED_LABEL })).toBe(
            localBackground
        )

        // KaTeX 产物常见的内联样式（无 url()）必须原样保留
        const katexStyle = '<span style="height:1.2em;vertical-align:-0.3em">x</span>'
        expect(ApplyRemoteImagePolicy(katexStyle, { blockedLabel: BLOCKED_LABEL })).toBe(katexStyle)
    })

    it('should HTML-escape alt text in the placeholder (no XSS via alt)', () => {
        const html =
            '<img src="https://t.example/p.png" alt="&lt;script&gt;alert(1)&lt;/script&gt;">'
        const output = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })

        expect(output).not.toContain('<script>')
        expect(output).toContain('&lt;script&gt;')
    })

    it('should be idempotent (placeholder is not rewritten on a second pass)', () => {
        const html = '<p><img src="https://t.example/p.png" alt="p"></p>'
        const once = ApplyRemoteImagePolicy(html, { blockedLabel: BLOCKED_LABEL })
        expect(ApplyRemoteImagePolicy(once, { blockedLabel: BLOCKED_LABEL })).toBe(once)
    })

    it('should classify URLs like a browser (protocol-relative / backslash / data: / local)', () => {
        for (const url of [
            'https://tracking.example/p',
            'http://tracking.example/p',
            'HTTPS://tracking.example/p',
            '//tracking.example/p',
            'http:\\/\\/tracking.example/p',
            '  https://tracking.example/p  '
        ]) {
            expect(IsRemoteImageUrl(url), url).toBe(true)
        }
        for (const url of [
            '',
            './img/a.png',
            '/home/user/img/a.png',
            'C:/notes/img/a.png',
            'data:image/png;base64,AAAA',
            'blob:file:///local',
            '#anchor',
            'images-http/a.png'
        ]) {
            expect(IsRemoteImageUrl(url), url).toBe(false)
        }
    })
})
