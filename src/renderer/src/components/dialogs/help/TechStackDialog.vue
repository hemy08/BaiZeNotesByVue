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
              <span class="title-text">技术栈</span>
              <button class="close-btn" @click.stop="handleClose">×</button>
            </div>

            <div class="container">
              <div class="header">
                <h1>🛠️ 技术栈</h1>
                <p>白泽笔记使用以下技术构建</p>
              </div>

              <div class="section">
                <div class="section-title">核心框架</div>
                <div class="tech-grid">
                  <div v-for="tech in coreFrameworks" :key="tech.name" class="tech-card" @click="openLink(tech.url)">
                    <div class="tech-name">{{ tech.name }}</div>
                    <div class="tech-version">版本: {{ tech.version }}</div>
                    <div class="tech-desc">{{ tech.desc }}</div>
                    <div class="tech-url">
                      <span>{{ tech.url }}</span>
                      <span class="external-icon">↗</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">编辑器与渲染</div>
                <div class="tech-grid">
                  <div v-for="tech in editors" :key="tech.name" class="tech-card" @click="openLink(tech.url)">
                    <div class="tech-name">{{ tech.name }}</div>
                    <div class="tech-version">版本: {{ tech.version }}</div>
                    <div class="tech-desc">{{ tech.desc }}</div>
                    <div class="tech-url">
                      <span>{{ tech.url }}</span>
                      <span class="external-icon">↗</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">数据与存储</div>
                <div class="tech-grid">
                  <div v-for="tech in dataStorage" :key="tech.name" class="tech-card" @click="openLink(tech.url)">
                    <div class="tech-name">{{ tech.name }}</div>
                    <div class="tech-version">版本: {{ tech.version }}</div>
                    <div class="tech-desc">{{ tech.desc }}</div>
                    <div class="tech-url">
                      <span>{{ tech.url }}</span>
                      <span class="external-icon">↗</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">工具库</div>
                <div class="tech-grid">
                  <div v-for="tech in utilities" :key="tech.name" class="tech-card" @click="openLink(tech.url)">
                    <div class="tech-name">{{ tech.name }}</div>
                    <div class="tech-version">版本: {{ tech.version }}</div>
                    <div class="tech-desc">{{ tech.desc }}</div>
                    <div class="tech-url">
                      <span>{{ tech.url }}</span>
                      <span class="external-icon">↗</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              点击卡片访问官网了解更多信息
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
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const coreFrameworks = [
  { name: 'Electron', version: '^31.0.1', desc: '跨平台桌面应用框架', url: 'https://www.electronjs.org/' },
  { name: 'Vue 3', version: '^3.4.27', desc: '渐进式 JavaScript 框架', url: 'https://vuejs.org/' },
  { name: 'TypeScript', version: '^5.4.5', desc: 'JavaScript 的超集', url: 'https://www.typescriptlang.org/' },
  { name: 'Vite', version: '^5.2.11', desc: '下一代前端构建工具', url: 'https://vitejs.dev/' },
  { name: 'electron-vite', version: '^2.2.0', desc: 'Electron 专用 Vite 构建工具', url: 'https://electron-vite.org/' }
]

const editors = [
  { name: 'Monaco Editor', version: '^0.49.0', desc: 'VS Code 同款代码编辑器', url: 'https://microsoft.github.io/monaco-editor/' },
  { name: 'markdown-it', version: '^14.1.0', desc: 'Markdown 解析器', url: 'https://markdown-it.github.io/' },
  { name: 'Mermaid', version: '^10.9.1', desc: '流程图/时序图渲染', url: 'https://mermaid-js.github.io/mermaid/' },
  { name: 'KaTeX', version: '^0.16.10', desc: '数学公式渲染', url: 'https://katex.org/' },
  { name: 'highlight.js', version: '^11.9.0', desc: '代码语法高亮', url: 'https://highlightjs.org/' }
]

const dataStorage = [
  { name: 'electron-store', version: '^8.2.0', desc: 'Electron 数据持久化', url: 'https://github.com/sindresorhus/electron-store' },
  { name: 'electron-updater', version: '^6.1.8', desc: '应用自动更新', url: 'https://www.electron.build/auto-update' }
]

const utilities = [
  { name: 'crypto-js', version: '^4.2.0', desc: 'JavaScript 加密库', url: 'https://cryptojs.gitbook.io/docs/' },
  { name: 'mammoth', version: '^1.8.0', desc: 'Word 文档解析', url: 'https://github.com/mwilliamson/mammoth.js' },
  { name: 'turndown', version: '^7.2.0', desc: 'HTML 转 Markdown', url: 'https://github.com/mixmark-io/turndown' }
]

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
  width: 900px;
  height: 700px;
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
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
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
  padding: 20px;
  overflow-y: auto;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  font-size: 28px;
  color: var(--text-color);
  margin-bottom: 10px;
}

.header p {
  font-size: 14px;
  color: var(--secondary-text-color);
}

.section {
  margin-bottom: 30px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 15px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--accent-color);
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
}

.tech-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s;
}

.tech-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: var(--accent-color);
}

.tech-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-color);
  margin-bottom: 8px;
}

.tech-version {
  font-size: 12px;
  color: var(--secondary-text-color);
  margin-bottom: 5px;
}

.tech-desc {
  font-size: 13px;
  color: var(--text-color);
  margin-bottom: 10px;
}

.tech-url {
  font-size: 11px;
  color: var(--accent-color);
  display: flex;
  align-items: center;
  gap: 5px;
}

.external-icon {
  font-size: 10px;
}

.footer {
  padding: 10px 20px;
  text-align: center;
  font-size: 11px;
  color: var(--secondary-text-color);
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  flex-shrink: 0;
}
</style>
