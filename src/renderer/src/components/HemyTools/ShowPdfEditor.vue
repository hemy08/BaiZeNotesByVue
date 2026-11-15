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
                    <!--button @click="printPdf" class="toolbar-btn" title="打印">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                    </button-->
                </div>
            </div>
            <!-- FE-11：原 <webview :src="pdfPath"> 依赖主窗口 webPreferences.webviewTag（未开启）
                 → 容器永远空白。改用 <iframe> 加载本地 file:// URL：Electron 内置 PDFium
                 查看器（Electron 9+ 默认启用）会在 iframe 中渲染 PDF，无需 webviewTag，
                 也不引入 webview 的攻击面。CSP 已在 renderer/index.html 放行 frame-src file:。 -->
            <iframe
                :src="pdfUrl"
                class="pdf-frame"
                :title="fileName || pdfPath"
                :style="{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }"
            ></iframe>
        </div>
        <div v-else class="empty-container">
            <div class="empty-icon">📄</div>
            <p>{{ t('toolsNetwork.hemyTools.pdfView.empty') }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import EventBus from '../../common/event-bus/event-bus'
import { t } from '../../common/i18n'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'

// 响应式数据
const pdfPath = ref<string>('')
const pdfUrl = ref<string>('')
const fileName = ref<string>('')
const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')
const zoomLevel = ref<number>(1)

// 组件ID用于事件清理
const componentId = 'ShowPdfEditor'

/**
 * FE-11：把本地绝对路径转成合法的 file:// URL（百分号编码空格/中文/# 等）。
 * 原实现直接拼 `file://${path}`，Windows 反斜杠与特殊字符会得到非法 URL。
 */
function toFileUrl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized
    return 'file://' + encodeURI(withLeadingSlash)
}

/**
 * 加载 PDF 文件
 */
async function loadPdfFile(path: string, name: string) {
    isLoading.value = true
    errorMessage.value = ''
    pdfPath.value = ''
    pdfUrl.value = ''
    fileName.value = name

    try {
        // 验证文件是否存在
        const exists = await window.electron.ipcRenderer.invoke(IPC.FILE.CHECK_EXISTS, path)

        if (exists) {
            // FE-11：iframe 使用 file:// URL 交给 Electron 内置 PDF 查看器渲染
            pdfPath.value = path
            pdfUrl.value = toFileUrl(path)
        } else {
            errorMessage.value = t('toolsNetwork.hemyTools.pdfView.fileNotFound')
        }
    } catch (error) {
        logger.error('加载 PDF 文件失败:', error)
        errorMessage.value = t('toolsNetwork.hemyTools.pdfView.loadFailed', {
            error: String(error)
        })
    } finally {
        isLoading.value = false
    }
}

/**
 * 重试加载
 */
function retryLoad() {
    if (pdfPath.value) {
        loadPdfFile(pdfPath.value, fileName.value)
    }
}

/**
 * 放大
 */
function zoomIn() {
    if (zoomLevel.value < 3) {
        zoomLevel.value += 0.1
    }
}

/**
 * 缩小
 */
function zoomOut() {
    if (zoomLevel.value > 0.3) {
        zoomLevel.value -= 0.1
    }
}

/**
 * 在资源管理器中定位 PDF 文件
 * （原「在浏览器中打开」发送 file 路径到 OPEN_EXTERNAL_LINK，主进程只放行 http/https
 *   协议，本地文件路径被静默拒绝——改为既有 FILE_MANAGER.OPEN_IN_EXPLORER 通道）
 */
function revealInExplorer() {
    if (pdfPath.value) {
        window.electron.ipcRenderer.send(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, pdfPath.value)
    }
}

/**
 * 处理文件选择事件
 */
function handleFileSelect(node: { path?: string; name?: string }) {
    if (node && node.path && node.name && node.name.endsWith('.pdf')) {
        loadPdfFile(node.path, node.name)
    }
}

// 生命周期
onMounted(() => {
    // 监听文件选择事件
    EventBus.$on(EVENT_BUS.PDF_FILE_SELECTED, handleFileSelect, { componentId })
})

onBeforeUnmount(() => {
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

.toolbar-btn:hover {
    background-color: var(--theme-hover-background, #f0e8ff);
    border-color: var(--theme-accent-color, #764ba2);
}

.zoom-level {
    font-size: 12px;
    min-width: 50px;
    text-align: center;
    color: var(--theme-text-secondary, #757575);
}

.pdf-frame {
    flex: 1;
    width: 100%;
    height: 100%;
    border: none;
    background-color: #ffffff;
}

.empty-container p {
    color: var(--theme-text-secondary, #757575);
    font-size: 14px;
}
</style>
