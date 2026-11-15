/**
 * 配置目录备份 / 恢复模块（P1-FE-06）
 *
 * 背景：系统设置对话框的「立即备份 / 从备份恢复」原为空实现（void 0），
 * 用户点击无任何反应。本模块提供最小可用的配置备份能力：
 * - 备份：把 ~/.baizenotes/config/ 下的配置文件整目录拷贝到
 *   ~/.baizenotes/config-backups/config-backup-YYYYMMDD-HHmmss/；
 * - 恢复：从指定备份目录把文件拷回配置目录，并把内容重新灌入主进程
 *   各 electron-store 实例（store 有内存缓存，仅拷贝文件不会刷新运行中配置）；
 * - 保留策略：备份数量由系统设置 backupCount 控制（1~20，默认 5），
 *   超出后删除最旧的备份目录。
 *
 * 安全约束（路径守卫）：
 * - 备份名必须严格匹配 BACKUP_NAME_PATTERN，且解析后的绝对路径必须位于
 *   备份根目录内（path.relative 校验，拒绝 .. / 绝对路径逃逸）；
 * - 配置目录固定取自 app-paths（~/.baizenotes/config），不接受外部传入路径；
 * - 只拷贝备份根目录/配置目录下的普通文件，不递归进入子目录。
 *
 * 说明：本模块不做自动定时备份——enableAutoBackup/backupInterval 在 UI 上
 * 已标注「暂未实现」并禁用，避免承诺未接通的调度能力。
 */

import * as fs from 'fs-extra'
import * as path from 'path'
import { CONFIG_DIR_NAME, getUserDataPath } from '../utils/app-paths'
import { logger } from '../utils/logger'
import { getSystemSetting, saveSystemSetting } from './system-setting'
import { setThemeConfig } from './theme-config'
import type { ThemeConfig } from './theme-config'
import { saveEditorSetting } from './editor-setting'
import { saveQuickLinks } from './quick-link-config'
import type { EditorSetting, QuickLinkItem, SystemSetting } from '../../shared/types'

/** 备份根目录名（位于 ~/.baizenotes/ 下） */
export const CONFIG_BACKUP_DIR_NAME = 'config-backups'

/** 备份目录命名规则：config-backup-YYYYMMDD-HHmmss（同一秒内重名时追加 -N 序号） */
const BACKUP_NAME_PATTERN = /^config-backup-\d{8}-\d{6}(-\d+)?$/

/** 默认保留备份数量（与 systemSettingDefaults.backupCount 一致） */
export const DEFAULT_BACKUP_KEEP = 5

/** 保留备份数量上限（防异常配置造成无界磁盘占用） */
export const MAX_BACKUP_KEEP = 20

/** 备份目录元信息（config:read('backup') 的返回项） */
export interface ConfigBackupInfo {
    /** 备份目录名（恢复时作为 name 参数） */
    name: string
    /** 备份目录绝对路径（仅供主进程排查，渲染层不依赖） */
    path: string
    /** 备份创建时间（ISO 字符串） */
    createdAt: string
    /** 备份文件数 */
    fileCount: number
}

/** 配置目录（主进程各 electron-store 的落盘位置） */
export function getConfigDirectory(): string {
    return path.join(getUserDataPath(), CONFIG_DIR_NAME)
}

/** 备份根目录 */
export function getConfigBackupRoot(): string {
    return path.join(getUserDataPath(), CONFIG_BACKUP_DIR_NAME)
}

/** 组装备份时间戳：YYYYMMDD-HHmmss（本地时区，与目录名规则一致） */
function formatBackupStamp(date: Date): string {
    const pad = (value: number): string => String(value).padStart(2, '0')
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    )
}

/** 是否为合法备份目录名（防路径逃逸的第一道关卡） */
export function isValidBackupName(name: unknown): name is string {
    return typeof name === 'string' && BACKUP_NAME_PATTERN.test(name)
}

/**
 * 校验备份目录绝对路径是否严格位于备份根目录内。
 * 返回 null 表示非法（调用方直接拒绝，不做任何读写）。
 */
function resolveBackupDirSafe(name: unknown): string | null {
    if (!isValidBackupName(name)) {
        return null
    }
    const root = path.resolve(getConfigBackupRoot())
    const target = path.resolve(root, name)
    const relative = path.relative(root, target)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        return null
    }
    return target
}

