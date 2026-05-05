<template>
    <div id="status-bar-container">
        <div id="status-bar-file-path" :class="{ 'unsaved': isUnsaved, 'saved': !isUnsaved }">
            <span v-if="isUnsaved" class="unsaved-indicator">●</span>
            <span v-else class="saved-indicator">●</span>
            <div class="file-path-label">文件路径:</div>
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
            <div id="status-bar-encoding">utf-8</div>
            <div id="status-bar-cursor-position">行</div>
            <div id="status-bar-file-size">0字节</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import EventBus from '../common/event_bus/event-bus'
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { Position } from 'monaco-editor'

// Console 相关
const consoleMessage = ref('就绪')
const consoleType = ref('info') // 'info' | 'success' | 'warning' | 'error' | 'loading'

const consoleIcon = computed(() => {
    switch (consoleType.value) {
        case 'success': return '✓'
        case 'warning': return '⚠'
        case 'error': return '✗'
        case 'loading': return '⋯'
        default: return 'ℹ'
    }
})

// 处理console消息更新
const handleConsoleUpdate = (data: { message: string; type: string }) => {
    consoleMessage.value = data.message
    consoleType.value = data.type

    // 如果是loading状态,不自动清除
    if (data.type !== 'loading') {
        // 5秒后自动清除消息
        setTimeout(() => {
            if (consoleMessage.value === data.message) {
                consoleMessage.value = '就绪'
                consoleType.value = 'info'
            }
        }, 5000)
    }
}

const filePath = ref('白泽笔记')
const isUnsaved = ref(false)

// 计算显示的文件路径(保留后面的内容)
const displayFilePath = computed(() => {
    const path = filePath.value
    // 如果路径长度超过40个字符,保留后面的内容
    if (path.length > 40) {
        return '...' + path.slice(-37)
    }
    return path
})

function onUpdateEditorFilePath(value: string) {
    console.log('文件路径:', value)
    filePath.value = value
}

function onUpdateEditorContentLength(value: string) {
    const element = document.getElementById('status-bar-file-size')
    if (!element) return
    element.textContent = `${value} 字节`
}

function onUpdateEditorCursorPosition(position: Position) {
    const element = document.getElementById('status-bar-cursor-position')
    if (!element) return
    element.textContent = `行 ${position.lineNumber} 列 ${position.column}`
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

onMounted(() => {
    // 监听文件保存成功
    window.electron.ipcRenderer.on('monaco-editor-user-select-file', (_, value) => {
        onUpdateEditorFilePath(value)
    })

    EventBus.$on('monaco-editor-statusbar-file-path', handleFilePathUpdate)
    EventBus.$on('baize:notes:status-bar:context-length', handleContentLengthUpdate)
    EventBus.$on('monaco-editor-statusbar-cursor-position', handleCursorPositionUpdate)

    // 监听文件保存成功
    window.electron.ipcRenderer.on('file-saved-success', () => {
        isUnsaved.value = false
    })

    // 监听console消息更新
    window.electron.ipcRenderer.on('status-bar-console-update', (_, data) => {
        handleConsoleUpdate(data)
    })
})

onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-statusbar-file-path', handleFilePathUpdate)
    EventBus.$off('baize:notes:status-bar:context-length', handleContentLengthUpdate)
    EventBus.$off('monaco-editor-statusbar-cursor-position', handleCursorPositionUpdate)

    window.electron.ipcRenderer.removeAllListeners('file-saved-success')
    window.electron.ipcRenderer.removeAllListeners('monaco-editor-user-select-file')
    window.electron.ipcRenderer.removeAllListeners('status-bar-console-update')
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
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}
</style>
