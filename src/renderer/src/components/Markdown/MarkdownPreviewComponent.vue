<template>
    <!-- eslint-disable vue/no-v-html -- 预览 HTML 为本地渲染管线产物，已经 DOMPurify.sanitize 消毒（见 render 流程 sanitizedHtml），v-html 是 Markdown 富文本预览的唯一渲染方式（文件级 disable，格式化后行号稳定） -->
    <div
        id="markdown-preview-html"
        ref="previewRoot"
        class="markdown-preview-html md-typeset"
        v-html="renderedMarkdownContent"
    ></div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
// 结构优化第 2 批 2.2（H4）：预览只依赖渲染模块（hemy-editor-render），
// 不再经 `hemy-editor` 聚合桶（该桶含 Monaco 编辑器动作/快捷键等），
// 保证预览按需 chunk 不把 Monaco 重新带回来。
import * as Render from './hemy-editor-render'
import { useEventBus } from '../../composables/useEventBus'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import {
    ApplyRemoteImagePolicy,
    EnsurePreviewKatexLoaded,
    getPreviewActiveFilePath,
    getPreviewAllowRemoteImages,
    HemyRenderPostLocal,
    HemyRenderPreLocal,
    IsLargePreviewDocument,
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages,
    type RemoteImagePolicyOptions
} from './preview-local-render'
import { createPreviewMarkdownIt } from './preview-markdown-it'
// P1-8 后续：代码围栏冷门语言按需预取（与 KaTeX 同一异步前置位置，await 后同轮同步渲染即高亮）
import { EnsurePreviewHighlightLanguagesLoaded } from './preview-highlight'
// 批次 C：snippets（--8<--）异步展开 + tab 深链（#__tabbed_N_i）
import { expandSnippetIncludes } from './preview-md-blocks'
import { createTabDeepLinkEnv, getTabTargetByHash } from './preview-mkdocs-material'
import { ComputeChaptersFingerprint } from './preview-chapters'
// CMP-15：XSS 防护 —— DOMPurify 配置与消毒唯一入口统一收敛到 preview-sanitize.ts；
// P2-1：大文档按安全顶层边界分块消毒（块间让出主线程、首块先显示），任何路径都不绕过消毒。
import { SanitizePreviewHtml, SanitizePreviewHtmlInChunks } from './preview-sanitize'
// P2-1：分级降级判定（简化档 >256KiB / >1 万行；渐进档 >512KiB / >2 万行）
// 与「降级级别感知」的大文档渲染缓存（缓存键含级别/路径/远程图片策略，避免不同模式串用）。
import {
    GetCachedPreviewRenderHtml,
    IsPreviewContentProbablyLarge,
    ResolvePreviewRenderPlan,
    SetCachedPreviewRenderHtml
} from './preview-large-doc'
import { getLocale, t } from '../../common/i18n'
import { logger } from '../../common/logger'
import { getBaseName } from '../../../../shared/utils/path'
// P1 性能基线：预览首帧就绪阶段标记（默认关闭，诊断开关下才输出）
import { PERF_MARK, perfMark, perfMeasure } from '../../common/perf'
// AS-9：系统设置契约（远程图片隐私开关 allowRemoteImages 的真源类型）
import type { SystemSetting } from '../../../../shared/types'
// 全局类型 FileProperties 由 src/main/global-types.d.ts 的 declare global 提供（tsconfig.web 已 include）
/* global FileProperties */

// CMP-15：XSS 防护 —— markdown-it 以 html:true 渲染，产物经 v-html 注入前必须消毒。
// 消毒配置（svg + mathMl + file: URI 白名单）与分块净化统一收敛到 preview-sanitize.ts，
// 保证普通/简化档/渐进档/缓存命中所有路径共用同一份 DOMPurify 配置，不存在绕过消毒的降级。

const props = defineProps({
    editorContent: {
        type: String,
        default: ''
    },
    // P1/PF-2：预览是否可见（父组件仅在"预览分区"显示时为 true）。
    // 不可见时跳过整条渲染管线（含 HemyRenderPreLocal / md.render / DOMPurify / v-html），
    // 可见时由 active 的 watch 一次性补渲；默认 true 保持既有调用方行为不变。
    active: {
        type: Boolean,
        default: true
    },
    // 结构优化第 2 批 2.2（H4）：当前活动文件路径（由同步挂载的 MarkdownEditComponent
    // 监听 IPC.FILE.USER_SELECT_FILE 后透传）。预览改为按需 chunk 后可能在「打开文件」
    // 之后才挂载，本 prop 用于补齐首条路径事件，保证相对图片/snippets 解析正确。
    // 默认空串 = 未提供（直接挂载预览的调用方仍走下方 USER_SELECT_FILE 监听，行为不变）。
    activeFilePath: {
        type: String,
        default: ''
    }
})

const renderedMarkdownContent = ref('')
/** P2-1：预览容器（渐进渲染时后续分块直接追加到这里，避免整篇 v-html 二次解析） */
const previewRoot = ref<HTMLElement | null>(null)

// M5：大纲请求事件订阅经 useEventBus 注册，卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'MarkdownPreviewComponent' })

