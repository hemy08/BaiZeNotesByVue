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
              <span class="title-text">插入图片</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="content">
              <div class="tabs">
                <button
                  v-for="tab in tabs"
                  :key="tab.id"
                  class="tab-btn"
                  :class="{ active: activeTab === tab.id }"
                  @click="activeTab = tab.id"
                >
                  {{ tab.label }}
                </button>
              </div>

              <div class="tab-content">
                <div v-if="activeTab === 'local'" class="local-tab">
                  <div class="input-group">
                    <label class="input-label">文件路径</label>
                    <div class="path-input-wrapper">
                      <input v-model="localFilePath" type="text" class="text-input" placeholder="选择文件" readonly />
                      <button class="browse-btn" @click="browseFile">浏览</button>
                    </div>
                  </div>
                </div>

                <div v-if="activeTab === 'url'" class="url-tab">
                  <div class="input-group">
                    <label class="input-label">图片 URL</label>
                    <input v-model="imageUrl" type="text" class="text-input" placeholder="输入图片 URL" />
                  </div>
                </div>

                <div class="input-group">
                  <label class="input-label">Alt 文本</label>
                  <input v-model="altText" type="text" class="text-input" placeholder="图片描述" />
                </div>

                <div class="input-group">
                  <label class="input-label">标题</label>
                  <input v-model="imageTitle" type="text" class="text-input" placeholder="可选的图片标题" />
                </div>

                <div class="preview-section" v-if="previewUrl">
                  <label class="preview-label">预览</label>
                  <img :src="previewUrl" alt="Preview" class="preview-image" @error="previewUrl = ''" />
                </div>
              </div>

              <div class="footer">
                <button class="btn btn-cancel" @click="handleCancel">取消</button>
                <button class="btn btn-confirm" @click="handleInsert" :disabled="!canInsert">插入</button>
              </div>
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

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'insert', markdown: string): void
  (e: 'browseFile'): void
}>()

const activeTab = ref<'local' | 'url'>('local')
const localFilePath = ref('')
const imageUrl = ref('')
const altText = ref('')
const imageTitle = ref('')

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const tabs = [
  { id: 'local' as const, label: '本地文件' },
  { id: 'url' as const, label: '网络图片' }
]

const previewUrl = computed(() => {
  if (activeTab.value === 'local') return localFilePath.value
  return imageUrl.value
})

const canInsert = computed(() => {
  if (activeTab.value === 'local') return localFilePath.value.length > 0
  return imageUrl.value.length > 0
})

function browseFile() {
  emit('browseFile')
}

function handleCancel() {
  emit('close')
}

function handleInsert() {
  let src = ''
  if (activeTab.value === 'local') {
    src = localFilePath.value
  } else {
    src = imageUrl.value
  }

  let markdown = '![' + (altText.value || 'image') + '](' + src
  if (imageTitle.value) {
    markdown += ' "' + imageTitle.value + '"'
  }
  markdown += ')'

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
  width: 600px;
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
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--hover-bg);
}

.tab-btn.active {
  background: var(--accent-color);
  color: #fff;
}

.tab-content {
  flex: 1;
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
  flex-shrink: 0;
}

.browse-btn:hover {
  opacity: 0.9;
}

.preview-section {
  margin-top: 20px;
}

.preview-label {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
  margin-bottom: 10px;
  display: block;
}

.preview-image {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
