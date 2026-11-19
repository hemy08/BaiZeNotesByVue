/**
 * 配置状态管理
 * 使用 Vue 3 Composition API 管理配置状态
 */
import { ref, reactive, computed } from 'vue'
import {
    DEFAULT_GITHUB,
    DEFAULT_GOOGLE,
    DEFAULT_STACKOVERFLOW
} from '../../../shared/constants/urls'
// CQ-8：'system' 配置的主进程唯一契约类型（ARC-13）
import type { SystemSetting } from '../../../shared/types'
import { t } from './i18n'

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

/**
 * CQ-8：系统设置渲染层视图。
 *
 * 主进程 'system' 配置的真实契约是 src/shared/types/system.ts 的 SystemSetting
 * （ARC-13 唯一真源；config-manager 的 'system' 路由 → getSystemSetting/saveSystemSetting）。
 * 历史上本接口把「渲染层扩展字段」全部声明为必填，导致 `read<SystemConfig>('system')`
 * 的类型断言向消费者撒谎（主进程实际返回 SystemSetting，必填 language 之外的扩展字段
 * 可能缺失）。现改为 SystemSetting 对应字段的 Partial 视图：字段名/类型与主进程契约一致，
 * 可选性与真实往返数据一致。
 *
 * 注意：该状态当前没有生产消费者——FE-05/06 修复后，系统设置对话框直接经
 * window.api.config.read/write('system') 读写 SystemSetting。保留本状态与
 * save/update 方法仅为兼容历史调用面。
 */
export type SystemConfig = Partial<
    Pick<
        SystemSetting,
        | 'language'
        | 'autoOpenLastFile'
        | 'autoOpenLastFolder'
        | 'autoStart'
        | 'minimizeToTray'
        | 'rememberWindowSize'
        | 'defaultFilePath'
        | 'recentFilesCount'
        | 'checkUpdateOnStart'
        | 'enableAutoBackup'
        | 'backupInterval'
        | 'backupCount'
    >
>

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
    // 2026-11-19：与主进程 system-setting 默认值统一（此前渲染层 fallback 为 true）
    autoOpenLastFile: false,
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
        {
            name: 'Stack Overflow',
            url: DEFAULT_STACKOVERFLOW,
            icon: '📚',
            description: '程序员问答社区'
        }
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
    helpAbout: { visible: boolean }
    helpContact: { visible: boolean }
    techStack: { visible: boolean }
    quickLinks: { visible: boolean }
    importOption: { visible: boolean; content?: string }
    // Material 语法插入对话框（15 项 mkdocs-material 扩展语法）：
    // preset 为 featureId（collapsible/task-list/.../tab-link），由菜单动作 showDialog 第二参传入，
    // 对话框打开时据此选中左侧对应语法项；无 preset 时默认第一项。
    materialSyntax: { visible: boolean; preset?: string }
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
    helpAbout: { visible: false },
    helpContact: { visible: false },
    techStack: { visible: false },
    quickLinks: { visible: false },
    importOption: { visible: false },
    materialSyntax: { visible: false }
}

// 全局状态
const themeConfig = ref<ThemeConfig>({ ...defaultThemeConfig })
const editorConfig = ref<EditorConfig>({ ...defaultEditorConfig })
const systemConfig = ref<SystemConfig>({ ...defaultSystemConfig })
const quickLinksConfig = ref<QuickLinksConfig>({ ...defaultQuickLinksConfig })
const dialogs = reactive<DialogState>({ ...defaultDialogState })
const isLoading = ref(false)

// MEM-15：按配置名（configName）分离防抖定时器，
// 避免不同配置连续保存时互相取消、仅最后一种配置落盘。
const saveTimers = new Map<string, NodeJS.Timeout>()

/**
 * FE-35：配置写盘去抖窗口（500ms → 200ms）。
 * 缩短窗口可显著缩小「关窗/刷新前最后一次设置修改」的丢失概率；
 * 关窗兜底仍由 flushConfigWrites() 主动落盘（App.vue 监听主进程关闭前 flush 事件）。
 */
export const CONFIG_SAVE_DEBOUNCE_MS = 200

