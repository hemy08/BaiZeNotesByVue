/**
 * 主进程 utils 层公共工具（纯函数 / 门面）
 *
 * P2 IPC 注册收口（2026-11-20）：本模块历史上同时是「IPC 注册枢纽」（29 处
 * `ipcListenerManager.register*` 调用，占全库 68 处的 43%）。这些注册已按通道域
 * 拆分到 `src/main/ipc/` 下的独立模块，由 `src/main/ipc/utils-ipc.ts` 统一编排：
 * - `ipc/file-manager-ipc.ts`：文件打开 / 文件管理器右键 / 插入图片；
 * - `ipc/crypto-ipc.ts`：RSA 生成 + Hash/HMAC/加解密；
 * - `ipc/navigation-ipc.ts`：执行本地可执行文件（多重安全校验）；
 * - `ipc/theme-ipc.ts`：主题 / 快速链接只读查询；
 * - `ipc/file-editor-ipc.ts`：文件编辑 / 落盘 / 读取；
 * - `ipc/system-ipc.ts`：应用版本。
 *
 * 本文件现在只保留纯工具函数与既有门面 re-export，不再 import ipc 层
 * （架构测试的 `utils-no-ipc` 例外随之清零）：
 * - AS-6 RSA 入参安全策略（bits 白名单归一化）；
 * - AS-7 / P3-2 可执行文件扩展名与敏感目录判定；
 * - file-utils / crypto 门面 re-export（保持既有公开 API 不变）。
 */
import { globalInitialize } from './global'
import * as FileUtils from './file-utils/index'
import {
    CreateHash,
    CreateHmac,
    CreateRsaKeyPair,
    CryptoDecrypt,
    CryptoEncrypt
} from './encrypt-decrypt'
import * as path from 'path'

export {
    globalInitialize,
    FileUtils,
    CreateRsaKeyPair,
    CreateHash,
    CreateHmac,
    CryptoEncrypt,
    CryptoDecrypt
}

/* ============================================================================
 * AS-6：插件/加密类 IPC 的输入校验策略（防止异常 payload 造成主进程 CPU/内存耗尽）
 *
 * 说明：校验函数本体已随 IPC 注册迁到 ipc/crypto-ipc.ts；本文件只保留可复用的
 * 纯策略（RSA bits 白名单归一化），供 ipc 层与单测共同消费。
 * ========================================================================== */

/** RSA 密钥长度白名单：仅允许业界常用档位（拒绝 1e6/1e9 等超大 modulusLength） */
export const ALLOWED_RSA_BITS: readonly number[] = [1024, 2048, 3072, 4096]
/** RSA bits 缺省/非法时的安全默认值 */
export const DEFAULT_RSA_BITS = 2048

/**
 * AS-6：归一化 RSA bits——非整数/白名单外的值回退默认 2048，
 * 防止渲染层传入超大 modulusLength 让主进程 CPU/内存耗尽（自伤型 DoS）。
 */
export function sanitizeRsaBits(input: unknown): number {
    if (typeof input === 'number' && Number.isInteger(input) && ALLOWED_RSA_BITS.includes(input)) {
        return input
    }
    return DEFAULT_RSA_BITS
}

/* ============================================================================
 * AS-7 / P3-2：可执行文件安全策略（OPEN_EXE 通道消费；纯函数，无 IPC 注册）
 * ========================================================================== */

