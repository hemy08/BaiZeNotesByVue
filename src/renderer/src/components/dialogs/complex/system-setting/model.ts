/**
 * 系统设置对话框 —— 表单模型 / 侧边栏页签 / 读写映射 / 脏标记与校验纯函数
 * （结构优化第 5 批 5.5 抽出的纯数据与纯函数；设置页拆分 P0 继续承载纯逻辑）。
 *
 * 与 DOM / 响应式状态无关的部分全部收敛到本文件：
 * - 对话框字段类型与默认值映射（createDefaultSystemDialogSettings）；
 * - 主进程配置读取合并（mergeStoredSystemSettings）与语言历史值归一化；
 * - 侧边栏页签常量（SYSTEM_SETTING_SIDEBAR_ITEMS，顺序即 DOM 顺序）；
 * - 设置页拆分 P0 新增：脏标记比较（isSystemSettingsDirty）与保存前校验
 *   （validateDialogSettings，仅诊断日志用，不阻断保存——主进程 AS-4 才是强制校验）。
 *
 * 响应式表单状态见 `./useSystemSettingForm.ts`，4 个页签组件见同目录
 * GeneralPanel / FilePanel / AppearancePanel / BackupPanel。
 */

import { SYSTEM_SETTING_FALLBACK } from '../../../../../../shared/constants/system-defaults'
import type { UiDensity, UiStyle } from '../../../../../../shared/types/system'

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
    // ===== 视觉升级（P0）三项外观配置（系统设置 → 外观）=====
    // 与原 systemSetting.json 同源持久化；主进程 config-schema 白名单校验；
    // 渲染层 useTheme.applyUiAppearance 消费后写根元素 data-style / data-density。
    uiStyle: UiStyle
    uiDensity: UiDensity
    uiReduceTransparency: boolean
    fontFamily: string
    fontSize: number
    enableAutoBackup: boolean
    backupInterval: number
    backupCount: number
    // AS-9（P3 隐私）：允许预览加载文档中的远程图片（默认 false，仅本地图片）
    allowRemoteImages: boolean
    // 可选能力开关（A1/A3/A4/A6/A7/A10）：全部默认关闭，见 shared/constants/feature-flags.ts
    featureTabs: boolean
    featureDocumentHistory: boolean
    featureMarkdownLint: boolean
    featureSpellcheck: boolean
    featureSmartInput: boolean
    featureOutlinePlus: boolean
    // 1.5.2 E6：今日日记 / 快速收件箱（默认关闭，见 shared/constants/feature-flags.ts）
    featureDailyNotes: boolean
    // 1.5.2 E1：剪贴板剪藏（默认关闭，见 shared/constants/feature-flags.ts）
    featureClipCapture: boolean
    // 1.5.2 E2：PDF 标注与摘录（第 9 项，默认关闭，见 shared/constants/feature-flags.ts）
    featurePdfAnnotations: boolean
    // 1.5.2 E3：图片 OCR（第 10 项，默认关闭，见 shared/constants/feature-flags.ts）
    featureImageOcr: boolean
    // 1.5.3：工具对话框非模态（默认开启）
    featureNonModalDialogs: boolean
    // 写作体验（P0，默认全部关闭）
    writingModeEnabled: boolean
    writingTypewriterEnabled: boolean
    writingFocusEnabled: boolean
    writingStatsEnabled: boolean
    writingTypographyEnabled: boolean
    writingSessionRestoreEnabled: boolean
    writingBubbleEnabled: boolean
    writingSlashEnabled: boolean
    writingStyleCheckEnabled: boolean
}

/** 左侧页签（顺序即展示顺序；id 与模板中的 activePanel 判定一一对应） */
export const SYSTEM_SETTING_SIDEBAR_ITEMS = [
    { id: 'general', nameKey: 'dialogRenderer.systemSetting.sidebarGeneral', icon: '⚙️' },
    { id: 'file', nameKey: 'dialogRenderer.systemSetting.sidebarFile', icon: '📁' },
    { id: 'appearance', nameKey: 'dialogRenderer.systemSetting.sidebarAppearance', icon: '🎨' },
    { id: 'features', nameKey: 'dialogRenderer.systemSetting.sidebarFeatures', icon: '🧩' },
    { id: 'writing', nameKey: 'dialogRenderer.systemSetting.sidebarWriting', icon: '✍️' },
    { id: 'backup', nameKey: 'dialogRenderer.systemSetting.sidebarBackup', icon: '💾' }
] as const

