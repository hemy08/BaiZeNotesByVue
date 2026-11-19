/**
 * 批次 C #8/#9：src/main/utils/auto-backup.ts 单元测试（vitest node 环境）
 * 覆盖：活动文件（含未保存修改，按原编码写出）+ 工作区 .md 递归备份与目录结构、
 * node_modules/.git 与大文件跳过、活动文件内容 20MB 跳过（P2-7）、
 * 工作区外活动文件 dest 冲突改放 _active/ 子目录与序号（P2-8）、
 * 中途写失败回滚半成品目录（P3）、backupCount 滚动清理、无内容静默跳过、
 * 失败/成功状态栏提示、定时器仅调度不立即执行（P1-2，首次备份在第一个间隔到点）
 * 与间隔调度/停止/开关同步、间隔钳制、备份目录名校验与列表过滤（防路径逃逸）
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

// 结构优化 1.1（H1）：auto-backup 的系统设置读取改经 utils/providers 注入（替代原
// mock config/system-setting），注入读取 hoisted.setting 的替身，保持 enableAutoBackup /
// backupInterval / backupCount 各用例语义不变。

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
import { logger } from '../../src/main/utils/logger'
import { appState } from '../../src/main/utils/app-state'
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import type { SystemSetting } from '../../src/shared/types'

// 结构优化 1.1（H1）：注入系统设置替身（等价原 mock 的 getSystemSetting），
// 每次读取取 hoisted.setting 最新值，与改造前 mock 的实时读取语义一致。
setSystemSettingProvider(() => hoisted.setting as unknown as SystemSetting)

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

/**
 * 等待异步备份周期完成：定时器触发后的备份是异步链（真实 fs IO），
 * 轮询备份目录数量与"下一轮定时器已重新调度"两个条件；轮询间隙走真实
 * 异步 IO，给事件循环机会推进备份链（fake timers 只冻结 setTimeout 类计时器）。
 */
async function waitForCycleDone(expectedCount: number): Promise<void> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
            expect(await listAutoBackups()).toHaveLength(expectedCount)
            // 一轮完成后 finally 会递归调度下一轮（enableAutoBackup=true）
            expect(vi.getTimerCount()).toBe(1)
            return
        } catch (error) {
            lastError = error
        }
        await fs.pathExists(hoisted.tmpRoot)
    }
    throw lastError instanceof Error ? lastError : new Error('等待异步备份周期超时')
}

beforeEach(() => {
    fs.rmSync(hoisted.tmpRoot, { recursive: true, force: true })
    fs.ensureDirSync(hoisted.tmpRoot)
    hoisted.setting = { enableAutoBackup: true, backupInterval: 24, backupCount: 5 }
    hoisted.statusBarCalls.length = 0
    hoisted.sendToMainWindow.mockClear()
    appState._resetForTesting()
    vi.mocked(logger.warn).mockClear()
    vi.mocked(logger.info).mockClear()
    vi.useFakeTimers()
})

afterEach(() => {
    stopAutoBackupTimer()
    vi.useRealTimers()
})