// P3-2：系统敏感目录清单（系统程序目录，防大小写/`..` 混用绕过）。
// 历史实现（ARC-01）把系统程序目录视为「免确认受信目录」；AS-7 把用户可写的
// %LOCALAPPDATA%\Programs 移出免确认；本批（P3-2）进一步取消所有系统目录免确认
// ——该清单只用于确认框强化文案与审计日志（见 isSensitiveSystemExecutablePath）。
export function getSensitiveSystemExecutableDirs(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env
): string[] {
    if (platform === 'win32') {
        const candidates = [
            env.SystemRoot,
            env.windir,
            env.ProgramFiles,
            env['ProgramFiles(x86)'],
            env.ProgramW6432,
            env.ProgramData
        ]
        return [
            ...new Set(candidates.filter((dir): dir is string => !!dir && path.isAbsolute(dir)))
        ]
    }
    if (platform === 'darwin') {
        // macOS：系统卷与系统级程序目录（/Applications 为用户安装目录，不在此列）
        return ['/System', '/usr', '/bin', '/sbin', '/Library']
    }
    // 其他 POSIX（Linux 等）：系统级程序/配置目录
    return ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc']
}

/**
 * AS-7：用户可写的"伪受信"目录——%LOCALAPPDATA%\Programs 是 NSIS 等安装器的
 * 默认用户级安装位置，普通用户可写。保留其可被快速链接打开的能力（用户主动配置），
 * 但不得免确认执行（目录内的程序需用户显式确认后才交给 shell）。
 */
function getUserWritableExecutableDirs(): string[] {
    const candidates = [
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : undefined
    ]
    return candidates.filter((dir): dir is string => !!dir && path.isAbsolute(dir))
}

const DIRECT_EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.exe', '.com'])
const CONFIRM_EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
    '.bat',
    '.cmd',
    '.lnk',
    '.msi',
    '.ps1',
    '.vbs',
    '.js',
    '.jse',
    '.wsf',
    '.wsh',
    '.hta'
])

/**
 * AS-7：可执行文件扩展名白名单判定。
 * - 'direct'：系统受信目录内可直接打开（仅 .exe/.com）；
 * - 'confirm'：脚本/快捷方式/安装包（.bat/.cmd/.lnk/.msi/.ps1 等），无论位于哪个目录都必须确认；
 * - 'reject'：白名单外扩展名（.txt/.py/.url 等）一律不交给 shell.openPath。
 */
export function getExecutableExtensionDecision(input: unknown): 'direct' | 'confirm' | 'reject' {
    if (typeof input !== 'string' || input.trim().length === 0) {
        return 'reject'
    }
    const extension = path.extname(input.trim()).toLowerCase()
    if (DIRECT_EXECUTABLE_EXTENSIONS.has(extension)) {
        return 'direct'
    }
    if (CONFIRM_EXECUTABLE_EXTENSIONS.has(extension)) {
        return 'confirm'
    }
    return 'reject'
}

// ARC-01：判断目标路径是否位于受信目录内（path.relative 结果不得为绝对路径或以 .. 开头）
function isUnderDirectories(filePath: string, directories: string[]): boolean {
    const normalized = path.resolve(filePath)
    return directories.some((dir) => {
        const relative = path.relative(path.resolve(dir), normalized)
        return (
            relative !== '' &&
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
        )
    })
}

/**
 * P3-2：目标是否位于系统敏感目录（Windows/System32、Program Files、macOS /System 等）。
 * 仅用于确认框强化文案与审计日志：OPEN_EXE 已改为「一律需用户显式确认」。
 *
 * @param input 渲染层传入的路径（任意类型，非法/空串返回 false）
 * @param platform 目标平台（默认 process.platform；显式传入便于跨平台单测矩阵）
 * @param env 环境变量（默认 process.env；单测可注入）
 */
export function isSensitiveSystemExecutablePath(
    input: unknown,
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    if (typeof input !== 'string' || input.trim().length === 0) {
        return false
    }
    return isUnderDirectories(
        path.resolve(input.trim()),
        getSensitiveSystemExecutableDirs(platform, env)
    )
}

/**
 * AS-7：是否位于用户可写目录（用于确认提示/审计日志，不再免确认）。
 * 消费方：`ipc/navigation-ipc.ts`（OPEN_EXE 的强化文案分支）。
 */
export function isUserWritableExecutablePath(filePath: string): boolean {
    return isUnderDirectories(filePath, getUserWritableExecutableDirs())
}
