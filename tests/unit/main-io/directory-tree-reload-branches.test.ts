/**
 * 覆盖率补测第五批：directory-tree-reload.ts 增量重扫 / 当前文件重读边界。
 *
 * 覆盖点（此前未覆盖的语句/分支，全部外部依赖 mock，不触碰真实文件系统）：
 * - watcher 批次局部重扫：树索引缺失时重建、plan 判定 skipped、命中目录增量刷新、
 *   plan 判定全量回退、树索引不可用；
 * - 局部重扫目录不在索引中 → 告警并回退全量扫描；
 * - 当前文件：stat 失败按签名未知处理、磁盘签名缺失时重读后补 stat、
 *   watcher 批次内容未变且无 stat 时刷新签名、读取失败（含路径越界）状态栏提示；
 * - ScheduleReloadFromDisk 合并刷新与 CleanupDirectoryWatch 状态复位。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: () => '' } }))

const fsMocks = vi.hoisted(() => ({
    stat: null as null | ((target: string) => Promise<{ mtimeMs: number; size: number }>)
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    return {
        ...actual,
        promises: {
            ...actual.promises,
            stat: (target: string) =>
                fsMocks.stat
                    ? fsMocks.stat(target)
                    : (actual.promises.stat(target) as unknown as Promise<{
                          mtimeMs: number
                          size: number
                      }>)
        }
    }
})

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const pathUtilsMocks = vi.hoisted(() => ({
    BuildFileTree: vi.fn((rootPath: string, files: unknown[]) => files as unknown as unknown[])
}))
vi.mock('../../../src/main/utils/file-utils/path-utils', () => pathUtilsMocks)

const scanMocks = vi.hoisted(() => ({
    indexTreeFolders: vi.fn<(...args: unknown[]) => Map<string, unknown> | null>(() => new Map()),
    planIncrementalRescan: vi.fn(),
    scanDirectoryTree: vi.fn(async () => []),
    removeFolderKeysFromIndex: vi.fn(),
    addFolderKeysToIndex: vi.fn(),
    buildStableItemId: vi.fn((target: string) => `id:${target}`),
    normalizePathKey: vi.fn((target: string) => target),
    resetScanSlots: vi.fn(),
    TraverseDirectory: vi.fn((_root: string, resolve: (files: unknown[]) => void) => resolve([]))
}))
vi.mock('../../../src/main/utils/file-utils/directory-tree-scan', () => scanMocks)

const watchMocks = vi.hoisted(() => ({
    ensureDirectoryWatcher: vi.fn(),
    registerDirectoryWatchBatchHandler: vi.fn(),
    resetDirectoryWatchState: vi.fn(),
    stopDirectoryWatcher: vi.fn()
}))
vi.mock('../../../src/main/utils/file-utils/directory-tree-watch', () => watchMocks)

const encodingMocks = vi.hoisted(() => ({
    ReadFileContentAdaptive: vi.fn(async () => ({ content: 'from-disk', encoding: 'utf-8' }))
}))
vi.mock('../../../src/main/utils/file-utils/file-encoding', () => encodingMocks)

const securityMocks = vi.hoisted(() => ({
    assertSafePath: vi.fn(),
    isSafeWorkspaceRoot: vi.fn((target: unknown) => {
        void target
        return true
    })
}))
vi.mock('../../../src/main/utils/security', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main/utils/security')>()
    return { ...actual, ...securityMocks }
})

const sharedMocks = vi.hoisted(() => ({
    describePathDeniedError: vi.fn<() => string | null>(() => null),
    rememberActiveFileDiskStamp: vi.fn(),
    refreshActiveFileDiskStamp: vi.fn(async () => undefined),
    resetSelfWriteWindow: vi.fn()
}))
vi.mock('../../../src/main/utils/file-utils/shared', () => sharedMocks)

import {
    CleanupDirectoryWatch,
    GetDirectoryReloadStats,
    ReloadDirFromDisk,
    ScheduleReloadFromDisk
} from '../../../src/main/utils/file-utils/directory-tree-reload'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'
import { IPC } from '../../../src/shared/ipc-channels'
import { PathAccessDeniedError } from '../../../src/main/utils/security'

const mainSend = vi.fn()
const ROOT = 'E:/workspace'
const mainWindow = {
    webContents: { id: 1, send: mainSend, isDestroyed: () => false },
    isDestroyed: () => false
}

function makeTree(childName = 'note.md'): unknown[] {
    return [{ name: childName, path: `${ROOT}/${childName}`, type: 'file' }]
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.rootPath = ROOT
    appState.mainWindow = mainWindow as unknown as Electron.BrowserWindow
    fsMocks.stat = null
    securityMocks.isSafeWorkspaceRoot.mockReturnValue(true)
    securityMocks.assertSafePath.mockImplementation(() => undefined)
    sharedMocks.describePathDeniedError.mockReturnValue(null)
    sharedMocks.refreshActiveFileDiskStamp.mockResolvedValue(undefined)
    scanMocks.indexTreeFolders.mockReturnValue(new Map())
    scanMocks.planIncrementalRescan.mockResolvedValue({
        fullRescan: false,
        directories: [],
        reason: 'all-skipped'
    })
    scanMocks.scanDirectoryTree.mockResolvedValue([])
    encodingMocks.ReadFileContentAdaptive.mockResolvedValue({
        content: 'from-disk',
        encoding: 'utf-8'
    })
    pathUtilsMocks.BuildFileTree.mockImplementation((_root: string, files: unknown[]) => files)
    scanMocks.TraverseDirectory.mockImplementation(
        (_root: string, resolve: (files: unknown[]) => void) => resolve(makeTree())
    )
})

afterEach(() => {
    fsMocks.stat = null
    CleanupDirectoryWatch()
    vi.useRealTimers()
})

describe('ScheduleReloadFromDisk / CleanupDirectoryWatch', () => {
    it('合并多次调度为一次刷新，Cleanup 复位统计与监听', async () => {
        ScheduleReloadFromDisk()
        ScheduleReloadFromDisk()
        await vi.advanceTimersByTimeAsync(600)

        expect(GetDirectoryReloadStats()).not.toBeNull()
        expect(GetDirectoryReloadStats()?.mode).toBe('full')
        expect(watchMocks.ensureDirectoryWatcher).toHaveBeenCalled()

        CleanupDirectoryWatch()
        expect(GetDirectoryReloadStats()).toBeNull()
        expect(watchMocks.stopDirectoryWatcher).toHaveBeenCalled()
        expect(watchMocks.resetDirectoryWatchState).toHaveBeenCalled()
        expect(sharedMocks.resetSelfWriteWindow).toHaveBeenCalled()
    })
})

describe('watcher 批次局部重扫', () => {
    it('树索引缺失时重建；变更全部被排除 → skipped 模式且不重扫', async () => {
        appState.mdFileTree = makeTree() as never
        scanMocks.planIncrementalRescan.mockResolvedValueOnce({
            fullRescan: false,
            directories: [],
            reason: 'all-excluded'
        })

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['node_modules/x'] })

        expect(scanMocks.indexTreeFolders).toHaveBeenCalled()
        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('skipped')
        expect(stats?.reason).toBe('all-excluded')
        expect(scanMocks.scanDirectoryTree).not.toHaveBeenCalled()
    })

    it('命中目录时只重扫该子树（incremental）', async () => {
        const subtree = { name: 'sub', path: `${ROOT}/sub`, type: 'folder', children: [] }
        const index = new Map<string, unknown>([[`${ROOT}/sub`, subtree]])
        scanMocks.indexTreeFolders.mockReturnValueOnce(index)
        scanMocks.planIncrementalRescan.mockResolvedValueOnce({
            fullRescan: false,
            directories: [`${ROOT}/sub`],
            reason: 'local-rescan'
        })
        appState.mdFileTree = makeTree() as never

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['sub/a.md'] })

        expect(scanMocks.scanDirectoryTree).toHaveBeenCalledWith(`${ROOT}/sub`)
        expect(scanMocks.removeFolderKeysFromIndex).toHaveBeenCalled()
        expect(scanMocks.addFolderKeysToIndex).toHaveBeenCalled()
        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('incremental')
        expect(stats?.rescanDirs).toBe(1)
    })

    it('局部重扫目录不在树索引中 → 告警并回退全量扫描', async () => {
        appState.mdFileTree = makeTree() as never
        scanMocks.planIncrementalRescan.mockResolvedValueOnce({
            fullRescan: false,
            directories: [`${ROOT}/missing`],
            reason: 'local-rescan'
        })
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['missing/a.md'] })

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('局部重扫失败，回退全量扫描'),
            expect.any(Error)
        )
        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('full')
        expect(stats?.reason).toBe('incremental-failed')
    })

    it('plan 判定全量回退时 reason 透传', async () => {
        appState.mdFileTree = makeTree() as never
        scanMocks.planIncrementalRescan.mockResolvedValueOnce({
            fullRescan: true,
            directories: [],
            reason: 'root-changed'
        })
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['x.md'] })
        expect(GetDirectoryReloadStats()?.reason).toBe('root-changed')
        expect(GetDirectoryReloadStats()?.mode).toBe('full')
    })

    it('树索引不可用（indexTreeFolders 返回 null）时记录 tree-index-unavailable 并全量扫描', async () => {
        appState.mdFileTree = makeTree() as never
        scanMocks.indexTreeFolders.mockReturnValueOnce(null)
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['x.md'] })
        expect(GetDirectoryReloadStats()?.reason).toBe('tree-index-unavailable')
    })
})

describe('当前活动文件重读', () => {
    function setActiveFile(path: string): void {
        appState.currentActiveFile = {
            name: 'note.md',
            path,
            type: 'file',
            content: 'memory',
            encoding: 'utf-8'
        } as never
        appState.markFileLoaded('memory')
    }

    it('stat 失败时按签名未知处理，重读成功后补记录磁盘签名（无 stat 分支）', async () => {
        const filePath = `${ROOT}/note.md`
        setActiveFile(filePath)
        fsMocks.stat = async () => {
            throw new Error('ENOENT')
        }
        encodingMocks.ReadFileContentAdaptive.mockResolvedValueOnce({
            content: 'new-disk-content',
            encoding: 'gbk'
        })
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['note.md'] })

        // 真实 fs.stat 在 Windows 上对不存在的 E:/workspace/note.md 抛错 → diskStat=null 分支
        expect(sharedMocks.refreshActiveFileDiskStamp).toHaveBeenCalledWith(filePath)
        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('reread')
        expect(stats?.activeFileDiskReads).toBe(1)
        expect(mainSend).toHaveBeenCalledWith(IPC.EVENTS.FILE_CONTENT_RELOADED, {
            path: filePath,
            content: 'new-disk-content'
        })
    })

    it('watcher 批次内容未变且 stat 失败时刷新签名并跳过编辑器重载', async () => {
        const filePath = `${ROOT}/note.md`
        setActiveFile(filePath)
        fsMocks.stat = async () => {
            throw new Error('ENOENT')
        }
        encodingMocks.ReadFileContentAdaptive.mockResolvedValueOnce({
            content: 'memory',
            encoding: 'utf-8'
        })
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['note.md'] })

        expect(sharedMocks.refreshActiveFileDiskStamp).toHaveBeenCalledWith(filePath)
        expect(GetDirectoryReloadStats()?.activeFileAction).toBe('content-unchanged')
        expect(mainSend).not.toHaveBeenCalledWith(
            IPC.EVENTS.FILE_CONTENT_RELOADED,
            expect.anything()
        )
    })

    it('读取失败且为路径越界：状态栏 error 提示（不回显内部异常）', async () => {
        const filePath = `${ROOT}/note.md`
        setActiveFile(filePath)
        securityMocks.assertSafePath.mockImplementation(() => {
            throw new PathAccessDeniedError(filePath)
        })
        sharedMocks.describePathDeniedError.mockReturnValue('没有读取权限')

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['note.md'] })

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('从磁盘重新加载当前文件内容失败'),
            filePath,
            expect.any(Error)
        )
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.STATUS_BAR_UPDATE,
            expect.objectContaining({ type: 'error' })
        )
        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('error')
        expect(stats?.activeFileDiskReads).toBe(0)
    })

    it('读取失败且为普通错误：状态栏 warning 提示使用错误信息', async () => {
        const filePath = `${ROOT}/note.md`
        setActiveFile(filePath)
        encodingMocks.ReadFileContentAdaptive.mockRejectedValueOnce(new Error('EBUSY'))
        sharedMocks.describePathDeniedError.mockReturnValue(null)

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['note.md'] })

        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.STATUS_BAR_UPDATE,
            expect.objectContaining({
                type: 'warning',
                message: expect.stringContaining('EBUSY')
            })
        )
        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(1)
    })

    it('无活动文件时 activeFileAction 为 none', async () => {
        appState.currentActiveFile = null
        await ReloadDirFromDisk()
        expect(GetDirectoryReloadStats()?.activeFileAction).toBe('none')
    })
})
