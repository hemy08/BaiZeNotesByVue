/**
 * 目录树扫描、fs.watch 监听与目录刷新模块（主进程）
 *
 * CQ-7：从 file-operations.ts 拆出（原文件 2,390 行 → 多模块）。原文件中「目录树 /
 * 目录监听 / 目录刷新」的代码与模块级状态彼此强耦合（watcher 句柄、自身写入抑制窗口的
 * 消费方、整树指纹、增量重扫索引、刷新统计），集中在本模块保证「状态与职责同模块」，
 * 且不反向依赖 file-operations.ts 的核心文件操作（无循环依赖）。
 *
 * 职责：
 * - 目录扫描与树构建（TraverseDirectory、有界并发 readdir、路径派生稳定节点 id）；
 * - PF-05 目录 fs.watch 监听（批次合并、自身写入回环抑制、异常降级、退出清理）；
 * - PF-4 目录树增量重扫（变更路径折叠为受影响子树、索引维护、失败回退全量）；
 * - ReloadDirFromDisk：目录树刷新 + 当前活动文件重读（PF-17 磁盘签名短路）。
 *
 * 依赖方向：directory-tree → { shared, file-encoding, path-utils, app-state, security }；
 * 对外的目录树/监听 API 由 file-operations.ts re-export 保持既有 import 路径不变。
 */

import path from 'path'
import { promises as fs, watch } from 'fs'
import type { Dirent, FSWatcher } from 'fs'
// ARC-13：FileItem 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileItem } from '../../../shared/types'
import { logger } from '../logger'
// PF-4：全量扫描后构建根节点（保持原 BuildFileTree 语义）
import { BuildFileTree } from './path-utils'
import { showErrorMessageBox } from './dialog-helpers'
// P2 非空断言治理：主窗口安全访问统一由 app-state 提供（判空 + isDestroyed + 发送异常兜底）
import { appState, fingerprintText, sendToMainWindow } from '../app-state'
import { IPC } from '../../../shared/ipc-channels'
import { tMain } from '../i18n'
// P1-AS-1/AS-2：工作区根形状校验 + 当前文件重读前的路径守卫
import { assertSafePath, isSafeWorkspaceRoot } from '../security'
// PF-10：当前活动文件重读走自适应读取（大文件流式分块）
import { ReadFileContentAdaptive } from './file-encoding'
// CQ-7：跨模块共享小工具（路径守卫提示 / 自身写入窗口 / 当前文件磁盘签名）
import {
    describePathDeniedError,
    isSelfWriteWindow,
    rememberActiveFileDiskStamp,
    refreshActiveFileDiskStamp,
    resetSelfWriteWindow
} from './shared'

// 重新加载时间
const reloadFromDiskTime = 500

// ==================== PF-05：目录树 fs.watch 增量监听 ====================
// 背景（docs/reports/md/02-性能检查报告.md PF-05）：此前目录树任何增删改都依赖
// 500ms 后的全量 ReloadDirFromDisk 重扫，外部程序改动文件也不会自动出现在目录树。
// 本轮为主进程当前打开的目录建立 fs.watch 监听：
//   1. 事件按 500ms 固定窗口合并，每批只触发一次刷新（复用 ReloadDirFromDisk 全量重扫；
//      增量 patch 协议与渲染端虚拟滚动不在本轮范围）；
//   2. 应用自身写盘/目录操作产生的回环事件通过"自身写入窗口"抑制，避免事件风暴；
//   3. 生命周期：目录切换/退出时关闭旧 watcher；ENOSPC、目录被删等异常自动降级为
//      原全量刷新模式（保留操作后刷新与手动"从磁盘重新加载"），并 logger.warn。
const WATCH_BATCH_WINDOW_MS = 500
const WATCH_LOG_PATH_LIMIT = 10

// ==================== PF-4：目录树增量重扫（并行于 PF-05 监听） ====================
// 背景（out/full-scan/perf.md PF-4）：fs.watch 触发的刷新此前一律「全量递归扫描 + 整树 JSON」，
// 本仓库 node_modules 样本实测 280~339 ms/次，任何外部改动（git 操作、编辑器临时文件）都会重复。
// 本轮在保留「首次打开 / 目录操作后全量扫描」语义不变的前提下增加：
//   1. 变更路径折叠为「受影响目录」集合（同目录多次变更、父子目录嵌套只保留最上层）；
//   2. 受影响目录数 ≤ INCREMENTAL_RESCAN_MAX_DIRS 时只重扫这些目录子树，并就地合并进现有树；
//   3. 变更路径超过 INCREMENTAL_MAX_CHANGED_PATHS / 涉及新目录（树中不存在）/ 涉及工作区根 /
//      无法解析时，回退全量扫描（行为与优化前一致，保证正确性优先）；
//   4. 目录扫描改用 readdir({ withFileTypes: true }) 替代「逐条目 lstat」，消除每条目一次系统调用；
//   5. 树节点 id 改为「路径派生的稳定 id」，整树 JSON 因此在内容未变时逐字节稳定，
//      可继续用字符串比较去重（随机 id 会让每次刷新都被判为变化，导致无谓 IPC/DOM 重建）；
//   6. 依赖/VCS 目录（node_modules/.git 等）不进入目录树、也不触发刷新（PF-5 建议的大目录排除）。
const INCREMENTAL_RESCAN_MAX_DIRS = 8
const INCREMENTAL_MAX_CHANGED_PATHS = 200
const FS_SCAN_CONCURRENCY = 64
/** 目录扫描/监听排除的依赖与版本控制目录（不在笔记树中展示，且体量通常极大） */
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', '.git', '.svn', '.hg', '.idea', '.vscode'])
/** 目录树支持展示的文件扩展名（大小写敏感，保持优化前行为） */
const SUPPORTED_FILE_EXTENSIONS = new Set([
    '.md',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.pdf',
    '.txt',
    '.html'
])

