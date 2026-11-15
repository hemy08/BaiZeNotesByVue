/**
 * AS-2：工作区根目录校验（公共实现）
 *
 * 从 src/main/ipc/handlers.ts 提取（原为 open-specific-folder 通道的私有函数），
 * 供两处共用同一规则：
 * 1. handlers.ts 的 OPEN_SPECIFIC_FOLDER（渲染层「最近文件夹」入口）；
 * 2. startup-restore.ts 的启动恢复（P2-6：历史遗留 lastOpenedDirectory 若指向
 *    主目录/系统目录等危险路径，启动即全量遍历 + 自动备份全量收集，恢复前必须拦截）。
 *
 * 规则：字符串 → 绝对路径 → 非危险根（磁盘根/UNC 根/POSIX 根、系统目录及其子树、
 * 用户主目录与用户目录根）→ 路径存在 → 是目录；realpath 兜底防符号链接/目录联接
 * 指向危险根。校验不改变「最近文件夹」的合法工作方式——用户在系统对话框中选过的
 * 普通目录都会通过；仅拒绝递归遍历代价极高或敏感的路径。
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/** AS-2：路径比较前归一化（Windows 下盘符/目录名大小写不敏感） */
function toComparablePath(input: string): string {
    const normalized = path.normalize(path.resolve(input))
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** AS-2：Windows 系统目录清单（取环境变量，缺失的跳过），用于拒绝系统目录及其子树 */
function getSystemDirectories(): string[] {
    const env = process.env
    const candidates = [
        env.SystemRoot,
        env.WINDIR,
        env.ProgramFiles,
        env['ProgramFiles(x86)'],
        env.ProgramData
    ]
    const directories = new Set<string>()
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') {
            directories.add(toComparablePath(candidate))
        }
    }
    return [...directories]
}

/**
 * AS-2：危险工作区根判定（返回中文原因，安全路径返回 null）。
 * 拒绝：磁盘根 / UNC 共享根 / POSIX 根（path.parse().root 全覆盖）、系统目录及其子树、
 * 用户主目录与用户目录根（如 C:\Users）。这些路径递归遍历代价极高且多为敏感区。
 */
export function detectDangerousWorkspaceRoot(resolvedPath: string): string | null {
    const comparablePath = toComparablePath(resolvedPath)
    const absolutePath = path.resolve(resolvedPath)

    const parsedRoot = path.parse(absolutePath).root
    if (parsedRoot !== '' && toComparablePath(parsedRoot) === comparablePath) {
        return '不允许将磁盘根目录、网络共享根目录或文件系统根目录作为工作区'
    }

    const homeDirRaw = path.resolve(os.homedir())
    const homeDir = toComparablePath(homeDirRaw)
    if (comparablePath === homeDir) {
        return '不允许将用户主目录作为工作区'
    }
    const usersRoot = toComparablePath(path.dirname(homeDirRaw))
    if (usersRoot !== homeDir && comparablePath === usersRoot) {
        return '不允许将用户目录根作为工作区'
    }

    for (const systemDir of getSystemDirectories()) {
        if (comparablePath === systemDir || comparablePath.startsWith(`${systemDir}${path.sep}`)) {
            return '不允许将系统目录作为工作区'
        }
    }
    return null
}

/** AS-2：工作区根目录校验结果 */
export type WorkspaceRootValidation = { ok: true; path: string } | { ok: false; reason: string }

/**
 * AS-2：校验工作区根目录（原 open-specific-folder 直接信任入参）。
 * 后续若引入主进程统一 path-guard（security.ts），可把本函数内联规则替换为复用实现。
 */
export async function validateWorkspaceRoot(
    candidate: unknown
): Promise<WorkspaceRootValidation> {
    if (typeof candidate !== 'string' || candidate.trim() === '') {
        return { ok: false, reason: '目录路径为空或格式非法' }
    }
    if (!path.isAbsolute(candidate)) {
        return { ok: false, reason: '仅允许绝对路径作为工作区目录' }
    }
    const resolvedPath = path.resolve(candidate)
    const dangerousReason = detectDangerousWorkspaceRoot(resolvedPath)
    if (dangerousReason !== null) {
        return { ok: false, reason: dangerousReason }
    }

    let stats: fs.Stats
    try {
        stats = await fs.promises.stat(resolvedPath)
    } catch {
        return { ok: false, reason: '目录不存在或无法访问' }
    }
    if (!stats.isDirectory()) {
        return { ok: false, reason: '目标路径不是目录' }
    }

    // realpath 兜底：符号链接/目录联接可能把看似安全的路径指向危险根目录
    try {
        const realPath = await fs.promises.realpath(resolvedPath)
        const realDangerousReason = detectDangerousWorkspaceRoot(realPath)
        if (realDangerousReason !== null) {
            return { ok: false, reason: realDangerousReason }
        }
    } catch {
        // realpath 失败（权限不足/特殊文件系统）不阻断，stat 已确认是合法目录
    }
    return { ok: true, path: resolvedPath }
}
