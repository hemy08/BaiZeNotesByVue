<template>
    <div class="html-view-container">
        <div v-if="isLoading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>正在加载 HTML 文件...</p>
        </div>
        <div v-else-if="errorMessage" class="error-container">
            <div class="error-icon">⚠️</div>
            <p>{{ errorMessage }}</p>
            <button @click="retryLoad" class="retry-button">重试</button>
        </div>
        <div v-else-if="htmlContent" class="html-content-wrapper">
            <div class="html-toolbar">
                <span class="file-name">{{ filePath }}</span>
                <div class="toolbar-actions">
                    <button @click="openInBrowser" class="toolbar-btn" title="在浏览器中打开">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                    <button @click="refreshContent" class="toolbar-btn" title="刷新">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <iframe
                ref="htmlIframe"
                :srcdoc="htmlContent"
                class="html-iframe"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                @load="onIframeLoad"
            ></iframe>
        </div>
        <div v-else class="empty-container">
            <div class="empty-icon">📄</div>
            <p>请选择一个 HTML 文件进行预览</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import EventBus from '../../event-bus'



// 响应式数据
const htmlContent = ref<string>('')
const fileName = ref<string>('')
const filePath = ref<string>('')
const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')
const htmlIframe = ref<HTMLIFrameElement | null>(null)

// 组件ID用于事件清理
const componentId = 'ShowHtmlView'

/**
 * 加载 HTML 文件内容
 */
async function loadHtmlFile(path: string, name: string) {
    isLoading.value = true
    errorMessage.value = ''
    htmlContent.value = ''
    filePath.value = path
    fileName.value = name

    try {
        // 通过 IPC 读取文件内容
        const content = await window.electron.ipcRenderer.invoke('read-html-file', path)

        if (content) {
            htmlContent.value = content
        } else {
            errorMessage.value = '无法读取文件内容'
        }
    } catch (error) {
        console.error('加载 HTML 文件失败:', error)
        errorMessage.value = `加载失败: ${error}`
    } finally {
        isLoading.value = false
    }
}

/**
 * 重试加载
 */
function retryLoad() {
    if (filePath.value) {
        loadHtmlFile(filePath.value, fileName.value)
    }
}

/**
 * 刷新内容
 */
function refreshContent() {
    if (filePath.value) {
        loadHtmlFile(filePath.value, fileName.value)
    }
}

/**
 * 在浏览器中打开
 */
function openInBrowser() {
    if (filePath.value) {
        window.electron.ipcRenderer.send('open-external-link', filePath.value)
    }
}

/**
 * iframe 加载完成
 */
function onIframeLoad() {
    // 可以在这里添加一些加载完成后的处理
    console.log('HTML 内容加载完成')
}

/**
 * 处理文件选择事件
 */
function handleFileSelect(node: any) {
    if (node && node.path && node.name && node.name.endsWith('.html')) {
        loadHtmlFile(node.path, node.name)
    }
}

// 生命周期
onMounted(() => {
    // 监听文件选择事件
    EventBus.$on('html-file-selected', handleFileSelect, { componentId })

    // 同时监听文件树节点的点击事件
    EventBus.$on('file-tree-node-clicked', (node: any) => {
        if (node && node.type === 'file' && node.name && node.name.endsWith('.html')) {
            loadHtmlFile(node.path, node.name)
        }
    }, { componentId })
})

onBeforeUnmount(() => {
    // 清理事件监听
    EventBus.$cleanup(componentId)
})
</script>

<style scoped>
.html-view-container {
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

.html-content-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.html-toolbar {
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

.html-iframe {
    flex: 1;
    width: 100%;
    border: none;
    background-color: #ffffff;
}

.empty-container p {
    color: var(--theme-text-secondary, #757575);
    font-size: 14px;
}
</style>
