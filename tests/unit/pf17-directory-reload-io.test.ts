/**
 * PF-17：目录刷新「未变化不重读当前文件全文 / 不整篇下发」的回归测试。
 *
 * 背景（out/full-scan/perf.md PF-17）：修复前 ReloadDirFromDisk 每次执行都会
 * ReadFileContentAdaptive 重读当前活动文件全文，并向渲染层发送 file-content-reloaded，
 * 而目录刷新由任意目录操作（新建/删除/重命名/导入/打开目录）500ms 防抖触发。
 * 修复后先比较磁盘签名（mtimeMs + size）：未变化 → 1 次 stat、0 次整篇读取、0 次下发；
 * 磁盘变化（或签名缺失的首次刷新）→ 按原行为重读并下发，同时更新签名。
 *
 * 统计口径：ReloadDirFromDisk 把本次对当前文件的处理结果写入 GetDirectoryReloadStats()，
 * 其中 activeFileDiskReads 为实际调用的整篇读取次数（0/1）。
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

// 与 tests/unit/file-operations.test.ts 相同的最小外围依赖隔离
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBoxSync: vi.fn(),
    showMessageBox: vi.fn(),
    showItemInFolder: vi.fn(),
    writeText: vi.fn(),
    getAllWindows: vi.fn(),
    windowSend: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: electronMocks.windowSend }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: electronMocks.showSaveDialog,
            showOpenDialog: electronMocks.showOpenDialog,
            showMessageBoxSync: electronMocks.showMessageBoxSync,
            showMessageBox: electronMocks.showMessageBox
        },
        shell: { showItemInFolder: electronMocks.showItemInFolder },
        clipboard: { writeText: electronMocks.writeText },
        app: { getPath: () => '', getVersion: () => '1.0.0-test' },
        ipcMain: { on: () => {} }
    }
})

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

import { appState } from '../../src/main/utils/app-state'
import {
    CleanupDirectoryWatch,
    DegradeDirectoryWatch,
    GetDirectoryReloadStats,
    OpenSelectFile,
    ReloadDirFromDisk,
    SaveActiveFile
} from '../../src/main/utils/file-utils/file-operations'

const mainSend = vi.fn()
const makeWindow = () => ({ webContents: { send: mainSend } })

/** 统计本次刷新中发往渲染层的 file-content-reloaded 次数 */
function contentReloadSendCount(): number {
    return mainSend.mock.calls.filter((call) => call[0] === 'baize:file:content-reloaded').length
}

/** 统计本次刷新中发往渲染层的 FILE_SYSTEM_DATA（整树 JSON）次数 */
function treeSendCount(): number {
    return mainSend.mock.calls.filter((call) => call[0] === 'baize:fs:file-system-data').length
}

let tmpDir = ''

async function makeCaseDir(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(tmpDir, prefix))
}

/** 建立「工作区 + 活动文件」的干净基线：首轮刷新记录磁盘签名（本次会重读一次） */
async function setupCleanActiveFile(
    dirPrefix: string,
    diskContent: string
): Promise<{ caseDir: string; filePath: string }> {
    const caseDir = await makeCaseDir(dirPrefix)
    const filePath = path.join(caseDir, 'active.md')
    await fs.writeFile(filePath, diskContent, 'utf8')
    appState.rootPath = caseDir
    appState.currentActiveFile = {
        name: 'active.md',
        path: filePath,
        type: 'file',
        content: diskContent,
        encoding: 'utf-8'
    }
    appState.markFileLoaded(diskContent)
    await ReloadDirFromDisk()
    // 测试隔离：禁用真实 fs.watch，避免外部写盘触发的 500ms 批次计时器干扰断言
    DegradeDirectoryWatch(new Error('PF-17 测试：禁用真实目录监听以隔离计时器'))
    mainSend.mockClear()
    return { caseDir, filePath }
}

beforeAll(async () => {
    CleanupDirectoryWatch()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-pf17-'))
})

afterAll(async () => {
    CleanupDirectoryWatch()
    await fs.rm(tmpDir, { recursive: true, force: true })
})

afterEach(() => {
    CleanupDirectoryWatch()
})

beforeEach(() => {
    CleanupDirectoryWatch()
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.mainWindow = makeWindow() as unknown as Electron.BrowserWindow
    electronMocks.getAllWindows.mockReturnValue([])
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    electronMocks.showMessageBoxSync.mockReturnValue(0)
    electronMocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
})

