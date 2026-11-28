/**
 * 1.5.7 LLM Wiki L3：AI ingest（扫描 raw/ → 调 Provider → 生成 wiki 页面草案 + 行级 diff）
 *
 * ## 流程（计划 §5.2 任务 T3.2）
 * 1. 校验工作区根（只接受主进程 `appState.rootPath`，渲染层不传根路径）；
 * 2. 定位原始资料：指定 `rawPath` 时校验「工作区相对路径 + 位于 raw/ + 扩展名白名单」；
 *    缺省时递归扫描 `raw/`（深度/数量上限）并取排序后的首个可处理文件；
 * 3. 读取正文（≤256 KiB，超出截断并在提示词中标注），解析 front matter 取标题/标签；
 * 4. 匹配既有 wiki 页面（front matter `source` 指向该 raw 文件 → 作为「更新」目标），
 *    否则按文件名生成新页面路径 `wiki/<slug>.md`（重名自动追加序号）；
 * 5. 调用 Provider（system + user 提示词）生成草案，归一化 front matter/围栏；
 *    **模型选择**：AI.INGEST 载荷不含 modelId，统一使用配置中的默认模型
 *    （由 `runtime.loadConfiguredAiProvider` 解析 `defaultModelId`）；
 * 6. 计算「目标文件现有内容 vs 草案」行级 diff；
 * 7. 返回 `{ draftPath, content, diff, sourcePath, ... }` —— **全程不写盘**（写盘只在审批后）。
 *
 * ## 安全
 * - 只读：本模块对工作区不执行任何写操作；
 * - 路径：`normalizeWorkspaceRelativePath` / `resolvePathWithinWorkspaceChild` 词法白名单
 *   + 绝对路径复核；拒绝 `..`/盘符/UNC/控制字符；
 * - 日志：只记录 provider/模型/源路径/目标路径/耗时，不记录正文与密钥。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type { AiIngestRequest, AiIngestResult } from '../../shared/types/ai'
import {
    AI_INGEST_RAW_MAX_BYTES,
    AI_INGEST_PROMPT_MAX_CHARS,
    AI_RAW_FILE_EXTENSIONS,
    AI_RAW_SCAN_MAX_DEPTH,
    AI_RAW_SCAN_MAX_FILES,
    AI_WIKI_FILE_EXTENSIONS,
    AI_WIKI_SCAN_MAX_FILES
} from '../../shared/constants/ai'
// 1.5.7 LLM Wiki L1：raw/ 与 wiki/ 目录名唯一真源（不另写字符串字面量）
import {
    LLM_WIKI_RAW_DIR_NAME,
    LLM_WIKI_WIKI_DIR_NAME
} from '../../shared/constants/workspace-mode'
import { parseFrontMatter } from '../../shared/utils/front-matter'
import { logger } from '../utils/logger'
import { assertSafePath } from '../utils/security'
import { buildAiDiff } from './diff'
import { AiProviderError, sanitizeErrorMessage } from './errors'
import { buildDefaultDraftRelativePath, buildIngestMessages, normalizeDraftContent } from './prompt'
import { loadConfiguredAiProvider, type AiRuntimeProvider } from './runtime'
import {
    isRelativePathInChildDir,
    normalizeWorkspaceRelativePath,
    resolvePathWithinWorkspaceChild
} from './workspace-path'

/** 读取 wiki 既有页面内容的上限（字节；用于 diff 基线与 front matter 匹配） */
const WIKI_PAGE_READ_MAX_BYTES = 512 * 1024

/** 递归扫描 wiki/ 的最大目录深度 */
const WIKI_SCAN_MAX_DEPTH = 3

/** 新页面重名时最多尝试的序号（-2 ~ -20） */
const MAX_DRAFT_NAME_ATTEMPTS = 20

/** ingest 依赖（生产默认值；单测注入 provider loader/时钟） */
export interface AiIngestDeps {
    /** 工作区根绝对路径（生产：`appState.rootPath`） */
    rootPath: string
    /** Provider 装载器（默认按当前 AI 配置创建；单测注入替身） */
    providerLoader?: () => Promise<AiRuntimeProvider>
    /** 时间源（front matter 的 created/updated；单测固定日期） */
    now?: () => Date
}

