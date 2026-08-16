/**
 * 配置状态管理
 * 使用 Vue 3 Composition API 管理配置状态
 */
import { ref, reactive, watch, computed } from 'vue'
import { DEFAULT_GITHUB, DEFAULT_GOOGLE, DEFAULT_STACKOVERFLOW } from '../../../main/constants/urls'

// 类型定义
export interface ThemeConfig {
  currentTheme: string
  separateEditorTheme: boolean
  editorTheme?: string
}

export interface EditorConfig {
  fontFamily: string
  fontSize: number
  lineHeight: number
  tabSize: number
  wordWrap: string
  autoSave: boolean
  autoSaveInterval: number
  showLineNumbers: boolean
  minimap: { enabled: boolean; maxColumn: number }
}

export interface SystemConfig {
  autoOpenLastFile: boolean
  autoOpenLastFolder: boolean
  autoStart: boolean
  minimizeToTray: boolean
  rememberWindowSize: boolean
  defaultFilePath: string
  recentFilesCount: number
  language: string
  checkUpdateOnStart: boolean
  enableAutoBackup: boolean
  backupInterval: number
  backupCount: number
}

export interface QuickLink {
  name: string
  url: string
  icon: string
  description: string
}

export interface QuickLinksConfig {
  links: QuickLink[]
}

// 默认配置值
export const defaultThemeConfig: ThemeConfig = {
  currentTheme: 'baize',
  separateEditorTheme: false,
  editorTheme: 'vs'
}

export const defaultEditorConfig: EditorConfig = {
  fontFamily: 'Consolas',
  fontSize: 14,
  lineHeight: 1.6,
  tabSize: 2,
  wordWrap: 'on',
  autoSave: true,
  autoSaveInterval: 30,
  showLineNumbers: true,
  minimap: { enabled: true, maxColumn: 120 }
}

export const defaultSystemConfig: SystemConfig = {
  autoOpenLastFile: true,
  autoOpenLastFolder: false,
  autoStart: false,
  minimizeToTray: true,
  rememberWindowSize: true,
  defaultFilePath: '',
  recentFilesCount: 10,
  language: 'zh-CN',
  checkUpdateOnStart: true,
  enableAutoBackup: true,
  backupInterval: 24,
  backupCount: 5
}

export const defaultQuickLinksConfig: QuickLinksConfig = {
  links: [
    { name: 'GitHub', url: DEFAULT_GITHUB, icon: '🐙', description: '代码托管平台' },
    { name: 'Google', url: DEFAULT_GOOGLE, icon: '🔍', description: '搜索引擎' },
    { name: 'Stack Overflow', url: DEFAULT_STACKOVERFLOW, icon: '📚', description: '程序员问答社区' }
  ]
}

// 对话框状态接口
type MessageType = 'success' | 'error' | 'warning' | 'info' | 'failed'

export interface DialogState {
  messageDialog: { visible: boolean; type: MessageType; title: string; message: string }
  themeSettings: { visible: boolean }
  fontSelect: { visible: boolean }
  editorSettings: { visible: boolean }
  systemSettings: { visible: boolean }
  mermaidEdit: { visible: boolean }
  admonition: { visible: boolean; data?: Record<string, unknown> }
  mathText: { visible: boolean }
  insertImage: { visible: boolean }
  mdSheet: { visible: boolean }
  insertLink: { visible: boolean }
  createFileFolder: { visible: boolean; dirPath?: string }
  rename: { visible: boolean; currentPath: string }
  helpAbout: { visible: boolean }
  helpContact: { visible: boolean }
  techStack: { visible: boolean }
  quickLinks: { visible: boolean }
  importOption: { visible: boolean; content?: string }
}

// 对话框默认状态
const defaultDialogState: DialogState = {
  messageDialog: { visible: false, type: 'success', title: '', message: '' },
  themeSettings: { visible: false },
  fontSelect: { visible: false },
  editorSettings: { visible: false },
  systemSettings: { visible: false },
  mermaidEdit: { visible: false },
  admonition: { visible: false },
  mathText: { visible: false },
  insertImage: { visible: false },
  mdSheet: { visible: false },
  insertLink: { visible: false },
  createFileFolder: { visible: false },
  rename: { visible: false, currentPath: '' },
  helpAbout: { visible: false },
  helpContact: { visible: false },
  techStack: { visible: false },
  quickLinks: { visible: false },
  importOption: { visible: false }
}

// 全局状态
const themeConfig = ref<ThemeConfig>({ ...defaultThemeConfig })
const editorConfig = ref<EditorConfig>({ ...defaultEditorConfig })
const systemConfig = ref<SystemConfig>({ ...defaultSystemConfig })
const quickLinksConfig = ref<QuickLinksConfig>({ ...defaultQuickLinksConfig })
const dialogs = reactive<DialogState>({ ...defaultDialogState })
const isLoading = ref(false)

// 防抖计时器
let saveTimeout: NodeJS.Timeout | null = null

