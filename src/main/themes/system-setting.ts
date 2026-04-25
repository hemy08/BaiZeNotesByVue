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
        menuBarStyle: 'electron', // 默认使用Electron样式
        autoSaveEnabled: true, // 默认启用自动保存
        autoSaveInterval: 60, // 默认60秒
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif', // 默认系统字体
        fontSize: 13 // 默认13px
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
    if (setting.autoSaveEnabled !== undefined) {
        systemSettingStore.set('autoSaveEnabled', setting.autoSaveEnabled)
    }
    if (setting.autoSaveInterval !== undefined) {
        systemSettingStore.set('autoSaveInterval', setting.autoSaveInterval)
    }
    if (setting.fontFamily !== undefined) {
        systemSettingStore.set('fontFamily', setting.fontFamily)
    }
    if (setting.fontSize !== undefined) {
        systemSettingStore.set('fontSize', setting.fontSize)
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
        menuBarStyle: systemSettingStore.get('menuBarStyle', 'electron'),
        autoSaveEnabled: systemSettingStore.get('autoSaveEnabled', true),
        autoSaveInterval: systemSettingStore.get('autoSaveInterval', 60),
        fontFamily: systemSettingStore.get('fontFamily', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif'),
        fontSize: systemSettingStore.get('fontSize', 13)
    }
}

