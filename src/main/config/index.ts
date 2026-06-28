/**
 * 配置文件模块导出
 */
export {
    configManager,
    registerConfigIpcHandlers
} from './config-manager'

// NOTE: default-configs.ts 已废弃，各配置模块有各自的硬编码默认值

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

export { getMonacoThemeData } from './theme-registry'
export type { MonacoThemeConfig } from './theme-registry'

export {
    getSystemSetting,
    saveSystemSetting,
    getSystemSettingValString
} from './system-setting'

export {
    getEditorSetting,
    saveEditorSetting,
    getDefaultEditorSetting,
    resetEditorSetting
} from './editor-setting'

export {
    getQuickLinks,
    saveQuickLinks,
    resetToDefault
} from './quick-link-config'

export { ipcListenerManager } from '../ipc/ipc-listener-manager'

export {
    RegisterShortKeys
} from './short-key-register'

export { windowManager } from './window-manager'
