/**
 * 系统设置默认值（渲染层兜底常量）。
 *
 * 真源：主进程 `src/main/config/system-setting.ts` 的 `systemSettingDefaults`
 * （electron-store 的 defaults，持久化文件 ~/.baizenotes/config/systemSetting.json）。
 * 本常量只用于渲染层读取失败 / 字段缺失时的兜底展示与提交，不参与主进程初始化，
 * 也不改变主进程行为。
 *
 * 注意：主进程未改为引用本常量（避免主进程 ↔ shared 的额外构建依赖与循环依赖风险），
 * 因此**新增 / 修改系统设置默认值时必须同步修改两处**：
 * - `src/main/config/system-setting.ts` 的 `systemSettingDefaults`
 * - 本文件的 `SYSTEM_SETTING_FALLBACK`
 * 两处数值必须完全一致。
 *
 * 同步排除项：`settingsSchemaVersion` 是「迁移标记」而非默认值——主进程刻意不把它
 * 写入 defaults（否则旧用户数据无法与迁移后数据区分），本常量同样不包含该字段。
 */
import type { SystemSetting } from '../types/system'

/**
 * 系统默认值类型：SystemSetting 去掉迁移标记后的「全字段必有值」版本，
 * 供渲染层在字段缺失时安全回退（可选扩展字段也必有值）。
 */
export type SystemSettingFallback = Required<Omit<SystemSetting, 'settingsSchemaVersion'>>

/**
 * 与主进程 `systemSettingDefaults` 完全一致的系统设置默认值（渲染层兜底）。
 *
 * 与主进程默认值的对应关系（易错项，修改时注意）：
 * - `minimizeToTray: false` / `enableAutoBackup: false`：P2-10 / P2-11 起为 opt-in 默认关闭；
 * - `autoSaveInterval: 60`（秒）、`fontSize: 13`（px）、`language: 'zh-cn'`（主进程小写值，
 *   渲染层下拉自行归一化为 'zh-CN' / 'en-US'）；
 * - `fontFamily` 为系统字体栈（Windows 下命中 Microsoft YaHei），非固定 Arial。
 */
export const SYSTEM_SETTING_FALLBACK: SystemSettingFallback = {
    language: 'zh-cn',
    resourceManager: 'default',
    editorModel: 'default',
    pluginOpen: 'browser',
    menuBarStyle: 'electron',
    // 2026-11-20（用户需求）：自动保存默认关闭（opt-in），需用户在系统设置中自行开启
    autoSaveEnabled: false,
    autoSaveInterval: 60,
    fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif',
    fontSize: 13,
    renderWhitespace: 'all',
    // 各模态对话框开关默认非模态（false）
    editorSettingModal: false,
    systemSettingModal: false,
    themeSettingModal: false,
    helpAboutModal: false,
    helpContactUsModal: false,
    insertImageModal: false,
    admonitionsModal: false,
    fontSelectModal: false,
    mathTextModal: false,
    mdSheetModal: false,
    importOptionModal: false,
    mermaidEditModal: false,
    quickLinkSettingModal: false,
    techStackModal: false,
    webUrlModal: false,
    // 渲染层扩展字段（ARC-04）
    autoOpenLastFile: false,
    autoOpenLastFolder: false,
    autoStart: false,
    minimizeToTray: false,
    rememberWindowSize: true,
    windowBounds: null,
    defaultFilePath: '',
    recentFilesCount: 10,
    enableAutoBackup: false,
    backupInterval: 24,
    backupCount: 5,
    appTheme: 'baize',
    useSystemTheme: false,
    allowRemoteImages: false,
    // 可选能力（2026-11-21 用户选定）：全部 opt-in、默认关闭
    featureTabs: false,
    featureDocumentHistory: false,
    featureMarkdownLint: false,
    featureSpellcheck: false,
    featureSmartInput: false,
    featureOutlinePlus: false,
    // 写作体验（P0）默认全部关闭
    writingModeEnabled: false,
    writingTypewriterEnabled: false,
    writingFocusEnabled: false,
    writingStatsEnabled: false,
    writingTypographyEnabled: false,
    writingSessionRestoreEnabled: false,
    writingBubbleEnabled: false,
    writingSlashEnabled: false,
    writingStyleCheckEnabled: false,
    writingSmartInputEnabled: false
}
