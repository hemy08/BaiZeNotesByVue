/**
 * utils 侧配置读取提供者（结构优化第 1 批 1.1 / H1：消除 utils → config 反向依赖）
 *
 * ## 背景
 * 历史上 `src/main/utils/**` 直接静态 import `src/main/config/**`
 * （auto-backup / i18n / path-utils 取 getSystemSetting，utils.ts 取 getQuickLinks 与主题 API），
 * 与 config → utils（如 system-setting 向 file-state-store 注入读取器）构成双向依赖边，
 * 只能靠注释约定约束。本模块把该方向翻转为「依赖倒置」：
 *
 * - utils 侧只依赖本「提供者」叶子模块（仅 import shared 类型与兜底常量）；
 * - 真实读取实现由主进程入口 `src/main/index.ts` 在启动早期（注册 IPC / whenReady 之前）
 *   经 `set*Provider` 注入 config 模块的函数；
 * - 未注入时（单测直接 import utils、或入口初始化顺序异常）回退到安全默认值，保证不崩溃。
 *
 * ## 行为保持
 * - provider 抛异常时**不**在本模块吞掉，异常原样传给调用方——与改造前 utils 直接调用
 *   config 函数时的传播语义一致（i18n / path-utils 各自的 try/catch 仍按原样兜底）；
 * - 注入后的读取时机不变：每次调用都经 provider 实时读取，设置变更后立即生效
 *   （与改造前直接调用 getSystemSetting 一致，无缓存）。
 *
 * ## 边界
 * 本文件是叶子模块：禁止 import `../config`、`../ipc` 或任何 utils 业务模块
 * （由 tests/architecture/dependency-boundaries.test.ts 守护）。
 */
import { SYSTEM_SETTING_FALLBACK } from '../../shared/constants/system-defaults'
import type {
    MonacoThemeListItem,
    QuickLinkItem,
    SystemSetting,
    ThemeListResult,
    ThemeStyles,
    ThemeType
} from '../../shared/types'

/** 系统设置读取器（注入真源：`config/system-setting.getSystemSetting`） */
export type SystemSettingProvider = () => SystemSetting

/** 快速链接读取器（注入真源：`config/quick-link-config.getQuickLinks`） */
export type QuickLinksProvider = () => QuickLinkItem[]

/** 主题读取 API（注入真源：`config/theme-config` 的四个读取函数） */
export interface ThemeApiProvider {
    /** 当前应用主题样式 */
    getCurrentThemeStyles: () => ThemeStyles
    /** 全部应用主题列表（IPC.THEME.GET_ALL_THEMES 返回结构） */
    getAllThemes: () => ThemeListResult
    /** 全部 Monaco 主题列表 */
    getAllMonacoThemes: () => MonacoThemeListItem[]
    /** 指定应用主题的样式 */
    getThemeStylesByType: (themeType: ThemeType) => ThemeStyles
}

/* ============================================================================
 * 系统设置
 * ========================================================================== */

let systemSettingProvider: SystemSettingProvider | null = null

/**
 * 注入系统设置读取实现（由 `src/main/index.ts` 启动早期调用，传入 config 的 getSystemSetting）。
 * 传 null/undefined 或非函数时视为未注入，回退 shared 兜底常量。
 */
export function setSystemSettingProvider(provider: SystemSettingProvider | null | undefined): void {
    systemSettingProvider = typeof provider === 'function' ? provider : null
}

/**
 * 读取系统设置：已注入 → 实时调用真实实现（异常原样抛出，由调用方按原语义兜底）；
 * 未注入 → 返回 `shared/constants/system-defaults.SYSTEM_SETTING_FALLBACK`
 * （与主进程 systemSettingDefaults 完全一致的安全默认值）。
 */
export function getSystemSettingFromProvider(): SystemSetting {
    return systemSettingProvider ? systemSettingProvider() : SYSTEM_SETTING_FALLBACK
}

/* ============================================================================
 * 快速链接
 * ========================================================================== */

let quickLinksProvider: QuickLinksProvider | null = null

/** 注入快速链接读取实现（由 `src/main/index.ts` 启动早期调用） */
export function setQuickLinksProvider(provider: QuickLinksProvider | null | undefined): void {
    quickLinksProvider = typeof provider === 'function' ? provider : null
}

