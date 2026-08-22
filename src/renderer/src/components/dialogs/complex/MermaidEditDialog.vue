<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <Transition name="dialog-scale">
          <div
            class="dialog-container"
            :style="dialogStyle"
            ref="dialogRef"
            @mousedown="onDialogMouseDown"
          >
            <div class="title-bar">
              <span class="title-text">Mermaid 图表编辑</span>
              <button class="close-btn" @click.stop="handleClose">×</button>
            </div>

            <div class="main-container">
              <div class="editor-section">
                <div class="section-header">
                  <h3>图表定义</h3>
                  <div class="toolbar">
                    <button class="tool-btn" @click="handleFormat">格式化</button>
                    <button class="tool-btn" @click="handleClear">清空</button>
                  </div>
                </div>
                <textarea
                  v-model="mermaidCode"
                  class="code-editor"
                  placeholder="输入 Mermaid 图表代码..."
                  @input="updatePreview"
                ></textarea>
              </div>

              <div class="preview-section">
                <div class="section-header">
                  <h3>预览</h3>
                  <div class="toolbar">
                    <select v-model="chartType" class="chart-select">
                      <option value="graph">流程图</option>
                      <option value="flowchart"> flowchart</option>
                      <option value="sequence">时序图</option>
                      <option value="class">类图</option>
                      <option value="state">状态图</option>
                      <option value="er">ER图</option>
                      <option value="pie">饼图</option>
                      <option value="gantt">甘特图</option>
                    </select>
                  </div>
                </div>
                <div class="preview-area" v-html="previewHtml"></div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleClose">取消</button>
              <button class="btn btn-primary" @click="handleInsert">插入图表</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'insert', data: string): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const mermaidCode = ref(`mermaid
    graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Something Else]
    C --> E[End]
    D --> E`)

const chartType = ref('graph')
const previewHtml = ref('<p class="placeholder">预览区域</p>')

function updatePreview() {
  previewHtml.value = `<div class="mermaid">${mermaidCode.value}</div>`
}

function handleFormat() {
  const lines = mermaidCode.value.split('\n')
  const formatted = '```mermaid\n' + lines.map(line => '    ' + line).join('\n')
  mermaidCode.value = formatted + '\n```\n'
  updatePreview()
}

function handleClear() {
  mermaidCode.value = ''
  previewHtml.value = '<p class="placeholder">预览区域</p>'
}

function handleClose() {
  emit('close')
}

function handleInsert() {
  emit('insert', mermaidCode.value)
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
  width: 1400px;
  height: 900px;
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
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
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

.main-container {
  flex: 1;
  display: flex;
  gap: 1px;
  background: var(--border-color);
  overflow: hidden;
}

.editor-section,
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  overflow: hidden;
}

.section-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
}

.section-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.toolbar {
  display: flex;
  gap: 8px;
}

.tool-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.chart-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
}

.code-editor {
  flex: 1;
  width: 100%;
  padding: 16px;
  border: none;
  resize: none;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
  background: var(--bg-color);
  outline: none;
}

.preview-area {
  flex: 1;
  padding: 16px;
  overflow: auto;
  background: var(--card-bg);
}

.placeholder {
  color: var(--secondary-text-color);
  font-style: italic;
  text-align: center;
  margin-top: 100px;
}

.footer {
  padding: 15px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
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

.btn-primary {
  background: var(--accent-color);
  color: #fff;
}

.btn:hover {
  opacity: 0.9;
}
</style>
