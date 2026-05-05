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
              <span class="title-text">{{ title }}</span>
              <button class="close-btn" @click.stop="handleClose">×</button>
            </div>

            <div class="container">
              <svg class="success-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--accent-color)" stroke-width="3"/>
                <path d="M 30 50 L 45 65 L 70 35" fill="none" stroke="var(--accent-color)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div class="success-message">{{ message }}</div>
            </div>

            <div class="footer">
              <button class="btn-confirm" @click="handleClose">确定</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
  title: string
  message: string
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

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
  width: 450px;
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

.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
}

.success-icon {
  width: 60px;
  height: 60px;
  margin-bottom: 15px;
  animation: scaleIn 0.3s ease-out;
}

@keyframes scaleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.success-message {
  font-size: 14px;
  color: var(--text-color);
  text-align: center;
  line-height: 1.6;
  max-width: 380px;
  word-wrap: break-word;
}

.footer {
  padding: 15px 20px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
}

.btn-confirm {
  padding: 8px 30px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