let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null
const RENDER_DEBOUNCE_DELAY = 150

// P0/PF-1：预览 markdown-it 实例统一由 preview-markdown-it.ts 构建
//（关闭 highlightAuto 全语言探测 + 重新赋回带 getLanguage 守卫的 highlight 回调）
const md = createPreviewMarkdownIt()

// P1/PF-2：最近一次成功写入 v-html 的**原始内容**（引用同一字符串，不产生副本）。
// 内容未变化时整轮渲染直接跳过；隐藏期间的变化也以此为准判断是否需要补渲。
let lastRenderedContent: string | null = null
// P1/PF-2：最近一次大纲解析时的「标题候选行」指纹；无标题结构变化时跳过第二次全文解析
let lastChaptersFingerprint: number | null = null

// PF-02：渲染轮次序号——本地链路含 mermaid/PlantUML 异步渲染，快速连续输入时
// 只允许最新一轮的结果写入 v-html，避免旧轮次结果晚到覆盖新内容。
//
// 声明位置约束（TDZ 回归防线）：必须早于下方任何「可能在 setup 阶段同步触发
// updateMarkdownPreview」的 watcher——尤其是 activeFilePath 的 immediate watch。
// 预览在文件已打开之后才挂载时（启动恢复/异步 chunk 时序），该 watcher 会在 setup 内
// 直接调用渲染函数，其同步段会执行 `++renderSequence`；若声明放在 watchers 之后，
// 会抛 `Cannot access 'renderSequence' before initialization`（TDZ ReferenceError）。
let renderSequence = 0

// PF-9：超大文档降级提示（每个文档只提示一次到控制台；预览顶部常驻一条可见提示，
// 说明公式/图表渲染已跳过，避免用户误以为渲染出错）。
// 与 renderSequence 同理：updateMarkdownPreview 的同步段（首个 await 之前）会读写本变量，
// 必须与 renderSequence 一起提前声明。
let degradedWarned = false

// P2-1：v-html 渲染标记自增序号。用于给每次渲染的 v-html 值加一个不可见的渲染序号注释，
// 保证「流式追加模式」下后续渲染轮次一定触发 Vue 的 innerHTML 整体替换，
// 不会因为首块 HTML 字符串恰好相同而残留上一轮的追加内容。
let renderNonce = 0
// P2-1：预览是否已有用户可见内容（决定大文档首次渲染是否启用「首块先显示 + 逐块补全」；
// 已有内容时保持整篇原子替换，避免编辑期间预览内容被截断/闪烁）。
let hasVisiblePreviewContent = false
// P2-1：骨架屏是否正在显示（避免重复写入骨架/误判首屏为空）
let skeletonVisible = false

/**
 * 内存与生命周期治理（P3）：组件是否已卸载。
 *
 * 背景：预览渲染链路包含多处 await（snippets 文件 IPC、KaTeX/hljs 动态 import、
 * PlantUML/mermaid 图表、分块净化）。组件卸载时只清理了防抖计时器与 IPC 监听，
 * 但这些**在途异步任务仍会继续执行**，并在 await 之后写回 `renderedMarkdownContent`
 * / `lastRenderedContent` / `hasVisiblePreviewContent`，甚至经 v-html 触发已卸载
 * 组件的 DOM 更新、继续占用主线程。`loadRemoteImagePolicy()` 在卸载后才返回时同样会
 * 触发一轮完整渲染。这里以卸载标志参与「过期轮次」判定，让所有 await 校验点统一丢弃
 * 卸载后的写回；同时阻止卸载后再排期新的渲染/骨架屏。
 */
let isPreviewUnmounted = false

/** snippets（--8<--）指令标记：含片段展开时结果依赖磁盘文件，不使用渲染缓存 */
const SNIPPET_DIRECTIVE_MARKER = '--8<--'
/** 渲染标记注释前缀（不可见、无渲染成本；用于区分不同渲染轮次的 v-html 值） */
const PREVIEW_RENDER_MARKER_PREFIX = '<!--baize-preview-render:'

// 结构优化第 2 批 2.2（H4）：父组件透传的活动文件路径（懒加载时序兜底，见 props.activeFilePath）。
// 只做非空写入，不覆盖预览自身监听得到的路径；路径变化时触发补渲，让相对 URL 按新文件重算。
watch(
    () => props.activeFilePath,
    (filePath) => {
        if (typeof filePath !== 'string' || filePath.length === 0) {
            return
        }
        setPreviewActiveFilePath(filePath)
        // 内容未变时 updateMarkdownPreview 会命中「已渲染内容」跳过，先清空基准再补渲
        lastRenderedContent = null
        clearRenderDebounceTimer()
        void updateMarkdownPreview()
    },
    { immediate: true }
)

// P1-8：highlight.js 实例（core + 精选常用语言）由 preview-markdown-it.ts 统一引入并注册，
// 本组件不再 import 全量 highlight.js、也不再在挂载时注册 actionscript（已在白名单中）。

