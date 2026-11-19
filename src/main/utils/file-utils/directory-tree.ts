/**
 * 目录树扫描、fs.watch 监听与目录刷新模块（主进程）—— 薄壳聚合导出
 *
 * CQ-7：从 file-operations.ts 拆出（原文件 2,390 行 → 多模块）。
 *
 * 结构优化第 5 批 5.5：本模块（原 1,021 行）按职责再拆为同目录三个子模块，
 * 本文件仅保留聚合 re-export（对外 API 与 import 路径零改动）：
 * - directory-tree-scan.ts：目录扫描与树构建（TraverseDirectory、有界并发 readdir、
 *   路径派生稳定节点 id）、PF-4 增量重扫规划（文件夹索引、变更路径折叠）；
 * - directory-tree-watch.ts：PF-05 目录 fs.watch 监听（批次合并、自身写入回环抑制、
 *   异常降级、退出清理）；
 * - directory-tree-reload.ts：目录刷新编排（ReloadDirFromDisk、ScheduleReloadFromDisk、
 *   PF-4 局部重扫应用、整树 IPC 去重、PF-17 当前活动文件磁盘签名短路、刷新统计）。
 *
 * 依赖方向：directory-tree → { shared, file-encoding, path-utils, app-state, security }；
 * 对外的目录树/监听 API 由 file-operations.ts re-export 保持既有 import 路径不变。
 */

export { TraverseDirectory } from './directory-tree-scan'

export {
    DegradeDirectoryWatch,
    GetDirectoryWatchStatus,
    stopDirectoryWatcher
} from './directory-tree-watch'
export type { DirectoryWatchStatus } from './directory-tree-watch'

export {
    CleanupDirectoryWatch,
    GetDirectoryReloadStats,
    ReloadDirFromDisk,
    ScheduleReloadFromDisk
} from './directory-tree-reload'
export type { DirectoryReloadStats, ReloadDirFromDiskOptions } from './directory-tree-reload'
