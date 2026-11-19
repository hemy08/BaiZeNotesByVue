/**
 * preview-local-render.ts
 * PF-02：Markdown 预览本地单跳渲染管线（渲染进程内完成，零 IPC 往返）。
 *
 * 背景：
 * 重构前预览链路为「渲染层 → 主进程 PRE_RENDER → 渲染层 mermaid/plantuml + md.render
 * → 主进程 POST_RENDER → 渲染层 v-html」四次 IPC 跳转，KaTeX 与 Material/TabbedSet
 * 字符串变换在主进程同步执行，会冻结主进程事件循环。
 *
 * 本模块把原 src/main/renders 下的纯字符串变换模块迁移到渲染层：
 *   - KatexRender.ts        → 第一节（KaTeX 公式渲染，渲染层 katex 包）
 *   - HemyRender.ts（PRE/POST 部分）→ 第二~四节（URL 转换、代码块保护、入口函数）
 * 这些变换均无 Node 专属依赖（仅依赖 katex，渲染层已依赖）。
 *
 * 语法解析职责划分（mkdocs-material 语法修复后）：
 *   - `!!! admonition` / `=== "标签"` tabbed set 已迁移到 markdown-it 原生 block 插件
 *     （`preview-mkdocs-material.ts`，由 `createPreviewMarkdownIt()` 注册）。本模块不再参与
 *     这两类语法的解析——预渲染阶段只做「与 Markdown 结构无关」的纯文本替换；
 *   - 这样 admonition 内嵌 tab、tab 内嵌代码围栏等嵌套组合由 markdown-it 自身递归解析，
 *     不再出现「HTML 字符串提前拼进 Markdown 导致围栏/内层语法失效」的问题。
 *
 * 管线（单链路，全部发生在渲染进程）：
 *   HemyRenderPreLocal(content)          // katex / 图片与文件 URL（admonition/tabbed 已交由 markdown-it）
 *   → editor.Render.PreMarkdownRender()  // PlantUML 本地 IPC 渲染 + mermaid 本地渲染（保持现状）
 *   → md.render()                        // markdown-it 全量解析 + highlight.js
 *   → HemyRenderPostLocal(html)          // 后处理（当前为恒等变换，保留 API 对等）
 *   → editor.Render.PostMarkdownRender() // 渲染层后处理（当前为恒等变换）
 *   → DOMPurify.sanitize()               // CMP-15：XSS 消毒
 *   → ApplyRemoteImagePolicy()           // AS-9：远程图片隐私策略（默认拦截，不发起网络请求）
 *   → v-html
 *
 * 说明：PlantUML 本地渲染仍保留必要的主进程 IPC（离线 teaVM 渲染依赖 resources 资源），
 * 属于图表渲染资源依赖，不计入 Markdown 文本流水线；mermaid 保持渲染层本地渲染。
 */

import katex from 'katex'
import { logger } from '../../common/logger'

/* ============================ 一、KaTeX 数学公式 ============================
 * 迁移自 src/main/renders/KatexRender.ts（纯字符串变换，无 Node 专属依赖）。
 * 支持：行内 $...$、块级 $$...$$、代码块 ```math/```katex/```latex。
 * PF-02：渲染位置由主进程改为渲染进程，使用渲染层已依赖的 katex 包与已有 katex CSS。
 */

/**
 * PF-9：KaTeX 渲染结果 LRU 缓存上限（以「公式字符串」为 key）。
 * 预览每轮整篇重渲染，正文未变时公式重复渲染是主要浪费（实测 0.08 ms/公式，
 * 500 公式 ≈ 40 ms/轮）；缓存后同一公式只在首次出现时调用 katex.renderToString。
 */
export const KATEX_CACHE_MAX_ENTRIES = 200
const katexHtmlCache = new Map<string, string>()

/**
 * 渲染单个公式（带 LRU 缓存）。非法公式会抛错，由调用方按各自语义降级。
 * 命中缓存时把条目移到 Map 末尾（最近使用），超出上限淘汰最久未用条目。
 */
function renderKatexCached(latex: string): string {
    const cached = katexHtmlCache.get(latex)
    if (cached !== undefined) {
        katexHtmlCache.delete(latex)
        katexHtmlCache.set(latex, cached)
        return cached
    }
    const html = katex.renderToString(latex)
    if (katexHtmlCache.size >= KATEX_CACHE_MAX_ENTRIES) {
        const oldestKey = katexHtmlCache.keys().next().value
        if (oldestKey !== undefined) {
            katexHtmlCache.delete(oldestKey)
        }
    }
    katexHtmlCache.set(latex, html)
    return html
}

/** 当前 KaTeX 缓存条目数（诊断/单元测试用） */
export function GetKatexRenderCacheSize(): number {
    return katexHtmlCache.size
}

/** 使用正则表达式渲染文本中的数学公式
 * @param text 原始文本
 * @param regex 匹配公式的正则表达式
 * @param isBlock 是否为块级公式
 * @returns 渲染后的文本
 */
