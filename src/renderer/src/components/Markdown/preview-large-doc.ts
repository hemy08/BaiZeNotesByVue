/**
 * preview-large-doc.ts
 * P2-1 大文档预览性能优化：分级降级判定、渐进渲染计划与「降级级别感知」的渲染缓存。
 *
 * 背景（out/tool-results/scan-perf.md P2-1）：
 * - 原 PF-9 只在 >2MiB 或 >5 万行时跳过 KaTeX / mermaid / PlantUML，200KB~1MB 档完全没有保护；
 * - jsdom 实测单轮渲染 50KB≈114ms、200KB≈216ms、1MB≈795ms，其中 DOMPurify 占 74%~85%；
 *   1MB 文档每次输入停顿后都会在主线程上一次性阻塞约 0.8~2s。
 *
 * 本模块把「文档规模 → 渲染策略」收敛为唯一判定入口：
 * 1. 简化档（degraded，>256KiB / >1 万行）：跳过 KaTeX、mermaid/PlantUML 与 hljs 冷门语言
 *    按需预取（保留基础 Markdown + hljs 已注册常用语言 + DOMPurify，任意降级都不绕过消毒）；
 * 2. 渐进档（progressive，>512KiB / >2 万行）：在简化档基础上启用分块 DOMPurify 与
 *    「首块先显示、逐块补全」的渐进渲染（preview-sanitize.ts / 预览组件接入）；
 * 3. 级别感知渲染缓存：大文档整篇渲染结果（已消毒、已应用远程图片策略）按
 *    「级别 + 内容 + 活动文件路径 + 远程图片策略」缓存，避免 AS-9 开关切换 / 撤销回退等
 *    「内容未变但被强制重渲」的场景重复付出整篇渲染成本；不同降级级别绝不会串用缓存。
 *
 * 安全边界：本模块只决定「跳过哪些高成本插件/是否分块」，不产出任何 HTML；
 * 所有 Markdown 产物仍必须经 preview-sanitize.ts 的 DOMPurify 消毒入口。
 */

import { fnv1a32, toRadixString } from '../../../../shared/utils/hash'
import {
    PREVIEW_DEGRADE_FILE_SIZE,
    PREVIEW_DEGRADE_LINES,
    PREVIEW_PROGRESSIVE_FILE_SIZE,
    PREVIEW_PROGRESSIVE_LINES
} from '../../../../shared/constants/limits'

/* ==================== 一、文档规模测量与分级 ==================== */

/** 预览渲染级别：普通 / 简化档 / 渐进档 */
export type PreviewRenderTier = 'normal' | 'degraded' | 'progressive'

/** 文档规模指标（估算值，用于分级判定与诊断） */
export interface PreviewDocumentMetrics {
    /** 估算 UTF-8 字节数（ASCII 1、非 ASCII 3、代理对 4，O(n) 单次线性扫描） */
    estimatedBytes: number
    /** 行数（以 `\n` 计数 + 1） */
    lineCount: number
}

/** 渲染计划：组件按此决定插件加载、防抖与渲染/净化方式 */
export interface PreviewRenderPlan {
    /** 渲染级别 */
    tier: PreviewRenderTier
    /** 是否处于简化档（含渐进档）：跳过 KaTeX / 图表 / 冷门语言预取 */
    degraded: boolean
    /** 是否处于渐进档：分块 DOMPurify + 首块先显示的渐进渲染 */
    progressive: boolean
    /** 是否跳过 KaTeX 公式渲染 */
    skipKatex: boolean
    /** 是否跳过 mermaid / PlantUML 图表渲染 */
    skipDiagrams: boolean
    /** 是否跳过 hljs 冷门语言按需预取（降级时不做任何额外动态 import） */
    skipLazyHighlight: boolean
    /** 是否使用分块 DOMPurify（渐进档为 true） */
    chunkedSanitize: boolean
}

/** 普通文档渲染计划（复用同一实例，避免每轮渲染分配） */
const NORMAL_RENDER_PLAN: PreviewRenderPlan = Object.freeze({
    tier: 'normal',
    degraded: false,
    progressive: false,
    skipKatex: false,
    skipDiagrams: false,
    skipLazyHighlight: false,
    chunkedSanitize: false
})

/** 简化档渲染计划 */
const DEGRADED_RENDER_PLAN: PreviewRenderPlan = Object.freeze({
    tier: 'degraded',
    degraded: true,
    progressive: false,
    skipKatex: true,
    skipDiagrams: true,
    skipLazyHighlight: true,
    chunkedSanitize: false
})

/** 渐进档渲染计划 */
const PROGRESSIVE_RENDER_PLAN: PreviewRenderPlan = Object.freeze({
    tier: 'progressive',
    degraded: true,
    progressive: true,
    skipKatex: true,
    skipDiagrams: true,
    skipLazyHighlight: true,
    chunkedSanitize: true
})

