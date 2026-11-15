/**
 * 主进程安全工具（两批）：
 *
 * 一、P0 安全批次 A：导航边界与 shell 协议白名单
 * 背景：主窗口未拦截 `will-navigate`，`setWindowOpenHandler` 直接把任意 URL 交给
 * `shell.openExternal`；渲染层拖入远程链接可触发主窗口导航。本模块提供统一的
 * 协议白名单与导航边界判定，供主进程窗口、菜单、IPC 处理器与在线网页对话框复用。
 *
 * 策略（收敛为两条）：
 * 1. 交给系统 shell 打开的外部链接只允许 http/https（file:/javascript:/data:/自定义协议
 *    一律拒绝并 console.warn），避免协议混淆把本地文件或可执行内容交给系统打开；
 * 2. 应用窗口只允许导航到自身受信来源（dev 服务器地址或打包后的 renderer index.html），
 *    其余目标一律 preventDefault，防止不可信页面替换应用界面后接触 IPC / 本地文件。
 *
 * 二、P1-AS-1：文件路径守卫（本文件末尾 Path Guard 段）
 * 文件类 IPC 此前只校验 sender、不校验 path；本段提供统一的「允许根范围」判定，
 * 供 file-operations / utils.ts(READ_HTML/CHECK_EXISTS) / clipboard-operations 复用。
 *
 * 本模块只依赖 electron 的 shell 与 Node 内置模块，保持纯函数部分可直接单测。
 */
import { shell } from 'electron'
import { fileURLToPath } from 'url'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { appState } from './app-state'
// CQ-10：本模块保留 2 处被测试断言参数的 console.warn（openExternalSafely 拒绝/失败），
// 其余告警统一走 logger（写文件 + 控制台镜像 + WARN 状态栏镜像）。
import { logger } from './logger'

/** 允许交给系统 shell 打开的外部协议白名单（仅 http/https） */
export const ALLOWED_EXTERNAL_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:'])

/** 应用窗口导航边界判定参数 */
export interface AppNavigationOptions {
    /** 开发模式下的渲染进程 dev server 地址（如 http://localhost:5173/）；生产环境不传 */
    devUrl?: string | null
    /** 打包/构建后的 renderer index.html 绝对路径 */
    rendererIndexPath?: string | null
}

/** 安全解析 URL：非字符串/空串/非法 URL 一律返回 null（不抛异常） */
function parseUrlSafely(url: unknown): URL | null {
    if (typeof url !== 'string' || url.trim().length === 0) {
        return null
    }
    try {
        return new URL(url)
    } catch {
        return null
    }
}

/**
 * 归一化受信外部 URL：仅 http/https 返回规范化后的 href，其余返回 null。
 * 使用解析后的 href（而非原始字符串）可避免 `https:\\\\evil` 之类的协议混淆写法。
 */
export function normalizeSafeExternalUrl(url: string): string | null {
    const parsed = parseUrlSafely(url)
    if (parsed === null || !ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        return null
    }
    return parsed.href
}

/** 是否为允许交给系统 shell 打开的外部链接（纯函数，不产生副作用） */
export function isSafeExternalUrl(url: string): boolean {
    return normalizeSafeExternalUrl(url) !== null
}

/**
 * 是否为 dev server 地址（同 origin，且位于 dev URL 的路径前缀下）。
 * 用于开发模式下放行 Vite dev server 的页面导航。
 */
export function isDevServerUrl(url: string, devUrl: string): boolean {
    const target = parseUrlSafely(url)
    const dev = parseUrlSafely(devUrl)
    if (target === null || dev === null) {
        return false
    }
    if (target.origin !== dev.origin) {
        return false
    }
    // dev URL 根路径（如 http://localhost:5173）放行其同源全部页面
    if (dev.pathname === '' || dev.pathname === '/') {
        return target.pathname.startsWith('/')
    }
    const devBase = dev.pathname.endsWith('/') ? dev.pathname : `${dev.pathname}/`
    return target.pathname === dev.pathname || target.pathname.startsWith(devBase)
}

