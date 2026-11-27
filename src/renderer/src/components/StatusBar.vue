<template>
    <div id="status-bar-container">
        <div id="status-bar-file-path" :class="{ unsaved: isUnsaved, saved: !isUnsaved }">
            <span v-if="isUnsaved" class="unsaved-indicator" aria-hidden="true">●</span>
            <span v-else class="saved-indicator" aria-hidden="true">●</span>
            <div class="file-path-label">{{ t('status.filePathLabel') }}</div>
            <span class="file-path-text">{{ displayFilePath }}</span>
        </div>
        <div class="status-bar-divider" aria-hidden="true"></div>
        <div id="status-bar-console" :class="consoleType">
            <!--
                错误消息：danger 状态点 + 可点击打开详情（COMPONENTS.md §7.1：
                不允许静默失败；状态栏单行截断时点击可查看完整消息）。
            -->
            <template v-if="isErrorConsole">
                <button
                    ref="errorTriggerRef"
                    type="button"
                    class="console-trigger"
                    :class="{ 'console-trigger--open': errorDetailOpen }"
                    :aria-expanded="errorDetailOpen ? 'true' : 'false'"
                    aria-haspopup="dialog"
                    :aria-controls="ERROR_DETAIL_ID"
                    :aria-label="consoleMessage"
                    :title="consoleMessage"
                    @click="toggleErrorDetail"
                >
                    <span class="console-dot" aria-hidden="true"></span>
                    <span class="console-message" aria-live="polite" aria-atomic="true">
                        {{ consoleMessage }}
                    </span>
                </button>
                <div
                    v-if="errorDetailOpen"
                    :id="ERROR_DETAIL_ID"
                    ref="errorDetailRef"
                    class="status-error-popover"
                    role="dialog"
                    aria-modal="false"
                    :aria-label="t('common.error')"
                    tabindex="-1"
                    @keydown.esc.stop.prevent="closeErrorDetail()"
                >
                    <div class="status-error-popover__header">
                        <span class="status-error-popover__title">{{ t('common.error') }}</span>
                        <button
                            type="button"
                            class="status-error-popover__close"
                            :aria-label="t('common.close')"
                            @click="closeErrorDetail()"
                        >
                            ×
                        </button>
                    </div>
                    <p class="status-error-popover__message">{{ consoleMessage }}</p>
                </div>
            </template>
            <template v-else>
                <span class="console-icon" aria-hidden="true">{{ consoleIcon }}</span>
                <span class="console-message" aria-live="polite" aria-atomic="true">
                    {{ consoleMessage }}
                </span>
            </template>
        </div>
        <div class="status-bar-divider" aria-hidden="true"></div>
        <div id="status-bar-info">
            <button
                v-if="flags.writingMode"
                type="button"
                class="writing-mode-toggle"
                :class="{ active: writingModeState.enabled }"
                :aria-pressed="writingModeState.enabled"
                @click="toggleWritingMode"
            >
                {{
                    writingModeState.enabled
                        ? t('editorUi.writingMode.exit')
                        : t('editorUi.writingMode.enter')
                }}
            </button>
            <div v-if="flags.writingStats" id="status-bar-writing-stats" class="writing-stats">
                <span v-if="selectionActive" class="writing-stats-selection">
                    {{ selectionSummary }}
                </span>
                <span v-else class="writing-stats-main">{{ writingSummary }}</span>
                <span class="writing-stats-goal">{{ goalSummary }}</span>
            </div>
            <div id="status-bar-file-type">Markdown</div>
            <div id="status-bar-encoding">{{ encodingDisplay }}</div>
            <div id="status-bar-cursor-position">{{ cursorDisplay }}</div>
            <div id="status-bar-file-size">{{ fileSizeDisplay }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, nextTick, watch } from 'vue'
// Position 仅作为光标位置事件参数的类型使用（运行时字段为 lineNumber/column，
// 不依赖 monaco 枚举值）；改为 import type 后编译期擦除，不把 monaco 拉入模块图。
import type { Position } from 'monaco-editor'
import { IPC } from '../../../shared/ipc-channels'
import type { StatusBarMessageType, StatusBarUpdatePayload } from '../../../shared/types'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { useEventBus } from '../composables/useEventBus'
import { t } from '../common/i18n'
import { toggleWritingMode, writingModeState } from './Markdown/useWritingMode'
import { useFeatureFlags } from '../composables/useFeatureFlags'
import { writingSessionState } from './Markdown/useWritingSession'

// M5：状态栏 3 个进程内事件统一经 useEventBus 注册，组件卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'StatusBar' })
const { flags } = useFeatureFlags()

