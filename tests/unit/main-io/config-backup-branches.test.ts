/**
 * 覆盖率补测第五批：config-backup.ts（配置目录备份/恢复）边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - 备份根/配置目录缺失或非法（空目录、根路径是文件）→ 空列表 / null / false；
 * - 列表读取失败、保留数量归一化（非法配置值、显式 keep 的夹取、非法日历时间戳回落 epoch）；
 * - 备份同名冲突追加序号、超出保留数量清理旧备份、清理失败告警、备份拷贝失败兜底；
 * - 恢复：非法备份名、备份不存在/不是目录/为空、拷贝失败；
 * - 恢复后各 electron-store 灌入（system/theme/editor/quick-links 合法与非对象形状）；
 * - handleConfigBackupCommand 非法载荷与未知命令、getBackupState 空/非空 latest。
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import * as fs from 'fs-extra'
import * as path from 'path'

const hoisted = vi.hoisted(() => ({
    userDataPath: `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-config-backup5`,
    backupCount: 5
}))

vi.mock('electron', () => ({ app: { getPath: () => hoisted.userDataPath } }))

vi.mock('../../../src/main/utils/app-paths', () => ({
    CONFIG_DIR_NAME: 'config',
    getUserDataPath: () => hoisted.userDataPath
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ backupCount: hoisted.backupCount }),
    saveSystemSetting: vi.fn()
}))

vi.mock('../../../src/main/config/theme-config', () => ({
    setThemeConfig: vi.fn()
}))

vi.mock('../../../src/main/config/editor-setting', () => ({
    saveEditorSetting: vi.fn()
}))

vi.mock('../../../src/main/config/quick-link-config', () => ({
    saveQuickLinks: vi.fn()
}))

import {
    CONFIG_BACKUP_DIR_NAME,
    createConfigBackup,
    getBackupState,
    getConfigBackupRoot,
    getConfigDirectory,
    handleConfigBackupCommand,
    isValidBackupName,
    listConfigBackups,
    restoreConfigBackup
} from '../../../src/main/config/config-backup'
import { logger } from '../../../src/main/utils/logger'
import { getSystemSetting, saveSystemSetting } from '../../../src/main/config/system-setting'
import { setThemeConfig } from '../../../src/main/config/theme-config'
import { saveEditorSetting } from '../../../src/main/config/editor-setting'
import { saveQuickLinks } from '../../../src/main/config/quick-link-config'

const USER_DATA = hoisted.userDataPath
const CONFIG_DIR = path.join(USER_DATA, 'config')
const BACKUP_ROOT = path.join(USER_DATA, CONFIG_BACKUP_DIR_NAME)
const FIXED_NOW = new Date(2026, 0, 2, 3, 4, 5)

function createBackupDir(name: string, files: Record<string, string> = { 'a.json': '{}' }): string {
    const dir = path.join(BACKUP_ROOT, name)
    fs.ensureDirSync(dir)
    for (const [fileName, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, fileName), content, 'utf-8')
    }
    return dir
}

function listBackupDirNames(): string[] {
    if (!fs.existsSync(BACKUP_ROOT)) return []
    return fs
        .readdirSync(BACKUP_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
}

beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_NOW })
    fs.rmSync(USER_DATA, { recursive: true, force: true })
    fs.ensureDirSync(USER_DATA)
    hoisted.backupCount = 5
    vi.clearAllMocks()
})

afterEach(() => {
    vi.useRealTimers()
})

afterAll(() => {
    fs.rmSync(USER_DATA, { recursive: true, force: true })
})

describe('目录与名称校验', () => {
    it('配置目录与备份根目录位于 userData 下', () => {
        expect(getConfigDirectory()).toBe(CONFIG_DIR)
        expect(getConfigBackupRoot()).toBe(BACKUP_ROOT)
        expect(getSystemSetting()).toEqual({ backupCount: 5 })
    })

    it('备份名白名单：只接受 config-backup- 前缀 + 时间戳形状', () => {
        expect(isValidBackupName('config-backup-20260102-030405')).toBe(true)
        expect(isValidBackupName('config-backup-20260102-030405-1')).toBe(true)
        expect(isValidBackupName('20260102-030405')).toBe(false)
        expect(isValidBackupName('config-backup-2026-01-02')).toBe(false)
        expect(isValidBackupName('../config-backup-20260102-030405')).toBe(false)
        expect(isValidBackupName(null)).toBe(false)
        expect(isValidBackupName(42)).toBe(false)
    })
})

describe('listConfigBackups / getBackupState', () => {
    it('备份根不存在时返回空列表、latest 为 null', () => {
        expect(listConfigBackups()).toEqual([])
        expect(getBackupState()).toEqual({ backups: [], latest: null })
    })

    it('备份根不是目录（读取失败）时告警并返回空列表', () => {
        fs.writeFileSync(BACKUP_ROOT, 'occupied', 'utf-8')
        expect(listConfigBackups()).toEqual([])
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('读取备份根目录失败'),
            expect.any(Error)
        )
    })

    it('按时间倒序列出合法目录，忽略文件与非法名称，非法日历时间戳回落 epoch', () => {
        createBackupDir('config-backup-20260101-000000', { 'a.json': '1', 'b.json': '2' })
        createBackupDir('config-backup-20260103-000000')
        createBackupDir('config-backup-20261301-000000') // 月份越界：名称形状合法但日历非法
        fs.ensureDirSync(path.join(BACKUP_ROOT, 'not-a-backup'))
        fs.writeFileSync(path.join(BACKUP_ROOT, 'config-backup-20260104-000000'), 'file')

        const backups = listConfigBackups()
        expect(backups.map((backup) => backup.name)).toEqual([
            'config-backup-20261301-000000', // 月份越界但名称形状合法：字典序最大
            'config-backup-20260103-000000',
            'config-backup-20260101-000000'
        ])
        const oldest = backups.find((backup) => backup.name === 'config-backup-20260101-000000')
        expect(oldest?.fileCount).toBe(2)
        const invalidCalendar = backups.find(
            (backup) => backup.name === 'config-backup-20261301-000000'
        )
        expect(invalidCalendar?.createdAt).toBe(new Date(0).toISOString())
        // latest 取倒序首项（名称字典序决定）
        expect(getBackupState().latest).toBe(listConfigBackups()[0]?.name)
    })
})

describe('createConfigBackup', () => {
    it('配置目录不存在或为空时返回 null（无内容可备份）', () => {
        expect(createConfigBackup()).toBeNull()
        fs.ensureDirSync(CONFIG_DIR)
        expect(createConfigBackup()).toBeNull()
    })

    it('成功备份：拷贝配置目录普通文件并生成元信息', () => {
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'systemSetting.json'), '{"a":1}')
        fs.writeFileSync(path.join(CONFIG_DIR, 'theme-config.json'), '{"b":2}')
        const info = createConfigBackup()
        expect(info?.name).toBe('config-backup-20260102-030405')
        expect(info?.fileCount).toBe(2)
        expect(info?.path).toBe(path.join(BACKUP_ROOT, 'config-backup-20260102-030405'))
        expect(fs.existsSync(path.join(info!.path, 'systemSetting.json'))).toBe(true)
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('配置备份完成'))
    })

    it('同一时间戳重名时追加序号', () => {
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'a.json'), '{}')
        createConfigBackup()
        const second = createConfigBackup()
        expect(second?.name).toBe('config-backup-20260102-030405-1')
    })

    it('超出保留数量时清理最旧备份；显式 keep 夹取到 [1, 20]', () => {
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'a.json'), '{}')
        // 预置 3 个旧备份
        createBackupDir('config-backup-20250101-000000')
        createBackupDir('config-backup-20250102-000000')
        createBackupDir('config-backup-20250103-000000')
        expect(listBackupDirNames()).toHaveLength(3)

        // keep=0 → 夹取为 1：只保留本次新建的最新的一个
        const info = createConfigBackup(0)
        expect(info).not.toBeNull()
        expect(listBackupDirNames()).toEqual(['config-backup-20260102-030405'])
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('已清理'))
    })

    it('非法 keep 值（NaN/字符串）回落配置值；配置值非法时用默认 5', () => {
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'a.json'), '{}')
        hoisted.backupCount = Number.NaN
        for (const keep of [Number.NaN, 'x']) {
            expect(createConfigBackup(keep)).not.toBeNull()
        }
        // 默认保留 5：3 个备份都在
        expect(listBackupDirNames().length).toBe(2)
    })

    it('配置目录中的子目录不参与备份（只拷贝普通文件）', () => {
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'a.json'), '{}')
        fs.ensureDirSync(path.join(CONFIG_DIR, 'nested-dir'))
        const info = createConfigBackup()
        expect(info?.fileCount).toBe(1)
        expect(fs.existsSync(path.join(info!.path, 'nested-dir'))).toBe(false)
    })

    it('拷贝失败时记错误日志并返回 null', () => {
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'a.json'), '{}')
        // 备份根被同名普通文件占位，ensureDirSync(root) 抛错进入失败兜底
        fs.writeFileSync(BACKUP_ROOT, 'occupied', 'utf-8')
        expect(createConfigBackup()).toBeNull()
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('配置备份失败'),
            expect.any(Error)
        )
    })
})

describe('restoreConfigBackup', () => {
    it('非法备份名 / 备份不存在 / 不是目录 / 目录为空 均返回 false', () => {
        expect(restoreConfigBackup('../escape')).toBe(false)
        expect(restoreConfigBackup(null)).toBe(false)
        fs.ensureDirSync(BACKUP_ROOT)
        expect(restoreConfigBackup('config-backup-20260101-000000')).toBe(false)

        fs.writeFileSync(path.join(BACKUP_ROOT, 'config-backup-20260102-000000'), 'file')
        expect(restoreConfigBackup('config-backup-20260102-000000')).toBe(false)

        createBackupDir('config-backup-20260103-000000', {})
        expect(restoreConfigBackup('config-backup-20260103-000000')).toBe(false)
    })

    it('从备份恢复文件，并重新灌入 system/theme/editor/quick-links 各 store', () => {
        fs.ensureDirSync(CONFIG_DIR)
        createBackupDir('config-backup-20260104-000000', {
            'systemSetting.json': JSON.stringify({ autoSaveEnabled: true }),
            'theme-config.json': JSON.stringify({ themeConfig: { currentTheme: 'baize' } }),
            'editor-setting.json': JSON.stringify({ editorSetting: { fontSize: 14 } }),
            'quick-link-config.json': JSON.stringify({
                quickLinks: { links: [{ name: 'x', url: 'https://x.example/' }] }
            })
        })

        expect(restoreConfigBackup('config-backup-20260104-000000')).toBe(true)
        expect(fs.existsSync(path.join(CONFIG_DIR, 'systemSetting.json'))).toBe(true)
        expect(saveSystemSetting).toHaveBeenCalledWith({ autoSaveEnabled: true })
        expect(setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'baize' })
        expect(saveEditorSetting).toHaveBeenCalledWith({ fontSize: 14 })
        expect(saveQuickLinks).toHaveBeenCalledWith([{ name: 'x', url: 'https://x.example/' }])
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('已从备份恢复配置'))
    })

    it('恢复文件中的非对象/非法 JSON/形状不符时跳过灌入且不阻断恢复', () => {
        fs.ensureDirSync(CONFIG_DIR)
        createBackupDir('config-backup-20260105-000000', {
            'systemSetting.json': '[1,2,3]', // JSON 数组：非普通对象
            'theme-config.json': '{broken', // 非法 JSON
            'editor-setting.json': JSON.stringify({ editorSetting: [1] }),
            'quick-link-config.json': JSON.stringify({ quickLinks: { links: 'not-array' } })
        })

        expect(restoreConfigBackup('config-backup-20260105-000000')).toBe(true)
        expect(saveSystemSetting).not.toHaveBeenCalled()
        expect(setThemeConfig).not.toHaveBeenCalled()
        expect(saveEditorSetting).not.toHaveBeenCalled()
        expect(saveQuickLinks).not.toHaveBeenCalled()
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('读取备份配置失败'),
            expect.any(Error)
        )
    })

    it('拷贝失败时记错误日志并返回 false', () => {
        createBackupDir('config-backup-20260106-000000', { 'b.json': '{}' })
        // 配置目录中同名的『目录』占位，使 copyFileSync 抛错
        fs.ensureDirSync(path.join(CONFIG_DIR, 'b.json'))
        expect(restoreConfigBackup('config-backup-20260106-000000')).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('配置恢复失败'),
            expect.any(Error)
        )
    })
})

describe('handleConfigBackupCommand', () => {
    it('非对象载荷返回 false', () => {
        expect(handleConfigBackupCommand(null)).toBe(false)
        expect(handleConfigBackupCommand('create')).toBe(false)
        expect(handleConfigBackupCommand([])).toBe(false)
    })

    it('未知命令告警并返回 false', () => {
        expect(handleConfigBackupCommand({ action: 'unknown' })).toBe(false)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('未知备份命令'))
    })

    it('create：成功返回 true，无内容可备份时返回 false', () => {
        expect(handleConfigBackupCommand({ action: 'create' })).toBe(false)
        fs.ensureDirSync(CONFIG_DIR)
        fs.writeFileSync(path.join(CONFIG_DIR, 'a.json'), '{}')
        expect(handleConfigBackupCommand({ action: 'create', keep: 2 })).toBe(true)
    })

    it('restore：转发备份名并返回结果', () => {
        createBackupDir('config-backup-20260107-000000')
        expect(
            handleConfigBackupCommand({
                action: 'restore',
                name: 'config-backup-20260107-000000'
            })
        ).toBe(true)
        expect(handleConfigBackupCommand({ action: 'restore', name: '../escape' })).toBe(false)
    })
})
