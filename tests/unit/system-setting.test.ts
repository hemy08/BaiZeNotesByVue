/**
 * system-setting.ts 单元测试
 * 覆盖：默认值、部分保存（仅更新传入字段）、undefined 忽略、空对象无操作、
 * 字符串键读取、存储实例接线、损坏配置备份重建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'

// 顶层 mock：electron（app-paths 需要 getPath('home')）
const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { home: `${base}/baize-vitest-system-setting/home` } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-system-setting/app`
    }
})

vi.mock('electron', () => ({
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

// theme-config 会加载 theme-registry，其依赖 @electron-toolkit/utils；
// 该包是外部化的 ESM，若不 mock 会真实加载并绕过 electron mock
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

import { FakeStore } from './helpers/fake-store'
import {
    getSystemSetting,
    saveSystemSetting,
    getSystemSettingValString,
    migrateLegacyOptInSettings,
    cleanupDeprecatedSystemSettings
} from '../../src/main/config/system-setting'

// 全部模态开关键
const MODAL_KEYS = [
    'editorSettingModal',
    'systemSettingModal',
    'themeSettingModal',
    'helpAboutModal',
    'helpContactUsModal',
    'insertImageModal',
    'admonitionsModal',
    'fontSelectModal',
    'mathTextModal',
    'mdSheetModal',
    'importOptionModal',
    'mermaidEditModal',
    'quickLinkSettingModal',
    'techStackModal',
    'webUrlModal'
] as const

describe('system-setting', () => {
    beforeEach(() => {
        FakeStore.resetAll()
    })

    describe('default values', () => {
        it('should return hardcoded defaults', () => {
            const setting = getSystemSetting()
            expect(setting.language).toBe('zh-cn')
            expect(setting.resourceManager).toBe('default')
            expect(setting.editorModel).toBe('default')
            expect(setting.pluginOpen).toBe('browser')
            expect(setting.menuBarStyle).toBe('electron')
            expect(setting.autoSaveEnabled).toBe(false)
            expect(setting.autoSaveInterval).toBe(60)
            expect(setting.fontFamily).toContain('Microsoft YaHei')
            expect(setting.fontSize).toBe(13)
            expect(setting.renderWhitespace).toBe('all')
        })

        it('should default all modal flags to false', () => {
            const setting = getSystemSetting()
            for (const key of MODAL_KEYS) {
                expect(setting[key], `modal key ${key}`).toBe(false)
            }
        })

        // AS-9：远程图片隐私开关默认关闭（安全默认，预览不加载远程图片、不发网络请求）
        it('should default allowRemoteImages to false (AS-9)', () => {
            expect(getSystemSetting().allowRemoteImages).toBe(false)
        })

        // P2-10：关闭时最小化到托盘默认关闭（opt-in）——存量用户「关闭即退出」语义不突变
        it('should default minimizeToTray to false (P2-10 opt-in)', () => {
            expect(getSystemSetting().minimizeToTray).toBe(false)
        })

        // P2-11：自动备份默认关闭（opt-in）——升级不静默把工作区 .md 复制到备份目录
        it('should default enableAutoBackup to false (P2-11 opt-in)', () => {
            expect(getSystemSetting().enableAutoBackup).toBe(false)
        })

        // P2-10/P2-11：默认值仅影响新配置；用户已存的 true 值保留（不迁移）
        it('should keep an explicitly saved true value for opt-in switches', () => {
            saveSystemSetting({ minimizeToTray: true, enableAutoBackup: true })
            const setting = getSystemSetting()
            expect(setting.minimizeToTray).toBe(true)
            expect(setting.enableAutoBackup).toBe(true)
        })
    })

    // 1.3.6：存量设置迁移——修复「关闭后进程仍在」的旧默认值残留
    // （1.3.1~1.3.5 期间两项默认 true，用户保存过设置即落盘 true）
    describe('migrateLegacyOptInSettings (1.3.6)', () => {
        it('should reset legacy default opt-ins on first migration', () => {
            saveSystemSetting({ minimizeToTray: true, enableAutoBackup: true })
            expect(migrateLegacyOptInSettings()).toBe(true)
            const setting = getSystemSetting()
            expect(setting.minimizeToTray).toBe(false)
            expect(setting.enableAutoBackup).toBe(false)
            // 2026-11-20：自动保存旧默认 true 一并重置为 false（opt-in）
            expect(setting.autoSaveEnabled).toBe(false)
        })

        it('should reset autoSaveEnabled for v2 settings but keep re-enabled tray/backup flags', () => {
            // 模拟 1.3.6 迁移完成（版本标记 2）后用户重新开启托盘/备份
            saveSystemSetting({
                settingsSchemaVersion: 2,
                minimizeToTray: true,
                enableAutoBackup: true
            })
            expect(migrateLegacyOptInSettings()).toBe(true)
            const setting = getSystemSetting()
            expect(setting.autoSaveEnabled).toBe(false)
            expect(setting.minimizeToTray).toBe(true)
            expect(setting.enableAutoBackup).toBe(true)
        })

        it('should not migrate twice and should keep user re-enabled values', () => {
            saveSystemSetting({ minimizeToTray: true })
            expect(migrateLegacyOptInSettings()).toBe(true)
            // 迁移后用户主动重新开启：版本标记已存在，不再被重置
            saveSystemSetting({ minimizeToTray: true })
            expect(migrateLegacyOptInSettings()).toBe(false)
            expect(getSystemSetting().minimizeToTray).toBe(true)
        })

        it('should keep already-false values untouched', () => {
            saveSystemSetting({ minimizeToTray: false, enableAutoBackup: false })
            expect(migrateLegacyOptInSettings()).toBe(true)
            expect(getSystemSetting().minimizeToTray).toBe(false)
            expect(getSystemSetting().enableAutoBackup).toBe(false)
        })
    })

    // P2 死配置字段清理：checkUpdateOnStart 无消费方（无 UI 入口、启动不检查更新），
    // 已从类型/默认值/schema 移除；历史持久化的残留键由清理函数幂等删除，不升 schema 版本。
    describe('cleanupDeprecatedSystemSettings (P2 dead config)', () => {
        /** 模拟历史版本落盘的 checkUpdateOnStart 键（直接注入 electron-store 替身数据） */
        const seedLegacyField = (): void => {
            FakeStore.data.set(
                'systemSetting',
                new Map<string, unknown>([['checkUpdateOnStart', true]])
            )
        }

        it('should remove the persisted legacy checkUpdateOnStart key once', () => {
            seedLegacyField()
            expect(cleanupDeprecatedSystemSettings()).toBe(true)
            expect(FakeStore.data.get('systemSetting')?.has('checkUpdateOnStart')).toBe(false)
            // 幂等：清理后再次调用返回 false，且不抛异常
            expect(cleanupDeprecatedSystemSettings()).toBe(false)
        })

        it('should not expose the removed field through getSystemSetting', () => {
            seedLegacyField()
            const setting = getSystemSetting()
            expect('checkUpdateOnStart' in setting).toBe(false)
            // 其它字段仍按默认值补齐，读取不因旧字段报错
            expect(setting.language).toBe('zh-cn')
            expect(setting.autoSaveEnabled).toBe(false)
        })

        it('should be a no-op when the legacy key was never persisted', () => {
            expect(cleanupDeprecatedSystemSettings()).toBe(false)
        })
    })

    describe('saveSystemSetting', () => {
        it('should update only the provided fields and keep others', () => {
            saveSystemSetting({ language: 'en', fontSize: 20 })
            const setting = getSystemSetting()
            expect(setting.language).toBe('en')
            expect(setting.fontSize).toBe(20)
            // 未传入字段保持不变
            expect(setting.menuBarStyle).toBe('electron')
            // 2026-11-20：自动保存默认关闭（opt-in）
            expect(setting.autoSaveEnabled).toBe(false)
            expect(setting.autoSaveInterval).toBe(60)
            expect(setting.fontFamily).toContain('Microsoft YaHei')
        })

        it('should ignore undefined fields', () => {
            saveSystemSetting({ language: undefined, fontSize: undefined })
            const setting = getSystemSetting()
            expect(setting.language).toBe('zh-cn')
            expect(setting.fontSize).toBe(13)
        })

        it('should be a no-op for an empty object', () => {
            saveSystemSetting({})
            const setting = getSystemSetting()
            expect(setting.language).toBe('zh-cn')
            expect(setting.fontSize).toBe(13)
        })

        it('should persist all scalar fields', () => {
            saveSystemSetting({
                language: 'zh-tw',
                resourceManager: 'external',
                editorModel: 'custom',
                pluginOpen: 'window',
                menuBarStyle: 'windows-native',
                autoSaveEnabled: false,
                autoSaveInterval: 120,
                fontFamily: 'Consolas',
                fontSize: 16
            })
            const setting = getSystemSetting()
            expect(setting.language).toBe('zh-tw')
            expect(setting.resourceManager).toBe('external')
            expect(setting.editorModel).toBe('custom')
            expect(setting.pluginOpen).toBe('window')
            expect(setting.menuBarStyle).toBe('windows-native')
            expect(setting.autoSaveEnabled).toBe(false)
            expect(setting.autoSaveInterval).toBe(120)
            expect(setting.fontFamily).toBe('Consolas')
            expect(setting.fontSize).toBe(16)
        })

        it('should persist modal flags', () => {
            saveSystemSetting({ editorSettingModal: true, helpAboutModal: true, webUrlModal: true })
            const setting = getSystemSetting()
            expect(setting.editorSettingModal).toBe(true)
            expect(setting.helpAboutModal).toBe(true)
            expect(setting.webUrlModal).toBe(true)
            // 其余模态开关不变
            expect(setting.systemSettingModal).toBe(false)
            expect(setting.themeSettingModal).toBe(false)
        })

        it('should persist renderWhitespace (ARC-12：补上历史缺失的保存分支)', () => {
            saveSystemSetting({ renderWhitespace: 'none' })
            expect(getSystemSetting().renderWhitespace).toBe('none')
        })

        it('should persist renderer extension fields (ARC-04)', () => {
            saveSystemSetting({
                autoOpenLastFile: true,
                minimizeToTray: false,
                recentFilesCount: 15,
                enableAutoBackup: false
            })
            const setting = getSystemSetting()
            expect(setting.autoOpenLastFile).toBe(true)
            expect(setting.minimizeToTray).toBe(false)
            expect(setting.recentFilesCount).toBe(15)
            expect(setting.enableAutoBackup).toBe(false)
            // 未传入字段保持默认
            expect(setting.autoStart).toBe(false)
            expect(setting.backupInterval).toBe(24)
        })

        // AS-9：远程图片隐私开关可持久化（关闭 → 开启 → 再关闭），且不影响其它字段
        it('should persist allowRemoteImages true/false (AS-9)', () => {
            saveSystemSetting({ allowRemoteImages: true })
            expect(getSystemSetting().allowRemoteImages).toBe(true)
            // 部分更新不丢其它字段
            expect(getSystemSetting().autoSaveEnabled).toBe(false)

            saveSystemSetting({ allowRemoteImages: false })
            expect(getSystemSetting().allowRemoteImages).toBe(false)
        })
    })

    describe('getSystemSettingValString', () => {
        it('should return the stored string value for an existing key', () => {
            expect(getSystemSettingValString('language', 'fallback')).toBe('zh-cn')
        })

        it('should return the fallback for a missing key', () => {
            expect(getSystemSettingValString('not-exist-key', 'my-default')).toBe('my-default')
        })

        it('should reflect saved changes', () => {
            saveSystemSetting({ language: 'ja' })
            expect(getSystemSettingValString('language', 'fallback')).toBe('ja')
        })
    })

    describe('store wiring', () => {
        it('should create the store with expected name and cwd', async () => {
            // 模块加载时即创建存储实例；用 resetModules + 动态导入拿到全新实例
            vi.resetModules()
            await import('../../src/main/config/system-setting')
            const instance = FakeStore.instances.find((s) => s.name === 'systemSetting')
            expect(instance).toBeDefined()
            expect(instance!.cwd).toBe(path.join(electronState.paths.home, '.baizenotes', 'config'))
        })
    })

    describe('corrupted config recovery (D-6/FUN-11)', () => {
        it('should back up the corrupt file and rebuild with defaults', async () => {
            const configDir = path.join(electronState.paths.home, '.baizenotes', 'config')
            const configFile = path.join(configDir, 'systemSetting.json')
            // 预置损坏的配置文件
            fs.mkdirSync(configDir, { recursive: true })
            fs.writeFileSync(configFile, '{ invalid json', 'utf-8')

            // 注入一次性构造失败，再动态加载模块（模块加载时创建 Store）
            FakeStore.failOnceFor = 'systemSetting'
            vi.resetModules()
            const mod = await import('../../src/main/config/system-setting')

            const setting = mod.getSystemSetting()
            expect(setting.language).toBe('zh-cn')
            expect(setting.menuBarStyle).toBe('electron')

            // 原文件应被备份为 .corrupt-时间戳 文件
            const files = fs.readdirSync(configDir)
            const backup = files.find((f) => /^systemSetting\.json\.corrupt-\d+$/.test(f))
            expect(backup).toBeDefined()
            expect(fs.existsSync(configFile)).toBe(false)
        })
    })
})