/** 估算 UTF-8 字节数（与 PF-9 原实现逐字一致：ASCII 1、代理对 4、其余 3） */
function estimateUtf8Bytes(text: string): number {
    let bytes = 0
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index)
        if (code < 0x80) {
            bytes += 1
        } else if (code >= 0xd800 && code <= 0xdbff) {
            // 代理对高字节：UTF-8 编码为 4 字节；跳过紧随的低字节
            bytes += 4
            index += 1
        } else {
            bytes += 3
        }
    }
    return bytes
}

/**
 * 完整测量文档规模（诊断与单元测试用；O(n) 单次扫描，不做全文拷贝）。
 * 渲染热路径使用 {@link ResolvePreviewRenderPlan} 的提前退出扫描，不调用本函数。
 */
export function MeasurePreviewDocument(text: string): PreviewDocumentMetrics {
    if (typeof text !== 'string' || text.length === 0) {
        return { estimatedBytes: 0, lineCount: 0 }
    }
    let lineCount = 1
    for (let index = 0; index < text.length; index += 1) {
        if (text.charCodeAt(index) === 10) {
            lineCount += 1
        }
    }
    return { estimatedBytes: estimateUtf8Bytes(text), lineCount }
}

/**
 * 单次线性扫描解析渲染级别（命中渐进档阈值后立即返回，不做无谓的全量统计）。
 *
 * 判定顺序：先把「渐进档」判出来（命中即返回 progressive），否则再看是否越过简化档
 * 阈值（满足任一即 degraded），都不满足为 normal。
 */
function resolveTier(text: string): PreviewRenderTier {
    if (text.length > PREVIEW_PROGRESSIVE_FILE_SIZE) {
        // 纯 ASCII 时 length 即字节数：直接命中渐进档
        return 'progressive'
    }
    let estimatedBytes = 0
    let lineCount = 1
    let degraded = false
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index)
        if (code === 10) {
            lineCount += 1
            if (lineCount > PREVIEW_PROGRESSIVE_LINES) {
                return 'progressive'
            }
            if (!degraded && lineCount > PREVIEW_DEGRADE_LINES) {
                degraded = true
            }
        }
        if (code < 0x80) {
            estimatedBytes += 1
        } else if (code >= 0xd800 && code <= 0xdbff) {
            estimatedBytes += 4
            index += 1
        } else {
            estimatedBytes += 3
        }
        if (estimatedBytes > PREVIEW_PROGRESSIVE_FILE_SIZE) {
            return 'progressive'
        }
        if (!degraded && estimatedBytes > PREVIEW_DEGRADE_FILE_SIZE) {
            degraded = true
        }
    }
    return degraded ? 'degraded' : 'normal'
}

/**
 * 渲染计划缓存（单条目）：同一字符串引用重复判定时直接复用，避免组件内
 * `IsLargePreviewDocument` 与自身各扫描一遍全文（1MB 文档每次省约 2~4ms）。
 * 用 `===` 比较字符串引用：同一内容字符串被重复传入时命中；不同引用退化为重新判定，
 * 只影响性能不影响正确性（判定是纯函数）。
 */
let lastPlanSource: string | null = null
let lastPlanResult: PreviewRenderPlan | null = null

/**
 * 解析文档渲染计划（唯一判定入口，纯函数 + 单条目缓存）。
 *
 * @param text 编辑器原始 Markdown 文本
 * @returns 渲染计划（普通/简化档/渐进档，含各插件跳过标志）
 */
export function ResolvePreviewRenderPlan(text: string): PreviewRenderPlan {
    if (text === lastPlanSource && lastPlanResult) {
        return lastPlanResult
    }
    let plan: PreviewRenderPlan = NORMAL_RENDER_PLAN
    if (typeof text === 'string' && text.length > 0) {
        switch (resolveTier(text)) {
            case 'progressive':
                plan = PROGRESSIVE_RENDER_PLAN
                break
            case 'degraded':
                plan = DEGRADED_RENDER_PLAN
                break
            default:
                plan = NORMAL_RENDER_PLAN
        }
    }
    lastPlanSource = typeof text === 'string' ? text : null
    lastPlanResult = plan
    return plan
}

/** 复位渲染计划缓存（单元测试用，避免用例间串味） */
export function ResetPreviewRenderPlanCache(): void {
    lastPlanSource = null
    lastPlanResult = null
}

/**
 * 低成本「可能达到简化档」预判（骨架屏用，不做全文扫描）：
 * 字符数 ≥ 简化档字节阈值 / 3 时，UTF-8 字节数才可能超过阈值（每字符最多 3 字节）。
 * 允许少量误报（只是提前显示骨架屏），不允许漏报导致大文档白屏。
 */
export function IsPreviewContentProbablyLarge(text: string): boolean {
    return typeof text === 'string' && text.length >= Math.floor(PREVIEW_DEGRADE_FILE_SIZE / 3)
}

/* ==================== 二、级别感知渲染缓存 ==================== */