function renderMathInText(text: string, regex: RegExp, isBlock: boolean): string {
    return text.replace(regex, (match, latex, offset) => {
        const beforeChar = text[offset - 1]
        const afterChar = text[offset + match.length]
        if (beforeChar === '`' || afterChar === '`') {
            return match
        }
        if (!isBlock && latex.includes('\n')) {
            return match
        }
        let html = ''
        try {
            html = renderKatexCached(latex)
        } catch {
            // FUN-08：非法公式降级为原文，避免异常中断整个预览
            html = latex
        }
        if (isBlock) {
            html = '<div class="katex-math-block"><p>' + html + '</p></div>'
        }
        return html
    })
}

/**
 * 将 LaTeX 文本直接渲染为 HTML 字符串
 * @param text LaTeX 文本
 * @returns HTML 字符串
 */
function katexRenderToString(text: string): string {
    let html = ''
    try {
        html = renderKatexCached(text)
    } catch {
        html = text
    }

    return html
}

function renderMathCodeBlock(text: string, regex: RegExp): string {
    return text.replace(regex, (match, code) => {
        let mathBlocks: string
        try {
            mathBlocks = renderKatexCached(code)
        } catch (error) {
            // FUN-08：非法 math 代码块降级为源码显示（原样返回代码块），避免异常中断整个预览
            logger.warn('[KatexRender] 数学代码块渲染失败，已降级为源码显示:', error)
            return match
        }
        return '<div class="katex-code-block"><p>' + mathBlocks + '</p></div>'
    })
}

function katexRenderMathInText(text: string): string {
    // 正则表达式匹配以 $ 开头和结尾的文本（简单版本，不处理转义字符或嵌套）
    // 公式块$$ $$
    let result = renderMathInText(text, /\$\$([^$]+)\$\$/g, true)
    // 行内公式$  $
    result = renderMathInText(result, /\$([^$]+)\$/g, false)
    // ```math   ```
    result = renderMathCodeBlock(result, /```math([\s\S]*?)```/g)
    result = renderMathCodeBlock(result, /```katex([\s\S]*?)```/g)
    result = renderMathCodeBlock(result, /```latex([\s\S]*?)```/g)
    return result
}
/* ==================== 二、当前活动文件路径与 URL 绝对化转换 ====================
 * 迁移自 src/main/renders/HemyRender.ts 的 covertFileUrl / preRenderImageUrlConvert /
 * preRenderFileUrlConvert。原实现读取主进程 appState.currentActiveFile；迁移后由预览组件
 * 订阅渲染层已有的 IPC.FILE.USER_SELECT_FILE 事件，把当前活动文件路径写入本模块，
 * 保持与原主进程行为一致的相对路径 → 绝对路径转换。
 */

/** 当前活动文件绝对路径（由预览组件经 IPC.FILE.USER_SELECT_FILE 维护；null 表示无活动文件） */
let previewActiveFilePath: string | null = null

/**
 * 更新当前活动文件路径（预览组件在收到主进程 USER_SELECT_FILE 事件时调用）
 * @param filePath 当前活动文件绝对路径；无活动文件时传 null
 */
export function setPreviewActiveFilePath(filePath: string | null): void {
    previewActiveFilePath = filePath
}

/** 读取当前活动文件路径（单元测试/诊断用） */
export function getPreviewActiveFilePath(): string | null {
    return previewActiveFilePath
}

/**
 * 解析目录路径（与主进程 ParseDirectoryPath 同语义）
 * @param fullName 完整的文件路径
 * @returns 目录部分；无扩展名分隔符时返回原路径
 */
function parseDirectoryPath(fullName: string): string {
    if (fullName.lastIndexOf('.') === -1) {
        return fullName
    }
    const lastIndex = Math.max(fullName.lastIndexOf('\\'), fullName.lastIndexOf('/'))
    return fullName.substring(0, lastIndex)
}

/**
 * 把本地绝对路径转成合法的 file:// URL。
 * 修复背景（FE-12 本地图片预览）：原实现直接输出无协议的绝对路径
 * （如 `C:/notes/img/a.png`），存在两个问题：
 * 1. 浏览器会把 `C:` 当作未知 scheme 或相对 URL 解析，图片无法加载；
 * 2. Windows 盘符路径（含 `:`）会被 DOMPurify 默认 URI 白名单剥离，src 属性被删除。
 * file:// 协议同时解决两者（浏览器可解析、DOMPurify 默认放行 f|ht)tps? 分支），
 * 与 html-view-utils.ts 的 withBaseHref 口径一致：补前导斜杠 + encodeURI 编码，
 * 并对 encodeURI 保留的 `#`/`?` 单独编码（避免文件名中的 # 变成片段标识）。
 * 2026-11-19 注释更新：原引用「ShowPdfEditor.vue 的 toFileUrl 方案」已随 PDF 改 pdf.js 删除。
 */