/** 最近一次目录刷新的统计（诊断/量化/单元测试断言用，PF-4） */
export interface DirectoryReloadStats {
    /** full=全量扫描；incremental=只重扫受影响子树；skipped=变更全部被忽略，未扫描 */
    mode: 'full' | 'incremental' | 'skipped'
    /** 本次局部重扫的目录数（full/skipped 时为 0） */
    rescanDirs: number
    /** 本次批次收到的变更路径数 */
    changedPaths: number
    /** 刷新总耗时（ms） */
    elapsedMs: number
    /** 本次是否向渲染进程发送了 FILE_SYSTEM_DATA（整树 JSON） */
    treeSent: boolean
    /** 整树 JSON 字符数（treeSent 时为实际发送量） */
    treeJsonChars: number
    /**
     * PF-17：本次刷新是否成功重读了当前活动文件全文。
     * false 表示未发生整篇读取（无活动文件 / 磁盘签名未变化 / 脏跳过 / 读取失败）。
     */
    activeFileReloaded: boolean
    /**
     * PF-17：当前活动文件的处理结果（诊断/量化用）。
     * - none：无活动文件
     * - disk-unchanged：mtime+size 与上次记录一致，跳过重读与重发
     * - dirty-skipped：文件脏（有未保存修改），跳过重载并提示
     * - content-unchanged：watcher 批次下重读后内容仍相同，跳过编辑器重载
     * - reread：重读全文并已下发编辑器
     * - error：重读/下发失败
     */
    activeFileAction:
        'none' | 'disk-unchanged' | 'dirty-skipped' | 'content-unchanged' | 'reread' | 'error'
    /** PF-17：本次刷新对当前活动文件执行的整篇读取次数（0 或 1，仅统计实际调用读取器） */
    activeFileDiskReads: number
    /** 增量/回退的判定原因（诊断用） */
    reason: string
}

/** 目录监听状态（供诊断与单元测试断言使用） */
export interface DirectoryWatchStatus {
    /** 是否存在活跃的 fs.watch 监听 */
    active: boolean
    /** 当前监听的根目录（未监听时为空字符串） */
    rootPath: string
    /** 是否使用 recursive 递归监听（平台不支持时会降级为仅监听根目录） */
    recursive: boolean
    /** 是否已因异常降级为原全量刷新模式 */
    degraded: boolean
    /** 是否有待处理的变更批次 */
    batchPending: boolean
}

let directoryWatcher: FSWatcher | null = null
let watchedRootPath = ''
let watcherRecursive = false
let watcherDegraded = false
// 已降级的根目录：同一目录不再反复重试（目录切换时解除降级、重新尝试监听）
let degradedRootPath = ''
let watchBatchTimer: NodeJS.Timeout | null = null
// 应用自身目录操作去重后的统一刷新计时器（PF-05：同一批变更只处理一次）
let scheduledReloadTimer: NodeJS.Timeout | null = null
const pendingWatchChanges = new Set<string>()
// 自身写入抑制窗口状态已随「写盘/改目录」职责拆到 shared.ts（本模块只消费 isSelfWriteWindow）
// 上一次发送给渲染进程的目录树「指纹」与根目录（watcher 批次触发时用于去重，避免重复 IPC）
// PF-14：原实现保留上一份整树 JSON 字符串（对象树之外的第二份整树数据，大目录 0.8~数 MiB），
// 改为只保留 sha256 指纹：语义等价（内容未变则跳过 IPC），内存占用从 O(树大小) 降为 O(1)。
let lastSentTreeHash: string | null = null
let lastSentTreeRootPath = ''
// PF-4：当前树「文件夹路径 → 节点」索引（规范化路径键），用于把变更路径映射到可局部重扫的子树
let treeFolderIndex: Map<string, FileItem> | null = null
let treeFolderIndexRootPath = ''
// PF-4：最近一次目录刷新统计（诊断/测试用）
let lastReloadStats: DirectoryReloadStats | null = null

/**
 * PF-05：调度一次目录刷新（500ms 后执行）。
 * 应用自身目录操作与 fs.watch 外部变更批次共用该入口：已有待处理批次时直接合并，
 * 保证"同一批变更只处理一次"，避免事件风暴下重复全量重扫。
 */
export function ScheduleReloadFromDisk(): void {
    if (scheduledReloadTimer) {
        return
    }
    scheduledReloadTimer = setTimeout(() => {
        scheduledReloadTimer = null
        void ReloadDirFromDisk().catch((err: unknown) => {
            logger.error('Failed to reload from disk:', err)
        })
    }, reloadFromDiskTime)
}

/** 清空 watcher 批次计时器（PF-05） */
function clearWatchBatchTimer(): void {
    if (watchBatchTimer) {
        clearTimeout(watchBatchTimer)
        watchBatchTimer = null
    }
}

/** 清空应用自身目录操作的合并刷新计时器（PF-05，仅退出清理时使用） */
function clearScheduledReloadTimer(): void {
    if (scheduledReloadTimer) {
        clearTimeout(scheduledReloadTimer)
        scheduledReloadTimer = null
    }
}

