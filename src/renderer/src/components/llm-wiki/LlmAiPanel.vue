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
                        :data-model-state="modelState"
                        :aria-label="t('editorUi.llmWikiPanel.modelLabel')"
                        :title="modelSelectTitle"
                        :disabled="modelSelectDisabled"
                    >
                        <option v-if="modelPlaceholderText" value="" disabled>
                            {{ modelPlaceholderText }}
                        </option>
                        <option v-for="option in modelOptions" :key="option.id" :value="option.id">
                            {{ option.name }}
                        </option>
                    </select>
                </label>
                <button
                    type="button"
                    class="llm-ai-panel-icon-btn llm-ai-panel-reset-width"
                    :title="t('editorUi.llmWikiPanel.resetWidth')"
                    :aria-label="t('editorUi.llmWikiPanel.resetWidth')"
                    @click="emit('reset-width')"
                >
                    ↺
                </button>
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

            <!-- 模型未配置/读取中/读取失败时的可见提示（aria-live 让读屏用户也能感知配置变化） -->
            <p
                v-if="modelNoteText"
                class="llm-ai-panel-model-note"
                role="status"
                aria-live="polite"
            >
                {{ modelNoteText }}
            </p>

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
 * LLM Wiki 工作台 · AI 输入面板（1.5.7 L5 / T5.2，UI 骨架批次；体验升级批次 A 接入多模型）。
 *
 * ## 范围
 * - 消息列表（用户/助手气泡 + 空态）、多行输入（Enter 发送 / Shift+Enter 换行）、
 *   发送/停止、上下文引用 chips（当前文档 / 选中文本）、结果操作（复制可用）、清空对话；
 * - **多模型选择**（体验升级批次 A）：经既有 `AI.GET_CONFIG` 读取配置快照，下拉展示
 *   `models[].name`（按配置顺序），默认选中 `defaultModelId`，发送时把真实模型 id
 *   经 `LlmAiSendPayload.modelId` 传给 transport（→ `AiChatRequest.modelId`）；
 *   AI 未启用/无模型时展示「未配置模型」占位并禁用发送；配置读取失败时降级为
 *   「默认模型」（不传 modelId，由主进程回退 defaultModelId），不阻断对话；
 * - 请求经可注入 transport 发出（`llm-ai-ipc-transport.ts` 默认走 `AI.CHAT`）。
 *
 * ## 交互与状态
 * - 消息为纯文本渲染（不做 HTML 解析）；发送请求带递增序号，停止/清空后迟到的响应被丢弃；
 * - 折叠态由父组件（WorkSpace）驱动：props `collapsed` + emit `toggle-collapse`，
 *   面板自身不持久化折叠状态（状态真源见 `llm-wiki-workbench.ts`）；
 * - 面板宽度由父组件（WorkSpace）的分隔条拖拽控制，`reset-width` 事件请求恢复默认宽度。
 *
 * ## 模型配置刷新时机（设置页保存后无需重启）
 * 1. 面板挂载时读取一次；
 * 2. 收到 `SYSTEM_SETTING_UPDATE` 广播时（设置保存的通用广播）重新读取；
 * 3. 系统设置对话框关闭时（AI 配置页经 `AI.SAVE_CONFIG` 保存，关闭时无 IPC 广播，
 *    以对话框可见性变化作为「用户可能改过 AI 配置」的刷新信号）；
 * 4. 面板从折叠恢复展开时重新读取；
 * 5. 每次发送前**静默**读取（失败保留当前列表），保证设置页新增/切换模型后下一次发送生效。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import { getConfigStore } from '../../common/useConfigStore'
import { IPC } from '../../../../shared/ipc-channels'
import LlmAiMessageList from './LlmAiMessageList.vue'
import {
    LLM_AI_TRANSPORT_INJECTION_KEY,
    placeholderLlmAiTransport,
    type LlmAiMessage,
    type LlmAiTransport
} from './llm-ai-transport'
import {
    readLlmAiModelCatalog,
    type LlmAiModelCatalog,
    type LlmAiModelOption
} from './llm-ai-config'

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
    /** 请求父组件把 AI 面板宽度恢复默认（分隔条双击的等价按钮入口） */
    (e: 'reset-width'): void
}>()

/** 通过 provide 注入的 transport（L3 或集成方可选注入方式） */
const injectedTransport = inject<LlmAiTransport | null>(LLM_AI_TRANSPORT_INJECTION_KEY, null)

// ================================ 对话状态 ================================

