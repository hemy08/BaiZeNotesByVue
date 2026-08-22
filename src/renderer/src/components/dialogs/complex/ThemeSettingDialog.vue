<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
        <Transition name="dialog-scale">
          <div
            class="dialog-container"
            :style="{ ...dialogStyle, width: width + 'px', height: height + 'px' }"
            ref="dialogRef"
            @mousedown="onDialogMouseDown"
          >
            <!-- 调整大小的边框 -->
            <div class="resize-handle resize-n" @mousedown="startResize('n')"></div>
            <div class="resize-handle resize-s" @mousedown="startResize('s')"></div>
            <div class="resize-handle resize-e" @mousedown="startResize('e')"></div>
            <div class="resize-handle resize-w" @mousedown="startResize('w')"></div>
            <div class="resize-handle resize-ne" @mousedown="startResize('ne')"></div>
            <div class="resize-handle resize-nw" @mousedown="startResize('nw')"></div>
            <div class="resize-handle resize-se" @mousedown="startResize('se')"></div>
            <div class="resize-handle resize-sw" @mousedown="startResize('sw')"></div>
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
                          <div class="theme-preview" :style="getThemePreviewStyle(theme)">
                            <div class="preview-title-bar" :style="{ background: theme.styles?.titleBarGradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }"></div>
                            <div class="preview-content">
                              <div class="preview-sidebar" :style="{ background: theme.styles?.cardBackground || '#f5f5f5' }"></div>
                              <div class="preview-main">
                                <div class="preview-line" :style="{ background: theme.styles?.textColor || '#333', opacity: 0.8 }"></div>
                                <div class="preview-line" :style="{ background: theme.styles?.textColor || '#333', opacity: 0.5, width: '70%' }"></div>
                                <div class="preview-line" :style="{ background: theme.styles?.accentColor || '#00b0ff', opacity: 0.6, width: '50%' }"></div>
                              </div>
                            </div>
                          </div>
                          <div class="theme-info">
                            <div class="theme-name">{{ theme.styles?.name || theme.type }}</div>
                            <div class="theme-desc">{{ theme.styles?.description || '自定义主题' }}</div>
                            <div class="theme-colors">
                              <div class="color-dot" :style="{ background: theme.styles?.backgroundColor || '#fff' }" title="背景色"></div>
                              <div class="color-dot" :style="{ background: theme.styles?.accentColor || '#00b0ff' }" title="强调色"></div>
                              <div class="color-dot" :style="{ background: theme.styles?.textColor || '#333' }" title="文字色"></div>
                            </div>
                          </div>
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
                        <div class="preview-title-bar" :style="{ background: theme.colors.bg }"></div>
                        <div class="preview-content">
                          <div class="preview-sidebar" :style="{ background: theme.colors.bg, opacity: 0.8 }"></div>
                          <div class="preview-main">
                            <div class="preview-line" :style="{ background: theme.colors.text, opacity: 0.8 }"></div>
                            <div class="preview-line" :style="{ background: theme.colors.text, opacity: 0.5, width: '70%' }"></div>
                            <div class="preview-line" :style="{ background: theme.config?.accentColor || theme.colors.text, opacity: 0.6, width: '50%' }"></div>
                          </div>
                        </div>
                      </div>
                      <div class="theme-info">
                        <div class="theme-name">{{ theme.config?.name || theme.name }}</div>
                        <div class="theme-desc">{{ theme.config?.description || '编辑器主题' }}</div>
                        <div class="theme-colors">
                          <div class="color-dot" :style="{ background: theme.colors.bg }" title="背景色"></div>
                          <div class="color-dot" :style="{ background: theme.colors.text }" title="文字色"></div>
                          <div class="color-dot" :style="{ background: theme.config?.accentColor || theme.colors.text }" title="强调色"></div>
                        </div>
                      </div>
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
import { ref, watch } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'
import { useDialogResize } from '../../../composables/useDialogResize'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'change', themeType: string, monacoTheme: string, separateEditorTheme: boolean): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })
const { width, height, startResize } = useDialogResize({
  minWidth: 700,
  minHeight: 500,
  initialWidth: 900,
  initialHeight: 600
})

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

const allMonacoThemes = ref<Array<{ type: string; name: string; colors: any; config?: { accentColor?: string; name?: string; description?: string } }>>([])

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
      ['baize', 'warm', 'light', 'lavender', 'coral', 'mint', 'sunset', 'rose', 'baize-beast', 'baize-clear', 'baize-text', 'baize-starry', 'baize-data-light', 'baize-mirror-light'].includes(t.type)
    )
    const darkThemes = allThemes.filter((t: any) =>
      ['dark', 'deepdark', 'icon', 'ocean', 'forest', 'baize-data-dark', 'baize-mirror-dark'].includes(t.type)
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
  emit('change', currentTheme.value, currentMonacoTheme.value, separateEditorTheme.value)
}

function selectMonacoTheme(monacoTheme: string) {
  currentMonacoTheme.value = monacoTheme
  // 立即应用编辑器主题
  window.electron.ipcRenderer.send('baize-notes:update-monaco-theme', monacoTheme)
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
  position: relative;
}

.resize-handle {
  position: absolute;
  z-index: 10;
}

.resize-n, .resize-s {
  left: 10px;
  right: 10px;
  height: 6px;
  cursor: ns-resize;
}

.resize-n {
  top: -3px;
}

.resize-s {
  bottom: -3px;
}

.resize-e, .resize-w {
  top: 10px;
  bottom: 10px;
  width: 6px;
  cursor: ew-resize;
}

.resize-e {
  right: -3px;
}

.resize-w {
  left: -3px;
}

.resize-ne, .resize-nw, .resize-se, .resize-sw {
  width: 12px;
  height: 12px;
}

.resize-ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}

.resize-nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}

.resize-se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}

.resize-sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.theme-card {
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--card-bg);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.theme-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.theme-card.selected {
  border-color: var(--accent-color);
  background: rgba(102, 126, 234, 0.08);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.theme-preview {
  height: 100px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.preview-title-bar {
  height: 12px;
  flex-shrink: 0;
}

.preview-content {
  flex: 1;
  display: flex;
  padding: 6px;
  gap: 4px;
}

.preview-sidebar {
  width: 20px;
  border-radius: 2px;
  flex-shrink: 0;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px;
}

.preview-line {
  height: 3px;
  border-radius: 1px;
  width: 100%;
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.theme-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  text-align: left;
  line-height: 1.3;
}

.theme-desc {
  font-size: 11px;
  color: var(--secondary-text-color);
  text-align: left;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.theme-colors {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}

.color-dot:hover {
  transform: scale(1.2);
}

.monaco-theme-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
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