/**
 * FE-35：去抖窗口内的待写盘配置（configName → 最新数据）。
 * 同一配置名只保留最后一次修改；flushConfigWrites() 取走后立即写盘。
 */
const pendingWrites = new Map<string, Record<string, unknown>>()

/** FE-20：配置名 → 用户可读名称的 i18n 键（未知名称原样展示） */
const CONFIG_NAME_KEYS: Record<string, string> = {
    theme: 'workspace.config.names.theme',
    editor: 'workspace.config.names.editor',
    system: 'workspace.config.names.system',
    'quick-links': 'workspace.config.names.quick-links'
}

/** 取异常文案（用于配置保存失败提示） */
function describeSaveError(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }
    return String(error)
}

/**
 * FE-20：配置写盘失败统一反馈。
 *
 * 修复前去抖写盘失败只 console.error——磁盘满/配置目录只读时设置「看起来保存了」，
 * 重启后丢失且用户毫无提示。现在写失败经全局消息对话框明确告知（保留日志便于排查）。
 */
function reportConfigSaveFailure(name: string, error: unknown): void {
    console.error(`[ConfigStore] Error saving config ${name}:`, error)
    const displayName = CONFIG_NAME_KEYS[name] ? t(CONFIG_NAME_KEYS[name]) : name
    showDialog('error', {
        title: t('workspace.config.saveFailedTitle'),
        message: t('workspace.config.saveFailedMessage', {
            name: displayName,
            error: describeSaveError(error)
        })
    })
}

// 保存配置（按 configName 独立防抖）
async function saveConfig(name: string, data: Record<string, unknown>) {
    pendingWrites.set(name, data)
    const existing = saveTimers.get(name)
    if (existing) {
        clearTimeout(existing)
    }
    const timer = setTimeout(async () => {
        saveTimers.delete(name)
        const pending = pendingWrites.get(name)
        pendingWrites.delete(name)
        if (pending) {
            await writeConfigNow(name, pending)
        }
    }, CONFIG_SAVE_DEBOUNCE_MS)
    saveTimers.set(name, timer)
}

/**
 * 将 store 中的响应式数据归一化为纯 JSON 值。
 *
 * 2026-11-15 实机问题：`saveConfig('theme', themeConfig.value)` 传入的是 Vue
 * reactive Proxy，Electron IPC 的结构化克隆不支持 Proxy（抛
 * `An object could not be cloned`，主题设置保存弹「配置「主题」写入磁盘失败」）。
 * 配置本质是 JSON，这里在写盘前做一次 JSON 往返，确保传给主进程的是纯对象。
 */
function toPlainConfigData(data: Record<string, unknown>): Record<string, unknown> {
    try {
        return JSON.parse(JSON.stringify(data)) as Record<string, unknown>
    } catch {
        return data
    }
}

/**
 * 立即写盘单个配置（去抖回调与 flush 共用）。
 * 主进程 writeConfig 失败返回 false（不抛异常）——两种失败形态都要提示。
 */
async function writeConfigNow(name: string, data: Record<string, unknown>): Promise<void> {
    try {
        const saved = await window.api.config.write(name, toPlainConfigData(data))
        if (saved === false) {
            reportConfigSaveFailure(name, new Error(t('workspace.config.writeReturnedFalse')))
        }
    } catch (error) {
        reportConfigSaveFailure(name, error)
    }
}

/**
 * FE-35：立即落盘所有待写配置（取消防抖计时器，不再等待）。
 *
 * 调用场景：
 * - App.vue 监听主进程关闭前 flush（IPC.EDITOR.FLUSH_CONTENT）——此时主进程
 *   会等待编辑器 flush 回执（2s 超时）后才关窗，渲染层仍存活，异步 IPC 可送达；
 * - App.vue onBeforeUnmount 与 window beforeunload 兜底。
 *
 * 逐项 catch（写入失败仍走 reportConfigSaveFailure 弹窗），不会 reject；
 * 返回 Promise 便于调用方/单测等待写盘完成。
 */
export async function flushConfigWrites(): Promise<void> {
    const entries = [...pendingWrites.entries()]
    pendingWrites.clear()
    for (const timer of saveTimers.values()) {
        clearTimeout(timer)
    }
    saveTimers.clear()
    await Promise.all(entries.map(([name, data]) => writeConfigNow(name, data)))
}