/** 清除待执行的预览渲染定时器 */
function clearRenderDebounceTimer(): void {
    if (renderDebounceTimer) {
        clearTimeout(renderDebounceTimer)
        renderDebounceTimer = null
    }
}

/** P2-1：构造本轮 v-html 的渲染标记注释（纯组件内生成的静态字符串，不含用户内容） */
function buildPreviewRenderMarker(nonce: number): string {
    return `${PREVIEW_RENDER_MARKER_PREFIX}${nonce}-->`
}

/**
 * P2-1：组装写入 v-html 的 HTML：渲染标记 + 降级提示条（如需）+ 已消毒内容。
 * 内容部分必须已经过 DOMPurify（preview-sanitize.ts）与远程图片策略处理。
 */
function wrapPreviewHtml(
    nonce: number,
    degraded: boolean,
    progressive: boolean,
    contentHtml: string
): string {
    const notice = degraded ? buildDegradedNoticeHtml(progressive) : ''
    return `${buildPreviewRenderMarker(nonce)}${notice}${contentHtml}`
}

/** 本轮渲染是否已过期（组件已卸载、内容已变化或有更新的渲染轮次） */
function isStaleRender(sequence: number, sourceContent: string): boolean {
    return (
        isPreviewUnmounted || sequence !== renderSequence || props.editorContent !== sourceContent
    )
}

/**
 * P2-1：大文档首屏骨架屏（静态 HTML，无用户内容，不构成注入面）。
 * 仅在「预览尚无内容 + 文档可能达到简化档」时立即显示，避免防抖 + 整篇渲染期间白屏。
 */
function buildProgressiveSkeletonHtml(): string {
    const label = getLocale() === 'en-US' ? 'Rendering large document…' : '正在渲染大文档…'
    const lines = [92, 86, 94, 72, 88, 64]
        .map(
            (width) =>
                `<div class="preview-rendering-skeleton__line" style="width:${width}%"></div>`
        )
        .join('')
    return (
        '<div class="preview-rendering-skeleton" role="status" aria-live="polite">' +
        `<div class="preview-rendering-skeleton__title">${label}</div>` +
        lines +
        '</div>'
    )
}

/** P2-1：内容变化、防抖等待期间立即显示大文档骨架屏（仅大文档 + 预览尚无内容时） */
function scheduleSkeletonIfNeeded(): void {
    if (hasVisiblePreviewContent || skeletonVisible || !props.active) {
        return
    }
    if (!IsPreviewContentProbablyLarge(props.editorContent)) {
        return
    }
    skeletonVisible = true
    renderedMarkdownContent.value = `${buildPreviewRenderMarker(++renderNonce)}${buildProgressiveSkeletonHtml()}`
}

/**
 * P1/PF-2：排期一次防抖渲染。
 * 预览不可见（纯编辑模式）时**不启动定时器**——隐藏期间的任何内容变化都不产生渲染成本，
 * 由 active 的 watch 在重新可见时一次性补渲。
 */
function schedulePreviewRender(): void {
    if (isPreviewUnmounted || !props.active) {
        clearRenderDebounceTimer()
        return
    }
    scheduleSkeletonIfNeeded()
    clearRenderDebounceTimer()
    renderDebounceTimer = setTimeout(() => {
        renderDebounceTimer = null
        void updateMarkdownPreview()
    }, RENDER_DEBOUNCE_DELAY)
}

// 监听 props.editorContent 的变化，并在变化时更新 Markdown（带防抖优化）
watch(
    () => props.editorContent,
    (content) => {
        // P1/PF-2：内容回退到「已渲染内容」（如撤销/快速改回）时取消待执行渲染，整轮跳过
        if (content === lastRenderedContent) {
            clearRenderDebounceTimer()
            return
        }
        schedulePreviewRender()
    },
    { immediate: true }
)

// P1/PF-2：预览分区显示状态切换——从纯编辑模式切回时立即补渲隐藏期间累积的最新内容
watch(
    () => props.active,
    (isActive) => {
        if (!isActive) {
            // 预览被隐藏：取消尚未执行的渲染，隐藏期间变更不占用主线程
            clearRenderDebounceTimer()
            return
        }
        if (props.editorContent !== lastRenderedContent) {
            // 补渲无需再等 150 ms 防抖（用户正在等待预览出现）
            clearRenderDebounceTimer()
            void updateMarkdownPreview()
        }
    }
)

/**
 * 基于编辑器原始内容提取大纲（行号与编辑器一致，PF-14 目录定位依赖）。
 * 供 MONACO_GET_CHAPTERS 主动请求使用；渲染轮次内由指纹判定后再调用。
 */
function UpdateMarkdownChapters() {
    Render.ParserMarkdownChapters(md, props.editorContent)
    // 主动解析后同步指纹基准，避免紧接着的渲染轮次重复解析
    lastChaptersFingerprint = ComputeChaptersFingerprint(props.editorContent)
}

/**
 * PF-9 / P2-1：大文档降级提示条 HTML（中英双语，随当前语言切换）。
 * 纯组件内生成的静态字符串（无用户内容），不构成注入面。
 * @param progressive 渐进档提示「分块渐进渲染」
 */