/** 列出备份目录下的普通文件（不进入子目录） */
function listRegularFiles(dir: string): string[] {
    try {
        return fs.readdirSync(dir).filter((file) => fs.statSync(path.join(dir, file)).isFile())
    } catch (error) {
        logger.warn(`[ConfigBackup] 读取目录失败: ${dir}`, error)
        return []
    }
}

/** 归一化保留数量：非法值回落默认，范围夹取到 [1, MAX_BACKUP_KEEP] */
function normalizeKeep(keep: unknown): number {
    const configuredKeep = getSystemSetting().backupCount
    let raw: number =
        typeof configuredKeep === 'number' && Number.isFinite(configuredKeep)
            ? configuredKeep
            : DEFAULT_BACKUP_KEEP
    if (typeof keep === 'number' && Number.isFinite(keep)) {
        raw = Math.floor(keep)
    }
    return Math.min(MAX_BACKUP_KEEP, Math.max(1, raw))
}

/** 从备份目录名解析创建时间（命名含时间戳，不依赖 mtime） */
function parseBackupCreatedAt(name: string): string {
    const match = /^config-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name)
    if (!match) {
        return new Date(0).toISOString()
    }
    const [, year, month, day, hour, minute, second] = match
    const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    )
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString()
}

function buildBackupInfo(name: string): ConfigBackupInfo {
    const dir = path.join(getConfigBackupRoot(), name)
    return {
        name,
        path: dir,
        createdAt: parseBackupCreatedAt(name),
        fileCount: listRegularFiles(dir).length
    }
}

/**
 * 删除超出保留数量的最旧备份（按目录名排序，命名含时间戳故字典序即时间序）。
 * 仅删除通过名称校验的备份目录，绝不触碰其它文件。
 */
function pruneOldBackups(keep: number): void {
    const backups = listConfigBackups()
    for (const backup of backups.slice(keep)) {
        const dir = resolveBackupDirSafe(backup.name)
        if (!dir) {
            continue
        }
        try {
            fs.rmSync(dir, { recursive: true, force: true })
            logger.info(`[ConfigBackup] 已清理超出保留数量的旧备份: ${backup.name}`)
        } catch (error) {
            logger.warn(`[ConfigBackup] 清理旧备份失败: ${backup.name}`, error)
        }
    }
}

/** 列出全部备份（按时间倒序，最新在前） */
export function listConfigBackups(): ConfigBackupInfo[] {
    const root = getConfigBackupRoot()
    if (!fs.existsSync(root)) {
        return []
    }
    let entries: fs.Dirent[] = []
    try {
        entries = fs.readdirSync(root, { withFileTypes: true })
    } catch (error) {
        logger.warn('[ConfigBackup] 读取备份根目录失败', error)
        return []
    }
    return entries
        .filter((entry) => entry.isDirectory() && isValidBackupName(entry.name))
        .map((entry) => buildBackupInfo(entry.name))
        .sort((left, right) => right.name.localeCompare(left.name))
}

/**
 * 立即备份配置目录。
 * @param keep 保留备份数量（缺省读取系统设置 backupCount）
 * @returns 备份元信息；配置目录不存在或为空时返回 null（调用方提示无内容可备份）
 */
export function createConfigBackup(keep?: unknown): ConfigBackupInfo | null {
    const configDir = getConfigDirectory()
    if (!fs.existsSync(configDir)) {
        return null
    }
    const files = listRegularFiles(configDir)
    if (files.length === 0) {
        return null
    }

    const root = getConfigBackupRoot()
    try {
        fs.ensureDirSync(root)
        const stamp = formatBackupStamp(new Date())
        let name = `config-backup-${stamp}`
        let suffix = 1
        while (fs.existsSync(path.join(root, name))) {
            name = `config-backup-${stamp}-${suffix}`
            suffix += 1
        }
        const destDir = path.join(root, name)
        fs.ensureDirSync(destDir)
        for (const file of files) {
            fs.copyFileSync(path.join(configDir, file), path.join(destDir, file))
        }
        const info = buildBackupInfo(name)
        pruneOldBackups(normalizeKeep(keep))
        logger.info(`[ConfigBackup] 配置备份完成: ${name}（${info.fileCount} 个文件）`)
        return info
    } catch (error) {
        logger.error('[ConfigBackup] 配置备份失败', error)
        return null
    }
}

