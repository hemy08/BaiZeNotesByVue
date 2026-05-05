<template>
    <div class="pdf-view-container">
        <div v-if="isLoading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>正在加载 PDF 文件...</p>
        </div>
        <div v-else-if="errorMessage" class="error-container">
            <div class="error-icon">⚠️</div>
            <p>{{ errorMessage }}</p>
            <button @click="retryLoad" class="retry-button">重试</button>
        </div>
        <div v-else-if="pdfPath" class="pdf-content-wrapper">
            <div class="pdf-toolbar">
                <span class="file-name">{{ pdfPath }}</span>
                <div class="toolbar-actions">
                    <button @click="zoomIn" class="toolbar-btn" title="放大">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            <line x1="11" y1="8" x2="11" y2="14"></line>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                    </button>
                    <button @click="zoomOut" class="toolbar-btn" title="缩小">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                    </button>
                    <span class="zoom-level">{{ Math.round(zoomLevel * 100) }}%</span>
                    <button @click="openInBrowser" class="toolbar-btn" title="在浏览器中打开">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
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
            <webview
                ref="pdfWebview"
                :src="pdfPath"
                class="pdf-webview"
                :style="{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }"
            ></webview>
        </div>
        <div v-else class="empty-container">
            <div class="empty-icon">📄</div>
            <p>请选择一个 PDF 文件进行预览</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import EventBus from '../../common/event_bus/event-bus'

// 响应式数据
const pdfPath = ref<string>('')
const fileName = ref<string>('')
const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')
const zoomLevel = ref<number>(1)
const pdfWebview = ref<any>(null)

// 组件ID用于事件清理
const componentId = 'ShowPdfEditor'

/**
 * 加载 PDF 文件
 */
async function loadPdfFile(path: string, name: string) {
    isLoading.value = true
    errorMessage.value = ''
    pdfPath.value = ''
    fileName.value = name

    try {
        // 验证文件是否存在
        const exists = await window.electron.ipcRenderer.invoke('check-file-exists', path)

        if (exists) {
            // 使用 file:// 协议加载 PDF
            pdfPath.value = `file://${path}`
        } else {
            errorMessage.value = '文件不存在'
        }
    } catch (error) {
        console.error('加载 PDF 文件失败:', error)
        errorMessage.value = `加载失败: ${error}`
    } finally {
        isLoading.value = false
    }
}

/**
 * 重试加载
 */
function retryLoad() {
    if (pdfPath.value) {
        loadPdfFile(pdfPath.value.replace('file://', ''), fileName.value)
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
 * 在浏览器中打开
 */
function openInBrowser() {
    if (pdfPath.value) {
        const filePath = pdfPath.value.replace('file://', '')
        window.electron.ipcRenderer.send('open-external-link', filePath)
    }
}

/**
 * 打印 PDF
 */
/*function printPdf() {
    if (pdfWebview.value) {
        pdfWebview.value.executeJavaScript('window.print()')
    }
}*/

/**
 * 处理文件选择事件
 */
function handleFileSelect(node: any) {
    if (node && node.path && node.name && node.name.endsWith('.pdf')) {
        loadPdfFile(node.path, node.name)
    }
}

// 生命周期
onMounted(() => {
    // 监听文件选择事件
    EventBus.$on('pdf-file-selected', handleFileSelect, { componentId })
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
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
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

.pdf-webview {
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
