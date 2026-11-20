/**
 * preview-sanitize.ts
 * P2-1：预览 HTML 的 DOMPurify 消毒唯一入口 + 大文档分块净化。
 *
 * 背景：
 * - CMP-15（XSS 防护）：markdown-it 以 `html: true` 渲染，产物在写入 v-html 前必须经
 *   DOMPurify 消毒。本模块承接原 MarkdownPreviewComponent.vue 内的消毒配置，使「唯一消毒
 *   入口」可被组件、单元测试与性能基准共同复用（避免多处复制配置导致漂移）。
 * - P2-1（大文档预览性能）：1MB 文档的预览 HTML 约 2.6MB，单次 DOMPurify 在 jsdom 下约
 *   900ms，是预览主线程阻塞的主要来源（占 74%~85%）。渐进档对 HTML 做「按完整顶层元素
 *   边界分块消毒」：块内各自消毒、块间让出主线程，既缩短单次长任务，也支持首块先显示。
 *
 * 安全边界（不可放宽）：
 * 1. 任何渲染路径（普通 / 简化档 / 渐进档 / 缓存命中）的 HTML 都必须经过 DOMPurify；
 * 2. 分块边界只取 `preview-html-chunks.ts` 扫描出的「完整顶层元素」边界，扫描失败
 *    （畸形 HTML / 未闭合标签）自动回退整篇消毒，绝不跨标签切分；
 * 3. 每块消毒输出都与整篇消毒使用同一份配置，片段拼接不引入新的注入面
 *    （DOMPurify 输出为良构 HTML，拼接不能重组出脚本标签）。
 */

import DOMPurify from 'dompurify'
import { logger } from '../../common/logger'
import { SplitPreviewHtmlForSanitize, type PreviewHtmlChunkSpan } from './preview-html-chunks'

/**
 * CMP-15：DOMPurify URI 白名单。
 *
 * 默认 URI 白名单不允许 file: 协议，本地相对路径图片（预览管线已转换为 file:// 绝对 URL）
 * 的 src 会被剥离导致图片不显示；基于默认白名单追加 file:（file: 仅作为 img 等资源 URL
 * 使用，不承载脚本执行能力）。
 *
 * 2026-11-20（file:// → app:// 迁移）：app:// 模式下本地图片改由 `app://local/<绝对路径>`
 * 提供（file:// 在 fuse 关闭后不可用），URI 白名单追加 app 协议；file: 保留以兼容
 * Vite dev server 模式（app:// 开关关闭时仍生成 file:// URL）。
 */
export const DOMPURIFY_ALLOWED_URI_REGEXP =
    /^(?:(?:(?:f|ht)tps?|file|app|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

/**
 * CMP-15：DOMPurify 配置（预览唯一真源）。
 * - svg/svgFilters：保留 mermaid 渲染的 SVG 图表（含 foreignObject/marker/style 等）；
 * - mathMl：保留 KaTeX 公式输出的 MathML（可访问性层）；
 * - highlight.js 高亮仅使用 class 属性，不受消毒影响。
 */
export const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ALLOWED_URI_REGEXP: DOMPURIFY_ALLOWED_URI_REGEXP
}

/** 渐进档单块目标字符数（128KiB/html）：块间让出主线程，jsdom 下单块消毒约 40~60ms */
export const PREVIEW_SANITIZE_CHUNK_CHARS = 128 * 1024

/**
 * 整篇消毒（普通/简化档与所有回退路径的唯一入口）。
 * @param html md.render 产物（未经消毒，可能包含恶意 HTML）
 * @returns 消毒后的良构 HTML（可直接写入 v-html）
 */
export function SanitizePreviewHtml(html: string): string {
    if (typeof html !== 'string' || html.length === 0) {
        return ''
    }
    return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as string
}

/** 分块扫描失败告警只提示一次（避免每轮渲染刷屏） */
let chunkFallbackWarned = false

/** 复位分块回退告警状态（单元测试用） */
export function ResetPreviewSanitizeWarningState(): void {
    chunkFallbackWarned = false
}

/**
 * 计算分块数量（诊断/单元测试用；回退整篇消毒时为 1）。
 * @param html 未消毒 HTML
 * @param targetChars 目标块字符数（缺省 128KiB）
 */
export function CountPreviewSanitizeChunks(
    html: string,
    targetChars: number = PREVIEW_SANITIZE_CHUNK_CHARS
): number {
    if (typeof html !== 'string' || html.length === 0) {
        return 0
    }
    const spans = SplitPreviewHtmlForSanitize(html, targetChars)
    return spans === null || spans.length === 0 ? 1 : spans.length
}

/** 分块消毒选项 */
export interface PreviewSanitizeChunkOptions {
    /** 目标块字符数（缺省 128KiB） */
    chunkChars?: number
    /** 是否在块间让出主线程（缺省 true；渐进渲染必须让出，单元测试可关闭以获得确定性） */
    yieldBetweenChunks?: boolean
    /** 取消回调：返回 true 时停止后续块并返回 null（内容已变化/有更新渲染轮次） */
    isCancelled?: () => boolean
    /** 每块消毒完成后的回调（用于首块先显示/逐块追加；抛错会中断本轮并向上传递） */
    onChunk: (
        sanitizedChunk: string,
        chunkIndex: number,
        chunkCount: number
    ) => void | Promise<void>
}

/** 让出主线程一个宏任务（setTimeout 0：在浏览器/Electron 中会先处理输入与渲染帧） */
function yieldToMainThread(): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
    })
}

