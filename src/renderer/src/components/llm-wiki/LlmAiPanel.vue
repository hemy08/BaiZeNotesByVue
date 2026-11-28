<template>
    <section
        class="llm-ai-panel"
        :class="{ 'llm-ai-panel--collapsed': collapsed }"
        :data-collapsed="collapsed ? 'true' : 'false'"
        :aria-label="t('editorUi.llmWikiPanel.ariaLabel')"
    >
        <!-- 折叠态：48px 侧栏，仅保留展开入口（窄窗口自动折叠时不可展开，提示加宽窗口） -->
        <template v-if="collapsed">
            <button
                type="button"
                class="llm-ai-panel-expand"
                :disabled="!canExpand"
                :title="
                    canExpand
                        ? t('editorUi.llmWikiPanel.expand')
                        : t('editorUi.llmWikiPanel.narrowCollapsedHint')
                "
                :aria-label="
                    canExpand
                        ? t('editorUi.llmWikiPanel.expand')
                        : t('editorUi.llmWikiPanel.narrowCollapsedHint')
                "
                @click="emit('toggle-collapse')"
            >
                <span class="llm-ai-panel-expand-mark" aria-hidden="true">«</span>
                <span class="llm-ai-panel-expand-text" aria-hidden="true">AI</span>
            </button>
        </template>
        <template v-else>
            <header class="llm-ai-panel-header">
                <h2 class="llm-ai-panel-title">{{ t('editorUi.llmWikiPanel.title') }}</h2>
                <label class="llm-ai-panel-model">
                    <span class="llm-ai-panel-model-label">
                        {{ t('editorUi.llmWikiPanel.modelLabel') }}
                    </span>
                    <select
                        v-model="selectedModelId"
                        class="llm-ai-panel-model-select"
                        :aria-label="t('editorUi.llmWikiPanel.modelLabel')"
                        :title="t('editorUi.llmWikiPanel.modelHint')"
                    >
                        <option v-for="option in modelOptions" :key="option.id" :value="option.id">
                            {{ option.label }}
                        </option>
                    </select>
                </label>
                <button
                    type="button"
                    class="llm-ai-panel-icon-btn llm-ai-panel-clear"
                    :disabled="messages.length === 0"
                    :title="t('editorUi.llmWikiPanel.clear')"
                    :aria-label="t('editorUi.llmWikiPanel.clear')"
                    @click="handleClear"
                >
                    ×
                </button>
                <button
                    type="button"
                    class="llm-ai-panel-icon-btn llm-ai-panel-collapse"
                    :title="t('editorUi.llmWikiPanel.collapse')"
                    :aria-label="t('editorUi.llmWikiPanel.collapse')"
                    @click="emit('toggle-collapse')"
                >
                    »
                </button>
            </header>

            <!-- 上下文引用 chips：当前文档 / 选中文本；均为空时展示空态引导 -->
            <div
                class="llm-ai-panel-context"
                role="group"
                :aria-label="t('editorUi.llmWikiPanel.contextTitle')"
            >
                <span class="llm-ai-panel-context-title">
                    {{ t('editorUi.llmWikiPanel.contextTitle') }}
                </span>
                <span
                    v-if="documentNameText"
                    class="llm-ai-context-chip llm-ai-context-chip--document"
                    data-context="document"
                    :title="documentNameText"
                >
                    <span class="llm-ai-context-chip-kind">
                        {{ t('editorUi.llmWikiPanel.contextDocument') }}
                    </span>
                    <span class="llm-ai-context-chip-value">{{ documentNameText }}</span>
                </span>
                <span
                    v-if="selectionPreview"
                    class="llm-ai-context-chip llm-ai-context-chip--selection"
                    data-context="selection"
                    :title="selectionText"
                >
                    <span class="llm-ai-context-chip-kind">
                        {{ t('editorUi.llmWikiPanel.contextSelection') }}
                    </span>
                    <span class="llm-ai-context-chip-value">{{ selectionPreview }}</span>
                </span>
                <span v-if="!hasContext" class="llm-ai-panel-context-empty">
                    {{ t('editorUi.llmWikiPanel.contextEmpty') }}
                </span>
            </div>

            <LlmAiMessageList
                class="llm-ai-panel-messages"
                :messages="messages"
                :pending="isStreaming"
                @copy="handleCopy"
            />

            <div class="llm-ai-panel-composer">
                <textarea
                    v-model="inputValue"
                    class="llm-ai-panel-input"
                    :aria-label="t('editorUi.llmWikiPanel.inputLabel')"
                    :placeholder="t('editorUi.llmWikiPanel.inputPlaceholder')"
                    :rows="3"
                    @keydown="handleComposerKeydown"
                ></textarea>
                <div class="llm-ai-panel-composer-footer">
                    <span class="llm-ai-panel-status" role="status" aria-live="polite">
                        {{ statusText }}
                    </span>
                    <button
                        v-if="isStreaming"
                        type="button"
                        class="llm-ai-panel-btn llm-ai-panel-btn--stop llm-ai-stop"
                        :title="t('editorUi.llmWikiPanel.stop')"
                        @click="handleStop"
                    >
                        {{ t('editorUi.llmWikiPanel.stop') }}
                    </button>
                    <button
                        v-else
                        type="button"
                        class="llm-ai-panel-btn llm-ai-panel-btn--primary llm-ai-send"
                        :disabled="!canSend"
                        :title="t('editorUi.llmWikiPanel.send')"
                        @click="handleSend"
                    >
                        {{ t('editorUi.llmWikiPanel.send') }}
                    </button>
                </div>
            </div>
        </template>
    </section>
