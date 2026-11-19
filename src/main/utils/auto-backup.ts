/**
 * 自动备份模块（系统设置补充实现批次 C：#8/#9 启用自动备份 / 备份间隔）
 *
 * 背景：系统设置对话框「备份-自动备份」组的 enableAutoBackup / backupInterval
 * 原为禁用态（hintNotImplemented）。本模块提供定时自动备份能力：
 * - 按 backupInterval（小时，1~72）定时把「活动文件（含内存中未保存修改，按原编码写出）」
 *   与「已打开工作区目录（appState.rootPath）下全部 .md 文件」备份到
 *   userData/backups/<YYYYMMDD-HHmmss>/（工作区文件保留相对目录结构）；
 * - 单文件超过 20MB 跳过并记日志（防大文件备份卡顿与无界磁盘占用），
 *   活动文件内存内容同样受该上限约束；
 * - 遍历跳过 node_modules / .git 等目录与备份根自身（防备份套娃）；
 * - 备份完成后按 backupCount（1~10，默认 5）滚动清理最旧备份目录
 *   （仅删除通过名称校验的目录，绝不触碰其它文件）；
 * - 全部 IO 走异步（fs-extra 的 Promise 化 readdir/stat/copyFile/writeFile/rm，
 *   递归遍历用 readdir({ withFileTypes: true }) 异步实现，P1-2 修复主进程
 *   同步 IO 冻结）；encodeFileContent 为纯内存编码（活动文件内容已在内存中），
 *   保持同步调用并受 20MB 上限约束；
 * - 备份中途失败（磁盘满/权限）时回滚删除本次半成品目录，再交由调度方记录/提示；
 * - 工作区外活动文件回退 basename 作 dest 时，若与工作区文件同名（大小写不敏感）
 *   则改放 _active/ 子目录，仍冲突追加序号，避免静默替换备份内容；
 * - 定时器用「仅调度 + 递归 setTimeout」驱动并带 running 防重叠标志，
 *   首次备份发生在第一个间隔到点（P1-2：保存设置/应用启动不再同步触发
 *   一次全量备份）；enableAutoBackup=false 或 backupInterval 变更时经
 *   syncAutoBackupTimer 重启（config-manager 保存路径调用，保存即生效）；
 *   退出时由 cleanupApp → stopAutoBackupTimer 停止（main/index.ts 挂载）。
 *
 * 备份结果经状态栏提示（成功/失败走 mainMsg.status.autoBackupSuccess /
 * autoBackupFailed i18n 词条，失败含原因）；备份期间失败只记录日志与状态栏
 * 提示，绝不阻断主流程。
 *
 * 复用说明：手动备份（config-backup.ts 的配置目录备份）的「时间戳命名 →
 * 名称白名单校验 → path.relative 路径守卫 → 字典序滚动清理」模式与本模块
 * 同构，但两者目录命名空间与内容来源不同（config-backups/config-backup-* 前缀、
 * 只拷平铺普通文件 vs backups/<时间戳> 递归 .md + 内存内容），直接复用会
 * 把两种备份语义耦合；本模块沿用同一套安全模式独立实现，函数形状保持对应。
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import { getUserDataPath } from './app-paths'
import { logger } from './logger'
import { appState, sendToMainWindow } from './app-state'
import { getSystemSetting } from '../config/system-setting'
import { tMain } from './i18n'
import { IPC } from '../../shared/ipc-channels'
import { encodeFileContent } from './file-utils/file-encoding'
// 公共接口归位第 2 批：单文件大小上限常量与备份目录纯函数（时间戳/名称/安全解析/排序）
// 统一引用 shared 真源；本模块仅保留与自动备份业务相关的 IO 与调度逻辑
import { MAX_AUTO_BACKUP_FILE_SIZE } from '../../shared/constants/limits'
import {
    formatBackupStamp,
    isValidBackupName,
    parseBackupStamp,
    resolveBackupDirSafe as resolveBackupDirSafeShared,
    sortBackupNames
} from '../../shared/utils/backup-dir'

/** 备份根目录名（位于 ~/.baizenotes/ 下） */
export const AUTO_BACKUP_DIR_NAME = 'backups'

/**
 * 配置备份目录名前缀（shared 的备份名校验器同时接受两种命名空间，
 * 自动备份只认自己的 `YYYYMMDD-HHmmss` 形式，需要排除配置备份命名）。
 */
const CONFIG_BACKUP_NAME_PREFIX = 'config-backup-'

/** 默认保留备份数量（与 systemSettingDefaults.backupCount 一致） */
export const DEFAULT_AUTO_BACKUP_KEEP = 5

