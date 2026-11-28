<template>
    <!-- 文件查看器壳层：统一三态容器 + 工具栏骨架，具体工具栏按钮与内容区由查看器插槽提供。
         根容器保留各自查看器的既有 class（.html-view-container / .pdf-view-container 等），
         共享样式集中在下方 scoped 样式中，避免两份查看器各自复制一遍。 -->
    <div class="file-viewer-shell" :class="props.containerClass">
        <!-- 加载态 -->
        <div v-if="props.isLoading" class="loading-container">
            <div class="loading-spinner"></div>
            <p>{{ props.loadingText }}</p>
        </div>
        <!-- 错误态（含重试按钮：重试逻辑由查看器通过 retry 事件接回 composable） -->
        <div v-else-if="props.errorMessage" class="error-container">
            <div class="error-icon">⚠️</div>
            <p>{{ props.errorMessage }}</p>
            <button class="retry-button" @click="emit('retry')">
                {{ t('toolsNetwork.common.retry') }}
            </button>
        </div>
        <!-- 内容态：工具栏（文件名 + 查看器按钮插槽）+ 内容插槽 -->
        <div
            v-else-if="props.hasContent"
            class="file-viewer-content-wrapper"
            :class="props.contentWrapperClass"
        >
            <div class="file-viewer-toolbar" :class="props.toolbarClass">
                <span class="file-name">{{ props.filePath }}</span>
                <div class="toolbar-actions">
                    <slot name="toolbar-actions"></slot>
                </div>
            </div>
            <slot name="content"></slot>
        </div>
        <!-- 空态 -->
        <div v-else class="empty-container">
            <div class="empty-icon">📄</div>
            <p>{{ props.emptyText }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { t } from '../../common/i18n'

/** 文件查看器壳层属性 */
interface FileViewerShellProps {
    /** 是否处于加载态 */
    isLoading: boolean
    /** 错误文案（空字符串表示无错误） */
    errorMessage: string
    /** 是否已有可展示内容（false 时渲染空态） */
    hasContent: boolean
    /** 加载中提示文案 */
    loadingText: string
    /** 空态提示文案 */
    emptyText: string
    /** 当前文件完整路径（工具栏文件名展示） */
    filePath?: string
    /** 根容器附加 class（保留 .html-view-container / .pdf-view-container 契约） */
    containerClass?: string
    /** 内容态包装容器附加 class（保留 .html-content-wrapper / .pdf-content-wrapper 契约） */
    contentWrapperClass?: string
    /** 工具栏附加 class（保留 .html-toolbar / .pdf-toolbar 契约） */
    toolbarClass?: string
}

const props = withDefaults(defineProps<FileViewerShellProps>(), {
    filePath: '',
    containerClass: '',
    contentWrapperClass: '',
    toolbarClass: ''
})

const emit = defineEmits<{
    /** 点击重试按钮：查看器接回 composable 的 retry() */
    (event: 'retry'): void
}>()
</script>

<style scoped>
/* 查看器根容器（共享）：占满父容器、列布局，颜色统一走主题变量 */
.file-viewer-shell {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background-color: var(--theme-background-color);
    color: var(--theme-text-color);
}

/* 加载 / 错误 / 空态容器（共享） */
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

/* 加载动画（共享） */
.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--theme-border-color);
    border-top: 4px solid var(--theme-accent-color);
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

/* 错误 / 空态图标（共享） */
.error-icon,
.empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
}

.error-container p {
    color: var(--theme-error-color);
    margin-bottom: 16px;
}

/* 重试按钮（共享） */
.retry-button {
    padding: 8px 16px;
    background-color: var(--theme-accent-color);
    color: var(--theme-button-text-color);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.retry-button:hover {
    background-color: var(--theme-hover-background);
}

/* 内容态包装容器（共享）：列布局 + 隐藏溢出，内容区自行滚动 */
.file-viewer-content-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
}

/* 工具栏（共享） */
.file-viewer-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background-color: var(--theme-toolbar-background);
    border-bottom: 1px solid var(--theme-border-color);
}

/* 文件名（共享，超长省略） */
.file-name {
    font-weight: 500;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 16px;
}

/* 工具栏按钮容器（共享） */
.toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

/* 工具栏按钮由查看器插槽内容提供（在父组件作用域渲染），
   用 :deep 穿透 scoped 隔离，保证两个查看器共用同一套按钮样式 */
.file-viewer-shell :deep(.toolbar-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 4px;
    background-color: transparent;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--theme-text-color);
}

.file-viewer-shell :deep(.toolbar-btn:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
}

.file-viewer-shell :deep(.toolbar-btn:hover:not(:disabled)) {
    background-color: var(--theme-hover-background);
    border-color: var(--theme-accent-color);
}

/* 空态说明文字（共享） */
.empty-container p {
    color: var(--theme-text-secondary);
    font-size: 14px;
}
</style>
