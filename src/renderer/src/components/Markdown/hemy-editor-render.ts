import MarkdownIt from 'markdown-it'
import EventBus from '../../common/event-bus/event-bus'
import type { MarkdownTOC, PlantumlRenderResponse } from '../../../../shared/types'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
import { escapeHtml } from '../../common/escape-html'
import { logger } from '../../common/logger'
import { LRUCache } from '../../../../shared/utils/lru-cache'
import { fnv1a32, toRadixString } from '../../../../shared/utils/hash'
import { randomDigits } from '../../../../shared/utils/random'
import { limitConcurrency } from '../../../../shared/utils/concurrency'
import {
    MERMAID_CONCURRENCY_LIMIT,
    MERMAID_RENDER_CACHE_MAX,
    PLANTUML_CONCURRENCY_LIMIT,
    RENDERER_PLANTUML_CACHE_MAX,
    RENDERER_PLANTUML_TIMEOUT_MS
} from '../../../../shared/constants/render'

// PF-6：mermaid 是渲染层最大的第三方依赖之一（打包体积/解析成本均以 MB 计）。
// 改为「首次遇到 ```mermaid 块时才动态 import」，未使用图表的文档（绝大多数笔记）不再加载它，
// 首屏 eager JS 相应减少；模块级 Promise 缓存保证整个会话只加载/初始化一次。
let mermaidModulePromise: Promise<typeof import('mermaid').default> | null = null

type MermaidApi = typeof import('mermaid').default

/**
 * Mermaid 初始化配置（2026-11-15 修复：图表文字全部丢失、只剩空矩形与连线）。
 *
 * 根因：预览管线用 DOMPurify 消毒（`USE_PROFILES: { svg: true }`），其 svg 白名单
 * **不包含 `<foreignObject>`**；而 Mermaid 默认 `htmlLabels: true` 会把节点标签、
 * 子图标题、连线标签渲染进 `<foreignObject><div>…</div></foreignObject>`，
 * 消毒时整块被移除 → 图上只剩空矩形。
 *
 * 修复：改用 SVG 原生文本渲染（根级 `htmlLabels: false`，Mermaid 11 推荐写法），
 * 标签落在白名单内的 `<text>` 元素上，消毒后文字保留。`securityLevel: 'strict'`
 * 与 MermaidEditDialog 的 XSS 防护策略一致。
 */
export const MERMAID_INIT_CONFIG = {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false
} as const

/** PF-6：按需加载 mermaid 实例（并发调用共享同一个 import Promise，仅初始化一次） */
async function getMermaidInstance(): Promise<MermaidApi> {
    if (!mermaidModulePromise) {
        mermaidModulePromise = import('mermaid').then((module) => {
            const instance = module.default
            try {
                instance.initialize(MERMAID_INIT_CONFIG)
            } catch (error) {
                // 初始化失败不阻断渲染：退回 Mermaid 默认配置（文字可能因消毒丢失，但不崩溃）
                logger.warn('[Mermaid] 初始化配置失败，使用默认配置:', error)
            }
            return instance
        })
    }
    return mermaidModulePromise
}

/**
 * 生成 mermaid 图唯一 id 尾串（迁移：改用 `shared/utils/random.randomDigits`，
 * 原实现逐位 `Math.floor(Math.random() * 10)` 拼接，输出字符集与长度语义完全一致）。
 */
function genRandomNumString(length: number): string {
    return randomDigits(length)
}

function removeMermaidDiv(mermaidId: string) {
    const divElement = document.getElementById('d' + mermaidId)
    if (divElement) {
        divElement.remove()
    }
}

/**
 * P-3（PF-09）：mermaid 渲染结果按内容 hash 缓存，避免每次防抖结束后全量重渲染。
 *
 * 迁移（渲染层公共接口归位）：缓存容器改用 `shared/utils/lru-cache.LRUCache`
 * （命中提升 + 超限淘汰语义与原手写 Map 实现逐字对齐），上限引用
 * `shared/constants/render.MERMAID_RENDER_CACHE_MAX`（50，与原 MERMAID_CACHE_MAX 一致）。
 */
const mermaidRenderCache = new LRUCache<{ svg: string; id: string }>(MERMAID_RENDER_CACHE_MAX)

/**
 * FNV-1a 32 位字符串哈希（仅作缓存键，无需密码学强度）。
 *
 * 迁移（渲染层公共接口归位）：哈希核心改为 `shared/utils/hash.fnv1a32`（无符号），
 * 十六进制输出改用 `toRadixString(hash, 16)`；与原本地实现的
 * `(hash >>> 0).toString(16)` 逐字等价（无前导零补位）。
 */