/** 保留备份数量上限（UI 输入框为 1~10，此处防御异常配置） */
export const MAX_AUTO_BACKUP_KEEP = 10

/** 默认备份间隔（小时，与 systemSettingDefaults.backupInterval 一致） */
export const DEFAULT_AUTO_BACKUP_INTERVAL_HOURS = 24

/** 备份间隔钳制范围（小时）：UI 输入框为 1~72 */
export const MIN_AUTO_BACKUP_INTERVAL_HOURS = 1
export const MAX_AUTO_BACKUP_INTERVAL_HOURS = 72

/** 单文件备份大小上限（20MB）：超过则跳过并记日志。
 * 公共接口归位第 2 批：数值真源为 shared/constants/limits.MAX_AUTO_BACKUP_FILE_SIZE，
 * 保留既有导出名（既有测试/调用方引用）并引用 shared 常量。 */
export const AUTO_BACKUP_MAX_FILE_BYTES = MAX_AUTO_BACKUP_FILE_SIZE

/** 遍历工作区时跳过的目录名（含备份根自身，防把旧备份再拷进新备份） */
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.svn', '.hg'])

/** 工作区外活动文件回退 basename 冲突时的子目录名（P2-8：防静默替换） */
const ACTIVE_FALLBACK_DIR_NAME = '_active'

/** 一次自动备份的结果元信息 */
export interface AutoBackupResult {
    /** 备份目录名（YYYYMMDD-HHmmss 形式） */
    name: string
    /** 本次备份的文件数 */
    fileCount: number
}

/** 备份目录元信息（测试/排查用） */
export interface AutoBackupInfo {
    name: string
    path: string
    createdAt: string
    fileCount: number
}

/** 备份根目录 */
export function getAutoBackupRoot(): string {
    return path.join(getUserDataPath(), AUTO_BACKUP_DIR_NAME)
}

/**
 * 是否为合法备份目录名（防路径逃逸的第一道关卡）。
 * 公共接口归位第 2 批：命名形状校验复用 shared/utils/backup-dir.isValidBackupName；
 * 该 shared 校验器同时接受配置备份命名（`config-backup-` 前缀），自动备份只认自己的
 * 命名空间，因此额外排除配置备份前缀，保持既有「备份列表互不串号」语义不变。
 */
export function isValidAutoBackupName(name: unknown): name is string {
    return (
        typeof name === 'string' &&
        !name.startsWith(CONFIG_BACKUP_NAME_PREFIX) &&
        isValidBackupName(name)
    )
}

/**
 * 校验备份目录绝对路径是否严格位于备份根目录内。
 * 返回 null 表示非法（调用方直接拒绝，不做任何读写）。
 * 公共接口归位第 2 批：路径守卫（白名单 + path.relative 防逃逸）复用 shared 实现，
 * 本函数先按自动备份命名空间过滤，再交给 shared 做相对路径校验。
 */
function resolveAutoBackupDirSafe(name: unknown): string | null {
    if (!isValidAutoBackupName(name)) {
        return null
    }
    return resolveBackupDirSafeShared(getAutoBackupRoot(), name)
}

/** 从备份目录名解析创建时间（命名含时间戳，不依赖 mtime）。
 * 公共接口归位第 2 批：解析迁至 shared/utils/backup-dir.parseBackupStamp；
 * 与旧实现的差异：shared 会对年月日时分秒做回读校验，非法日历值（如 13 月）
 * 返回 null，这里按旧实现「无法解析 → epoch」的兜底语义映射为 1970-01-01。 */
function parseAutoBackupCreatedAt(name: string): string {
    const timestamp = parseBackupStamp(name)
    return timestamp === null ? new Date(0).toISOString() : new Date(timestamp).toISOString()
}

/** 统计备份目录内文件数（递归 .md 拷贝可能带子目录，统计递归文件数） */
async function countFilesRecursively(dir: string): Promise<number> {
    let count = 0
    const stack = [dir]
    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) {
            continue
        }
        try {
            const entries = await fs.readdir(current, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    stack.push(path.join(current, entry.name))
                } else if (entry.isFile()) {
                    count += 1
                }
            }
        } catch {
            // 统计失败不阻断：调用方仅用于提示文案
        }
    }
    return count
}

async function buildAutoBackupInfo(name: string): Promise<AutoBackupInfo> {
    const dir = path.join(getAutoBackupRoot(), name)
    return {
        name,
        path: dir,
        createdAt: parseAutoBackupCreatedAt(name),
        fileCount: await countFilesRecursively(dir)
    }
}

