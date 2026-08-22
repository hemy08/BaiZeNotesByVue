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
              <span class="title-text">插入表格</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="content">
              <div class="left-right-container">
                <div class="left-section">
                  <div class="input-group">
                    <label class="label-style">行数</label>
                    <input
                      v-model.number="sheetStyle.row"
                      type="number"
                      min="1"
                      class="input-style"
                    />
                  </div>
                  <div class="input-group">
                    <label class="label-style">列数</label>
                    <input
                      v-model.number="sheetStyle.col"
                      type="number"
                      min="1"
                      class="input-style"
                    />
                  </div>
                </div>

                <div class="right-section">
                  <div class="checkbox-list">
                    <label
                      v-for="option in alignOptions"
                      :key="option.value"
                      :class="{ active: sheetStyle.align === option.value }"
                    >
                      <input
                        type="radio"
                        :value="option.value"
                        v-model="sheetStyle.align"
                      />
                      {{ option.label }}
                    </label>
                  </div>
                </div>
              </div>

              <div class="btn-style">
                <button class="btn" @click="handleCancel">取消</button>
                <button class="btn btn-primary" @click="handleInsert">插入</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'insert', markdown: string): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const sheetStyle = reactive({
  row: 3,
  col: 3,
  align: 'default' as 'default' | 'left' | 'center' | 'right'
})

const alignOptions = [
  { value: 'default' as const, label: '默认对齐' },
  { value: 'left' as const, label: '左对齐' },
  { value: 'center' as const, label: '居中对齐' },
  { value: 'right' as const, label: '右对齐' }
]

const alignMaps = {
  default: ' --- |',
  'left': ' :-- |',
  'center': ' :--: |',
  'right': ' --: |'
}

function generateMarkdown(): string {
  let rowContent = '|'
  let titleContent = '|'

  for (let i = 0; i < sheetStyle.col; i++) {
    rowContent += ' 列' + (i + 1) + ' |'
    titleContent += alignMaps[sheetStyle.align]
  }

  rowContent += '\n'
  titleContent += '\n'

  let inputSheet = rowContent + titleContent
  for (let i = 0; i < sheetStyle.row; i++) {
    inputSheet += rowContent
  }

  return inputSheet
}

function handleCancel() {
  emit('close')
}

function handleInsert() {
  const markdown = generateMarkdown()
  emit('insert', markdown)
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
  width: 530px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 40px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  cursor: move;
  user-select: none;
}

.title-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
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
  font-size: 16px;
  color: #fff;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 80, 80, 0.95);
}

.content {
  flex: 1;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
}

.left-right-container {
  display: flex;
  flex-direction: row;
  gap: 40px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.left-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.label-style {
  min-width: 60px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
}

.input-style {
  width: 120px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text-color);
  font-size: 13px;
  transition: all 0.2s;
}

.input-style:focus {
  border-color: var(--accent-color);
  outline: none;
  box-shadow: 0 0 0 3px rgba(100, 150, 255, 0.1);
}

.right-section {
  flex: 1;
}

.checkbox-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 20px;
}

.checkbox-list label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s;
  color: var(--text-color);
  font-size: 13px;
}

.checkbox-list label:hover {
  color: var(--accent-color);
}

.checkbox-list label.active {
  background: rgba(102, 126, 234, 0.1);
  color: var(--accent-color);
}

.checkbox-list input[type="radio"] {
  accent-color: var(--accent-color);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.btn-style {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 60px;
}

.btn {
  padding: 10px 24px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.btn:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn:active {
  transform: translateY(0);
}

.btn-primary {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}

.btn-primary:hover {
  background: var(--accent-color);
  opacity: 0.9;
}
</style>