/** 读取 JSON 文件为普通对象（非对象/损坏一律返回 null） */
function readJsonObject(filePath: string): Record<string, unknown> | null {
    try {
        if (!fs.existsSync(filePath)) {
            return null
        }
        const data: unknown = fs.readJsonSync(filePath)
        return data && typeof data === 'object' && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null
    } catch (error) {
        logger.warn(`[ConfigBackup] 读取备份配置失败: ${filePath}`, error)
        return null
    }
}

/**
 * 恢复后把备份文件内容重新灌入运行中的 electron-store 实例。
 * store 有内存缓存，仅覆盖磁盘文件不会让当前进程读到新值。
 */
function applyRestoredConfigToStores(): void {
    const configDir = getConfigDirectory()

    const system = readJsonObject(path.join(configDir, 'systemSetting.json'))
    if (system) {
        saveSystemSetting(system as Partial<SystemSetting>)
    }

    const themeFile = readJsonObject(path.join(configDir, 'theme-config.json'))
    const themeConfig = themeFile?.themeConfig
    if (themeConfig && typeof themeConfig === 'object' && !Array.isArray(themeConfig)) {
        setThemeConfig(themeConfig as Partial<ThemeConfig>)
    }

    const editorFile = readJsonObject(path.join(configDir, 'editor-setting.json'))
    const editorSetting = editorFile?.editorSetting
    if (editorSetting && typeof editorSetting === 'object' && !Array.isArray(editorSetting)) {
        saveEditorSetting(editorSetting as EditorSetting)
    }

    const quickLinkFile = readJsonObject(path.join(configDir, 'quick-link-config.json'))
    const quickLinkConfig = quickLinkFile?.quickLinks
    if (
        quickLinkConfig &&
        typeof quickLinkConfig === 'object' &&
        !Array.isArray(quickLinkConfig) &&
        Array.isArray((quickLinkConfig as { links?: unknown }).links)
    ) {
        saveQuickLinks((quickLinkConfig as { links: QuickLinkItem[] }).links)
    }
}

/**
 * 从指定备份恢复配置目录。
 * 拷贝完成后会把内容重新灌入各 store（主题/编辑器/系统/快速链接的界面刷新
 * 由调用方 config-manager 广播完成）。
 * @returns 是否恢复成功（名称非法/备份不存在/拷贝失败均返回 false）
 */
export function restoreConfigBackup(name: unknown): boolean {
    const sourceDir = resolveBackupDirSafe(name)
    if (!sourceDir) {
        logger.warn(`[ConfigBackup] 拒绝非法备份名: ${String(name)}`)
        return false
    }
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        return false
    }
    const files = listRegularFiles(sourceDir)
    if (files.length === 0) {
        return false
    }

    const configDir = getConfigDirectory()
    try {
        fs.ensureDirSync(configDir)
        for (const file of files) {
            fs.copyFileSync(path.join(sourceDir, file), path.join(configDir, file))
        }
        applyRestoredConfigToStores()
        logger.info(`[ConfigBackup] 已从备份恢复配置: ${String(name)}（${files.length} 个文件）`)
        return true
    } catch (error) {
        logger.error('[ConfigBackup] 配置恢复失败', error)
        return false
    }
}

/** 备份配置命令的 action 白名单类型 */
export type ConfigBackupAction = 'create' | 'restore'

/** 备份命令 payload 形状（经 config:write('backup') 传入） */
export interface ConfigBackupCommand {
    action: ConfigBackupAction
    /** 恢复时指定备份目录名 */
    name?: string
    /** 备份时指定保留数量 */
    keep?: number
}

/**
 * 处理 config:write('backup') 命令（config-manager 的备份命令路由入口）。
 * 备份/恢复都通过既有 CONFIG.WRITE 通道承载，避免为两个低频动作新增 IPC 通道。
 */
export function handleConfigBackupCommand(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false
    }
    const command = payload as ConfigBackupCommand
    if (command.action === 'create') {
        return createConfigBackup(command.keep) !== null
    }
    if (command.action === 'restore') {
        return restoreConfigBackup(command.name)
    }
    logger.warn(`[ConfigBackup] 未知备份命令: ${String(command.action)}`)
    return false
}

/** 读取备份列表（config:read('backup') 的返回形状） */
export function getBackupState(): { backups: ConfigBackupInfo[]; latest: string | null } {
    const backups = listConfigBackups()
    return { backups, latest: backups[0]?.name ?? null }
}