function toFileUrl(localPath: string): string {
    const normalized = localPath.replace(/\\/g, '/')
    const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized
    return (
        'file://' +
        encodeURI(withLeadingSlash).replace(/[?#]/g, (ch) => (ch === '#' ? '%23' : '%3F'))
    )
}

/**
 * 转换相对 URL 为基于当前活动文件的绝对路径
 */
function covertFileUrl(url: string): string {
    const filePath = previewActiveFilePath
    if (!filePath) {
        return url
    }

    // FUN-22：页内锚点（# 开头）保持原样，不拼接成文件路径
    if (url.startsWith('#')) {
        return url
    }

    if (url.indexOf(':') !== -1) {
        return url
    }

    if (url.startsWith('./')) {
        url = url.substring(2)
    }

    const fullPath = parseDirectoryPath(filePath) + '\\' + url
    return toFileUrl(fullPath)
}

/**
 * FUN-22：允许原样透传的安全协议白名单
 */
const SAFE_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'ftp', 'ftps'])

/**
 * FUN-22：检测 URL 是否携带危险伪协议（javascript:、vbscript:、data: 等）。
 * 危险协议链接保持 markdown 原文，不转换成可点击 HTML 链接；
 * 渲染端 DOMPurify 消毒层作为第二道防线兜底剥离。
 */
function hasUnsafeProtocol(url: string): boolean {
    const match = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
    if (!match) {
        return false
    }
    return !SAFE_URL_PROTOCOLS.has(match[1].toLowerCase())
}

/**
 * 从图片标记中解析 alt 文本
 * ![alt](url)
 */
function parseAltText(text: string): string {
    const leftIndex = text.indexOf('[')
    const rightIndex = text.indexOf(']')
    if (rightIndex === leftIndex + 1) {
        return ''
    }
    return text.substring(leftIndex + 1, rightIndex)
}

/**
 * 预渲染 - 图片URL转换
 * 将相对路径的图片URL转换为绝对路径
 */
function preRenderImageUrlConvert(text: string): string {
    try {
        const regex = /!\[[^\]]*\]\(([^)]*)\)/g
        return text.replace(regex, (match, src) => {
            // FUN-22：锚点与危险协议（javascript: 等）的图片引用不转换，保持原文
            if (src.startsWith('#') || hasUnsafeProtocol(src)) {
                return match
            }
            const imgSrc = covertFileUrl(src)
            const altText = parseAltText(match)
            return `<p><img style="width: auto; max-width: 900px; height: auto" src="${imgSrc}" alt="${altText}"></p>`
        })
    } catch {
        return text
    }
}

/**
 * 预渲染 - 文件URL转换
 * 将非 http 开头的相对路径文件URL转换为绝对路径
 */
function preRenderFileUrlConvert(text: string): string {
    try {
        const regex = /\[[^\]]*\]\(([^)]*)\)/g
        return text.replace(regex, (match, url) => {
            if (!url.startsWith('http')) {
                // FUN-22：锚点与危险协议链接不转换，保持 markdown 原文，
                // 由渲染端 DOMPurify 消毒层兜底过滤
                if (url.startsWith('#') || hasUnsafeProtocol(url)) {
                    return match
                }
                const fileSrc = covertFileUrl(url)
                const altText = parseAltText(match)
                return `<a href="${fileSrc}">${altText}</a>`
            }
            return match
        })
    } catch {
        return text
    }
}

/* ======================= 三、围栏代码块保护（FUN-22） =======================
 * 迁移自 src/main/renders/HemyRender.ts。
 * 保护所有 ``` 围栏代码块（任意语言、任意缩进），避免代码示例中的 ![alt](url)、[text](url)
 * 语法与 $...$ 公式被预渲染正则改写。
 *
 * 修复记录（mkdocs-material 语法修复配套）：
 * 旧实现按「行数组分段 + join('')」重组文本，分段边界会吞掉一个换行符——例如
 * `a\n```js\nx\n```\nb` 会被重组为 `a```js\nx\n```b`，markdown-it 从此不再识别这段围栏，
 * 裸 ``` 直接出现在预览里（admonition/tab 内缩进代码围栏受影响最明显）。
 * 现改为「字符偏移区间」方案：先扫描出围栏代码块的 [start, end) 字符区间，区间内原文
 * 原样输出，区间之间（非保护片段）才做 KaTeX / 图片与文件 URL 变换；拼接后与原文逐字符
 * 一致（仅被 renderContent 主动替换的内容除外），分段边界的换行符不再丢失。
 */

/** 受保护的围栏代码块字符区间（[start, end) 为原文中的字符偏移） */
interface ProtectedRange {
    start: number
    end: number
}

/**
 * 检查是否是围栏代码块起始行（FUN-22）
 * 任意缩进均可：admonition/tab 内容里的代码围栏通常还带着额外的 4 空格缩进。
 */