function buildDegradedNoticeHtml(progressive = false): string {
    const isEnglish = getLocale() === 'en-US'
    let message: string
    if (isEnglish) {
        message = progressive
            ? 'Document is large: preview is streamed progressively (formula and diagram rendering skipped to keep editing responsive).'
            : 'Document is large: preview simplified (formula and diagram rendering skipped to keep editing responsive).'
    } else {
        message = progressive
            ? '文档过大，预览已简化（大文档分块渐进渲染，已跳过公式与图表渲染以保证编辑器流畅可用）。'
            : '文档过大，预览已简化（已跳过公式与图表渲染，以保证编辑器流畅可用）。'
    }
    return `<div class="preview-degraded-notice" role="status" style="margin:0 0 12px;padding:8px 12px;border:1px solid #d97706;border-radius:4px;background:#fffbeb;color:#92400e;font-size:13px;">${message}</div>`
}

/** P2-1：渲染完成后上报 preview-ready 度量（诊断开关关闭时为空操作） */
function reportPreviewReadyAfterDomUpdate(): void {
    void nextTick().then(() => {
        // 内存与生命周期治理（P3）：nextTick 回调可能在卸载后执行，不再做任何上报
        if (isPreviewUnmounted) {
            return
        }
        if (perfMark(PERF_MARK.PREVIEW_READY)) {
            perfMeasure(PERF_MARK.PREVIEW_READY, PERF_MARK.RENDERER_READY)
        }
    })
}

/** P2-1：分块渐进渲染上下文 */
interface ProgressiveRenderContext {
    sequence: number
    sourceContent: string
    renderMarkerNonce: number
    degraded: boolean
    /** 首块先显示 + 逐块追加（仅「预览尚无内容」的大文档首次渲染启用） */
    streaming: boolean
    policyOptions: RemoteImagePolicyOptions
}

/**
 * P2-1：渐进档渲染——分块 DOMPurify（块间让出主线程）+ 首块先显示 / 逐块补全。
 *
 * 安全边界：每一块都必须经 SanitizePreviewHtmlInChunks 内部的 DOMPurify 消毒后才写入 DOM；
 * 分块边界只能落在完整顶层元素上（preview-html-chunks.ts 保守校验，畸形 HTML 自动回退整篇消毒）。
 *
 * 显示策略：
 * - streaming=true（首次渲染且预览为空）：第 1 块写入 v-html，其余块在块间让出主线程后
 *   直接追加到预览容器（避免整篇 HTML 二次解析；后续渲染轮次由渲染标记注释保证整体替换）；
 * - streaming=false（编辑期重渲染）：旧内容保持可见，全部块消毒完成后一次性原子替换，避免闪烁。
 *
 * @returns 已应用远程图片策略的完整 HTML（供渲染缓存复用）；被取消时返回 null
 */
async function renderChunkedPreviewHtml(
    postRenderText: string,
    context: ProgressiveRenderContext
): Promise<string | null> {
    const streamRoot = previewRoot.value
    const policyHtmlChunks: string[] = []
    const finalHtml = await SanitizePreviewHtmlInChunks(postRenderText, {
        isCancelled: () => isStaleRender(context.sequence, context.sourceContent),
        onChunk: async (sanitizedChunk, chunkIndex) => {
            if (isStaleRender(context.sequence, context.sourceContent)) {
                return
            }
            const policyHtml = ApplyRemoteImagePolicy(sanitizedChunk, context.policyOptions)
            policyHtmlChunks.push(policyHtml)
            if (!context.streaming) {
                return
            }
            if (chunkIndex === 0) {
                renderedMarkdownContent.value = wrapPreviewHtml(
                    context.renderMarkerNonce,
                    context.degraded,
                    true,
                    policyHtml
                )
                // 等 Vue 完成 v-html 的首块写入后，才能安全地按块追加 DOM
                await nextTick()
            } else if (streamRoot) {
                streamRoot.insertAdjacentHTML('beforeend', policyHtml)
            }
        }
    })
    if (finalHtml === null) {
        return null
    }
    // 内存与生命周期治理（P3）：分块净化期间组件可能已卸载/内容已变化，
    // 非流式路径在整篇替换前再做一次过期校验，避免卸载后写回 v-html。
    if (isStaleRender(context.sequence, context.sourceContent)) {
        return null
    }
    const appliedPolicyHtml = policyHtmlChunks.length > 0 ? policyHtmlChunks.join('') : finalHtml
    if (!context.streaming) {
        renderedMarkdownContent.value = wrapPreviewHtml(
            context.renderMarkerNonce,
            context.degraded,
            true,
            appliedPolicyHtml
        )
    }
    return appliedPolicyHtml
}

