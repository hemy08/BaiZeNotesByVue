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
                <label class="input-label">名称</label>
                <input
                  v-model="name"
                  type="text"
                  class="text-input"
                  placeholder="请输入文件/文件夹名称"
                />
              </div>

              <div class="input-group">
                <label class="input-label">路径</label>
                <div class="path-input-wrapper">
                  <input
                    v-model="path"
                    type="text"
                    class="text-input path-input"
                    placeholder="请选择路径"
                    readonly
                  />
                  <button class="browse-btn" @click="handleBrowse">浏览</button>
                </div>
              </div>

              <div class="options">
                <div
                  v-for="option in options"
                  :key="option.value"
                  :class="['option-item', { active: selectedType === option.value }]"
                  @click="selectedType = option.value"
                >
                  <span class="option-icon">{{ option.icon }}</span>
                  <span class="option-label">{{ option.label }}</span>
                </div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-confirm" @click="handleConfirm" :disabled="!name.trim()">创建</button>
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
  defaultPath?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '新建文件/文件夹',
  defaultPath: ''
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: { type: 'file' | 'folder'; name: string; path: string }): void
  (e: 'browse'): void
}>()

const name = ref('')
const path = ref('')
const selectedType = ref<'file' | 'folder'>('file')

const options = [
  { value: 'file' as const, label: '文件', icon: '📄' },
  { value: 'folder' as const, label: '文件夹', icon: '📁' }
]

const { dialogRef, dialogStyle, onDialogMouseDown, resetPosition } = useDialogDrag({ initialPosition: 'center' })

watch(() => props.visible, (newVal) => {
  if (newVal) {
    name.value = ''
    path.value = props.defaultPath
    resetPosition()
  }
})

function handleCancel() {
  emit('close')
}

function handleBrowse() {
  emit('browse')
}

function handleConfirm() {
  if (name.value.trim()) {
    emit('confirm', {
      type: selectedType.value,
      name: name.value.trim(),
      path: path.value
    })
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

.path-input-wrapper {
  display: flex;
  gap: 10px;
}

.path-input {
  flex: 1;
}

.browse-btn {
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: var(--accent-color);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.browse-btn:hover {
  opacity: 0.9;
}

.options {
  display: flex;
  gap: 10px;
}

.option-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 15px 10px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--card-bg);
}

.option-item:hover {
  border-color: var(--accent-color);
}

.option-item.active {
  border-color: var(--accent-color);
  background: rgba(102, 126, 234, 0.08);
}

.option-icon {
  font-size: 32px;
}

.option-label {
  font-size: 13px;
  color: var(--text-color);
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
