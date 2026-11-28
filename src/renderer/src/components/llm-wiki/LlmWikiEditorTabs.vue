<template>
    <div
        class="llm-wiki-editor-tabs"
        role="group"
        :aria-label="t('editorUi.llmWikiPanel.editorTabsLabel')"
    >
        <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="llm-wiki-editor-tab"
            :class="{ 'is-active': activeTab === tab.id }"
            :aria-pressed="activeTab === tab.id"
            :data-tab="tab.id"
            @click="selectTab(tab.id)"
        >
            {{ tab.label }}
        </button>
    </div>
</template>

<script setup lang="ts">
/**
 * LLM Wiki 工作台编辑区「编辑器 / 预览」分段切换（1.5.7 L5 / T5.1）。
 *
 * ## 职责边界
 * - 只切换共享 UI 状态（`llm-wiki-workbench.ts` 的 editorTab，localStorage 持久化），
 *   不直接操作 Monaco/预览组件：两个窗格由 `MarkdownEditComponent` 用 `v-show` 承接，
 *   保证切换时实例不重建（光标/滚动/预览滚动位置保留）；
 * - 颜色/圆角/间距全部消费 `--ui-*` 令牌（四风格 × 三密度由根元素 data-style /
 *   data-density 派生，组件内不做风格分支）。
 */
import { computed } from 'vue'
import { t } from '../../common/i18n'
import {
    ensureLlmWikiWorkbenchStateLoaded,
    llmWikiWorkbenchState,
    setLlmWikiEditorTab,
    LLM_WIKI_EDITOR_TAB,
    type LlmWikiEditorTab
} from './llm-wiki-workbench'

// 首帧即读取持久化 tab（幂等；WorkSpace 亦会调用，二者顺序无关）
ensureLlmWikiWorkbenchStateLoaded()

/** 分段项（标签经 computed 内 t() 解析，语言切换后自动更新） */
const tabs = computed(() => [
    { id: LLM_WIKI_EDITOR_TAB.EDITOR, label: t('editorUi.llmWikiPanel.tabEditor') },
    { id: LLM_WIKI_EDITOR_TAB.PREVIEW, label: t('editorUi.llmWikiPanel.tabPreview') }
])

/** 当前激活 tab */
const activeTab = computed(() => llmWikiWorkbenchState.editorTab)

/** 选择 tab（归一化 + 持久化由状态模块负责） */
function selectTab(tab: LlmWikiEditorTab): void {
    setLlmWikiEditorTab(tab)
}
</script>

<style scoped>
/* 编辑区顶部工具条：与既有 #md-edit-tools-bar 同底，作为单栏工作台的视图切换入口 */
.llm-wiki-editor-tabs {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    padding: 4px 8px;
    background-color: var(--theme-card-background);
    background-color: var(--bz-shell-surface, var(--theme-card-background));
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.llm-wiki-editor-tab {
    min-height: var(--ui-row-height, 28px);
    padding: 4px 12px;
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    line-height: 1.4;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    cursor: pointer;
    background: transparent;
    border: var(--ui-hairline-width, 1px) solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-wiki-editor-tab:hover {
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-wiki-editor-tab.is-active {
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
    border-color: var(--ui-accent, var(--theme-accent-color));
}

.llm-wiki-editor-tab:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}
</style>
