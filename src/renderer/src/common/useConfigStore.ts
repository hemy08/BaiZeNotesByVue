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
// 第 2 批契约重构：主题明暗归属统一引用 shared/constants/theme（唯一真源），
// 不再按主题 id 是否含 'dark' / '深' 猜明暗（与标题栏 logo、主题设置对话框分组共用同一清单）。
import { isDarkThemeType } from '../../../shared/constants/theme'
// 第 2 批契约重构：配置读取/写入形状以 shared/types/config.ts 为唯一真源——
// window.api.config.read 的类型重载据此按配置名字面量推断主进程实际返回形状，
// 本模块无需再手写泛型断言（下方 loadAllConfigs 的注释记录了两处历史形状漂移）。
import { t } from './i18n'
// 第 4 批 P3：裸 console.* 收敛到渲染层统一日志出口（logger.warn/error 参数原样透传，
// 输出与控制台可检索性保持不变；用户可见的失败提示仍由 showDialog 负责）。
import { logger } from './logger'

// 类型定义
/**
 * 主题配置（本地默认值形状）。
 *
 * 与 shared AppThemeConfig（主进程 'theme' 实际读取形状）结构等价；保留本地接口名
 * 以维持本模块既有导出与默认值类型，不再作为 read 的泛型断言。
 */
export interface ThemeConfig {
    currentTheme: string
    separateEditorTheme: boolean
    editorTheme?: string
}

/**
 * 编辑器配置（本地默认值形状，**不是**主进程 'editor' 的读取形状）。
 *
 * 契约漂移说明（第 2 批核实，仅记录不改运行时）：主进程 config:read('editor') 实际
 * 返回 `RendererEditorConfig`（fontSize / lineHeight / showLineNumbers / enableFolding /
 * enableAutoComplete / cursorStyle / cursorWidth 共 7 字段，见 shared/types/config.ts），
 * 与本接口的 9 字段（含 fontFamily/tabSize/wordWrap/autoSave/minimap）“不同构”。
 * 该 editorConfig 状态目前无生产消费者（仅单测覆盖默认值），加载时主进程返回值会
 * 整体替换默认对象——属于历史遗留，后续批次修正时再统一形状。
 */
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

/** 快速链接项（本地默认值形状，与主进程快速链接设置对话框的 links 元素一致） */
export interface QuickLink {
    name: string
    url: string
    icon: string
    description: string
}

/**
 * 快速链接配置（本地默认值形状，**不是**主进程 'quick-links' 的读取形状）。
 *
 * 契约漂移说明（第 2 批核实，仅记录不改运行时）：主进程 config:read('quick-links')
 * 实际直接返回 `RendererQuickLinkItem[]` 数组（无 `{ links }` 包裹，可能为 null），
 * 本接口的 `{ links: [...] }` 包裹形态仅用于本地默认值；该 quickLinksConfig 状态
 * 目前无生产消费者（仅单测覆盖默认值），后续批次修正时再统一形状。
 */
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
    // 第 4 批 P3：删除主进程从不发送、零消费方的 data 死字段（保留 visible 开关）。
    admonition: { visible: boolean }
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
    logger.error(`[ConfigStore] Error saving config ${name}:`, error)
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
        // 2026-11-19：不再在全局 store 缓存 'system' 配置——该状态零生产消费者，
        // 系统设置对话框直接经 window.api.config.read/write('system') 读写主进程
        // SystemSetting（唯一真源 src/main/config/system-setting.ts），避免两套默认值漂移。
        const [theme, editor, links] = await Promise.all([
            // 第 2 批契约重构：不再手写 <ThemeConfig>/<EditorConfig>/<QuickLinksConfig>
            // 泛型断言（其中后两者与主进程实际返回形状不符），改由 preload 类型重载
            // 按配置名字面量推断 shared ConfigReadMap 的真实形状。
            window.api.config.read('theme'),
            window.api.config.read('editor'),
            window.api.config.read('quick-links')
        ])

        if (theme) themeConfig.value = theme
        // 主进程 'editor' 实际返回 RendererEditorConfig（7 字段）；本 store 的
        // editorConfig 是历史 9 字段默认值形状且无生产消费者（详见接口注释）。
        // 运行时行为保持原样（整体替换），此处仅用类型断言跨过“历史形状 ↔ 实际形状”边界。
        if (editor) editorConfig.value = editor as unknown as EditorConfig
        // 主进程 'quick-links' 实际直接返回数组（可能为 null），同样保留原有整体替换行为。
        if (links) quickLinksConfig.value = links as unknown as QuickLinksConfig
    } catch (error) {
        logger.error('[ConfigStore] Error loading configs:', error)
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

// 消息对话框类型
type MessageDialogType = 'message' | MessageType
/**
 * 消息对话框名称集合（'message' 伪名称 + 5 种消息类型）。
 * 第 4 批 P3：showDialog / hideDialog / toggleDialog 此前各自内联同一数组 3 份，
 * 收敛为本模块常量复用，避免新增消息类型时漏改某一处。
 */
const MESSAGE_DIALOG_TYPES: readonly MessageDialogType[] = [
    'success',
    'error',
    'warning',
    'info',
    'failed',
    'message'
]
// 对话框名称类型（包括消息对话框的伪名称）
export type DialogName = keyof DialogState | MessageDialogType

// 对话框控制函数
function showDialog(dialogName: DialogName, data?: Record<string, unknown>) {
    // 如果是消息对话框类型（'message' 或具体的消息类型），更新 messageDialog
    if (MESSAGE_DIALOG_TYPES.includes(dialogName as MessageDialogType)) {
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
    if (MESSAGE_DIALOG_TYPES.includes(dialogName as MessageDialogType)) {
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
    if (MESSAGE_DIALOG_TYPES.includes(dialogName as MessageDialogType)) {
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
    quickLinksConfig,
    dialogs,
    isLoading,

    // 计算属性
    currentTheme: computed(() => themeConfig.value.currentTheme),
    /**
     * 是否为深色系主题。
     * 第 2 批契约重构：判定口径统一为 shared/constants/theme 的 DARK_THEME_TYPES
     * （与主题设置对话框分组、标题栏 logo 明暗切换同一清单）；未知主题值按非深色处理。
     */
    isDarkTheme: computed(() => isDarkThemeType(themeConfig.value.currentTheme)),

    // 方法
    loadAllConfigs,
    saveThemeConfig,
    saveEditorConfig,
    saveQuickLinksConfig,
    // FE-35：立即落盘待写配置（关闭窗口/卸载前 flush）
    flushConfigWrites,
    updateThemeConfig,
    updateEditorConfig,
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