/**
 * 是否为打包后的 renderer index.html（file: 协议 + 规范化路径完全一致）。
 * Windows 下盘符大小写不敏感，统一转小写比较。
 */
export function isRendererIndexFileUrl(url: string, rendererIndexPath: string): boolean {
    const target = parseUrlSafely(url)
    if (target === null || target.protocol !== 'file:') {
        return false
    }
    if (typeof rendererIndexPath !== 'string' || rendererIndexPath.length === 0) {
        return false
    }
    try {
        const targetPath = path.normalize(fileURLToPath(target))
        const expectedPath = path.normalize(path.resolve(rendererIndexPath))
        const normalize = (value: string): string =>
            process.platform === 'win32' ? value.toLowerCase() : value
        return normalize(targetPath) === normalize(expectedPath)
    } catch {
        // fileURLToPath 对带 host 的 UNC file URL 等情况可能抛错，按不信任处理
        return false
    }
}

/**
 * 应用窗口导航边界判定（纯函数）：只放行 dev server 地址与本地 renderer index.html。
 * 其余（外部 http/https、file:/javascript:/data:/自定义协议、非法 URL）一律返回 false。
 */
export function isAllowedAppNavigation(url: string, options: AppNavigationOptions = {}): boolean {
    if (parseUrlSafely(url) === null) {
        return false
    }
    if (options.devUrl != null && isDevServerUrl(url, options.devUrl)) {
        return true
    }
    if (
        options.rendererIndexPath != null &&
        isRendererIndexFileUrl(url, options.rendererIndexPath)
    ) {
        return true
    }
    return false
}

/**
 * 安全地在系统默认浏览器中打开外部链接。
 *
 * - 仅放行 http/https（规范化 href 后交给 shell，避免协议混淆）；
 * - 解析失败 / 其他协议：console.warn 并返回 false（不调用 shell）；
 * - shell 打开失败：console.warn 并返回 false（不向上抛异常，调用方可按返回值处理）。
 *
 * @returns 是否已成功交给系统 shell 打开
 */
export async function openExternalSafely(url: string): Promise<boolean> {
    const normalized = normalizeSafeExternalUrl(url)
    if (normalized === null) {
        console.warn(`[Security] 已拒绝打开不受信任的外部链接（仅允许 http/https）：${String(url)}`)
        return false
    }
    try {
        await shell.openExternal(normalized)
        return true
    } catch (error) {
        console.warn(`[Security] 打开外部链接失败：${normalized}`, error)
        return false
    }
}

/* ============================================================================
 * P1-AS-1：文件 IPC 路径守卫（Path Guard）
 *
 * 背景：文件类 IPC 此前只校验 sender、不校验 path —— 渲染层一旦取得脚本执行能力
 * （历史 P0 攻击链第 2 环）即可任意读取/覆盖本地文件、复制/删除任意路径，
 * CHECK_EXISTS 还可做路径预言机。
 *
 * 允许的根范围（白名单，其余一律拒绝）：
 * 1. 当前工作区根 appState.rootPath 及其子树（rootPath 只由主进程设置，其取值合法性
 *    由 AS-2 的 OPEN_SPECIFIC_FOLDER 校验负责；本模块用 isSafeWorkspaceRoot 做形状校验）；
 * 2. 系统临时目录 os.tmpdir()（临时文件/图片缓存/日志回退目录）；
 * 3. 用户经系统对话框显式选择过的路径（registerTrustedPath / registerTrustedDirectory
 *    在 dialog 返回后登记；「最近打开」历史同属用户选择，由 file-operations 注入 provider）；
 * 4. 当前活动文件所在目录（单文件模式：用户经对话框打开工作区外文件后，同目录的图片写入、
 *    新建/重命名等正常操作仍可用；活动文件路径本身已通过校验才会成为活动文件）。
 *
 * 拒绝：非字符串/空串/相对路径、含 NUL、UNC 共享根、设备命名空间（\\?\、\\.\）、
 * 盘符根（C:\）、规范化后逃逸出白名单根的 `..` 路径；对目标路径另行做 realpath
 * 「符号链接/junction 逃逸」校验（目标不存在时回溯最近存在祖先）。
 *
 * 设计约束：判定同步执行、不抛异常（assertSafePath 例外）；Windows 下路径比较
 * 大小写不敏感；本模块不依赖 electron app 模块，便于单测直接加载。
 * ========================================================================== */