</template>

<script setup lang="ts">
/**
 * LLM Wiki 工作台 · AI 输入面板（1.5.7 L5 / T5.2，UI 骨架批次）。
 *
 * ## 本批次范围
 * - 交付：消息列表（用户/助手气泡 + 空态）、多行输入（Enter 发送 / Shift+Enter 换行）、
 *   发送/停止、模型选择占位、上下文引用 chips（当前文档 / 选中文本）、结果操作
 *   （复制可用；「应用到编辑器」占位禁用）、清空对话；
 * - **不接入真实 AI 通道**：请求经可注入 transport 发出，默认实现返回
 *   「AI 功能尚未接入（L3 批次提供）」。L3 批次经 props `transport` 或
 *   `provide(LLM_AI_TRANSPORT_INJECTION_KEY, transport)` 注入真实实现即可联调，
 *   面板内部逻辑与通道类型均不写死（见 `llm-ai-transport.ts`）。
 *
 * ## 交互与状态
 * - 消息为纯文本渲染（不做 HTML 解析）；发送请求带递增序号，停止/清空后迟到的响应被丢弃；
 * - 折叠态由父组件（WorkSpace）驱动：props `collapsed` + emit `toggle-collapse`，
 *   面板自身不持久化折叠状态（状态真源见 `llm-wiki-workbench.ts`）。
 */
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import type { PropType } from 'vue'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import LlmAiMessageList from './LlmAiMessageList.vue'
import {
    DEFAULT_LLM_AI_MODEL_ID,
    LLM_AI_MODEL_PLACEHOLDER,
    LLM_AI_TRANSPORT_INJECTION_KEY,
    placeholderLlmAiTransport,
    type LlmAiMessage,
    type LlmAiTransport
} from './llm-ai-transport'