describe('PF-17 目录刷新磁盘签名短路', () => {
    it('磁盘签名未变化：不重读全文、不重发内容（0 次读取）', async () => {
        const { filePath } = await setupCleanActiveFile('pf17-unchanged-', '稳定内容')

        await ReloadDirFromDisk()

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('disk-unchanged')
        expect(stats?.activeFileDiskReads).toBe(0)
        expect(stats?.activeFileReloaded).toBe(false)
        // 目录树契约不变：非 watcher 刷新仍会发送整树 JSON
        expect(stats?.treeSent).toBe(true)
        // 当前文件内容未重读、未重发
        expect(contentReloadSendCount()).toBe(0)
        expect(appState.currentActiveFile?.content).toBe('稳定内容')
        expect(appState.currentActiveFile?.path).toBe(filePath)
    })

    it('连续多轮目录刷新：除首轮外均为 0 次整篇读取、0 次内容下发', async () => {
        await setupCleanActiveFile('pf17-multi-', '多轮刷新内容')

        const readCounts: number[] = []
        for (let index = 0; index < 5; index += 1) {
            await ReloadDirFromDisk()
            readCounts.push(GetDirectoryReloadStats()?.activeFileDiskReads ?? -1)
        }

        expect(readCounts).toEqual([0, 0, 0, 0, 0])
        expect(contentReloadSendCount()).toBe(0)
        expect(appState.isDirty()).toBe(false)
    })

    it('首次刷新（签名缺失）保持原行为：重读并下发，随后记录签名', async () => {
        const caseDir = await makeCaseDir('pf17-first-')
        const filePath = path.join(caseDir, 'first.md')
        await fs.writeFile(filePath, '磁盘新内容', 'utf8')
        appState.rootPath = caseDir
        // 直接构造活动状态（模拟修复前遗留/测试场景）：没有磁盘签名
        appState.currentActiveFile = {
            name: 'first.md',
            path: filePath,
            type: 'file',
            content: '内存旧内容',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('内存旧内容')
        expect(appState.activeFileDiskStamp).toBeNull()

        await ReloadDirFromDisk()

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('reread')
        expect(stats?.activeFileDiskReads).toBe(1)
        expect(stats?.activeFileReloaded).toBe(true)
        expect(appState.currentActiveFile?.content).toBe('磁盘新内容')
        expect(mainSend).toHaveBeenCalledWith('baize:file:content-reloaded', {
            path: filePath,
            content: '磁盘新内容'
        })
        // 首轮结束后签名已记录，第二轮直接短路
        expect(appState.activeFileDiskStamp).toMatchObject({ path: filePath, size: 15 })
        mainSend.mockClear()
        await ReloadDirFromDisk()
        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(0)
        expect(contentReloadSendCount()).toBe(0)
    })

    it('磁盘内容变化（大小不同）：重读并整篇重发', async () => {
        const { filePath } = await setupCleanActiveFile('pf17-changed-', '旧内容')

        // 外部程序修改文件（模拟编辑器/同步工具写盘）
        await fs.writeFile(filePath, '外部写入的新内容（更长）', 'utf8')
        await fs.utimes(filePath, new Date(), new Date(Date.now() + 5000))

        await ReloadDirFromDisk()

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('reread')
        expect(stats?.activeFileDiskReads).toBe(1)
        expect(appState.currentActiveFile?.content).toBe('外部写入的新内容（更长）')
        expect(mainSend).toHaveBeenCalledWith('baize:file:content-reloaded', {
            path: filePath,
            content: '外部写入的新内容（更长）'
        })
        expect(appState.isDirty()).toBe(false)

        // 重读后记录新签名，再次刷新恢复短路
        mainSend.mockClear()
        await ReloadDirFromDisk()
        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(0)
        expect(contentReloadSendCount()).toBe(0)
    })

    it('磁盘内容变化（同大小、仅 mtime 变化）：仍能识别并重读', async () => {
        const { filePath } = await setupCleanActiveFile('pf17-samesize-', 'AAAA')

        await fs.writeFile(filePath, 'BBBB', 'utf8')
        await fs.utimes(filePath, new Date(), new Date(Date.now() + 5000))

        await ReloadDirFromDisk()

        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(1)
        expect(appState.currentActiveFile?.content).toBe('BBBB')
        expect(contentReloadSendCount()).toBe(1)
    })

    it('保存当前文件后刷新：签名随写盘更新，不产生多余重读', async () => {
        const caseDir = await makeCaseDir('pf17-save-')
        const filePath = path.join(caseDir, 'saved.md')
        await fs.writeFile(filePath, '初始磁盘内容', 'utf8')
        appState.rootPath = caseDir
        appState.currentActiveFile = {
            name: 'saved.md',
            path: filePath,
            type: 'file',
            content: '待保存的新内容',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('初始磁盘内容')
        expect(appState.isDirty()).toBe(true)

        await expect(SaveActiveFile()).resolves.toBe(true)
        mainSend.mockClear()

        await ReloadDirFromDisk()

        expect(GetDirectoryReloadStats()?.activeFileAction).toBe('disk-unchanged')
        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(0)
        expect(contentReloadSendCount()).toBe(0)
        expect(appState.currentActiveFile?.content).toBe('待保存的新内容')
        expect(appState.isDirty()).toBe(false)
    })

    it('打开文件后刷新：打开时已记录签名，默认不重读', async () => {
        const caseDir = await makeCaseDir('pf17-open-')
        const filePath = path.join(caseDir, 'opened.md')
        await fs.writeFile(filePath, '# 打开的文件', 'utf8')
        appState.rootPath = caseDir

        await OpenSelectFile({ name: 'opened.md', path: filePath, type: 'file', content: '' })
        mainSend.mockClear()

        await ReloadDirFromDisk()

        expect(GetDirectoryReloadStats()?.activeFileAction).toBe('disk-unchanged')
        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(0)
        expect(contentReloadSendCount()).toBe(0)
        expect(appState.currentActiveFile?.content).toBe('# 打开的文件')
    })

    it('无活动文件：统计标记 none 且不触发任何当前文件 IO', async () => {
        const caseDir = await makeCaseDir('pf17-nofile-')
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a', 'utf8')
        appState.rootPath = caseDir

        await ReloadDirFromDisk()

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('none')
        expect(stats?.activeFileDiskReads).toBe(0)
        expect(stats?.activeFileReloaded).toBe(false)
        expect(contentReloadSendCount()).toBe(0)
    })
})

describe('PF-17 与脏状态保护的组合行为', () => {
    it('未保存修改 + 磁盘签名未变化：静默短路（不重读、不覆盖、不重复告警）', async () => {
        await setupCleanActiveFile('pf17-dirty-same-', '磁盘内容')
        // 用户编辑（长度相同，避免长度快路径直接判脏之外还要验证签名短路优先级）
        appState.currentActiveFile!.content = '内存内容'
        expect(appState.isDirty()).toBe(true)
        mainSend.mockClear()

        await ReloadDirFromDisk()

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('disk-unchanged')
        expect(stats?.activeFileDiskReads).toBe(0)
        expect(appState.currentActiveFile?.content).toBe('内存内容')
        expect(appState.isDirty()).toBe(true)
        expect(contentReloadSendCount()).toBe(0)
        // 磁盘未变化时无需提示「跳过重载」
        const warningCalls = mainSend.mock.calls.filter(
            (call) =>
                call[0] === 'baize:status-bar:update' &&
                (call[1] as { type?: string }).type === 'warning'
        )
        expect(warningCalls).toHaveLength(0)
    })

    it('未保存修改 + 磁盘已变化：保持 FUN-06 行为——告警且不覆盖内存内容', async () => {
        const { filePath } = await setupCleanActiveFile('pf17-dirty-changed-', '磁盘旧内容')
        appState.currentActiveFile!.content = '用户未保存的修改'
        expect(appState.isDirty()).toBe(true)
        mainSend.mockClear()

        // 外部程序修改磁盘文件
        await fs.writeFile(filePath, '外部程序写入的新内容', 'utf8')
        await fs.utimes(filePath, new Date(), new Date(Date.now() + 5000))

        await ReloadDirFromDisk()

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('dirty-skipped')
        expect(stats?.activeFileDiskReads).toBe(0)
        expect(appState.currentActiveFile?.content).toBe('用户未保存的修改')
        expect(contentReloadSendCount()).toBe(0)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'warning' })
        )
    })
})