const writingSummary = computed(() =>
    t('status.writingStats.summary', {
        cjk: writingSessionState.stats.cjkChars,
        words: writingSessionState.stats.latinWords,
        chars: writingSessionState.stats.totalChars,
        minutes: writingSessionState.stats.readingMinutes
    })
)
const selectionActive = computed(
    () =>
        writingSessionState.selection.totalChars > 0 || writingSessionState.selection.latinWords > 0
)
const selectionSummary = computed(() =>
    t('status.writingStats.selection', {
        chars: writingSessionState.selection.totalChars,
        words: writingSessionState.selection.latinWords
    })
)
const goalSummary = computed(() => {
    const progress = writingSessionState.goal
    if (progress.achieved) {
        return t('status.writingStats.goalAchieved', { written: progress.written })
    }
    return t('status.writingStats.goal', {
        written: progress.written,
        goal: progress.dailyGoal,
        percent: progress.percent
    })
})

// CMP-30：状态栏消息由主进程发送「已本地化」的译文（mainMsg 命名空间），渲染层原样展示；
// 未收到消息或消息自动清除后显示「就绪」，静态标签与动态模板均走 t()，切换语言即时刷新。
const consolePayload = ref<StatusBarUpdatePayload | null>(null)
const consoleType = computed(() => consolePayload.value?.type ?? 'info')
const consoleMessage = computed(() => consolePayload.value?.message ?? t('status.ready'))

/** 当前是否错误消息（错误用 danger 点 + 可点击详情，COMPONENTS.md §7.1） */
const isErrorConsole = computed(() => consolePayload.value?.type === 'error')

/** 错误详情弹层的固定 id（aria-controls 关联，单实例状态栏下唯一） */
const ERROR_DETAIL_ID = 'status-bar-error-detail'
/** 错误详情弹层是否展开 */
const errorDetailOpen = ref(false)
/** 详情弹层节点（打开时移入焦点） */
const errorDetailRef = ref<HTMLElement | null>(null)
/** 错误触发按钮（关闭详情后归还焦点） */
const errorTriggerRef = ref<HTMLButtonElement | null>(null)

/** 打开错误详情：焦点移入弹层（读屏先播报完整消息） */
function openErrorDetail(): void {
    if (!isErrorConsole.value) {
        return
    }
    errorDetailOpen.value = true
    void nextTick(() => {
        errorDetailRef.value?.focus()
    })
}

/**
 * 关闭错误详情。
 *
 * @param restoreFocus 是否把焦点归还错误触发按钮（点击外部关闭时不抢焦点）
 */
function closeErrorDetail(restoreFocus = true): void {
    if (!errorDetailOpen.value) {
        return
    }
    errorDetailOpen.value = false
    if (restoreFocus) {
        void nextTick(() => {
            errorTriggerRef.value?.focus()
        })
    }
}

/** 点击错误触发按钮：展开/收起详情 */
function toggleErrorDetail(): void {
    if (errorDetailOpen.value) {
        closeErrorDetail()
        return
    }
    openErrorDetail()
}

/** 点击弹层/按钮以外区域关闭详情（不抢焦点） */
function handleDocumentClick(event: MouseEvent): void {
    if (!errorDetailOpen.value) {
        return
    }
    const target = event.target as HTMLElement | null
    if (target?.closest('.status-error-popover') || target?.closest('.console-trigger')) {
        return
    }
    closeErrorDetail(false)
}

// FUN-29：状态栏编码显示当前文件实际编码（主进程经状态栏通道下发），默认 utf-8
const encodingDisplay = ref('utf-8')

// M2（4.4）：状态栏消息类型统一由 shared/types/status-bar 的 StatusBarMessageType
// 驱动（主进程发送端与本组件消费端同一类型），图标映射穷举全部合法类型。
// error 分支改用 danger 状态点（不再用文字图标），此处保留映射以穷举类型。
const MESSAGE_TYPE_ICONS: Record<StatusBarMessageType, string> = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✗',
    loading: '⋯'
}

const consoleIcon = computed(() => MESSAGE_TYPE_ICONS[consoleType.value] ?? 'ℹ')

// PF-13：自动复位定时器句柄。状态栏消息每次更新都会创建 5s 定时器，
// 此前未保存句柄 → 新消息到达时旧 timer 仍会触发、组件卸载后 timer 仍持有组件闭包。
// 策略：全局只保留最新一个 timer（loading 消息不建 timer），新消息/卸载时清理旧 timer。
let consoleResetTimer: ReturnType<typeof setTimeout> | null = null

function clearConsoleResetTimer(): void {
    if (consoleResetTimer !== null) {
        clearTimeout(consoleResetTimer)
        consoleResetTimer = null
    }
}

