/**
 * 1.5.7 LLM Wiki L3：AI ingest 审批写盘（AI.APPLY_INGEST）
 *
 * ## 职责
 * 用户在 diff 审批 UI 点击「确认应用」后，把审批通过的草案内容写入 `wiki/` 下目标文件。
 *
 * ## 安全守卫（多层，任一失败即结构化拒绝、绝不落盘）
 * 1. `approved` 必须显式为 `true`（AI_NOT_APPROVED）；
 * 2. 目标路径：工作区相对路径词法白名单（拒绝绝对路径/盘符/UNC/`..`/控制字符）
 *    + 必须位于 `wiki/` 下 + 扩展名 `.md/.markdown`（AI_TARGET_NOT_ALLOWED）；
 * 3. Path Guard：`isPathAllowed`（受信根 + realpath 符号链接逃逸）复核目标路径；
 * 4. LLM Wiki raw 只读守卫：`assertWorkspaceWritable`（llm-wiki 模式下目标在 raw/ 内即拒绝）；
 * 5. 目标已存在时必须是普通文件（拒绝符号链接）；父目录 realpath 必须仍在工作区根内；
 * 6. 写入采用「临时文件 + rename」原子替换，失败清理临时文件（不留下半成品）。
 *
 * ## 说明
 * 本模块是唯一会被 AI 通道写盘的路径；不触碰编辑器状态、不广播文件变更（用户可自行刷新）。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type { AiApplyIngestRequest, AiApplyIngestResult } from '../../shared/types/ai'
import { AI_WIKI_FILE_EXTENSIONS } from '../../shared/constants/ai'
import { LLM_WIKI_WIKI_DIR_NAME } from '../../shared/constants/workspace-mode'
import { logger } from '../utils/logger'
import {
    assertSafePath,
    assertWorkspaceWritable,
    isPathAllowed,
    isSameOrWithin,
    PathAccessDeniedError
} from '../utils/security'
import { AiProviderError, sanitizeErrorMessage } from './errors'
import {
    isRelativePathInChildDir,
    normalizeWorkspaceRelativePath,
    resolvePathWithinWorkspaceChild
} from './workspace-path'

/** apply 依赖（工作区根由 IPC 层从 appState 取得） */
export interface AiApplyDeps {
    /** 工作区根绝对路径（生产：`appState.rootPath`） */
    rootPath: string
}

/** 是否为允许写入 wiki/ 的扩展名 */
function isSupportedWikiTarget(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return AI_WIKI_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** 解析安全的目标绝对路径（词法白名单 + wiki/ 目录 + 扩展名 + Path Guard + raw 守卫） */
async function resolveSafeApplyTarget(
    rootPath: string,
    draftPath: string
): Promise<{ absoluteTarget: string; normalizedDraftPath: string }> {
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        throw new AiProviderError('AI_WORKSPACE_UNAVAILABLE', '尚未打开工作区，无法写入 wiki 页面')
    }
    const normalizedDraftPath = normalizeWorkspaceRelativePath(draftPath)
    if (normalizedDraftPath === null) {
        throw new AiProviderError(
            'AI_TARGET_NOT_ALLOWED',
            '目标路径非法：只接受 wiki/ 下的工作区相对路径（禁止绝对路径、盘符与 .. 回溯）'
        )
    }
    if (!isRelativePathInChildDir(normalizedDraftPath, LLM_WIKI_WIKI_DIR_NAME)) {
        throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '目标路径必须位于 wiki/ 目录下')
    }
    if (!isSupportedWikiTarget(normalizedDraftPath)) {
        throw new AiProviderError(
            'AI_TARGET_NOT_ALLOWED',
            `目标扩展名不受支持（仅支持 ${AI_WIKI_FILE_EXTENSIONS.join(' / ')}）`
        )
    }
    let root: string
    try {
        root = assertSafePath(rootPath)
    } catch (error) {
        if (error instanceof PathAccessDeniedError) {
            throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '工作区路径不在受信范围，已拒绝写入')
        }
        throw error
    }
    const absoluteTarget = resolvePathWithinWorkspaceChild(
        root,
        normalizedDraftPath,
        LLM_WIKI_WIKI_DIR_NAME
    )
    if (absoluteTarget === null) {
        throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '目标路径越出工作区 wiki/ 目录')
    }
    // Path Guard：受信根 + realpath 符号链接逃逸校验（与既有写盘入口同口径）
    if (!isPathAllowed(absoluteTarget)) {
        throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '目标路径不在受信工作区内，已拒绝写入')
    }
    // LLM Wiki L1 写入守卫：llm-wiki 模式下 raw/ 只读（防御深度：wiki/ 目标理论上不会命中）
    try {
        assertWorkspaceWritable(root, absoluteTarget)
    } catch (error) {
        if (error instanceof PathAccessDeniedError) {
            throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '目标位于 raw/ 只读目录，已拒绝写入')
        }
        throw error
    }
    return { absoluteTarget, normalizedDraftPath }
}

