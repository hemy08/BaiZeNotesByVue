<template>
    <div id="status-bar-file-path" :class="{ 'unsaved': isUnsaved }">
        <span v-if="isUnsaved" class="unsaved-indicator">●</span>
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

function onUpdateFileSavedStatus(saved: boolean) {
    isUnsaved.value = !saved
}

onMounted(() => {
    EventBus.$on('monaco-editor-statusbar-file-path', (value: string) => {
        onUpdateEditorFilePath(value)
    })

    EventBus.$on('monaco-editor-statusbar-content-length', (value: string) => {
        onUpdateEditorContentLength(value)
    })

    EventBus.$on('monaco-editor-statusbar-cursor-position', (position: Position) => {
        onUpdateEditorCursorPosition(position)
    })

    EventBus.$on('monaco-editor-file-saved-status', (saved: boolean) => {
        onUpdateFileSavedStatus(saved)
    })

    // 监听文件内容变化，标记为未保存
    window.electron.ipcRenderer.on('update-select-file-content', () => {
        isUnsaved.value = true
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
        EventBus.$off('monaco-editor-file-saved-status', (saved: boolean) => {
            onUpdateFileSavedStatus(saved)
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