/**
 * PF-02：预览本地单跳渲染链路（全部在渲染进程内完成，无 PRE_RENDER/POST_RENDER IPC 往返）
 * 0. 按 P2-1 分级计划跳过/按需加载 KaTeX 与 hljs 冷门语言；
 * 1. HemyRenderPreLocal：admonition / tabbed / KaTeX / 图片与文件 URL 变换（原主进程 PRE 变换）；
 * 2. PreMarkdownRender：PlantUML 本地渲染 + mermaid 渲染（保持原有渲染层逻辑）；
 * 3. md.render：markdown-it 全量解析 + highlight.js；
 * 4. HemyRenderPostLocal + PostMarkdownRender：渲染层后处理（原主进程 POST 变换，当前为恒等）；
 * 5. preview-sanitize：DOMPurify 消毒（普通/简化档整篇消毒，渐进档分块消毒 + 首块先显示）后写入 v-html。
 *
 * 前置优化（PF-2 / P2-1）：
 * - 预览不可见 / 内容与已渲染内容一致 → 直接返回，不执行任何渲染步骤；
 * - 大纲解析改为「标题候选行指纹变化时才做第二次全文解析」，正常正文编辑不再重复解析；
 * - 异步等待后再次校验内容版本，内容已变化则丢弃本轮结果（连 md.render 都不执行）；
 * - 大文档：简化档（>256KiB / >1 万行）跳过 KaTeX、图表与冷门语言预取并显示提示；
 *   渐进档（>512KiB / >2 万行）再叠加分块 DOMPurify + 首块先显示的渐进渲染；
 * - 级别感知渲染缓存：内容未变但被强制重渲（撤销回退/文件切换回退）时可跳过整篇管线。
 */
