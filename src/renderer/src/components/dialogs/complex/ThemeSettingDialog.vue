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
              <span class="title-text">主题设置</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="main-container">
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

              <div class="content-area">
                <div v-if="activePanel === 'app-theme'" class="panel">
                  <div class="theme-list">
                    <div v-for="category in themeCategories" :key="category.name" class="theme-category">
                      <h3 class="category-title">{{ category.name }}</h3>
                      <div class="theme-grid">
                        <div
                          v-for="theme in category.themes"
                          :key="theme.type"
                          :class="['theme-card', { selected: currentTheme === theme.type }]"
                          @click="selectTheme(theme.type)"
                        >
                          <div class="theme-preview" :style="getThemePreviewStyle(theme)"></div>
                          <div class="theme-name">{{ theme.type }}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="activePanel === 'editor-theme'" class="panel">
                  <div class="monaco-theme-list">
                    <div
                      v-for="theme in allMonacoThemes"
                      :key="theme.type"
                      :class="['theme-card', { selected: currentMonacoTheme === theme.type }]"
                      @click="selectMonacoTheme(theme.type)"
                    >
                      <div class="theme-preview" :style="{ background: theme.colors.bg }">
                        <span :style="{ color: theme.colors.text }">Aa</span>
                      </div>
                      <div class="theme-name">{{ theme.name }}</div>
                    </div>
                  </div>
                </div>

                <div v-if="activePanel === 'font-settings'" class="panel">
                  <div class="setting-group">
                    <label class="setting-label">编辑器字体</label>
                    <select v-model="editorFont" class="setting-select">
                      <option v-for="font in editorFonts" :key="font" :value="font">{{ font }}</option>
                    </select>
                  </div>

                  <div class="setting-group">
                    <label class="setting-label">预览字体</label>
                    <select v-model="previewFont" class="setting-select">
                      <option v-for="font in previewFonts" :key="font" :value="font">{{ font }}</option>
                    </select>
                  </div>

                  <div class="setting-group">
                    <label class="setting-label">字体大小</label>
                    <input type="number" v-model="fontSize" class="setting-input" min="10" max="32" />
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-apply" @click="handleApply">应用</button>
              <button class="btn btn-confirm" @click="handleConfirm">确定</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'change', themeType: string, monacoTheme: string, separateEditorTheme: boolean): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const activePanel = ref('app-theme')
const currentTheme = ref('baize')
const separateEditorTheme = ref(false)
const currentMonacoTheme = ref('vs')
const editorFont = ref('Consolas')
const previewFont = ref('Microsoft YaHei')
const fontSize = ref(14)

const initialSettings = ref({
  currentTheme: 'baize',
  separateEditorTheme: false,
  currentMonacoTheme: 'vs'
})

const themeCategories = ref<Array<{
  name: string
  themes: Array<{ type: string; styles: any }>
}>>([])

const allMonacoThemes = ref<Array<{ type: string; name: string; colors: any }>>([])

const editorFonts = [
  'Consolas', 'Monaco', 'Courier New', 'Fira Code', 'Source Code Pro',
  'JetBrains Mono', 'Menlo', 'Ubuntu Mono'
]

const previewFonts = [
  'Microsoft YaHei', 'PingFang SC', 'Segoe UI', 'Arial', 'Helvetica',
  'SimSun', 'SimHei', 'KaiTi'
]

const sidebarItems = ref([
  { id: 'app-theme', name: '应用主题', icon: '🎨' },
  { id: 'editor-theme', name: '编辑器主题', icon: '📝' },
  { id: 'font-settings', name: '字体设置', icon: '🔤' }
])

