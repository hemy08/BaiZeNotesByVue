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
              <span class="title-text">{{ title }}</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="content">
              <div class="info-group">
                <label class="info-label">当前路径</label>
                <div class="info-value">{{ currentPath }}</div>
              </div>

              <div class="input-group">
                <label class="input-label">新名称</label>
                <input
                  v-model="newName"
                  type="text"
                  class="name-input"
                  placeholder="请输入新名称"
                  @keyup.enter="handleConfirm"
                  autofocus
                />
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-confirm" @click="handleConfirm" :disabled="!newName.trim()">确定</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
  title?: string
  currentPath?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '重命名',
  currentPath: ''
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', newName: string): void
}>()

const newName = ref('')

const { dialogRef, dialogStyle, onDialogMouseDown, resetPosition } = useDialogDrag({ initialPosition: 'center' })

watch(() => props.visible, (newVal) => {
  if (newVal) {
    const parts = props.currentPath.split(/[/\\]/)
    const lastPart = parts[parts.length - 1] || ''
    newName.value = lastPart.includes('.')
      ? lastPart.slice(0, lastPart.lastIndexOf('.'))
      : lastPart
    resetPosition()
  }
})

function handleCancel() {
  emit('close')
}

function handleConfirm() {
  if (newName.value.trim()) {
    emit('confirm', newName.value.trim())
  }
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
  width: 480px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 32px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  cursor: move;
  user-select: none;
}

.title-text {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}

.close-btn {
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

.content {
  padding: 20px;
}

.info-group {
  margin-bottom: 20px;
}

.info-label {
  font-size: 13px;
  color: var(--secondary-text-color, #666);
  margin-bottom: 6px;
  display: block;
}

.info-value {
  padding: 10px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  word-break: break-all;
  font-family: 'Consolas', 'Monaco', monospace;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
}

.name-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--card-bg);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.name-input:focus {
  border-color: var(--accent-color);
}

.footer {
  padding: 15px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
}

.btn {
  padding: 8px 20px;
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

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
