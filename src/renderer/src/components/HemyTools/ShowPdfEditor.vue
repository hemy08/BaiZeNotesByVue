<template>
    <!-- PDF 查看器：三态容器 / 工具栏 / 空态由 FileViewerShell 统一提供，
         本组件只保留 PDF 特有部分（pdf.js 渲染、翻页、缩放、资源管理器定位）。 -->
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
                    stroke-width="2"
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
                    stroke-width="2"
                >
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
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
                    stroke-width="2"
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
                    stroke-width="2"
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
                    stroke-width="2"
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
                 校验后用 FILE.READ_BINARY 读取原始字节。 -->
            <div class="pdf-canvas-scroll">
                <canvas ref="canvasRef" class="pdf-canvas"></canvas>
            </div>
        </template>
    </FileViewerShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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

// 响应式数据（路径/三态/重试由 useFileViewerState 统一维护）
const zoomLevel = ref<number>(1)
const pageNumber = ref<number>(1)
const numPages = ref<number>(0)
const canvasRef = ref<HTMLCanvasElement | null>(null)

/** 当前 pdf.js 文档句柄（卸载/重新加载时销毁） */
let pdfDocument: PDFDocumentProxy | null = null
/** getDocument 返回的加载任务（销毁文档与 worker 资源的入口） */
let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null
/** 当前渲染任务句柄（仅最新一次渲染持有，避免并发渲染同一 canvas） */
let renderTask: { cancel: () => void } | null = null
/** 渲染代次：每次 renderPage 递增，旧任务的异步回调据此丢弃写回 */
let renderToken = 0

/** 销毁当前 PDF 文档与渲染任务 */
function disposePdfDocument(): void {
    // 使在途渲染任务全部过期，避免销毁后旧任务继续写回 canvas / 清掉新任务句柄
    renderToken += 1
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
 * 渲染指定页到 canvas
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
// onReset 负责销毁旧 pdf.js 文档（重新加载/卸载时），onContentReady 负责首屏绘制
const {
    isLoading,
    errorMessage,
    hasContent,
    filePath,
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
        // 开始新加载 / 组件卸载：销毁旧文档与渲染任务，并复位页码
        pageNumber.value = 1
        numPages.value = 0
        disposePdfDocument()
    },
    onContentReady: async () => {
        // 加载态已结束且内容插槽（canvas）已挂载，绘制第 1 页作为首屏
        await renderPage(1)
    }
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

/* 缩放后 canvas 可能大于容器：滚动容器保持块级布局，
   使 overflow:auto 能真正横向/纵向滚动（flex 居中会让溢出部分无法滚动到） */
.pdf-canvas-scroll {
    flex: 1;
    overflow: auto;
    padding: 16px;
    background-color: var(--theme-background-color, #f0f0f0);
}

/* 去掉 max-width:100% 的视觉钳制：否则 zoom 放大后 canvas 仍被压回容器宽度，
   滚动条永不出现；display:block + margin:auto 负责在未溢出时居中 */
.pdf-canvas {
    display: block;
    margin: 0 auto;
    background-color: #ffffff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}
</style>