/**
 * 处理 fs.watch 原始事件（PF-05）：自身写入回环直接忽略；
 * 其余事件累积到当前批次，500ms 窗口内多次事件只刷新一次。
 */
function handleWatchEvent(eventType: 'rename' | 'change', filename: string | Buffer | null): void {
    try {
        const changedPath = filename === null ? '' : String(filename)
        if (isSelfWriteWindow()) {
            // 自身写入抑制：不做刷新（调用方已有显式刷新或本就无需刷新，如保存内容）
            logger.debug('忽略应用自身写入产生的目录监听事件（PF-05）', eventType, changedPath)
            return
        }
        // PF-4/PF-5：依赖/VCS 目录不进入笔记树，其内部事件不参与刷新（避免 node_modules 事件风暴）
        if (
            changedPath &&
            appState.rootPath &&
            isPathInSkippedDirectory(
                appState.rootPath,
                path.resolve(appState.rootPath, changedPath)
            )
        ) {
            logger.debug(
                '忽略被排除目录（node_modules/.git 等）内的监听事件（PF-4）',
                eventType,
                changedPath
            )
            return
        }
        if (changedPath) {
            pendingWatchChanges.add(changedPath)
        }
        scheduleWatchBatch()
    } catch (err) {
        // watcher 回调内的异常一律降级，保证主进程不因监听失败崩溃
        DegradeDirectoryWatch(err)
    }
}

/** 调度 watcher 批次刷新：固定窗口合并，窗口内只刷新一次（PF-05） */
function scheduleWatchBatch(): void {
    if (watchBatchTimer) {
        return
    }
    watchBatchTimer = setTimeout(() => {
        watchBatchTimer = null
        void runWatchBatch().catch((err: unknown) => {
            // 兜底：批次刷新内部已 try/catch，此处只防御未预料的异步异常
            logger.error('[PF-05] 目录监听批次处理异常：', err)
        })
    }, WATCH_BATCH_WINDOW_MS)
}

/** 执行一批 watcher 变更刷新（PF-05） */
async function runWatchBatch(): Promise<void> {
    const changedPaths = Array.from(pendingWatchChanges)
    pendingWatchChanges.clear()
    try {
        if (!appState.rootPath) {
            stopDirectoryWatcher()
            return
        }
        // 监听目录被外部删除/移动：关闭监听并降级，不触发无意义的全量刷新与弹窗
        try {
            await fs.access(appState.rootPath)
        } catch {
            logger.warn(
                '[PF-05] 监听目录已不存在，关闭目录监听并降级为原全量刷新模式：',
                appState.rootPath
            )
            DegradeDirectoryWatch(new Error('监听目录已不存在'))
            return
        }
        logger.debug(
            '目录监听检测到外部变更，合并为一次刷新（PF-05）',
            changedPaths.slice(0, WATCH_LOG_PATH_LIMIT),
            changedPaths.length
        )
        // PF-4：把合并后的变更路径交给刷新逻辑做「局部重扫」规划
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths })
    } catch (err) {
        // 刷新失败不应拖垮主进程：记录并保持监听（真正的监听异常由 error 事件降级）
        logger.error('[PF-05] 目录监听批次刷新失败：', err)
    }
}

/**
 * PF-05：目录监听异常（ENOSPC/目录被删/权限等）统一降级入口。
 * 关闭 watcher 并标记降级，此后目录刷新回到原有"操作后/手动全量 ReloadDirFromDisk"模式；
 * 导出以便单元测试直接断言降级行为（生产代码仅由 watcher 的 error 事件与启动失败调用）。
 */
export function DegradeDirectoryWatch(error: unknown): void {
    watcherDegraded = true
    degradedRootPath = appState.rootPath
    // 先关闭并清理计时器，finally 保证即使 close 抛错也完成降级标记
    try {
        stopDirectoryWatcher()
    } finally {
        logger.warn(
            '[PF-05] 目录监听异常，已降级为原全量刷新模式（操作后/手动刷新仍可用）：',
            error
        )
    }
}

/** 关闭当前目录监听并清理批次状态（PF-05，生命周期切换用；OpenDirectory 切换目录前调用） */
export function stopDirectoryWatcher(): void {
    clearWatchBatchTimer()
    pendingWatchChanges.clear()
    const watcher = directoryWatcher
    directoryWatcher = null
    watchedRootPath = ''
    watcherRecursive = false
    if (watcher) {
        try {
            watcher.close()
        } catch {
            // watcher 已失效/已关闭，忽略
        }
    }
}

/**
 * PF-05：退出/关闭窗口时清理目录监听（供 src/main/index.ts 的 cleanupApp 调用）。
 * 关闭 watcher、清空批次与合并刷新计时器，避免退出后回调再访问已销毁的窗口。
 */
export function CleanupDirectoryWatch(): void {
    try {
        stopDirectoryWatcher()
        clearScheduledReloadTimer()
    } finally {
        watcherDegraded = false
        degradedRootPath = ''
        watcherRecursive = false
        resetSelfWriteWindow()
        lastSentTreeHash = null
        lastSentTreeRootPath = ''
        // PF-4：退出时释放增量重扫索引与统计，避免测试/重启后残留旧树引用
        treeFolderIndex = null
        treeFolderIndexRootPath = ''
        lastReloadStats = null
        resetScanSlots()
    }
}