function isProtectedBlockStart(line: string): boolean {
    return line.trim().startsWith('```')
}

/**
 * 检查是否是纯 ``` 行（用于结束代码块）
 */
function isPureCodeBlockEnd(line: string): boolean {
    return line.trim() === '```'
}

/**
 * 扫描文本中的围栏代码块字符区间。
 * 与旧实现语义一致：起始行为 trim 后以 ``` 开头，结束行为 trim 后恰好是 ```；
 * 支持嵌套计数（块内再次出现 ```lang 行会加深层级，直到补齐对应数量的 ``` 行）；
 * 未闭合围栏按「延续到文末」处理（与 markdown-it 的围栏行为一致）。
 */
function findProtectedRanges(text: string): ProtectedRange[] {
    const lines = text.split('\n')
    // 预先计算每行起始字符偏移（split 后按「行长 + 换行符」累加）
    const lineStarts: number[] = []
    let offset = 0
    for (const line of lines) {
        lineStarts.push(offset)
        offset += line.length + 1
    }

    const ranges: ProtectedRange[] = []
    let index = 0
    while (index < lines.length) {
        if (!isProtectedBlockStart(lines[index])) {
            index += 1
            continue
        }
        const startLine = index
        let depth = 1
        let endLine = index + 1
        while (endLine < lines.length) {
            const line = lines[endLine]
            if (line.trim().startsWith('```')) {
                if (!isPureCodeBlockEnd(line)) {
                    depth += 1
                } else {
                    depth -= 1
                    if (depth === 0) {
                        break
                    }
                }
            }
            endLine += 1
        }
        // endLine 指向结束围栏行；未闭合时等于 lines.length（含文末）
        const nextLine = Math.min(endLine + 1, lines.length)
        ranges.push({
            start: lineStarts[startLine],
            // 结束行之后仍有内容时，区间截止到下一行行首（把分隔换行符留给非保护片段处理）
            end: nextLine < lines.length ? lineStarts[nextLine] : text.length
        })
        index = nextLine
    }
    return ranges
}

/**
 * 按围栏代码块切分并渲染文本：代码块区间原样保留，其余片段执行 renderContent。
 * 采用字符偏移拼接（而非行数组 join），保证分段边界的换行符不丢失。
 * @param text 原始 Markdown 文本
 * @param skipKatex PF-9：超大文档降级时跳过 KaTeX
 */
function renderProtectedSegments(text: string, skipKatex: boolean): string {
    const ranges = findProtectedRanges(text)
    if (ranges.length === 0) {
        return renderContentSafely(text, skipKatex)
    }
    let result = ''
    let cursor = 0
    for (const range of ranges) {
        if (range.start > cursor) {
            result += renderContentSafely(text.slice(cursor, range.start), skipKatex)
        }
        result += text.slice(range.start, range.end)
        cursor = range.end
    }
    if (cursor < text.length) {
        result += renderContentSafely(text.slice(cursor), skipKatex)
    }
    return result
}

/**
 * 渲染单个非保护片段；失败时降级为原文（FUN-08：保证预览整体不中断）
 */
function renderContentSafely(text: string, skipKatex: boolean): string {
    try {
        return renderContent(text, skipKatex)
    } catch (error) {
        logger.warn('[HemyRenderPreLocal] 片段预渲染失败，已降级为原文:', error)
        return text
    }
}

/* ==================== 三点五、PF-9：超大文档降级判定 ====================
 * 背景（out/full-scan/perf.md PF-9）：超大文档（>2 MB / >5 万行）在预览中没有降级，
 * KaTeX 全量渲染 + mermaid 渲染会长时间占用渲染主线程（与 Monaco 输入同线程），导致输入卡顿。
 * 策略：超过阈值时「跳过 KaTeX 公式与 mermaid/PlantUML 图表渲染」（保留代码块高亮与正文渲染，
 * 编辑器保持可用），并由预览组件显示一次「文档过大，预览已简化」提示。
 * 阈值常量可配置（导出的 PREVIEW_LARGE_DOC_* 常量）。
 */

/** PF-9：超大文档估算字节阈值（默认 2 MiB） */
export const PREVIEW_LARGE_DOC_BYTE_THRESHOLD = 2 * 1024 * 1024
/** PF-9：超大文档行数阈值（默认 5 万行） */
export const PREVIEW_LARGE_DOC_LINE_THRESHOLD = 50000

/**
 * PF-9：判断文档是否达到「预览降级」阈值。
 *
 * 单次线性扫描（无数组拆分/无全文拷贝），命任一条即提前返回：
 * 1. 估算 UTF-8 字节数 > PREVIEW_LARGE_DOC_BYTE_THRESHOLD
 *    （ASCII 记 1、非 ASCII 记 3，代理对按 6 计，足够精确且 O(n)）；
 * 2. 行数 > PREVIEW_LARGE_DOC_LINE_THRESHOLD。
 */