/** 拼接分块结果（chunkSpans 为 null 表示整篇） */
function resolveChunkSpans(html: string, chunkChars: number): PreviewHtmlChunkSpan[] | null {
    return SplitPreviewHtmlForSanitize(html, chunkChars)
}

/**
 * 分块净化大文档 HTML：按安全块边界逐块消毒，可选块间让出主线程。
 *
 * - 无法确定安全边界（畸形/未闭合原始 HTML）→ 回退整篇 {@link SanitizePreviewHtml}，
 *   仍然只调用一次 onChunk（块数 1），不改变安全语义；
 * - 块数 ≤ 1（单一大顶层元素 / 整篇消毒回退）→ 不做分块开销，直接整篇消毒；
 * - 任何一块消毒后的输出都会立刻交给 onChunk（渐进渲染在首块回调时即可写入 v-html）。
 *
 * @param html 未消毒 HTML（md.render 产物）
 * @param options 分块选项（onChunk 必填）
 * @returns 拼接后的完整消毒 HTML；被取消时返回 null（调用方丢弃本轮结果）
 */
export async function SanitizePreviewHtmlInChunks(
    html: string,
    options: PreviewSanitizeChunkOptions
): Promise<string | null> {
    if (typeof html !== 'string' || html.length === 0) {
        if (options.isCancelled?.()) {
            return null
        }
        await options.onChunk('', 0, 1)
        return ''
    }
    if (options.isCancelled?.()) {
        return null
    }
    const chunkChars = options.chunkChars ?? PREVIEW_SANITIZE_CHUNK_CHARS
    const spans = resolveChunkSpans(html, chunkChars)
    if (spans === null) {
        if (!chunkFallbackWarned) {
            chunkFallbackWarned = true
            logger.warn(
                '[PreviewSanitize] HTML 顶层结构无法安全分块，已回退整篇 DOMPurify 消毒（不跨标签切分）'
            )
        }
        const sanitized = SanitizePreviewHtml(html)
        await options.onChunk(sanitized, 0, 1)
        return sanitized
    }
    if (spans.length <= 1) {
        const sanitized = SanitizePreviewHtml(html)
        await options.onChunk(sanitized, 0, 1)
        return sanitized
    }
    const chunkCount = spans.length
    const sanitizedChunks: string[] = new Array(chunkCount)
    const shouldYield = options.yieldBetweenChunks !== false
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        if (options.isCancelled?.()) {
            return null
        }
        const span = spans[chunkIndex]
        const sanitizedChunk = SanitizePreviewHtml(html.slice(span.start, span.end))
        sanitizedChunks[chunkIndex] = sanitizedChunk
        await options.onChunk(sanitizedChunk, chunkIndex, chunkCount)
        if (shouldYield && chunkIndex < chunkCount - 1) {
            await yieldToMainThread()
        }
    }
    if (options.isCancelled?.()) {
        return null
    }
    return sanitizedChunks.join('')
}
