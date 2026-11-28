/**
 * 1.5.7 LLM Wiki L3：工作区相对路径归一化（AI ingest / apply 共用）
 *
 * 安全要点（与 Path Guard 互补，先做「词法白名单」再做绝对路径校验）：
 * - 只接受**工作区相对路径**（拒绝绝对路径、盘符、UNC、设备命名空间）；
 * - 拒绝 `.` / `..` 段、空段、冒号（Windows ADS/盘符）、控制字符、URL 编码绕过；
 * - 统一把 `\` 归一为 `/`（Windows 用户可能粘贴反斜杠路径）；
 * - 以 `isSameOrWithin`（主进程 Path Guard 同款比较）复核解析后的绝对路径确实在期望根内。
 */
import * as path from 'path'
import { isSameOrWithin, normalizeLocalPath } from '../utils/security'

/** 单个路径段最大长度（字符） */
const MAX_SEGMENT_LENGTH = 255

/**
 * 归一化工作区相对路径。
 *
 * @param input 原始路径（渲染层载荷，类型未知）
 * @returns 归一化后的 posix 相对路径（如 `raw/2026-11-28-来源.md`）；非法返回 null
 */
export function normalizeWorkspaceRelativePath(input: unknown): string | null {
    if (typeof input !== 'string') {
        return null
    }
    const trimmed = input.trim()
    if (trimmed.length === 0 || trimmed.length > 4096) {
        return null
    }
    // 控制字符（含换行）一律拒绝
    for (let index = 0; index < trimmed.length; index += 1) {
        const code = trimmed.charCodeAt(index)
        if (code <= 0x1f || code === 0x7f) {
            return null
        }
    }
    // 拒绝绝对路径形态：/ 开头、\\ 开头、盘符、UNC、file:// 等
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
        return null
    }
    if (/^[A-Za-z]:/.test(trimmed) || trimmed.includes(':')) {
        return null
    }
    const normalizedSeparators = trimmed.replace(/\\/g, '/')
    const segments = normalizedSeparators.split('/')
    const safeSegments: string[] = []
    for (const segment of segments) {
        if (segment.length === 0 || segment === '.' || segment === '..') {
            return null
        }
        if (segment.length > MAX_SEGMENT_LENGTH) {
            return null
        }
        safeSegments.push(segment)
    }
    return safeSegments.join('/')
}

/**
 * 解析工作区相对路径为绝对路径，并复核位于指定子目录内（如 `raw/`、`wiki/`）。
 *
 * @param rootPath 工作区根绝对路径
 * @param relativePath 已归一化的工作区相对路径（{@link normalizeWorkspaceRelativePath} 结果）
 * @param expectedChildDir 期望的一级子目录名（如 `raw` / `wiki`）
 * @returns 绝对路径（词法归一化后）；越界/非法返回 null
 */
export function resolvePathWithinWorkspaceChild(
    rootPath: unknown,
    relativePath: string,
    expectedChildDir: string
): string | null {
    const root = normalizeLocalPath(rootPath)
    if (root === null) {
        return null
    }
    const childRoot = normalizeLocalPath(path.join(root, expectedChildDir))
    if (childRoot === null) {
        return null
    }
    const target = normalizeLocalPath(path.join(root, ...relativePath.split('/')))
    if (target === null) {
        return null
    }
    if (target === childRoot || !isSameOrWithin(target, childRoot)) {
        return null
    }
    return target
}

/** 判断工作区相对路径是否位于指定一级子目录下（如 `raw/xxx.md`） */
export function isRelativePathInChildDir(relativePath: string, childDir: string): boolean {
    const prefix = `${childDir.replace(/\/+$/, '')}/`
    return relativePath.startsWith(prefix) && relativePath.length > prefix.length
}

/** 把绝对路径转换为工作区相对路径（posix 分隔符；越界返回 null） */
export function toWorkspaceRelativePath(rootPath: unknown, absolutePath: unknown): string | null {
    const root = normalizeLocalPath(rootPath)
    const absolute = normalizeLocalPath(absolutePath)
    if (root === null || absolute === null) {
        return null
    }
    if (!isSameOrWithin(absolute, root)) {
        return null
    }
    return path.relative(root, absolute).split(path.sep).join('/')
}
