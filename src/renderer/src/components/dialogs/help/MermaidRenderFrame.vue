<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <Transition name="dialog-scale">
          <div class="dialog-container">
            <div class="title-bar">
              <span class="title-text">Mermaid 图表渲染</span>
              <button class="close-btn" @click="handleClose">×</button>
            </div>

            <div class="main-content">
              <div class="toolbar">
                <button class="tool-btn" @click="handleZoomIn">放大</button>
                <button class="tool-btn" @click="handleZoomOut">缩小</button>
                <button class="tool-btn" @click="handleResetZoom">重置</button>
                <button class="tool-btn" @click="handleDownload">下载图片</button>
              </div>

              <div class="preview-container" :style="{ transform: `scale(${zoom})` }">
                <div class="mermaid-preview" v-html="renderedMermaid"></div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleClose">关闭</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  visible: boolean
  mermaidCode?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  mermaidCode: ''
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const zoom = ref(1)
const renderedMermaid = ref('<div class="mermaid">' + (props.mermaidCode || 'graph TD\n    A[Start] --> B[End]') + '</div>')

function handleZoomIn() {
  if (zoom.value < 2) {
    zoom.value += 0.1
  }
}

function handleZoomOut() {
  if (zoom.value > 0.5) {
    zoom.value -= 0.1
  }
}

function handleResetZoom() {
  zoom.value = 1
}

function handleDownload() {
}

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
  transition: transform 0.2s ease;
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
  transform: scale(0.9);
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  width: 1200px;
  height: 800px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 48px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #fff;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 80, 80, 0.95);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  padding: 12px 20px;
  display: flex;
  gap: 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
}

.tool-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.preview-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 40px;
  transition: transform 0.2s;
  transform-origin: center center;
}

.mermaid-preview {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 40px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.footer {
  padding: 15px 20px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  flex-shrink: 0;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--button-bg);
  color: var(--text-color);
}

.btn:hover {
  opacity: 0.9;
}
</style>
