/**
 * 系统设置管理模块
 * 用于管理系统的各项设置，包括菜单栏样式、自动保存、界面字体等
 *
 * ARC-04/05：系统设置为单一真源——本 store（~/.baizenotes/config/systemSetting.json）
 * 是渲染层 SystemSettingDialog 与 useConfigStore 的唯一持久化后端（经 config:read/write
 * 通道由 config-manager 路由到本模块），旧的裸 JSON system.json 仅作一次性迁移来源。
 *
 * ARC-12：本模块经 theme-config 导出的 createSafeConfigModule 工厂创建
 * （平铺模式：配置直接以字段形式存储在 store 根部），初始化/默认值/更新策略
 * 与 theme/editor/quick-link 三个模块收敛为同一实现。
 */

import Store from 'electron-store'
import * as path from 'path'
import { getUserDataPath } from '../utils/app-paths'
import { createSafeConfigModule } from './theme-config'
// ARC-13：SystemSetting 已收敛到 src/shared/types/system.ts（唯一真源）
import type { SystemSetting } from '../../shared/types'
// AS-4：字体族/字号渲染兜底（即便存储中被写入非法值，也不得拼进 CSS 造成注入）
import { clampFontSize, DEFAULT_FONT_FAMILY, sanitizeFontFamily } from './config-schema'
// 最近文件列表数量：把本 store 的 recentFilesCount 注入 file-state-store 的保留条数提供者
// （file-state-store 是叶子模块，不能反向 import 本模块，故采用注入方向）
import { setRecentFilesLimitProvider } from '../utils/file-state-store'
import { clampRecentFilesLimit } from '../../shared/constants/recent-files'
// 1.5.7 LLM Wiki L1：工作区模式默认值单一真源（shared 常量）
import { DEFAULT_WORKSPACE_MODE } from '../../shared/constants/workspace-mode'