function hashString(str: string): string {
    return toRadixString(fnv1a32(str), 16)
}

/** 包装 mermaid SVG 为预览所需的 HTML 结构 */
function wrapMermaidSvg(svg: string): string {
    return (
        '<div><pre class="mermaid"><code style="height: auto;display: flex">' +
        svg +
        '</code></pre></div>'
    )
}

/**
 * FUN-21：构造 mermaid 渲染失败降级块。
 * 回显图表源码与错误信息，预览中可见、可诊断，不再静默空白。
 * P1：转义实现已收敛为单一来源（`common/escape-html.ts` → 现 re-export
 * `shared/utils/html.escapeHtml`），此处直接复用。
 */
function buildMermaidErrorHtml(graphDefinition: string, error: unknown): string {
    const errMessage = error instanceof Error ? error.message : String(error)
    return (
        '<div class="mermaid-render-error" style="border:1px solid #d97706;border-radius:4px;' +
        'padding:8px 12px;background:#fff7ed;color:#9a3412;">' +
        '<p style="margin:0 0 6px;font-weight:600;">' +
        t('editorUi.render.mermaidFailed') +
        '</p>' +
        '<pre style="margin:0 0 6px;white-space:pre-wrap;"><code>' +
        escapeHtml(graphDefinition) +
        '</code></pre>' +
        '<p style="margin:0;font-size:12px;">' +
        t('editorUi.render.errorInfo') +
        escapeHtml(errMessage) +
        '</p></div>'
    )
}

async function mermaidRender(graphDefinition: string): Promise<string> {
    const cacheKey = hashString(graphDefinition)
    const mermaidId = 'mermaid' + genRandomNumString(10)
    const cached = mermaidRenderCache.get(cacheKey)

    if (cached) {
        // 命中缓存（get 已刷新 LRU 顺序）：将缓存 SVG 中的旧 id 替换为本次唯一 id
        // （mermaid 内部 id 由传入 id 派生），避免同一文档内多份相同图表出现 DOM id 冲突
        const svg = cached.svg.split(cached.id).join(mermaidId)
        return wrapMermaidSvg(svg)
    }

    try {
        // PF-6：mermaid 首次使用时才加载（见 getMermaidInstance）
        const mermaid = await getMermaidInstance()
        const renderSvg = await mermaid.render(mermaidId, graphDefinition)
        // 删除mermaid.render过程中增加的div
        removeMermaidDiv(mermaidId)
        // 写入缓存（set 内部在容量已满时淘汰最旧条目，上限来自 shared 常量）
        mermaidRenderCache.set(cacheKey, { svg: renderSvg.svg, id: mermaidId })
        return wrapMermaidSvg(renderSvg.svg)
    } catch (error) {
        // FUN-21：渲染失败降级为"源码回显 + 错误提示"占位块
        removeMermaidDiv(mermaidId)
        return buildMermaidErrorHtml(graphDefinition, error)
    }
}

/*
 * 并发限制的批量执行函数（迁移说明）。
 *
 * 原实现为本模块私有：按任务数组顺序启动、`Promise.race` 等待名额、结果按原始下标回填、
 * 单任务失败把错误对象当作结果返回（不整体 reject）。该实现已逐字归位到
 * `src/shared/utils/concurrency.limitConcurrency`，本模块改为直接 import 复用。
 */

export async function preRenderMermaidProc(text: string): Promise<string> {
    // 正则表达式匹配 mermaid 代码块
    const regex = /```mermaid([\s\S]*?)```/g
    const matches: { full: string; code: string }[] = []
    let match: RegExpExecArray | null

    // 收集所有匹配项
    while ((match = regex.exec(text)) !== null) {
        matches.push({ full: match[0], code: match[1] })
    }

    // 如果没有匹配项，直接返回原文
    if (matches.length === 0) {
        return text
    }

    // 并发限制的并行渲染（限制并发数为3，避免Mermaid内部全局状态竞争）
    // Mermaid 11.x版本支持一定程度的并行，但需要限制并发数
    // 迁移：并发上限引用 shared/constants/render.MERMAID_CONCURRENCY_LIMIT（3，与原局部常量一致）
    const renderTasks = matches.map((m) => () => mermaidRender(m.code))
    const renderResults = await limitConcurrency(renderTasks, MERMAID_CONCURRENCY_LIMIT)

    // 替换结果
    let result = text
    matches.forEach((m, i) => {
        result = result.replace(m.full, renderResults[i])
    })

    return result
}