const props = defineProps({
    /** 是否折叠为 48px 侧栏（由 WorkSpace 控制） */
    collapsed: {
        type: Boolean,
        default: false
    },
    /** 当前文档文件名（上下文 chips；空 = 未打开文档） */
    documentName: {
        type: String,
        default: ''
    },
    /** 当前选中文本（上下文 chips；空 = 无选区） */
    selectionText: {
        type: String,
        default: ''
    },
    /**
     * AI transport（优先级最高；L3/测试注入真实或 mock 实现）。
     * 未提供时依次尝试 provide 注入与占位默认实现。
     */
    transport: {
        type: Function as PropType<LlmAiTransport>,
        default: undefined
    },
    /** 折叠态是否允许展开（窄窗口自动折叠时为 false） */
    canExpand: {
        type: Boolean,
        default: true
    }
})

const emit = defineEmits<{
    (e: 'toggle-collapse'): void
}>()

/** 通过 provide 注入的 transport（L3 或集成方可选注入方式） */
const injectedTransport = inject<LlmAiTransport | null>(LLM_AI_TRANSPORT_INJECTION_KEY, null)

// ================================ 对话状态 ================================

const inputValue = ref('')
const messages = ref<LlmAiMessage[]>([])
const isStreaming = ref(false)
const selectedModelId = ref<string>(DEFAULT_LLM_AI_MODEL_ID)

/** 消息 id 序号（仅渲染层 key，不发往主进程） */
let messageSeq = 0
/** 请求序号：停止/清空后递增，迟到的 transport 响应被丢弃 */
let requestSeq = 0
/** 当前请求的取消控制器（L3 流式实现可消费 signal；“停止”同时做本地取消） */
let activeController: AbortController | null = null

/** 复制结果反馈状态 */
type CopyStatus = 'idle' | 'copied' | 'failed'
const copyStatus = ref<CopyStatus>('idle')
let copyStatusTimer: ReturnType<typeof setTimeout> | null = null

/** 模型选择器占位数据（真实模型列表由 L3 批次/设置页提供） */
const modelOptions = computed(() => [
    { id: LLM_AI_MODEL_PLACEHOLDER.DEFAULT, label: t('editorUi.llmWikiPanel.modelDefault') },
    { id: LLM_AI_MODEL_PLACEHOLDER.LOCAL, label: t('editorUi.llmWikiPanel.modelLocalMock') },
    { id: LLM_AI_MODEL_PLACEHOLDER.REMOTE, label: t('editorUi.llmWikiPanel.modelRemoteMock') }
])

/** 当前文档名（trim 后展示；空 = 无上下文） */
const documentNameText = computed(() => (props.documentName ?? '').trim())

/** 当前选中文本（trim 后展示） */
const selectionText = computed(() => (props.selectionText ?? '').trim())

/** 选中文本预览：压缩空白并截断，避免长选区撑破 chips */
const selectionPreview = computed(() => {
    const normalized = selectionText.value.replace(/\s+/g, ' ')
    return normalized.length > 40 ? `${normalized.slice(0, 40)}…` : normalized
})

/** 是否存在可展示的上下文引用 */
const hasContext = computed(
    () => documentNameText.value.length > 0 || selectionText.value.length > 0
)

/** 是否可发送：有非空输入且当前没有进行中的请求 */
const canSend = computed(() => inputValue.value.trim().length > 0 && !isStreaming.value)

/** 输入区底部状态文案：优先展示复制结果，否则展示快捷键提示 */
const statusText = computed(() => {
    if (copyStatus.value === 'copied') {
        return t('editorUi.llmWikiPanel.copied')
    }
    if (copyStatus.value === 'failed') {
        return t('editorUi.llmWikiPanel.copyFailed')
    }
    return t('editorUi.llmWikiPanel.inputHint')
})

/** 解析本次使用的 transport（props > provide > 占位默认） */
function resolveTransport(): LlmAiTransport {
    return props.transport ?? injectedTransport ?? placeholderLlmAiTransport
}

/** 构造一条消息（id 仅用于列表 key） */
function createMessage(role: LlmAiMessage['role'], content: string): LlmAiMessage {
    messageSeq += 1
    return { id: `llm-ai-message-${messageSeq}`, role, content }
}