/** 侧边栏页签 id（壳层 activePanel 的类型真源，与 4 个 panel 组件一一对应） */
export type SystemSettingPanelId = (typeof SYSTEM_SETTING_SIDEBAR_ITEMS)[number]['id']

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
        // 视觉升级（P0）：默认 workbench + default = 升级前观感；减少透明默认关闭
        uiStyle: SYSTEM_SETTING_FALLBACK.uiStyle,
        uiDensity: SYSTEM_SETTING_FALLBACK.uiDensity,
        uiReduceTransparency: SYSTEM_SETTING_FALLBACK.uiReduceTransparency,
        fontFamily: SYSTEM_SETTING_FALLBACK.fontFamily,
        fontSize: SYSTEM_SETTING_FALLBACK.fontSize,
        enableAutoBackup: SYSTEM_SETTING_FALLBACK.enableAutoBackup,
        backupInterval: SYSTEM_SETTING_FALLBACK.backupInterval,
        backupCount: SYSTEM_SETTING_FALLBACK.backupCount,
        // AS-9（P3 隐私）：安全默认——不加载远程图片
        allowRemoteImages: SYSTEM_SETTING_FALLBACK.allowRemoteImages,
        featureTabs: SYSTEM_SETTING_FALLBACK.featureTabs,
        featureDocumentHistory: SYSTEM_SETTING_FALLBACK.featureDocumentHistory,
        featureMarkdownLint: SYSTEM_SETTING_FALLBACK.featureMarkdownLint,
        featureSpellcheck: SYSTEM_SETTING_FALLBACK.featureSpellcheck,
        featureSmartInput: SYSTEM_SETTING_FALLBACK.featureSmartInput,
        featureOutlinePlus: SYSTEM_SETTING_FALLBACK.featureOutlinePlus,
        featureDailyNotes: SYSTEM_SETTING_FALLBACK.featureDailyNotes,
        featureClipCapture: SYSTEM_SETTING_FALLBACK.featureClipCapture,
        featurePdfAnnotations: SYSTEM_SETTING_FALLBACK.featurePdfAnnotations,
        featureImageOcr: SYSTEM_SETTING_FALLBACK.featureImageOcr,
        featureNonModalDialogs: SYSTEM_SETTING_FALLBACK.featureNonModalDialogs,
        writingModeEnabled: SYSTEM_SETTING_FALLBACK.writingModeEnabled,
        writingTypewriterEnabled: SYSTEM_SETTING_FALLBACK.writingTypewriterEnabled,
        writingFocusEnabled: SYSTEM_SETTING_FALLBACK.writingFocusEnabled,
        writingStatsEnabled: SYSTEM_SETTING_FALLBACK.writingStatsEnabled,
        writingTypographyEnabled: SYSTEM_SETTING_FALLBACK.writingTypographyEnabled,
        writingSessionRestoreEnabled: SYSTEM_SETTING_FALLBACK.writingSessionRestoreEnabled,
        writingBubbleEnabled: SYSTEM_SETTING_FALLBACK.writingBubbleEnabled,
        writingSlashEnabled: SYSTEM_SETTING_FALLBACK.writingSlashEnabled,
        writingStyleCheckEnabled: SYSTEM_SETTING_FALLBACK.writingStyleCheckEnabled
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

/**
 * 脏标记：当前草稿是否与「打开时加载值 / 上次保存值」不同（纯函数，字段级浅比较）。
 *
 * 设置页拆分 P0：草稿状态收敛到 useSystemSettingForm，由它维护 initialSettings；
 * 本函数只做判断，不改变保存/取消行为（对话框当前不展示脏标记 UI，仅作契约测试锚点）。
 */
export function isSystemSettingsDirty(
    current: SystemDialogSettings,
    initial: SystemDialogSettings
): boolean {
    return (Object.keys(initial) as (keyof SystemDialogSettings)[]).some(
        (key) => !Object.is(current[key], initial[key])
    )
}

/**
 * 数值字段的界面输入范围（与 4 个 panel 模板的 min/max 属性一一对应）。
 *
 * 注意：这是「界面可达范围」，不是主进程 AS-4 的强制校验范围——主进程对越界值
 * 钳制/丢弃而非拒绝，因此本表只用于保存前诊断日志（见 validateDialogSettings）。
 */
export const SYSTEM_SETTING_NUMBER_LIMITS = {
    autoSaveInterval: { min: 10, max: 300 },
    recentFilesCount: { min: 5, max: 20 },
    fontSize: { min: 12, max: 20 },
    backupInterval: { min: 1, max: 72 },
    backupCount: { min: 1, max: 10 }
} as const

/** 校验问题项（field 供定位，reason 仅写日志，不作 UI 文案） */
export interface SystemSettingValidationIssue {
    field: keyof SystemDialogSettings
    reason: string
}

/**
 * 保存前校验（纯函数，诊断用）：按界面输入范围与语言下拉枚举检查草稿。
 *
 * 返回空数组表示全部字段在界面可达范围内；非空时 useSystemSettingForm 只记录 warn
 * 日志，**不阻断保存、不修改草稿值**——用户可见行为与拆分前一致（文本框 min/max 仅是
 * 浏览器提示，拆分前越界值同样会提交），强制校验唯一真源仍是主进程 AS-4
 * `config-schema.ts` 的 validateSystemConfig。
 */
export function validateDialogSettings(
    settings: SystemDialogSettings
): SystemSettingValidationIssue[] {
    const issues: SystemSettingValidationIssue[] = []
    for (const [field, limits] of Object.entries(SYSTEM_SETTING_NUMBER_LIMITS) as [
        keyof typeof SYSTEM_SETTING_NUMBER_LIMITS,
        { min: number; max: number }
    ][]) {
        const value = settings[field]
        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < limits.min ||
            value > limits.max
        ) {
            issues.push({
                field,
                reason: `期望 ${limits.min}~${limits.max}，实际 ${String(value)}`
            })
        }
    }
    if (settings.language !== 'zh-CN' && settings.language !== 'en-US') {
        issues.push({ field: 'language', reason: `未知语言选项：${String(settings.language)}` })
    }
    return issues
}