describe('PF-17 watcher 批次下的当前文件处理', () => {
    it('mtime 变化但内容相同：读一次但不重发编辑器内容，随后签名更新为短路', async () => {
        const { filePath } = await setupCleanActiveFile('pf17-watch-same-', '内容未变化')

        // 模拟外部 touch：内容相同、mtime 前移
        await fs.utimes(filePath, new Date(), new Date(Date.now() + 5000))

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['active.md'] })

        const stats = GetDirectoryReloadStats()
        expect(stats?.activeFileAction).toBe('content-unchanged')
        expect(stats?.activeFileDiskReads).toBe(1)
        // PF-05：内容相同不重置编辑器（不发送 file-content-reloaded）
        expect(contentReloadSendCount()).toBe(0)

        mainSend.mockClear()
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['active.md'] })
        expect(GetDirectoryReloadStats()?.activeFileAction).toBe('disk-unchanged')
        expect(GetDirectoryReloadStats()?.activeFileDiskReads).toBe(0)
    })

    it('watcher 批次其他文件变化且目录树不变：整树 JSON 不重发（PF-14 指纹去重）', async () => {
        const caseDir = await makeCaseDir('pf17-watch-tree-')
        await fs.mkdir(path.join(caseDir, 'sub'))
        const targetFile = path.join(caseDir, 'sub', 'a.md')
        await fs.writeFile(targetFile, 'a', 'utf8')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        mainSend.mockClear()

        // 子树内文件内容变化（文件集合不变）：局部重扫后整树 JSON 未变化
        await fs.writeFile(targetFile, 'a changed', 'utf8')
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['sub/a.md'] })

        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('incremental')
        expect(stats?.rescanDirs).toBe(1)
        // 整树 JSON 只存指纹去重：内容未变时不重复发送
        expect(stats?.treeSent).toBe(false)
        expect(treeSendCount()).toBe(0)

        // 新增文件后整树确实变化，正常发送
        await fs.writeFile(path.join(caseDir, 'sub', 'b.md'), 'b', 'utf8')
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['sub/b.md'] })
        expect(GetDirectoryReloadStats()?.treeSent).toBe(true)
        expect(treeSendCount()).toBe(1)
    })
})
