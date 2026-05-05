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
                <label class="input-label">目录</label>
                <div class="path-input-wrapper">
                  <input
                    v-model="dirPath"
                    type="text"
                    class="path-input"
                    readonly
                  />
                  <button class="btn-select-path" @click="handleSelectPath">选择</button>
                </div>
              </div>

              <div class="input-group">
                <label class="input-label">名称</label>
                <input
                  v-model="name"
                  type="text"
                  class="name-input"
                  placeholder="请输入名称"
                  @keyup.enter="handleCreateFile"
                  autofocus
                />
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-create-file" @click="handleCreateFile" :disabled="!name.trim()">新建文件</button>
              <button class="btn btn-create-folder" @click="handleCreateFolder" :disabled="!name.trim()">新建文件夹</button>
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
  dirPath?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '新建文件/文件夹',
  dirPath: ''
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', data: { type: 'file' | 'folder'; name: string; dirPath: string }): void
}>()

const name = ref('')
const dirPath = ref('')

const { dialogRef, dialogStyle, onDialogMouseDown, resetPosition } = useDialogDrag({ initialPosition: 'center' })

watch(() => props.visible, (newVal) => {
  if (newVal) {
    name.value = ''
    dirPath.value = props.dirPath || ''
    resetPosition()
  }
})

function handleCancel() {
  emit('close')
}

async function handleSelectPath() {
  try {
    const selectedPath = await window.electron.ipcRenderer.invoke('baize-notes:select-directory')
    if (selectedPath) {
      dirPath.value = selectedPath
    }
  } catch (error) {
    console.error('选择目录失败:', error)
  }
}

function handleCreateFile() {
  if (name.value.trim()) {
    emit('create', {
      type: 'file',
      name: name.value.trim(),
      dirPath: dirPath.value
    })
  }
}

function handleCreateFolder() {
  if (name.value.trim()) {
    emit('create', {
      type: 'folder',
      name: name.value.trim(),
      dirPath: dirPath.value
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
  width: 500px;
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
}

.input-label {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
}

.path-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--secondary-text-color);
  background: var(--card-bg);
  outline: none;
  box-sizing: border-box;
  cursor: not-allowed;
}

.path-input-wrapper {
  display: flex;
  gap: 8px;
}

.path-input-wrapper .path-input {
  flex: 1;
}

.btn-select-path {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  background: var(--button-bg);
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-select-path:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
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

.btn-create-file {
  background: var(--accent-color);
  color: #fff;
}

.btn-create-folder {
  background: var(--secondary-accent-color, #4caf50);
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
