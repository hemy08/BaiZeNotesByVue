/**
 * B4 Wiki 链接重命名自动更新（主进程纯服务，1.5.1）
 *
 * ## 为什么分两阶段
 * 重命名前索引仍能把旧链接解析到旧路径，重命名后旧路径已不存在；因此：
 * 1. `buildWikiLinkRenamePlan()`：**重命名前**构建工作区索引，收集所有指向旧路径的
 *    Wiki 链接，计算每条链接的新目标与替换位置（不写盘）；
 * 2. `applyWikiLinkRenamePlan()`：文件重命名成功后按计划改写来源 Markdown 文件。
 * 若重命名失败，计划不应用，链接不会误改。
 *
 * ## 边界
 * - 只处理快照中 `resolvedPath` 命中旧路径的 Wiki 链接，保留 `|alias` / `#heading`；
 * - 目标写法尽量保持原风格：原链接无目录（basename）→ 新 basename；含目录 → 源文件目录
 *   到新文件的相对路径；原链接带扩展名则保留扩展名；
 * - 保留 BOM / CRLF / 正文其他内容；单个来源文件失败跳过，不中断其他文件；
 * - 来源路径必须在工作区根内（词法 containment）；快照已跳过符号链接；
 * - 上限：最多更新 200 个来源文件、5000 处链接；超限只处理前 N 条并在结果中标记 truncated；
 * - 不依赖 Electron/appState，可纯 Node 单测。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexLink,
    WorkspaceIndexSnapshot
} from '../../shared/types/workspace-index'
import { normalizeSlashes } from '../../shared/utils/path'
import { logger } from './logger'
import { buildWorkspaceIndex } from './workspace-index'
import { decodeFileContent, encodeFileContent } from './file-utils/file-encoding'

/** 可被 Wiki 链接更新的文本扩展名 */
const WIKI_TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
/** 单次重命名最多处理来源文件数 */
export const MAX_RENAME_LINK_FILES = 200
/** 单次重命名最多替换链接数 */
export const MAX_RENAME_LINK_REPLACEMENTS = 5000

/** 单个文件需要写入的链接替换计划 */
export interface WikiLinkFileUpdate {
    /** 来源文件绝对路径 */
    sourcePath: string
    /** 解码后的完整文本（BOM 已剥离） */
    content: string
    /** 原文件编码（decodeFileContent 归一化结果；写回保持原编码） */
    encoding: string
    /** 原文件 BOM 类型；null 表示无 BOM */
    bom: 'utf-8' | 'utf-16le' | 'utf-16be' | null
    /** 替换处数 */
    replacementCount: number
}

/** 重命名链接更新计划 */
export interface WikiLinkRenamePlan {
    rootPath: string
    oldPath: string
    newPath: string
    /** 需要写盘的来源文件（不包含旧文件自身不可读的情况） */
    updates: WikiLinkFileUpdate[]
    /** 计划替换总数 */
    replacementCount: number
    /** 是否因上限截断 */
    truncated: boolean
    /** 无法处理/跳过原因（可诊断，不向用户展示堆栈） */
    skipped: string[]
}

/** 应用计划的结果 */
export interface WikiLinkRenameApplyResult {
    updatedFiles: number
    replacements: number
    failedFiles: string[]
    truncated: boolean
}