/** 读取快速链接：未注入时返回空列表（不崩溃，仅 IPC 返回空） */
export function getQuickLinksFromProvider(): QuickLinkItem[] {
    return quickLinksProvider ? quickLinksProvider() : []
}

/* ============================================================================
 * 最近文件夹写入（P1-1 工作区受信根来源收敛）
 * ========================================================================== */

/** 最近文件夹写入器（注入真源：`config/config-manager.recordRecentFolder`） */
export type RecentFolderRecorderProvider = (folderPath: string) => Promise<void> | void

let recentFolderRecorderProvider: RecentFolderRecorderProvider | null = null

/**
 * 注入最近文件夹写入实现（由 `src/main/index.ts` 启动早期调用）。
 *
 * 背景：`recent-folders` 在 P1-1 后为主进程专属配置，渲染层无权写入。目录选择对话框
 * 位于 utils 层（file-operations.OpenDirectory），不能静态 import config 层
 * （utils → config 反向依赖门禁），因此写入能力经本 provider 由入口注入。
 */
export function setRecentFolderRecorderProvider(
    provider: RecentFolderRecorderProvider | null | undefined
): void {
    recentFolderRecorderProvider = typeof provider === 'function' ? provider : null
}

/**
 * 调用最近文件夹写入器：未注入时为空操作（单测/初始化顺序异常时不崩溃）。
 * 异常不在此吞掉——调用方（OpenDirectory）按既有容错语义自行 catch + 记日志。
 */
export async function recordRecentFolderFromProvider(folderPath: string): Promise<void> {
    if (!recentFolderRecorderProvider) {
        return
    }
    await recentFolderRecorderProvider(folderPath)
}

/* ============================================================================
 * 主题 API
 * ========================================================================== */

/**
 * 未注入时的主题样式安全占位：中性浅色、固定值，不依赖 config 的主题注册表。
 * 真实运行态一定由 main/index.ts 注入 config/theme-config 的实现，本占位仅防未注入崩溃。
 */
const FALLBACK_THEME_STYLES: ThemeStyles = {
    name: 'Baize',
    description: '主题 API 未注入时的安全占位样式',
    titleBarGradient: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
    backgroundColor: '#ffffff',
    cardBackground: '#ffffff',
    textColor: '#2d2d2d',
    secondaryTextColor: '#666666',
    borderColor: '#e0e0e0',
    accentColor: '#764ba2',
    buttonBackground: '#764ba2',
    buttonTextColor: '#ffffff',
    hoverBackground: '#f0f0f0'
}

/** 未注入时的主题 API 安全默认实现（空列表 / 占位样式） */
const FALLBACK_THEME_API: ThemeApiProvider = {
    getCurrentThemeStyles: () => FALLBACK_THEME_STYLES,
    getAllThemes: () => [],
    getAllMonacoThemes: () => [],
    getThemeStylesByType: () => FALLBACK_THEME_STYLES
}

let themeApiProvider: ThemeApiProvider = FALLBACK_THEME_API

/**
 * 注入主题读取 API（由 `src/main/index.ts` 启动早期调用）。
 * 支持部分注入：未提供的成员（含测试 mock 缺字段导致的 undefined）回退安全默认实现，
 * 避免把 undefined 当函数调用导致 IPC 崩溃。
 */
export function setThemeApiProvider(provider: Partial<ThemeApiProvider> | null | undefined): void {
    if (!provider) {
        themeApiProvider = FALLBACK_THEME_API
        return
    }
    themeApiProvider = {
        getCurrentThemeStyles:
            typeof provider.getCurrentThemeStyles === 'function'
                ? provider.getCurrentThemeStyles
                : FALLBACK_THEME_API.getCurrentThemeStyles,
        getAllThemes:
            typeof provider.getAllThemes === 'function'
                ? provider.getAllThemes
                : FALLBACK_THEME_API.getAllThemes,
        getAllMonacoThemes:
            typeof provider.getAllMonacoThemes === 'function'
                ? provider.getAllMonacoThemes
                : FALLBACK_THEME_API.getAllMonacoThemes,
        getThemeStylesByType:
            typeof provider.getThemeStylesByType === 'function'
                ? provider.getThemeStylesByType
                : FALLBACK_THEME_API.getThemeStylesByType
    }
}

/** 读取主题 API：未注入时返回安全默认实现（空列表 / 占位样式） */
export function getThemeApiFromProvider(): ThemeApiProvider {
    return themeApiProvider
}
