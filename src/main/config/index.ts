/**
 * 配置文件模块导出
 */
export { configManager, registerConfigIpcHandlers } from './config-manager'

export type { ThemeType, MonacoThemeType, ThemeStyles, ThemeConfig } from './theme-config'
export {
    themes,
    getAllThemes,
    getCurrentTheme,
    getCurrentThemeStyles,
    getThemeStylesByType,
    setTheme,
    getAllMonacoThemes,
    getSeparateEditorTheme,
    setSeparateEditorTheme,
    getMonacoTheme,
    setMonacoTheme
} from './theme-config'

export { getMonacoThemeData, warmupMonacoThemeCache } from './theme-registry'
export type { MonacoThemeConfig } from './theme-registry'

export {
    getSystemSetting,
    saveSystemSetting,
    getSystemSettingValString,
    buildFontCss,
    migrateLegacyOptInSettings,
    SYSTEM_SETTINGS_SCHEMA_VERSION
} from './system-setting'

export {
    getEditorSetting,
    saveEditorSetting,
    getDefaultEditorSetting,
    resetEditorSetting
} from './editor-setting'

export { getQuickLinks, saveQuickLinks, resetToDefault } from './quick-link-config'

// 结构优化 1.1（H1）：移除 ipcListenerManager 的转发导出——config 聚合入口不再引用
// src/main/ipc/**，需要该单例的调用方请直接 import '../ipc/ipc-listener-manager'
// （当前仓内 src 侧无任何经 config 取 ipcListenerManager 的引用）。

export { RegisterShortKeys } from './short-key-register'

export { windowManager } from './window-manager'
