<template>
    <div id="status-bar-file-path" :class="{ 'unsaved': isUnsaved, 'saved': !isUnsaved }">
        <span v-if="isUnsaved" class="unsaved-indicator">●</span>
        <span v-else class="saved-indicator">●</span>
        <div class="file-path-label">文件路径:</div>
        {{ filePath }}
    </div>
    <div id="status-bar-file-type">Markdown</div>
    <div id="status-bar-file-type">utf-8</div>
    <div id="status-bar-cursor-position">行</div>
    <div id="status-bar-file-size">0字节</div>
</template>

<script setup lang="ts">
import EventBus from '../event-bus'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Position } from 'monaco-editor'

const filePath = ref('白泽笔记')
const isUnsaved = ref(false)

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

onMounted(() => {
    // 监听文件保存成功
    window.electron.ipcRenderer.on('monaco-editor-user-select-file', (_, value) => {
        onUpdateEditorFilePath(value)
    })

    EventBus.$on('monaco-editor-statusbar-file-path', (value: string) => {
        onUpdateEditorFilePath(value)
    })

    EventBus.$on('monaco-editor-statusbar-content-length', (value: string) => {
        onUpdateEditorContentLength(value)
        isUnsaved.value = true
    })

    EventBus.$on('monaco-editor-statusbar-cursor-position', (position: Position) => {
        onUpdateEditorCursorPosition(position)
    })

    // 监听文件保存成功
    window.electron.ipcRenderer.on('file-saved-success', () => {
        isUnsaved.value = false
    })

    onBeforeUnmount(() => {
        EventBus.$off('monaco-editor-statusbar-file-path', (value: string) => {
            onUpdateEditorFilePath(value)
        })

        EventBus.$off('monaco-editor-content-length', (value: string) => {
            onUpdateEditorContentLength(value)
        })
        EventBus.$off('monaco-editor-cursor-position', (position: Position) => {
            onUpdateEditorCursorPosition(position)
        })
    })
})
</script>

<style scoped>
#status-bar-file-path {
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.3s ease;
}

#status-bar-file-path.unsaved {
    color: #ff6b6b;
    font-weight: 600;
    background-color: rgba(255, 107, 107, 0.1);
    padding: 2px 8px;
    border-radius: 3px;
}

#status-bar-file-path.saved {
    color: #52c41a;
    font-weight: 600;
    background-color: rgba(82, 194, 26, 0.1);
    padding: 2px 8px;
    border-radius: 3px;
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
