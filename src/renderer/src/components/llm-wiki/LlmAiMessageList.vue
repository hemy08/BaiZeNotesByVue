<template>
    <div class="llm-ai-message-list">
        <div v-if="messages.length === 0 && !pending" class="llm-ai-message-empty">
            <p class="llm-ai-message-empty-title">
                {{ t('editorUi.llmWikiPanel.emptyTitle') }}
            </p>
            <p class="llm-ai-message-empty-hint">{{ t('editorUi.llmWikiPanel.emptyHint') }}</p>
        </div>
        <div
            v-else
            ref="listElement"
            class="llm-ai-messages"
            role="log"
            :aria-label="t('editorUi.llmWikiPanel.messageListLabel')"
            aria-live="polite"
        >
            <article
                v-for="message in messages"
                :key="message.id"
                class="llm-ai-message"
                :class="`llm-ai-message--${message.role}`"
                :data-role="message.role"
            >
                <span class="llm-ai-message-role">{{ roleLabel(message.role) }}</span>
                <p class="llm-ai-message-content">{{ message.content }}</p>
                <div v-if="message.role === 'assistant'" class="llm-ai-message-actions">
                    <button
                        type="button"
                        class="llm-ai-message-action llm-ai-message-copy"
                        :title="t('editorUi.llmWikiPanel.copy')"
                        @click="emit('copy', message.content)"
                    >
                        {{ t('editorUi.llmWikiPanel.copy') }}
                    </button>
                    <button
                        type="button"
                        class="llm-ai-message-action llm-ai-message-apply"
                        disabled
                        aria-disabled="true"
                        :title="t('editorUi.llmWikiPanel.applyComingSoon')"
                    >
                        {{ t('editorUi.llmWikiPanel.apply') }}
                    </button>
                </div>
            </article>
            <article
                v-if="pending"
                class="llm-ai-message llm-ai-message--assistant llm-ai-message--pending"
                data-role="assistant"
                data-pending="true"
            >
                <span class="llm-ai-message-role">{{ roleLabel('assistant') }}</span>
                <p class="llm-ai-message-content">{{ t('editorUi.llmWikiPanel.thinking') }}</p>
            </article>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * AI 对话消息列表（LLM Wiki 工作台 · 1.5.7 L5 / T5.2）。
 *
 * ## 职责边界
 * - 纯展示 + 用户意图上抛（`copy`）：不做请求、不操作剪贴板（由 `LlmAiPanel` 承接）；
 * - 消息正文以**纯文本**渲染（`<p>` + `white-space: pre-wrap`，不使用 v-html），
 *   避免把模型输出当 HTML 解析引入 XSS 面；
 * - 「应用到编辑器」为占位按钮：本批次禁用并提示待接入（L3/T5.3 提供 diff 审批后启用）。
 */
import { nextTick, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { t } from '../../common/i18n'
import type { LlmAiMessage } from './llm-ai-transport'

const props = defineProps({
    /** 消息列表（用户 / 助手） */
    messages: {
        type: Array as PropType<LlmAiMessage[]>,
        default: () => []
    },
    /** 是否正在等待 AI 回复（展示「正在生成…」占位气泡） */
    pending: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits<{
    (e: 'copy', content: string): void
}>()

const listElement = ref<HTMLElement | null>(null)

/** 角色显示名（t() 在渲染期调用，语言切换后自动更新） */
function roleLabel(role: LlmAiMessage['role']): string {
    return role === 'user'
        ? t('editorUi.llmWikiPanel.userRole')
        : t('editorUi.llmWikiPanel.assistantRole')
}

/** 新消息到达 / 生成状态变化时滚动到底部（jsdom 等无布局环境 scrollHeight 为 0，安全） */
watch(
    () => [props.messages.length, props.pending],
    () => {
        void nextTick(() => {
            const element = listElement.value
            if (element) {
                element.scrollTop = element.scrollHeight
            }
        })
    }
)
</script>

<style scoped>
.llm-ai-message-list {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
}

.llm-ai-messages {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: var(--ui-pad, 12px);
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
}

.llm-ai-message-empty {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px var(--ui-pad, 12px);
    text-align: center;
}

.llm-ai-message-empty-title {
    margin: 0;
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
    color: var(--ui-text, var(--theme-text-color));
}

.llm-ai-message-empty-hint {
    max-width: 280px;
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
}

.llm-ai-message {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 100%;
    padding: 8px 12px;
    box-sizing: border-box;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-md, 4px);
}

.llm-ai-message--user {
    align-self: flex-end;
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-ai-message--assistant,
.llm-ai-message--pending {
    align-self: flex-start;
    background: var(--ui-bg-sunken, var(--theme-background-color));
}

.llm-ai-message--pending {
    opacity: 0.8;
}

.llm-ai-message-role {
    font-size: 12px;
    line-height: 1.4;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
}

.llm-ai-message-content {
    margin: 0;
    font-size: var(--ui-font-size, 13px);
    line-height: 1.6;
    color: var(--ui-text, var(--theme-text-color));
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.llm-ai-message-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
}

.llm-ai-message-action {
    padding: 4px 8px;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.4;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    cursor: pointer;
    background: transparent;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-message-action:hover:not(:disabled) {
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-ai-message-action:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-message-action:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
</style>