const inputValue = ref('')
const messages = ref<LlmAiMessage[]>([])
const isStreaming = ref(false)
/** 当前选中的真实模型 id（空 = 未选择/降级为默认模型，发送时不传 modelId） */
const selectedModelId = ref<string>('')

/** 消息 id 序号（仅渲染层 key，不发往主进程） */
let messageSeq = 0
/** 请求序号：停止/清空后递增，迟到的 transport 响应被丢弃 */
let requestSeq = 0
/** 当前请求的取消控制器（L3 流式实现可消费 signal；“停止”同时做本地取消） */
let activeController: AbortController | null = null
/** 发送前置配置刷新进行中（防止连点/Enter 重复发送） */
let preparingSend = false

/** 复制结果反馈状态 */
type CopyStatus = 'idle' | 'copied' | 'failed'
const copyStatus = ref<CopyStatus>('idle')
let copyStatusTimer: ReturnType<typeof setTimeout> | null = null

// ================================ 模型目录（AI.GET_CONFIG） ================================

/** 模型配置读取状态：loading 初次读取 / ready 已读取 / error 读取失败（降级默认模型） */
type ModelConfigStatus = 'loading' | 'ready' | 'error'
const modelConfigStatus = ref<ModelConfigStatus>('loading')
/** 归一化后的模型目录（读取失败时为 null） */
const modelCatalog = ref<LlmAiModelCatalog | null>(null)

/** 可发送所需的模型状态（unconfigured / loading 时禁用发送；error 降级允许发送） */
type ModelState = 'loading' | 'ready' | 'unconfigured' | 'error'

/** 当前模型状态（下拉占位、提示与发送禁用统一口径） */
const modelState = computed<ModelState>(() => {
    if (modelConfigStatus.value === 'loading') {
        return 'loading'
    }
    if (modelConfigStatus.value === 'error') {
        return 'error'
    }
    const catalog = modelCatalog.value
    return catalog && catalog.enabled && catalog.models.length > 0 ? 'ready' : 'unconfigured'
})

/** 下拉选项：已配置时按配置顺序展示真实模型；其余状态无真实选项（仅占位项） */
const modelOptions = computed<LlmAiModelOption[]>(() =>
    modelState.value === 'ready' ? (modelCatalog.value?.models ?? []) : []
)

/** 无真实选项时的占位文案（不可选） */
const modelPlaceholderText = computed(() => {
    if (modelState.value === 'loading') {
        return t('editorUi.llmWikiPanel.modelLoading')
    }
    if (modelState.value === 'unconfigured') {
        return t('editorUi.llmWikiPanel.modelUnconfigured')
    }
    if (modelState.value === 'error') {
        return t('editorUi.llmWikiPanel.modelFallback')
    }
    return ''
})

/** 下拉是否禁用（只有拿到真实模型列表才可切换） */
const modelSelectDisabled = computed(() => modelState.value !== 'ready')

/** 下拉标题：正常态提示用途；未配置态提示到设置页配置 */
const modelSelectTitle = computed(() =>
    modelState.value === 'unconfigured'
        ? t('editorUi.llmWikiPanel.modelUnconfiguredHint')
        : t('editorUi.llmWikiPanel.modelSelectHint')
)

/** 头部下方可见提示（仅未配置/读取失败时展示；正常态不占位） */
const modelNoteText = computed(() => {
    if (modelState.value === 'unconfigured') {
        return t('editorUi.llmWikiPanel.modelUnconfiguredHint')
    }
    if (modelState.value === 'error') {
        return t('editorUi.llmWikiPanel.modelLoadFailedHint')
    }
    return ''
})

/** 应用配置目录：保持当前选择（若仍存在），否则回落默认模型/首个模型 */
function applyModelCatalog(catalog: LlmAiModelCatalog): void {
    modelCatalog.value = catalog
    modelConfigStatus.value = 'ready'
    const ids = catalog.models.map((model) => model.id)
    if (ids.length === 0) {
        selectedModelId.value = ''
        return
    }
    if (selectedModelId.value.length > 0 && ids.includes(selectedModelId.value)) {
        return
    }
    selectedModelId.value =
        catalog.defaultModelId && ids.includes(catalog.defaultModelId)
            ? catalog.defaultModelId
            : ids[0]
}

/**
 * 读取/刷新模型目录。
 * @param silent 静默刷新（发送前）：读取失败时保留当前目录/选择，不把已可用面板降级为错误态
 */