/* ===================== PF-08：PlantUML 本地离线渲染接入 =====================
 * 本地渲染由主进程隐藏窗口完成（src/main/renders/plantuml-local.ts 加载
 * resources/plantuml 离线 teaVM 环境并返回 SVG），渲染层只负责：
 *   围栏/裸块扫描 → invoke 主进程 → 把 SVG 替换回 Markdown 文本（md.render 之前）。
 * 通道常量单真源：src/shared/ipc-channels.ts 的 IPC.RENDER.PLANTUML_LOCAL。
 */
const PLANTUML_LOCAL_RENDER_CHANNEL = IPC.RENDER.PLANTUML_LOCAL

/*
 * 迁移（渲染层公共接口归位）：原本地常量改为引用 `src/shared/constants/render.ts`
 * （数值逐字一致，禁止在此另行调整）：
 * - 单图渲染兜底超时 12000ms → RENDERER_PLANTUML_TIMEOUT_MS
 *   （主进程侧 10s 超时，渲染层留 2s 余量）；
 * - 并发上限 3 → PLANTUML_CONCURRENCY_LIMIT（与 mermaid 一致，主进程内部串行队列消化，
 *   避免一次性塞满 IPC）；
 * - 渲染结果 HTML 缓存上限 50 → RENDERER_PLANTUML_CACHE_MAX。
 */

/**
 * 本地渲染返回结构：第 2 批契约重构后统一引用 shared `PlantumlRenderResponse`
 * （主进程 src/main/renders/plantuml-local.ts 与渲染层共用同一类型，
 * IPC.RENDER.PLANTUML_LOCAL 的响应契约见 shared/types/ipc.ts）。
 */

/** 待替换的 PlantUML 图块（Markdown 文本中的起止偏移 + 源码） */
interface PlantumlDiagramMatch {
    start: number
    end: number
    source: string
}

/** 扫描到的围栏代码块 */
interface FencedBlock {
    start: number
    end: number
    info: string
    content: string
    closed: boolean
}

/** 本地渲染是否已确认不可用（资源缺失/主进程通道未注册）：确认后本会话直接远程/代码块降级 */
let plantumlLocalUnavailable = false

/**
 * 本地渲染结果 HTML 缓存：源码 hash → 预览 HTML。
 *
 * 迁移（渲染层公共接口归位）：容器改用 `shared/utils/lru-cache.LRUCache`，
 * 上限引用 `shared/constants/render.RENDERER_PLANTUML_CACHE_MAX`（50）。
 */
const plantumlHtmlCache = new LRUCache<string>(RENDERER_PLANTUML_CACHE_MAX)

/** 按源码 hash 读取缓存（get 内部已刷新 LRU 顺序；未命中返回 null） */
function getCachedPlantumlHtml(cacheKey: string): string | null {
    return plantumlHtmlCache.get(cacheKey) ?? null
}

/** 写入缓存（set 内部在容量已满时淘汰最旧条目，上限来自 shared 常量） */
function setCachedPlantumlHtml(cacheKey: string, html: string): void {
    plantumlHtmlCache.set(cacheKey, html)
}

/**
 * 扫描文本中的 ``` 围栏代码块（含语言标记、内容与起止偏移）。
 * 用途：识别 plantuml/puml 围栏，并把围栏范围从"裸 @startuml 块"扫描中排除，
 * 避免把代码示例里的 PlantUML 片段误渲染成图表。
 */