/** 获取当前目录监听状态（诊断/测试用，PF-05） */
export function GetDirectoryWatchStatus(): DirectoryWatchStatus {
    return {
        active: directoryWatcher !== null,
        rootPath: watchedRootPath,
        recursive: watcherRecursive,
        degraded: watcherDegraded,
        batchPending: watchBatchTimer !== null
    }
}

/**
 * 创建目录监听（PF-05）：优先 recursive 递归监听；
 * 平台不支持 recursive（Linux 等）时 try/catch 降级为仅监听根目录；
 * 仍失败则返回 null（上层降级为原全量刷新模式）。
 */
function createDirectoryWatcher(rootPath: string): FSWatcher | null {
    try {
        const watcher = watch(rootPath, { recursive: true }, (eventType, filename) => {
            handleWatchEvent(eventType, filename)
        })
        watcherRecursive = true
        return watcher
    } catch (err) {
        // Node 在 Linux 等平台不支持 recursive：降级为仅监听根目录（外部子目录深层变更
        // 不会自动刷新，仍可通过操作的 500ms 全量刷新与手动"从磁盘重新加载"覆盖）
        logger.warn(
            '[PF-05] 当前平台 fs.watch 不支持 recursive，降级为仅监听根目录：',
            rootPath,
            err
        )
    }
    try {
        const watcher = watch(rootPath, (eventType, filename) => {
            handleWatchEvent(eventType, filename)
        })
        watcherRecursive = false
        return watcher
    } catch (err) {
        logger.warn('[PF-05] 目录监听启动失败，保持原全量刷新模式：', rootPath, err)
        return null
    }
}

/**
 * PF-05：确保 watcher 绑定当前打开的目录（目录切换时关闭旧监听）。
 * 已降级的同一目录不再重试；切换目录后解除降级并重新尝试监听。
 */
function ensureDirectoryWatcher(): void {
    try {
        const rootPath = appState.rootPath
        if (!rootPath) {
            stopDirectoryWatcher()
            return
        }
        if (directoryWatcher && watchedRootPath === rootPath) {
            return
        }
        // 目录切换：先关闭旧目录的 watcher（PF-05 生命周期）
        stopDirectoryWatcher()
        // 目录已变化：解除上一个目录的降级标记，允许对新目录重新尝试监听
        if (degradedRootPath !== rootPath) {
            watcherDegraded = false
            degradedRootPath = ''
        }
        if (watcherDegraded) {
            return
        }
        const watcher = createDirectoryWatcher(rootPath)
        if (!watcher) {
            watcherDegraded = true
            degradedRootPath = rootPath
            return
        }
        watcher.on('error', (error: unknown) => {
            DegradeDirectoryWatch(error)
        })
        directoryWatcher = watcher
        watchedRootPath = rootPath
        logger.debug(
            '目录监听已启动（PF-05）',
            rootPath,
            watcherRecursive ? 'recursive' : '仅根目录'
        )
    } catch (err) {
        DegradeDirectoryWatch(err)
    }
}

/* ==================== PF-4：目录增量重扫工具 ==================== */

/** 规范化路径键：绝对路径 + Windows 大小写不敏感（用于树节点定位与变更路径匹配） */
function normalizePathKey(targetPath: string): string {
    const resolved = path.resolve(targetPath)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** child 是否等于 parent 或位于 parent 目录之下（入参必须是 normalizePathKey 的结果） */
function isSameOrInsidePath(childKey: string, parentKey: string): boolean {
    if (childKey === parentKey) {
        return true
    }
    const parentWithSeparator = parentKey.endsWith(path.sep) ? parentKey : parentKey + path.sep
    return childKey.startsWith(parentWithSeparator)
}

/**
 * PF-4/PF-5：相对工作区根的路径是否位于被跳过的依赖/VCS 目录内。
 * 这些目录不进入目录树，其变更事件也不应触发刷新（避免 node_modules 事件风暴）。
 */
function isPathInSkippedDirectory(rootPath: string, targetPath: string): boolean {
    const relative = path.relative(rootPath, targetPath)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false
    }
    return relative.split(path.sep).some((segment) => SKIPPED_DIRECTORY_NAMES.has(segment))
}

/** 目录名是否属于扫描排除项（PF-4：node_modules/.git 等不进入笔记树） */
function shouldSkipDirectoryName(dirName: string): boolean {
    return SKIPPED_DIRECTORY_NAMES.has(dirName)
}

/**
 * PF-4：由绝对路径生成稳定的节点 id（FNV-1a 32 位 → base36）。
 * 原实现为每条目随机 id，导致同一目录两次扫描得到的整树 JSON 永远不同：
 * watcher 批次的「JSON 未变化则跳过 IPC」永远失效，渲染层还会因节点对象更换重建 DOM。
 */
