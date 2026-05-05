<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
        <Transition name="dialog-scale">
          <div
            class="dialog-container"
            :style="dialogStyle"
            ref="dialogRef"
            @mousedown="onDialogMouseDown"
          >
            <div class="title-bar">
              <span class="title-text">数学公式</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="main-content">
              <div class="preview-section">
                <label class="preview-label">预览区域</label>
                <div class="preview-container" v-html="renderedFormula"></div>
              </div>

              <div class="editor-section">
                <label class="editor-label">公式编辑</label>
                <textarea
                  v-model="latexData"
                  id="textInput"
                  placeholder="输入 LaTeX 公式..."
                  class="text-input"
                ></textarea>
              </div>

              <div class="btn-list">
                <button class="btn" @click="handleInsertLine">插入行内公式</button>
                <button class="btn" @click="handleInsertBlock">插入公式块</button>
                <button class="btn" @click="handleInsertMath">插入Math</button>
                <button class="btn" @click="handleInsertKatex">插入Katex</button>
                <button class="btn" @click="handleInsertLatex">插入Latex</button>
                <button class="btn" @click="handleCancel">取消编辑</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.css'
import { useDialogDrag } from '../../../composables/useDialogDrag'

const latexInit = 'x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'insert', markdown: string): void
}>()

const latexData = ref(latexInit)

const { dialogRef, dialogStyle, onDialogMouseDown, resetPosition } = useDialogDrag({ initialPosition: 'center' })

const renderedFormula = computed(() => {
  try {
    return renderLatex(latexData.value)
  } catch (error) {
    return '<span style="color:red">公式语法错误</span>'
  }
})

watch(() => props.visible, (newVal) => {
  if (newVal) {
    resetPosition()
  }
})

function renderLatex(text: string): string {
  if (!text) return ''
  try {
    return katex.renderToString(text, {
      throwOnError: false,
      displayMode: true
    })
  } catch (error) {
    return '<span style="color:red">公式语法错误</span>'
  }
}

function handleCancel() {
  emit('close')
}

function handleInsertLine() {
  emit('insert', '$' + latexData.value + '$' + '\n')
}

function handleInsertBlock() {
  emit('insert', '$$\r\n' + latexData.value + '\r\n$$\r\n')
}

function handleInsertMath() {
  emit('insert', '~~~math\r\n' + latexData.value + '\r\n~~~')
}

function handleInsertKatex() {
  emit('insert', '~~~katex\r\n' + latexData.value + '\r\n~~~')
}

function handleInsertLatex() {
  emit('insert', '~~~latex\r\n' + latexData.value + '\r\n~~~')
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
  width: 1280px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 36px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  cursor: move;
  user-select: none;
}

.title-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 100, 100, 0.9);
}

.main-content {
  flex: 1;
  padding: 15px 20px;
  display: flex;
  flex-direction: column;
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-label {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
  margin-left: 20px;
}

.preview-container {
  width: 100%;
  height: 250px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  color: var(--text-color);
  font-size: 2em;
  overflow-wrap: break-word;
  word-break: break-all;
}

.editor-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.editor-label {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
  margin-left: 20px;
  margin-top: 10px;
}

.text-input {
  width: 100%;
  height: 100px;
  overflow-y: auto;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  color: var(--text-color);
  font-size: 14px;
  font-family: "Fira Code", "Consolas", monospace;
  resize: none;
  outline: none;
}

.text-input:focus {
  border-color: var(--accent-color);
}

.btn-list {
  width: 100%;
  margin-top: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

.btn {
  padding: 8px 20px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
}
</style>
