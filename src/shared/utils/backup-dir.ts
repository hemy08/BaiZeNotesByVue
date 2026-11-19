/**
 * 跨进程共享的备份目录纯函数（第 1 批公共接口归位：src/shared/utils/backup-dir.ts）。
 *
 * 背景：自动备份（`src/main/utils/auto-backup.ts`）与配置备份（`src/main/config/config-backup.ts`）
 * 的「时间戳命名 → 名称白名单校验 → path.relative 路径守卫 → 字典序滚动清理」纯样板同构
 * （见 auto-backup.ts:51-58,97-144,181-200 与 config-backup.ts:37-44,68-97,150-187），
 * 仅目录命名空间（前缀）与 IO 来源不同。本模块只抽纯函数，**不处理任何 IO**；
 * 各备份模块的写入/删除/恢复逻辑保留在原模块（后续批次再改调用）。
 *
 * 命名规则（两处原实现的正则合并，前缀可选）：
 * - 自动备份：`YYYYMMDD-HHmmss`，同一秒重名时追加 `-N` 序号；
 * - 配置备份：`config-backup-YYYYMMDD-HHmmss`，同一秒重名时追加 `-N` 序号。
 *
 * 边界约束（结构优化第 1 批 1.3 / L4：shared 边界例外收口）：
 * 本文件属 shared 纯函数层，**不得静态依赖 Node / Electron / Vue 运行时模块**。
 * 原实现直接 import `node:path` 的 `resolve / relative / isAbsolute`（与两处原实现的
 * 防逃逸校验逐字一致），现改为由调用方通过 {@link PathApi} **显式注入**路径能力：
 * 主进程调用方传真实 Node path 实现，测试可传任意等价实现；本文件自身仅依赖
 * 同目录纯函数 date.ts，不依赖 electron / vue，也不访问 DOM。
 */

import { formatDateTime } from './date'

/**
 * 路径能力接口（依赖注入，保持 shared 层纯函数边界）。
 *
 * 设计说明：
 * 1. 三个方法签名与 Node `path` 模块的同名函数一致，主进程可把 `node:path` 的
 *    `resolve` / `relative` / `isAbsolute` 直接作为实现注入（零适配成本）；
 * 2. shared 层不 import `node:path`，从而可在渲染进程、测试与任意宿主环境复用；
 * 3. 只声明本模块实际使用的三个能力，避免接口膨胀；新增能力需先确认纯函数边界。
 */
export interface PathApi {
    /** 合并路径片段为绝对路径（语义与 Node path.resolve 一致） */
    resolve(...paths: string[]): string
    /** 计算 from 到 to 的相对路径（语义与 Node path.relative 一致） */
    relative(from: string, to: string): string
    /** 判断是否为绝对路径（语义与 Node path.isAbsolute 一致） */
    isAbsolute(path: string): boolean
}

/** 自动备份目录名规则（对齐 auto-backup.ts:52）：`YYYYMMDD-HHmmss` 或追加 `-N` */
const AUTO_BACKUP_NAME_PATTERN = /^\d{8}-\d{6}(-\d+)?$/

/** 配置备份目录名规则（对齐 config-backup.ts:38）：`config-backup-YYYYMMDD-HHmmss` 或追加 `-N` */
const CONFIG_BACKUP_NAME_PATTERN = /^config-backup-\d{8}-\d{6}(-\d+)?$/

