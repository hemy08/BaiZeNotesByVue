<template>
    <!-- HTML 查看器：三态容器 / 工具栏 / 空态由 FileViewerShell 统一提供，
         本组件只保留 HTML 特有部分（srcdoc iframe、打开浏览器按钮、刷新）。 -->
    <FileViewerShell
        :is-loading="isLoading"
        :error-message="errorMessage"
        :has-content="hasContent"
        :file-path="filePath"
        :loading-text="loadingText"
        :empty-text="emptyText"
        container-class="html-view-container"
        content-wrapper-class="html-content-wrapper"
        toolbar-class="html-toolbar"
        @retry="retry"
    >
        <template #toolbar-actions>
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
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </button>
            <button
                class="toolbar-btn"
                :title="t('toolsNetwork.hemyTools.htmlView.refresh')"
                @click="retry"
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
        </template>
        <template #content>
            <!-- P1 安全修复（N-04）：iframe sandbox 收紧为纯展示。
                 1. 移除 allow-scripts：HTML 查看器中的脚本不再执行（行为变化）；
                 2. 移除 allow-forms / allow-popups：查看器无需提交表单或弹窗，避免
                    恶意 HTML 借表单外发数据、或诱导打开新窗口；
                 3. 保留 allow-same-origin：维持本地 HTML 的相对资源（图片/样式）加载。
                 安全约束：allow-scripts 与 allow-same-origin 绝不可同时出现——该组合
                 可让 srcdoc 内容以父窗口同源身份执行脚本并直接访问父窗口 Electron API。 -->
            <iframe
                :srcdoc="htmlContent ?? ''"
                class="html-iframe"
                sandbox="allow-same-origin"
                @load="onIframeLoad"
            ></iframe>
        </template>
    </FileViewerShell>
</template>

<script setup lang="ts">
import FileViewerShell from './FileViewerShell.vue'
import { t } from '../../common/i18n'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { withBaseHref } from './html-view-utils'
import { useFileViewerState } from '../../composables/useFileViewerState'
import type { FileLoadContext } from '../../composables/useFileViewerState'

/**
 * 加载 HTML 文件内容（IPC 读取 + 注入 base href）
 *
 * @param path HTML 文件完整路径
 * @param context 加载上下文（代次/卸载守卫：过期请求直接返回，不写任何状态）
 * @returns 注入 base 后的 HTML；null 表示内容不可读（空内容按不可读处理）
 */
async function loadHtmlContent(path: string, context: FileLoadContext): Promise<string | null> {
    // 通过 IPC 读取文件内容
    const content = (await window.electron.ipcRenderer.invoke(IPC.FILE.READ_HTML, path)) as
        string | null
    if (context.isStale()) {
        return null
    }
    // 2026-11-18 修复「HTML 查看器内相对链接点击无反应」：
    // srcdoc 文档基准 URL 是父页面，注入 <base href="file:///<文件目录>/"> 后，
    // 报告 HTML Wiki 顶部导航、图片等相对资源可正确定位（详见 html-view-utils.ts）。
    return content ? withBaseHref(content, path) : null
}

// 通用查看器状态机：三态 + 文件选择监听 + 重试/刷新 + 加载守卫
const {
    content: htmlContent,
    isLoading,
    errorMessage,
    hasContent,
    filePath,
    loadingText,
    emptyText,
    retry,
    finishLoading
} = useFileViewerState<string>({
    viewerName: 'ShowHtmlView',
    fileExtension: 'html',
    fileSelectedEvent: EVENT_BUS.HTML_FILE_SELECTED,
    loader: loadHtmlContent,
    loadingTextKey: 'toolsNetwork.hemyTools.htmlView.loading',
    emptyTextKey: 'toolsNetwork.hemyTools.htmlView.empty',
    unreadableKey: 'toolsNetwork.hemyTools.htmlView.unreadable',
    loadFailedKey: 'toolsNetwork.hemyTools.htmlView.loadFailed',
    loadFailedLog: '加载 HTML 文件失败:'
})

/**
 * 在浏览器中打开
 */
function openInBrowser(): void {
    if (filePath.value) {
        // 2026-11-18（遗留清单 #1）：本地 HTML 走专用通道（OPEN_EXTERNAL_LINK 仅放行
        // http/https，原实现点击无效）；主进程校验 .html 扩展名 + Path Guard 后
        // 交给系统默认浏览器打开。
        window.electron.ipcRenderer.send(IPC.FILE.OPEN_IN_BROWSER, filePath.value)
    }
}

/**
 * iframe 加载完成：兜底结束加载状态
 */
function onIframeLoad(): void {
    finishLoading()
}
</script>

<style scoped>
/* HTML 查看器特有：iframe 占满剩余空间 */
.html-iframe {
    flex: 1;
    width: 100%;
    border: none;
    background-color: #ffffff;
}
</style>
