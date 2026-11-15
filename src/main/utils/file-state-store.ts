/**
 * 文件状态存储模块（ARC-11）
 * 独立于 file-utils 的文件状态持久化存储，只依赖 electron-store / electron / fs / path。
 *
 * 背景：原 file-state.ts 同时承担「存储」与「恢复流程」两类职责，恢复流程又依赖
 * file-utils/index（file-operations），而 file-operations 反向 import file-state，
 * 形成 file-state → file-utils → file-operations → file-state 循环依赖
 * （@ts-ignore 压制 + require 延迟规避均由此而来）。
 *
 * 现将无依赖的存储层下沉到本模块：file-operations 等只依赖本模块（无反向边），
 * file-state.ts 保留恢复流程并 re-export 存储 API 保持外部调用兼容。
 *
 * 含 D-6/FUN-11 配置损坏容错：Store 读取损坏时备份原文件并重建默认值。
 */

import Store from 'electron-store'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { logger } from './logger'
import {
    clampRecentFilesLimit,
    DEFAULT_RECENT_FILES_LIMIT
} from '../../shared/constants/recent-files'

// 文件状态配置接口
export interface FileState {
    lastOpenedFile: string | null
    lastOpenedDirectory: string | null
    recentFiles: string[]
}

const fileStateDefaults: FileState = {
    lastOpenedFile: null,
    lastOpenedDirectory: null,
    recentFiles: []
}

// 文件状态存储实例（D-6：延迟初始化，损坏时备份重建）
let fileStateStore: Store<FileState> | null = null

/**
 * 获取文件状态存储实例（D-6/FUN-11）
 * 读取损坏 JSON 抛出异常时：把原文件改名备份为 .corrupt-时间戳，重建默认值。
 */
function getFileStateStore(): Store<FileState> {
    if (fileStateStore) {
        return fileStateStore
    }
    try {
        fileStateStore = new Store<FileState>({
            name: 'fileState',
            defaults: fileStateDefaults
        })
    } catch (err) {
        logger.error('fileState 配置文件损坏，尝试备份并重建:', err)
        try {
            // 该 Store 无 cwd 参数，文件位于 userData 根目录
            const filePath = path.join(app.getPath('userData'), 'fileState.json')
            if (fs.existsSync(filePath)) {
                const backupPath = `${filePath}.corrupt-${Date.now()}`
                fs.renameSync(filePath, backupPath)
                logger.warn(`损坏的配置文件已备份为: ${backupPath}`)
            }
        } catch (backupErr) {
            logger.error('备份损坏的配置文件失败:', backupErr)
        }
        fileStateStore = new Store<FileState>({
            name: 'fileState',
            defaults: fileStateDefaults
        })
    }
    return fileStateStore
}

/**
 * 最近文件列表保留条数的提供者（「最近文件列表数量」设置）。
 *
 * 默认 10；system-setting 模块加载时注入读取 SystemSetting.recentFilesCount 的实现。
 * 用注入而非直接 import system-setting，是为了保持本模块的叶子依赖位置
 * （file-state-store 被 file-utils/security 等底层模块引用，直接 import 会把
 * theme-config/@electron-toolkit/utils 整条依赖链拉进来，破坏单测隔离）。
 */
let recentFilesLimitProvider: () => number = () => DEFAULT_RECENT_FILES_LIMIT

/** 注册最近文件列表保留条数的提供者（由 system-setting 在模块加载时调用） */
export function setRecentFilesLimitProvider(provider: () => number): void {
    recentFilesLimitProvider = provider
}

/** 当前生效的保留条数（已钳制到 5~20） */
export function getRecentFilesLimit(): number {
    try {
        return clampRecentFilesLimit(recentFilesLimitProvider())
    } catch (error) {
        logger.warn('[FileState] 读取最近文件列表数量失败，使用默认值:', error)
        return DEFAULT_RECENT_FILES_LIMIT
    }
}

/**
 * 把存量最近文件列表立即裁剪到当前保留条数（设置变更后由 config-manager 调用）。
 */
export function trimRecentFiles(): void {
    const store = getFileStateStore()
    const recentFiles = store.get('recentFiles', []) as string[]
    const limit = getRecentFilesLimit()
    if (recentFiles.length > limit) {
        store.set('recentFiles', recentFiles.slice(0, limit))
    }
}

/**
 * 保存上次打开的文件
 */
export function saveLastOpenedFile(filePath: string): void {
    const store = getFileStateStore()
    store.set('lastOpenedFile', filePath)

    // 同时添加到最近文件列表（去重置顶，按「最近文件列表数量」设置截断，默认最多 10 个）
    const recentFiles = store.get('recentFiles', []) as string[]
    const updatedRecentFiles = [filePath, ...recentFiles.filter((f) => f !== filePath)].slice(
        0,
        getRecentFilesLimit()
    )
    store.set('recentFiles', updatedRecentFiles)
}

/**
 * 获取上次打开的文件
 */
export function getLastOpenedFile(): string | null {
    return getFileStateStore().get('lastOpenedFile', null)
}

/**
 * 清除上次打开的文件
 */
export function clearLastOpenedFile(): void {
    getFileStateStore().set('lastOpenedFile', null)
}

/**
 * 保存上次打开的目录
 */
export function saveLastOpenedDirectory(dirPath: string): void {
    getFileStateStore().set('lastOpenedDirectory', dirPath)
}

/**
 * 获取上次打开的目录
 */
export function getLastOpenedDirectory(): string | null {
    return getFileStateStore().get('lastOpenedDirectory', null)
}

/**
 * 清除上次打开的目录
 */
export function clearLastOpenedDirectory(): void {
    getFileStateStore().set('lastOpenedDirectory', null)
}

/**
 * 获取最近文件列表
 */
export function getRecentFiles(): string[] {
    return getFileStateStore().get('recentFiles', []) as string[]
}

/**
 * 清除最近文件列表
 */
export function clearRecentFiles(): void {
    getFileStateStore().set('recentFiles', [])
}

/**
 * 从最近文件列表中移除指定文件
 */
export function removeRecentFile(filePath: string): void {
    const store = getFileStateStore()
    const recentFiles = store.get('recentFiles', []) as string[]
    const updatedRecentFiles = recentFiles.filter((f) => f !== filePath)
    store.set('recentFiles', updatedRecentFiles)
}

/**
 * 重置所有文件状态
 */
export function resetFileState(): void {
    getFileStateStore().clear()
}