/** 备份名解析正则：可选前缀 + 时间戳六段（后缀序号忽略，仅用于校验与取值） */
const BACKUP_STAMP_PATTERN =
    /^(?:config-backup-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?$/

/** 备份时间戳格式（两处原实现一致） */
export const BACKUP_STAMP_PATTERN_FORMAT = 'YYYYMMDD-HHmmss'

/**
 * 生成备份目录时间戳：`YYYYMMDD-HHmmss`（本地时区）。
 *
 * 对齐 `auto-backup.ts:97-104`（formatAutoBackupStamp）与 `config-backup.ts:68-75`
 * （formatBackupStamp）：年份不补零、月/日/时/分/秒各补两位。
 *
 * 边界：非法日期返回空字符串（见 date.ts 的说明），调用方应保证传入有效 Date。
 *
 * @param date 备份时间
 * @returns 形如 `20261119-135551` 的时间戳
 */
export function formatBackupStamp(date: Date): string {
    return formatDateTime(date, BACKUP_STAMP_PATTERN_FORMAT)
}

/**
 * 是否为合法备份目录名（防路径逃逸的第一道关卡）。
 *
 * 对齐 `auto-backup.ts:106-109`（isValidAutoBackupName）与 `config-backup.ts:77-80`
 * （isValidBackupName）的白名单正则；本函数合并两条规则（`config-backup-` 前缀可选），
 * 供两种备份复用。只校验**命名形状**，不校验时间戳是否为真实日历日期
 * （与原实现一致；日历合法性由 {@link parseBackupStamp} 判断）。
 *
 * @param name 目录名（不是完整路径）
 * @returns 符合任一既有命名规则返回 true
 */
export function isValidBackupName(name: string): boolean {
    return AUTO_BACKUP_NAME_PATTERN.test(name) || CONFIG_BACKUP_NAME_PATTERN.test(name)
}

/**
 * 从备份目录名解析创建时间（命名含时间戳，不依赖目录 mtime）。
 *
 * 对齐 `auto-backup.ts:128-144`（parseAutoBackupCreatedAt）与
 * `config-backup.ts:122-138`（parseBackupCreatedAt）的取值方式：
 * 用本地时区 `new Date(year, month - 1, day, hour, minute, second)` 还原时间；
 * 同时支持 `config-backup-` 前缀与 `-N` 重名后缀。
 *
 * 与原实现的差异（以本函数为准）：原实现只判断 `Number.isNaN(date.getTime())`，
 * 而 JS Date 会把越界字段（如 13 月、2 月 30 日）**静默归一化**成其它日期，永远不产生
 * NaN——因此原实现实际上无法识别非法时间戳。本函数对年月日时分秒做**回读校验**，
 * 越界值返回 `null`，避免把错误时间显示给用户。
 *
 * @param name 备份目录名
 * @returns 时间戳毫秒数；命名不合法或时间字段越界返回 null
 */
export function parseBackupStamp(name: string): number | null {
    const match = BACKUP_STAMP_PATTERN.exec(name)
    if (!match) {
        return null
    }
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = Number(match[6])
    const date = new Date(year, month - 1, day, hour, minute, second)
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute ||
        date.getSeconds() !== second
    ) {
        return null
    }
    return date.getTime()
}

/**
 * 校验备份目录绝对路径是否严格位于备份根目录内，并返回解析后的绝对路径。
 *
 * 对齐 `auto-backup.ts:115-126`（resolveAutoBackupDirSafe）与
 * `config-backup.ts:86-97`（resolveBackupDirSafe）的逐字守卫：
 * 1. 名称先过白名单（{@link isValidBackupName}）；
 * 2. `path.resolve(root)` + `path.resolve(root, name)`；
 * 3. `path.relative` 结果为 `''`（等于根）、以 `..` 开头（逃逸）、或是绝对路径
 *    （Windows 跨盘符时 relative 会返回绝对路径）→ 一律返回 null。
 *
 * @param root 备份根目录
 * @param name 备份目录名
 * @param pathApi 路径能力实现（由调用方注入，主进程传 `node:path` 的同名函数；
 *                守卫逻辑与实现无关，同等语义实现得到同等结果）
 * @returns 备份目录绝对路径；非法/逃逸返回 null（调用方直接拒绝，不做任何读写）
 */
export function resolveBackupDirSafe(root: string, name: string, pathApi: PathApi): string | null {
    if (!isValidBackupName(name)) {
        return null
    }
    const resolvedRoot = pathApi.resolve(root)
    const target = pathApi.resolve(resolvedRoot, name)
    const relativePath = pathApi.relative(resolvedRoot, target)
    if (relativePath === '' || relativePath.startsWith('..') || pathApi.isAbsolute(relativePath)) {
        return null
    }
    return target
}

/**
 * 备份目录名排序：按名称**倒序**（最新在前），用于「保留最新 N 个、清理其余」。
 *
 * 对齐 `auto-backup.ts:199` 与 `config-backup.ts:186` 的
 * `(left, right) => right.name.localeCompare(left.name)`：
 * 目录名含 `YYYYMMDD-HHmmss` 时间戳，字典序即时间序，倒序首项为最新备份；
 * 调用方按 `sortBackupNames(names).slice(keep)` 裁剪即保留最新 keep 个
 * （对齐 `listAutoBackups().slice(keep)` / `listConfigBackups().slice(keep)` 的清理语义）。
 *
 * 说明：本函数只排序，不做过期名称过滤——调用方应先按 {@link isValidBackupName} 过滤
 * （与两处 list 函数「filter → sort」的顺序一致）。返回新数组，不修改入参。
 *
 * @param names 备份目录名数组（建议已过滤为合法名）
 * @returns 倒序（最新在前）的新数组
 */
export function sortBackupNames(names: string[]): string[] {
    return [...names].sort((left, right) => right.localeCompare(left))
}