async function refreshModelCatalog(options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
        modelConfigStatus.value = 'loading'
    }
    const result = await readLlmAiModelCatalog()
    if (result.status === 'ready') {
        applyModelCatalog(result.catalog)
        return
    }
    // 静默刷新失败（发送前）：保留当前目录与选中模型，发送由主进程兜底 defaultModelId
    if (options.silent) {
        return
    }
    modelCatalog.value = null
    selectedModelId.value = ''
    modelConfigStatus.value = 'error'
}

/** 主进程系统设置广播（设置保存后通用广播；AI 配置随之可能变化）→ 重新读取模型列表 */
function handleSystemSettingUpdate(): void {
    void refreshModelCatalog()
}

/** 是否已订阅系统设置广播（卸载时成对退订） */
let systemSettingSubscribed = false

/** 订阅系统设置广播（缺 ipcRenderer.on 的测试/裁剪环境静默跳过） */
function subscribeSystemSettingUpdate(): void {
    if (typeof window === 'undefined' || systemSettingSubscribed) {
        return
    }
    const ipcRenderer = window.electron?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.on !== 'function') {
        return
    }
    ipcRenderer.on(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
    systemSettingSubscribed = true
}

/** 退订系统设置广播（幂等） */
function unsubscribeSystemSettingUpdate(): void {
    if (!systemSettingSubscribed) {
        return
    }
    systemSettingSubscribed = false
    if (typeof window === 'undefined') {
        return
    }
    const ipcRenderer = window.electron?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.removeListener !== 'function') {
        return
    }
    ipcRenderer.removeListener(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
}

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

/**
 * 是否可发送：有非空输入、当前没有进行中的请求，且模型配置已就绪。
 * 读取中/未配置（AI 未启用或无模型）时禁用发送，避免发出必然失败的请求。
 */
const canSend = computed(
    () =>
        inputValue.value.trim().length > 0 &&
        !isStreaming.value &&
        modelState.value !== 'loading' &&
        modelState.value !== 'unconfigured'
)

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
    if (!canSend.value || preparingSend) {
        return
    }
    preparingSend = true
    try {
        // 发送前静默刷新模型配置：设置页新增/切换模型后无需重启即可生效。
        // 读取失败保留当前选择（降级由主进程使用 defaultModelId）。
        await refreshModelCatalog({ silent: true })
        // 刷新后若变为「读取中 / 未配置」，本次发送作废（输入保留在输入框，便于配置后重试）
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
                // 仅在拿到真实模型 id 时下发；配置读取失败降级时省略（主进程用 defaultModelId）
                ...(selectedModelId.value.length > 0 ? { modelId: selectedModelId.value } : {}),
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
    } finally {
        preparingSend = false
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

/** 面板从折叠恢复展开时重新读取模型配置（设置页保存后用户回到对话入口） */
watch(
    () => props.collapsed,
    (collapsed) => {
        if (!collapsed) {
            void refreshModelCatalog()
        }
    }
)

/**
 * 系统设置对话框关闭时重新读取模型配置。
 * AI 助手配置页的模型增删改经 `AI.SAVE_CONFIG` 保存且不广播系统设置更新，因此把
 * 「设置对话框由打开 → 关闭」作为用户可能改过 AI 配置的刷新信号（无需轮询/新 IPC）。
 */
const configStore = getConfigStore()
watch(
    () => configStore.dialogs.systemSettings.visible,
    (visible) => {
        if (!visible) {
            void refreshModelCatalog()
        }
    }
)

onMounted(() => {
    // 首帧读取模型目录（失败降级为默认模型，不阻断面板使用）
    void refreshModelCatalog()
    subscribeSystemSettingUpdate()
})

onBeforeUnmount(() => {
    clearCopyStatusTimer()
    // 组件卸载（退出 LLM Wiki 模式）时作废进行中的请求并中止
    requestSeq += 1
    activeController?.abort()
    activeController = null
    unsubscribeSystemSettingUpdate()
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
    /* 容器查询：面板宽度由 WorkSpace 分隔条拖拽决定（与窗口宽度无关） */
    container-type: inline-size;
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

/* 模型未配置 / 读取中 / 读取失败的可见提示行（正常态不渲染，零占位） */
.llm-ai-panel-model-note {
    flex: 0 0 auto;
    margin: 0;
    padding: 6px var(--ui-pad, 12px);
    font-size: 12px;
    line-height: 1.5;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    background: var(--ui-accent-soft, var(--theme-hover-background));
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
}

/* 窄面板（拖动分隔条到最小宽度）时收起「模型」文字标签，给下拉与图标按钮让位 */
@container (max-width: 300px) {
    .llm-ai-panel-model-label {
        display: none;
    }
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
