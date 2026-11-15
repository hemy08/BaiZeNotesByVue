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

// D-6/FUN-11：Store 读取损坏时备份原文件并重建默认值
const systemSettingDefaults: SystemSetting = {
    language: 'zh-cn',
    resourceManager: 'default',
    editorModel: 'default',
    pluginOpen: 'browser',
    menuBarStyle: 'electron',
    autoSaveEnabled: true,
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
    minimizeToTray: true,
    rememberWindowSize: true,
    defaultFilePath: '',
    recentFilesCount: 10,
    checkUpdateOnStart: true,
    enableAutoBackup: true,
    backupInterval: 24,
    backupCount: 5,
    appTheme: 'baize',
    useSystemTheme: false,
    // AS-9（P3 隐私）：默认不自动加载 Markdown 预览中的远程图片（防跟踪像素/IP 泄露）。
    // 写入路径：渲染层 SystemSettingDialog → config:write('system') → 本模块，
    // 读取方：MarkdownPreviewComponent（经 config:read('system') 与 SYSTEM_SETTING_UPDATE 广播）。
    allowRemoteImages: false
}

// ARC-12：平铺模式（不传 storageKey），并保持"模块加载即建 store"的历史行为
// （system-setting.test.ts 断言模块导入后 store 实例已存在）。
const systemSettingModule = createSafeConfigModule<SystemSetting>({
    name: 'systemSetting',
    filePath: path.join(getUserDataPath(), 'config', 'systemSetting.json'),
    defaults: systemSettingDefaults
})

const systemSettingStore: Store<SystemSetting> = systemSettingModule.getStore()

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
