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
              <span class="title-text">编辑器设置</span>
              <button class="close-btn" @click.stop="handleClose">×</button>
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
                <div class="setting-panel" v-show="activePanel === 'basic'">
                  <div class="panel-header">
                    <h3>基础设置</h3>
                    <p>编辑器的基本配置选项</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">自动保存</div>
                    <div class="setting-row">
                      <label class="setting-label">启用自动保存</label>
                      <input type="checkbox" v-model="settings.autoSave" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">自动保存间隔（秒）</label>
                      <input type="number" v-model.number="settings.autoSaveInterval" class="setting-input" min="10" max="300" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">编辑体验</div>
                    <div class="setting-row">
                      <label class="setting-label">启用代码折叠</label>
                      <input type="checkbox" v-model="settings.enableFolding" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">显示行号</label>
                      <input type="checkbox" v-model="settings.showLineNumbers" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">启用自动补全</label>
                      <input type="checkbox" v-model="settings.enableAutoComplete" class="setting-checkbox" />
                    </div>
                  </div>
                </div>

                <div class="setting-panel" v-show="activePanel === 'appearance'">
                  <div class="panel-header">
                    <h3>外观设置</h3>
                    <p>编辑器的视觉配置</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">光标与选择</div>
                    <div class="setting-row">
                      <label class="setting-label">光标样式</label>
                      <select v-model="settings.cursorStyle" class="setting-select">
                        <option value="line">线条</option>
                        <option value="block">方块</option>
                        <option value="underline">下划线</option>
                        <option value="blink">闪烁</option>
                      </select>
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">光标宽度</label>
                      <input type="range" v-model.number="settings.cursorWidth" class="setting-range" min="1" max="5" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">字体设置</div>
                    <div class="setting-row">
                      <label class="setting-label">字体大小</label>
                      <input type="number" v-model.number="settings.fontSize" class="setting-input" min="10" max="24" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">行高</label>
                      <input type="number" v-model.number="settings.lineHeight" class="setting-input" min="1" max="3" step="0.1" />
                    </div>
                  </div>
                </div>

                <div class="setting-panel" v-show="activePanel === 'markdown'">
                  <div class="panel-header">
                    <h3>Markdown 设置</h3>
                    <p>Markdown 特定配置</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">实时预览</div>
                    <div class="setting-row">
                      <label class="setting-label">启用实时预览</label>
                      <input type="checkbox" v-model="settings.enableLivePreview" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">预览延迟（毫秒）</label>
                      <input type="number" v-model.number="settings.previewDelay" class="setting-input" min="100" max="2000" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">语法高亮</div>
                    <div class="setting-row">
                      <label class="setting-label">启用代码块高亮</label>
                      <input type="checkbox" v-model="settings.enableCodeHighlight" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">启用链接高亮</label>
                      <input type="checkbox" v-model="settings.enableLinkHighlight" class="setting-checkbox" />
                    </div>
                  </div>
                </div>

                <div class="setting-panel" v-show="activePanel === 'advanced'">
                  <div class="panel-header">
                    <h3>高级设置</h3>
                    <p>高级编辑器配置</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">性能</div>
                    <div class="setting-row">
                      <label class="setting-label">最大文件大小（MB）</label>
                      <input type="number" v-model.number="settings.maxFileSize" class="setting-input" min="1" max="100" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">渲染延迟（毫秒）</label>
                      <input type="number" v-model.number="settings.renderDelay" class="setting-input" min="50" max="500" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">实验性功能</div>
                    <div class="setting-row">
                      <label class="setting-label">启用实验性功能</label>
                      <input type="checkbox" v-model="settings.enableExperimental" class="setting-checkbox" />
                    </div>
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
import { reactive, ref, watch } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', settings: any): void
}>()

const activePanel = ref('basic')

const sidebarItems = [
  { id: 'basic', name: '基础设置', icon: '⚙️' },
  { id: 'appearance', name: '外观设置', icon: '🎨' },
  { id: 'markdown', name: 'Markdown', icon: '📝' },
  { id: 'advanced', name: '高级设置', icon: '🔧' }
]

const initialSettings = ref({
  autoSave: true,
  autoSaveInterval: 30,
  enableFolding: true,
  showLineNumbers: true,
  enableAutoComplete: true,
  cursorStyle: 'line',
  cursorWidth: 2,
  fontSize: 14,
  lineHeight: 1.6,
  enableLivePreview: true,
  previewDelay: 300,
  enableCodeHighlight: true,
  enableLinkHighlight: true,
  maxFileSize: 10,
  renderDelay: 100,
  enableExperimental: false
})

const settings = reactive({ ...initialSettings.value })

watch(() => props.visible, (newVal) => {
  if (newVal) {
    initialSettings.value = { ...settings }
  }
})

function handleClose() {
  emit('close')
}

function handleApply() {
  window.api.config.write('editor', { ...settings })
  emit('apply', { ...settings })
}

function handleConfirm() {
  handleApply()
  handleClose()
}

function handleCancel() {
  Object.assign(settings, initialSettings.value)
  handleClose()
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
  height: 48px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  cursor: move;
  user-select: none;
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

.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  background: var(--card-bg);
  border-right: 1px solid var(--border-color);
  padding: 16px 0;
  flex-shrink: 0;
}

.sidebar-item {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  cursor: pointer;
  color: var(--text-color);
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.sidebar-item:hover {
  background: var(--hover-bg);
}

.sidebar-item.active {
  background: var(--hover-bg);
  color: var(--accent-color);
  border-left-color: var(--accent-color);
}

.sidebar-icon {
  font-size: 18px;
}

.sidebar-name {
  font-size: 13px;
}

.content-area {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.setting-panel {
  height: 100%;
}

.panel-header {
  margin-bottom: 24px;
}

.panel-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.panel-header p {
  font-size: 13px;
  color: var(--secondary-text-color);
}

.settings-group {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.setting-label {
  font-size: 13px;
  color: var(--text-color);
}

.setting-input {
  width: 150px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
  transition: border-color 0.2s;
}

.setting-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.setting-select {
  width: 150px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color);
  background: var(--bg-color);
  cursor: pointer;
}

.setting-checkbox {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--accent-color);
}

.setting-range {
  width: 150px;
  cursor: pointer;
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

.btn:hover {
  opacity: 0.9;
}
</style>