function isWithinRoot(rootPath: string, filePath: string): boolean {
    const root = path.resolve(rootPath)
    const target = path.resolve(filePath)
    const relative = path.relative(root, target)
    return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isWikiTextPath(filePath: string): boolean {
    return WIKI_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/** 识别原文件 BOM（与 file-encoding 的 BOM 口径一致） */
function detectBom(buffer: Buffer): WikiLinkFileUpdate['bom'] {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf-8'
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf-16le'
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf-16be'
    }
    return null
}

/** 原编码 + 原 BOM 写回（BOM 不重复添加；编码模块保证非 UTF-8 可转码） */
function encodeUpdateBuffer(update: WikiLinkFileUpdate): Buffer {
    const encoded = encodeFileContent(update.content, update.encoding)
    if (update.bom === null) return encoded
    const bom =
        update.bom === 'utf-8'
            ? Buffer.from([0xef, 0xbb, 0xbf])
            : update.bom === 'utf-16le'
              ? Buffer.from([0xff, 0xfe])
              : Buffer.from([0xfe, 0xff])
    const alreadyHasBom =
        encoded.length >= bom.length && bom.every((byte, index) => encoded[index] === byte)
    return alreadyHasBom ? encoded : Buffer.concat([bom, encoded])
}

/** 从链接原文提取 `|alias` 与 `#heading`（alias 优先按第一个 | 分割） */
function splitWikiLinkRaw(raw: string): { alias: string; heading: string; target: string } | null {
    if (!raw.startsWith('[[') || !raw.endsWith(']]')) return null
    const inner = raw.slice(2, -2)
    const pipeIndex = inner.indexOf('|')
    const left = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner
    const alias = pipeIndex >= 0 ? inner.slice(pipeIndex) : ''
    const hashIndex = left.indexOf('#')
    const target = hashIndex >= 0 ? left.slice(0, hashIndex) : left
    const heading = hashIndex >= 0 ? left.slice(hashIndex) : ''
    return { alias, heading, target: target.trim() }
}

/** 为新目标选择尽量贴近原写法的形式 */
function buildNewLinkTarget(oldTarget: string, sourcePath: string, newPath: string): string {
    const hasDirectory = oldTarget.includes('/') || oldTarget.includes('\\')
    const hasExtension = /\.[A-Za-z0-9]+$/.test(oldTarget)
    const relative = normalizeSlashes(path.relative(path.dirname(sourcePath), newPath))
    const base = hasDirectory ? relative : normalizeSlashes(path.basename(newPath))
    if (hasExtension) return base
    const ext = path.extname(base)
    return ext.length > 0 ? base.slice(0, -ext.length) : base
}

/** 生成单条链接替换后的原文 */
function buildReplacementLink(raw: string, sourcePath: string, newPath: string): string | null {
    const parsed = splitWikiLinkRaw(raw)
    if (!parsed || parsed.target.length === 0) return null
    const nextTarget = buildNewLinkTarget(parsed.target, sourcePath, newPath)
    if (!nextTarget) return null
    return `[[${nextTarget}${parsed.heading}${parsed.alias}]]`
}

/**
 * 在内容中按快照给出的行/列替换链接。
 *
 * 同一文件内多链接按行列倒序应用，避免前面的替换移动后面的列号。
 */
function applyLinksToContent(
    content: string,
    sourcePath: string,
    links: WorkspaceIndexLink[],
    newPath: string
): { content: string; count: number } {
    const lines = content.split(/\r?\n/)
    const sorted = [...links].sort((left, right) => {
        if (left.line !== right.line) return right.line - left.line
        return right.column - left.column
    })
    let count = 0
    const seen = new Set<string>()
    for (const link of sorted) {
        const lineIndex = link.line - 1
        const line = lines[lineIndex]
        if (line === undefined) continue
        const start = link.column - 1
        if (start < 0 || line.slice(start, start + link.raw.length) !== link.raw) continue
        // 同一位置只替换一次（快照异常重复时不重复处理）
        const key = `${lineIndex}:${start}`
        if (seen.has(key)) continue
        seen.add(key)
        const replacement = buildReplacementLink(link.raw, sourcePath, newPath)
        if (replacement === null || replacement === link.raw) continue
        lines[lineIndex] = line.slice(0, start) + replacement + line.slice(start + link.raw.length)
        count++
    }
    return { content: lines.join(content.includes('\r\n') ? '\r\n' : '\n'), count }
}

/** 找出快照中指向旧路径的全部来源文件/链接（不写盘） */
export async function buildWikiLinkRenamePlan(
    rootPath: string,
    oldPath: string,
    newPath: string
): Promise<WikiLinkRenamePlan> {
    const plan: WikiLinkRenamePlan = {
        rootPath: path.resolve(rootPath),
        oldPath: path.resolve(oldPath),
        newPath: path.resolve(newPath),
        updates: [],
        replacementCount: 0,
        truncated: false,
        skipped: []
    }
    if (!plan.rootPath || !isWithinRoot(plan.rootPath, plan.oldPath)) {
        plan.skipped.push('old-path-outside-root')
        return plan
    }
    if (!isWithinRoot(plan.rootPath, plan.newPath)) {
        plan.skipped.push('new-path-outside-root')
        return plan
    }

    let snapshot: WorkspaceIndexSnapshot
    try {
        snapshot = await buildWorkspaceIndex(plan.rootPath)
    } catch (error) {
        logger.warn('[B4] 重命名前构建索引失败，跳过链接自动更新：', error)
        plan.skipped.push('index-build-failed')
        return plan
    }
    const oldKey = plan.oldPath.replace(/\\/g, '/').toLowerCase()
    const touchedFiles = new Set<string>()
    for (const file of snapshot.files) {
        if (plan.updates.length >= MAX_RENAME_LINK_FILES) {
            plan.truncated = true
            break
        }
        const matching = file.links.filter(
            (link) =>
                link.status === 'resolved' &&
                typeof link.resolvedPath === 'string' &&
                link.resolvedPath.replace(/\\/g, '/').toLowerCase() === oldKey
        )
        if (matching.length === 0) continue
        if (!isWithinRoot(plan.rootPath, file.path) || !isWikiTextPath(file.path)) {
            plan.skipped.push(`source-invalid:${file.relativePath}`)
            continue
        }
        // 旧文件自身会在重命名后移动到新路径；计划阶段写入旧路径会失败，跳过
        if (file.path.toLowerCase() === plan.oldPath.toLowerCase()) {
            plan.skipped.push(`source-renamed:${file.relativePath}`)
            continue
        }
        const key = file.path.toLowerCase()
        if (touchedFiles.has(key)) continue
        touchedFiles.add(key)
        let buffer: Buffer
        try {
            buffer = await fs.readFile(file.path)
        } catch (error) {
            logger.warn(`[B4] 读取来源文件失败，跳过链接更新：${file.path}`, error)
            plan.skipped.push(`source-read-failed:${file.relativePath}`)
            continue
        }
        let decoded: { content: string; encoding: string }
        try {
            decoded = decodeFileContent(buffer)
        } catch (error) {
            logger.warn(`[B4] 解码来源文件失败，跳过链接更新：${file.path}`, error)
            plan.skipped.push(`source-decode-failed:${file.relativePath}`)
            continue
        }
        const applied = applyLinksToContent(decoded.content, file.path, matching, plan.newPath)
        if (applied.count === 0) continue
        const remaining = MAX_RENAME_LINK_REPLACEMENTS - plan.replacementCount
        if (remaining <= 0) {
            plan.truncated = true
            break
        }
        plan.updates.push({
            sourcePath: file.path,
            content: applied.content,
            encoding: decoded.encoding,
            bom: detectBom(buffer),
            replacementCount: applied.count
        })
        plan.replacementCount += applied.count
        if (plan.replacementCount >= MAX_RENAME_LINK_REPLACEMENTS) {
            plan.truncated = true
            break
        }
    }
    return plan
}

/** 应用计划并写盘（单个文件失败不中断，返回失败清单） */
export async function applyWikiLinkRenamePlan(
    plan: WikiLinkRenamePlan
): Promise<WikiLinkRenameApplyResult> {
    const result: WikiLinkRenameApplyResult = {
        updatedFiles: 0,
        replacements: 0,
        failedFiles: [],
        truncated: plan.truncated
    }
    for (const update of plan.updates) {
        try {
            await fs.writeFile(update.sourcePath, encodeUpdateBuffer(update))
            result.updatedFiles++
            result.replacements += update.replacementCount
        } catch (error) {
            logger.warn(`[B4] 写入链接更新失败：${update.sourcePath}`, error)
            result.failedFiles.push(update.sourcePath)
        }
    }
    return result
}

/**
 * 一站式执行（供测试/独立调用）：先构建计划，再由调用方在重命名成功后应用。
 * 生产重命名链路应分别调用 build/apply，确保重命名失败时不改链接。
 */
export async function updateWikiLinksForRename(
    rootPath: string,
    oldPath: string,
    newPath: string
): Promise<{ plan: WikiLinkRenamePlan; applied: WikiLinkRenameApplyResult }> {
    const plan = await buildWikiLinkRenamePlan(rootPath, oldPath, newPath)
    return { plan, applied: await applyWikiLinkRenamePlan(plan) }
}

/** 导出给单测的纯 helper */
export const wikiLinkRenameInternals = {
    splitWikiLinkRaw,
    buildNewLinkTarget,
    buildReplacementLink,
    applyLinksToContent,
    isWithinRoot,
    isWikiTextPath,
    detectBom,
    encodeUpdateBuffer
}

/** 类型守卫：快照文件数组中的可更新文件（保留导出，便于未来 UI 使用） */
export function findSourcesForRename(
    snapshot: WorkspaceIndexSnapshot,
    oldPath: string
): WorkspaceIndexFile[] {
    const oldKey = path.resolve(oldPath).replace(/\\/g, '/').toLowerCase()
    return snapshot.files.filter((file) =>
        file.links.some(
            (link) =>
                link.status === 'resolved' &&
                typeof link.resolvedPath === 'string' &&
                link.resolvedPath.replace(/\\/g, '/').toLowerCase() === oldKey
        )
    )
}
