/**
 * 目录树刷新与当前文件重读编排（主进程）—— 由 directory-tree.ts 拆出（结构优化第 5 批 5.5）
 *
 * 职责（刷新编排层，状态与职责同模块）：
 * - ScheduleReloadFromDisk：目录操作/监听批次的 500ms 合并刷新；
 * - ReloadDirFromDisk：目录树刷新（PF-4 局部重扫优先、失败回退全量）+ 整树 IPC 去重 +
 *   当前活动文件的重读/下发（PF-17 磁盘签名短路、PF-05 自身写入去重）；
 * - CleanupDirectoryWatch：退出清理（watcher / 计时器 / 索引 / 统计 / 扫描闸门统一复位）；
 * - 刷新统计（诊断/量化/测试断言）。
 *
 * 依赖方向：directory-tree-reload → { shared, app-state, security, file-encoding,
 * path-utils, directory-tree-scan, directory-tree-watch }；
 * 监听模块通过 registerDirectoryWatchBatchHandler 反向接收本模块的刷新入口（无模块循环依赖）。
 * 对外公开 API 仍由 directory-tree.ts 薄壳统一导出，调用方 import 路径不变。
 */

import { promises as fs } from 'fs'
import type { FileItem } from '../../../shared/types'
import { logger } from '../logger'
// PF-4：全量扫描后构建根节点（保持原 BuildFileTree 语义）
import { BuildFileTree } from './path-utils'
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
    rememberActiveFileDiskStamp,
    refreshActiveFileDiskStamp,
    resetSelfWriteWindow
} from './shared'
// PF-4：局部重扫规划与树索引（实现见 directory-tree-scan.ts）
import {
    addFolderKeysToIndex,
    buildStableItemId,
    indexTreeFolders,
    normalizePathKey,
    planIncrementalRescan,
    removeFolderKeysFromIndex,
    resetScanSlots,
    scanDirectoryTree,
    TraverseDirectory
} from './directory-tree-scan'
// PF-05：目录监听生命周期与批次刷新（本模块向监听模块注入刷新入口）
import {
    ensureDirectoryWatcher,
    registerDirectoryWatchBatchHandler,
    resetDirectoryWatchState,
    stopDirectoryWatcher
} from './directory-tree-watch'

// 重新加载时间
const reloadFromDiskTime = 500

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

// 应用自身目录操作去重后的统一刷新计时器（PF-05：同一批变更只处理一次）
let scheduledReloadTimer: NodeJS.Timeout | null = null
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

/** 清空应用自身目录操作的合并刷新计时器（PF-05，仅退出清理时使用） */
function clearScheduledReloadTimer(): void {
    if (scheduledReloadTimer) {
        clearTimeout(scheduledReloadTimer)
        scheduledReloadTimer = null
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
        resetDirectoryWatchState()
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

/** PF-4：读取最近一次目录刷新统计（诊断/单元测试用） */
export function GetDirectoryReloadStats(): DirectoryReloadStats | null {
    return lastReloadStats ? { ...lastReloadStats } : null
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
        // 第 2 批：根节点 id 与子节点同源（路径派生稳定 id），保证整树 JSON 两次扫描一致
        fileTree = BuildFileTree(rootPath, mdFiles, buildStableItemId(rootPath))
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

// PF-05：把刷新编排注入监听模块（保持 watch → reload 单向依赖，避免模块循环 import）
registerDirectoryWatchBatchHandler((options) => ReloadDirFromDisk(options))