// 处理console消息更新（FUN-29：负载可携带当前文件编码，同步状态栏编码显示）
const handleConsoleUpdate = (data: StatusBarUpdatePayload) => {
    consolePayload.value = data
    if (data.encoding) {
        encodingDisplay.value = data.encoding
    }

    // PF-13：任何新消息先取消上一条消息的自动复位，避免旧 timer 提前清掉新消息
    clearConsoleResetTimer()

    // 如果是loading状态,不自动清除
    if (data.type !== 'loading') {
        // 5秒后自动清除消息
        consoleResetTimer = setTimeout(() => {
            consoleResetTimer = null
            if (consolePayload.value?.message === data.message) {
                consolePayload.value = null
            }
        }, 5000)
    }
}

// 未打开文件时显示产品名（t() 响应语言切换）
const filePath = ref('')
const isUnsaved = ref(false)

// 计算显示的文件路径(保留后面的内容)
const displayFilePath = computed(() => {
    const path = filePath.value || t('status.defaultFilePath')
    // 如果路径长度超过40个字符,保留后面的内容
    if (path.length > 40) {
        return '...' + path.slice(-37)
    }
    return path
})

function onUpdateEditorFilePath(value: string) {
    filePath.value = value
}

// 文件大小与光标位置改为响应式状态，模板经 t() 输出，语言切换后同步刷新
const fileSize = ref<string | null>(null)
const cursorPosition = ref<{ line: number; column: number } | null>(null)

const fileSizeDisplay = computed(() =>
    fileSize.value === null ? t('status.bytesZero') : t('status.bytes', { value: fileSize.value })
)

const cursorDisplay = computed(() =>
    cursorPosition.value === null
        ? t('status.cursorLabel')
        : t('status.cursorPosition', {
              line: cursorPosition.value.line,
              column: cursorPosition.value.column
          })
)

function onUpdateEditorContentLength(value: string) {
    fileSize.value = value
}

function onUpdateEditorCursorPosition(position: Position) {
    cursorPosition.value = { line: position.lineNumber, column: position.column }
}

// 定义事件处理函数
const handleFilePathUpdate = (value: string) => {
    onUpdateEditorFilePath(value)
}

const handleContentLengthUpdate = (value: string) => {
    onUpdateEditorContentLength(value)
    isUnsaved.value = true
}

const handleCursorPositionUpdate = (position: Position) => {
    onUpdateEditorCursorPosition(position)
}

const handleUserSelectFile = (_event: unknown, value: string) => {
    onUpdateEditorFilePath(value)
}

const handleFileSaved = () => {
    isUnsaved.value = false
}

const handleConsoleUpdateEvent = (_event: unknown, data: StatusBarUpdatePayload) => {
    handleConsoleUpdate(data)
}

/** 消息变化时收起旧详情（自动复位/类型切换后弹层不能残留旧内容） */
watch(consolePayload, (payload) => {
    if (!payload || payload.type !== 'error') {
        errorDetailOpen.value = false
    }
})

onMounted(() => {
    window.electron.ipcRenderer.on(IPC.FILE.USER_SELECT_FILE, handleUserSelectFile)
    window.electron.ipcRenderer.on(IPC.EVENTS.FILE_SAVED_SUCCESS, handleFileSaved)
    window.electron.ipcRenderer.on(IPC.EVENTS.STATUS_BAR_UPDATE, handleConsoleUpdateEvent)
    document.addEventListener('click', handleDocumentClick)

    onEventBus(EVENT_BUS.STATUS_BAR_FILE_PATH, handleFilePathUpdate)
    onEventBus(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, handleContentLengthUpdate)
    onEventBus(EVENT_BUS.STATUS_BAR_CURSOR_POSITION, handleCursorPositionUpdate)
})

onBeforeUnmount(() => {
    // PF-13：清理未触发的自动复位定时器，避免卸载后 timer 仍持有组件闭包
    clearConsoleResetTimer()
    document.removeEventListener('click', handleDocumentClick)

    window.electron.ipcRenderer.removeListener(IPC.FILE.USER_SELECT_FILE, handleUserSelectFile)
    window.electron.ipcRenderer.removeListener(IPC.EVENTS.FILE_SAVED_SUCCESS, handleFileSaved)
    window.electron.ipcRenderer.removeListener(
        IPC.EVENTS.STATUS_BAR_UPDATE,
        handleConsoleUpdateEvent
    )

    // EventBus 监听已由 useEventBus 自动清理
})
</script>

