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
        autoSaveInterval: 10, // 默认10秒
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
        autoSaveInterval: systemSettingStore.get('autoSaveInterval', 60),
        fontFamily: systemSettingStore.get('fontFamily', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif'),
        fontSize: systemSettingStore.get('fontSize', 13)
    }
}