export function IsLargePreviewDocument(text: string): boolean {
    if (typeof text !== 'string' || text.length === 0) {
        return false
    }
    // 纯 ASCII 时 length 即字节数：明显超标可直接判定，避免再扫描一遍
    if (text.length > PREVIEW_LARGE_DOC_BYTE_THRESHOLD) {
        return true
    }
    let estimatedBytes = 0
    let lineCount = 1
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index)
        if (code === 10) {
            lineCount += 1
            if (lineCount > PREVIEW_LARGE_DOC_LINE_THRESHOLD) {
                return true
            }
        }
        if (code < 0x80) {
            estimatedBytes += 1
        } else if (code >= 0xd800 && code <= 0xdbff) {
            // 代理对高字节：UTF-8 编码为 4 字节；跳过紧随的低字节
            estimatedBytes += 4
            index += 1
        } else {
            estimatedBytes += 3
        }
        if (estimatedBytes > PREVIEW_LARGE_DOC_BYTE_THRESHOLD) {
            return true
        }
    }
    return false
}

/** HemyRenderPreLocal 的可选参数（PF-9） */
export interface HemyRenderPreLocalOptions {
    /**
     * 是否跳过 KaTeX 公式渲染（超大文档降级）。
     * 不传时按 IsLargePreviewDocument(text) 自动判定。
     */
    skipKatex?: boolean
}

/**
 * 对普通文本（非围栏代码块片段）进行预渲染变换
 * 依次执行：KaTeX、图片 URL、文件 URL
 * 说明：!!! admonition / === tabbed set 已迁移到 markdown-it 插件（preview-mkdocs-material.ts），
 * 本函数不再做这两类语法的字符串变换，只保留与 Markdown 结构无关的纯文本替换。
 * @param text 非代码块片段文本
 * @param skipKatex PF-9：超大文档降级时跳过 KaTeX（公式保持 $...$ 原文，可读且不阻塞主线程）
 */
function renderContent(text: string, skipKatex: boolean): string {
    let result = text
    if (!skipKatex) {
        result = katexRenderMathInText(result)
    }
    result = preRenderImageUrlConvert(result)
    result = preRenderFileUrlConvert(result)
    return result
}

/* ======================= 四、PRE / POST 渲染入口（本地） ======================= */

/**
 * 预渲染阶段（渲染层本地，PF-02：替代原主进程 HemyRenderPre + PRE_RENDER IPC 往返）
 * 1. 扫描围栏代码块字符区间（任意语言/缩进）
 * 2. 非保护片段执行 KaTeX / 图片与文件 URL 变换（admonition/tabbed 已交由 markdown-it 插件）
 * 3. 按字符偏移原样拼接返回（不再经主进程，无 IPC；分段边界换行符不丢失）
 * PF-9：超大文档（>2 MiB / >5 万行）自动跳过 KaTeX 渲染，避免阻塞渲染主线程；
 * 调用方可显式传 skipKatex 覆盖自动判定。
 * @param text 编辑器原始 Markdown 文本
 * @param options PF-9 降级选项
 * @returns 预渲染后的文本（供 markdown-it md.render 使用）
 */
export function HemyRenderPreLocal(text: string, options: HemyRenderPreLocalOptions = {}): string {
    const skipKatex = options.skipKatex ?? IsLargePreviewDocument(text)
    return renderProtectedSegments(text, skipKatex)
}

/**
 * 后渲染阶段（渲染层本地，PF-02：替代原主进程 HemyRenderPost + POST_RENDER IPC 往返）
 * 当前后处理为恒等变换（admonition/tabbed 的 HTML 由 markdown-it 插件在渲染阶段直接产出），
 * 保留该入口与主进程原 API 对等，便于后续新增渲染层后处理逻辑。
 * @param text md.render 产出的 HTML
 * @returns 后处理后的 HTML（恒等）
 */
export function HemyRenderPostLocal(text: string): string {
    return text
}

/**
 * 渲染层本地渲染状态复位（单元测试用，避免用例间相互影响）
 */
export function resetPreviewLocalRenderState(): void {
    previewActiveFilePath = null
    // PF-9：清空 KaTeX LRU 缓存，保证用例之间不互相影响
    katexHtmlCache.clear()
    // AS-9：远程图片策略回到安全默认（不加载远程图片）
    previewAllowRemoteImages = false
}

/* 供单元测试直接复用的内部变换（与迁移前主进程模块导出保持对等） */
export { katexRenderToString, katexRenderMathInText }