async function loadThemes() {
  try {
    const allThemes = await window.electron.ipcRenderer.invoke('get-all-themes')

    const lightThemes = allThemes.filter((t: any) =>
      ['baize', 'warm', 'light', 'lavender', 'coral', 'mint', 'sunset', 'rose', 'baize-beast', 'baize-clear', 'baize-text', 'baize-starry'].includes(t.type)
    )
    const darkThemes = allThemes.filter((t: any) =>
      ['dark', 'deepdark', 'icon', 'ocean', 'forest'].includes(t.type)
    )
    const eyecareThemes = allThemes.filter((t: any) =>
      ['eyecare-green', 'eyecare-beige', 'eyecare-blue', 'eyecare-pink', 'eyecare-amber', 'eyecare-teal', 'eyecare-lilac'].includes(t.type)
    )

    themeCategories.value = [
      { name: '浅色主题', themes: lightThemes },
      { name: '深色主题', themes: darkThemes },
      { name: '护眼主题', themes: eyecareThemes }
    ]

    const monacoThemes = await window.electron.ipcRenderer.invoke('get-all-monaco-themes')
    allMonacoThemes.value = monacoThemes.map((t: any) => ({
      type: t.type,
      name: t.config.name,
      colors: {
        bg: t.config.backgroundColor || (t.config.isDark ? '#1e1e1e' : '#ffffff'),
        text: t.config.foregroundColor || (t.config.isDark ? '#d4d4d4' : '#333333'),
        accent: t.config.isDark ? '#007acc' : '#007acc'
      }
    }))

    const themeConfig = await window.api.config.read('theme')
    if (themeConfig) {
      currentTheme.value = themeConfig.currentTheme || 'baize'
      separateEditorTheme.value = themeConfig.separateEditorTheme || false
      currentMonacoTheme.value = themeConfig.editorTheme || 'vs'

      initialSettings.value = {
        currentTheme: currentTheme.value,
        separateEditorTheme: separateEditorTheme.value,
        currentMonacoTheme: currentMonacoTheme.value
      }
    }
  } catch (error) {
    console.error('加载主题失败:', error)
  }
}

function getThemePreviewStyle(theme: any) {
  if (theme.styles) {
    return {
      background: theme.styles.backgroundColor || theme.styles.background || '#fff',
      color: theme.styles.color || theme.styles.textColor || '#333'
    }
  }
  return {
    background: '#fff',
    color: '#333'
  }
}

function selectTheme(themeType: string) {
  currentTheme.value = themeType
}

function selectMonacoTheme(monacoTheme: string) {
  currentMonacoTheme.value = monacoTheme
}

function handleCancel() {
  currentTheme.value = initialSettings.value.currentTheme
  separateEditorTheme.value = initialSettings.value.separateEditorTheme
  currentMonacoTheme.value = initialSettings.value.currentMonacoTheme
  emit('close')
}

function handleApply() {
  emit('change', currentTheme.value, currentMonacoTheme.value, separateEditorTheme.value)
}

function handleConfirm() {
  handleApply()
  emit('close')
}

watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadThemes()
  }
})
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
  height: 600px;
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
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
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

.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 180px;
  background: var(--card-bg);
  border-right: 1px solid var(--border-color);
  padding: 12px 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-color);
}

.sidebar-item:hover {
  background: var(--hover-bg);
}

.sidebar-item.active {
  background: rgba(102, 126, 234, 0.1);
  color: var(--accent-color);
  border-right: 3px solid var(--accent-color);
}

.sidebar-icon {
  font-size: 18px;
}

.sidebar-name {
  font-size: 13px;
  font-weight: 500;
}

.content-area {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: var(--bg-color);
}

.panel {
  height: 100%;
}

.theme-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.theme-category {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.theme-card {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--card-bg);
}

.theme-card:hover {
  border-color: var(--accent-color);
}

.theme-card.selected {
  border-color: var(--accent-color);
  background: rgba(102, 126, 234, 0.08);
}

.theme-preview {
  height: 60px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-bottom: 6px;
}

.theme-name {
  font-size: 12px;
  color: var(--text-color);
  text-align: center;
}

.monaco-theme-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.setting-select,
.setting-input {
  width: 100%;
  max-width: 300px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--card-bg);
  outline: none;
  transition: border-color 0.2s;
}

.setting-select:focus,
.setting-input:focus {
  border-color: var(--accent-color);
}

.footer {
  padding: 15px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
  flex-shrink: 0;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.btn-cancel:hover {
  background: var(--border-color);
}

.btn-apply {
  background: var(--card-bg);
  border: 1px solid var(--accent-color);
  color: var(--accent-color);
}

.btn-apply:hover {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
