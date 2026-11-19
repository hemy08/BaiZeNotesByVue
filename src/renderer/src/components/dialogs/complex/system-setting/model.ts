/**
 * 系统设置对话框 —— 表单模型 / 侧边栏页签 / 读写映射纯函数
 * （结构优化第 5 批 5.5：从 SystemSettingDialog.vue 抽出的纯数据与纯函数子集）。
 *
 * 说明（为什么先做纯函数/常量抽取而不是按页签拆组件）：
 * 该对话框 4 个页签（general/file/appearance/backup）共用一份 `settings` 响应式状态与
 * 只读主题展示状态；按页签拆子组件需要额外 props/defineModel 管道，并把 260+ 行 scoped
 * 样式拆分/去 scope，单次改动 >300 行且存在 UI 回归风险，超出「低风险子集」范围。
 * 因此本轮先抽取与 DOM/状态无关的部分（类型、默认值、存储合并、语言归一化、页签常量），
 * 后续若确需按页签拆组件，可在此基础上继续。
 */

import { SYSTEM_SETTING_FALLBACK } from '../../../../../../shared/constants/system-defaults'

/** 系统设置对话框的全部字段（含渲染层扩展字段，与主进程 systemSetting.json 同源持久化） */
export interface SystemDialogSettings {
    autoOpenLastFile: boolean
    autoOpenLastFolder: boolean
    autoStart: boolean
    minimizeToTray: boolean
    rememberWindowSize: boolean
    language: string
    defaultFilePath: string
    autoSaveEnabled: boolean
    autoSaveInterval: number
    recentFilesCount: number
    appTheme: string
    useSystemTheme: boolean
    fontFamily: string
    fontSize: number
    enableAutoBackup: boolean
    backupInterval: number
    backupCount: number
    // AS-9（P3 隐私）：允许预览加载文档中的远程图片（默认 false，仅本地图片）
    allowRemoteImages: boolean
}

/** 左侧页签（顺序即展示顺序；id 与模板中的 activePanel 判定一一对应） */
export const SYSTEM_SETTING_SIDEBAR_ITEMS = [
    { id: 'general', nameKey: 'dialogRenderer.systemSetting.sidebarGeneral', icon: '⚙️' },
    { id: 'file', nameKey: 'dialogRenderer.systemSetting.sidebarFile', icon: '📁' },
    { id: 'appearance', nameKey: 'dialogRenderer.systemSetting.sidebarAppearance', icon: '🎨' },
    { id: 'backup', nameKey: 'dialogRenderer.systemSetting.sidebarBackup', icon: '💾' }
] as const

/** 备份/恢复复用既有 CONFIG 通道（configName = 'backup'），不新增 IPC 通道 */
export const SYSTEM_BACKUP_CONFIG_NAME = 'backup'

/**
 * 初始状态（也用于取消时恢复）：默认值统一引用共享常量 SYSTEM_SETTING_FALLBACK。
 *
 * 背景：此前组件内还有第三套本地默认值（两项 opt-in 为 false、autoSaveInterval: 30、
 * fontSize: 14），与主进程真源（60 / 13）及 store 旧 fallback 互相矛盾。
 * 常量真源为主进程 src/main/config/system-setting.ts，此处仅作读取失败/字段缺失兜底。
 * 注意只按本对话框字段做映射：不把主进程内部字段（模态开关、菜单栏样式等）带入
 * config:write('system') 的提交载荷，避免「应用」时覆盖主进程自身字段。
 */
export function createDefaultSystemDialogSettings(): SystemDialogSettings {
    return {
        autoOpenLastFile: SYSTEM_SETTING_FALLBACK.autoOpenLastFile,
        autoOpenLastFolder: SYSTEM_SETTING_FALLBACK.autoOpenLastFolder,
        autoStart: SYSTEM_SETTING_FALLBACK.autoStart,
        minimizeToTray: SYSTEM_SETTING_FALLBACK.minimizeToTray,
        rememberWindowSize: SYSTEM_SETTING_FALLBACK.rememberWindowSize,
        // 主进程默认 'zh-cn'（小写），本对话框下拉选项为 'zh-CN' / 'en-US'，按展示值归一化
        language: 'zh-CN',
        defaultFilePath: SYSTEM_SETTING_FALLBACK.defaultFilePath,
        autoSaveEnabled: SYSTEM_SETTING_FALLBACK.autoSaveEnabled,
        autoSaveInterval: SYSTEM_SETTING_FALLBACK.autoSaveInterval,
        recentFilesCount: SYSTEM_SETTING_FALLBACK.recentFilesCount,
        appTheme: SYSTEM_SETTING_FALLBACK.appTheme,
        useSystemTheme: SYSTEM_SETTING_FALLBACK.useSystemTheme,
        fontFamily: SYSTEM_SETTING_FALLBACK.fontFamily,
        fontSize: SYSTEM_SETTING_FALLBACK.fontSize,
        enableAutoBackup: SYSTEM_SETTING_FALLBACK.enableAutoBackup,
        backupInterval: SYSTEM_SETTING_FALLBACK.backupInterval,
        backupCount: SYSTEM_SETTING_FALLBACK.backupCount,
        // AS-9（P3 隐私）：安全默认——不加载远程图片
        allowRemoteImages: SYSTEM_SETTING_FALLBACK.allowRemoteImages
    }
}

/**
 * 合并主进程 `config:read('system')` 返回值到当前表单（纯函数，返回新对象）。
 * 只合并「已定义且运行时类型一致」的字段，未返回/类型不符的字段保持当前值；
 * 不把主进程内部字段带入提交载荷（见 createDefaultSystemDialogSettings 注释）。
 */
export function mergeStoredSystemSettings(
    current: SystemDialogSettings,
    stored: unknown
): SystemDialogSettings {
    const merged: SystemDialogSettings = { ...current }
    if (!stored || typeof stored !== 'object') {
        return merged
    }
    const source = stored as Record<string, unknown>
    for (const key of Object.keys(merged) as (keyof SystemDialogSettings)[]) {
        const value = source[key]
        if (value !== undefined && typeof value === typeof merged[key]) {
            ;(merged as unknown as Record<string, unknown>)[key] = value
        }
    }
    return merged
}

/**
 * 语言历史值归一化（主进程默认 'zh-cn'，下拉选项值为 'zh-CN' / 'en-US'）。
 * 以 'en' 开头 → 'en-US'，其余一律回退 'zh-CN'。
 */
export function normalizeLanguageSelection(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .startsWith('en')
        ? 'en-US'
        : 'zh-CN'
}