async function updateMarkdownPreview() {
    // 内存与生命周期治理（P3）：已卸载后拒绝启动任何新渲染轮次
    //（卸载前发起的异步前置在 await 处由 isStaleRender 丢弃）
    if (isPreviewUnmounted || !props.active) {
        return
    }
    const sourceContent = props.editorContent
    if (sourceContent === lastRenderedContent) {
        return
    }
    const sequence = ++renderSequence
    const renderMarkerNonce = ++renderNonce
    try {
        // P2-1：先做分级判定（单次线性扫描），再决定各高成本插件与净化方式
        const plan = ResolvePreviewRenderPlan(sourceContent)
        // 兼容既有 IsLargePreviewDocument 判定（任一命中即降级），并保留 PF-9 的告警语义
        const degraded = IsLargePreviewDocument(sourceContent) || plan.degraded
        if (degraded && !degradedWarned) {
            degradedWarned = true
            logger.warn(
                '[MarkdownPreview] 文档达到大文档降级阈值，已跳过 KaTeX 与 mermaid/PlantUML 渲染（P2-1）',
                `${sourceContent.length} chars / tier=${plan.tier}`
            )
        } else if (!degraded) {
            degradedWarned = false
        }
        const allowRemoteImages = getPreviewAllowRemoteImages()
        const activeFilePath = getPreviewActiveFilePath() ?? ''
        // 含 snippets 指令时渲染结果依赖磁盘片段文件，不能复用渲染缓存
        const cacheable = !sourceContent.includes(SNIPPET_DIRECTIVE_MARKER)
        // P2-1：大文档渲染缓存（内容未变但被强制重渲时跳过整篇管线；缓存键包含降级级别）
        if (cacheable) {
            const cachedHtml = GetCachedPreviewRenderHtml(
                plan,
                sourceContent,
                activeFilePath,
                allowRemoteImages
            )
            if (cachedHtml !== null) {
                renderedMarkdownContent.value = wrapPreviewHtml(
                    renderMarkerNonce,
                    degraded,
                    plan.progressive,
                    cachedHtml
                )
                hasVisiblePreviewContent = true
                skeletonVisible = false
                lastRenderedContent = sourceContent
                reportPreviewReadyAfterDomUpdate()
                return
            }
        }
        // 批次 C：snippets（--8<-- "file.md"）异步展开——读取当前笔记同目录文本文件；
        // 无活动文件/读取失败/非法路径时保留原文（占位由同步 rule 渲染为普通文本，不中断预览）。
        const snippetExpanded = await expandSnippetIncludes(
            sourceContent,
            getPreviewActiveFilePath(),
            readSnippetFile
        )
        if (isStaleRender(sequence, sourceContent)) {
            return
        }
        // P1-8：KaTeX 与围栏冷门语言包按需加载（同一异步前置位置并行等待）。
        // P2-1：简化档/渐进档跳过这两类额外动态 import（降级档不做任何高成本前置加载）。
        await Promise.all([
            plan.skipKatex ? Promise.resolve(false) : EnsurePreviewKatexLoaded(snippetExpanded),
            plan.skipLazyHighlight
                ? Promise.resolve()
                : EnsurePreviewHighlightLanguagesLoaded(snippetExpanded)
        ])
        if (isStaleRender(sequence, sourceContent)) {
            return
        }
        const preRenderText = HemyRenderPreLocal(snippetExpanded, { skipKatex: degraded })
        const renderedText = await Render.PreMarkdownRender(preRenderText, {
            skipDiagrams: degraded
        })
        // 渲染期间内容已变化（或有更新轮次）：丢弃本轮结果，避免旧结果覆盖新内容/白耗 CPU
        if (isStaleRender(sequence, sourceContent)) {
            return
        }
        // P1/PF-2：大纲基于编辑器原始内容（行号准确），仅当标题候选行指纹变化时才全文解析
        //（复用渲染 tokens 会因 HemyRenderPreLocal 合并换行导致行号漂移，见 preview-chapters.ts）
        const chaptersFingerprint = ComputeChaptersFingerprint(sourceContent)
        if (chaptersFingerprint !== lastChaptersFingerprint) {
            UpdateMarkdownChapters()
            lastChaptersFingerprint = chaptersFingerprint
        }
        // 批次 C：tab 深链属性由 env 开关控制（不传 env 时 HTML 与历史版本一致）
        const renderedHtml = md.render(renderedText, createTabDeepLinkEnv())
        const postRenderText = Render.PostMarkdownRender(HemyRenderPostLocal(renderedHtml))
        if (isStaleRender(sequence, sourceContent)) {
            return
        }
        // CMP-15 / P2-1：渲染结果必须经 DOMPurify 消毒后才能写入 v-html：
        // - 普通/简化档：整篇一次消毒；
        // - 渐进档：分块消毒（块间让出主线程），首块先显示、逐块补全。
        const policyOptions: RemoteImagePolicyOptions = {
            allowRemoteImages,
            blockedLabel: t('dialogRenderer.systemSetting.remoteImageBlocked')
        }
        let finalSanitizedHtml: string | null
        if (plan.progressive) {
            finalSanitizedHtml = await renderChunkedPreviewHtml(postRenderText, {
                sequence,
                sourceContent,
                renderMarkerNonce,
                degraded,
                // 仅大文档首次渲染（预览尚无内容）启用「首块先显示 + 逐块补全」；
                // 编辑期重渲染保持整篇原子替换，避免预览内容被截断/闪烁。
                streaming: !hasVisiblePreviewContent,
                policyOptions
            })
        } else {
            const sanitizedHtml = SanitizePreviewHtml(postRenderText)
            // AS-9（P3 隐私）：远程图片策略在消毒之后执行——此时属性已由浏览器解析器归一化，
            // 拦截结果稳定；被拦截的远程 URL 不写入任何可被请求的属性（src/srcset/data-*），
            // 因此默认（allowRemoteImages=false）不会发起任何远程请求。
            const policyHtml = ApplyRemoteImagePolicy(sanitizedHtml, policyOptions)
            renderedMarkdownContent.value = wrapPreviewHtml(
                renderMarkerNonce,
                degraded,
                false,
                policyHtml
            )
            finalSanitizedHtml = policyHtml
        }
        if (finalSanitizedHtml === null) {
            // 本轮已被更新轮次取消（内容已变化/组件已卸载），丢弃结果
            return
        }
        // 内存与生命周期治理（P3）：渐进档分块净化是长异步链路，返回时组件可能已卸载；
        // 缓存写入与状态更新前再校验一次，避免卸载后继续占用内存与派发 DOM 更新。
        if (isStaleRender(sequence, sourceContent)) {
            return
        }
        // P2-1：缓存「已消毒 + 已应用图片策略」的最终 HTML（仅大文档；缓存键含降级级别）
        if (cacheable && plan.degraded) {
            SetCachedPreviewRenderHtml(
                plan,
                sourceContent,
                activeFilePath,
                allowRemoteImages,
                finalSanitizedHtml
            )
        }
        hasVisiblePreviewContent = true
        skeletonVisible = false
        // 记录本轮已渲染的原始内容（仅在同一引用上赋值，不复制全文）
        lastRenderedContent = sourceContent
        // P1 性能基线：v-html 已写入，等本轮 DOM 更新后标记 preview-ready
        //（诊断开关关闭时 perfMark/perfMeasure 为空操作，不产生额外渲染成本；
        //  perfMark 返回 false 表示已标记过——后续重渲染不再重复上报 measure）
        reportPreviewReadyAfterDomUpdate()
    } catch (error) {
        // 单轮渲染异常时保留上一轮预览内容，避免整块预览白屏
        logger.warn('[MarkdownPreview] 本地渲染失败，已保留上一轮预览:', error)
    }
}

/** 批次 C：snippets 文件读取注入点（复用主进程 READ_HTML 通道：sender 校验 + 路径守卫 + UTF-8 读取） */
async function readSnippetFile(absPath: string): Promise<string | null> {
    try {
        const content = await window.electron.ipcRenderer.invoke(IPC.FILE.READ_HTML, absPath)
        return typeof content === 'string' ? content : null
    } catch (error) {
        logger.warn('[MarkdownPreview] snippets 文件读取失败:', error)
        return null
    }
}

/* ==================== AS-9（P3）：远程图片隐私开关同步 ====================
 * 数据流：SystemSettingDialog → config:write('system') → 主进程 config-manager 持久化
 * 并广播 IPC.SETTING.SYSTEM_SETTING_UPDATE（含 allowRemoteImages）→ 本组件更新模块级策略
 * 并强制重渲一轮（内容未变时 updateMarkdownPreview 会命中 lastRenderedContent 跳过，
 * 所以必须先清空该基准）。
 * 初始值：挂载后经 config:read('system') 读取；读取失败/环境不完整（如单测未 mock
 * window.api）时保持安全默认——不加载远程图片。
 */