function buildStableItemId(targetPath: string): string {
    const key = normalizePathKey(targetPath)
    let hash = 0x811c9dc5
    for (let index = 0; index < key.length; index += 1) {
        hash ^= key.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(36)
}

// 目录扫描并发闸门（PF-4）：只限制 readdir 系统调用并发，递归等待子目录时不占名额，因此不会死锁
let activeScanSlots = 0
const scanSlotWaiters: Array<() => void> = []

/** 获取一个目录扫描名额（上限 FS_SCAN_CONCURRENCY） */
async function acquireScanSlot(): Promise<void> {
    if (activeScanSlots < FS_SCAN_CONCURRENCY) {
        activeScanSlots += 1
        return
    }
    await new Promise<void>((resolve) => {
        scanSlotWaiters.push(resolve)
    })
}

/** 释放目录扫描名额：优先把名额直接转交给等待者（不减少活跃数） */
function releaseScanSlot(): void {
    const next = scanSlotWaiters.shift()
    if (next) {
        next()
        return
    }
    activeScanSlots = Math.max(0, activeScanSlots - 1)
}

/** 测试/退出时复位扫描闸门状态（生产代码仅在 CleanupDirectoryWatch 调用） */
function resetScanSlots(): void {
    activeScanSlots = 0
    scanSlotWaiters.length = 0
}

/**
 * PF-4：有界并发的 readdir（withFileTypes，免去逐条目 lstat）。
 * 读取失败（权限/目录被删）直接抛出，由上层决定「子树置空」还是「全量回退」。
 */
async function readDirectoryEntries(dirPath: string): Promise<Dirent[]> {
    await acquireScanSlot()
    try {
        return await fs.readdir(dirPath, { withFileTypes: true })
    } finally {
        releaseScanSlot()
    }
}

/**
 * PF-4：递归扫描单个目录子树（返回该目录的直接子项，目录项 children 已递归填充）。
 * 与旧 TraverseDirectory 的差异：
 * - readdir({ withFileTypes }) 直接从目录项取类型，不再对每个条目 lstat；
 * - readdir 并发有上限（FS_SCAN_CONCURRENCY），避免大目录一次压满 libuv 线程池；
 * - 子目录读取失败时该目录 children 置空（旧实现同样会丢弃失败条目/子树），不中断整树。
 */
async function scanDirectoryTree(dirPath: string): Promise<FileItem[]> {
    const entries = await readDirectoryEntries(dirPath)
    const items: FileItem[] = []

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
            if (shouldSkipDirectoryName(entry.name)) {
                continue
            }
            items.push({
                id: buildStableItemId(fullPath),
                name: entry.name,
                path: fullPath,
                type: 'folder',
                fileExtension: '',
                isDirectory: true,
                children: []
            } as FileItem)
            continue
        }
        const extension = path.extname(entry.name)
        if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
            continue
        }
        items.push({
            id: buildStableItemId(fullPath),
            name: entry.name,
            path: fullPath,
            type: 'file',
            fileExtension: extension,
            isDirectory: false,
            children: []
        } as FileItem)
    }

    await Promise.all(
        items.map(async (item) => {
            if (!item.isDirectory) {
                return
            }
            try {
                item.children = await scanDirectoryTree(item.path)
            } catch (error) {
                // 单个子目录不可读（权限/删除竞态）：保留空子树，不拖垮整次扫描
                logger.warn('[PF-4] 子目录扫描失败，已置为空子树：', item.path, error)
                item.children = []
            }
        })
    )

    return items
}

/** PF-4：从整树建立「文件夹路径键 → 节点」索引（根节点路径必须与当前工作区一致） */
function indexTreeFolders(tree: FileItem[] | null, rootPath: string): Map<string, FileItem> | null {
    if (!Array.isArray(tree) || tree.length === 0) {
        return null
    }
    const rootNode = tree[0]
    if (!rootNode || normalizePathKey(rootNode.path) !== normalizePathKey(rootPath)) {
        return null
    }
    const index = new Map<string, FileItem>()
    const stack: FileItem[] = [rootNode]
    while (stack.length > 0) {
        const node = stack.pop() as FileItem
        if (node.isDirectory) {
            index.set(normalizePathKey(node.path), node)
        }
        for (const child of node.children ?? []) {
            if (child.isDirectory) {
                stack.push(child)
            }
        }
    }
    return index
}

/** PF-4：把子树内的文件夹节点加入索引 */
function addFolderKeysToIndex(index: Map<string, FileItem>, children: FileItem[]): void {
    const stack: FileItem[] = [...children]
    while (stack.length > 0) {
        const node = stack.pop() as FileItem
        if (!node.isDirectory) {
            continue
        }
        index.set(normalizePathKey(node.path), node)
        for (const child of node.children ?? []) {
            stack.push(child)
        }
    }
}

/** PF-4：把子树内的文件夹节点从索引移除（节点被整体重扫替换前调用） */
function removeFolderKeysFromIndex(index: Map<string, FileItem>, children: FileItem[]): void {
    const stack: FileItem[] = [...children]
    while (stack.length > 0) {
        const node = stack.pop() as FileItem
        if (!node.isDirectory) {
            continue
        }
        index.delete(normalizePathKey(node.path))
        for (const child of node.children ?? []) {
            stack.push(child)
        }
    }
}

/** PF-4：增量重扫计划（变更路径 → 可局部重建的目录子树） */
interface IncrementalRescanPlan {
    /** 需要局部重扫的目录（已折叠嵌套、按路径排序，父目录在前） */
    directories: string[]
    /** 是否必须回退全量扫描 */
    fullRescan: boolean
    /** 判定原因（诊断用） */
    reason: string
    /** 被忽略的变更数（工作区外/被跳过目录内） */
    ignoredChanges: number
}

/**
 * PF-4：根据 fs.watch 变更路径规划局部重扫。
 *
 * 规则：
 * 1. 每条变更先解析为绝对路径并 stat：仍存在且是目录 → 以该目录为子树根；
 *    其余（文件/已删除/stat 失败）→ 以父目录为子树根；
 * 2. 折叠嵌套：父子目录同时受影响时只重扫最上层（重扫父目录已包含子目录）；
 * 3. 受影响目录必须已存在于当前树索引中——新目录（树里还没有）与涉及工作区根的情况
 *    回退全量扫描，保证新增目录/根目录变更不会漏；
 * 4. 目录数超过 INCREMENTAL_RESCAN_MAX_DIRS 或变更路径超过 INCREMENTAL_MAX_CHANGED_PATHS
 *    时回退全量扫描（避免「局部重扫」退化成一堆小扫描）。
 */