// 加载所有配置
async function loadAllConfigs() {
    isLoading.value = true
    try {
        const [theme, editor, system, links] = await Promise.all([
            window.api.config.read<ThemeConfig>('theme'),
            window.api.config.read<EditorConfig>('editor'),
            // CQ-8：'system' 路由实际返回 SystemSetting（config-manager: getSystemSetting），
            // 原 read<SystemConfig> 为错误断言；现按主进程契约读取。
            window.api.config.read<SystemSetting>('system'),
            window.api.config.read<QuickLinksConfig>('quick-links')
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

// 消息对话框类型
type MessageDialogType = 'message' | MessageType
// 对话框名称类型（包括消息对话框的伪名称）
export type DialogName = keyof DialogState | MessageDialogType

// 对话框控制函数
function showDialog(dialogName: DialogName, data?: Record<string, unknown>) {
    // 如果是消息对话框类型（'message' 或具体的消息类型），更新 messageDialog
    const messageTypes: readonly MessageDialogType[] = [
        'success',
        'error',
        'warning',
        'info',
        'failed',
        'message'
    ]
    if (messageTypes.includes(dialogName as MessageDialogType)) {
        // 如果 dialogName 是 'message'，从 data.type 读取具体类型
        // 如果 dialogName 是具体类型（如 'success'），直接使用
        const messageType = dialogName === 'message' ? data?.type || 'success' : dialogName
        dialogs.messageDialog = {
            visible: true,
            type: messageType as MessageType,
            title: (data?.title as string) || '',
            message: (data?.message as string) || ''
        }
    } else {
        // 其他对话框类型，正常处理
        const name = dialogName as keyof DialogState
        if (data !== undefined) {
            Object.assign(dialogs[name], data, { visible: true })
        } else {
            dialogs[name].visible = true
        }
    }
}

function hideDialog(dialogName: DialogName) {
    // 如果是消息对话框类型（'message' 或具体的消息类型），隐藏 messageDialog
    const messageTypes: readonly MessageDialogType[] = [
        'success',
        'error',
        'warning',
        'info',
        'failed',
        'message'
    ]
    if (messageTypes.includes(dialogName as MessageDialogType)) {
        dialogs.messageDialog.visible = false
    } else {
        // 其他对话框类型，正常处理
        const name = dialogName as keyof DialogState
        dialogs[name].visible = false
        // MEM-06：关闭导入选项对话框时同步清空大内容，避免导入文本常驻全局 store
        if (name === 'importOption') {
            dialogs.importOption.content = undefined
        }
    }
}

function toggleDialog(dialogName: DialogName) {
    const messageTypes: readonly MessageDialogType[] = [
        'success',
        'error',
        'warning',
        'info',
        'failed',
        'message'
    ]
    if (messageTypes.includes(dialogName as MessageDialogType)) {
        dialogs.messageDialog.visible = !dialogs.messageDialog.visible
    } else {
        const name = dialogName as keyof DialogState
        dialogs[name].visible = !dialogs[name].visible
    }
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

// FE-27/P2 死代码清理：原 showRename(currentPath) 全仓无调用方（父组件也未绑定
// Vue RenameDialog 的 @confirm），属永远不可见的死轨道；重命名实际走主进程 HTML
// 对话框 ShowRenameDialog。随 RenameDialog.vue 一并删除。

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
    isDarkTheme: computed(
        () =>
            themeConfig.value.currentTheme.includes('dark') ||
            themeConfig.value.currentTheme.includes('深')
    ),

    // 方法
    loadAllConfigs,
    saveThemeConfig,
    saveEditorConfig,
    saveSystemConfig,
    saveQuickLinksConfig,
    // FE-35：立即落盘待写配置（关闭窗口/卸载前 flush）
    flushConfigWrites,
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
    showFailed
})

// 创建全局单例
let storeInstance: ReturnType<typeof useConfigStore> | null = null

export function getConfigStore() {
    if (!storeInstance) {
        storeInstance = useConfigStore()
    }
    return storeInstance
}
