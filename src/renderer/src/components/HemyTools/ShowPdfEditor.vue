<template>
    <div class="pdf-view-container">
        <div v-if="isLoading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>{{ t('toolsNetwork.hemyTools.pdfView.loading') }}</p>
        </div>
        <div v-else-if="errorMessage" class="error-container">
            <div class="error-icon">⚠️</div>
            <p>{{ errorMessage }}</p>
            <button class="retry-button" @click="retryLoad">
                {{ t('toolsNetwork.common.retry') }}
            </button>
        </div>
        <div v-else-if="pdfPath" class="pdf-content-wrapper">
            <div class="pdf-toolbar">
                <span class="file-name">{{ pdfPath }}</span>
                <div class="toolbar-actions">
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
                            <path
                                d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                            ></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <!-- 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js（pdfjs-dist）渲染到 canvas。
                 原方案依赖 Electron 内置 PDF 查看器（iframe/webview），在部分环境不可用且
                 与 CSP/沙箱约束耦合；pdf.js 方案不依赖内置查看器，路径经主进程 Path Guard
                 校验后用 FILE.READ_BINARY 读取原始字节。 -->
            <div class="pdf-canvas-scroll">
                <canvas ref="canvasRef" class="pdf-canvas"></canvas>
            </div>
        </div>
        <div v-else class="empty-container">
            <div class="empty-icon">📄</div>
            <p>{{ t('toolsNetwork.hemyTools.pdfView.empty') }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, getCurrentInstance, nextTick } from 'vue'
import EventBus from '../../common/event-bus/event-bus'
import { t } from '../../common/i18n'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js worker：由 Vite 打包为独立资源（CSP worker-src 已放行 'self'/blob:）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// 响应式数据
const pdfPath = ref<string>('')
const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')
const zoomLevel = ref<number>(1)
const pageNumber = ref<number>(1)
const numPages = ref<number>(0)
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 最近一次请求加载的路径/文件名：重试按钮据此重载（pdfPath 仅在加载成功后才赋值，不能作为守卫） */
const lastLoadPath = ref<string>('')
const lastLoadName = ref<string>('')

/** 当前 pdf.js 文档句柄（卸载/重新加载时销毁） */
let pdfDocument: PDFDocumentProxy | null = null
/** getDocument 返回的加载任务（销毁文档与 worker 资源的入口） */
let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null
/** 当前渲染任务句柄（仅最新一次渲染持有，避免并发渲染同一 canvas） */
let renderTask: { cancel: () => void } | null = null
/** 渲染代次：每次 renderPage 递增，旧任务的异步回调据此丢弃写回 */
let renderToken = 0
/** 加载代次：并发选择文件时仅最新代次可以写状态/结束 loading */
let loadGeneration = 0
/** 组件是否已卸载：卸载后拒绝新建加载任务与渲染写回（防止异步泄漏） */
let isUnmounted = false

// 组件唯一标识：插件菜单实例与 WorkSpace 实例可能同时挂载，固定 id 会让
// EventBus.$cleanup 把另一实例的监听一并清掉；带实例 uid 保证卸载只清自身。
const componentId = `ShowPdfEditor-${getCurrentInstance()?.uid ?? Date.now()}`

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

/** 判断某次加载是否已过期（组件已卸载，或已有更新的加载代次） */
function isStaleGeneration(generation: number): boolean {
    return isUnmounted || generation !== loadGeneration
}

/** 判断是否 pdf.js 渲染取消异常（翻页/缩放/重新加载时的正常路径，需静默） */
function isRenderingCancelled(error: unknown): boolean {
    return (error as { name?: string } | null)?.name === 'RenderingCancelledException'
}

/**
 * 加载 PDF 文件（主进程读取原始字节 → pdf.js 解析）
 *
 * 并发保护：进入时递增 loadGeneration，每个 await 之后校验代次；过期请求
 * 直接退出且不写任何状态，避免旧请求的失败/成功覆盖新请求的结果。
 * 卸载保护：isUnmounted 置位后拒绝新建 loadingTask，防止异步泄漏。
 */
