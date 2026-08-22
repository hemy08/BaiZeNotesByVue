/**
 * 系统设置管理模块
 * 用于管理系统的各项设置，包括菜单栏样式等
 */

// @ts-ignore
import { createStore } from '../utils/store-factory'
import {SystemSetting} from '../global-types'

const systemSettingStore = createStore<SystemSetting>('systemSetting', {
        language: 'zh-cn',
        resourceManager: 'default',
        editorModel: 'default',
        pluginOpen: 'browser',
        menuBarStyle: 'electron',
        autoSaveEnabled: true,
        autoSaveInterval: 60,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif',
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
    })

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
    if (setting.editorSettingModal !== undefined) {
        systemSettingStore.set('editorSettingModal', setting.editorSettingModal)
    }
    if (setting.systemSettingModal !== undefined) {
        systemSettingStore.set('systemSettingModal', setting.systemSettingModal)
    }
    if (setting.themeSettingModal !== undefined) {
        systemSettingStore.set('themeSettingModal', setting.themeSettingModal)
    }
    if (setting.helpAboutModal !== undefined) {
        systemSettingStore.set('helpAboutModal', setting.helpAboutModal)
    }
    if (setting.helpContactUsModal !== undefined) {
        systemSettingStore.set('helpContactUsModal', setting.helpContactUsModal)
    }
    if (setting.insertImageModal !== undefined) {
        systemSettingStore.set('insertImageModal', setting.insertImageModal)
    }
    if (setting.admonitionsModal !== undefined) {
        systemSettingStore.set('admonitionsModal', setting.admonitionsModal)
    }
    if (setting.fontSelectModal !== undefined) {
        systemSettingStore.set('fontSelectModal', setting.fontSelectModal)
    }
    if (setting.mathTextModal !== undefined) {
        systemSettingStore.set('mathTextModal', setting.mathTextModal)
    }
    if (setting.mdSheetModal !== undefined) {
        systemSettingStore.set('mdSheetModal', setting.mdSheetModal)
    }
    if (setting.importOptionModal !== undefined) {
        systemSettingStore.set('importOptionModal', setting.importOptionModal)
    }
    if (setting.mermaidEditModal !== undefined) {
        systemSettingStore.set('mermaidEditModal', setting.mermaidEditModal)
    }
    if (setting.quickLinkSettingModal !== undefined) {
        systemSettingStore.set('quickLinkSettingModal', setting.quickLinkSettingModal)
    }
    if (setting.techStackModal !== undefined) {
        systemSettingStore.set('techStackModal', setting.techStackModal)
    }
    if (setting.webUrlModal !== undefined) {
        systemSettingStore.set('webUrlModal', setting.webUrlModal)
    }
}

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
        fontSize: systemSettingStore.get('fontSize', 13),
        editorSettingModal: systemSettingStore.get('editorSettingModal', false),
        systemSettingModal: systemSettingStore.get('systemSettingModal', false),
        themeSettingModal: systemSettingStore.get('themeSettingModal', false),
        helpAboutModal: systemSettingStore.get('helpAboutModal', false),
        helpContactUsModal: systemSettingStore.get('helpContactUsModal', false),
        insertImageModal: systemSettingStore.get('insertImageModal', false),
        admonitionsModal: systemSettingStore.get('admonitionsModal', false),
        fontSelectModal: systemSettingStore.get('fontSelectModal', false),
        mathTextModal: systemSettingStore.get('mathTextModal', false),
        mdSheetModal: systemSettingStore.get('mdSheetModal', false),
        importOptionModal: systemSettingStore.get('importOptionModal', false),
        mermaidEditModal: systemSettingStore.get('mermaidEditModal', false),
        quickLinkSettingModal: systemSettingStore.get('quickLinkSettingModal', false),
        techStackModal: systemSettingStore.get('techStackModal', false),
        webUrlModal: systemSettingStore.get('webUrlModal', false),
        renderWhitespace: systemSettingStore.get('renderWhitespace', 'none'),
    }
}

export function getSystemSettingValString(key: string, defaultVal: string): string {
    return systemSettingStore.get(key, defaultVal)
}