async function planIncrementalRescan(
    rootPath: string,
    changedPaths: string[],
    folderIndex: Map<string, FileItem>
): Promise<IncrementalRescanPlan> {
    if (changedPaths.length === 0) {
        return { directories: [], fullRescan: true, reason: 'no-changed-paths', ignoredChanges: 0 }
    }
    if (changedPaths.length > INCREMENTAL_MAX_CHANGED_PATHS) {
        return {
            directories: [],
            fullRescan: true,
            reason: 'too-many-changed-paths',
            ignoredChanges: 0
        }
    }
    const rootKey = normalizePathKey(rootPath)
    const candidates: string[] = []
    let ignoredChanges = 0

    for (const changedPath of changedPaths) {
        const absolutePath = path.resolve(rootPath, changedPath)
        if (!isSameOrInsidePath(normalizePathKey(absolutePath), rootKey)) {
            // watcher 理论上不会给出工作区外路径；出现时忽略，不因此触发全量扫描
            ignoredChanges += 1
            continue
        }
        if (isPathInSkippedDirectory(rootPath, absolutePath)) {
            ignoredChanges += 1
            continue
        }
        let stats: { isDirectory(): boolean } | null = null
        try {
            stats = await fs.lstat(absolutePath)
        } catch {
            // ENOENT：条目被删除/重命名，按父目录处理
            stats = null
        }
        const candidateDir =
            stats && stats.isDirectory() ? absolutePath : path.dirname(absolutePath)
        if (normalizePathKey(candidateDir) === rootKey) {
            return { directories: [], fullRescan: true, reason: 'root-affected', ignoredChanges }
        }
        if (!folderIndex.has(normalizePathKey(candidateDir))) {
            // 新目录（或路径未被当前树收录）：无法安全合并，回退全量扫描
            return {
                directories: [],
                fullRescan: true,
                reason: 'unknown-directory',
                ignoredChanges
            }
        }
        candidates.push(candidateDir)
    }

    if (candidates.length === 0) {
        return { directories: [], fullRescan: false, reason: 'all-changes-ignored', ignoredChanges }
    }

    // 折叠嵌套目录：按路径长度升序保留最短（祖先）目录
    const sorted = [...candidates].sort((a, b) => a.length - b.length)
    const collapsed: string[] = []
    for (const candidate of sorted) {
        const candidateKey = normalizePathKey(candidate)
        const covered = collapsed.some((kept) =>
            isSameOrInsidePath(candidateKey, normalizePathKey(kept))
        )
        if (!covered) {
            collapsed.push(candidate)
        }
    }
    if (collapsed.length > INCREMENTAL_RESCAN_MAX_DIRS) {
        return {
            directories: [],
            fullRescan: true,
            reason: 'too-many-affected-dirs',
            ignoredChanges
        }
    }
    return {
        directories: collapsed.sort(),
        fullRescan: false,
        reason: 'incremental',
        ignoredChanges
    }
}

/** PF-4：读取最近一次目录刷新统计（诊断/单元测试用） */
export function GetDirectoryReloadStats(): DirectoryReloadStats | null {
    return lastReloadStats ? { ...lastReloadStats } : null
}

/**
 * 递归读取目录中的文件，并构建目录树
 * 支持的文件类型：.md, .png, .jpg, .jpeg, .svg, .pdf, .txt, .html
 * PF-4：实现改为 readdir({ withFileTypes }) + 有界并发递归（见 scanDirectoryTree）；
 * 外部 API（入参/回调/条目结构）保持不变。
 * @param dirPath 目录路径
 * @param callback 回调函数，返回文件树结构
 */
export async function TraverseDirectory(
    dirPath: string,
    callback: (fileItems: FileItem[]) => void
): Promise<void> {
    let tree: FileItem[]
    try {
        tree = await scanDirectoryTree(dirPath)
    } catch {
        // FUN-27：用户可见提示统一中文
        showErrorMessageBox(tMain('mainMsg.file.directoryListFailed'))
        return
    }
    callback(tree)
}

/**
 * PF-17：更新最近一次目录刷新统计中的「当前文件」处理结果。
 * @param action 处理结果
 * @param diskReads 本次是否实际调用了整篇读取（0 或 1）
 */
function recordActiveFileAction(
    action: DirectoryReloadStats['activeFileAction'],
    diskReads: number
): void {
    if (!lastReloadStats) {
        return
    }
    lastReloadStats.activeFileAction = action
    lastReloadStats.activeFileDiskReads = diskReads
    lastReloadStats.activeFileReloaded = action === 'reread' || action === 'content-unchanged'
}

/**
 * ReloadDirFromDisk 的可选参数（PF-05）
 */
export interface ReloadDirFromDiskOptions {
    /**
     * 是否由 fs.watch 外部变更批次触发（内部使用）。
     * true 时：目录树 JSON 与上次发送一致则跳过 IPC，当前文件内容与磁盘一致则跳过编辑器重载，
     * 避免外部事件批次与自身操作刷新重复触发整树 JSON 过 IPC / 无谓重置编辑器。
     */
    fromWatcher?: boolean
    /**
     * PF-4：fs.watch 批次携带的变更路径（相对工作区根，或绝对路径）。
     * 仅当 fromWatcher 为 true 且路径可安全映射到现有树中的目录时才做局部重扫，
     * 其余情况回退全量扫描。
     */
    changedPaths?: string[]
}

