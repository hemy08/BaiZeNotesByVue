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
 * 用户主目录与用户目录根、用户凭据/隐私目录）→ 路径存在 → 是目录；realpath 兜底
 * 防符号链接/目录联接指向危险根。校验不改变「最近文件夹」的合法工作方式——用户在
 * 系统对话框中选过的普通目录都会通过；仅拒绝递归遍历代价极高或敏感的路径。
 *
 * P1-1 补强（2026-11-20）：扫描发现 `OPEN_SPECIFIC_FOLDER` 仅拒绝磁盘根/主目录/系统目录，
 * 渲染层取得脚本执行能力后仍可把工作区指向 `~/.ssh`、`AppData`、浏览器配置等敏感目录，
 * 再经目录树/READ_HTML 读取凭据与隐私文件。因此新增「用户凭据/隐私目录」黑名单：
 * 凭据（.ssh/.gnupg/.aws/.azure/.kube/.docker/.password-store/.pki 等）、浏览器/邮件
 * 配置、用户级应用数据（.config/.local/.var/app）与本应用自身数据目录（.baizenotes）；
 * Windows 另拒绝 AppData（%APPDATA%/%LOCALAPPDATA%）与 macOS 的 Keychains/Library
 * 部分隐私目录；POSIX 平台补充 /etc、/root、/usr 等系统目录。realpath 校验复用同一
 * 判定，符号链接/目录联接指向敏感目录同样被拒。
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
// 公共接口归位第 2 批：路径归一化与包含判断统一引用 shared 真源
import { isPathWithin, normalizePathForCompare } from '../../shared/utils/path'

/** AS-2：路径比较前归一化（Windows 下盘符/目录名大小写不敏感） */
function toComparablePath(input: string): string {
    // 旧实现为 path.normalize(path.resolve(input)) + Windows 小写；shared 版本额外把
    // 分隔符统一为 `/`，仅用于比较，不影响真实 FS 访问
    return normalizePathForCompare(path.resolve(input), process.platform === 'win32')
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
 * P1-1：用户凭据/隐私目录（相对用户主目录，跨平台通用约定）。
 * 命中即拒绝——这些目录包含私钥、云厂商凭证、密码库、浏览器/邮件配置等敏感数据，
 * 不适合作为递归遍历 + 目录树回传的工作区。
 */
const HOME_SENSITIVE_RELATIVE_DIRECTORIES: readonly string[] = [
    // 凭据 / 密钥 / 加密身份
    '.ssh',
    '.gnupg',
    '.aws',
    '.azure',
    '.kube',
    '.docker',
    '.password-store',
    '.pki',
    '.1password',
    '.keybase',
    // 浏览器 / 邮件客户端配置
    '.mozilla',
    '.thunderbird',
    // 用户级应用数据与运行配置（Linux 及跨平台工具常用位置）
    '.config',
    '.local',
    '.var/app',
    // 本应用自身数据（配置 / 备份 / 日志）
    '.baizenotes'
]

/** P1-1：Windows 特有敏感目录（相对用户主目录）——%APPDATA%/%LOCALAPPDATA% 均在其下 */
const WIN32_HOME_SENSITIVE_RELATIVE_DIRECTORIES: readonly string[] = ['AppData']

/** P1-1：macOS 特有敏感目录（相对用户主目录）——钥匙串、浏览器、邮件/信息等隐私数据 */
const DARWIN_HOME_SENSITIVE_RELATIVE_DIRECTORIES: readonly string[] = [
    'Library/Keychains',
    'Library/Safari',
    'Library/Cookies',
    'Library/Messages',
    'Library/Mail',
    'Library/Accounts',
    'Library/Group Containers',
    'Library/Application Support/Google/Chrome',
    'Library/Application Support/Firefox',
    'Library/Application Support/Microsoft Edge',
    'Library/Application Support/BraveSoftware',
    'Library/Application Support/Opera',
    'Library/Application Support/Vivaldi'
]

/** P1-1：用户凭据/隐私目录被用作工作区时的拒绝原因 */
const SENSITIVE_WORKSPACE_ROOT_REASON = '不允许将用户凭据或隐私目录作为工作区'

/** P1-1：把候选路径集合转为可比较路径（忽略空值/重复项，大小写规则与平台一致） */
function toComparablePathSet(candidates: Array<string | undefined>): string[] {
    const directories = new Set<string>()
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') {
            directories.add(toComparablePath(candidate))
        }
    }
    return [...directories]
}

