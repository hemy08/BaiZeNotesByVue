<template>
  <div class="theme-setting-modal-overlay" @click.self="close" v-show="visible">
    <div class="theme-setting-modal">
      <!-- 标题栏 -->
      <div class="title-bar" :style="titleBarStyle">
        <span class="title-bar-title">主题设置</span>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="main-container">
        <!-- 侧边栏 -->
        <div class="sidebar">
          <div
            v-for="item in sidebarItems"
            :key="item.id"
            :class="['sidebar-item', { active: activePanel === item.id }]"
            @click="activePanel = item.id"
          >
            <span class="sidebar-icon">{{ item.icon }}</span>
            <span class="sidebar-name">{{ item.name }}</span>
          </div>
        </div>
        
        <!-- 内容区域 -->
        <div class="content-area">
          <!-- 应用主题 -->
          <div class="content-panel" v-show="activePanel === 'app-theme'">
            <div class="separate-editor-theme-container">
              <input
                id="separate-editor-theme-checkbox"
                type="checkbox"
                v-model="separateEditorTheme"
                @change="updateSeparateEditorTheme"
              />
              <label for="separate-editor-theme-checkbox" class="separate-editor-theme-label">
                是否单独配置编辑区主题
              </label>
            </div>
            
            <div class="theme-grid">
              <div
                v-for="theme in allAppThemes"
                :key="theme.type"
                :class="['theme-card', { selected: currentTheme === theme.type }]"
                @click="selectAppTheme(theme.type)"
              >
                <div class="theme-preview" :style="{ background: theme.styles.backgroundColor }">
                  <div class="theme-preview-bar" :style="{ background: theme.styles.titleBarGradient }"></div>
                  <div class="theme-preview-body">
                    <div class="theme-preview-line" :style="{ background: theme.styles.textColor, opacity: '0.7' }"></div>
                    <div class="theme-preview-line" :style="{ background: theme.styles.textColor, opacity: '0.5' }"></div>
                  </div>
                </div>
                <div class="theme-name">{{ theme.styles.name }}</div>
              </div>
            </div>
          </div>
          
          <!-- 编辑器主题 -->
          <div class="content-panel" v-show="activePanel === 'editor-theme'">
            <div class="theme-grid">
              <div
                v-for="theme in allMonacoThemes"
                :key="theme.type"
                :class="['monaco-theme-card', {
                  selected: currentMonacoTheme === theme.type,
                  disabled: !separateEditorTheme
                }]"
                @click="selectMonacoTheme(theme.type)"
              >
                <div class="theme-preview monaco-theme-preview" :style="{ background: theme.colors.bg }">
                  <div class="monaco-preview-line" :style="{ background: theme.colors.accent, width: '40%' }"></div>
                  <div class="monaco-preview-line" :style="{ background: theme.colors.text, width: '70%' }"></div>
                  <div class="monaco-preview-line" :style="{ background: theme.colors.text, width: '50%', opacity: '0.6' }"></div>
                </div>
                <div class="theme-name">{{ theme.name }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 类型定义（从 theme-config.ts 复制）
type ThemeType = string
type MonacoThemeType = string

interface ThemeStyles {
  name: string
  backgroundColor: string
  cardBackground: string
  titleBarGradient: string
  textColor: string
  secondaryTextColor: string
  borderColor: string
  accentColor: string
  buttonBackground: string
  buttonTextColor: string
  hoverBackground: string
}

interface AppTheme {
  type: ThemeType
  styles: ThemeStyles
}

interface MonacoTheme {
  type: MonacoThemeType
  name: string
  colors: {
    bg: string
    text: string
    accent: string
  }
}

// Props & Emits
const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

// 状态
const activePanel = ref('app-theme')
const currentTheme = ref<ThemeType>('baize')
const separateEditorTheme = ref(false)
const currentMonacoTheme = ref<MonacoThemeType>('vs')
const allAppThemes = ref<AppTheme[]>([])
const allMonacoThemes = ref<MonacoTheme[]>([])

// 计算样式
const titleBarStyle = computed(() => {
  const theme = allAppThemes.value.find(t => t.type === currentTheme.value)
  if (!theme) return {}
  return {
    background: theme.styles.titleBarGradient
  }
})

const sidebarItems = [
  { id: 'app-theme', name: '应用主题', icon: '🎨' },
  { id: 'editor-theme', name: '编辑器主题', icon: '📝' }
]

// 从 window.electron API 调用（注意：需要在 preload 中暴露）
async function fetchThemeConfig() {
  // TODO: 实际使用时，preload 需要暴露以下 API：
  // - getThemeConfig()
  // - getAllThemes()
  // - getAllMonacoThemes()
  // - setTheme()
  // - setSeparateEditorTheme()
  // - setMonacoTheme()
  console.log('fetchThemeConfig - 在 preload 中暴露 API 后实现')
}

function selectAppTheme(themeType: ThemeType) {
  currentTheme.value = themeType
  updateThemeConfig()
}

function selectMonacoTheme(themeType: MonacoThemeType) {
  if (!separateEditorTheme.value) return
  currentMonacoTheme.value = themeType
  updateThemeConfig()
}

function updateSeparateEditorTheme() {
  updateThemeConfig()
}

async function updateThemeConfig() {
  // TODO: 调用 preload 暴露的 API 更新
  console.log('updateThemeConfig', {
    themeType: currentTheme.value,
    separateEditorTheme: separateEditorTheme.value,
    monacoTheme: currentMonacoTheme.value
  })
  emit('change')
}

function close() {
  emit('close')
}

onMounted(() => {
  fetchThemeConfig()
})
</script>

<style scoped>
.theme-setting-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.4);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-setting-modal {
  width: 1200px;
  height: 600px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  -webkit-app-region: drag;
}

.title-bar-title {
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: white;
  font-size: 24px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255,255,255,0.15);
}

.main-container {
  flex: 1;
  display: flex;
  background: var(--bg-color);
}

.sidebar {
  width: 160px;
  background: var(--card-bg);
  border-right: 1px solid var(--border-color);
  padding: 16px 0;
}

.sidebar-item {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  cursor: pointer;
  color: var(--text-color);
  transition: background 0.2s;
}

.sidebar-item:hover {
  background: var(--hover-bg);
}

.sidebar-item.active {
  background: var(--hover-bg);
  color: var(--accent-color);
  border-left: 3px solid var(--accent-color);
  padding-left: 13px;
}

.sidebar-icon {
  font-size: 18px;
}

.sidebar-name {
  font-size: 14px;
}

.content-area {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.separate-editor-theme-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.theme-card, .monaco-theme-card {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
}

.theme-card:hover, .monaco-theme-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
}

.theme-card.selected, .monaco-theme-card.selected {
  border-color: var(--accent-color);
}

.monaco-theme-card.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.theme-preview {
  height: 80px;
  display: flex;
  flex-direction: column;
}

.theme-preview-bar {
  height: 20px;
}

.theme-preview-body {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-preview-line {
  height: 4px;
  border-radius: 2px;
}

.theme-name {
  padding: 10px 12px;
  text-align: center;
  font-size: 13px;
  background: var(--card-bg);
  color: var(--text-color);
}

.monaco-preview-line {
  height: 3px;
  border-radius: 2px;
  margin: 4px 0;
}
</style>
