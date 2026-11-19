<template>
    <div id="status-bar-container">
        <div id="status-bar-file-path" :class="{ unsaved: isUnsaved, saved: !isUnsaved }">
            <span v-if="isUnsaved" class="unsaved-indicator">●</span>
            <span v-else class="saved-indicator">●</span>
            <div class="file-path-label">{{ t('status.filePathLabel') }}</div>
            <span class="file-path-text">{{ displayFilePath }}</span>
        </div>
        <div class="status-bar-divider"></div>
        <div id="status-bar-console" :class="consoleType">
            <span class="console-icon">{{ consoleIcon }}</span>
            <span class="console-message">{{ consoleMessage }}</span>
        </div>
        <div class="status-bar-divider"></div>
        <div id="status-bar-info">
            <div id="status-bar-file-type">Markdown</div>
            <div id="status-bar-encoding">{{ encodingDisplay }}</div>
            <div id="status-bar-cursor-position">{{ cursorDisplay }}</div>
            <div id="status-bar-file-size">{{ fileSizeDisplay }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import EventBus from '../common/event-bus/event-bus'
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
// Position 仅作为光标位置事件参数的类型使用（运行时字段为 lineNumber/column，
// 不依赖 monaco 枚举值）；改为 import type 后编译期擦除，不把 monaco 拉入模块图。
import type { Position } from 'monaco-editor'
import { IPC } from '../../../shared/ipc-channels'
import type { StatusBarUpdatePayload } from '../../../shared/types'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { t } from '../common/i18n'

// CMP-30：状态栏消息由主进程发送「已本地化」的译文（mainMsg 命名空间），渲染层原样展示；
// 未收到消息或消息自动清除后显示「就绪」，静态标签与动态模板均走 t()，切换语言即时刷新。
const consolePayload = ref<StatusBarUpdatePayload | null>(null)
const consoleType = computed(() => consolePayload.value?.type ?? 'info')
const consoleMessage = computed(() => consolePayload.value?.message ?? t('status.ready'))

// FUN-29：状态栏编码显示当前文件实际编码（主进程经状态栏通道下发），默认 utf-8
const encodingDisplay = ref('utf-8')

const consoleIcon = computed(() => {
    switch (consoleType.value) {
        case 'success':
            return '✓'
        case 'warning':
            return '⚠'
        case 'error':
            return '✗'
        case 'loading':
            return '⋯'
        default:
            return 'ℹ'
    }
})

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

onMounted(() => {
    window.electron.ipcRenderer.on(IPC.FILE.USER_SELECT_FILE, handleUserSelectFile)
    window.electron.ipcRenderer.on(IPC.EVENTS.FILE_SAVED_SUCCESS, handleFileSaved)
    window.electron.ipcRenderer.on(IPC.EVENTS.STATUS_BAR_UPDATE, handleConsoleUpdateEvent)

    EventBus.$on(EVENT_BUS.STATUS_BAR_FILE_PATH, handleFilePathUpdate)
    EventBus.$on(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, handleContentLengthUpdate)
    EventBus.$on(EVENT_BUS.STATUS_BAR_CURSOR_POSITION, handleCursorPositionUpdate)
})

onBeforeUnmount(() => {
    // PF-13：清理未触发的自动复位定时器，避免卸载后 timer 仍持有组件闭包
    clearConsoleResetTimer()

    window.electron.ipcRenderer.removeListener(IPC.FILE.USER_SELECT_FILE, handleUserSelectFile)
    window.electron.ipcRenderer.removeListener(IPC.EVENTS.FILE_SAVED_SUCCESS, handleFileSaved)
    window.electron.ipcRenderer.removeListener(
        IPC.EVENTS.STATUS_BAR_UPDATE,
        handleConsoleUpdateEvent
    )

    EventBus.$off(EVENT_BUS.STATUS_BAR_FILE_PATH, handleFilePathUpdate)
    EventBus.$off(EVENT_BUS.STATUS_BAR_CONTEXT_LENGTH, handleContentLengthUpdate)
    EventBus.$off(EVENT_BUS.STATUS_BAR_CURSOR_POSITION, handleCursorPositionUpdate)
})
</script>

<style scoped>
#status-bar-container {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
}

#status-bar-file-path {
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.3s ease;
    flex: 1;
    min-width: 0;
    padding: 2px 8px;
    border-radius: 3px;
}

#status-bar-file-path.unsaved {
    color: #ff6b6b;
    font-weight: 600;
    background-color: rgba(255, 107, 107, 0.1);
}

#status-bar-file-path.saved {
    color: #52c41a;
    font-weight: 600;
    background-color: rgba(82, 194, 26, 0.1);
}

.file-path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.status-bar-divider {
    width: 1px;
    height: 60%;
    background-color: rgba(0, 0, 0, 0.15);
    margin: 0 4px;
}

#status-bar-console {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 3px;
    transition: all 0.3s ease;
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

#status-bar-console.info {
    color: #1890ff;
    background-color: rgba(24, 144, 255, 0.1);
}

#status-bar-console.success {
    color: #52c41a;
    background-color: rgba(82, 194, 26, 0.1);
}

#status-bar-console.warning {
    color: #faad14;
    background-color: rgba(250, 173, 20, 0.1);
}

#status-bar-console.error {
    color: #ff4d4f;
    background-color: rgba(255, 77, 79, 0.1);
}

#status-bar-console.loading {
    color: #722ed1;
    background-color: rgba(114, 46, 209, 0.1);
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
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
    padding-right: 8px;
}

#status-bar-file-type,
#status-bar-encoding,
#status-bar-cursor-position,
#status-bar-file-size {
    padding: 2px 6px;
    border-radius: 3px;
    background-color: rgba(0, 0, 0, 0.05);
}

.console-icon {
    font-weight: bold;
    font-size: 12px;
    flex-shrink: 0;
}

.unsaved-indicator {
    color: #ff6b6b;
}

.saved-indicator {
    color: #52c41a;
}

.unsaved-indicator {
    font-size: 10px;
    animation: pulse 1.5s ease-in-out infinite;
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
</style>
