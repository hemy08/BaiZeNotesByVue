<template>
    <!-- PDF 查看器：三态容器 / 工具栏 / 空态由 FileViewerShell 统一提供，
         本组件只保留 PDF 特有部分（pdf.js 渲染、翻页、缩放、资源管理器定位）。
         1.5.2 E2：能力开关 featurePdfAnnotations 开启时，内容区额外渲染 pdf.js 文本层、
         标注高亮 overlay、标注工具栏按钮与标注列表面板；关闭时与既有实现完全一致。 -->
    <FileViewerShell
        :is-loading="isLoading"
        :error-message="errorMessage"
        :has-content="hasContent"
        :file-path="filePath"
        :loading-text="loadingText"
        :empty-text="emptyText"
        container-class="pdf-view-container"
        content-wrapper-class="pdf-content-wrapper"
        toolbar-class="pdf-toolbar"
        @retry="retry"
    >
        <template #toolbar-actions>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.hemyTools.pdfView.prevPage')"
                :disabled="pageNumber <= 1"
                @click="prevPage"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
            <span class="page-indicator">{{ pageNumber }} / {{ numPages }}</span>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.hemyTools.pdfView.nextPage')"
                :disabled="pageNumber >= numPages"
                @click="nextPage"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
            <!-- 1.5.2 E2：标注入口（能力开关关闭时不渲染，工具栏按钮数量与既有行为一致） -->
            <template v-if="annotationsEnabled">
                <button
                    class="toolbar-btn pdf-annotation-add-btn"
                    :title="addAnnotationTitle"
                    :disabled="!canAddAnnotation"
                    @click="handleAddAnnotation"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                </button>
                <button
                    class="toolbar-btn pdf-annotation-list-btn"
                    :class="{ active: showAnnotationPanel }"
                    :title="t('toolsNetwork.hemyTools.pdfView.annotations.annotationList')"
                    @click="toggleAnnotationPanel"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </button>
            </template>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.hemyTools.pdfView.zoomIn')"
                @click="zoomIn"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
            </button>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.hemyTools.pdfView.zoomOut')"
                @click="zoomOut"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
            </button>
            <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
            <button
                class="toolbar-btn"
                :title="t('workspace.resourceContext.openInExplorer')"
                @click="revealInExplorer"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </button>
        </template>
        <template #content>
            <!-- 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js（pdfjs-dist）渲染到 canvas。
                 原方案依赖 Electron 内置 PDF 查看器（iframe/webview），在部分环境不可用且
                 与 CSP/沙箱约束耦合；pdf.js 方案不依赖内置查看器，路径经主进程 Path Guard
                 校验后用 FILE.READ_BINARY 读取原始字节。
                 1.5.2 E2：canvas 外套一层定位容器，叠加 pdf.js TextLayer（可选中文本）与
                 标注高亮 overlay；层尺寸与 canvas 完全一致，随翻页/缩放重建。 -->
            <div class="pdf-viewer-body">
                <div class="pdf-canvas-scroll">
                    <div class="pdf-page-stage" :style="pageStageStyle">
                        <canvas ref="canvasRef" class="pdf-canvas"></canvas>
                        <div
                            v-if="annotationsEnabled"
                            ref="textLayerRef"
                            class="pdf-text-layer"
                            @mouseup="handleSelectionChanged"
                            @keyup="handleSelectionChanged"
                        ></div>
                        <div
                            v-if="annotationsEnabled && currentPageHighlights.length > 0"
                            class="pdf-annotation-layer"
                            aria-hidden="true"
                        >
                            <div
                                v-for="highlight in currentPageHighlights"
                                :key="highlight.key"
                                class="pdf-annotation-highlight"
                                :style="highlight.style"
                            ></div>
                        </div>
                    </div>
                </div>
                <!-- 1.5.2 E2：标注列表面板（内联下拉，避免新增对话框；开关关闭时不渲染） -->
                <div
                    v-if="annotationsEnabled && showAnnotationPanel"
                    class="pdf-annotation-panel"
                    role="region"
                    :aria-label="t('toolsNetwork.hemyTools.pdfView.annotations.annotationList')"
                >
                    <div class="pdf-annotation-panel-header">
                        <span class="pdf-annotation-panel-title">
                            {{
                                t(
                                    'toolsNetwork.hemyTools.pdfView.annotations.annotationListTitle',
                                    {
                                        count: annotations.length
                                    }
                                )
                            }}
                        </span>
                        <button
                            class="toolbar-btn pdf-annotation-panel-close"
                            :title="
                                t('toolsNetwork.hemyTools.pdfView.annotations.annotationPanelClose')
                            "
                            @click="showAnnotationPanel = false"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                            >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <p
                        v-if="annotations.length === 0"
                        class="pdf-annotation-empty pdf-annotation-panel-empty"
                    >
                        {{ t('toolsNetwork.hemyTools.pdfView.annotations.annotationEmpty') }}
                    </p>
                    <ul v-else class="pdf-annotation-list">
                        <li
                            v-for="annotation in annotations"
                            :key="annotation.id"
                            class="pdf-annotation-item"
                        >
                            <button
                                class="pdf-annotation-page-chip"
                                :title="
                                    t('toolsNetwork.hemyTools.pdfView.annotations.annotationJump', {
                                        page: annotation.page
                                    })
                                "
                                @click="void goToAnnotationPage(annotation.page)"
                            >
                                {{
                                    t(
                                        'toolsNetwork.hemyTools.pdfView.annotations.annotationPageChip',
                                        { page: annotation.page }
                                    )
                                }}
                            </button>
                            <div class="pdf-annotation-item-body">
                                <p class="pdf-annotation-text">{{ annotation.text }}</p>
                                <div class="pdf-annotation-meta">
                                    <span class="pdf-annotation-time">
                                        {{ formatAnnotationTime(annotation.createdAt) }}
                                    </span>
                                    <button
                                        class="pdf-annotation-action"
                                        :disabled="excerptingAnnotationId === annotation.id"
                                        @click="void handleExcerptAnnotation(annotation)"
                                    >
                                        {{
                                            t(
                                                'toolsNetwork.hemyTools.pdfView.annotations.annotationExcerpt'
                                            )
                                        }}
                                    </button>
                                    <button
                                        class="pdf-annotation-action pdf-annotation-action-danger"
                                        :title="
                                            t(
                                                'toolsNetwork.hemyTools.pdfView.annotations.annotationDelete'
                                            )
                                        "
                                        @click="handleDeleteAnnotation(annotation.id)"
                                    >
                                        {{ t('common.delete') }}
                                    </button>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </template>
    </FileViewerShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '../../common/i18n'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import FileViewerShell from './FileViewerShell.vue'