/** 应用一次最新的 allowRemoteImages 设置；返回策略是否发生变化 */
function refreshRemoteImagePolicy(allowRemoteImages: unknown): boolean {
    // 内存与生命周期治理（P3）：初始策略读取是异步的，组件可能在读取返回前已卸载；
    // 此时不得再触发一轮渲染（否则会写入已卸载组件的状态、继续执行渲染管线）。
    if (isPreviewUnmounted) {
        return false
    }
    if (typeof allowRemoteImages !== 'boolean') {
        return false
    }
    const changed = allowRemoteImages !== getPreviewAllowRemoteImages()
    setPreviewAllowRemoteImages(allowRemoteImages)
    if (!changed) {
        return false
    }
    // 开关变化：内容本身没变，需显式清空「已渲染内容」基准并立即重渲，让预览按新策略出图
    lastRenderedContent = null
    clearRenderDebounceTimer()
    void updateMarkdownPreview()
    return true
}

/** AS-9：读取系统设置中的远程图片策略（主进程 systemSetting 为唯一真源） */
async function loadRemoteImagePolicy(): Promise<void> {
    try {
        const stored =
            await window.api.config.read<Pick<SystemSetting, 'allowRemoteImages'>>('system')
        if (stored) {
            refreshRemoteImagePolicy(stored.allowRemoteImages)
        }
    } catch (error) {
        logger.warn(
            '[MarkdownPreview] 读取远程图片隐私设置失败，按默认（不加载远程图片）处理（AS-9）',
            error
        )
    }
}

/** AS-9：系统设置变更广播（主进程 config-manager 写入 system 配置后发送） */
const handleSystemSettingUpdate = (
    _event: unknown,
    setting?: Pick<SystemSetting, 'allowRemoteImages'>
): void => {
    refreshRemoteImagePolicy(setting?.allowRemoteImages)
}

// PF-02：当前活动文件路径经既有 USER_SELECT_FILE 事件下发，
// 供本地 URL 绝对化转换（相对图片/文件链接）使用，避免为此新增 IPC 往返。
const handleActiveFileChange = (_event: unknown, filePath: string) => {
    setPreviewActiveFilePath(typeof filePath === 'string' && filePath.length > 0 ? filePath : null)
}

/**
 * 取链接路径中的文件名（预览内点击 `.md` 链接时构造 FileProperties.name）。
 *
 * 迁移（渲染层公共接口归位）：改为复用 `shared/utils/path.getBaseName`
 * （同时识别 `/` 与 `\`，取最后一段）。
 *
 * 顺带修复原实现的 `||` 缺陷变体：原写法
 * `filePath.lastIndexOf('/') || filePath.lastIndexOf('\\')` 在 `/` 恰好位于下标 0 时
 * （根目录文件如 `/README.md`）短路取到 -1，导致返回整条路径；shared 实现按最大值判定，
 * 正确返回 `README.md`。
 */
function parserFileName(filePath: string): string {
    return getBaseName(filePath)
}