/**
 * P1-1：汇总敏感目录黑名单（可比较路径）。
 * - 用户主目录下的通用凭据/隐私目录；
 * - Windows：AppData（含环境变量 APPDATA/LOCALAPPDATA，防止目录被重定向）；
 * - macOS：钥匙串/浏览器/邮件等隐私目录 + /Library、/System、/Applications 等系统目录；
 * - 其他 POSIX：/etc、/root、/usr 等系统目录。
 */
function getSensitiveDirectories(): string[] {
    const candidates: Array<string | undefined> = []
    const homeDirRaw = path.resolve(os.homedir())
    for (const relativeDirectory of HOME_SENSITIVE_RELATIVE_DIRECTORIES) {
        candidates.push(path.join(homeDirRaw, relativeDirectory))
    }
    if (process.platform === 'win32') {
        for (const relativeDirectory of WIN32_HOME_SENSITIVE_RELATIVE_DIRECTORIES) {
            candidates.push(path.join(homeDirRaw, relativeDirectory))
        }
        candidates.push(process.env.APPDATA, process.env.LOCALAPPDATA)
    } else if (process.platform === 'darwin') {
        for (const relativeDirectory of DARWIN_HOME_SENSITIVE_RELATIVE_DIRECTORIES) {
            candidates.push(path.join(homeDirRaw, relativeDirectory))
        }
        candidates.push('/Library', '/System', '/Applications', '/private/etc')
    } else {
        candidates.push('/etc', '/root', '/boot', '/usr', '/bin', '/sbin', '/proc', '/sys', '/dev')
    }
    return toComparablePathSet(candidates)
}

/**
 * P1-1：候选路径是否位于系统临时目录子树内。
 *
 * 临时目录本身已是 Path Guard 的受信根（`security.ts` 的 collectBaseRoots），读取面不受
 * 本次黑名单影响；而 Windows 的 `%TEMP%` 通常位于 `AppData\Local\Temp` 下，若不做豁免，
 * 合法的临时目录工作区（含单测夹具）会被 AppData 黑名单误伤。豁免不扩大任何读取权限。
 */
function isWithinSystemTempDirectory(comparablePath: string): boolean {
    let tempDir: string
    try {
        tempDir = os.tmpdir()
    } catch {
        return false
    }
    if (tempDir.trim() === '') {
        return false
    }
    return isPathWithin(comparablePath, toComparablePath(tempDir), {
        win32CaseInsensitive: process.platform === 'win32'
    })
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
        // 公共接口归位第 2 批：系统目录及其子树的判定改用 shared 的 isPathWithin
        // （等价于旧 `equal || startsWith(systemDir + path.sep)`，大小写由平台参数决定）
        if (
            isPathWithin(comparablePath, systemDir, {
                win32CaseInsensitive: process.platform === 'win32'
            })
        ) {
            return '不允许将系统目录作为工作区'
        }
    }

    // P1-1：用户凭据/隐私目录（.ssh/.aws/AppData/浏览器配置等）同样拒绝，
    // 防止渲染层把工作区指向敏感目录后经目录树/READ_HTML 读取凭据与隐私文件。
    // 临时目录子树豁免：%TEMP% 位于 AppData 下但不扩大既有授权面（见函数注释）。
    if (!isWithinSystemTempDirectory(comparablePath)) {
        for (const sensitiveDir of getSensitiveDirectories()) {
            if (
                isPathWithin(comparablePath, sensitiveDir, {
                    win32CaseInsensitive: process.platform === 'win32'
                })
            ) {
                return SENSITIVE_WORKSPACE_ROOT_REASON
            }
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
export async function validateWorkspaceRoot(candidate: unknown): Promise<WorkspaceRootValidation> {
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