describe('auto-backup (批次 C #8/#9 + 审查修复)', () => {
    it('should back up workspace .md files with structure and the active file in its encoding', async () => {
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

        const result = await performAutoBackup()
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

    it('should put the active file outside the workspace at the backup root', async () => {
        const ws = setupWorkspace()
        const outside = path.join(hoisted.tmpRoot, 'outside.md')
        appState.currentActiveFile = {
            name: 'outside.md',
            path: outside,
            type: 'file',
            content: '外部文件',
            encoding: 'utf-8'
        }

        const result = await performAutoBackup()
        expect(result?.fileCount).toBe(2)
        const backupDir = path.join(getAutoBackupRoot(), result?.name ?? '')
        expect(fs.readFileSync(path.join(backupDir, 'outside.md'), 'utf8')).toBe('外部文件')
        expect(fs.readFileSync(path.join(backupDir, 'a.md'), 'utf8')).toBe('内容')
        expect(fs.existsSync(path.join(backupDir, ws))).toBe(false)
    })

    it('should skip active file content larger than 20MB with a warning (P2-7)', async () => {
        setupWorkspace()
        appState.currentActiveFile = {
            name: 'huge.md',
            path: path.join(hoisted.tmpRoot, 'huge.md'),
            type: 'file',
            content: 'x'.repeat(AUTO_BACKUP_MAX_FILE_BYTES + 1),
            encoding: 'utf-8'
        }

        const result = await performAutoBackup()
        expect(result).not.toBeNull()
        // 仅工作区 a.md：超大活动文件被跳过
        expect(result?.fileCount).toBe(1)
        const backupDir = path.join(getAutoBackupRoot(), result?.name ?? '')
        expect(fs.existsSync(path.join(backupDir, 'huge.md'))).toBe(false)
        expect(fs.readFileSync(path.join(backupDir, 'a.md'), 'utf8')).toBe('内容')
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining(`${AUTO_BACKUP_MAX_FILE_BYTES} 字节上限`)
        )
    })

    it('should move an out-of-workspace active file into _active/ on basename collision (P2-8)', async () => {
        setupWorkspace() // 工作区根含 a.md
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(hoisted.tmpRoot, 'elsewhere', 'a.md'), // 工作区外同名
            type: 'file',
            content: '外部同名文件',
            encoding: 'utf-8'
        }

        const result = await performAutoBackup()
        expect(result?.fileCount).toBe(2)
        const backupDir = path.join(getAutoBackupRoot(), result?.name ?? '')
        // 工作区文件保持原内容，未被静默替换
        expect(fs.readFileSync(path.join(backupDir, 'a.md'), 'utf8')).toBe('内容')
        // 工作区外活动文件放入 _active/ 子目录
        expect(fs.readFileSync(path.join(backupDir, '_active', 'a.md'), 'utf8')).toBe(
            '外部同名文件'
        )
    })

    it('should append a sequence number when _active/ also collides (P2-8)', async () => {
        const ws = setupWorkspace()
        fs.ensureDirSync(path.join(ws, '_active'))
        fs.writeFileSync(path.join(ws, '_active', 'a.md'), '工作区 _active 内容', 'utf8')
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(hoisted.tmpRoot, 'elsewhere', 'a.md'),
            type: 'file',
            content: '外部同名文件',
            encoding: 'utf-8'
        }

        const result = await performAutoBackup()
        expect(result?.fileCount).toBe(3)
        const backupDir = path.join(getAutoBackupRoot(), result?.name ?? '')
        expect(fs.readFileSync(path.join(backupDir, 'a.md'), 'utf8')).toBe('内容')
        expect(fs.readFileSync(path.join(backupDir, '_active', 'a.md'), 'utf8')).toBe(
            '工作区 _active 内容'
        )
        expect(fs.readFileSync(path.join(backupDir, '_active', 'a-1.md'), 'utf8')).toBe(
            '外部同名文件'
        )
    })

    it('should prune old backups down to backupCount', async () => {
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

        const result = await performAutoBackup()
        expect(result).not.toBeNull()

        const names = (await listAutoBackups()).map((info) => info.name)
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

    it('should skip silently when there is nothing to back up', async () => {
        expect(await performAutoBackup()).toBeNull()

        await runAutoBackupOnce()
        expect(hoisted.sendToMainWindow).not.toHaveBeenCalled()
        expect(fs.existsSync(getAutoBackupRoot())).toBe(false)
    })

    it('should report backup success to the status bar', async () => {
        setupWorkspace()

        await runAutoBackupOnce()
        expect(hoisted.sendToMainWindow).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                message: 'mainMsg.status.autoBackupSuccess',
                type: 'info'
            })
        )
    })

    it('should report backup failures to the status bar without throwing', async () => {
        setupWorkspace()
        // 备份根路径被同名文件占位：ensureDir 抛错
        const backupRoot = getAutoBackupRoot()
        fs.writeFileSync(backupRoot, '占位文件')

        await runAutoBackupOnce()
        expect(hoisted.sendToMainWindow).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                message: 'mainMsg.status.autoBackupFailed',
                type: 'error'
            })
        )
    })

    it('should clean up the partial backup directory when a write fails mid-backup (P3)', async () => {
        const ws = path.join(hoisted.tmpRoot, 'ws')
        fs.ensureDirSync(path.join(ws, 'sub'))
        fs.writeFileSync(path.join(ws, 'sub', 'b.md'), 'b 内容', 'utf8')
        appState.rootPath = ws
        // 工作区外活动文件 basename 为 'sub'：其 dest 与工作区条目 sub/b.md 的父目录
        // 同名——先拷贝 b.md（形成半成品目录），随后把内容写到已是目录的 destDir/sub
        // 时真实抛错（EISDIR），模拟磁盘满/权限等中途失败
        appState.currentActiveFile = {
            name: 'sub',
            path: path.join(hoisted.tmpRoot, 'elsewhere', 'sub'),
            type: 'file',
            content: '外部文件',
            encoding: 'utf-8'
        }

        await expect(performAutoBackup()).rejects.toThrow(/EISDIR|illegal/i)

        // 半成品目录已回滚删除：备份根下无任何残留备份目录
        expect(await listAutoBackups()).toHaveLength(0)
        expect(fs.readdirSync(getAutoBackupRoot())).toHaveLength(0)
    })

    it('should not run on start; first backup happens at the first interval and reschedules (P1-2)', async () => {
        setupWorkspace()

        startAutoBackupTimer()
        // 仅注册定时器，不立即执行备份
        expect(vi.getTimerCount()).toBe(1)
        expect(await listAutoBackups()).toHaveLength(0)

        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(1)

        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(2)

        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(3)
    })

    it('should stop rescheduling after stopAutoBackupTimer', async () => {
        setupWorkspace()
        startAutoBackupTimer()
        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(1)

        stopAutoBackupTimer()
        expect(vi.getTimerCount()).toBe(0)
        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS * 3)
        expect(await listAutoBackups()).toHaveLength(1)
    })

    it('should restart cleanly when started twice (no stacked timers)', async () => {
        setupWorkspace()
        startAutoBackupTimer()
        expect(vi.getTimerCount()).toBe(1)

        startAutoBackupTimer()
        expect(vi.getTimerCount()).toBe(1) // 旧 pending 已清除，仅一条调度链

        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(1)

        // 重启后仅保留一条调度链：前进一个间隔只新增一次
        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(2)
    })

    it('should only run when enabled via syncAutoBackupTimer (P1-2: no immediate run)', async () => {
        setupWorkspace()
        hoisted.setting = { ...hoisted.setting, enableAutoBackup: false }
        syncAutoBackupTimer()
        expect(vi.getTimerCount()).toBe(0)
        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        expect(await listAutoBackups()).toHaveLength(0)

        hoisted.setting = { ...hoisted.setting, enableAutoBackup: true }
        syncAutoBackupTimer()
        // 启用后仅调度，不立即执行
        expect(vi.getTimerCount()).toBe(1)
        expect(await listAutoBackups()).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(INTERVAL_24H_MS)
        await waitForCycleDone(1)

        // 间隔变更后再次同步：重启定时器（不立即执行），按新间隔 48h 调度
        hoisted.setting = { ...hoisted.setting, backupInterval: 48 }
        syncAutoBackupTimer()
        expect(await listAutoBackups()).toHaveLength(1)
        expect(vi.getTimerCount()).toBe(1)
        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
        expect(await listAutoBackups()).toHaveLength(1) // 未到 48h 不执行
        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
        await waitForCycleDone(2)
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

    it('should validate backup names and only list valid backup directories', async () => {
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

        expect((await listAutoBackups()).map((info) => info.name)).toEqual(['20240101-000000'])
    })
})