<style scoped>
/* ============================================================================
 * 状态栏（外壳区）视觉规格 —— 视觉升级 P1-B2 / T11（COMPONENTS.md §7.1）
 *
 * - 高度 24 / 字号 12 由宿主容器提供（状态栏高度不随密度档变化，属固定外壳）；
 * - 文字 --ui-text-secondary、分隔 1px --ui-border hairline、错误 --ui-danger 点；
 * - 四风格 × 三密度差异全部来自根元素下的 --ui-* 变量，组件不写风格/密度分支。
 * ========================================================================== */
#status-bar-container {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    font-size: 12px;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    /* 错误详情弹层定位基准（向上弹出，不裁剪在工作区内） */
    position: relative;
}

#status-bar-file-path {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    padding: 2px 8px;
    border-radius: var(--ui-radius-sm, 2px);
    transition: color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

/* 未保存：警告色文字（去掉旧版整块彩色底，状态栏保持安静的低对比信息条） */
#status-bar-file-path.unsaved {
    color: var(--ui-warning, var(--accent-color));
    font-weight: 600;
}

/* 已保存：回归次要文字色（旧版绿色底过于抢眼） */
#status-bar-file-path.saved {
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.file-path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

/* 分隔：1px hairline（视觉升级方案 §3.5） */
.status-bar-divider {
    width: var(--ui-hairline-width, 1px);
    height: 12px;
    flex-shrink: 0;
    margin: 0 8px;
    background-color: var(--ui-border, var(--border-color));
}

#status-bar-console {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    flex: 1;
    min-width: 0;
    padding: 2px 8px;
    border-radius: var(--ui-radius-sm, 2px);
    /* 不设 overflow:hidden：错误详情弹层是本容器的绝对定位子节点，裁剪会隐藏弹层；
       单行截断由 .console-message 的 text-overflow 负责 */
    transition: color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

/* 消息类型统一走固定状态语义色（不跟随主题色相，避免「错误」随主题变绿） */
#status-bar-console.info {
    color: var(--ui-info, var(--accent-color));
}

#status-bar-console.success {
    color: var(--ui-success);
}

#status-bar-console.warning {
    color: var(--ui-warning);
}

#status-bar-console.error {
    color: var(--ui-danger);
}

#status-bar-console.loading {
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.console-message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

#status-bar-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    justify-content: flex-end;
    padding-right: 8px;
}

#status-bar-file-type,
#status-bar-encoding,
#status-bar-cursor-position,
#status-bar-file-size {
    padding: 2px 0;
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.console-icon {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: bold;
}

/* 错误状态点（danger dot，可点击打开详情） */
.console-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background-color: var(--ui-danger);
}

/* 错误触发按钮：把整行消息变成可点击区域（点击打开详情） */
.console-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 2px 4px;
    border: none;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.console-trigger:hover,
.console-trigger--open {
    background-color: var(--ui-accent-soft);
}

.console-trigger:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

/* 错误详情弹层：向上展开的轻量浮层（非模态，Esc/点击外部关闭） */
.status-error-popover {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: var(--ui-z-dropdown, 40);
    width: min(560px, calc(100vw - 48px));
    max-height: 240px;
    overflow: auto;
    padding: 8px 12px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-lg, 6px);
    background: var(--ui-bg-elevated, var(--card-bg));
    box-shadow: var(--ui-shadow-2);
}

.status-error-popover:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.status-error-popover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
}

.status-error-popover__title {
    color: var(--ui-danger);
    font-size: 13px;
    font-weight: 600;
}

.status-error-popover__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
}

.status-error-popover__close:hover {
    background-color: var(--ui-accent-soft);
    color: var(--ui-text, var(--text-color));
}

.status-error-popover__close:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.status-error-popover__message {
    margin: 0;
    color: var(--ui-text, var(--text-color));
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.unsaved-indicator {
    font-size: 10px;
    color: var(--ui-warning, var(--accent-color));
    animation: pulse 1.5s ease-in-out infinite;
}

.saved-indicator {
    font-size: 10px;
    color: var(--ui-success);
}

@keyframes pulse {
    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }
}

/* 系统「减少动效」：未保存提示不再呼吸闪烁 */
@media (prefers-reduced-motion: reduce) {
    .unsaved-indicator {
        animation: none;
    }
}

.writing-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    font-size: 11px;
    white-space: nowrap;
}

.writing-stats-goal {
    color: var(--ui-accent, var(--accent-color));
}

.writing-mode-toggle {
    height: 20px;
    padding: 0 7px;
    margin-right: 6px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    transition:
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        border-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.writing-mode-toggle:hover {
    color: var(--ui-text, var(--text-color));
    border-color: var(--ui-accent, var(--accent-color));
}

.writing-mode-toggle.active {
    color: var(--ui-accent, var(--accent-color));
    border-color: var(--ui-accent, var(--accent-color));
    background: var(--ui-accent-soft);
}

.writing-mode-toggle:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}
</style>
