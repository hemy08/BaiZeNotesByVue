/**
 * 批次 C #8/#9：src/main/utils/auto-backup.ts 单元测试（vitest node 环境）
 * 覆盖：活动文件（含未保存修改，按原编码写出）+ 工作区 .md 递归备份与目录结构、
 * node_modules/.git 与大文件跳过、backupCount 滚动清理、无内容静默跳过、
 * 失败/成功状态栏提示、定时器启动（先立即执行一次）/间隔调度/停止/开关同步、
 * 间隔钳制、备份目录名校验与列表过滤（防路径逃逸）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as iconv from 'iconv-lite'

const hoisted = vi.hoisted(() => ({
    tmpRoot: `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-vitest-auto-backup`,
    setting: {} as Record<string, unknown>,
    statusBarCalls: [] as Array<{ message: string; type?: string }>,
    sendToMainWindow: vi.fn((_channel: string, payload: { message: string; type?: string }) => {
        hoisted.statusBarCalls.push(payload)
        return true
    })
}))

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => hoisted.tmpRoot)
    },
    BrowserWindow: class {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

// file-encoding（真实加载）与 auto-backup 共用主进程 i18n：桩返回 key 原文
vi.mock('../../src/main/utils/i18n', () => ({
    tMain: (key: string) => key
}))

vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => hoisted.setting
}))

// appState 用真实实例（可重置 rootPath/currentActiveFile），仅替换发送函数以便断言提示
vi.mock('../../src/main/utils/app-state', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/main/utils/app-state')>()
    return { ...actual, sendToMainWindow: hoisted.sendToMainWindow }
})

import {
    AUTO_BACKUP_MAX_FILE_BYTES,
    getAutoBackupIntervalMs,
    getAutoBackupRoot,
    isValidAutoBackupName,
    listAutoBackups,
    performAutoBackup,
    runAutoBackupOnce,
    startAutoBackupTimer,
    stopAutoBackupTimer,
    syncAutoBackupTimer
} from '../../src/main/utils/auto-backup'
import { appState } from '../../src/main/utils/app-state'

const INTERVAL_24H_MS = 24 * 60 * 60 * 1000

/** 生成合法备份目录名（20200101-000000 起每秒递增） */
function stampName(index: number): string {
    const base = new Date(2020, 0, 1, 0, 0, index)
    const pad = (value: number): string => String(value).padStart(2, '0')
    return (
        `${base.getFullYear()}${pad(base.getMonth() + 1)}${pad(base.getDate())}` +
        `-${pad(base.getHours())}${pad(base.getMinutes())}${pad(base.getSeconds())}`
    )
}

/** 构造一个含单文件的临时工作区并设为当前工作区 */
function setupWorkspace(): string {
    const ws = path.join(hoisted.tmpRoot, 'ws')
    fs.ensureDirSync(ws)
    fs.writeFileSync(path.join(ws, 'a.md'), '内容', 'utf8')
    appState.rootPath = ws
    return ws
}

beforeEach(() => {
    fs.rmSync(hoisted.tmpRoot, { recursive: true, force: true })
    fs.ensureDirSync(hoisted.tmpRoot)
    hoisted.setting = { enableAutoBackup: true, backupInterval: 24, backupCount: 5 }
    hoisted.statusBarCalls.length = 0
    hoisted.sendToMainWindow.mockClear()
    appState._resetForTesting()
    vi.useFakeTimers()
})

afterEach(() => {
    stopAutoBackupTimer()
    vi.useRealTimers()
})

