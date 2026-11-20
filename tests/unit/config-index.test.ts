/**
 * config/index.ts（配置模块聚合导出）单元测试
 * 覆盖：各子模块函数的再导出接线（引用一致性）、轻量子模块 mock、
 * 通过聚合入口的功能冒烟
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: {
            home: `${base}/baize-vitest-config-index/home`,
            userData: `${base}/baize-vitest-config-index/user-data`,
            // ARC-04：config-manager 引入 file-utils 链 → logger 构造需要 exe 路径
            exe: `${base}/baize-vitest-config-index/app/baize.exe`
        } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-config-index/app`
    }
})

const ipcHandlers = vi.hoisted(() => ({
    map: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
            ipcHandlers.map.set(channel, fn)
        })
    },
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

// theme-registry 依赖的工具包：避免真实加载
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

// 与配置无关的重型模块：轻量替身
vi.mock('../../src/main/config/short-key-register', () => ({
    RegisterShortKeys: () => {}
}))

vi.mock('../../src/main/window/window-manager', () => ({
    windowManager: { __mock: true }
}))

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { __mock: true }
}))

import { FakeStore } from './helpers/fake-store'

import * as configIndex from '../../src/main/config'
import * as ipcListenerManagerModule from '../../src/main/ipc/ipc-listener-manager'
import * as configManagerModule from '../../src/main/config/config-manager'
import * as themeConfigModule from '../../src/main/config/theme-config'
import * as themeRegistryModule from '../../src/main/config/theme-registry'
import * as systemSettingModule from '../../src/main/config/system-setting'
import * as editorSettingModule from '../../src/main/config/editor-setting'
import * as quickLinkModule from '../../src/main/config/quick-link-config'

describe('config/index re-exports', () => {
    beforeEach(() => {
        FakeStore.resetAll()
        ipcHandlers.map.clear()
    })

    it('should re-export config-manager members by reference', () => {
        expect(configIndex.configManager).toBe(configManagerModule.configManager)
        expect(configIndex.registerConfigIpcHandlers).toBe(
            configManagerModule.registerConfigIpcHandlers
        )
    })

    it('should re-export theme-config members by reference', () => {
        expect(configIndex.themes).toBe(themeConfigModule.themes)
        expect(configIndex.getAllThemes).toBe(themeConfigModule.getAllThemes)
        expect(configIndex.getCurrentTheme).toBe(themeConfigModule.getCurrentTheme)
        expect(configIndex.getCurrentThemeStyles).toBe(themeConfigModule.getCurrentThemeStyles)
        expect(configIndex.getThemeStylesByType).toBe(themeConfigModule.getThemeStylesByType)
        expect(configIndex.setTheme).toBe(themeConfigModule.setTheme)
        expect(configIndex.getAllMonacoThemes).toBe(themeConfigModule.getAllMonacoThemes)
        expect(configIndex.getSeparateEditorTheme).toBe(themeConfigModule.getSeparateEditorTheme)
        expect(configIndex.setSeparateEditorTheme).toBe(themeConfigModule.setSeparateEditorTheme)
        expect(configIndex.getMonacoTheme).toBe(themeConfigModule.getMonacoTheme)
        expect(configIndex.setMonacoTheme).toBe(themeConfigModule.setMonacoTheme)
    })

    it('should re-export theme-registry members by reference', () => {
        expect(configIndex.getMonacoThemeData).toBe(themeRegistryModule.getMonacoThemeData)
    })

    it('should re-export system-setting members by reference', () => {
        expect(configIndex.getSystemSetting).toBe(systemSettingModule.getSystemSetting)
        expect(configIndex.saveSystemSetting).toBe(systemSettingModule.saveSystemSetting)
        expect(configIndex.getSystemSettingValString).toBe(
            systemSettingModule.getSystemSettingValString
        )
        // P2 死配置字段清理：残留 checkUpdateOnStart 的幂等清理入口经 barrel 透出
        expect(configIndex.cleanupDeprecatedSystemSettings).toBe(
            systemSettingModule.cleanupDeprecatedSystemSettings
        )
    })

    it('should re-export editor-setting members by reference', () => {
        expect(configIndex.getEditorSetting).toBe(editorSettingModule.getEditorSetting)
        expect(configIndex.saveEditorSetting).toBe(editorSettingModule.saveEditorSetting)
        expect(configIndex.getDefaultEditorSetting).toBe(
            editorSettingModule.getDefaultEditorSetting
        )
        expect(configIndex.resetEditorSetting).toBe(editorSettingModule.resetEditorSetting)
    })

    it('should re-export quick-link-config members by reference', () => {
        expect(configIndex.getQuickLinks).toBe(quickLinkModule.getQuickLinks)
        expect(configIndex.saveQuickLinks).toBe(quickLinkModule.saveQuickLinks)
        expect(configIndex.resetToDefault).toBe(quickLinkModule.resetToDefault)
    })

    it('should expose the light-weight module singletons', () => {
        expect(configIndex.windowManager).toEqual({ __mock: true })
        expect(typeof configIndex.RegisterShortKeys).toBe('function')
    })

    // 结构优化 1.1（H1）：config 聚合入口不再转发 ipc 单例（消除 config → ipc 方向），
    // 需要 ipcListenerManager 的调用方直接 import '../ipc/ipc-listener-manager'。
    it('should no longer re-export ipcListenerManager through the barrel', () => {
        expect('ipcListenerManager' in configIndex).toBe(false)
        expect(ipcListenerManagerModule.ipcListenerManager).toEqual({ __mock: true })
    })

    describe('functional smoke through the barrel', () => {
        it('should return the default editor setting', () => {
            expect(configIndex.getEditorSetting().fontSize).toBe(15)
        })

        it('should return three default quick links', () => {
            expect(configIndex.getQuickLinks()).toHaveLength(3)
        })

        it('should return the default system setting', () => {
            expect(configIndex.getSystemSetting().language).toBe('zh-cn')
        })

        it('should return the default theme', () => {
            expect(configIndex.getCurrentTheme()).toBe('baize')
            expect(configIndex.getAllThemes()).toHaveLength(28)
        })

        it('should resolve built-in monaco theme data to null', async () => {
            await expect(configIndex.getMonacoThemeData('vs')).resolves.toBeNull()
        })

        it('should roundtrip the current theme through the barrel', () => {
            configIndex.setTheme('dark')
            expect(configIndex.getCurrentTheme()).toBe('dark')
            expect(configIndex.getCurrentThemeStyles().name).toBe('深邃夜空')
        })
    })
})