/** 本地日期格式化为 YYYY-MM-DD（front matter 用） */
export function formatAiDate(date: Date): string {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
}

/** 校验工作区根存在且为目录（失败抛 AI_WORKSPACE_UNAVAILABLE） */
async function assertWorkspaceRoot(rootPath: string): Promise<void> {
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        throw new AiProviderError('AI_WORKSPACE_UNAVAILABLE', '尚未打开工作区，无法执行 AI 编译')
    }
    let stats
    try {
        stats = await fs.stat(assertSafePath(rootPath))
    } catch (error) {
        throw new AiProviderError(
            'AI_WORKSPACE_UNAVAILABLE',
            `工作区目录不可访问：${sanitizeErrorMessage(error)}`
        )
    }
    if (!stats.isDirectory()) {
        throw new AiProviderError(
            'AI_WORKSPACE_UNAVAILABLE',
            '当前工作区路径不是目录，无法执行 AI 编译'
        )
    }
}

/** 读取文件正文（≤maxBytes；超大文件截断，避免把巨大文件读入内存） */
async function readTextFileBounded(
    absolutePath: string,
    maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
    const handle = await fs.open(absolutePath, 'r')
    try {
        const stats = await handle.stat()
        const length = Math.min(stats.size, maxBytes)
        const buffer = Buffer.alloc(length)
        if (length > 0) {
            await handle.read(buffer, 0, length, 0)
        }
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
        return { text, truncated: stats.size > maxBytes }
    } finally {
        await handle.close()
    }
}

