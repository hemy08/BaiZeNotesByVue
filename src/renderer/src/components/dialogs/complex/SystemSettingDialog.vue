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
              <span class="title-text">系统设置</span>
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
                <div class="setting-panel" v-show="activePanel === 'general'">
                  <div class="panel-header">
                    <h3>通用设置</h3>
                    <p>应用程序的基本配置</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">启动选项</div>
                    <div class="setting-row">
                      <label class="setting-label">启动时自动打开上次文件</label>
                      <input type="checkbox" v-model="settings.autoOpenLastFile" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">启动时自动打开上次工作目录</label>
                      <input type="checkbox" v-model="settings.autoOpenLastFolder" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">开机自启动</label>
                      <input type="checkbox" v-model="settings.autoStart" class="setting-checkbox" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">窗口行为</div>
                    <div class="setting-row">
                      <label class="setting-label">关闭时最小化到托盘</label>
                      <input type="checkbox" v-model="settings.minimizeToTray" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">记住窗口位置和大小</label>
                      <input type="checkbox" v-model="settings.rememberWindowSize" class="setting-checkbox" />
                    </div>
                  </div>
                </div>

                <div class="setting-panel" v-show="activePanel === 'file'">
                  <div class="panel-header">
                    <h3>文件设置</h3>
                    <p>文件相关的配置选项</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">默认路径</div>
                    <div class="setting-row">
                      <label class="setting-label">默认文件保存路径</label>
                      <div class="path-input-group">
                        <input type="text" v-model="settings.defaultFilePath" class="setting-input" readonly />
                        <button class="browse-btn" @click="browseDefaultPath">浏览</button>
                      </div>
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">文件操作</div>
                    <div class="setting-row">
                      <label class="setting-label">启用自动保存</label>
                      <input type="checkbox" v-model="settings.autoSaveEnabled" class="setting-checkbox" @change="handleAutoSaveChange" />
                    </div>
                    <div class="setting-row" v-if="settings.autoSaveEnabled">
                      <label class="setting-label">自动保存间隔（秒）</label>
                      <input type="number" v-model.number="settings.autoSaveInterval" class="setting-input" min="10" max="300" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">最近文件列表数量</label>
                      <input type="number" v-model.number="settings.recentFilesCount" class="setting-input" min="5" max="20" />
                    </div>
                  </div>
                </div>

                <div class="setting-panel" v-show="activePanel === 'appearance'">
                  <div class="panel-header">
                    <h3>外观设置</h3>
                    <p>应用程序的视觉配置</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">主题</div>
                    <div class="setting-row">
                      <label class="setting-label">应用主题</label>
                      <select v-model="settings.appTheme" class="setting-select">
                        <option value="baize">白泽</option>
                        <option value="dark">深色</option>
                        <option value="light">浅色</option>
                      </select>
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">使用系统主题</label>
                      <input type="checkbox" v-model="settings.useSystemTheme" class="setting-checkbox" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">字体</div>
                    <div class="setting-row">
                      <label class="setting-label">系统字体</label>
                      <select v-model="settings.fontFamily" class="setting-select">
                        <option value="Microsoft YaHei">微软雅黑</option>
                        <option value="PingFang SC">苹方</option>
                        <option value="Segoe UI">Segoe UI</option>
                        <option value="Arial">Arial</option>
                      </select>
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">字体大小</label>
                      <input type="number" v-model.number="settings.fontSize" class="setting-input" min="12" max="20" />
                    </div>
                  </div>
                </div>

                <div class="setting-panel" v-show="activePanel === 'backup'">
                  <div class="panel-header">
                    <h3>备份与恢复</h3>
                    <p>数据备份和恢复选项</p>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">自动备份</div>
                    <div class="setting-row">
                      <label class="setting-label">启用自动备份</label>
                      <input type="checkbox" v-model="settings.enableAutoBackup" class="setting-checkbox" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">备份间隔（小时）</label>
                      <input type="number" v-model.number="settings.backupInterval" class="setting-input" min="1" max="72" />
                    </div>
                    <div class="setting-row">
                      <label class="setting-label">保留备份数量</label>
                      <input type="number" v-model.number="settings.backupCount" class="setting-input" min="1" max="10" />
                    </div>
                  </div>

                  <div class="settings-group">
                    <div class="group-title">操作</div>
                    <div class="button-group">
                      <button class="action-btn" @click="handleBackupNow">立即备份</button>
                      <button class="action-btn" @click="handleRestore">从备份恢复</button>
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
import { reactive, ref } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', settings: any): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const activePanel = ref('general')

const sidebarItems = [
  { id: 'general', name: '通用设置', icon: '⚙️' },
  { id: 'file', name: '文件设置', icon: '📁' },
  { id: 'appearance', name: '外观设置', icon: '🎨' },
  { id: 'backup', name: '备份与恢复', icon: '💾' }
]

// 保存初始状态，用于取消时恢复
const initialSettings = ref({
  autoOpenLastFile: false,
  autoOpenLastFolder: false,
  autoStart: false,
  minimizeToTray: true,
  rememberWindowSize: true,
  defaultFilePath: '',
  autoSaveEnabled: true,
  autoSaveInterval: 30,
  recentFilesCount: 10,
  appTheme: 'baize',
  useSystemTheme: false,
  fontFamily: 'Microsoft YaHei',
  fontSize: 14,
  enableAutoBackup: true,
  backupInterval: 24,
  backupCount: 5
})

const settings = ref({ ...initialSettings.value })

function browseDefaultPath() {
  console.log('Browse for default path')
}

function handleAutoSaveChange() {
  // 通过 IPC 通知主进程自动保存设置已更改
  window.electron.ipcRenderer.send('system-setting-auto-save-changed', {
    autoSaveEnabled: settings.value.autoSaveEnabled,
    autoSaveInterval: settings.value.autoSaveInterval
  })
}

function handleBackupNow() {
  console.log('Backup now')
}

function handleRestore() {
  console.log('Restore from backup')
}

function handleClose() {
  emit('close')
}

// 应用当前配置，不关闭窗口
function handleApply() {
  // 保存配置
  window.api.config.write('system', { ...settings.value })

  // 通知主进程
  emit('apply', { ...settings.value })
}

// 应用配置并关闭窗口
async function handleConfirm() {
  handleApply()
  handleClose()
}

// 取消：恢复初始配置，关闭窗口
function handleCancel() {
  settings.value = { ...initialSettings.value }
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
  height: 650px;
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
  width: 200px;
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
  width: 200px;
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
  width: 200px;
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

.path-input-group {
  display: flex;
  gap: 8px;
}

.browse-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.browse-btn:hover {
  border-color: var(--accent-color);
}

.button-group {
  display: flex;
  gap: 12px;
}

.action-btn {
  padding: 10px 20px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
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