/** 文件名中禁止出现的控制字符（逐字符判断，避免 no-control-regex 规则告警） */
function hasControlChars(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        if (code <= 0x1f || code === 0x7f) {
            return true
        }
    }
    return false
}

/** Windows 文件名非法字符（含路径分隔符与 ADS 冒号） */
const WINDOWS_ILLEGAL_FILENAME_PATTERN = /[<>:"/\\|?*]/
/** Windows 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9，可带扩展名） */
const WINDOWS_RESERVED_DEVICE_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
/** 文件扩展名白名单格式：一个或多个 .xxx 段，如 .md / .tar.gz */
const SAFE_EXTENSION_PATTERN = /^(\.[A-Za-z0-9]+)+$/
/** 设备命名空间 / UNC 根前缀（\\?\、\\.\、\\??\ 等一律拒绝） */
const DEVICE_NAMESPACE_PATTERN = /^[\\/]{2}[.?!]/

/** 用户经系统对话框选择、允许访问的精确文件路径集合 */
const trustedFilePaths = new Set<string>()
/** 用户经系统对话框选择、允许访问的目录子树集合 */
const trustedDirectoryPaths = new Set<string>()
/** 「最近打开」历史提供者（由 file-operations 注册；返回的文件/目录视为用户此前选择过） */
export interface TrustedHistoryEntries {
    /** 最近打开过的文件（精确路径） */
    files?: string[]
    /** 最近打开过的目录（子树） */
    directories?: string[]
}
let trustedHistoryProvider: (() => TrustedHistoryEntries) | null = null

/** 当前是否为 Windows（路径比较与文件名规则依赖平台） */
function isWindowsPlatform(): boolean {
    return process.platform === 'win32'
}

/**
 * 归一化用于比较的路径：path.normalize + 去掉尾部分隔符 + Windows 下转小写。
 * 仅用于白名单比较，不用于真实 FS 访问。
 */
function normalizeForCompare(value: string): string {
    const normalized = path.normalize(value)
    const trimmed =
        normalized.length > 1 && normalized.endsWith(path.sep)
            ? normalized.slice(0, -1)
            : normalized
    return isWindowsPlatform() ? trimmed.toLowerCase() : trimmed
}

/**
 * 解析 UNC 路径的共享根（\\server\share）；非 UNC 返回 null。
 * 注意：只接受形如 \\server\share 且 server/share 均非空的名字。
 */
function parseUncShareRoot(value: string): string | null {
    const match = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(?:[\\/]|$)/.exec(value)
    if (!match) {
        return null
    }
    return `\\\\${match[1]}\\${match[2]}`
}

/** 判断归一化后的路径是否位于 UNC 共享根（\\server\share） */
function isUncShareRootPath(normalizedPath: string): boolean {
    if (!/^[\\/]{2}/.test(normalizedPath)) {
        return false
    }
    const shareRoot = parseUncShareRoot(normalizedPath)
    return (
        shareRoot !== null && normalizeForCompare(normalizedPath) === normalizeForCompare(shareRoot)
    )
}

/**
 * 本地绝对路径归一化（白名单判定的唯一入口）：
 * - 非字符串/空白串/NUL/相对路径/盘符根/设备命名空间/UNC 共享根 → null；
 * - 通过后返回 path.resolve 规范化后的绝对路径（`..` 已按文件系统语义折叠）。
 *
 * @param input 待校验路径（渲染层 IPC 载荷，类型未知）
 * @param allowUncShareRoot 是否允许 UNC 共享根本身（仅「受信目录登记」需要，
 *        普通文件访问一律要求位于共享子目录内，避免直接把整个共享作为操作根）
 */
function normalizeLocalPathInternal(input: unknown, allowUncShareRoot: boolean): string | null {
    if (typeof input !== 'string') {
        return null
    }
    const raw = input.trim()
    if (raw.length === 0 || raw.includes('\u0000')) {
        return null
    }
    // 设备命名空间（\\?\C:\...、\\.\PhysicalDrive0、\\??\...）一律拒绝
    if (DEVICE_NAMESPACE_PATTERN.test(raw)) {
        return null
    }
    const isUncRaw = raw.startsWith('\\\\') || raw.startsWith('//')
    if (isUncRaw) {
        // UNC 仅在 Windows 下有意义；且只允许共享子目录（除非显式允许共享根）
        if (!isWindowsPlatform()) {
            return null
        }
        const resolvedUnc = path.resolve(raw)
        const shareRoot = parseUncShareRoot(resolvedUnc)
        if (shareRoot === null) {
            return null
        }
        if (!allowUncShareRoot && isUncShareRootPath(resolvedUnc)) {
            return null
        }
        return resolvedUnc
    }
    if (!path.isAbsolute(raw)) {
        return null
    }
    const resolved = path.resolve(raw)
    // 拒绝盘符根（C:\）与 POSIX 文件系统根（/）
    if (normalizeForCompare(resolved) === normalizeForCompare(path.parse(resolved).root)) {
        return null
    }
    return resolved
}

/**
 * 归一化文件/目录候选路径（白名单判定入口）。
 * 返回规范化绝对路径；非法/越界形态返回 null。
 */
export function normalizeLocalPath(input: unknown): string | null {
    return normalizeLocalPathInternal(input, false)
}

/**
 * 归一化「根目录」路径：与 normalizeLocalPath 相同，但允许 UNC 共享根本身
 * （用户可在目录选择框中直接选中网络共享根，登记后其子树受信）。
 */
export function normalizeTrustedRootPath(input: unknown): string | null {
    return normalizeLocalPathInternal(input, true)
}

/**
 * 判断 candidate 是否等于 root 或位于 root 子树（词法比较，不解析符号链接）。
 * 调用方需保证两者均已规范化。
 */
function isSameOrWithin(candidate: string, root: string): boolean {
    const normalizedCandidate = normalizeForCompare(candidate)
    const normalizedRoot = normalizeForCompare(root)
    if (normalizedCandidate === normalizedRoot) {
        return true
    }
    const rootWithSeparator = normalizedRoot.endsWith(path.sep)
        ? normalizedRoot
        : normalizedRoot + path.sep
    return normalizedCandidate.startsWith(rootWithSeparator)
}

/**
 * 解析路径的真实物理路径（realpath），用于阻断符号链接/junction 逃逸：
 * - 目标存在：直接 realpath；
 * - 目标不存在（如另存为的新文件）：逐级回溯到最近存在的祖先做 realpath，再拼回剩余段。
 * 无法解析（盘符不存在、权限拒绝等）时返回 null。
 */
function resolveRealPathBestEffort(targetPath: string): string | null {
    try {
        return fs.realpathSync(targetPath)
    } catch {
        // 目标不存在：回溯最近存在的祖先目录
    }
    let current = path.dirname(targetPath)
    const tailSegments: string[] = [path.basename(targetPath)]
    for (let depth = 0; depth < 64; depth += 1) {
        try {
            const realAncestor = fs.realpathSync(current)
            return path.join(realAncestor, ...tailSegments)
        } catch {
            const parent = path.dirname(current)
            if (parent === current) {
                return null
            }
            tailSegments.unshift(path.basename(current))
            current = parent
        }
    }
    return null
}

/** 收集「最近打开」历史（提供者异常/缺失时按空处理，不阻断主流程） */
function collectTrustedHistory(): { files: string[]; directories: string[] } {
    const files: string[] = []
    const directories: string[] = []
    if (!trustedHistoryProvider) {
        return { files, directories }
    }
    try {
        const entries = trustedHistoryProvider()
        if (Array.isArray(entries.files)) {
            files.push(...entries.files.filter((file): file is string => typeof file === 'string'))
        }
        if (Array.isArray(entries.directories)) {
            directories.push(
                ...entries.directories.filter((dir): dir is string => typeof dir === 'string')
            )
        }
    } catch (error) {
        logger.warn('[Security] 读取最近打开受信记录失败（按不受信处理）：', error)
    }
    return { files, directories }
}

/** 汇总除活动文件目录外的全部受信根（工作区、临时目录、对话框受信目录、历史目录） */
function collectBaseRoots(): string[] {
    const roots: string[] = []
    // 1. 工作区根（形状非法时忽略，避免把非法 rootPath 当受信根）
    const workspaceRoot = normalizeLocalPath(appState.rootPath)
    if (workspaceRoot !== null) {
        roots.push(workspaceRoot)
    }
    // 2. 系统临时目录
    const tempRoot = normalizeLocalPath(os.tmpdir())
    if (tempRoot !== null) {
        roots.push(tempRoot)
    }
    // 3. 运行期登记的用户选择目录
    trustedDirectoryPaths.forEach((dir) => roots.push(dir))
    // 4. 「最近打开」历史目录（用户此前经对话框选择过）
    const history = collectTrustedHistory()
    history.directories.forEach((dir) => {
        const normalized = normalizeLocalPath(dir)
        if (normalized !== null) {
            roots.push(normalized)
        }
    })
    return roots
}

/** 汇总运行期登记的精确受信文件 + 历史最近文件 */
function collectTrustedFiles(): string[] {
    const files: string[] = []
    trustedFilePaths.forEach((file) => files.push(file))
    const history = collectTrustedHistory()
    history.files.forEach((file) => {
        const normalized = normalizeLocalPath(file)
        if (normalized !== null) {
            files.push(normalized)
        }
    })
    return files
}

/** 词法白名单匹配：精确受信文件命中，或位于某个受信根子树内 */
function matchesLexicalPolicy(candidate: string, roots: string[], files: string[]): boolean {
    const normalizedCandidate = normalizeForCompare(candidate)
    if (files.some((file) => normalizeForCompare(file) === normalizedCandidate)) {
        return true
    }
    return roots.some((root) => isSameOrWithin(candidate, root))
}

/**
 * 符号链接/junction 逃逸校验（仅在词法命中后调用）：
 * 候选路径的真实物理路径必须仍位于「词法命中的受信根」内，或等于受信文件真实路径。
 * 仅当词法命中的根本身无法解析（不存在/网络盘未挂载）时，才按词法结果保守放行——
 * 不能因为集合里存在某个无关的不可解析根就放行可解析根下的符号链接逃逸。
 */
function passesRealPathPolicy(candidate: string, matchedRoots: string[], files: string[]): boolean {
    const realCandidate = resolveRealPathBestEffort(candidate)
    if (realCandidate === null) {
        return false
    }
    let hasUnresolvedMatchedRoot = false
    for (const root of matchedRoots) {
        const realRoot = resolveRealPathBestEffort(root)
        if (realRoot === null) {
            hasUnresolvedMatchedRoot = true
            continue
        }
        if (isSameOrWithin(realCandidate, realRoot)) {
            return true
        }
    }
    // 词法命中受信文件（另存为目标、单文件打开等）：其真实路径必须与候选项一致
    const normalizedRealCandidate = normalizeForCompare(realCandidate)
    const matchedFiles = files.filter(
        (file) => normalizeForCompare(file) === normalizeForCompare(candidate)
    )
    for (const file of matchedFiles) {
        const realFile = resolveRealPathBestEffort(file)
        if (realFile !== null && normalizeForCompare(realFile) === normalizedRealCandidate) {
            return true
        }
    }
    return hasUnresolvedMatchedRoot
}

/**
 * P1-AS-1 核心判定：路径是否在允许范围内。
 *
 * 纯同步、不抛异常；渲染层载荷（任意类型）可直接传入。
 * 越界/非法形态返回 false，调用方应给用户可见提示并中止操作。
 */
export function isPathAllowed(input: unknown): boolean {
    const candidate = normalizeLocalPath(input)
    if (candidate === null) {
        return false
    }
    const roots = collectBaseRoots()
    const files = collectTrustedFiles()
    // 当前活动文件所在目录：单文件模式（工作区外打开单个文件）下仍允许同目录的正常操作。
    // 前提是活动文件本身仍在受信范围内，避免把任意 currentActiveFile 变成授权根。
    const activeFile = normalizeLocalPath(appState.currentActiveFile?.path)
    if (activeFile !== null && matchesLexicalPolicy(activeFile, roots, files)) {
        const activeDirectory = path.dirname(activeFile)
        if (activeDirectory !== path.parse(activeDirectory).root) {
            roots.push(activeDirectory)
        }
    }
    // 词法判定：先确定命中的根（符号链接校验只针对命中的根，防止无关根干扰）
    const lexicalRoots = roots.filter((root) => isSameOrWithin(candidate, root))
    const normalizedCandidate = normalizeForCompare(candidate)
    const lexicalFileMatch = files.some((file) => normalizeForCompare(file) === normalizedCandidate)
    if (lexicalRoots.length === 0 && !lexicalFileMatch) {
        return false
    }
    return passesRealPathPolicy(candidate, lexicalRoots, files)
}

/**
 * 路径访问被拒绝时抛出的受控异常（供 invoke/handle 通道转换为 reject）。
 * 调用方可据此把错误转换为用户可读提示，而不是把主进程异常抛给渲染层。
 */
export class PathAccessDeniedError extends Error {
    /** 被拒绝的原始路径（保持字符串形态用于提示/日志） */
    readonly filePath: string

    constructor(filePath: unknown) {
        const display = typeof filePath === 'string' ? filePath : String(filePath)
        super(`Path access denied: ${display}`)
        this.name = 'PathAccessDeniedError'
        this.filePath = display
    }
}

/**
 * P1-AS-1 断言入口：路径在允许范围内返回规范化绝对路径，否则抛 PathAccessDeniedError。
 * 适用于 invoke/handle 等「失败需要 reject 给调用方」的通道；send 通道建议用
 * isPathAllowed + 状态栏提示并 return。
 */
export function assertSafePath(input: unknown): string {
    const candidate = normalizeLocalPath(input)
    if (candidate === null || !isPathAllowed(candidate)) {
        throw new PathAccessDeniedError(input)
    }
    return candidate
}

/**
 * 工作区根路径形状校验（AS-1 防御深度，AS-2 的取值合法性由其 handler 负责）：
 * 非空、绝对路径、非盘符根/文件系统根、非设备命名空间、非 UNC 共享根。
 * 注意：允许 UNC 共享「子目录」作为工作区（task-13 明确保留网络共享子目录场景），
 * 但直接以共享根作工作区仍拒绝。
 */
export function isSafeWorkspaceRoot(input: unknown): boolean {
    return normalizeLocalPath(input) !== null
}

/**
 * 登记用户经系统对话框选择过的路径：
 * - 文件/尚未创建的目标文件：精确受信（另存为、打开单文件）；
 * - 已存在的目录：同时登记为受信目录子树（目录选择框返回）。
 */
export function registerTrustedPath(input: unknown): void {
    const normalized = normalizeTrustedRootPath(input)
    if (normalized === null) {
        return
    }
    trustedFilePaths.add(normalized)
    try {
        if (fs.statSync(normalized).isDirectory()) {
            trustedDirectoryPaths.add(normalized)
        }
    } catch {
        // 文件可能尚不存在（另存为的目标路径），仅按精确文件受信
    }
}

/** 显式登记用户经系统对话框选择过的目录（其整个子树受信，目录可尚不存在） */
export function registerTrustedDirectory(input: unknown): void {
    const normalized = normalizeTrustedRootPath(input)
    if (normalized !== null) {
        trustedDirectoryPaths.add(normalized)
    }
}

/**
 * 注册「最近打开」历史提供者（由 file-operations 注入 file-state-store 的读取逻辑，
 * 避免 security.ts 直接依赖 electron-store）。
 */
export function setTrustedHistoryProvider(provider: (() => TrustedHistoryEntries) | null): void {
    trustedHistoryProvider = provider
}

/** 清空运行期受信路径（仅供单元测试隔离使用） */
export function clearTrustedPathsForTesting(): void {
    trustedFilePaths.clear()
    trustedDirectoryPaths.clear()
    trustedHistoryProvider = null
}

/** 读取当前运行期受信路径（仅供单元测试断言） */
export function getTrustedPathsForTesting(): { files: string[]; directories: string[] } {
    return {
        files: Array.from(trustedFilePaths),
        directories: Array.from(trustedDirectoryPaths)
    }
}

/**
 * AS-8：`shell.showItemInFolder` 目标路径校验。
 *
 * 背景：资源管理器定位通道（FILE_MANAGER.FIND_IN / FILE_MANAGER.OPEN_IN_EXPLORER）此前
 * 只校验发送方，targetPath 直接交给系统：`\\attacker\share\file` 会让 Windows 资源管理器
 * 发起 SMB 认证（NTLM 哈希泄露/中继攻击），也可用于探测任意路径是否存在。
 *
 * 策略（与 Path Guard 复用同一白名单）：
 * 1. 拒绝一切 UNC 路径（`\\server\share`、`//server/share`）与设备命名空间（`\\?\`、`\\.\`）——
 *    即使该共享被用户打开为工作区，也不通过系统资源管理器重新发起网络认证；
 * 2. 其余路径必须为绝对路径且位于受信根内（工作区/临时目录/用户对话框选择过的路径/最近历史）。
 */
export function isSafeShowItemInFolderPath(input: unknown): boolean {
    if (typeof input !== 'string') {
        return false
    }
    const raw = input.trim()
    if (raw.length === 0) {
        return false
    }
    // 设备命名空间与 UNC（含正斜杠写法）一律拒绝
    if (DEVICE_NAMESPACE_PATTERN.test(raw)) {
        return false
    }
    if (raw.startsWith('\\\\') || raw.startsWith('//')) {
        return false
    }
    return isPathAllowed(raw)
}

/**
 * 文件名白名单（AS-1：CREATE_FILE_FOLDER / 新建 / 重命名 / 图片保存的 name 参数）：
 * 拒绝空串、`.`/`..`、路径分隔符、Windows 非法字符、控制字符、保留设备名、
 * 尾部点/空格（Windows 会静默截断，可能绕过同名判断）。
 */
export function isSafeFileName(input: unknown): boolean {
    if (typeof input !== 'string') {
        return false
    }
    // 注意用原始串做后续判定（不 trim）：Windows 会静默去掉文件名末尾的点/空格，
    // 若按 trim 后判定会出现「校验通过、实际写入被截断」的绕过。
    const name = input
    if (name.trim().length === 0 || name.length > 255) {
        return false
    }
    if (name === '.' || name === '..') {
        return false
    }
    if (hasControlChars(name)) {
        return false
    }
    if (WINDOWS_ILLEGAL_FILENAME_PATTERN.test(name)) {
        return false
    }
    if (isWindowsPlatform()) {
        if (name.endsWith('.') || name.endsWith(' ')) {
            return false
        }
        if (WINDOWS_RESERVED_DEVICE_PATTERN.test(name)) {
            return false
        }
    }
    return true
}

/**
 * 扩展名白名单（AS-1：创建文件/图片保存的 extension 参数）：
 * 仅接受单个或多个 `.xxx` 段（如 `.md`、`.tar.gz`），拒绝空串、分隔符与特殊字符。
 */
export function isSafeFileExtension(input: unknown): boolean {
    if (typeof input !== 'string') {
        return false
    }
    return SAFE_EXTENSION_PATTERN.test(input)
}