/** 列出全部备份（按目录名倒序，最新在前；只认通过名称校验的目录） */
export async function listAutoBackups(): Promise<AutoBackupInfo[]> {
    const root = getAutoBackupRoot()
    if (!(await fs.pathExists(root))) {
        return []
    }
    let entries: fs.Dirent[] = []
    try {
        entries = await fs.readdir(root, { withFileTypes: true })
    } catch (error) {
        logger.warn('[AutoBackup] 读取备份根目录失败', error)
        return []
    }
    // 公共接口归位第 2 批：名称过滤后按 shared 的倒序排序工具排列（最新在前）
    const names = sortBackupNames(
        entries
            .filter((entry) => entry.isDirectory() && isValidAutoBackupName(entry.name))
            .map((entry) => entry.name)
    )
    return await Promise.all(names.map((name) => buildAutoBackupInfo(name)))
}

/** 归一化保留数量：非法值回落默认，范围夹取到 [1, MAX_AUTO_BACKUP_KEEP] */
function normalizeAutoBackupKeep(): number {
    const raw = getSystemSetting().backupCount
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.min(MAX_AUTO_BACKUP_KEEP, Math.max(1, Math.floor(raw)))
    }
    return DEFAULT_AUTO_BACKUP_KEEP
}

/**
 * 删除超出保留数量的最旧备份（按目录名排序，命名含时间戳故字典序即时间序）。
 * 仅删除通过名称校验的备份目录，绝不触碰其它文件。
 */
async function pruneOldAutoBackups(keep: number): Promise<void> {
    const backups = await listAutoBackups()
    for (const backup of backups.slice(keep)) {
        const dir = resolveAutoBackupDirSafe(backup.name)
        if (!dir) {
            continue
        }
        try {
            await fs.rm(dir, { recursive: true, force: true })
            logger.info(`[AutoBackup] 已清理超出保留数量的旧备份: ${backup.name}`)
        } catch (error) {
            logger.warn(`[AutoBackup] 清理旧备份失败: ${backup.name}`, error)
        }
    }
}

/**
 * 活动文件在工作区内时返回相对路径（保留目录结构）；否则退回文件名。
 * inWorkspace 供调用方区分「工作区外的 basename 回退」（需做冲突处理）。
 */
function resolveActiveFileDest(
    filePath: string,
    rootPath: string | null
): { dest: string; inWorkspace: boolean } {
    if (rootPath) {
        const relative = path.relative(path.resolve(rootPath), path.resolve(filePath))
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            return { dest: relative, inWorkspace: true }
        }
    }
    return { dest: path.basename(filePath), inWorkspace: false }
}

/** dest 是否与已有条目冲突（大小写不敏感，与 Windows/macOS 文件系统语义一致） */
function hasDestConflict(dest: string, items: BackupCopyItem[]): boolean {
    const normalized = dest.toLowerCase()
    return items.some((item) => item.dest.toLowerCase() === normalized)
}

/**
 * 工作区外活动文件回退 basename 与工作区文件同名时（大小写不敏感）：
 * 先试 _active/<name>，仍冲突则追加 -N 序号（P2-8：避免静默替换备份内容）。
 */
function resolveActiveFallbackDest(basename: string, items: BackupCopyItem[]): string {
    const inActive = path.join(ACTIVE_FALLBACK_DIR_NAME, basename)
    if (!hasDestConflict(inActive, items)) {
        return inActive
    }
    const ext = path.extname(basename)
    const stem = path.basename(basename, ext)
    for (let index = 1; ; index += 1) {
        const candidate = path.join(ACTIVE_FALLBACK_DIR_NAME, `${stem}-${index}${ext}`)
        if (!hasDestConflict(candidate, items)) {
            return candidate
        }
    }
}

/** 单次备份的待写条目：source 为磁盘拷贝，content 为内存内容按编码写出 */
interface BackupCopyItem {
    /** 备份目录内的相对目标路径 */
    dest: string
    /** 磁盘源文件（与 content 二选一） */
    source?: string
    /** 内存内容字节（活动文件，含未保存修改） */
    content?: Buffer
}

/**
 * 递归收集工作区目录下的 .md 文件（跳过 node_modules/.git 等目录与备份根自身）。
 * 遍历失败（无权限等）仅跳过对应目录，不中断整体备份。
 * P1-2：readdirSync 递归改为 readdir({ withFileTypes: true }) 异步递归。
 */