// 加载所有配置
async function loadAllConfigs() {
  isLoading.value = true
  try {
    const [theme, editor, system, links] = await Promise.all([
      window.api.config.read('theme'),
      window.api.config.read('editor'),
      window.api.config.read('system'),
      window.api.config.read('quick-links')
    ])

    if (theme) themeConfig.value = theme
    if (editor) editorConfig.value = editor
    if (system) systemConfig.value = system
    if (links) quickLinksConfig.value = links

  } catch (error) {
    console.error('[ConfigStore] Error loading configs:', error)
  } finally {
    isLoading.value = false
  }
}

// 保存配置（防抖）
async function saveConfig(name: string, data: Record<string, unknown>) {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    try {
      await window.api.config.write(name, data)
    } catch (error) {
      console.error(`[ConfigStore] Error saving config ${name}:`, error)
    }
  }, 500)
}

// 保存主题配置
async function saveThemeConfig() {
  saveConfig('theme', themeConfig.value)
}

// 保存编辑器配置
async function saveEditorConfig() {
  saveConfig('editor', editorConfig.value)
}

// 保存系统配置
async function saveSystemConfig() {
  saveConfig('system', systemConfig.value)
}

// 保存快捷链接配置
async function saveQuickLinksConfig() {
  saveConfig('quick-links', quickLinksConfig.value)
}

// 更新主题配置
function updateThemeConfig(config: Partial<ThemeConfig>) {
  Object.assign(themeConfig.value, config)
  saveThemeConfig()
}

// 更新编辑器配置
function updateEditorConfig(config: Partial<EditorConfig>) {
  Object.assign(editorConfig.value, config)
  saveEditorConfig()
}

// 更新系统配置
function updateSystemConfig(config: Partial<SystemConfig>) {
  Object.assign(systemConfig.value, config)
  saveSystemConfig()
}

// 对话框控制函数
function showDialog(dialogName: keyof DialogState, data?: Record<string, unknown>) {
  // 如果是消息对话框类型（'message' 或具体的消息类型），更新 messageDialog
  const messageTypes = ['success', 'error', 'warning', 'info', 'failed', 'message'] as const
  if (messageTypes.includes(dialogName as any)) {
    // 如果 dialogName 是 'message'，从 data.type 读取具体类型
    // 如果 dialogName 是具体类型（如 'success'），直接使用
    const messageType = dialogName === 'message' ? (data?.type || 'success') : dialogName
    dialogs.messageDialog = {
      visible: true,
      type: messageType as MessageType,
      title: (data?.title as string) || '',
      message: (data?.message as string) || ''
    }
  } else {
    // 其他对话框类型，正常处理
    if (data !== undefined) {
      Object.assign(dialogs[dialogName], data, { visible: true })
    } else {
      dialogs[dialogName].visible = true
    }
  }
}

function hideDialog(dialogName: keyof DialogState) {
  // 如果是消息对话框类型（'message' 或具体的消息类型），隐藏 messageDialog
  const messageTypes = ['success', 'error', 'warning', 'info', 'failed', 'message'] as const
  if (messageTypes.includes(dialogName as any)) {
    dialogs.messageDialog.visible = false
  } else {
    // 其他对话框类型，正常处理
    dialogs[dialogName].visible = false
  }
}

function toggleDialog(dialogName: keyof DialogState) {
  dialogs[dialogName].visible = !dialogs[dialogName].visible
}

// 显示成功消息
function showSuccess(title: string, message: string) {
  showDialog('success', { title, message })
}

function showError(title: string, message: string) {
  showDialog('error', { title, message })
}

function showWarning(title: string, message: string) {
  showDialog('warning', { title, message })
}

function showInfo(title: string, message: string) {
  showDialog('info', { title, message })
}

function showFailed(title: string, message: string) {
  showDialog('failed', { title, message })
}

// 显示重命名对话框
function showRename(currentPath: string) {
  showDialog('rename', { currentPath })
}

// 导出 store
export const useConfigStore = () => ({
  // 状态
  themeConfig,
  editorConfig,
  systemConfig,
  quickLinksConfig,
  dialogs,
  isLoading,

  // 计算属性
  currentTheme: computed(() => themeConfig.value.currentTheme),
  isDarkTheme: computed(() =>
    themeConfig.value.currentTheme.includes('dark') ||
    themeConfig.value.currentTheme.includes('深')
  ),

  // 方法
  loadAllConfigs,
  saveThemeConfig,
  saveEditorConfig,
  saveSystemConfig,
  saveQuickLinksConfig,
  updateThemeConfig,
  updateEditorConfig,
  updateSystemConfig,
  showDialog,
  hideDialog,
  toggleDialog,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showFailed,
  showRename
})

// 创建全局单例
let storeInstance: ReturnType<typeof useConfigStore> | null = null

export function getConfigStore() {
  if (!storeInstance) {
    storeInstance = useConfigStore()
  }
  return storeInstance
}
