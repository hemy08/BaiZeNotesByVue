<template>
    <!--
        1.5.7 LLM Wiki 迁移批次 M2：AI 编译草案 diff 展示（共享展示子组件）。
        从既有单文件审批 UI `Markdown/llm-ingest-diff.vue` 抽取：只负责「来源 → 目标」元信息 +
        行级 diff 渲染，不发起 IPC、不写盘、不持有审批动作；供单文件审批与批量编译审批共用，
        保证两处 diff 展示口径一致（颜色/行号/截断提示全部走同一份实现）。
    -->
    <div class="llm-ingest-diff-view" data-testid="llm-ingest-diff-view">
        <div class="ingest-meta" data-testid="ingest-meta">
            <div class="ingest-meta-item">
                <span class="ingest-meta-label">{{ t('editorUi.llmIngest.sourceLabel') }}</span>
                <code class="ingest-meta-value">{{ draft.sourcePath }}</code>
            </div>
            <div class="ingest-meta-item">
                <span class="ingest-meta-label">{{ t('editorUi.llmIngest.targetLabel') }}</span>
                <code class="ingest-meta-value">{{ draft.draftPath }}</code>
                <span
                    class="ingest-badge"
                    :class="draft.isUpdate ? 'is-update' : 'is-new'"
                    data-testid="ingest-badge"
                >
                    {{
                        draft.isUpdate
                            ? t('editorUi.llmIngest.updateBadge')
                            : t('editorUi.llmIngest.newBadge')
                    }}
                </span>
            </div>
            <div class="ingest-diff-summary">
                <span class="diff-count diff-count-add">
                    {{ t('editorUi.llmIngest.addCount', { count: additions }) }}
                </span>
                <span class="diff-count diff-count-del">
                    {{ t('editorUi.llmIngest.delCount', { count: deletions }) }}
                </span>
            </div>
        </div>

        <p v-if="renderTruncated" class="ingest-truncated" data-testid="ingest-truncated">
            {{ t('editorUi.llmIngest.truncated', { count: RENDER_LINE_LIMIT }) }}
        </p>

        <div
            class="ingest-diff-lines"
            role="list"
            :aria-label="t('editorUi.llmIngest.diffLabel')"
            data-testid="ingest-diff-lines"
        >
            <div
                v-for="(line, index) in renderedDiffLines"
                :key="index"
                class="diff-line"
                :class="`is-${line.type}`"
                role="listitem"
            >
                <span class="diff-line-no">{{ line.oldLine ?? '' }}</span>
                <span class="diff-line-no">{{ line.newLine ?? '' }}</span>
                <span class="diff-line-sign" aria-hidden="true">{{ diffSign(line.type) }}</span>
                <code class="diff-line-content">{{ line.content }}</code>
            </div>
            <p v-if="renderedDiffLines.length === 0" class="ingest-diff-empty">
                {{ t('editorUi.llmIngest.empty') }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 1.5.7 LLM Wiki 迁移批次 M2：diff 展示共享子组件（纯展示，无副作用）。
 *
 * 抽取自 `components/Markdown/llm-ingest-diff.vue` 的展示部分：单文件审批与批量编译审批
 * 共用同一份「元信息 + 行级 diff」渲染，避免两处样式/截断口径漂移。父组件保留各自的
 * 审批动作与状态（应用/跳过/关闭），本组件只接收主进程返回的草案。
 */
import { computed } from 'vue'
import type { AiDiffLine, AiIngestSuccess } from '../../../../shared/types/ai'
import { t } from '../../common/i18n'

interface Props {
    /** 主进程 `AI.INGEST` 成功返回的草案（diff 行 + 来源/目标路径） */
    draft: AiIngestSuccess
}

const props = defineProps<Props>()

/** diff 渲染上限（主进程最多返回 2000 行；渲染层再收口，避免一次性挂载过多 DOM） */
const RENDER_LINE_LIMIT = 800

/** 新增/删除行数（用于元信息摘要） */
const additions = computed(() => props.draft.diff.filter((line) => line.type === 'add').length)
const deletions = computed(() => props.draft.diff.filter((line) => line.type === 'del').length)

/** 渲染的 diff 行（上限 RENDER_LINE_LIMIT，超出提示） */
const renderedDiffLines = computed<AiDiffLine[]>(() => props.draft.diff.slice(0, RENDER_LINE_LIMIT))

/** 是否因渲染上限截断 */
const renderTruncated = computed(
    () => props.draft.diff.length > RENDER_LINE_LIMIT || props.draft.diffTruncated === true
)

/** diff 行前缀符号（+/-/空格；纯展示用途，屏幕阅读器读取行内容） */
function diffSign(type: AiDiffLine['type']): string {
    if (type === 'add') {
        return '+'
    }
    if (type === 'del') {
        return '-'
    }
    return ' '
}
</script>

<style scoped>
/* 1.5.7 LLM Wiki 迁移批次 M2：diff 展示（主题令牌 --ui-* / 既有 --theme-* 兼容变量） */
.llm-ingest-diff-view {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--text-color);
}

.ingest-meta {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg-sunken, var(--card-bg));
}

.ingest-meta-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}

.ingest-meta-label {
    color: var(--secondary-text-color);
}

.ingest-meta-value {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--text-color);
    word-break: break-all;
}

.ingest-badge {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid var(--ui-border, var(--border-color));
}

.ingest-badge.is-new {
    color: var(--ui-accent, var(--accent-color));
    border-color: var(--ui-accent, var(--accent-color));
}

.ingest-badge.is-update {
    color: var(--secondary-text-color);
}

.ingest-diff-summary {
    display: flex;
    gap: 16px;
    font-size: 12px;
}

.diff-count-add {
    color: var(--ui-success, var(--accent-color));
}

.diff-count-del {
    color: var(--ui-danger, var(--danger-color));
}

.ingest-truncated {
    margin: 0;
    font-size: 12px;
    color: var(--secondary-text-color);
}

.ingest-diff-lines {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg-sunken, var(--card-bg));
    overflow: auto;
}

.diff-line {
    display: grid;
    grid-template-columns: 40px 40px 16px minmax(0, 1fr);
    gap: 4px;
    align-items: start;
    padding: 1px 8px;
    font-size: 12px;
    line-height: 1.6;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    white-space: pre-wrap;
    word-break: break-word;
}

.diff-line.is-add {
    background: color-mix(in srgb, var(--ui-success, var(--accent-color)) 12%, transparent);
}

.diff-line.is-del {
    background: color-mix(in srgb, var(--ui-danger, var(--danger-color)) 12%, transparent);
}

.diff-line.is-context {
    color: var(--secondary-text-color);
}

.diff-line-no {
    color: var(--secondary-text-color);
    text-align: right;
    user-select: none;
}

.diff-line-sign {
    user-select: none;
    text-align: center;
}

.diff-line-content {
    font-family: inherit;
    white-space: pre-wrap;
    word-break: break-word;
}

.ingest-diff-empty {
    margin: 0;
    padding: 12px;
    font-size: 12px;
    color: var(--secondary-text-color);
}
</style>