async function collectWorkspaceMarkdownFiles(root: string): Promise<BackupCopyItem[]> {
    const items: BackupCopyItem[] = []
    const backupRoot = path.resolve(getAutoBackupRoot())

    const walk = async (dir: string): Promise<void> => {
        let entries: fs.Dirent[] = []
        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch (error) {
            logger.warn(`[AutoBackup] 读取工作区目录失败: ${dir}`, error)
            return
        }
        for (const entry of entries) {
            const absolute = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (SKIP_DIR_NAMES.has(entry.name)) {
                    continue
                }
                if (path.resolve(absolute) === backupRoot) {
                    continue
                }
                await walk(absolute)
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
                try {
                    const size = (await fs.stat(absolute)).size
                    if (size > AUTO_BACKUP_MAX_FILE_BYTES) {
                        logger.warn(
                            `[AutoBackup] 文件超过 ${AUTO_BACKUP_MAX_FILE_BYTES} 字节上限，已跳过: ${absolute}`
                        )
                        continue
                    }
                } catch {
                    continue
                }
                items.push({ dest: path.relative(root, absolute), source: absolute })
            }
        }
    }

    await walk(root)
    return items
}

/**
 * 执行一次自动备份（异步：全链路 fs.promises 风格 IO，避免阻塞主进程）。
 * @returns 备份结果；无任何内容可备份（无活动文件且工作区无 .md）时返回 null
 * @throws 备份目录创建/写入失败时抛错（由调度方捕获并提示用户）；
 *         写入中途失败会先回滚删除本次半成品目录再抛出（P3 失败残留清理）
 */
export async function performAutoBackup(): Promise<AutoBackupResult | null> {
    const activeFile = appState.currentActiveFile
    const rootPath = appState.rootPath || null

    // 1. 收集备份条目：先工作区 .md（磁盘内容），后活动文件（内存内容按编码写出）
    const copies: BackupCopyItem[] = []
    if (rootPath && (await fs.pathExists(rootPath))) {
        copies.push(...(await collectWorkspaceMarkdownFiles(rootPath)))
    }
    if (
        activeFile &&
        typeof activeFile.path === 'string' &&
        typeof activeFile.content === 'string'
    ) {
        // 活动文件携带编码：经 encodeFileContent 按原编码写出（GBK 等非 UTF-8 内容
        // 不会在备份中被错误转成 UTF-8）；若与工作区条目同 dest 则替换原条目，
        // 以内存内容（含未保存修改）覆盖磁盘旧内容，并保证 fileCount 与实际文件数一致
        const resolved = resolveActiveFileDest(activeFile.path, rootPath)
        let dest = resolved.dest
        if (!resolved.inWorkspace && hasDestConflict(dest, copies)) {
            // P2-8：工作区外活动文件回退 basename 与工作区文件同名（大小写不敏感）时
            // 改放 _active/ 子目录（仍冲突追加序号），避免静默替换工作区文件的备份内容
            dest = resolveActiveFallbackDest(dest, copies)
        }

        // P2-7：活动文件内存内容同样受 20MB 上限约束（与工作区文件一致），
        // 超过则跳过并记日志，防止大文件备份卡顿与无界磁盘占用
        const content = encodeFileContent(activeFile.content, activeFile.encoding ?? 'utf-8')
        if (content.byteLength > AUTO_BACKUP_MAX_FILE_BYTES) {
            logger.warn(
                `[AutoBackup] 活动文件内容超过 ${AUTO_BACKUP_MAX_FILE_BYTES} 字节上限，已跳过: ${activeFile.path}`
            )
        } else {
            const existingIndex = copies.findIndex(
                (item) => item.dest.toLowerCase() === dest.toLowerCase()
            )
            if (existingIndex >= 0) {
                copies.splice(existingIndex, 1)
            }
            copies.push({ dest, content })
        }
    }
    if (copies.length === 0) {
        return null
    }

    // 2. 创建带时间戳的备份目录（同一秒内重名追加 -N 序号）
    const root = getAutoBackupRoot()
    await fs.ensureDir(root)
    // 公共接口归位第 2 批：时间戳格式由 shared 的 formatBackupStamp 生成（YYYYMMDD-HHmmss）
    const stamp = formatBackupStamp(new Date())
    let name = stamp
    let suffix = 1
    while (await fs.pathExists(path.join(root, name))) {
        name = `${stamp}-${suffix}`
        suffix += 1
    }
    const destDir = path.join(root, name)
    await fs.ensureDir(destDir)

    // 3. 逐条写入（保留相对目录结构）；P3：中途失败（磁盘满/权限）时
    // 先回滚删除本次半成品目录，再抛出交由调度方记录/提示，不残留废目录
    try {
        for (const copy of copies) {
            const destPath = path.join(destDir, copy.dest)
            await fs.ensureDir(path.dirname(destPath))
            if (copy.content) {
                await fs.writeFile(destPath, copy.content)
            } else if (copy.source) {
                await fs.copyFile(copy.source, destPath)
            }
        }
    } catch (error) {
        try {
            await fs.rm(destDir, { recursive: true, force: true })
        } catch (cleanupError) {
            logger.warn(`[AutoBackup] 清理半成品备份目录失败: ${name}`, cleanupError)
        }
        throw error
    }

    // 4. 按保留数量滚动清理旧备份
    await pruneOldAutoBackups(normalizeAutoBackupKeep())

    logger.info(`[AutoBackup] 自动备份完成: ${name}（${copies.length} 个文件）`)
    return { name, fileCount: copies.length }
}