describe('auto-backup (批次 C #8/#9)', () => {
    it('should back up workspace .md files with structure and the active file in its encoding', () => {
        const ws = path.join(hoisted.tmpRoot, 'ws')
        fs.ensureDirSync(path.join(ws, 'sub'))
        fs.ensureDirSync(path.join(ws, 'node_modules'))
        fs.ensureDirSync(path.join(ws, '.git'))
        fs.writeFileSync(path.join(ws, 'a.md'), '磁盘旧内容', 'utf8')
        fs.writeFileSync(path.join(ws, 'sub', 'b.md'), 'b 磁盘内容', 'utf8')
        fs.writeFileSync(path.join(ws, 'node_modules', 'x.md'), 'x', 'utf8')
        fs.writeFileSync(path.join(ws, '.git', 'y.md'), 'y', 'utf8')
        const bigFile = path.join(ws, 'big.md')
        fs.writeFileSync(bigFile, '')
        fs.truncateSync(bigFile, AUTO_BACKUP_MAX_FILE_BYTES + 1)

        appState.rootPath = ws
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(ws, 'a.md'),
            type: 'file',
            content: '未保存修改',
            encoding: 'gbk'
        }

        const result = performAutoBackup()
        expect(result).not.toBeNull()
        expect(result?.name).toMatch(/^\d{8}-\d{6}$/)
        expect(result?.fileCount).toBe(2)

        const backupDir = path.join(getAutoBackupRoot(), result?.name ?? '')
        // 活动文件：内存内容（含未保存修改）按 GBK 原编码写出，覆盖磁盘旧内容
        expect(fs.readFileSync(path.join(backupDir, 'a.md'))).toEqual(
            iconv.encode('未保存修改', 'gbk')
        )
        // 工作区 .md：保留相对目录结构，磁盘内容原样拷贝
        expect(fs.readFileSync(path.join(backupDir, 'sub', 'b.md'), 'utf8')).toBe('b 磁盘内容')
        // 跳过目录（node_modules/.git）与超过 20MB 的大文件
        expect(fs.existsSync(path.join(backupDir, 'node_modules'))).toBe(false)
        expect(fs.existsSync(path.join(backupDir, '.git'))).toBe(false)
        expect(fs.existsSync(path.join(backupDir, 'big.md'))).toBe(false)
    })

    it('should put the active file outside the workspace at the backup root', () => {
        const ws = setupWorkspace()
        const outside = path.join(hoisted.tmpRoot, 'outside.md')
        appState.currentActiveFile = {
            name: 'outside.md',
            path: outside,
            type: 'file',
            content: '外部文件',
            encoding: 'utf-8'
        }

        const result = performAutoBackup()
        expect(result?.fileCount).toBe(2)
        const backupDir = path.join(getAutoBackupRoot(), result?.name ?? '')
        expect(fs.readFileSync(path.join(backupDir, 'outside.md'), 'utf8')).toBe('外部文件')
        expect(fs.readFileSync(path.join(backupDir, 'a.md'), 'utf8')).toBe('内容')
        expect(fs.existsSync(path.join(backupDir, ws))).toBe(false)
    })

    it('should prune old backups down to backupCount', () => {
        setupWorkspace()
        const root = getAutoBackupRoot()
        fs.ensureDirSync(root)
        const oldNames: string[] = []
        for (let i = 0; i < 12; i++) {
            const name = stampName(i)
            fs.ensureDirSync(path.join(root, name))
            oldNames.push(name)
        }
        hoisted.setting = { ...hoisted.setting, backupCount: 5 }

        const result = performAutoBackup()
        expect(result).not.toBeNull()

        const names = listAutoBackups().map((info) => info.name)
        expect(names).toHaveLength(5)
        expect(names).toContain(result?.name)
        // 13 个备份保留最新 5 个：删除最旧的 8 个（索引 0~7）
        for (const removed of oldNames.slice(0, 8)) {
            expect(names).not.toContain(removed)
            expect(fs.existsSync(path.join(root, removed))).toBe(false)
        }
        for (const kept of oldNames.slice(8)) {
            expect(fs.existsSync(path.join(root, kept))).toBe(true)
        }
    })

    it('should skip silently when there is nothing to back up', () => {
        expect(performAutoBackup()).toBeNull()

        runAutoBackupOnce()
        expect(hoisted.sendToMainWindow).not.toHaveBeenCalled()
        expect(fs.existsSync(getAutoBackupRoot())).toBe(false)
    })

    it('should report backup success to the status bar', () => {
        setupWorkspace()

        runAutoBackupOnce()
        expect(hoisted.sendToMainWindow).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                message: 'mainMsg.status.autoBackupSuccess',
                type: 'info'
            })
        )
    })

    it('should report backup failures to the status bar without throwing', () => {
        setupWorkspace()
        // 备份根路径被同名文件占位：ensureDirSync 抛错
        // （getAutoBackupRoot 内部会先确保 userData 目录存在，故先取一次路径）
        const backupRoot = getAutoBackupRoot()
        fs.writeFileSync(backupRoot, '占位文件')

        expect(() => runAutoBackupOnce()).not.toThrow()
        expect(hoisted.sendToMainWindow).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                message: 'mainMsg.status.autoBackupFailed',
                type: 'error'
            })
        )
    })

    it('should run immediately on start and reschedule by backupInterval', () => {
        setupWorkspace()

        startAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(1)

        vi.advanceTimersByTime(INTERVAL_24H_MS)
        expect(listAutoBackups()).toHaveLength(2)

        vi.advanceTimersByTime(INTERVAL_24H_MS)
        expect(listAutoBackups()).toHaveLength(3)
    })

    it('should stop rescheduling after stopAutoBackupTimer', () => {
        setupWorkspace()
        startAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(1)

        stopAutoBackupTimer()
        vi.advanceTimersByTime(INTERVAL_24H_MS * 3)
        expect(listAutoBackups()).toHaveLength(1)
    })

    it('should restart cleanly when started twice (no stacked timers)', () => {
        setupWorkspace()
        startAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(1)

        startAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(2)

        // 重启后仅保留一条调度链：前进一个间隔只新增一次
        vi.advanceTimersByTime(INTERVAL_24H_MS)
        expect(listAutoBackups()).toHaveLength(3)
    })

    it('should only run when enabled via syncAutoBackupTimer', () => {
        setupWorkspace()
        hoisted.setting = { ...hoisted.setting, enableAutoBackup: false }
        syncAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(0)
        vi.advanceTimersByTime(INTERVAL_24H_MS)
        expect(listAutoBackups()).toHaveLength(0)

        hoisted.setting = { ...hoisted.setting, enableAutoBackup: true }
        syncAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(1)

        // 间隔变更后再次同步：先立即执行一次，并按新间隔调度（48h）
        hoisted.setting = { ...hoisted.setting, backupInterval: 48 }
        syncAutoBackupTimer()
        expect(listAutoBackups()).toHaveLength(2)
        vi.advanceTimersByTime(48 * 60 * 60 * 1000)
        expect(listAutoBackups()).toHaveLength(3)
    })

    it('should clamp the backup interval to 1~72 hours with a default fallback', () => {
        hoisted.setting = { ...hoisted.setting, backupInterval: 0 }
        expect(getAutoBackupIntervalMs()).toBe(60 * 60 * 1000)

        hoisted.setting = { ...hoisted.setting, backupInterval: 100 }
        expect(getAutoBackupIntervalMs()).toBe(72 * 60 * 60 * 1000)

        hoisted.setting = { ...hoisted.setting, backupInterval: 'bad' }
        expect(getAutoBackupIntervalMs()).toBe(INTERVAL_24H_MS)

        hoisted.setting = { ...hoisted.setting, backupInterval: 6 }
        expect(getAutoBackupIntervalMs()).toBe(6 * 60 * 60 * 1000)
    })

    it('should validate backup names and only list valid backup directories', () => {
        expect(isValidAutoBackupName('20240101-000000')).toBe(true)
        expect(isValidAutoBackupName('20240101-000000-1')).toBe(true)
        expect(isValidAutoBackupName('../escape')).toBe(false)
        expect(isValidAutoBackupName('config-backup-20240101-000000')).toBe(false)
        expect(isValidAutoBackupName('20240101-000000.txt')).toBe(false)
        expect(isValidAutoBackupName(123)).toBe(false)

        const root = getAutoBackupRoot()
        fs.ensureDirSync(root)
        fs.ensureDirSync(path.join(root, '20240101-000000'))
        fs.ensureDirSync(path.join(root, 'not-a-backup'))
        fs.writeFileSync(path.join(root, '20240102-000000'), '文件不算目录')

        expect(listAutoBackups().map((info) => info.name)).toEqual(['20240101-000000'])
    })
})
