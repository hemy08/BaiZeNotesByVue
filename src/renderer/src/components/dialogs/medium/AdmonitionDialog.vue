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
              <span class="title-text">插入 Admonition</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="content">
              <div class="type-grid">
                <div
                  v-for="type in admonitionTypes"
                  :key="type.id"
                  class="type-card"
                  :class="{ selected: selectedType === type.id }"
                  @click="selectedType = type.id"
                >
                  <div class="type-icon" :style="{ backgroundColor: type.color }">{{ type.icon }}</div>
                  <div class="type-name">{{ type.name }}</div>
                </div>
              </div>

              <div class="input-group">
                <label class="input-label">标题</label>
                <input v-model="title" type="text" class="text-input" placeholder="可选的标题" />
              </div>

              <div class="input-group">
                <label class="input-label">内容</label>
                <textarea v-model="content" class="textarea-input" placeholder="Admonition 内容"></textarea>
              </div>

              <div class="preview-section">
                <label class="preview-label">预览</label>
                <div class="preview-card" :style="{ backgroundColor: previewColor + '15', borderLeftColor: previewColor }">
                  <div class="preview-title" v-if="title" :style="{ color: previewColor }">{{ title || selectedTypeName }}</div>
                  <div class="preview-content">{{ content || 'Admonition 内容' }}</div>
                </div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-confirm" @click="handleInsert">插入</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'insert', markdown: string): void
}>()

const selectedType = ref('note')
const title = ref('')
const content = ref('')

const selectedTypeName = computed(() =>
  admonitionTypes.find(t => t.id === selectedType.value)?.name || ''
)

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const admonitionTypes = [
  { id: 'note', name: 'Note', icon: '📝', color: '#667eea' },
  { id: 'tip', name: 'Tip', icon: '💡', color: '#48bb78' },
  { id: 'warning', name: 'Warning', icon: '⚠️', color: '#ed8936' },
  { id: 'danger', name: 'Danger', icon: '⛔', color: '#f56565' },
  { id: 'info', name: 'Info', icon: 'ℹ️', color: '#4299e1' },
  { id: 'abstract', name: 'Abstract', icon: '📋', color: '#667eea' },
  { id: 'todo', name: 'Todo', icon: '✅', color: '#48bb78' },
  { id: 'success', name: 'Success', icon: '🎉', color: '#48bb78' },
  { id: 'question', name: 'Question', icon: '❓', color: '#4299e1' },
  { id: 'bug', name: 'Bug', icon: '🐛', color: '#f56565' },
  { id: 'example', name: 'Example', icon: '📖', color: '#667eea' },
  { id: 'quote', name: 'Quote', icon: '💬', color: '#718096' }
]

const previewColor = computed(() => {
  return admonitionTypes.find(t => t.id === selectedType.value)?.color || '#667eea'
})

function handleCancel() {
  emit('close')
}

function handleInsert() {
  let markdown = '!!! ' + selectedType.value
  if (title.value) {
    markdown += ' "' + title.value + '"'
  }
  markdown += '\n'

  if (content.value) {
    markdown += '    ' + content.value + '\n'
  } else {
    markdown += '这里是内容...\n'
  }

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
  width: 650px;
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
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.type-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--card-bg);
}

.type-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
}

.type-card.selected {
  border-color: var(--accent-color);
  background: rgba(102, 126, 234, 0.08);
}

.type-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
}

.type-name {
  font-size: 12px;
  color: var(--text-color);
  font-weight: 500;
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

.textarea-input {
  width: 100%;
  min-height: 100px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--card-bg);
  outline: none;
  resize: vertical;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.text-input:focus,
.textarea-input:focus {
  border-color: var(--accent-color);
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-label {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
}

.preview-card {
  border-left: 4px solid;
  border-radius: 4px;
  padding: 12px 16px;
}

.preview-title {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 14px;
}

.preview-content {
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
  background: var(--border-color);
  color: var(--text-color);
}

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
