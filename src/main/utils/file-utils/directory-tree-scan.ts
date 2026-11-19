/**
 * 目录树扫描与增量重扫规划（主进程）—— 由 directory-tree.ts 拆出（结构优化第 5 批 5.5）
 *
 * 职责（纯扫描层，不含 fs.watch 监听与 IPC 刷新编排）：
 * - 目录扫描与树构建（TraverseDirectory、有界并发 readdir、路径派生的稳定节点 id）；
 * - PF-4 增量重扫辅助（「文件夹路径 → 节点」索引、变更路径折叠为受影响子树的规划）；
 * - 扫描排除目录、扩展名白名单、节点 id 等纯函数与常量。
 *
 * 依赖方向：directory-tree-scan → { shared, logger, dialog-helpers, i18n, path-utils }；
 * 不依赖 fs.watch 与目录刷新编排（见 directory-tree-watch.ts / directory-tree-reload.ts）。
 * 对外公开 API 仍由 directory-tree.ts 薄壳统一导出，调用方 import 路径不变。
 */

import path from 'path'
import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
// ARC-13：FileItem 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileItem } from '../../../shared/types'
// 公共接口归位第 2 批：扩展名白名单 / 哈希 / 路径比较 / 并发闸门统一引用 shared 真源
import { TREE_SUPPORTED_EXTENSIONS } from '../../../shared/constants/file-extensions'
import { fnv1a32, toRadixString } from '../../../shared/utils/hash'
import { isPathWithin, normalizePathForCompare } from '../../../shared/utils/path'
import { createSemaphore } from '../../../shared/utils/concurrency'
import { logger } from '../logger'
import { showErrorMessageBox } from './dialog-helpers'
import { tMain } from '../i18n'

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
/** 目录树支持展示的文件扩展名（大小写敏感，保持优化前行为；清单真源在 shared 常量） */
const SUPPORTED_FILE_EXTENSIONS: ReadonlySet<string> = new Set(TREE_SUPPORTED_EXTENSIONS)

/** 当前平台路径比较是否大小写不敏感（Windows 盘符/目录名不区分大小写） */
const WIN32_CASE_INSENSITIVE = process.platform === 'win32'

/** 规范化路径键：绝对路径 + 统一分隔符 + Windows 大小写不敏感（用于树节点定位与变更路径匹配） */
export function normalizePathKey(targetPath: string): string {
    return normalizePathForCompare(path.resolve(targetPath), WIN32_CASE_INSENSITIVE)
}

/** child 是否等于 parent 或位于 parent 目录之下（判定实现来自 shared/utils/path） */
function isSameOrInsidePath(child: string, parent: string): boolean {
    return isPathWithin(child, parent, { win32CaseInsensitive: WIN32_CASE_INSENSITIVE })
}

/**
 * PF-4/PF-5：相对工作区根的路径是否位于被跳过的依赖/VCS 目录内。
 * 这些目录不进入目录树，其变更事件也不应触发刷新（避免 node_modules 事件风暴）。
 */
export function isPathInSkippedDirectory(rootPath: string, targetPath: string): boolean {
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
 * 公共接口归位第 2 批：哈希实现改为 shared/utils/hash 的 fnv1a32 + toRadixString。
 */
export function buildStableItemId(targetPath: string): string {
    const key = normalizePathKey(targetPath)
    return toRadixString(fnv1a32(key), 36)
}

// 目录扫描并发闸门（PF-4）：只限制 readdir 系统调用并发，递归等待子目录时不占名额，因此不会死锁。
// 公共接口归位第 2 批：名额闸门实现改为 shared/utils/concurrency 的 createSemaphore
// （释放时把名额直接转交给等待者，避免「先减后加」窗口导致并发超限）。
let scanSemaphore = createSemaphore(FS_SCAN_CONCURRENCY)

/** 测试/退出时复位扫描闸门状态（生产代码仅在 CleanupDirectoryWatch 调用） */
export function resetScanSlots(): void {
    // 与旧实现「清空活跃数 + 等待队列」等价：直接换一个新信号量，旧等待者随旧实例丢弃
    scanSemaphore = createSemaphore(FS_SCAN_CONCURRENCY)
}

/**
 * PF-4：有界并发的 readdir（withFileTypes，免去逐条目 lstat）。
 * 读取失败（权限/目录被删）直接抛出，由上层决定「子树置空」还是「全量回退」。
 */
async function readDirectoryEntries(dirPath: string): Promise<Dirent[]> {
    const release = await scanSemaphore.acquire()
    try {
        return await fs.readdir(dirPath, { withFileTypes: true })
    } finally {
        release()
    }
}

/**
 * PF-4：递归扫描单个目录子树（返回该目录的直接子项，目录项 children 已递归填充）。
 * 与旧 TraverseDirectory 的差异：
 * - readdir({ withFileTypes }) 直接从目录项取类型，不再对每个条目 lstat；
 * - readdir 并发有上限（FS_SCAN_CONCURRENCY），避免大目录一次压满 libuv 线程池；
 * - 子目录读取失败时该目录 children 置空（旧实现同样会丢弃失败条目/子树），不中断整树。
 */
export async function scanDirectoryTree(dirPath: string): Promise<FileItem[]> {
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
            })
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
        })
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
export function indexTreeFolders(
    tree: FileItem[] | null,
    rootPath: string
): Map<string, FileItem> | null {
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
export function addFolderKeysToIndex(index: Map<string, FileItem>, children: FileItem[]): void {
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
export function removeFolderKeysFromIndex(
    index: Map<string, FileItem>,
    children: FileItem[]
): void {
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
export interface IncrementalRescanPlan {
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
export async function planIncrementalRescan(
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
