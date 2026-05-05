<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <Transition name="dialog-scale">
          <div class="dialog-container">
            <div class="title-bar">
              <span class="title-text">在线网页</span>
              <button class="close-btn" @click="handleClose">×</button>
            </div>

            <div class="main-content">
              <div class="url-bar">
                <input
                  v-model="currentUrl"
                  type="text"
                  class="url-input"
                  placeholder="输入网址..."
                  @keyup.enter="navigateToUrl"
                />
                <button class="nav-btn" @click="navigateToUrl">前往</button>
                <button class="nav-btn" @click="goBack" :disabled="!canGoBack">←</button>
                <button class="nav-btn" @click="goForward" :disabled="!canGoForward">→</button>
                <button class="nav-btn" @click="refreshPage">↻</button>
              </div>

              <div class="webview-container">
                <div class="loading-bar" v-if="isLoading">
                  <div class="loading-progress"></div>
                </div>
                <div class="placeholder" v-if="!currentUrl">
                  <p>请输入网址开始浏览</p>
                </div>
                <div class="placeholder" v-else-if="loadError">
                  <p>页面加载失败</p>
                  <button class="retry-btn" @click="refreshPage">重试</button>
                </div>
              </div>
            </div>

            <div class="footer">
              <div class="status">
                <span v-if="isLoading">加载中...</span>
                <span v-else-if="currentUrl">{{ currentUrl }}</span>
              </div>
              <button class="btn btn-cancel" @click="handleClose">关闭</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const currentUrl = ref('')
const isLoading = ref(false)
const loadError = ref(false)
const canGoBack = ref(false)
const canGoForward = ref(false)

function navigateToUrl() {
  if (!currentUrl.value) return

  let url = currentUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }

  currentUrl.value = url
  isLoading.value = true
  loadError.value = false

  setTimeout(() => {
    isLoading.value = false
  }, 2000)
}

function goBack() {
  console.log('Go back')
}

function goForward() {
  console.log('Go forward')
}

function refreshPage() {
  if (currentUrl.value) {
    navigateToUrl()
  }
}

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
  width: 1200px;
  height: 800px;
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
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  -webkit-app-region: no-drag;
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

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.url-bar {
  padding: 12px 20px;
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
}

.url-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
  outline: none;
}

.url-input:focus {
  border-color: var(--accent-color);
}

.nav-btn {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.webview-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--card-bg);
}

.loading-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--border-color);
}

.loading-progress {
  height: 100%;
  width: 30%;
  background: var(--accent-color);
  animation: loading 1.5s infinite ease-in-out;
}

@keyframes loading {
  0% { width: 0%; margin-left: 0; }
  50% { width: 60%; margin-left: 20%; }
  100% { width: 0%; margin-left: 100%; }
}

.placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--secondary-text-color);
}

.retry-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  border-color: var(--accent-color);
}

.footer {
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  flex-shrink: 0;
}

.status {
  font-size: 12px;
  color: var(--secondary-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80%;
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

.btn:hover {
  opacity: 0.9;
}
</style>