import { FileViewerLoadError, useFileViewerState } from '../../composables/useFileViewerState'
import type { FileLoadContext } from '../../composables/useFileViewerState'
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import {
    addPdfAnnotation,
    excerptPdfAnnotation,
    loadPdfAnnotations,
    removePdfAnnotation,
    savePdfAnnotations
} from '../../common/pdf-annotations-actions'
import { sanitizePdfAnnotationRects } from '../../../../shared/constants/pdf-annotations'
import type { PdfAnnotation, PdfAnnotationRect } from '../../../../shared/types/pdf-annotations'
import { debounce } from '../../../../shared/utils/debounce'
import { formatDateTime } from '../../../../shared/utils/date'

// pdf.js worker：由 Vite 打包为独立资源（CSP worker-src 已放行 'self'/blob:）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** PDF 查看器文案 key（集中定义，避免加载/渲染/错误分支各写一份字符串） */
const PDF_TEXT_KEYS = {
    loading: 'toolsNetwork.hemyTools.pdfView.loading',
    empty: 'toolsNetwork.hemyTools.pdfView.empty',
    unreadable: 'toolsNetwork.hemyTools.pdfView.unreadable',
    loadFailed: 'toolsNetwork.hemyTools.pdfView.loadFailed',
    fileNotFound: 'toolsNetwork.hemyTools.pdfView.fileNotFound'
} as const

/** 能力开关（1.5.2 E2：PDF 标注与摘录，默认关闭） */
const { flags } = useFeatureFlags()
/** 标注能力是否开启；关闭时文本层/标注 UI 均不渲染，也不会调用两个新 IPC 通道 */
const annotationsEnabled = computed(() => flags.pdfAnnotations === true)

// 响应式数据（路径/三态/重试由 useFileViewerState 统一维护）
const zoomLevel = ref<number>(1)
const pageNumber = ref<number>(1)
const numPages = ref<number>(0)
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** pdf.js 文本层容器（仅能力开关开启时渲染） */
const textLayerRef = ref<HTMLDivElement | null>(null)

/**
 * 页面定位容器 CSS 变量（pdf.js TextLayer 布局依赖）：
 * - `--total-scale-factor` 与 canvas 渲染缩放同源（viewport.scale === zoomLevel）；
 * - `--scale-round-x/y` 供 pdf.js `setLayerDimensions` 的 CSS `round()` 使用。
 * 通过模板 :style 绑定而非直接操作 DOM 样式，保持「主题/样式写入单真源」静态护栏可校验。
 */
