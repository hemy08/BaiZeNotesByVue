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
              <div class="input-group">
                <label class="input-label">链接文本</label>
                <input
                  v-model="linkText"
                  type="text"
                  class="text-input"
                  placeholder="请输入链接显示文本"
                />
              </div>

              <div class="input-group">
                <label class="input-label">链接地址</label>
                <input
                  v-model="linkUrl"
                  type="text"
                  class="text-input"
                  placeholder="请输入URL地址，如：https://example.com"
                  @keyup.enter="handleConfirm"
                />
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-confirm" @click="handleConfirm" :disabled="!linkUrl.trim()">插入</button>
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
}

const props = withDefaults(defineProps<Props>(), {
  title: '插入链接'
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: { text: string; url: string }): void
  (e: 'insert', markdown: string): void
}>()

const linkText = ref('')
const linkUrl = ref('')

const { dialogRef, dialogStyle, onDialogMouseDown, resetPosition } = useDialogDrag({ initialPosition: 'center' })

watch(() => props.visible, (newVal) => {
  if (newVal) {
    linkText.value = ''
    linkUrl.value = ''
    resetPosition()
  }
})

function handleCancel() {
  emit('close')
}

function handleConfirm() {
  if (linkUrl.value.trim()) {
    const text = linkText.value.trim() || linkUrl.value.trim()
    const markdown = `[${text}](${linkUrl.value.trim()})`
    emit('insert', markdown)
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
  width: 520px;
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

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.input-group:last-of-type {
  margin-bottom: 0;
}

.input-label {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
}

.text-input {
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

.text-input:focus {
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