/** 是否为可处理的原始资料文件（扩展名白名单） */
function isSupportedRawFile(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return AI_RAW_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** 是否为可处理的 wiki 页面文件 */
function isSupportedWikiFile(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return AI_WIKI_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** 递归目录扫描：收集扩展名匹配的文件（posix 相对路径，排序；带数量/深度上限） */
async function collectFilesByExtension(
    absoluteRoot: string,
    isSupported: (fileName: string) => boolean,
    maxFiles: number,
    maxDepth: number
): Promise<string[]> {
    const collected: string[] = []
    const walk = async (currentDir: string, depth: number): Promise<void> => {
        if (collected.length >= maxFiles || depth > maxDepth) {
            return
        }
        let entries
        try {
            entries = await fs.readdir(currentDir, { withFileTypes: true })
        } catch {
            return
        }
        entries.sort((left, right) => left.name.localeCompare(right.name))
        for (const entry of entries) {
            if (collected.length >= maxFiles) {
                return
            }
            const entryPath = path.join(currentDir, entry.name)
            if (entry.isDirectory()) {
                await walk(entryPath, depth + 1)
                continue
            }
            if (!entry.isFile() || !isSupported(entry.name)) {
                continue
            }
            const relative = path.relative(absoluteRoot, entryPath).split(path.sep).join('/')
            collected.push(relative)
        }
    }
    await walk(absoluteRoot, 1)
    collected.sort((left, right) => left.localeCompare(right))
    return collected
}

/** 扫描 raw/ 下的可处理原始资料（工作区相对路径，已排序；失败抛 AI_WORKSPACE_UNAVAILABLE） */
export async function scanRawFiles(rootPath: string): Promise<string[]> {
    const rawRoot = path.join(assertSafePath(rootPath), LLM_WIKI_RAW_DIR_NAME)
    let stats
    try {
        stats = await fs.stat(rawRoot)
    } catch {
        throw new AiProviderError(
            'AI_WORKSPACE_UNAVAILABLE',
            '当前工作区未初始化 LLM Wiki（缺少 raw/ 目录）：请先执行「初始化 LLM Wiki」'
        )
    }
    if (!stats.isDirectory()) {
        throw new AiProviderError(
            'AI_WORKSPACE_UNAVAILABLE',
            '工作区 raw/ 不是目录，无法执行 AI 编译'
        )
    }
    const files = await collectFilesByExtension(
        rawRoot,
        isSupportedRawFile,
        AI_RAW_SCAN_MAX_FILES,
        AI_RAW_SCAN_MAX_DEPTH
    )
    return files.map((relative) => `${LLM_WIKI_RAW_DIR_NAME}/${relative}`)
}

/** 从 front matter 中读取标题/标签（容错：类型不符则忽略） */
function readFrontMatterMeta(markdown: string): { title?: string; tags?: string[] } {
    try {
        const parsed = parseFrontMatter(markdown)
        if (!parsed.present) {
            return {}
        }
        const titleValue = parsed.data.title
        const title =
            typeof titleValue === 'string' && titleValue.trim().length > 0
                ? titleValue.trim()
                : undefined
        const tagsValue = parsed.data.tags
        let tags: string[] | undefined
        if (Array.isArray(tagsValue)) {
            const list = tagsValue
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            tags = list.length > 0 ? list : undefined
        } else if (typeof tagsValue === 'string') {
            const list = tagsValue
                .split(/[,，]/)
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            tags = list.length > 0 ? list : undefined
        }
        return { title, tags }
    } catch {
        return {}
    }
}

/** 读取单个原始资料（校验路径 + 扩展名 + 正文 + front matter 元信息） */
export async function resolveIngestSource(
    rootPath: string,
    rawPath?: string
): Promise<{
    relativePath: string
    absolutePath: string
    content: string
    truncated: boolean
    title?: string
    tags?: string[]
}> {
    let relativePath: string
    if (rawPath !== undefined) {
        const normalized = normalizeWorkspaceRelativePath(rawPath)
        if (normalized === null) {
            throw new AiProviderError(
                'AI_RAW_PATH_INVALID',
                'rawPath 非法：只接受 raw/ 下的工作区相对路径（禁止绝对路径、盘符与 .. 回溯）'
            )
        }
        if (!isRelativePathInChildDir(normalized, LLM_WIKI_RAW_DIR_NAME)) {
            throw new AiProviderError('AI_RAW_PATH_INVALID', 'rawPath 必须位于 raw/ 目录下')
        }
        if (!isSupportedRawFile(normalized)) {
            throw new AiProviderError(
                'AI_RAW_PATH_INVALID',
                `rawPath 扩展名不受支持（仅支持 ${AI_RAW_FILE_EXTENSIONS.join(' / ')}）`
            )
        }
        const absolutePath = resolvePathWithinWorkspaceChild(
            rootPath,
            normalized,
            LLM_WIKI_RAW_DIR_NAME
        )
        if (absolutePath === null) {
            throw new AiProviderError('AI_RAW_PATH_INVALID', 'rawPath 越出工作区 raw/ 目录')
        }
        let stats
        try {
            stats = await fs.stat(absolutePath)
        } catch {
            throw new AiProviderError('AI_RAW_FILE_NOT_FOUND', `原始资料不存在：${normalized}`)
        }
        if (!stats.isFile()) {
            throw new AiProviderError(
                'AI_RAW_FILE_NOT_FOUND',
                `原始资料不是普通文件：${normalized}`
            )
        }
        relativePath = normalized
    } else {
        const files = await scanRawFiles(rootPath)
        if (files.length === 0) {
            throw new AiProviderError(
                'AI_NO_RAW_FILES',
                'raw/ 下暂无可处理的原始资料（仅支持 .md/.markdown/.txt）：请先放入原始资料后重试'
            )
        }
        relativePath = files[0]
    }
    const absolutePath = resolvePathWithinWorkspaceChild(
        rootPath,
        relativePath,
        LLM_WIKI_RAW_DIR_NAME
    )
    if (absolutePath === null) {
        throw new AiProviderError('AI_RAW_PATH_INVALID', '原始资料路径越出工作区 raw/ 目录')
    }
    let readResult: { text: string; truncated: boolean }
    try {
        readResult = await readTextFileBounded(absolutePath, AI_INGEST_RAW_MAX_BYTES)
    } catch (error) {
        throw new AiProviderError(
            'AI_RAW_FILE_NOT_FOUND',
            `读取原始资料失败：${sanitizeErrorMessage(error)}`
        )
    }
    if (readResult.text.trim().length === 0) {
        throw new AiProviderError(
            'AI_EMPTY_RESPONSE',
            `原始资料内容为空，无法编译：${relativePath}`
        )
    }
    const meta = readFrontMatterMeta(readResult.text)
    return {
        relativePath,
        absolutePath,
        content: readResult.text,
        truncated: readResult.truncated || readResult.text.length > AI_INGEST_PROMPT_MAX_CHARS,
        title: meta.title,
        tags: meta.tags
    }
}

/** 从 wiki 页面 front matter 的 source 字段判断是否关联指定原始资料 */
function pageSourcesInclude(pageMarkdown: string, sourceRelativePath: string): boolean {
    try {
        const parsed = parseFrontMatter(pageMarkdown)
        if (!parsed.present) {
            return false
        }
        const sourceValue = parsed.data.source
        const candidates: string[] = []
        if (typeof sourceValue === 'string') {
            candidates.push(sourceValue)
        } else if (Array.isArray(sourceValue)) {
            for (const item of sourceValue) {
                if (typeof item === 'string') {
                    candidates.push(item)
                }
            }
        }
        return candidates.some((candidate) => {
            const normalized = candidate
                .trim()
                .replace(/\\/g, '/')
                .replace(/^\.\//, '')
                .replace(/^\/+/, '')
            return normalized === sourceRelativePath
        })
    } catch {
        return false
    }
}

/**
 * 查找与该原始资料关联的既有 wiki 页面（front matter source 匹配）。
 *
 * @returns 工作区相对路径（如 `wiki/xxx.md`）；未找到返回 null
 */
export async function findWikiPageForSource(
    rootPath: string,
    sourceRelativePath: string
): Promise<string | null> {
    const root = assertSafePath(rootPath)
    const wikiRoot = path.join(root, LLM_WIKI_WIKI_DIR_NAME)
    let stats
    try {
        stats = await fs.stat(wikiRoot)
    } catch {
        return null
    }
    if (!stats.isDirectory()) {
        return null
    }
    const files = await collectFilesByExtension(
        wikiRoot,
        isSupportedWikiFile,
        AI_WIKI_SCAN_MAX_FILES,
        WIKI_SCAN_MAX_DEPTH
    )
    for (const relative of files) {
        const absolutePath = path.join(wikiRoot, ...relative.split('/'))
        let pageMarkdown: string
        try {
            pageMarkdown = (await readTextFileBounded(absolutePath, WIKI_PAGE_READ_MAX_BYTES)).text
        } catch {
            continue
        }
        if (pageSourcesInclude(pageMarkdown, sourceRelativePath)) {
            return `${LLM_WIKI_WIKI_DIR_NAME}/${relative}`
        }
    }
    return null
}

/**
 * 决定草案目标路径：
 * - 已有 source 匹配的 wiki 页面 → 更新该页面（isUpdate=true）；
 * - 否则生成新页面 `wiki/<slug>.md`，重名时追加 `-2`、`-3`…（最多 20 次）。
 */
export async function resolveDraftTarget(
    rootPath: string,
    sourceRelativePath: string
): Promise<{ draftPath: string; isUpdate: boolean; existingContent: string }> {
    const root = assertSafePath(rootPath)
    const existingPage = await findWikiPageForSource(rootPath, sourceRelativePath)
    if (existingPage !== null) {
        const absolutePath = resolvePathWithinWorkspaceChild(
            root,
            existingPage,
            LLM_WIKI_WIKI_DIR_NAME
        )
        if (absolutePath !== null) {
            try {
                const { text } = await readTextFileBounded(absolutePath, WIKI_PAGE_READ_MAX_BYTES)
                return { draftPath: existingPage, isUpdate: true, existingContent: text }
            } catch {
                // 读取失败时按「已有页面但无基线」处理：apply 仍会做完整路径/守卫校验
                return { draftPath: existingPage, isUpdate: true, existingContent: '' }
            }
        }
    }
    const baseRelative = buildDefaultDraftRelativePath(sourceRelativePath)
    const baseName = (baseRelative.split('/').pop() ?? baseRelative).replace(
        /\.(?:md|markdown)$/i,
        ''
    )
    for (let attempt = 1; attempt <= MAX_DRAFT_NAME_ATTEMPTS; attempt += 1) {
        const candidate =
            attempt === 1 ? baseRelative : `${LLM_WIKI_WIKI_DIR_NAME}/${baseName}-${attempt}.md`
        const normalized = normalizeWorkspaceRelativePath(candidate)
        if (normalized === null) {
            continue
        }
        const absolutePath = resolvePathWithinWorkspaceChild(
            root,
            normalized,
            LLM_WIKI_WIKI_DIR_NAME
        )
        if (absolutePath === null) {
            continue
        }
        try {
            await fs.access(absolutePath)
            // 已存在：尝试下一个序号
            continue
        } catch {
            // 不存在：可使用
        }
        return { draftPath: normalized, isUpdate: false, existingContent: '' }
    }
    throw new AiProviderError(
        'AI_TARGET_NOT_ALLOWED',
        `无法生成可用的 wiki 页面路径（重名尝试 ${MAX_DRAFT_NAME_ATTEMPTS} 次）：请检查 wiki/ 目录`
    )
}

/**
 * 执行 AI ingest：生成草案 + diff（**不写盘**）。
 *
 * @param request 已由 IPC 层归一化的请求（缺省 rawPath = 自动扫描 raw/）
 * @param deps 工作区根 + Provider 装载器 + 时钟
 * @returns 成功 = 草案 + 行级 diff；失败抛 AiProviderError（由 IPC 层转结构化失败）
 */
export async function runAiIngest(
    request: AiIngestRequest,
    deps: AiIngestDeps
): Promise<AiIngestResult> {
    const startedAt = Date.now()
    await assertWorkspaceRoot(deps.rootPath)
    const source = await resolveIngestSource(deps.rootPath, request.rawPath)
    const target = await resolveDraftTarget(deps.rootPath, source.relativePath)

    const today = formatAiDate((deps.now ?? (() => new Date()))())
    const messages = buildIngestMessages({
        sourceRelativePath: source.relativePath,
        rawContent: source.content,
        rawTruncated: source.truncated,
        rawTitle: source.title,
        rawTags: source.tags,
        draftRelativePath: target.draftPath,
        today
    })

    const providerLoader = deps.providerLoader ?? (() => loadConfiguredAiProvider())
    const { provider } = await providerLoader()
    let chatResult
    try {
        chatResult = await provider.chat(messages)
    } catch (error) {
        if (error instanceof AiProviderError) {
            throw error
        }
        throw new AiProviderError('AI_HTTP_ERROR', `AI 编译失败：${sanitizeErrorMessage(error)}`)
    }
    const content = normalizeDraftContent({
        modelOutput: chatResult.content,
        sourceRelativePath: source.relativePath,
        rawTitle: source.title,
        rawTags: source.tags,
        today
    })
    if (content.replace(/^---[\s\S]*?---/, '').trim().length === 0) {
        throw new AiProviderError('AI_EMPTY_RESPONSE', 'AI 生成的页面正文为空，请稍后重试')
    }
    const diff = buildAiDiff(target.existingContent, content)
    logger.info(
        `[AI] ingest 完成：source=${source.relativePath} target=${target.draftPath} ` +
            `isUpdate=${target.isUpdate} model=${chatResult.model} ` +
            `diff(+${diff.additions}/-${diff.deletions}) 耗时=${Date.now() - startedAt}ms`
    )
    return {
        ok: true,
        draftPath: target.draftPath,
        content,
        diff: diff.lines,
        sourcePath: source.relativePath,
        isUpdate: target.isUpdate,
        diffTruncated: diff.truncated,
        model: chatResult.model
    }
}