function handlePreviewClick(event: MouseEvent) {
    const target = (event.target as HTMLElement).closest('a')
    if (!target) return
    const href = target.getAttribute('href')
    if (!href) return
    // 批次 C：标签页深链（#__tabbed_<setId>_<n> / _label / _panel）→ 选中对应 radio 并滚动
    if (href.startsWith('#__tabbed_')) {
        const tabTarget = getTabTargetByHash(href)
        const previewRootElement = document.getElementById('markdown-preview-html')
        const radio =
            tabTarget && previewRootElement
                ? (previewRootElement.querySelector(
                      `#${tabTarget.radioId}`
                  ) as HTMLInputElement | null)
                : null
        if (tabTarget && radio) {
            event.preventDefault()
            radio.checked = true
            radio.closest('.tabbed-set')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
        return
    }
    event.preventDefault()
    if (href.endsWith('.md')) {
        const fileInfo: FileProperties = {
            name: parserFileName(href),
            path: href,
            type: 'file',
            content: ''
        }
        window.electron.ipcRenderer.send(IPC.FILE.OPEN_SELECT_FILE, fileInfo)
    } else if (href.startsWith('http')) {
        window.open(href, '_blank', 'noopener, noreferrer')
    }
}

onMounted(() => {
    onEventBus(EVENT_BUS.MONACO_GET_CHAPTERS, UpdateMarkdownChapters)
    // PF-02：订阅既有活动文件路径事件（主进程打开/新建文件时下发），供本地 URL 转换使用
    window.electron.ipcRenderer.on(IPC.FILE.USER_SELECT_FILE, handleActiveFileChange)
    // AS-9：远程图片隐私开关——系统设置变更广播 + 初始值读取（默认不加载远程图片）
    window.electron.ipcRenderer.on(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
    void loadRemoteImagePolicy()

    const container = document.getElementById('markdown-preview-html')
    container?.addEventListener('click', handlePreviewClick)
})

onBeforeUnmount(() => {
    // 内存与生命周期治理（P3）：先置卸载标志——让在途异步链路的每个 await 校验点
    //（isStaleRender / updateMarkdownPreview / refreshRemoteImagePolicy）统一丢弃写回，
    // 任何卸载后才返回的异步任务都不会再启动新的渲染轮次。
    isPreviewUnmounted = true
    // EventBus 监听已由 useEventBus 自动清理
    window.electron.ipcRenderer.removeListener(IPC.FILE.USER_SELECT_FILE, handleActiveFileChange)
    window.electron.ipcRenderer.removeListener(
        IPC.SETTING.SYSTEM_SETTING_UPDATE,
        handleSystemSettingUpdate
    )

    const container = document.getElementById('markdown-preview-html')
    container?.removeEventListener('click', handlePreviewClick)

    // 清理防抖定时器
    clearRenderDebounceTimer()
})
</script>

<style>
.katex-math-block {
    text-align: center;
    margin-top: 20px;
    margin-bottom: 20px;
}
.katex-code-block {
    text-align: center;
}
</style>

<style scoped>
/* 第 4 批 4.5（M6）：KaTeX CSS 统一由 src/renderer/src/main.ts 全局引入一次；
   本组件原 `@import 'katex/dist/katex.min.css'` 与主入口重复（katex.css 与
   katex.min.css 内容等价），已删除，避免同一份 KaTeX 样式被打包两次。 */

.markdown-preview-html {
    width: calc(100% - 15px);
    height: 100%;
    margin-left: 15px;
    overflow-y: scroll;
    overflow-x: auto;
    display: inline-block;
}

/* P2-1：大文档首屏骨架屏（仅在简化档/渐进档文档首次渲染且预览为空时短暂出现） */
.preview-rendering-skeleton {
    padding: 16px 4px;
    animation: preview-skeleton-fade-in 120ms ease-out;
}

.preview-rendering-skeleton__title {
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--secondary-text-color, #909399);
}

.preview-rendering-skeleton__line {
    height: 14px;
    margin: 10px 0;
    border-radius: 4px;
    background: linear-gradient(90deg, #ececec 25%, #f5f5f5 37%, #ececec 63%);
    background-size: 400% 100%;
    animation: preview-skeleton-shimmer 1.4s ease infinite;
}

@keyframes preview-skeleton-shimmer {
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0 50%;
    }
}

@keyframes preview-skeleton-fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

/* 代码块样式优化 */
.markdown-preview-html :deep(pre) {
    background-color: #f8f9fa;
    border-radius: 4px;
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
    border: 1px solid #e0e0e0;
}

.markdown-preview-html :deep(code) {
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    color: #333;
}

.markdown-preview-html :deep(pre code) {
    background-color: transparent;
    padding: 0;
    border: none;
}

/* 行内代码样式 */
.markdown-preview-html :deep(p code),
.markdown-preview-html :deep(li code) {
    background-color: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
}

/* 代码高亮样式 */
.markdown-preview-html :deep(.hljs) {
    background-color: #f8f9fa;
    color: #333;
}

.markdown-preview-html :deep(.hljs-comment),
.markdown-preview-html :deep(.hljs-quote) {
    color: #998;
    font-style: italic;
}

.markdown-preview-html :deep(.hljs-keyword),
.markdown-preview-html :deep(.hljs-selector-tag),
.markdown-preview-html :deep(.hljs-subst) {
    color: #333;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-number),
.markdown-preview-html :deep(.hljs-literal),
.markdown-preview-html :deep(.hljs-variable),
.markdown-preview-html :deep(.hljs-template-variable),
.markdown-preview-html :deep(.hljs-tag .hljs-attr) {
    color: #008080;
}

.markdown-preview-html :deep(.hljs-string),
.markdown-preview-html :deep(.hljs-doctag) {
    color: #d14;
}

.markdown-preview-html :deep(.hljs-title),
.markdown-preview-html :deep(.hljs-section),
.markdown-preview-html :deep(.hljs-selector-id) {
    color: #900;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-type),
.markdown-preview-html :deep(.hljs-class .hljs-title) {
    color: #458;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-tag),
.markdown-preview-html :deep(.hljs-name),
.markdown-preview-html :deep(.hljs-attribute) {
    color: #000080;
    font-weight: normal;
}

.markdown-preview-html :deep(.hljs-regexp),
.markdown-preview-html :deep(.hljs-link) {
    color: #009926;
}

.markdown-preview-html :deep(.hljs-symbol),
.markdown-preview-html :deep(.hljs-bullet) {
    color: #990073;
}

.markdown-preview-html :deep(.hljs-built_in),
.markdown-preview-html :deep(.hljs-builtin-name) {
    color: #0086b3;
}

.markdown-preview-html :deep(.hljs-meta) {
    color: #999;
    font-weight: bold;
}

.markdown-preview-html :deep(.hljs-deletion) {
    background: #fdd;
}

.markdown-preview-html :deep(.hljs-addition) {
    background: #dfd;
}

.markdown-preview-html :deep(.hljs-emphasis) {
    font-style: italic;
}

.markdown-preview-html :deep(.hljs-strong) {
    font-weight: bold;
}
</style>