/* ==================== 五、AS-9：远程图片隐私策略（默认不加载远程图片） ====================
 * 背景（out/full-scan/arch-security.md AS-9）：Markdown 预览会把文档中的
 * `![](https://tracking.example/pixel)` 直接交给浏览器加载，第三方可借此统计
 * 文档打开行为、IP 与阅读时间（跟踪像素面）。
 *
 * 策略：在 DOMPurify 消毒之后、写入 v-html 之前，对最终 HTML 做一次「远程图片拦截」后处理。
 * - allowRemoteImages=false（默认）：图片若引用 http(s) 或协议相对地址，替换为灰色占位块，
 *   且**不保留原始 URL**（不写入 src/srcset/data-* 等任何属性），浏览器因此不会发起远程请求；
 *   本地相对路径、绝对路径（/home/...、C:/...）与 data:/blob: 图片不受影响；
 * - allowRemoteImages=true：原样返回，保持历史行为（正常加载远程图片）。
 *
 * 为什么在 DOMPurify 之后：消毒输出由浏览器解析器序列化，标签/属性统一为双引号形态，
 * 引号感知的标签匹配不会因属性值里的 `>` 被截断；同时占位块完全由本模块生成
 * （文本经过 HTML 转义、不含用户 URL），不存在把不可信内容重新拼进 v-html 的注入面。
 *
 * 覆盖的远程加载面（均属「图片」范畴）：
 * - <img src> 与 <img srcset>（srcset 任一候选为远程即拦截）；
 * - <picture> 内的 <source srcset>（远程候选剥离，避免 picture 选源时联网）；
 * - SVG <image>/<feImage> 的 href/xlink:href，以及 SVG 内 <style> 中的远程 url()/@import；
 * - <video poster>、<input src>（type=image 等按图片处理）与任意元素的 background 属性；
 * - 内联 style 里的远程 url()（含 CSS 转义/引号/协议相对写法）。
 * 说明：<video>/<audio> 的 src 属于显式媒体内容，不在「图片」范围，保持原行为。
 */

/** AS-9：远程图片拦截占位块的类名（预览组件样式与单元测试据此识别） */
export const REMOTE_IMAGE_BLOCKED_CLASS = 'remote-image-blocked'

/** AS-9：未传入文案时的兜底拦截提示（渲染层实际传入当前语言的 i18n 文案） */
const DEFAULT_REMOTE_IMAGE_BLOCKED_LABEL = '远程图片已拦截（可在设置中开启加载）'

/** AS-9：占位块内联样式（灰底虚线块；优先使用主题 CSS 变量，浅色兜底） */
const REMOTE_IMAGE_BLOCKED_STYLE =
    'display:inline-block;min-width:120px;max-width:100%;padding:10px 12px;margin:4px 0;' +
    'border:1px dashed var(--border-color,#c0c4cc);border-radius:4px;' +
    'background:var(--card-bg,#f5f5f5);color:var(--secondary-text-color,#909399);' +
    'font-size:12px;line-height:1.5;'

/** AS-9：是否允许预览加载远程图片（安全默认 false；由预览组件从系统设置同步） */
let previewAllowRemoteImages = false

/** AS-9：更新远程图片策略（预览组件在读取配置/收到 SYSTEM_SETTING_UPDATE 时调用） */
export function setPreviewAllowRemoteImages(allow: boolean): void {
    previewAllowRemoteImages = allow === true
}

/** AS-9：读取当前远程图片策略（预览组件渲染/单元测试用） */
export function getPreviewAllowRemoteImages(): boolean {
    return previewAllowRemoteImages
}

/** 裁剪字符串首尾的 C0 控制字符与空格（浏览器解析 URL 前会做同样处理） */
function trimUrlEdgeControls(value: string): string {
    const isControlOrSpace = (code: number): boolean => code <= 0x20
    let start = 0
    let end = value.length
    while (start < end && isControlOrSpace(value.charCodeAt(start))) {
        start += 1
    }
    while (end > start && isControlOrSpace(value.charCodeAt(end - 1))) {
        end -= 1
    }
    return value.slice(start, end)
}

/**
 * AS-9：判断 URL 是否会触发远程网络请求（http/https 或协议相对地址）。
 * 与浏览器 URL 解析口径对齐：剔除任意位置的 TAB/LF/CR、裁剪首尾控制字符/空格，
 * 且 http(s) 特殊协议中的反斜杠等价于斜杠（`http:\\/\\/host` 与 `http://host` 等效）。
 * data:/blob:/file:/本地路径/页内锚点均返回 false。
 */
export function IsRemoteImageUrl(url: string): boolean {
    if (typeof url !== 'string' || url.length === 0) {
        return false
    }
    const withoutLineBreaks = url.replaceAll('\t', '').replaceAll('\n', '').replaceAll('\r', '')
    const normalized = trimUrlEdgeControls(withoutLineBreaks).replace(/\\/g, '/')
    if (normalized.startsWith('//')) {
        return true
    }
    return /^https?:/i.test(normalized)
}

/** AS-9：最小 HTML 实体反转义（DOMPurify 序列化属性值时保留 &amp;/&quot; 等实体） */
function decodeHtmlEntities(value: string): string {
    return value
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replace(/&#x27;/gi, "'")
        .replaceAll('&amp;', '&')
}

/** AS-9：HTML 文本/属性值转义（占位块内容全部经此转义，杜绝二次注入） */
function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

/** AS-9：CSS url(...) 引用（单引号/双引号/无引号三种写法，匹配时忽略大小写） */
const CSS_URL_PATTERN = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)]*))\s*\)/gi

