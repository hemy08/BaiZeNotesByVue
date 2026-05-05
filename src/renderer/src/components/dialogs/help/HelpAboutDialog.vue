<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <Transition name="dialog-scale">
          <div class="dialog-container">
            <div class="title-bar">
              <button class="close-btn" @click="handleClose">×</button>
            </div>

            <div class="container">
              <div class="left-panel">
                <div class="icon-container">
                  <div class="baize-icon">白泽</div>
                </div>
                <h1 class="app-name">白泽笔记</h1>
                <div class="app-version">v{{ appVersion }}</div>
                <p class="app-desc">一款简洁优雅的</p>
                <p class="app-desc">Markdown</p>
                <p class="app-desc">笔记应用</p>
                <p class="app-desc">请尽情书写吧！！！</p>
              </div>

              <div class="right-panel">
                <div class="info-card">
                  <h3>版本信息</h3>
                  <div class="info-row">
                    <span class="label">应用版本</span>
                    <span class="value">v{{ appVersion }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">发布日期</span>
                    <span class="value">{{ buildDate }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Electron</span>
                    <span class="value">v{{ electronVersion }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Chromium</span>
                    <span class="value">v{{ chromeVersion }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Node.js</span>
                    <span class="value">v{{ nodeVersion }}</span>
                  </div>
                </div>

                <div class="info-card">
                  <h3>开发框架</h3>
                  <div class="info-row">
                    <span class="label">Vue</span>
                    <span class="value">v{{ vueVersion }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Vite</span>
                    <span class="value">v{{ viteVersion }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">TypeScript</span>
                    <span class="value">v{{ typescriptVersion }}</span>
                  </div>
                </div>

                <div class="info-card">
                  <h3>系统环境</h3>
                  <div class="info-row">
                    <span class="label">操作系统</span>
                    <span class="value">{{ systemInfo }}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">平台</span>
                    <span class="value">{{ platform }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <a href="#" @click.prevent="openLink('https://github.com/hemy08/BaiZeNotesByVue')">GitHub</a>
              <span class="divider">|</span>
              <a href="#" @click.prevent="openLink('https://hemy08.github.io/hemynotes/')">使用文档</a>
              <span class="divider">|</span>
              <span>2024 Hemy08</span>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const appVersion = ref('')
const buildDate = ref('')
const vueVersion = ref('')
const viteVersion = ref('')
const typescriptVersion = ref('')
const electronVersion = ref('')
const chromeVersion = ref('')
const nodeVersion = ref('')
const systemInfo = ref('')
const platform = ref('')

onMounted(async () => {
  try {
    const versionInfo = await window.api.app.getVersion()
    appVersion.value = versionInfo.appVersion
    electronVersion.value = versionInfo.electronVersion
    chromeVersion.value = versionInfo.chromeVersion
    nodeVersion.value = versionInfo.nodeVersion
    vueVersion.value = versionInfo.vueVersion
    viteVersion.value = versionInfo.viteVersion
    typescriptVersion.value = versionInfo.typescriptVersion
  } catch (error) {
    console.error('Failed to get version info:', error)
    appVersion.value = '1.1.5-bate'
    vueVersion.value = '3.4.27'
    viteVersion.value = '5.4.21'
    typescriptVersion.value = '6.0.2'
  }

  buildDate.value = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  if (typeof navigator !== 'undefined') {
    platform.value = navigator.platform || ''
  }

  if (typeof require !== 'undefined') {
    try {
      const os = require('os')
      systemInfo.value = os.type() + ' ' + os.arch() + ' ' + os.release()
    } catch (e) {
      systemInfo.value = 'Unknown'
    }
  }
})

function openLink(url: string) {
  if (typeof window !== 'undefined' && window.open) {
    window.open(url, '_blank')
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
  width: 750px;
  height: 600px;
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
  justify-content: flex-end;
  align-items: center;
  padding: 0 10px;
  -webkit-app-region: drag;
  flex-shrink: 0;
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

.container {
  flex: 1;
  display: flex;
  padding: 20px;
  gap: 20px;
  overflow: hidden;
}

.left-panel {
  width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 20px;
}

.icon-container {
  width: 150px;
  height: 150px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  margin-bottom: 20px;
}

.baize-icon {
  font-size: 48px;
  font-weight: bold;
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.app-name {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: 5px;
}

.app-version {
  font-size: 14px;
  color: var(--secondary-text-color);
  margin-bottom: 20px;
}

.app-desc {
  font-size: 14px;
  font-weight: bold;
  color: var(--text-color);
  margin: 3px 0;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.info-card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color);
}

.info-card h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-color);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 3px 0;
}

.info-row .label {
  color: var(--secondary-text-color);
}

.info-row .value {
  color: var(--text-color);
  font-weight: 500;
}

.footer {
  padding: 10px 20px;
  text-align: center;
  font-size: 11px;
  color: var(--secondary-text-color);
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
}

.footer a {
  color: var(--accent-color);
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}

.divider {
  margin: 0 8px;
  color: var(--border-color);
}
</style>