/** 按当前设置计算备份间隔毫秒数（钳制到 1~72 小时，非法值回落默认） */
export function getAutoBackupIntervalMs(): number {
    const raw = getSystemSetting().backupInterval
    const hours =
        typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_AUTO_BACKUP_INTERVAL_HOURS
    const clamped = Math.min(
        MAX_AUTO_BACKUP_INTERVAL_HOURS,
        Math.max(MIN_AUTO_BACKUP_INTERVAL_HOURS, Math.floor(hours))
    )
    return clamped * 60 * 60 * 1000
}

/**
 * 执行一次备份并给出用户可见反馈：
 * - 成功（有内容）→ 状态栏提示备份名与文件数；
 * - 无内容 → 仅日志，不打扰用户（启动时活动文件/工作区尚未恢复属正常）；
 * - 失败 → 日志 + 状态栏错误提示（含原因），不抛出、不阻断主流程。
 */
export async function runAutoBackupOnce(): Promise<void> {
    try {
        const result = await performAutoBackup()
        if (result) {
            sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.autoBackupSuccess', {
                    name: result.name,
                    count: result.fileCount
                }),
                type: 'info'
            })
        } else {
            logger.info('[AutoBackup] 无内容可备份（无活动文件且工作区无 .md 文件），跳过本次执行')
        }
    } catch (error) {
        logger.error('[AutoBackup] 自动备份失败:', error)
        sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.autoBackupFailed', {
                message: error instanceof Error ? error.message : String(error)
            }),
            type: 'error'
        })
    }
}

let autoBackupTimer: NodeJS.Timeout | null = null
let autoBackupRunning = false

/** 清除待调度的定时器（幂等；不打断正在执行中的备份） */
export function stopAutoBackupTimer(): void {
    if (autoBackupTimer) {
        clearTimeout(autoBackupTimer)
        autoBackupTimer = null
    }
}

/** 调度下一次备份（先清旧 pending，防多次 start 叠加） */
function scheduleNextAutoBackup(delayMs: number): void {
    stopAutoBackupTimer()
    autoBackupTimer = setTimeout(() => {
        autoBackupTimer = null
        void runAutoBackupCycle()
    }, delayMs)
}

/**
 * 一轮备份循环：执行一次备份，完成后若仍启用则递归调度下一轮。
 * 递归 setTimeout（而非 setInterval）+ running 标志防重叠执行。
 */
async function runAutoBackupCycle(): Promise<void> {
    if (autoBackupRunning) {
        return
    }
    autoBackupRunning = true
    try {
        await runAutoBackupOnce()
    } finally {
        autoBackupRunning = false
        if (getSystemSetting().enableAutoBackup === true) {
            scheduleNextAutoBackup(getAutoBackupIntervalMs())
        }
    }
}

/**
 * 启动自动备份定时器（P1-2：仅调度，不立即执行——首次备份发生在第一个间隔到点，
 * 避免保存设置/应用启动时在主进程同步触发全量备份冻结 UI）。
 * 已存在定时器时先停止（重启语义，供间隔变更后调用）。
 */
export function startAutoBackupTimer(): void {
    stopAutoBackupTimer()
    if (getSystemSetting().enableAutoBackup !== true) {
        return
    }
    scheduleNextAutoBackup(getAutoBackupIntervalMs())
}

/**
 * 按最新设置同步定时器（config-manager 保存路径调用，保存即生效）：
 * enableAutoBackup===true 时重启调度（不立即执行），===false 时停止；
 * backupInterval 变更经 startAutoBackupTimer 的重启语义自动生效。
 */
export function syncAutoBackupTimer(): void {
    if (getSystemSetting().enableAutoBackup === true) {
        startAutoBackupTimer()
    } else {
        stopAutoBackupTimer()
    }
}