/**
 * 从磁盘重新加载目录
 * PF-05：不再由目录操作各自裸 setTimeout，统一由 ScheduleReloadFromDisk 合并触发；
 * 刷新完成后确保 fs.watch 绑定当前目录（目录切换时先关闭旧监听）。
 * PF-4：fs.watch 批次携带 changedPaths 时优先只重扫受影响子树（见 planIncrementalRescan），
 * 失败/不确定时回退全量扫描；整树 JSON 契约保持不变。
 */
export async function ReloadDirFromDisk(options: ReloadDirFromDiskOptions = {}): Promise<void> {
    const reloadStartAt = Date.now()
    if (!appState.rootPath) {
        // PF-05：当前没有打开的目录时确保旧 watcher 已关闭
        stopDirectoryWatcher()
        return
    }
    // P1-AS-1/AS-2 防御深度：工作区根必须是合法的本地/共享子目录绝对路径
    // （拒绝盘符根、相对路径、设备命名空间、UNC 共享根；取值合法性由 OPEN_SPECIFIC_FOLDER 负责）
    if (!isSafeWorkspaceRoot(appState.rootPath)) {
        logger.warn('[Security] 工作区根路径非法，已拒绝递归遍历（P1-AS-1）：', appState.rootPath)
        sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.reloadFromDiskFailed', {
                message: tMain('mainMsg.file.readError.eacces')
            }),
            type: 'error'
        })
        stopDirectoryWatcher()
        return
    }

    const rootPath = appState.rootPath
    let fileTree: FileItem[] = appState.mdFileTree ?? []
    let reloadMode: DirectoryReloadStats['mode'] = 'full'
    let rescanDirs = 0
    let reason = 'full-scan'
    let incrementalApplied = false

    // PF-4：优先尝试局部重扫（仅 watcher 批次、且能映射到现有树中的目录）
    if (options.fromWatcher && Array.isArray(options.changedPaths)) {
        if (
            !treeFolderIndex ||
            treeFolderIndexRootPath !== rootPath ||
            !Array.isArray(appState.mdFileTree)
        ) {
            // 树索引缺失/根目录变化/树被复位（测试或异常路径）：重建索引，失败则走全量扫描
            treeFolderIndex = indexTreeFolders(appState.mdFileTree, rootPath)
            treeFolderIndexRootPath = rootPath
        }
        if (treeFolderIndex) {
            const plan = await planIncrementalRescan(
                rootPath,
                options.changedPaths,
                treeFolderIndex
            )
            if (plan.fullRescan) {
                reason = plan.reason
            } else if (plan.directories.length === 0) {
                // 变更全部位于被排除目录/工作区外：目录树无需刷新
                fileTree = appState.mdFileTree as FileItem[]
                reloadMode = 'skipped'
                reason = plan.reason
                incrementalApplied = true
            } else {
                try {
                    const currentTree = appState.mdFileTree as FileItem[]
                    for (const rescanDir of plan.directories) {
                        const node = treeFolderIndex.get(normalizePathKey(rescanDir))
                        if (!node) {
                            throw new Error(`局部重扫目录不在树索引中: ${rescanDir}`)
                        }
                        removeFolderKeysFromIndex(treeFolderIndex, node.children)
                        node.children = await scanDirectoryTree(rescanDir)
                        addFolderKeysToIndex(treeFolderIndex, node.children)
                    }
                    fileTree = currentTree
                    reloadMode = 'incremental'
                    rescanDirs = plan.directories.length
                    reason = plan.reason
                    incrementalApplied = true
                } catch (err) {
                    // 局部重扫不可信：退回全量扫描（保证目录树正确性优先）
                    logger.warn('[PF-4] 局部重扫失败，回退全量扫描：', err)
                    reason = 'incremental-failed'
                    incrementalApplied = false
                }
            }
        } else {
            reason = 'tree-index-unavailable'
        }
    }

    if (!incrementalApplied) {
        const mdFiles = await new Promise<FileItem[]>((resolve) => {
            TraverseDirectory(rootPath, resolve)
        })
        fileTree = BuildFileTree(rootPath, mdFiles)
        // PF-4：全量扫描后重建「文件夹路径 → 节点」索引，供下一次 watcher 批次做局部重扫
        treeFolderIndex = indexTreeFolders(fileTree, rootPath)
        treeFolderIndexRootPath = rootPath
        reloadMode = 'full'
        // reason 保留「为何回退全量」的判定原因（无增量尝试时默认 full-scan）
    }
    appState.mdFileTree = fileTree

    // PF-05：目录切换时重置树 JSON 去重基准，并确保 watcher 绑定当前打开目录
    if (lastSentTreeRootPath !== rootPath) {
        lastSentTreeRootPath = rootPath
        lastSentTreeHash = null
    }
    ensureDirectoryWatcher()

    // PF-05/PF-4：watcher 批次触发时，整树 JSON 未变化则跳过 IPC（避免重复批次/IPC 风暴）。
    // PF-4：节点 id 已改为路径派生的稳定 id，内容未变时 JSON 逐字节一致，去重才真正生效。
    // PF-14：去重基准只保存 JSON 的 sha256 指纹，不再长期持有上一份整树 JSON 字符串。
    const treeJson = JSON.stringify(fileTree)
    const treeHash = fingerprintText(treeJson)
    let treeSent = false
    if (!options.fromWatcher || treeHash !== lastSentTreeHash) {
        lastSentTreeHash = treeHash
        sendToMainWindow(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, treeJson)
        treeSent = true
    }

    // PF-4：记录本次刷新统计（诊断/量化/测试断言）
    lastReloadStats = {
        mode: reloadMode,
        rescanDirs,
        changedPaths: options.changedPaths?.length ?? 0,
        elapsedMs: Date.now() - reloadStartAt,
        treeSent,
        treeJsonChars: treeJson.length,
        // PF-17：当前文件处理结果在下方重读流程中回填
        activeFileReloaded: false,
        activeFileAction: 'none',
        activeFileDiskReads: 0,
        reason
    }
    if (reloadMode === 'incremental' || reloadMode === 'skipped') {
        logger.debug(
            '[PF-4] 目录局部刷新完成：',
            reloadMode,
            `${rescanDirs} 个子树`,
            `${lastReloadStats.elapsedMs}ms`,
            treeSent ? '已发送目录树' : '目录树未变化'
        )
    }

    // 重新加载当前打开的文件内容
    // PF-17：先比较磁盘签名（mtime + size），未变化则不再重读全文、不再整篇下发；
    // 仅在首次刷新（签名缺失）或磁盘确实变化时才重读。
    const activeFile = appState.currentActiveFile
    if (activeFile && activeFile.path) {
        const activeFilePath = activeFile.path
        let diskStat: { mtimeMs: number; size: number } | null = null
        try {
            diskStat = await fs.stat(activeFilePath)
        } catch (err) {
            // stat 失败（文件被删/无权限）：保持原行为，交给下方读取流程给出用户可见提示
            logger.debug('当前文件 stat 失败，按磁盘签名未知处理（PF-17）', activeFilePath, err)
        }
        const stamp = appState.activeFileDiskStamp
        const diskUnchanged =
            diskStat !== null &&
            stamp !== null &&
            stamp.path === activeFilePath &&
            stamp.mtimeMs === diskStat.mtimeMs &&
            stamp.size === diskStat.size
        if (diskUnchanged) {
            recordActiveFileAction('disk-unchanged', 0)
            logger.debug('当前文件磁盘签名未变化，跳过重读与重发（PF-17）', activeFilePath)
            return
        }
        // D-5/FUN-06：重载前检查脏状态，若脏则不覆盖并通知渲染层
        if (appState.isDirty()) {
            recordActiveFileAction('dirty-skipped', 0)
            logger.warn('当前文件有未保存的修改，跳过从磁盘重新加载', activeFilePath)
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.dirtySkipReload'),
                type: 'warning'
            })
            return
        }
        let readAttempted = false
        try {
            // P1-AS-1：重载读取同样受路径约束（活动文件可能因工作区切换失效）
            assertSafePath(activeFilePath)
            readAttempted = true
            // D-4：按探测到的编码读取文件内容；
            // PF-10：大文件走流式分块读取，避免一次性 Buffer 峰值
            const { content: fileContent, encoding } = await ReadFileContentAdaptive(activeFilePath)
            // PF-05：watcher 批次触发且内容与内存一致时跳过编辑器重载（不重置光标/撤销栈）
            if (options.fromWatcher && fileContent === activeFile.content) {
                // PF-17：mtime 已变化但内容相同（touch/重复保存）：更新签名，避免下次重复读取
                if (diskStat) {
                    rememberActiveFileDiskStamp(activeFilePath, diskStat)
                } else {
                    await refreshActiveFileDiskStamp(activeFilePath)
                }
                recordActiveFileAction('content-unchanged', 1)
                logger.debug(
                    '外部目录变更未影响当前文件内容，跳过编辑器重载（PF-05）',
                    activeFilePath
                )
                return
            }
            activeFile.content = fileContent
            activeFile.encoding = encoding
            // D-1：以磁盘内容为基准重置脏标记
            appState.markFileLoaded(fileContent)
            // PF-17：记录磁盘签名，下一次目录刷新可直接跳过重读
            if (diskStat) {
                rememberActiveFileDiskStamp(activeFilePath, diskStat)
            } else {
                await refreshActiveFileDiskStamp(activeFilePath)
            }
            recordActiveFileAction('reread', 1)
            sendToMainWindow(IPC.EVENTS.FILE_CONTENT_RELOADED, {
                path: activeFilePath,
                content: fileContent
            })
            // FUN-29：状态栏编码显示同步为磁盘文件实际编码
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.reloadedFromDisk', { encoding }),
                type: 'info',
                encoding
            })
        } catch (err) {
            recordActiveFileAction('error', readAttempted ? 1 : 0)
            logger.error('从磁盘重新加载当前文件内容失败', activeFilePath, err)
            // P1-AS-1：路径越界统一转为「没有读取权限」提示，而非把内部异常文案透出
            const deniedMessage = describePathDeniedError(err)
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.reloadFromDiskFailed', {
                    message: deniedMessage ?? (err as Error)?.message ?? String(err)
                }),
                type: deniedMessage !== null ? 'error' : 'warning'
            })
        }
    } else {
        // PF-17：无活动文件时记录 none，便于量化/测试区分「未重读」的原因
        recordActiveFileAction('none', 0)
    }
}