function scanFencedBlocks(text: string): FencedBlock[] {
    const blocks: FencedBlock[] = []
    const lines = text.split('\n')
    let offset = 0
    let opened: { start: number; info: string; contentLines: string[] } | null = null

    for (const rawLine of lines) {
        // 兼容 CRLF 文档：匹配时去掉行尾 \r，偏移仍按原始行长度计算
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        const lineStart = offset
        const lineEnd = offset + rawLine.length
        // 行尾换行符占 1 个字符（最后一行没有换行符也不影响匹配）
        offset = lineEnd + 1

        const fenceMatch = line.match(/^[ \t]*`{3,}(.*)$/)
        if (!opened) {
            if (fenceMatch) {
                opened = { start: lineStart, info: fenceMatch[1].trim(), contentLines: [] }
            }
            continue
        }

        // 纯 ``` 行视为闭合围栏（与 markdown-it 的围栏规则保持一致）
        if (/^[ \t]*`{3,}[ \t]*$/.test(line)) {
            blocks.push({
                start: opened.start,
                end: lineEnd,
                info: opened.info,
                content: opened.contentLines.join('\n'),
                closed: true
            })
            opened = null
            continue
        }

        opened.contentLines.push(line)
    }

    // 未闭合围栏（markdown-it 会吞到文末）按到文末处理，同样纳入保护范围
    if (opened) {
        blocks.push({
            start: opened.start,
            end: text.length,
            info: opened.info,
            content: opened.contentLines.join('\n'),
            closed: false
        })
    }
    return blocks
}

/**
 * PlantUML 源码规整：已含 @start 标记则原样渲染；
 * 否则按 markdown-it-plantuml 的默认行为补全 @startuml/@enduml。
 */
function normalizePlantumlSource(content: string): string {
    const trimmed = content.replace(/\r\n/g, '\n').trim()
    if (trimmed.length === 0) {
        return ''
    }
    if (/^@start\w+/i.test(trimmed)) {
        return trimmed
    }
    return '@startuml\n' + trimmed + '\n@enduml'
}

/**
 * 收集所有需要本地渲染的 PlantUML 图块：
 * 1. ```plantuml / ```puml 围栏代码块（菜单模板插入的形式，此前只当作代码块高亮）；
 * 2. 裸 @startuml ... @enduml 块（markdown-it-plantuml 原本远程渲染的形式）。
 * 两类都跳过围栏代码块内部，避免误伤代码示例。
 */
function collectPlantumlDiagrams(text: string): PlantumlDiagramMatch[] {
    const diagrams: PlantumlDiagramMatch[] = []
    const fenceRanges: Array<{ start: number; end: number }> = []

    for (const block of scanFencedBlocks(text)) {
        fenceRanges.push({ start: block.start, end: block.end })
        const language = block.info.split(/\s+/)[0]?.toLowerCase() ?? ''
        if (language !== 'plantuml' && language !== 'puml') {
            continue
        }
        const source = normalizePlantumlSource(block.content)
        if (source.length === 0) {
            continue
        }
        diagrams.push({ start: block.start, end: block.end, source })
    }

    const bareBlockRegex = /^[ \t]*@startuml\b[^\n]*\n[\s\S]*?^[ \t]*@enduml\b[^\n]*$/gm
    let bareMatch: RegExpExecArray | null
    while ((bareMatch = bareBlockRegex.exec(text)) !== null) {
        const start = bareMatch.index
        const end = start + bareMatch[0].length
        const insideFence = fenceRanges.some((range) => start >= range.start && start < range.end)
        if (insideFence) {
            continue
        }
        diagrams.push({ start, end, source: bareMatch[0].trim() })
    }

    diagrams.sort((first, second) => first.start - second.start)
    return diagrams
}

/** 读取 preload 暴露的 ipcRenderer（未注入时返回 null，便于测试/极端环境下优雅降级） */
function getPlantumlIpcRenderer(): {
    invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
} | null {
    try {
        if (typeof window === 'undefined') {
            return null
        }
        // CQ-15：window.electron 由 preload 注入（全局类型见 src/preload/index.d.ts）；
        // 这里保留 undefined 分支是因为测试桩/极端环境下可能没有 electron 注入。
        // 原先用 `window as unknown as {...}` 遮蔽了真实注入类型，现改为精确类型 + 单次断言。
        const electronApi: typeof window.electron | undefined = window.electron
        const ipcRenderer = electronApi?.ipcRenderer
        if (!ipcRenderer || typeof ipcRenderer !== 'object') {
            return null
        }
        return ipcRenderer as {
            invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
        }
    } catch {
        return null
    }
}

/** 规整主进程返回值：ok 必须携带 <svg>；unavailable 携带降级原因 */
function normalizePlantumlResponse(raw: unknown): PlantumlRenderResponse {
    if (!raw || typeof raw !== 'object') {
        return { status: 'error', message: t('editorUi.render.plantumlInvalidResult') }
    }
    const record = raw as Record<string, unknown>
    if (record.status === 'ok' && typeof record.svg === 'string' && record.svg.includes('<svg')) {
        return { status: 'ok', svg: record.svg }
    }
    if (record.status === 'unavailable') {
        return {
            status: 'unavailable',
            reason: typeof record.reason === 'string' ? record.reason : '本地渲染不可用'
        }
    }
    return {
        status: 'error',
        message:
            typeof record.message === 'string' && record.message.length > 0
                ? record.message
                : t('editorUi.render.plantumlLocalFailed')
    }
}

/**
 * 调用主进程本地渲染（渲染层兜底超时，防止主进程异常时预览被永久挂起）。
 * IPC 异常/通道未注册时标记本地不可用，本会话后续图块直接走降级路径。
 */
async function invokePlantumlLocalRender(source: string): Promise<PlantumlRenderResponse> {
    const ipcRenderer = getPlantumlIpcRenderer()
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        plantumlLocalUnavailable = true
        return {
            status: 'unavailable',
            reason: '渲染层未暴露 IPC invoke，无法进行本地 PlantUML 渲染'
        }
    }

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<PlantumlRenderResponse>((resolve) => {
        timeoutTimer = setTimeout(() => {
            resolve({
                status: 'error',
                message: t('editorUi.render.plantumlTimeout', { ms: RENDERER_PLANTUML_TIMEOUT_MS })
            })
        }, RENDERER_PLANTUML_TIMEOUT_MS)
    })

    try {
        const raw = await Promise.race([
            ipcRenderer.invoke(PLANTUML_LOCAL_RENDER_CHANNEL, source),
            timeoutPromise
        ])
        return normalizePlantumlResponse(raw)
    } catch (error) {
        // 主进程未注册通道（接线缺失）或 IPC 异常：本会话降级为远程/代码块显示
        plantumlLocalUnavailable = true
        logger.warn('[PlantUML] 本地渲染 IPC 调用失败，已降级为远程/代码块显示:', error)
        return {
            status: 'unavailable',
            reason: error instanceof Error ? error.message : String(error)
        }
    } finally {
        if (timeoutTimer) {
            clearTimeout(timeoutTimer)
        }
    }
}

/** 包装本地渲染 SVG：块级容器，超宽图表可横向滚动 */
function wrapPlantumlSvg(svg: string): string {
    return (
        '<div class="plantuml-diagram" style="margin:12px 0;text-align:center;overflow-x:auto;">' +
        svg +
        '</div>'
    )
}

/**
 * PF-08：构造 PlantUML 渲染失败降级块（与 mermaid 的 FUN-21 降级一致）。
 * 回显图表源码与错误信息，预览中可见、可诊断，不再静默空白。
 */
function buildPlantumlErrorHtml(source: string, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return (
        '<div class="plantuml-render-error" style="border:1px solid #d97706;border-radius:4px;' +
        'padding:8px 12px;background:#fff7ed;color:#9a3412;margin:12px 0;">' +
        '<p style="margin:0 0 6px;font-weight:600;">' +
        t('editorUi.render.plantumlFailed') +
        '</p>' +
        '<pre style="margin:0 0 6px;white-space:pre-wrap;"><code>' +
        escapeHtml(source) +
        '</code></pre>' +
        '<p style="margin:0;font-size:12px;">' +
        t('editorUi.render.errorInfo') +
        escapeHtml(errorMessage) +
        '</p></div>'
    )
}

/**
 * 渲染单张 PlantUML 图：命中缓存直接返回；本地不可用返回 null（保留原文降级）；
 * 渲染失败返回"源码 + 错误信息"降级块（不缓存，下次预览可重试）。
 */
async function renderPlantumlDiagramHtml(source: string): Promise<string | null> {
    if (plantumlLocalUnavailable) {
        return null
    }
    const cacheKey = hashString(source)
    const cachedHtml = getCachedPlantumlHtml(cacheKey)
    if (cachedHtml) {
        return cachedHtml
    }

    const response = await invokePlantumlLocalRender(source)
    if (response.status === 'ok' && typeof response.svg === 'string') {
        const html = wrapPlantumlSvg(response.svg)
        setCachedPlantumlHtml(cacheKey, html)
        return html
    }
    if (response.status === 'unavailable') {
        plantumlLocalUnavailable = true
        logger.warn('[PlantUML] 本地离线渲染不可用，降级为远程/代码块显示:', response.reason)
        return null
    }
    return buildPlantumlErrorHtml(
        source,
        new Error(response.message ?? t('editorUi.render.plantumlUnknownError'))
    )
}

/**
 * PF-08：预渲染 PlantUML 图表 —— 把 ```plantuml 围栏与裸 @startuml 块替换为本地 SVG HTML。
 *
 * 本地不可用（resources 缺失/主进程未接线）时原样返回：
 * - 裸 @startuml 块：交给保留的 markdown-it-plantuml 插件生成原远程 img；
 * - ```plantuml 围栏：保持原代码块高亮行为（修复前即如此），功能不丢失。
 */
export async function preRenderPlantumlProc(text: string): Promise<string> {
    const diagrams = collectPlantumlDiagrams(text)
    if (diagrams.length === 0) {
        return text
    }

    // 同一批内相同源码只渲染一次（共享同一个 Promise）
    const pendingBySource = new Map<string, Promise<string | null>>()
    const tasks = diagrams.map((diagram) => () => {
        const existing = pendingBySource.get(diagram.source)
        if (existing) {
            return existing
        }
        const task = renderPlantumlDiagramHtml(diagram.source)
        pendingBySource.set(diagram.source, task)
        return task
    })
    const renderedHtmlList = await limitConcurrency(tasks, PLANTUML_CONCURRENCY_LIMIT)

    // 从后往前替换，保证前面图块的偏移不被破坏
    let result = text
    for (let index = diagrams.length - 1; index >= 0; index -= 1) {
        const renderedHtml = renderedHtmlList[index]
        if (typeof renderedHtml !== 'string') {
            continue
        }
        const diagram = diagrams[index]
        result = result.slice(0, diagram.start) + renderedHtml + result.slice(diagram.end)
    }
    return result
}

/** 复位本地渲染状态与缓存（单元测试用，避免用例间相互影响） */
export function resetPlantumlLocalRenderState(): void {
    plantumlLocalUnavailable = false
    plantumlHtmlCache.clear()
}

/** PreMarkdownRender 的可选参数（PF-9 超大文档降级） */
export interface PreMarkdownRenderOptions {
    /**
     * 是否跳过图表渲染（mermaid / PlantUML）。
     * 超大文档降级时传 true：图表源码保留为普通代码块（可读、可继续编辑），
     * 避免逐图渲染长时间占用渲染主线程。
     */
    skipDiagrams?: boolean
}

export async function PreMarkdownRender(
    text: string,
    options: PreMarkdownRenderOptions = {}
): Promise<string> {
    if (options.skipDiagrams) {
        // PF-9：超大文档降级——不做 PlantUML/mermaid 渲染（代码块原样交给 markdown-it 高亮）
        return text
    }
    // PF-08：先本地离线渲染 PlantUML（异步 IPC，本地不可用时返回原文），再渲染 mermaid
    let withPlantuml = text
    try {
        withPlantuml = await preRenderPlantumlProc(text)
    } catch (error) {
        logger.warn('[PlantUML] 本地渲染流程异常，已降级为原文:', error)
    }
    return preRenderMermaidProc(withPlantuml)
}

export function ParserMarkdownChapters(md: InstanceType<typeof MarkdownIt>, text: string) {
    // 提取大纲
    // PF-8：原实现用 forEach + `mdTokens.indexOf(token)` 定位下一个 token，每次 indexOf 为 O(n)，
    // 1708 标题/1 MiB 样本实测定位耗时 28.6 ms（整体 O(n²)）。改为单次线性遍历（下标访问），
    // 语义不变：heading_open 之后、heading_close 之前的 inline token 文本即标题文本。
    const headings: MarkdownTOC[] = []
    const mdTokens = md.parse(text, {})
    for (let tokenIndex = 0; tokenIndex < mdTokens.length; tokenIndex += 1) {
        const token = mdTokens[tokenIndex]
        if (token.type !== 'heading_open') {
            continue
        }
        let headingText = ''
        let contentIndex = tokenIndex + 1
        while (contentIndex < mdTokens.length && mdTokens[contentIndex].type !== 'heading_close') {
            const contentToken = mdTokens[contentIndex]
            if (contentToken.type === 'inline' && contentToken.children) {
                for (const child of contentToken.children) {
                    if (child.type === 'text') {
                        headingText += child.content
                    }
                }
            }
            contentIndex += 1
        }

        // PF-14：map[0] 为标题起始行（0 起始），map[1] 为块结束行；
        // 点击目录定位应使用起始行，避免定位偏后
        const lineNumber = token.map ? token.map[0] : 0

        headings.push({
            // PF-14：id 由"标题文本 hash + 起始行号"派生，跨渲染轮次稳定，
            // ResourceManager.vue 目录列表（:key="item.id"）因此获得 diff 复用收益；
            // 行号保证同名标题之间 id 仍唯一
            id: 'toc-' + hashString(headingText) + '-' + lineNumber,
            level: token.tag,
            text: headingText,
            lineNumber: lineNumber
        })
    }
    EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, headings)
}

export function PostMarkdownRender(text: string): string {
    return text
}