/** AS-9：解码 CSS 转义（如 `\\68 ttps` → `https`），用于识别转义伪装的远程 URL */
function decodeCssEscapes(value: string): string {
    return value
        .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match: string, hex: string) => {
            const codePoint = Number.parseInt(hex, 16)
            return Number.isFinite(codePoint) && codePoint <= 0x10ffff
                ? String.fromCodePoint(codePoint)
                : ''
        })
        .replace(/\\(.)/g, '$1')
}

/** AS-9：内联 style 的 url() 是否引用远程图片（含 CSS 转义/引号变体） */
function hasRemoteCssImageUrl(style: string): boolean {
    for (const match of style.matchAll(CSS_URL_PATTERN)) {
        const rawUrl = match[1] ?? match[2] ?? match[3] ?? ''
        if (IsRemoteImageUrl(decodeCssEscapes(rawUrl))) {
            return true
        }
    }
    return false
}

/**
 * AS-9：srcset 中是否存在远程候选。
 * 简化解析：逗号分隔候选、取每段首个空白前的 token 作为 URL——足以识别远程候选；
 * data: URI 含逗号会被拆成多段，但各段都不命中远程前缀，不会误伤本地 data 图片。
 */
function hasRemoteSrcsetCandidate(srcset: string): boolean {
    if (srcset.trim().length === 0) {
        return false
    }
    return srcset.split(',').some((candidate) => {
        const urlToken = candidate.trim().split(/\s+/)[0] ?? ''
        return IsRemoteImageUrl(decodeHtmlEntities(urlToken))
    })
}

/**
 * AS-9：起始标签匹配——引号感知，属性值中的 `>` 不会截断标签。
 * 处理对象是 DOMPurify 输出（属性值统一双引号序列化），因此该匹配能稳定覆盖全部起始标签。
 */
const HTML_START_TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
/** AS-9：起始标签内的属性（含前导空白，raw 用于原样重建） */
const HTML_ATTRIBUTE_PATTERN = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g
/**
 * AS-9：内联 <style> 块（DOMPurify 的 svg 配置保留 SVG 内的 <style>）。
 * SVG 内 CSS 的 @import / url(https://…) 同样会触发远程请求，需要一并检查。
 * 文本内容用非贪婪匹配；CSS 中的 `</style>` 已被消毒器转义，不会提前截断。
 */
const STYLE_BLOCK_PATTERN = /<style\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/style>/gi

interface ParsedHtmlAttribute {
    name: string
    rawValue: string
    raw: string
}

interface ParsedHtmlStartTag {
    attributes: ParsedHtmlAttribute[]
    selfClosing: boolean
}

/** AS-9：解析起始标签的属性文本（属性名小写化；raw 保留原始片段用于重建） */
function parseHtmlStartTag(attributeText: string): ParsedHtmlStartTag {
    let text = attributeText.replace(/\s+$/, '')
    let selfClosing = false
    if (text.endsWith('/')) {
        selfClosing = true
        text = text.slice(0, -1)
    }
    const attributes: ParsedHtmlAttribute[] = []
    for (const match of text.matchAll(HTML_ATTRIBUTE_PATTERN)) {
        attributes.push({
            name: match[1].toLowerCase(),
            rawValue: match[2] ?? match[3] ?? match[4] ?? '',
            raw: match[0]
        })
    }
    return { attributes, selfClosing }
}

/** AS-9：读取属性值（不存在时返回空字符串） */
function findHtmlAttribute(attributes: ParsedHtmlAttribute[], name: string): string {
    for (const attribute of attributes) {
        if (attribute.name === name) {
            return attribute.rawValue
        }
    }
    return ''
}

/** AS-9：按「保留原属性片段」的方式重建起始标签（仅移除命中的属性） */
function rebuildHtmlStartTag(
    tagName: string,
    tag: ParsedHtmlStartTag,
    removedAttributes: ReadonlySet<string>
): string {
    const keptAttributes = tag.attributes
        .filter((attribute) => !removedAttributes.has(attribute.name))
        .map((attribute) => attribute.raw)
        .join('')
    return `<${tagName}${keptAttributes}${tag.selfClosing ? ' /' : ''}>`
}

/** AS-9：构造被拦截远程图片的灰色占位块（不含原始 URL，不发起任何请求） */
function buildRemoteImageBlockedPlaceholder(blockedLabel: string, altText: string): string {
    const safeLabel = escapeHtml(blockedLabel)
    const safeAlt = escapeHtml(altText)
    const text = safeAlt.length > 0 ? `${safeLabel}：${safeAlt}` : safeLabel
    return (
        `<span class="${REMOTE_IMAGE_BLOCKED_CLASS}" title="${safeLabel}" ` +
        `style="${REMOTE_IMAGE_BLOCKED_STYLE}">🖼️ ${text}</span>`
    )
}