// ================================ 发送 / 停止 ================================

/** 发送当前输入（Enter 或发送按钮触发） */
async function handleSend(): Promise<void> {
    if (!canSend.value) {
        return
    }
    const message = inputValue.value.trim()
    if (message.length === 0) {
        return
    }
    // 先追加用户消息并清空输入（失败时也保留用户已发送内容，便于重试）
    messages.value = [...messages.value, createMessage('user', message)]
    inputValue.value = ''
    isStreaming.value = true
    copyStatus.value = 'idle'
    requestSeq += 1
    const seq = requestSeq
    activeController = typeof AbortController === 'function' ? new AbortController() : null
    const controller = activeController
    try {
        const transport = resolveTransport()
        const reply = await transport({
            message,
            modelId: selectedModelId.value,
            history: messages.value.slice(),
            context: {
                documentName: documentNameText.value,
                selectionText: selectionText.value
            },
            ...(controller ? { signal: controller.signal } : {})
        })
        // 已被「停止/清空」作废：丢弃迟到响应
        if (seq !== requestSeq) {
            return
        }
        const content =
            typeof reply === 'string' && reply.trim().length > 0
                ? reply
                : t('editorUi.llmWikiPanel.emptyReply')
        messages.value = [...messages.value, createMessage('assistant', content)]
    } catch (error) {
        if (seq !== requestSeq) {
            return
        }
        logger.error('[LLM AI] 请求 AI 回复失败：', error)
        messages.value = [
            ...messages.value,
            createMessage('assistant', t('editorUi.llmWikiPanel.transportError'))
        ]
    } finally {
        if (seq === requestSeq) {
            isStreaming.value = false
            activeController = null
        }
    }
}

/** 停止生成：本地作废响应 + 中止信号（transport 是否消费 signal 由实现决定） */
function handleStop(): void {
    if (!isStreaming.value) {
        return
    }
    requestSeq += 1
    isStreaming.value = false
    activeController?.abort()
    activeController = null
}

/** 清空对话（进行中请求一并作废） */
function handleClear(): void {
    handleStop()
    messages.value = []
    copyStatus.value = 'idle'
    clearCopyStatusTimer()
}

// ================================ 结果操作 ================================

/** 复制指定回复到剪贴板（失败记日志并在状态区可见提示） */
async function handleCopy(content: string): Promise<void> {
    try {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (!clipboard || typeof clipboard.writeText !== 'function') {
            throw new Error('clipboard unavailable')
        }
        await clipboard.writeText(content)
        copyStatus.value = 'copied'
    } catch (error) {
        logger.warn('[LLM AI] 复制 AI 回复失败：', error)
        copyStatus.value = 'failed'
    }
    clearCopyStatusTimer()
    copyStatusTimer = setTimeout(() => {
        copyStatusTimer = null
        copyStatus.value = 'idle'
    }, 1600)
}

function clearCopyStatusTimer(): void {
    if (copyStatusTimer !== null) {
        clearTimeout(copyStatusTimer)
        copyStatusTimer = null
    }
}

// ================================ 键盘交互 ================================

/**
 * 输入框键盘：
 * - Enter 发送、Shift+Enter 换行；组合输入（IME）期间的 Enter 不发送；
 * - 带 Ctrl/Alt/Meta 的 Enter 保留给后续快捷键，不在本批次拦截。
 */
function handleComposerKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) {
        return
    }
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return
    }
    event.preventDefault()
    void handleSend()
}

onBeforeUnmount(() => {
    clearCopyStatusTimer()
    // 组件卸载（退出 LLM Wiki 模式）时作废进行中的请求并中止
    requestSeq += 1
    activeController?.abort()
    activeController = null
})
</script>

<style scoped>
.llm-ai-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    color: var(--ui-text, var(--theme-text-color));
}