const pageStageStyle = computed(() => ({
    '--total-scale-factor': String(zoomLevel.value),
    '--scale-round-x': '1px',
    '--scale-round-y': '1px'
}))

// ============ 1.5.2 E2：标注状态 ============
/** 当前 PDF 的标注列表（已归一化并按 page/createdAt/id 稳定排序） */
const annotations = ref<PdfAnnotation[]>([])
/** 当前标注所属 PDF 路径（侧车读写依据；与 filePath 分离，便于 onReset 时先落盘再清空） */
const annotationsPdfPath = ref<string>('')
/** 标注列表面板是否展开 */
const showAnnotationPanel = ref<boolean>(false)
/** 正在摘录的标注 id（防重复点击，按钮展示禁用态） */
const excerptingAnnotationId = ref<string>('')

/** 文本选择捕获结果（相对页面的归一化矩形 + 选中文本） */
interface PendingPdfSelection {
    text: string
    rects: PdfAnnotationRect[]
}

/** 最近一次用户在文本层中的选择（点「添加标注」时取用；无选择时为 null） */
const pendingSelection = ref<PendingPdfSelection | null>(null)

/** 当前页标注的高亮矩形（相对页面百分比定位；只在当前页渲染） */
const currentPageHighlights = computed(() => {
    const highlights: Array<{ key: string; style: Record<string, string> }> = []
    for (const annotation of annotations.value) {
        if (annotation.page !== pageNumber.value) {
            continue
        }
        annotation.rects.forEach((rect, index) => {
            highlights.push({
                key: `${annotation.id}-${index}`,
                style: {
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.w * 100}%`,
                    height: `${rect.h * 100}%`
                }
            })
        })
    }
    return highlights
})

/** 「添加标注」按钮是否可用：已选中文本 + 已加载 PDF 路径 */
const canAddAnnotation = computed(
    () =>
        annotationsEnabled.value &&
        annotationsPdfPath.value.length > 0 &&
        pendingSelection.value !== null &&
        pendingSelection.value.text.trim().length > 0
)

/** 「添加标注」按钮 title：未选择文本时提示先选择 */
const addAnnotationTitle = computed(() =>
    canAddAnnotation.value
        ? t('toolsNetwork.hemyTools.pdfView.annotations.addAnnotation')
        : t('toolsNetwork.hemyTools.pdfView.annotations.annotationSelectHint')
)

/**
 * 标注保存防抖（300ms）：连续添加/删除只落盘一次；切文件/卸载时 flush 立即写盘。
 * 保存失败提示与日志由 `savePdfAnnotations` 统一处理（LOG-08 禁止静默失败）。
 */
const debouncedAnnotationSave = debounce(() => {
    void persistAnnotations()
}, 300)

/** 立即把当前标注写入侧车（幂等；路径为空时跳过） */
async function persistAnnotations(): Promise<void> {
    const path = annotationsPdfPath.value
    if (path.length === 0) {
        return
    }
    // 不在这里按能力开关门控：防抖窗口内用户可能刚关闭能力开关，
    // 但这条保存来自「开关开启期间」的用户编辑，必须落盘（避免标注丢失）。
    // 「关闭时零行为变化」由 UI 不渲染入口 + load/save 的调用时机共同保证。
    await savePdfAnnotations(path, annotations.value)
}

/** 调度一次防抖保存（添加/删除标注后调用） */
function scheduleAnnotationSave(): void {
    debouncedAnnotationSave()
}

/** 当前 PDF 文件名（标注列表/摘录来源行展示；filePath 末尾兜底） */
function resolvePdfFileName(): string {
    if (fileName.value.length > 0) {
        return fileName.value
    }
    const path = filePath.value
    if (path.length === 0) {
        return ''
    }
    const segments = path.split(/[\\/]/u)
    return segments[segments.length - 1] ?? ''
}

/** 标注创建时间展示（异常时间原样兜底，不显示 Invalid Date） */
function formatAnnotationTime(createdAt: string): string {
    const date = new Date(createdAt)
    return Number.isNaN(date.getTime()) ? createdAt : formatDateTime(date, 'YYYY-MM-DD HH:mm')
}

/** 切换标注列表面板 */
function toggleAnnotationPanel(): void {
    showAnnotationPanel.value = !showAnnotationPanel.value
}

/** 清空浏览器原生文本选择（添加标注后避免残留高亮） */
function clearBrowserSelection(): void {
    if (typeof window === 'undefined' || typeof window.getSelection !== 'function') {
        return
    }
    try {
        window.getSelection()?.removeAllRanges()
    } catch {
        // 极简测试环境无 Selection 实现：忽略
    }
}

/**
 * 读取文本层中的当前选择并换算为相对页面的归一化矩形。
 *
 * 换算基准是 canvas 的包围盒（canvas 与文本层同尺寸），因此与缩放比例、窗口尺寸、
 * 滚动位置无关；矩形再交由 shared `sanitizePdfAnnotationRects` 清洗（clamp + 上限 200）。
 *
 * @returns 选择结果；无选择/空文本返回 null
 */
function readSelectionFromPage(): PendingPdfSelection | null {
    if (
        typeof window === 'undefined' ||
        typeof window.getSelection !== 'function' ||
        !annotationsEnabled.value
    ) {
        return null
    }
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return null
    }
    const text = selection.toString()
    if (text.trim().length === 0) {
        return null
    }
    const canvas = canvasRef.value
    const rects: PdfAnnotationRect[] = []
    if (canvas) {
        const base = canvas.getBoundingClientRect()
        if (base.width > 0 && base.height > 0) {
            for (let index = 0; index < selection.rangeCount; index += 1) {
                const range = selection.getRangeAt(index)
                const clientRects = range.getClientRects()
                for (let rectIndex = 0; rectIndex < clientRects.length; rectIndex += 1) {
                    const clientRect = clientRects[rectIndex]
                    if (clientRect.width <= 0 || clientRect.height <= 0) {
                        continue
                    }
                    rects.push({
                        x: (clientRect.left - base.left) / base.width,
                        y: (clientRect.top - base.top) / base.height,
                        w: clientRect.width / base.width,
                        h: clientRect.height / base.height
                    })
                }
            }
        }
    }
    return { text, rects: sanitizePdfAnnotationRects(rects) }
}

/** 文本层选择变化（mouseup / keyup）：记录最近一次选择，供「添加标注」使用 */
function handleSelectionChanged(): void {
    pendingSelection.value = readSelectionFromPage()
}

/** 添加标注：记录当前页 + 选中文本 + 相对矩形，随后防抖落盘 */
function handleAddAnnotation(): void {
    const selection = pendingSelection.value
    const path = annotationsPdfPath.value
    if (!selection || path.length === 0 || !annotationsEnabled.value) {
        return
    }
    const next = addPdfAnnotation(annotations.value, {
        page: pageNumber.value,
        text: selection.text,
        rects: selection.rects
    })
    if (next === null) {
        return
    }
    annotations.value = next
    pendingSelection.value = null
    clearBrowserSelection()
    scheduleAnnotationSave()
}

/** 删除标注（当前页高亮与列表同步移除，随后防抖落盘） */
function handleDeleteAnnotation(annotationId: string): void {
    if (annotationsPdfPath.value.length === 0) {
        return
    }
    const next = removePdfAnnotation(annotations.value, annotationId)
    if (next.length === annotations.value.length) {
        return
    }
    annotations.value = next
    scheduleAnnotationSave()
}

/** 摘录一条标注：插入当前活动笔记，无编辑器时回退剪贴板（提示由 actions 负责） */
async function handleExcerptAnnotation(annotation: PdfAnnotation): Promise<void> {
    if (excerptingAnnotationId.value.length > 0) {
        return
    }
    excerptingAnnotationId.value = annotation.id
    try {
        await excerptPdfAnnotation(annotation, resolvePdfFileName())
    } finally {
        excerptingAnnotationId.value = ''
    }
}

/** 跳转到标注所在页（面板保持展开，便于连续浏览） */
async function goToAnnotationPage(page: number): Promise<void> {
    const target = Math.min(Math.max(1, page), Math.max(1, numPages.value))
    if (target === pageNumber.value) {
        return
    }
    pageNumber.value = target
    await renderPage(target)
}

/** 加载当前 PDF 的标注（失败返回空数组并由 actions 给出可见提示，不阻塞预览） */
async function loadAnnotationsForPdf(path: string): Promise<void> {
    if (!annotationsEnabled.value || path.length === 0) {
        return
    }
    const loaded = await loadPdfAnnotations(path, { enabled: annotationsEnabled.value })
    // 加载期间切换了文件：丢弃过期结果
    if (annotationsPdfPath.value !== path) {
        return
    }
    annotations.value = loaded
}

/** 当前 pdf.js 文档句柄（卸载/重新加载时销毁） */
let pdfDocument: PDFDocumentProxy | null = null
/** getDocument 返回的加载任务（销毁文档与 worker 资源的入口） */
let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null
/** 当前渲染任务句柄（仅最新一次渲染持有，避免并发渲染同一 canvas） */
let renderTask: { cancel: () => void } | null = null
/** 渲染代次：每次 renderPage 递增，旧任务的异步回调据此丢弃写回 */
let renderToken = 0
/** 当前 pdf.js 文本层实例（切页/缩放/关闭能力时取消并清空） */
let currentTextLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null

/** 销毁当前文本层（取消在途渲染并清空 DOM；可重复调用） */
function disposeTextLayer(): void {
    if (currentTextLayer) {
        try {
            currentTextLayer.cancel()
        } catch {
            // 取消已结束/已取消的文本层任务忽略
        }
        currentTextLayer = null
    }
    if (textLayerRef.value) {
        textLayerRef.value.textContent = ''
    }
}

/** 是否为 pdf.js 文本层取消异常（切页/缩放/能力关闭时的正常路径，需静默） */
function isTextLayerCancelled(error: unknown): boolean {
    const candidate = error as { name?: string; message?: string } | null
    return (
        candidate?.name === 'AbortException' ||
        (typeof candidate?.message === 'string' && candidate.message.includes('cancel'))
    )
}

/**
 * 为当前页渲染 pdf.js 文本层（可选中文本，供「添加标注」使用）。
 *
 * pdfjs-dist 6.x 提供 `TextLayer` 类：`new TextLayer({ textContentSource, container, viewport })`
 * 后 `await render()` 即可把透明文本 span 定位到页面坐标（容器尺寸/字号由 CSS 变量
 * `--total-scale-factor` 驱动，与 canvas 像素尺寸严格对齐）。旧版/测试替身缺少
 * `streamTextContent` 时回退 `getTextContent()`（TextLayer 同样接受 TextContent 对象）。
 *
 * @param pdfPage 当前页代理
 * @param viewport 本次渲染使用的 viewport（与 canvas 尺寸同源）
 * @param token 本次渲染代次（过期/卸载/切页后丢弃结果）
 */
async function renderTextLayer(
    pdfPage: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
    viewport: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['getViewport']>,
    token: number
): Promise<void> {
    const container = textLayerRef.value
    if (!container) {
        return
    }
    disposeTextLayer()
    // 文本层尺寸/字号与 canvas 像素同源：--total-scale-factor 由模板 :style 绑定 zoomLevel
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer>
    try {
        const textContentSource =
            typeof pdfPage.streamTextContent === 'function'
                ? pdfPage.streamTextContent()
                : await pdfPage.getTextContent()
        textLayer = new pdfjsLib.TextLayer({ textContentSource, container, viewport })
        currentTextLayer = textLayer
        await textLayer.render()
    } catch (error) {
        if (token !== renderToken || isUnmounted() || isTextLayerCancelled(error)) {
            return
        }
        // 文本层失败不影响 canvas 预览：记录 WARN 即可（标注功能在无文本层时缺少选择能力）
        logger.warn('PDF 文本层渲染失败（标注选择不可用，canvas 预览不受影响）:', error)
        return
    }
    if (token !== renderToken || isUnmounted() || !annotationsEnabled.value) {
        // 渲染期间已切页/缩放/关闭能力：销毁本次文本层
        if (currentTextLayer === textLayer) {
            try {
                textLayer.cancel()
            } catch {
                /* 忽略取消失败 */
            }
            currentTextLayer = null
        }
        container.textContent = ''
    }
}

/** 销毁当前 PDF 文档与渲染任务 */
function disposePdfDocument(): void {
    // 使在途渲染任务全部过期，避免销毁后旧任务继续写回 canvas / 清掉新任务句柄
    renderToken += 1
    disposeTextLayer()
    if (renderTask) {
        try {
            renderTask.cancel()
        } catch {
            // 取消失败的渲染任务忽略
        }
        renderTask = null
    }
    if (loadingTask) {
        // LoadingTask.destroy() 会销毁文档并回收 worker 资源（pdfjs 官方推荐入口）
        void loadingTask.destroy()
        loadingTask = null
    }
    pdfDocument = null
}

/** 判断是否 pdf.js 渲染取消异常（翻页/缩放/重新加载时的正常路径，需静默） */
function isRenderingCancelled(error: unknown): boolean {
    return (error as { name?: string } | null)?.name === 'RenderingCancelledException'
}

/**
 * 加载 PDF 文件（主进程读取原始字节 → pdf.js 解析）
 *
 * 并发/卸载保护由 composable 提供的 FileLoadContext 承担：进入时已递增加载代次，
 * 本函数在每个 await 之后校验代次，过期请求直接返回且不写任何状态，避免旧请求的
 * 失败/成功覆盖新请求的结果；组件卸载后 context.isStale() 恒为 true。
 *
 * @param path PDF 文件完整路径
 * @param context 加载上下文（代次/卸载守卫）
 * @returns pdf.js 文档句柄；null 表示内容不可读（空字节/无有效页面）
 * @throws FileViewerLoadError 文件不存在（可预期失败，按 i18n key 提示）
 */
async function loadPdfFile(
    path: string,
    context: FileLoadContext
): Promise<PDFDocumentProxy | null> {
    const exists = await window.electron.ipcRenderer.invoke(IPC.FILE.CHECK_EXISTS, path)
    if (context.isStale()) {
        return null
    }
    if (!exists) {
        throw new FileViewerLoadError(PDF_TEXT_KEYS.fileNotFound)
    }
    // Uint8Array（IPC 结构化克隆）→ pdf.js getDocument
    const data = (await window.electron.ipcRenderer.invoke(
        IPC.FILE.READ_BINARY,
        path
    )) as Uint8Array | null
    if (context.isStale()) {
        return null
    }
    if (!data || data.byteLength === 0) {
        return null
    }
    const task = pdfjsLib.getDocument({ data })
    loadingTask = task
    const doc = await task.promise
    if (context.isStale()) {
        // 过期请求：销毁刚创建的加载任务，避免残留文档/worker
        if (loadingTask === task) {
            loadingTask = null
        }
        void task.destroy()
        return null
    }
    if (doc.numPages <= 0) {
        // 无有效页面的文档按不可读处理，避免工具栏显示 "1 / 0"
        if (loadingTask === task) {
            loadingTask = null
        }
        void task.destroy()
        return null
    }
    pdfDocument = doc
    numPages.value = doc.numPages
    return doc
}

/**
 * 渲染指定页到 canvas（能力开关开启时同步重建文本层）
 *
 * 竞态保护：每次渲染递增 renderToken，并记录本次文档句柄；被更新渲染取代
 * （翻页/缩放/重新加载）或被取消的任务不写 canvas、不清新任务句柄、不覆盖错误态。
 */
async function renderPage(page: number): Promise<void> {
    const pdfDoc = pdfDocument
    if (!pdfDoc) {
        return
    }
    const token = ++renderToken
    // 切页/缩放：销毁上一页文本层与未提交的文本选择
    disposeTextLayer()
    pendingSelection.value = null
    const canvas = canvasRef.value
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
        // 无 canvas 2D 上下文（如测试环境）：跳过绘制，保留文档状态
        return
    }
    if (renderTask) {
        try {
            renderTask.cancel()
        } catch {
            /* 忽略取消失败 */
        }
        renderTask = null
    }
    try {
        const pdfPage = await pdfDoc.getPage(page)
        if (token !== renderToken || isUnmounted() || pdfDocument !== pdfDoc) {
            // 已被新的渲染/加载取代：丢弃本次结果
            return
        }
        const viewport = pdfPage.getViewport({ scale: zoomLevel.value })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const task = pdfPage.render({ canvasContext: context, viewport, canvas })
        renderTask = task
        await task.promise
        if (token !== renderToken || isUnmounted() || pdfDocument !== pdfDoc) {
            return
        }
        if (annotationsEnabled.value) {
            // 文本层与 canvas 同尺寸叠放；失败只记录 WARN，不影响预览
            await renderTextLayer(pdfPage, viewport, token)
        }
    } catch (error) {
        // 渲染被取消（翻页/缩放/重新加载的并发）属正常路径：静默处理
        if (isRenderingCancelled(error)) {
            return
        }
        if (token !== renderToken || isUnmounted()) {
            return
        }
        logger.error('PDF 页面渲染失败:', error)
        errorMessage.value = t(PDF_TEXT_KEYS.loadFailed, { error: String(error) })
    } finally {
        // 仅当仍是当前渲染任务时才清空句柄，否则会误清掉新任务的句柄
        if (token === renderToken) {
            renderTask = null
        }
    }
}

/** 上一页 */
async function prevPage(): Promise<void> {
    if (pageNumber.value <= 1) {
        return
    }
    pageNumber.value -= 1
    await renderPage(pageNumber.value)
}

/** 下一页 */
async function nextPage(): Promise<void> {
    if (!pdfDocument || pageNumber.value >= numPages.value) {
        return
    }
    pageNumber.value += 1
    await renderPage(pageNumber.value)
}

/** 放大（重新渲染当前页） */
function zoomIn(): void {
    if (zoomLevel.value < 3) {
        zoomLevel.value = Math.round((zoomLevel.value + 0.1) * 10) / 10
        void renderPage(pageNumber.value)
    }
}

/** 缩小（重新渲染当前页） */
function zoomOut(): void {
    if (zoomLevel.value > 0.3) {
        zoomLevel.value = Math.round((zoomLevel.value - 0.1) * 10) / 10
        void renderPage(pageNumber.value)
    }
}

/** 在资源管理器中定位 PDF 文件 */
function revealInExplorer(): void {
    if (filePath.value) {
        window.electron.ipcRenderer.send(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, filePath.value)
    }
}

// 通用查看器状态机：三态 + 文件选择监听 + 重试 + 加载守卫；
// onReset 负责销毁旧 pdf.js 文档（重新加载/卸载时），onContentReady 负责首屏绘制。
const {
    isLoading,
    errorMessage,
    hasContent,
    filePath,
    fileName,
    loadingText,
    emptyText,
    retry,
    isUnmounted
} = useFileViewerState<PDFDocumentProxy>({
    viewerName: 'ShowPdfEditor',
    fileExtension: 'pdf',
    fileSelectedEvent: EVENT_BUS.PDF_FILE_SELECTED,
    loader: loadPdfFile,
    loadingTextKey: PDF_TEXT_KEYS.loading,
    emptyTextKey: PDF_TEXT_KEYS.empty,
    unreadableKey: PDF_TEXT_KEYS.unreadable,
    loadFailedKey: PDF_TEXT_KEYS.loadFailed,
    loadFailedLog: '加载 PDF 文件失败:',
    onReset: () => {
        // 1.5.2 E2：切文件/卸载前先落盘上一份未保存的标注（防抖待执行时），再清空标注状态。
        // 此时 filePath 已被 composable 清空，必须使用 annotationsPdfPath 记录的旧路径。
        debouncedAnnotationSave.flush()
        pendingSelection.value = null
        showAnnotationPanel.value = false
        excerptingAnnotationId.value = ''
        annotations.value = []
        annotationsPdfPath.value = ''
        // 开始新加载 / 组件卸载：销毁旧文档与渲染任务，并复位页码
        pageNumber.value = 1
        numPages.value = 0
        disposePdfDocument()
    },
    onContentReady: async () => {
        // 加载态已结束且内容插槽（canvas）已挂载，绘制第 1 页作为首屏
        annotationsPdfPath.value = filePath.value
        await renderPage(1)
        if (annotationsEnabled.value && annotationsPdfPath.value.length > 0) {
            // 标注读取不阻塞首屏；失败由 actions 提示且不影响 PDF 预览
            await loadAnnotationsForPdf(annotationsPdfPath.value)
        }
    }
})

// 1.5.2 E2：运行时开关切换
// - 开启：重绘当前页（补建文本层）并按需加载标注；
// - 关闭：先落盘挂起保存，再清理文本层/选择/面板（不再渲染标注 UI）。
watch(annotationsEnabled, (enabled) => {
    if (enabled) {
        if (pdfDocument) {
            void renderPage(pageNumber.value)
            if (annotationsPdfPath.value.length > 0) {
                void loadAnnotationsForPdf(annotationsPdfPath.value)
            }
        }
        return
    }
    debouncedAnnotationSave.flush()
    disposeTextLayer()
    pendingSelection.value = null
    showAnnotationPanel.value = false
})
</script>

<style scoped>
/* PDF 查看器特有：页码/缩放比例指示 */
.zoom-level,
.page-indicator {
    font-size: 12px;
    min-width: 50px;
    text-align: center;
    color: var(--theme-text-secondary, #757575);
}

/* 标注工具栏按钮激活态（列表展开时） */
.pdf-annotation-list-btn.active {
    background-color: var(--theme-hover-background);
    border-color: var(--theme-accent-color);
}

/* 内容区：滚动区 + 标注面板的共同定位容器 */
.pdf-viewer-body {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
}

/* 缩放后 canvas 可能大于容器：滚动容器保持块级布局，
   使 overflow:auto 能真正横向/纵向滚动（flex 居中会让溢出部分无法滚动到） */
.pdf-canvas-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px;
    background-color: var(--theme-background-color);
}

/* 页面定位容器：canvas / 文本层 / 标注 overlay 的共同坐标系。
   宽度由内容（canvas）撑开，未溢出时 margin:auto 居中，溢出时左对齐可滚动。
   --total-scale-factor 由脚本按 viewport.scale 写入（pdf.js TextLayer 布局依赖）。 */
.pdf-page-stage {
    position: relative;
    display: block;
    width: fit-content;
    margin: 0 auto;
    line-height: 0;
}

/* 去掉 max-width:100% 的视觉钳制：否则 zoom 放大后 canvas 仍被压回容器宽度，
   滚动条永不出现；display:block 由 stage 负责居中 */
.pdf-canvas {
    display: block;
    background-color: #ffffff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    user-select: none;
}

/* ===== 1.5.2 E2：pdf.js 文本层（透明文本，仅用于选择/定位） =====
   基础规则对齐 pdfjs-dist/web/pdf_viewer.css 的 .textLayer（6.x），
   只取选择/定位所需的部分，避免引入整份 viewer 样式。 */
.pdf-text-layer {
    position: absolute;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    text-align: initial;
    letter-spacing: normal;
    word-spacing: normal;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    color-scheme: only light;
    z-index: 1;
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor, 1) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
}

.pdf-text-layer :deep(span),
.pdf-text-layer :deep(br) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    user-select: text;
}

/* pdf.js 按 --font-height（页面坐标字号，px）与缩放变量计算实际字号 / 行内缩放 */
.pdf-text-layer :deep(> :not(.markedContent)),
.pdf-text-layer :deep(.markedContent span:not(.markedContent)) {
    z-index: 1;
    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}

.pdf-text-layer :deep(.markedContent) {
    display: contents;
}

/* ===== 1.5.2 E2：标注高亮 overlay（当前页） ===== */
.pdf-annotation-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
}

/* 半透明高亮遮罩：rgba 属于「遮罩」例外（UI-01），不引入固定主题色值 */
.pdf-annotation-highlight {
    position: absolute;
    background-color: rgba(255, 205, 0, 0.35);
    border-radius: 2px;
    mix-blend-mode: multiply;
}

/* ===== 1.5.2 E2：标注列表面板（内联下拉） ===== */
.pdf-annotation-panel {
    position: absolute;
    top: 8px;
    right: 16px;
    bottom: 16px;
    width: 340px;
    max-width: calc(100% - 32px);
    display: flex;
    flex-direction: column;
    background-color: var(--theme-background-color);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    z-index: 10;
    overflow: hidden;
}

.pdf-annotation-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-border-color);
    background-color: var(--theme-toolbar-background, #f5f5f5);
}

.pdf-annotation-panel-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--theme-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-annotation-panel-close {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
}

.pdf-annotation-empty {
    margin: 0;
    padding: 16px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--theme-text-secondary, #757575);
}

.pdf-annotation-panel-empty {
    flex: 1;
}

.pdf-annotation-list {
    list-style: none;
    margin: 0;
    padding: 8px;
    flex: 1;
    overflow: auto;
}

.pdf-annotation-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid var(--theme-border-color);
    margin-bottom: 8px;
    background-color: var(--theme-background-color);
}

.pdf-annotation-item:last-child {
    margin-bottom: 0;
}

.pdf-annotation-page-chip {
    flex-shrink: 0;
    padding: 2px 8px;
    font-size: 12px;
    border-radius: 10px;
    border: 1px solid var(--theme-accent-color);
    background-color: transparent;
    color: var(--theme-accent-color);
    cursor: pointer;
    transition: all 0.2s;
}

.pdf-annotation-page-chip:hover {
    background-color: var(--theme-hover-background);
}

.pdf-annotation-item-body {
    flex: 1;
    min-width: 0;
}

.pdf-annotation-text {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--theme-text-color);
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.pdf-annotation-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    color: var(--theme-text-secondary, #757575);
}

.pdf-annotation-time {
    flex: 1;
    min-width: 96px;
}

.pdf-annotation-action {
    padding: 2px 8px;
    font-size: 12px;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    background-color: transparent;
    color: var(--theme-text-color);
    cursor: pointer;
    transition: all 0.2s;
}

.pdf-annotation-action:hover:not(:disabled) {
    background-color: var(--theme-hover-background);
    border-color: var(--theme-accent-color);
}

.pdf-annotation-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.pdf-annotation-action-danger:hover:not(:disabled) {
    color: var(--theme-error-color, #d32f2f);
    border-color: var(--theme-error-color, #d32f2f);
}
</style>
