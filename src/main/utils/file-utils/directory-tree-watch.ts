/**
 * 目录 fs.watch 增量监听（主进程）—— 由 directory-tree.ts 拆出（结构优化第 5 批 5.5）
 *
 * 职责（监听生命周期与事件批次合并）：
 * - 为当前打开目录建立 recursive fs.watch（平台不支持时降级为仅监听根目录）；
 * - 事件按固定窗口合并（WATCH_BATCH_WINDOW_MS），每批只触发一次刷新；
 * - 应用自身写入回环经 shared 的自身写入窗口抑制；
 * - ENOSPC/目录被删等异常统一降级为原全量刷新模式；退出时清理。
 *
 * 依赖方向：directory-tree-watch → { shared, app-state, logger, directory-tree-scan }；
 * 刷新动作由 directory-tree-reload.ts 通过 registerDirectoryWatchBatchHandler 注入，
 * 本模块不反向 import 刷新编排（避免模块循环依赖）。
 * 对外公开 API 仍由 directory-tree.ts 薄壳统一导出，调用方 import 路径不变。
 */

import path from 'path'
import { promises as fs, watch } from 'fs'
import type { FSWatcher } from 'fs'
import { logger } from '../logger'
import { appState } from '../app-state'
// PF-4/PF-5：依赖/VCS 目录的判定与扫描层共用（真源在 directory-tree-scan.ts）
import { isPathInSkippedDirectory } from './directory-tree-scan'
// CQ-7：自身写入抑制窗口状态归 shared（本模块只消费，不重复声明）
import { isSelfWriteWindow } from './shared'

// ==================== PF-05：目录树 fs.watch 增量监听 ====================
// 背景（../../../../docs/wiki/06-历史报告/md/01-检查与扫描/性能检查报告.md PF-05）：此前目录树任何增删改都依赖
// 500ms 后的全量 ReloadDirFromDisk 重扫，外部程序改动文件也不会自动出现在目录树。
// 本轮为主进程当前打开的目录建立 fs.watch 监听：
//   1. 事件按 500ms 固定窗口合并，每批只触发一次刷新（复用 ReloadDirFromDisk 全量重扫；
//      增量 patch 协议与渲染端虚拟滚动不在本轮范围）；
//   2. 应用自身写盘/目录操作产生的回环事件通过"自身写入窗口"抑制，避免事件风暴；
//   3. 生命周期：目录切换/退出时关闭旧 watcher；ENOSPC、目录被删等异常自动降级为
//      原全量刷新模式（保留操作后刷新与手动"从磁盘重新加载"），并 logger.warn。
const WATCH_BATCH_WINDOW_MS = 500
const WATCH_LOG_PATH_LIMIT = 10

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

/**
 * PF-05：监听批次刷新处理器（由 directory-tree-reload.ts 注入，避免模块循环依赖）。
 * 收到一批合并后的变更路径后执行一次目录刷新（含 PF-4 局部重扫规划）。
 */
export type DirectoryWatchBatchHandler = (options: {
    fromWatcher: true
    changedPaths: string[]
}) => Promise<void>

let watchBatchHandler: DirectoryWatchBatchHandler | null = null

/** 注册监听批次刷新处理器（由 directory-tree-reload.ts 在模块初始化时调用一次） */
export function registerDirectoryWatchBatchHandler(handler: DirectoryWatchBatchHandler): void {
    watchBatchHandler = handler
}

let directoryWatcher: FSWatcher | null = null
let watchedRootPath = ''
let watcherRecursive = false
let watcherDegraded = false
// 已降级的根目录：同一目录不再反复重试（目录切换时解除降级、重新尝试监听）
let degradedRootPath = ''
let watchBatchTimer: NodeJS.Timeout | null = null
const pendingWatchChanges = new Set<string>()

/** 清空 watcher 批次计时器（PF-05） */
function clearWatchBatchTimer(): void {
    if (watchBatchTimer) {
        clearTimeout(watchBatchTimer)
        watchBatchTimer = null
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
        // PF-4/PF-05：把合并后的变更路径交给刷新逻辑做「局部重扫」规划
        if (!watchBatchHandler) {
            // 刷新编排模块未注册（理论上不会发生）：记录并保持监听，避免批次静默丢失
            logger.error('[PF-05] 目录监听批次处理器未注册，本批变更已忽略')
            return
        }
        await watchBatchHandler({ fromWatcher: true, changedPaths })
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
export function ensureDirectoryWatcher(): void {
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

/** 退出清理时复位降级标记与批次状态（由 directory-tree-reload.ts 的 CleanupDirectoryWatch 调用） */
export function resetDirectoryWatchState(): void {
    watcherDegraded = false
    degradedRootPath = ''
    watcherRecursive = false
}