/** AS-9：远程图片策略选项 */
export interface RemoteImagePolicyOptions {
    /** 是否允许远程图片；缺省读取模块级策略（默认 false） */
    allowRemoteImages?: boolean
    /** 拦截提示文案（渲染层传入当前语言的 i18n 文案） */
    blockedLabel?: string
}

/**
 * AS-9：对最终 HTML 应用远程图片隐私策略。
 *
 * - allowRemoteImages=false（默认）：远程图片一律替换为占位块（原始 URL 不落任何属性）；
 * - allowRemoteImages=true：原样返回（历史行为）。
 *
 * 纯字符串变换、幂等：对已处理过的 HTML 再执行一次不会二次改写。
 */
export function ApplyRemoteImagePolicy(
    html: string,
    options: RemoteImagePolicyOptions = {}
): string {
    if (typeof html !== 'string' || html.length === 0) {
        return html
    }
    const allowRemoteImages = options.allowRemoteImages ?? previewAllowRemoteImages
    if (allowRemoteImages) {
        return html
    }
    const blockedLabel =
        typeof options.blockedLabel === 'string' && options.blockedLabel.trim().length > 0
            ? options.blockedLabel
            : DEFAULT_REMOTE_IMAGE_BLOCKED_LABEL
    // 快速路径：既无图片类标签、也无 style/background 相关属性的文档无需逐标签后处理
    const hasPotentialRemoteImageSurface =
        /<(?:img|source|image|feimage|video|input|body)\b/i.test(html) ||
        /<style\b/i.test(html) ||
        /\sstyle\s*=/i.test(html) ||
        /\sbackground\s*=/i.test(html)
    if (!hasPotentialRemoteImageSurface) {
        return html
    }
    // SVG 内 <style> 的远程 url()/@import：整块移除（保留内联样式表会继续发起远程请求）
    const withoutRemoteStyleBlocks = html.replace(
        STYLE_BLOCK_PATTERN,
        (rawStyleBlock: string, cssText: string): string =>
            hasRemoteCssImageUrl(decodeHtmlEntities(cssText)) ? '' : rawStyleBlock
    )
    return withoutRemoteStyleBlocks.replace(
        HTML_START_TAG_PATTERN,
        (rawTag: string, rawTagName: string, rawAttributes: string): string => {
            const tagName = rawTagName.toLowerCase()
            const tag = parseHtmlStartTag(rawAttributes)

            // 1) 图片元素：远程 src 或 srcset 候选 → 整标签替换为占位块（不保留 URL）
            if (tagName === 'img') {
                const src = findHtmlAttribute(tag.attributes, 'src')
                const srcset = findHtmlAttribute(tag.attributes, 'srcset')
                if (IsRemoteImageUrl(decodeHtmlEntities(src)) || hasRemoteSrcsetCandidate(srcset)) {
                    return buildRemoteImageBlockedPlaceholder(
                        blockedLabel,
                        decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'alt'))
                    )
                }
                return rawTag
            }

            // 2) 其余「可触发远程图片加载」的属性：命中即剥离该属性（保留元素与其它属性）
            const removedAttributes = new Set<string>()
            if (
                tagName === 'source' &&
                hasRemoteSrcsetCandidate(findHtmlAttribute(tag.attributes, 'srcset'))
            ) {
                removedAttributes.add('srcset')
            }
            if (tagName === 'image' || tagName === 'feimage') {
                // SVG <image>/<feImage href="https://...">：剥离远程引用（保留空元素，避免破坏 SVG 结构）
                if (
                    IsRemoteImageUrl(decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'href')))
                ) {
                    removedAttributes.add('href')
                }
                if (
                    IsRemoteImageUrl(
                        decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'xlink:href'))
                    )
                ) {
                    removedAttributes.add('xlink:href')
                }
            }
            if (
                tagName === 'video' &&
                IsRemoteImageUrl(decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'poster')))
            ) {
                removedAttributes.add('poster')
            }
            if (
                tagName === 'input' &&
                IsRemoteImageUrl(decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'src')))
            ) {
                removedAttributes.add('src')
            }
            if (
                IsRemoteImageUrl(
                    decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'background'))
                )
            ) {
                removedAttributes.add('background')
            }
            if (
                tag.attributes.some((attribute) => attribute.name === 'style') &&
                // 属性值可能含 HTML 实体（如 style="background:url(&quot;https://…&quot;)"），
                // 浏览器解析 HTML 时会先解码实体再由 CSS 解析器消费，这里对齐该顺序
                hasRemoteCssImageUrl(decodeHtmlEntities(findHtmlAttribute(tag.attributes, 'style')))
            ) {
                removedAttributes.add('style')
            }
            if (removedAttributes.size === 0) {
                return rawTag
            }
            return rebuildHtmlStartTag(tagName, tag, removedAttributes)
        }
    )
}