/**
 * 审批通过后写入 wiki/ 页面（原子替换）。
 *
 * @param request 已由 IPC 层归一化的审批请求（approved 必须为 true）
 * @param deps 工作区根
 * @returns 成功返回写入字节数；失败抛 AiProviderError 由 IPC 层转结构化失败
 */
export async function runAiApplyIngest(
    request: AiApplyIngestRequest,
    deps: AiApplyDeps
): Promise<AiApplyIngestResult> {
    if (request.approved !== true) {
        throw new AiProviderError('AI_NOT_APPROVED', '未获得用户显式审批，已拒绝写入 wiki/')
    }
    const { absoluteTarget, normalizedDraftPath } = await resolveSafeApplyTarget(
        deps.rootPath,
        request.draftPath
    )
    const parentDirectory = path.dirname(absoluteTarget)

    // 目标已存在时：必须是普通文件（拒绝符号链接，防写入逃逸）
    try {
        const stats = await fs.lstat(absoluteTarget)
        if (stats.isSymbolicLink()) {
            throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '目标文件是符号链接，已拒绝写入')
        }
        if (!stats.isFile()) {
            throw new AiProviderError('AI_TARGET_NOT_ALLOWED', '目标路径不是普通文件，已拒绝写入')
        }
    } catch (error) {
        if (error instanceof AiProviderError) {
            throw error
        }
        // ENOENT：目标尚不存在（新建页面），继续
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            throw new AiProviderError(
                'AI_APPLY_FAILED',
                `检查目标文件失败：${sanitizeErrorMessage(error)}`
            )
        }
    }

    const tempPath = `${absoluteTarget}.tmp-${process.pid}-${Date.now()}`
    try {
        await fs.mkdir(parentDirectory, { recursive: true })
        // 父目录 realpath 必须在工作区根内（防通过符号链接目录把文件写到工作区外）
        const realRoot = await fs.realpath(assertSafePath(deps.rootPath))
        const realParent = await fs.realpath(parentDirectory)
        if (!isSameOrWithin(realParent, realRoot)) {
            throw new AiProviderError(
                'AI_TARGET_NOT_ALLOWED',
                '目标目录真实路径越出工作区，已拒绝写入'
            )
        }
        await fs.writeFile(tempPath, request.content, { encoding: 'utf-8' })
        await fs.rename(tempPath, absoluteTarget)
    } catch (error) {
        try {
            await fs.rm(tempPath, { force: true })
        } catch {
            // 清理失败不覆盖原始错误
        }
        if (error instanceof AiProviderError) {
            throw error
        }
        throw new AiProviderError(
            'AI_APPLY_FAILED',
            `写入 wiki 页面失败：${sanitizeErrorMessage(error)}`
        )
    }

    const bytes = Buffer.byteLength(request.content, 'utf8')
    logger.info(`[AI] apply 写入 wiki 页面：${normalizedDraftPath}（${bytes} 字节）`)
    return { ok: true, draftPath: normalizedDraftPath, bytes }
}