// D-6/FUN-11：Store 读取损坏时备份原文件并重建默认值
const systemSettingDefaults: SystemSetting = {
    language: 'zh-cn',
    resourceManager: 'default',
    editorModel: 'default',
    pluginOpen: 'browser',
    menuBarStyle: 'electron',
    // 2026-11-20（用户需求）：自动保存默认关闭（opt-in）——软件打开后不启用自动保存，
    // 用户需在系统设置中自行开启；避免用户未察觉的定时写盘。升级用户已存的 true 值保留
    //（由下方一次性迁移处理旧默认 true 的存量数据，见 migrateLegacyOptInSettings）。
    autoSaveEnabled: false,
    autoSaveInterval: 60,
    fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif',
    fontSize: 13,
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
    renderWhitespace: 'all',
    // ARC-04：渲染层扩展字段默认值（与原 SystemSettingDialog 的 initialSettings 一致）
    autoOpenLastFile: false,
    autoOpenLastFolder: false,
    autoStart: false,
    // P2-10：默认关闭（opt-in）——存量用户「关闭即退出」语义不突变（Windows 溢出区
    // 托盘图标易被隐藏导致找不到退出入口）；用户显式开启后才隐藏到托盘。
    // 升级用户已存的 true 值保留（不迁移，仅影响新默认值）。
    minimizeToTray: false,
    rememberWindowSize: true,
    // 「记住窗口位置和大小」：上次关闭时的窗口边界（主进程写入；null 表示尚未记录）
    windowBounds: null,
    defaultFilePath: '',
    recentFilesCount: 10,
    // P2 死配置字段清理：`checkUpdateOnStart` 已移除——全仓无任何消费方（无设置 UI
    // 入口、启动流程不检查更新，「帮助 → 检查更新」是独立手动入口）；历史持久化的
    // 旧值由下方 cleanupDeprecatedSystemSettings() 幂等清理，读取路径不再返回该键。
    // P2-11：默认关闭（opt-in）——升级不静默把工作区全部 .md（含未保存修改）明文
    // 复制到备份目录（隐私面 + 磁盘占用）；用户显式开启后才启动自动备份定时器。
    // 升级用户已存的 true 值保留（不迁移，仅影响新默认值）。
    enableAutoBackup: false,
    backupInterval: 24,
    backupCount: 5,
    appTheme: 'baize',
    useSystemTheme: false,
    // 视觉升级（P0）：界面风格 / 界面密度 / 减少透明效果。
    // 默认 workbench + default 与升级前观感完全一致（默认观感零变化是硬约束）；
    // 真源同 shared/constants/system-defaults.ts 的 SYSTEM_SETTING_FALLBACK（两处必须一致）。
    uiStyle: 'workbench',
    uiDensity: 'default',
    uiReduceTransparency: false,
    // 1.5.7 LLM Wiki L1：工作区模式（默认 traditional = 对既有工作区零影响；
    // llm-wiki 由用户在系统设置「功能」页签显式选择后，主进程启用 raw/ 只读写入守卫）。
    // 默认值真源：shared/constants/workspace-mode.ts 的 DEFAULT_WORKSPACE_MODE。
    workspaceMode: DEFAULT_WORKSPACE_MODE,
    // 1.5.7 LLM Wiki L2：MCP 只读桥启用偏好（默认关闭 = 不监听任何端口）。
    // 仅记录用户上次显式启用的偏好：Bearer token 不落盘，服务不跨重启自动启动，
    // 应用启动时由 ipc/mcp-ipc.ts 的 reconcile 逻辑回落 false 并记审计日志。
    mcpEnabled: false,
    // 1.5.7 体验升级批次 C：MCP 首选端口（null = 自动选择，优先 3847；1~65535 为固定端口）。
    // 仅记录端口偏好（跨重启保留）；非法历史值在启动 reconcile 时回落 null。
    mcpPort: null,
    // AS-9（P3 隐私）：默认不自动加载 Markdown 预览中的远程图片（防跟踪像素/IP 泄露）。
    // 写入路径：渲染层 SystemSettingDialog → config:write('system') → 本模块，
    // 读取方：MarkdownPreviewComponent（经 config:read('system') 与 SYSTEM_SETTING_UPDATE 广播）。
    allowRemoteImages: false,
    // 2026-11-21（用户选定）：可选能力全部 opt-in、默认关闭；A2/A8/A9 为默认能力不在此列。
    featureTabs: false,
    featureDocumentHistory: false,
    featureMarkdownLint: false,
    featureSpellcheck: false,
    featureSmartInput: false,
    featureOutlinePlus: false,
    // 1.5.2 E6：今日日记 / 快速收件箱（默认关闭；工具菜单/命令面板入口按开关注册）
    featureDailyNotes: false,
    // 1.5.2 E1：剪贴板剪藏（默认关闭；工具菜单/命令面板入口按开关注册，关闭时不读剪贴板）
    featureClipCapture: false,
    // 1.5.2 E2：PDF 标注与摘录（第 9 项，默认关闭；关闭时 PDF 预览零行为变化）
    featurePdfAnnotations: false,
    // 1.5.2 E3：图片 OCR（第 10 项，默认关闭；关闭时不加载 worker、不下载语言包）
    featureImageOcr: false,
    // 1.5.3：插入/编辑工具对话框非模态（默认开启，可在系统设置关闭）
    featureNonModalDialogs: true,
    // 写作体验（P0）全部 opt-in、默认关闭
    writingModeEnabled: false,
    writingTypewriterEnabled: false,
    writingFocusEnabled: false,
    writingStatsEnabled: false,
    writingTypographyEnabled: false,
    writingSessionRestoreEnabled: false,
    writingBubbleEnabled: false,
    writingSlashEnabled: false,
    writingStyleCheckEnabled: false
    // 注意：settingsSchemaVersion 刻意不放入 defaults——electron-store 构造时会把
    // defaults 合并写入存储，若默认写入 2 则旧用户数据无法区分（迁移永远跳过）。
    // 该键仅在 migrateLegacyOptInSettings 迁移完成时写入（原始 store 无此键 = 旧数据）。
}

/** 当前系统设置结构版本（迁移判断用） */
export const SYSTEM_SETTINGS_SCHEMA_VERSION = 3

// ARC-12：平铺模式（不传 storageKey），并保持"模块加载即建 store"的历史行为
// （system-setting.test.ts 断言模块导入后 store 实例已存在）。
const systemSettingModule = createSafeConfigModule<SystemSetting>({
    name: 'systemSetting',
    filePath: path.join(getUserDataPath(), 'config', 'systemSetting.json'),
    defaults: systemSettingDefaults
})

const systemSettingStore: Store<SystemSetting> = systemSettingModule.getStore()

// 「最近文件列表数量」：file-state-store 写入/裁剪最近文件列表时按此设置截断。
// 提供者在模块加载时注册一次，读取走惰性 getConfig()（每次调用取最新值，
// 设置变更后立即生效，无需重新注册）。
setRecentFilesLimitProvider(() =>
    clampRecentFilesLimit(systemSettingModule.getConfig().recentFilesCount)
)

/**
 * 保存系统设置（部分更新）
 * ARC-12：逐字段遍历替代 25 个 if 分支——只写入非 undefined 的字段，
 * 并补齐历史上缺失的 renderWhitespace 分支与 ARC-04 渲染层扩展字段。
 */
export function saveSystemSetting(setting: Partial<SystemSetting>): void {
    systemSettingModule.updateConfig(setting)
}

export function getSystemSetting(): SystemSetting {
    return systemSettingModule.getConfig()
}

