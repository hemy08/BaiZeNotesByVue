<template>
    <div class="html-view-container">
        <div v-if="isLoading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>{{ t('toolsNetwork.hemyTools.htmlView.loading') }}</p>
        </div>
        <div v-else-if="errorMessage" class="error-container">
            <div class="error-icon">⚠️</div>
            <p>{{ errorMessage }}</p>
            <button class="retry-button" @click="retryLoad">
                {{ t('toolsNetwork.common.retry') }}
            </button>
        </div>
        <div v-else-if="htmlContent" class="html-content-wrapper">
            <div class="html-toolbar">
                <span class="file-name">{{ filePath }}</span>
                <div class="toolbar-actions">
                    <button
                        class="toolbar-btn"
                        :title="t('toolsNetwork.common.openInBrowser')"
                        @click="openInBrowser"
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
                    <button
                        class="toolbar-btn"
                        :title="t('toolsNetwork.hemyTools.htmlView.refresh')"
                        @click="refreshContent"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path
                                d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                            ></path>
                        </svg>
                    </button>
                </div>
            </div>
            <!-- P1 安全修复（N-04）：iframe sandbox 收紧为纯展示。
                 1. 移除 allow-scripts：HTML 查看器中的脚本不再执行（行为变化）；
                 2. 移除 allow-forms / allow-popups：查看器无需提交表单或弹窗，避免
                    恶意 HTML 借表单外发数据、或诱导打开新窗口；
                 3. 保留 allow-same-origin：维持本地 HTML 的相对资源（图片/样式）加载。
                 安全约束：allow-scripts 与 allow-same-origin 绝不可同时出现——该组合
                 可让 srcdoc 内容以父窗口同源身份执行脚本并直接访问父窗口 Electron API。 -->
            <iframe
                :srcdoc="htmlContent"
                class="html-iframe"
                sandbox="allow-same-origin"
                @load="onIframeLoad"
            ></iframe>
        </div>
        <div v-else class="empty-container">
            <div class="empty-icon">📄</div>
            <p>{{ t('toolsNetwork.hemyTools.htmlView.empty') }}</p>
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
import { withBaseHref } from './html-view-utils'

// 响应式数据
const htmlContent = ref<string>('')
const fileName = ref<string>('')
const filePath = ref<string>('')
const isLoading = ref<boolean>(false)
const errorMessage = ref<string>('')

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
        const content = await window.electron.ipcRenderer.invoke(IPC.FILE.READ_HTML, path)

        if (content) {
            // 2026-11-18 修复「HTML 查看器内相对链接点击无反应」：
            // srcdoc 文档基准 URL 是父页面，注入 <base href="file:///<文件目录>/"> 后，
            // 报告 HTML Wiki 顶部导航、图片等相对资源可正确定位（详见 html-view-utils.ts）。
            htmlContent.value = withBaseHref(content, path)
        } else {
            errorMessage.value = t('toolsNetwork.hemyTools.htmlView.unreadable')
        }
    } catch (error) {
        logger.error('加载 HTML 文件失败:', error)
        errorMessage.value = t('toolsNetwork.hemyTools.htmlView.loadFailed', {
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
        // 2026-11-18（遗留清单 #1）：本地 HTML 走专用通道（OPEN_EXTERNAL_LINK 仅放行
        // http/https，原实现点击无效）；主进程校验 .html 扩展名 + Path Guard 后
        // 交给系统默认浏览器打开。
        window.electron.ipcRenderer.send(IPC.FILE.OPEN_IN_BROWSER, filePath.value)
    }
}

/**
 * iframe 加载完成
 */
function onIframeLoad() {
    // iframe 内容渲染完成，兜底结束加载状态
    isLoading.value = false
}

/**
 * 处理文件选择事件
 */
function handleFileSelect(node: { path?: string; name?: string }) {
    if (node && node.path && node.name && node.name.endsWith('.html')) {
        loadHtmlFile(node.path, node.name)
    }
}

// 生命周期
onMounted(() => {
    // 监听文件选择事件
    EventBus.$on(EVENT_BUS.HTML_FILE_SELECTED, handleFileSelect, { componentId })

    // 同时监听文件树节点的点击事件
    EventBus.$on(
        EVENT_BUS.FILE_TREE_NODE_CLICKED,
        (node: { type?: string; name?: string; path?: string }) => {
            if (node && node.type === 'file' && node.name && node.name.endsWith('.html')) {
                loadHtmlFile(node.path ?? '', node.name)
            }
        },
        { componentId }
    )
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
