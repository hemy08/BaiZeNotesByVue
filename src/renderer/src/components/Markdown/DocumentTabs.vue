<template>
    <div
        class="document-tabs"
        role="tablist"
        :aria-label="t('common.file')"
        @wheel.prevent="handleWheel"
    >
        <div
            v-for="tab in tabs"
            :key="tab.path"
            class="document-tab"
            :class="{ 'is-active': isActive(tab), 'is-switching': switching && isActive(tab) }"
            role="tab"
            :aria-selected="isActive(tab)"
            :tabindex="isActive(tab) ? 0 : -1"
            :title="tab.path"
            @click="emitSelect(tab.path)"
            @keydown.enter.prevent="emitSelect(tab.path)"
            @keydown.space.prevent="emitSelect(tab.path)"
        >
            <span v-if="tab.dirty" class="document-tab-dirty" aria-hidden="true">●</span>
            <span class="document-tab-name">{{ tab.name }}</span>
            <button
                type="button"
                class="document-tab-close"
                :disabled="!canClose"
                :aria-label="t('common.close')"
                :title="t('common.close')"
                @click.stop="emitClose(tab.path)"
            >
                ×
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * A1 多标签栏（opt-in：`featureTabs` 开启且存在至少一个已打开文件时才渲染）。
 *
 * 职责边界：纯展示 + 用户意图上抛（select / close），不持有会话、不直接调用 IPC；
 * 切换/关闭/会话逻辑全部在 `useDocumentTabs` 控制器与 `MarkdownEditComponent` 接线层。
 * 颜色一律走主题 CSS 变量（UI-01），无硬编码主题色。
 */
import { watch, nextTick } from 'vue'
import type { PropType } from 'vue'
import { t } from '../../common/i18n'
import { sameDocumentPath, type DocumentTab } from './useDocumentTabs'

const props = defineProps({
    /** 标签列表（顺序 = 打开顺序） */
    tabs: {
        type: Array as PropType<DocumentTab[]>,
        default: () => []
    },
    /** 活动标签路径 */
    activePath: {
        type: String,
        default: ''
    },
    /** 是否正在等待主进程确认切换（活动标签显示等待态） */
    switching: {
        type: Boolean,
        default: false
    },
    /** 是否允许关闭标签（最后一个标签不可关闭，与控制器语义一致） */
    canClose: {
        type: Boolean,
        default: true
    }
})

const emit = defineEmits<{
    (e: 'select', path: string): void
    (e: 'close', path: string): void
}>()

/** 判断标签是否为活动标签（路径大小写不敏感，复用控制器同一口径） */
function isActive(tab: DocumentTab): boolean {
    return sameDocumentPath(tab.path, props.activePath)
}

function emitSelect(path: string): void {
    emit('select', path)
}

function emitClose(path: string): void {
    emit('close', path)
}

/** 竖向滚轮在标签栏上转为横向滚动（标签多时不遮挡编辑器滚动） */
function handleWheel(event: WheelEvent): void {
    const element = event.currentTarget as HTMLElement | null
    if (!element) {
        return
    }
    element.scrollLeft += event.deltaY + event.deltaX
}

/** 活动标签变化时滚动到可见区域（jsdom/旧环境无 scrollIntoView 时静默跳过） */
watch(
    () => props.activePath,
    () => {
        void nextTick(() => {
            const element = document.querySelector<HTMLElement>('.document-tab.is-active')
            if (element && typeof element.scrollIntoView === 'function') {
                element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }
        })
    }
)
</script>

<style scoped>
.document-tabs {
    flex: 0 0 auto;
    display: flex;
    align-items: stretch;
    gap: 2px;
    height: 30px;
    padding: 2px 4px 0;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    user-select: none;
    background-color: var(--theme-card-background, #ffffff);
    border-bottom: 1px solid var(--theme-border-color, #e0e0e0);
    scrollbar-width: thin;
}

.document-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 220px;
    min-width: 72px;
    padding: 0 4px 0 10px;
    box-sizing: border-box;
    cursor: pointer;
    color: var(--theme-secondary-text-color, #666666);
    background-color: transparent;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    transition: all 0.2s ease;
}

.document-tab:hover {
    background-color: var(--theme-hover-background, #f0e8ff);
    color: var(--theme-text-color, #2d2d2d);
}

.document-tab.is-active {
    color: var(--theme-text-color, #2d2d2d);
    background-color: var(--theme-background-color, #f5f0ff);
    border-color: var(--theme-border-color, #e0e0e0);
    border-bottom: 2px solid var(--theme-accent-color, #764ba2);
}

.document-tab:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--theme-accent-color, #764ba2);
}

.document-tab.is-switching {
    opacity: 0.7;
    cursor: progress;
}

.document-tab-dirty {
    flex: 0 0 auto;
    font-size: 10px;
    line-height: 1;
    color: var(--theme-accent-color, #764ba2);
}

.document-tab-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
}

.document-tab-close {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    color: inherit;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.document-tab-close:hover:not(:disabled) {
    color: var(--theme-button-text-color, #ffffff);
    background-color: var(--theme-accent-color, #764ba2);
}

.document-tab-close:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.document-tab-close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--theme-accent-color, #764ba2);
}
</style>
