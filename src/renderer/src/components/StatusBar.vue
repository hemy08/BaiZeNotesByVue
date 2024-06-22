<template>
  <div id="status-bar-file-path">Hemy Markdown Editor</div>
  <div id="status-bar-file-type">Markdown</div>
  <div id="status-bar-file-type">utf-8</div>
  <div id="status-bar-cursor-position">行</div>
  <div id="status-bar-file-size">0字节</div>
</template>

<script setup lang="ts">
import EventBus from '../event-bus'
import { onBeforeUnmount, onMounted } from 'vue'
import { Position } from 'monaco-editor'

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
  EventBus.$on('monaco-editor-content-length', (value: string) => {
    onUpdateEditorContentLength(value)
  })

  EventBus.$on('monaco-editor-cursor-position', (position: Position) => {
    onUpdateEditorCursorPosition(position)
  })

  onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-content-length', (value: string) => {
      onUpdateEditorContentLength(value)
    })
    EventBus.$off('monaco-editor-cursor-position', (position: Position) => {
      onUpdateEditorCursorPosition(position)
    })
  })
})
</script>

<style scoped></style>
