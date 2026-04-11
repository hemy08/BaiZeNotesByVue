/**
 * 系统设置管理模块
 * 用于管理系统的各项设置，包括菜单栏样式等
 */

// @ts-ignore
import Store from 'electron-store'
import {SystemSetting} from '../global-types';

// 创建系统设置存储实例
const systemSettingStore = new Store<SystemSetting>({
    name: 'systemSetting',
    defaults: {
        language: 'zh-cn',
        resourceManager: 'default',
        editorModel: 'default',
        pluginOpen: 'browser',
        menuBarStyle: 'electron' // 默认使用Electron样式
    }
})

/**
 * 保存系统设置
 */
export function saveSystemSetting(setting: Partial<SystemSetting>): void {
    if (setting.language !== undefined) {
        systemSettingStore.set('language', setting.language)
    }
    if (setting.resourceManager !== undefined) {
        systemSettingStore.set('resourceManager', setting.resourceManager)
    }
    if (setting.editorModel !== undefined) {
        systemSettingStore.set('editorModel', setting.editorModel)
    }
    if (setting.pluginOpen !== undefined) {
        systemSettingStore.set('pluginOpen', setting.pluginOpen)
    }
    if (setting.menuBarStyle !== undefined) {
        systemSettingStore.set('menuBarStyle', setting.menuBarStyle)
    }
}

/**
 * 获取系统设置
 */
export function getSystemSetting(): SystemSetting {
    return {
        language: systemSettingStore.get('language', 'zh-cn'),
        resourceManager: systemSettingStore.get('resourceManager', 'default'),
        editorModel: systemSettingStore.get('editorModel', 'default'),
        pluginOpen: systemSettingStore.get('pluginOpen', 'browser'),
        menuBarStyle: systemSettingStore.get('menuBarStyle', 'electron')
    }
}

/**
 * 获取菜单栏样式
 */
export function getMenuBarStyle(): string {
    return systemSettingStore.get('menuBarStyle', 'electron')
}

/**
 * 设置菜单栏样式
 */
export function setMenuBarStyle(style: string): void {
    systemSettingStore.set('menuBarStyle', style)
}

/**
 * 获取语言设置
 */
export function getLanguage(): string {
    return systemSettingStore.get('language', 'zh-cn')
}

/**
 * 设置语言
 */
export function setLanguage(language: string): void {
    systemSettingStore.set('language', language)
}

/**
 * 获取资源管理器设置
 */
export function getResourceManager(): string {
    return systemSettingStore.get('resourceManager', 'default')
}

/**
 * 设置资源管理器
 */
export function setResourceManager(setting: string): void {
    systemSettingStore.set('resourceManager', setting)
}

/**
 * 获取编辑器视图模式
 */
export function getEditorModel(): string {
    return systemSettingStore.get('editorModel', 'default')
}

/**
 * 设置编辑器视图模式
 */
export function setEditorModel(model: string): void {
    systemSettingStore.set('editorModel', model)
}

/**
 * 获取插件打开方式
 */
export function getPluginOpen(): string {
    return systemSettingStore.get('pluginOpen', 'browser')
}

/**
 * 设置插件打开方式
 */
export function setPluginOpen(mode: string): void {
    systemSettingStore.set('pluginOpen', mode)
}