/** 缓存条目：仅在「大文档 + 内容未变但被强制重渲」场景命中 */
interface PreviewRenderCacheEntry {
    /** 缓存键（含降级级别、策略与路径指纹） */
    key: string
    /** 渲染来源内容（强引用，用于键冲突时逐字符校验，杜绝 FNV-1a 32 位碰撞串用） */
    source: string
    /** 降级级别（缓存键的第一段，杜绝不同模式串用） */
    tier: PreviewRenderTier
    /** 活动文件路径（相对 URL 绝对化的输入，路径变化必须失效） */
    activeFilePath: string
    /** 远程图片策略（策略在消毒后应用，开关变化必须失效） */
    allowRemoteImages: boolean
    /** 已消毒、已应用远程图片策略的最终 HTML */
    html: string
}

/** 缓存条目上限（只保留最近两份大文档，内存有界） */
export const PREVIEW_RENDER_CACHE_MAX_ENTRIES = 2
/** 单个缓存 HTML 字符数上限（4MiB；超过则不入缓存，避免大文档常驻内存膨胀） */
export const PREVIEW_RENDER_CACHE_MAX_HTML_CHARS = 4 * 1024 * 1024

const renderCacheEntries: PreviewRenderCacheEntry[] = []

/** 计算缓存键（同时用于日志/测试断言；键中显式包含降级级别与策略） */
export function BuildPreviewRenderCacheKey(
    plan: PreviewRenderPlan,
    source: string,
    activeFilePath: string,
    allowRemoteImages: boolean
): string {
    return [
        plan.tier,
        allowRemoteImages ? 'remote:1' : 'remote:0',
        String(source.length),
        toRadixString(fnv1a32(source), 16),
        activeFilePath
    ].join('|')
}

/**
 * 读取大文档渲染缓存。
 *
 * 命中条件（全部满足，任一不满足按未命中处理）：
 * 1. 简化档及以上（普通小文档不缓存，避免无意义的常驻内存）；
 * 2. 降级级别、活动文件路径、远程图片策略、内容指纹全部一致；
 * 3. 内容逐字符一致（键中的哈希只做索引，最终以 `source === entry.source` 兜底，
 *    因此 32 位哈希碰撞也不会把另一篇文档的 HTML 串给当前文档）。
 *
 * @returns 已消毒且已应用图片策略的 HTML；未命中返回 null
 */
export function GetCachedPreviewRenderHtml(
    plan: PreviewRenderPlan,
    source: string,
    activeFilePath: string,
    allowRemoteImages: boolean
): string | null {
    if (!plan.degraded || typeof source !== 'string' || source.length === 0) {
        return null
    }
    const key = BuildPreviewRenderCacheKey(plan, source, activeFilePath, allowRemoteImages)
    for (let index = 0; index < renderCacheEntries.length; index += 1) {
        const entry = renderCacheEntries[index]
        if (
            entry.key === key &&
            entry.tier === plan.tier &&
            entry.activeFilePath === activeFilePath &&
            entry.allowRemoteImages === allowRemoteImages &&
            entry.source === source
        ) {
            // 命中提升为最近使用（数组尾部最新）
            renderCacheEntries.splice(index, 1)
            renderCacheEntries.push(entry)
            return entry.html
        }
    }
    return null
}

/**
 * 写入大文档渲染缓存（只缓存简化档及以上、HTML 体积不超过上限的结果）。
 * 缓存值必须是已经 DOMPurify 消毒且已应用远程图片策略的最终 HTML——任何降级/渐进
 * 渲染路径都不得把未消毒内容写入缓存。
 */
export function SetCachedPreviewRenderHtml(
    plan: PreviewRenderPlan,
    source: string,
    activeFilePath: string,
    allowRemoteImages: boolean,
    sanitizedHtml: string
): void {
    if (!plan.degraded || typeof sanitizedHtml !== 'string' || sanitizedHtml.length === 0) {
        return
    }
    if (sanitizedHtml.length > PREVIEW_RENDER_CACHE_MAX_HTML_CHARS) {
        return
    }
    const key = BuildPreviewRenderCacheKey(plan, source, activeFilePath, allowRemoteImages)
    for (let index = 0; index < renderCacheEntries.length; index += 1) {
        if (renderCacheEntries[index].key === key) {
            renderCacheEntries.splice(index, 1)
            break
        }
    }
    while (renderCacheEntries.length >= PREVIEW_RENDER_CACHE_MAX_ENTRIES) {
        renderCacheEntries.shift()
    }
    renderCacheEntries.push({
        key,
        source,
        tier: plan.tier,
        activeFilePath,
        allowRemoteImages,
        html: sanitizedHtml
    })
}

/** 清空大文档渲染缓存（单元测试/诊断用） */
export function ClearPreviewRenderCache(): void {
    renderCacheEntries.length = 0
}

/** 当前渲染缓存条目数（单元测试/诊断用） */
export function GetPreviewRenderCacheSize(): number {
    return renderCacheEntries.length
}