async function loadPdfFile(path: string, name: string): Promise<void> {
    if (isUnmounted) {
        return
    }
    const generation = ++loadGeneration
    // 进入 try 前记录加载目标：失败后 retryLoad 据此重载
    lastLoadPath.value = path
    lastLoadName.value = name
    isLoading.value = true
    errorMessage.value = ''
    pdfPath.value = ''
    pageNumber.value = 1
    numPages.value = 0
    disposePdfDocument()

    try {
        const exists = await window.electron.ipcRenderer.invoke(IPC.FILE.CHECK_EXISTS, path)
        if (isStaleGeneration(generation)) {
            return
        }
        if (!exists) {
            errorMessage.value = t('toolsNetwork.hemyTools.pdfView.fileNotFound')
            return
        }
        // Uint8Array（IPC 结构化克隆）→ pdf.js getDocument
        const data = (await window.electron.ipcRenderer.invoke(
            IPC.FILE.READ_BINARY,
            path
        )) as Uint8Array | null
        if (isStaleGeneration(generation)) {
            return
        }
        if (!data || data.byteLength === 0) {
            errorMessage.value = t('toolsNetwork.hemyTools.pdfView.unreadable')
            return
        }
        const task = pdfjsLib.getDocument({ data })
        loadingTask = task
        const doc = await task.promise
        if (isStaleGeneration(generation)) {
            // 过期请求：销毁刚创建的加载任务，避免残留文档/worker
            void task.destroy()
            return
        }
        if (doc.numPages <= 0) {
            // 无有效页面的文档按不可读处理，避免工具栏显示 "1 / 0"
            void task.destroy()
            loadingTask = null
            errorMessage.value = t('toolsNetwork.hemyTools.pdfView.unreadable')
            return
        }
        pdfDocument = doc
        numPages.value = doc.numPages
        pdfPath.value = path
        // 加载态下模板只渲染 loading 容器、canvas 尚未挂载；先结束加载态并等 DOM 更新，
        // 再绘制首页，否则首屏会是一块空白 canvas（此前 renderPage(1) 读到 null 直接跳过）。
        isLoading.value = false
        await nextTick()
        if (isStaleGeneration(generation)) {
            return
        }
        await renderPage(1)
    } catch (error) {
        if (isStaleGeneration(generation)) {
            return
        }
        logger.error('加载 PDF 文件失败:', error)
        errorMessage.value = t('toolsNetwork.hemyTools.pdfView.loadFailed', {
            error: String(error)
        })
    } finally {
        // isLoading 只由最新代次清除：旧请求不得提前结束新请求的加载态
        if (!isStaleGeneration(generation)) {
            isLoading.value = false
        }
    }
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
        if (token !== renderToken || isUnmounted || pdfDocument !== pdfDoc) {
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
        if (token !== renderToken || isUnmounted) {
            return
        }
        logger.error('PDF 页面渲染失败:', error)
        errorMessage.value = t('toolsNetwork.hemyTools.pdfView.loadFailed', {
            error: String(error)
        })
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

/**
 * 重试加载：使用最近一次记录的路径/文件名重载
 * （pdfPath 只在加载成功后赋值，失败时为空，不能再用作守卫）
 */
function retryLoad(): void {
    if (lastLoadPath.value) {
        void loadPdfFile(lastLoadPath.value, lastLoadName.value)
    }
}

/**
 * 放大（重新渲染当前页）
 */
function zoomIn() {
    if (zoomLevel.value < 3) {
        zoomLevel.value = Math.round((zoomLevel.value + 0.1) * 10) / 10
        void renderPage(pageNumber.value)
    }
}

/**
 * 缩小（重新渲染当前页）
 */
function zoomOut() {
    if (zoomLevel.value > 0.3) {
        zoomLevel.value = Math.round((zoomLevel.value - 0.1) * 10) / 10
        void renderPage(pageNumber.value)
    }
}

/**
 * 在资源管理器中定位 PDF 文件
 */
function revealInExplorer() {
    if (pdfPath.value) {
        window.electron.ipcRenderer.send(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, pdfPath.value)
    }
}

/**
 * 处理文件选择事件（扩展名不区分大小写）
 */
function handleFileSelect(node: { path?: string; name?: string }): void {
    if (node?.path && node.name && node.name.toLowerCase().endsWith('.pdf')) {
        void loadPdfFile(node.path, node.name)
    }
}

// 生命周期
onMounted(() => {
    // 监听文件选择事件（componentId 实例唯一，卸载时只清理本实例）
    EventBus.$on(EVENT_BUS.PDF_FILE_SELECTED, handleFileSelect, { componentId })
})

onBeforeUnmount(() => {
    // 卸载守卫：使在途加载/渲染全部过期，并拒绝后续新建加载任务
    isUnmounted = true
    loadGeneration += 1
    renderToken += 1
    disposePdfDocument()
    // 清理事件监听
    EventBus.$cleanup(componentId)
})
</script>

<style scoped>
.pdf-view-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--theme-background-color, #ffffff);
    color: var(--theme-text-color, #2d2d2d);
}

.loading-container,
.error-container,
.empty-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 20px;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--theme-border-color, #e0e0e0);
    border-top: 4px solid var(--theme-accent-color, #764ba2);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.error-icon,
.empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.error-container p {
    color: var(--theme-error-color, #d32f2f);
    margin-bottom: 16px;
}

.retry-button {
    padding: 8px 16px;
    background-color: var(--theme-accent-color, #764ba2);
    color: var(--theme-button-text-color, #ffffff);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.retry-button:hover {
    background-color: var(--theme-hover-background, #f0e8ff);
}

.pdf-content-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.pdf-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background-color: var(--theme-toolbar-background, #f5f5f5);
    border-bottom: 1px solid var(--theme-border-color, #e0e0e0);
}

.file-name {
    font-weight: 500;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 16px;
}

.toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 4px;
    background-color: transparent;
    border: 1px solid var(--theme-border-color, #e0e0e0);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--theme-text-color, #2d2d2d);
}

.toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.toolbar-btn:hover:not(:disabled) {
    background-color: var(--theme-hover-background, #f0e8ff);
    border-color: var(--theme-accent-color, #764ba2);
}

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

.empty-container p {
    color: var(--theme-text-secondary, #757575);
    font-size: 14px;
}
</style>