/* ---------------- 折叠态侧栏 ---------------- */
.llm-ai-panel--collapsed {
    align-items: center;
    padding: 8px 0;
}

.llm-ai-panel-expand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 32px;
    padding: 8px 0;
    font-family: inherit;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    cursor: pointer;
    background: transparent;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-panel-expand:hover:not(:disabled) {
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-ai-panel-expand:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-panel-expand:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.llm-ai-panel-expand-mark {
    font-size: 14px;
    line-height: 1;
}

.llm-ai-panel-expand-text {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
    writing-mode: vertical-rl;
}

/* ---------------- 头部：标题 / 模型选择 / 清空 / 折叠 ---------------- */
.llm-ai-panel-header {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    align-items: center;
    padding: 8px var(--ui-pad, 12px);
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.llm-ai-panel-title {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.llm-ai-panel-model {
    display: flex;
    flex: 0 1 auto;
    gap: 4px;
    align-items: center;
    min-width: 0;
}

.llm-ai-panel-model-label {
    font-size: 12px;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    white-space: nowrap;
}

.llm-ai-panel-model-select {
    max-width: 132px;
    height: var(--ui-row-height, 28px);
    padding: 0 4px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-bg-sunken, var(--theme-background-color));
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-sm, 2px);
}

.llm-ai-panel-model-select:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-panel-icon-btn {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    font-family: inherit;
    font-size: 14px;
    line-height: 1;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    cursor: pointer;
    background: transparent;
    border: var(--ui-hairline-width, 1px) solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-panel-icon-btn:hover:not(:disabled) {
    color: var(--ui-text, var(--theme-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-ai-panel-icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-panel-icon-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

/* ---------------- 上下文引用 ---------------- */
.llm-ai-panel-context {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px var(--ui-pad, 12px);
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.llm-ai-panel-context-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
}

.llm-ai-panel-context-empty {
    font-size: 12px;
    line-height: 1.5;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
}

.llm-ai-context-chip {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    max-width: 100%;
    padding: 4px 8px;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.4;
    background: var(--ui-accent-soft, var(--theme-hover-background));
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-sm, 2px);
}

.llm-ai-context-chip-kind {
    flex: 0 0 auto;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
}

.llm-ai-context-chip-value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--ui-text, var(--theme-text-color));
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ---------------- 输入区 ---------------- */
.llm-ai-panel-composer {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 8px;
    padding: var(--ui-pad, 12px);
    border-top: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

.llm-ai-panel-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 72px;
    padding: 8px 12px;
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    line-height: 1.6;
    color: var(--ui-text, var(--theme-text-color));
    resize: vertical;
    background: var(--ui-bg-sunken, var(--theme-background-color));
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-sm, 2px);
}

.llm-ai-panel-input::placeholder {
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
}

.llm-ai-panel-input:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-panel-composer-footer {
    display: flex;
    gap: 8px;
    align-items: center;
}

.llm-ai-panel-status {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    text-overflow: ellipsis;
    white-space: nowrap;
}

.llm-ai-panel-btn {
    flex: 0 0 auto;
    min-height: var(--ui-row-height, 28px);
    padding: 4px 16px;
    font-family: inherit;
    font-size: 12px;
    color: var(--ui-text, var(--theme-text-color));
    cursor: pointer;
    background: var(--ui-accent-soft, var(--theme-hover-background));
    border: var(--ui-hairline-width, 1px) solid var(--ui-accent, var(--theme-accent-color));
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        opacity var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-panel-btn:hover:not(:disabled) {
    background: var(--ui-accent-soft, var(--theme-hover-background));
    opacity: 0.85;
}

.llm-ai-panel-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-panel-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

/* 窄面板：头部换行，避免模型选择/按钮溢出 */
@media (max-width: 1100px) {
    .llm-ai-panel-header {
        flex-wrap: wrap;
    }

    .llm-ai-panel-title {
        flex: 1 1 100%;
    }
}
</style>