/**
 * 一次性迁移（1.3.6+）：修复「关闭窗口后进程仍在后台」的存量数据根因。
 *
 * 背景：1.3.1~1.3.5 期间 minimizeToTray / enableAutoBackup 默认为 true，
 * 用户只要在系统设置里点过一次「应用」，true 就会落盘。1.3.6 已把两项默认改为
 * false（opt-in），但存量 true 值仍会让「关闭窗口」退化为「隐藏到托盘」——
 * 用户以为已退出，任务管理器里却还有 electron 进程（Windows 托盘图标又可能在
 * 任务栏溢出区，难以找到退出入口）。
 *
 * 迁移策略：无 settingsSchemaVersion 标记的旧数据（< 2），把这两个开关重置为
 * false 并写入版本标记，只执行一次；用户确需托盘/自动备份可在系统设置中重新开启
 * （此后版本标记已存在，不会再被迁移覆盖）。
 *
 * 注意：判断必须读**原始 store**（systemSettingStore.get），不能用 getSystemSetting()——
 * 后者会按默认值补齐缺失键，永远返回 settingsSchemaVersion: 2。
 * @returns 是否执行了迁移
 */
export function migrateLegacyOptInSettings(): boolean {
    const storedVersion = systemSettingStore.get('settingsSchemaVersion')
    if (typeof storedVersion === 'number' && storedVersion >= SYSTEM_SETTINGS_SCHEMA_VERSION) {
        return false
    }
    const legacyVersion = typeof storedVersion === 'number' ? storedVersion : 0
    const patch: Partial<SystemSetting> = {
        // v3（2026-11-20）：自动保存默认关闭——旧版本默认 true 的存量值一并重置为 false，
        // 用户之后在系统设置中开启（版本标记已存在，不会被再次迁移覆盖）。
        autoSaveEnabled: false,
        settingsSchemaVersion: SYSTEM_SETTINGS_SCHEMA_VERSION
    }
    // v2（1.3.6）：旧默认 true 的托盘/自动备份只对「无版本标记」的旧数据重置，
    // 避免二次迁移覆盖用户重新开启的值。
    if (legacyVersion < 2) {
        patch.minimizeToTray = false
        patch.enableAutoBackup = false
    }
    systemSettingModule.updateConfig(patch)
    return true
}

/**
 * P2 死配置字段清理：历史版本持久化的 `checkUpdateOnStart` 字段无任何消费方
 * （无设置 UI 入口、启动时不检查更新；「帮助 → 检查更新」是独立手动入口），
 * 已从 SystemSetting 类型 / 默认值 / config-schema 白名单中移除。
 *
 * 读取侧：getConfig() 只按 defaults 的键合并，旧键不会进入 getSystemSetting() 结果；
 * 写入侧：saveSystemSetting 只写传入字段，不会再把该键写回。本函数负责把残留在磁盘
 * store 中的旧键删除，避免配置文件长期保留无效字段。幂等、不抛异常，**不改变
 * settingsSchemaVersion**（该标记只用于 opt-in 默认值迁移，字段清理不强制升版）。
 * @returns 是否删除了残留字段
 */
export function cleanupDeprecatedSystemSettings(): boolean {
    // 该键已不在 SystemSetting 类型中，electron-store 的键参数按 keyof T 约束，需显式收窄
    const staleKey = 'checkUpdateOnStart' as never
    if (!systemSettingStore.has(staleKey)) {
        return false
    }
    systemSettingStore.delete(staleKey)
    return true
}

export function getSystemSettingValString(key: string, defaultVal: string): string {
    const value = systemSettingStore.get(key as keyof SystemSetting)
    return typeof value === 'string' ? value : defaultVal
}

/**
 * ARC-04：组装界面字体 CSS（与 main/index.ts 启动时注入保持一致），
 * 系统设置变更后由 config-manager 调用重新注入，实现字体设置即时生效。
 *
 * AS-4：fontFamily 经 sanitizeFontFamily 白名单字符集过滤、fontSize 钳制到安全范围——
 * 防止历史持久化的恶意字符串（`x; } body { ... }`）在这里被拼进 CSS 造成注入。
 */
export function buildFontCss(setting: SystemSetting): string {
    const fontFamily = sanitizeFontFamily(setting.fontFamily) ?? DEFAULT_FONT_FAMILY
    const fontSize = clampFontSize(setting.fontSize)
    return [
        'body, .title-bar, .menu-bar, .menu-label, .menu-item-label,',
        ' .workspace-area, .status-bar, .navi-tab, .resource-manager,',
        ' .md-edit-tools, .md-preview, .resizer-md, .resizer-main, #file-bar',
        ` { font-family: ${fontFamily} !important;`,
        ` font-size: ${fontSize}px !important; }`
    ].join('')
}
