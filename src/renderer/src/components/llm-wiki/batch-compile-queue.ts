/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译队列控制器（渲染层，纯 TS + 可注入依赖）。
 *
 * ## 队列状态机
 * ```text
 * idle --prepare--> preparing --(成功)--> ready --start--> generating
 *                     |                        |                |
 *                     +--(失败)--> blocked      |                +--（一批生成完成）--> approving
 *                                              |                |                      |
 *                                              |                |    逐项 应用/跳过/冲突处理
 *                                              |                |                      |
 *                                              |                +<----（本批全部处理）--+
 *                                              |                |
 *                                              |                +--pause--> paused --resume--> generating
 *                                              |                |
 *                                              +---------------> finished <--cancel--+
 * ```
 * - **增量跳过**：`ready` 阶段展示预检数量；`start(mode='incremental')` 时已编译且未被
 *   人工修改的目标直接记为 skipped（不调用 AI）；`mode='all'`（重新编译全部）全部重新生成；
 * - **人工修改保护**：每个草案生成后用**主进程权威 draftPath + 重新读取当前页面**复核，
 *   页面存在且无法证明「上次 AI 产物未被修改」（无记录/哈希不一致/来源不一致/读取失败）
 *   时标记冲突，必须由用户显式选择「跳过 / 覆盖 / 查看 diff 后手动确认」；
 * - **取消语义**：停止后续处理；已 `APPLY_INGEST` 成功的页面不回滚，审批阶段未应用的
 *   草案一律不写盘（丢弃在内存）；**暂停语义**：当前文件完成后停（不中断进行中的 AI 调用）。
 *
 * ## 职责边界
 * - 本模块不直接触达 IPC/DOM/localStorage：全部经 {@link BatchCompileDeps} 注入
 *   （生产装配在 `batch-compile-runtime.ts`，单测注入替身）；
 * - 不新增 IPC：生成/写盘/配置读取分别复用 `AI.INGEST` / `AI.APPLY_INGEST` /
 *   `AI.GET_CONFIG`；目标清单复用既有目录树事件；
 * - 不写 `raw/`：编译产物只经 `AI.APPLY_INGEST` 写入 `wiki/`（主进程再做 Path Guard
 *   与 raw 只读守卫）。
 */
import type { AiIngestSuccess } from '../../../../shared/types/ai'
import { logger } from '../../common/logger'
import {
    buildBatchCompileWikiPageIndex,
    classifyBatchCompilePageState,
    createDefaultBatchCompileRequest,
    findBatchCompileWikiPageBySource,
    hashBatchCompileContent,
    normalizeBatchCompileRequest,
    normalizeBatchCompileSourcePath,
    readBatchCompilePageSource,
    resolveBatchCompileTargets,
    shouldSkipBatchCompileTarget,
    toBatchCompileConflictReason,
    type BatchCompileCompileRecord,
    type BatchCompileConflictReason,
    type BatchCompilePageState,
    type BatchCompileRawFile,
    type BatchCompileRecordStore,
    type BatchCompileWikiPage,
    type BatchCompileWikiPageIndexEntry,
    type BatchCompileWorkspaceTree,
    type NormalizedBatchCompileRequest
} from '../../common/batch-compile'

/* ============================================================================
 * 一、注入依赖（生产实现见 batch-compile-runtime.ts）
 * ========================================================================== */

/** AI 配置摘要（隐私提示 + 未配置阻止启动用） */
export interface BatchCompileAiConfig {
    /** 是否已启用且存在可用模型（false 时队列阻止启动并引导配置） */
    configured: boolean
    /** 配置读取是否失败（按未配置处理，文案区分引导） */
    readFailed: boolean
    /** 默认模型 id（AI.INGEST 固定使用默认模型） */
    defaultModelId: string | null
    /** 默认模型显示名 */
    defaultModelName: string | null
    /** 默认模型是否为远程（true 时启动前必须展示远程隐私提示） */
    defaultModelRemote: boolean
    /** 是否存在本地模型（仅用于提示「可切换默认模型」，AI.INGEST 不支持按次指定模型） */
    hasLocalModel: boolean
}

/** 目录树加载结果 */
export type BatchCompileTreeOutcome =
    { ok: true; tree: BatchCompileWorkspaceTree } | { ok: false; error: string }

/** AI.INGEST 结果 */
export type BatchCompileIngestOutcome =
    { ok: true; draft: AiIngestSuccess } | { ok: false; error: string }

/** AI.APPLY_INGEST 结果 */
export type BatchCompileApplyOutcome = { ok: true; path: string } | { ok: false; error: string }

/** 队列依赖（全部可注入，便于纯逻辑单测） */
export interface BatchCompileDeps {
    /** 时间源（记录 updatedAt / 排序；单测固定） */
    now?: () => number
    /** 加载工作区目录树（生产：既有 FILE_MANAGER 事件；不新增 IPC） */
    loadWorkspaceTree: () => Promise<BatchCompileTreeOutcome>
    /** 读取文本文件（生产：FILE.READ_HTML；失败返回 null） */
    readText: (absolutePath: string) => Promise<string | null>
    /** 读取 AI 配置摘要（生产：AI.GET_CONFIG） */
    readAiConfig: () => Promise<BatchCompileAiConfig>
    /** 生成单个 raw 文件的 wiki 草案（生产：AI.INGEST + rawPath） */
    ingest: (rawPath: string) => Promise<BatchCompileIngestOutcome>
    /** 审批后写入 wiki 页面（生产：AI.APPLY_INGEST，approved=true） */
    apply: (request: { draftPath: string; content: string }) => Promise<BatchCompileApplyOutcome>
    /** 编译记录存储（生产：localStorage；不可用时内存降级） */
    records: BatchCompileRecordStore
}

/* ============================================================================
 * 二、队列状态（UI 只读消费快照）
 * ========================================================================== */

/** 队列阶段 */
export type BatchCompilePhase =
    'idle' | 'preparing' | 'ready' | 'generating' | 'approving' | 'paused' | 'blocked' | 'finished'

/** 阻止启动的结构化原因 */
export type BatchCompileBlockedCode =
    'not-configured' | 'config-read-failed' | 'workspace-unavailable' | 'no-files' | 'load-failed'

/** 阻止启动原因 */
export interface BatchCompileBlockedReason {
    code: BatchCompileBlockedCode
    /** 可读补充（目录树错误等；未配置/无文件时缺省） */
    detail?: string
}

/** 单项处理状态 */
export type BatchCompileItemStatus =
    | 'pending'
    | 'skipped'
    | 'generating'
    | 'waiting'
    | 'applying'
    | 'applied'
    | 'skipped-manual'
    | 'conflict-skipped'
    | 'failed'
    | 'canceled'

/** 单个编译目标（raw 文件）的运行时状态 */
export interface BatchCompileItem {
    /** 稳定 id（= raw 工作区相对路径） */
    id: string
    /** raw 文件工作区相对路径（AI.INGEST 入参） */
    rawRelativePath: string
    /** raw 文件绝对路径（展示用） */
    rawAbsolutePath: string
    /** 预处理判定的页面状态（增量/冲突预检） */
    pageState: BatchCompilePageState
    /** 预处理判定的冲突原因（null = 无需人工确认） */
    conflict: BatchCompileConflict | null
    /** 增量模式下是否会被直接跳过 */
    incrementalSkip: boolean
    status: BatchCompileItemStatus
    /** 主进程返回的权威目标页面相对路径（生成后才可知） */
    draftPath: string | null
    /** 本次使用的模型名（生成后回填） */
    model: string | null
    /** 失败原因（可读） */
    error: string | null
    /** 应用成功时间（毫秒时间戳） */
    appliedAt: number | null
}

/** 人工修改冲突（页面存在且不可安全覆盖） */
export interface BatchCompileConflict {
    reason: BatchCompileConflictReason
    /** 目标 wiki 页面相对路径 */
    targetPath: string
}

/** 当前待审批草案（batch 模式一批多条；全量/指定目录逐条） */
export interface BatchCompileDraft {
    /** 对应目标 id（= raw 相对路径） */
    itemId: string
    /** 主进程生成的草案（不写盘） */
    draft: AiIngestSuccess
    /** 生成后复核出的人工修改冲突（null = 无冲突） */
    conflict: BatchCompileConflict | null
}

/** 进度统计（完成/进行中汇总） */
export interface BatchCompileCounts {
    total: number
    processed: number
    applied: number
    skipped: number
    conflictSkipped: number
    failed: number
    canceled: number
}

/** 队列可读快照（每次状态变化生成新对象，供 Vue 响应式消费） */
export interface BatchCompileQueueSnapshot {
    phase: BatchCompilePhase
    request: NormalizedBatchCompileRequest
    aiConfig: BatchCompileAiConfig | null
    blockedReason: BatchCompileBlockedReason | null
    items: BatchCompileItem[]
    drafts: BatchCompileDraft[]
    activeDraftId: string | null
    counts: BatchCompileCounts
    total: number
    batchSize: number
    batchIndex: number
    batchCount: number
    currentIndex: number
    /** 本次运行模式：incremental = 仅编译新增/变化；all = 重新编译全部 */
    mode: 'incremental' | 'all'
    /** 是否处于「暂停将在当前文件完成后生效」窗口 */
    pausePending: boolean
    /** 是否已请求取消 */
    cancelRequested: boolean
    /** 预处理：增量模式预计跳过数 */
    previewSkipCount: number
    /** 预处理：预计需人工确认的冲突数 */
    previewConflictCount: number
    /** 本次运行是否已确认远程隐私提示 */
    remotePrivacyConfirmed: boolean
    finished: boolean
    canceled: boolean
    /** 运行期可读错误（非逐项失败，如目录树加载失败） */
    error: string | null
    /** 完成页「打开 wiki 首页」目标绝对路径（首个已应用页面；无则首个 wiki 页面） */
    openablePageAbsolutePath: string | null
}

/** 启动选项 */
export interface BatchCompileStartOptions {
    /** incremental = 增量（默认）；all = 重新编译全部 */
    mode: 'incremental' | 'all'
    /** 是否已由用户确认远程隐私提示（远程默认模型时由 UI 置 true） */
    remotePrivacyConfirmed?: boolean
}

/** 队列对外接口 */
export interface BatchCompileQueue {
    /** 读取当前状态快照 */
    getState(): BatchCompileQueueSnapshot
    /** 订阅状态变化（返回取消订阅函数） */
    onChange(listener: (snapshot: BatchCompileQueueSnapshot) => void): () => void
    /** 准备：读取 AI 配置/目录树/wiki 页面索引/编译记录，计算目标与预检统计 */
    prepare(request?: NormalizedBatchCompileRequest): Promise<void>
    /** 开始执行（仅 ready 阶段有效） */
    start(options: BatchCompileStartOptions): Promise<void>
    /** 暂停（当前文件完成后生效；仅 generating 阶段有效） */
    pause(): void
    /** 继续（paused 阶段有效） */
    resume(): void
    /** 取消（停止后续；已应用不回滚、未应用不写盘） */
    cancel(): void
    /** 切换当前审批草案（仅用于 UI 选中态） */
    setActiveDraft(itemId: string): void
    /** 应用当前草案（AI.APPLY_INGEST，approved=true） */
    approveDraft(itemId: string): Promise<void>
    /** 跳过当前草案（不写盘） */
    skipDraft(itemId: string): void
    /** 重试单项失败（仅 finished 阶段、failed 项有效） */
    retryItem(itemId: string): Promise<void>
    /** 重新编译全部（重置后以 all 模式重跑；完成页入口） */
    restartAll(): Promise<void>
    /** 释放：终止等待、解绑监听（组件卸载时调用） */
    dispose(): void
}

/** 内部可等待信号 */
interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
}

/** 创建一次性可等待信号 */
function createDeferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => {}
    const promise = new Promise<T>((res) => {
        resolve = res
    })
    return { promise, resolve }
}

/** 运行中（可取消）阶段判定 */
function isRunningPhase(phase: BatchCompilePhase): boolean {
    return phase === 'generating' || phase === 'paused' || phase === 'approving'
}

/** 拼接工作区绝对路径（尽量使用原生分隔符；READ_HTML/OPEN_SELECT_FILE 需要绝对路径） */
function joinWorkspaceAbsolutePath(rootPath: string, relativePath: string): string {
    const root = rootPath.replace(/[\\/]+$/, '')
    const tail = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
    const separator = root.includes('\\') ? '\\' : '/'
    return `${root}${separator}${tail.split('/').join(separator)}`
}

/** 把未知错误归一化为可读文案（结构化失败已由运行时给可读 message） */
function toReadableError(error: unknown, fallback: string): string {
    if (typeof error === 'string' && error.trim().length > 0) {
        return error
    }
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message
    }
    return fallback
}

/** 统计各状态项数（快照/UI 进度条用） */
function computeCounts(items: readonly BatchCompileItem[]): BatchCompileCounts {
    const counts: BatchCompileCounts = {
        total: items.length,
        processed: 0,
        applied: 0,
        skipped: 0,
        conflictSkipped: 0,
        failed: 0,
        canceled: 0
    }
    for (const item of items) {
        switch (item.status) {
            case 'applied':
                counts.applied += 1
                counts.processed += 1
                break
            case 'skipped':
            case 'skipped-manual':
                counts.skipped += 1
                counts.processed += 1
                break
            case 'conflict-skipped':
                counts.conflictSkipped += 1
                counts.processed += 1
                break
            case 'failed':
                counts.failed += 1
                counts.processed += 1
                break
            case 'canceled':
                counts.canceled += 1
                counts.processed += 1
                break
            default:
                break
        }
    }
    return counts
}

/**
 * 创建批量编译队列（工厂；每个对话框实例一个，随组件卸载 `dispose()`）。
 *
 * @param deps 注入依赖（生产装配见 `batch-compile-runtime.ts`）
 */
export function createBatchCompileQueue(deps: BatchCompileDeps): BatchCompileQueue {
    const now = deps.now ?? (() => Date.now())

    /* ---------- 内部可变状态（快照只读 exports） ---------- */
    let phase: BatchCompilePhase = 'idle'
    let request: NormalizedBatchCompileRequest = createDefaultBatchCompileRequest()
    let aiConfig: BatchCompileAiConfig | null = null
    let blockedReason: BatchCompileBlockedReason | null = null
    let errorText: string | null = null
    let items: BatchCompileItem[] = []
    let drafts: BatchCompileDraft[] = []
    let activeDraftId: string | null = null
    let mode: 'incremental' | 'all' = 'incremental'
    let batchSize = 1
    let batchIndex = 0
    let batchCount = 0
    let currentIndex = -1
    let previewSkipCount = 0
    let previewConflictCount = 0
    let pausePending = false
    let cancelRequested = false
    let remotePrivacyConfirmed = false
    let finished = false
    let canceled = false
    let rootPath = ''
    let wikiIndex: BatchCompileWikiPageIndexEntry[] = []
    let tree: BatchCompileWorkspaceTree | null = null

    /* ---------- 运行时控制信号 ---------- */
    let pauseRequested = false
    let resumeDeferred: Deferred<void> | null = null
    let approvalDeferred: Deferred<void> | null = null
    let approvalPending: Set<string> | null = null
    let disposed = false
    const listeners = new Set<(snapshot: BatchCompileQueueSnapshot) => void>()

    /** 首个已应用页面绝对路径（完成页「打开 wiki 首页」；无可打开页面为 null） */
    function resolveOpenablePageAbsolutePath(): string | null {
        if (rootPath.length === 0) {
            return null
        }
        const applied = items.find((item) => item.status === 'applied' && item.draftPath !== null)
        if (applied && applied.draftPath) {
            return joinWorkspaceAbsolutePath(rootPath, applied.draftPath)
        }
        const firstPage = tree?.wikiPages[0]
        return firstPage ? firstPage.absolutePath : null
    }

    /** 生成只读快照（items/drafts 深拷贝，避免 UI 改动内部状态） */
    function snapshot(): BatchCompileQueueSnapshot {
        return {
            phase,
            request: { ...request },
            aiConfig: aiConfig ? { ...aiConfig } : null,
            blockedReason,
            items: items.map((item) => ({
                ...item,
                conflict: item.conflict ? { ...item.conflict } : null
            })),
            drafts: drafts.map((entry) => ({ ...entry })),
            activeDraftId,
            counts: computeCounts(items),
            total: items.length,
            batchSize,
            batchIndex,
            batchCount,
            currentIndex,
            mode,
            pausePending,
            cancelRequested,
            previewSkipCount,
            previewConflictCount,
            remotePrivacyConfirmed,
            finished,
            canceled,
            error: errorText,
            openablePageAbsolutePath: resolveOpenablePageAbsolutePath()
        }
    }

    /** 广播状态（dispose 后不再广播；监听器异常不影响队列） */
    function emit(): void {
        if (disposed) {
            return
        }
        const value = snapshot()
        for (const listener of listeners) {
            try {
                listener(value)
            } catch (listenerError) {
                logger.warn('[批量编译] 状态监听器执行异常：', listenerError)
            }
        }
    }

    /** 查找目标项（不存在返回 null） */
    function findItem(itemId: string): BatchCompileItem | null {
        return items.find((item) => item.id === itemId) ?? null
    }

    /** 读取目标项的草案条目 */
    function findDraft(itemId: string): BatchCompileDraft | null {
        return drafts.find((entry) => entry.itemId === itemId) ?? null
    }

    /* ---------------------------------------------------------------------
     * 阶段 1：prepare（配置 → 目录树 → wiki 页面索引 → 目标/预检）
     * ------------------------------------------------------------------- */

    /** 并发读取 wiki 页面内容（上限 4 并发，避免数百个 IPC 同时打满主进程） */
    async function readWikiPageContents(
        pages: readonly BatchCompileWikiPage[]
    ): Promise<{ page: BatchCompileWikiPage; content: string | null }[]> {
        const results: { page: BatchCompileWikiPage; content: string | null }[] = new Array(
            pages.length
        )
        let cursor = 0
        const workerCount = Math.min(4, pages.length)
        const workers = Array.from({ length: workerCount }, async () => {
            for (;;) {
                const index = cursor
                cursor += 1
                if (index >= pages.length) {
                    return
                }
                const page = pages[index]
                let content: string | null
                try {
                    content = await deps.readText(page.absolutePath)
                } catch (readError) {
                    logger.warn('[批量编译] 读取 wiki 页面失败（按不可判定处理）：', readError)
                    content = null
                }
                results[index] = { page, content }
            }
        })
        await Promise.all(workers)
        return results
    }

    /** 预检：按 raw 来源匹配既有 wiki 页面并判定增量/冲突 */
    function buildItems(rawFiles: readonly BatchCompileRawFile[]): BatchCompileItem[] {
        return rawFiles.map((file) => {
            const page = findBatchCompileWikiPageBySource(wikiIndex, file.relativePath)
            const record = page === null ? null : deps.records.get(rootPath, page.relativePath)
            const pageState = classifyBatchCompilePageState({
                page,
                record,
                sourcePath: file.relativePath
            })
            const conflictReason = toBatchCompileConflictReason(pageState)
            return {
                id: file.relativePath,
                rawRelativePath: file.relativePath,
                rawAbsolutePath: file.absolutePath,
                pageState,
                conflict:
                    conflictReason === null
                        ? null
                        : { reason: conflictReason, targetPath: page?.relativePath ?? '' },
                incrementalSkip: shouldSkipBatchCompileTarget(pageState, 'incremental'),
                status: 'pending',
                draftPath: page ? page.relativePath : null,
                model: null,
                error: null,
                appliedAt: null
            }
        })
    }

    async function prepare(prepareRequest?: NormalizedBatchCompileRequest): Promise<void> {
        if (disposed) {
            return
        }
        request = prepareRequest ? { ...prepareRequest } : request
        phase = 'preparing'
        blockedReason = null
        errorText = null
        aiConfig = null
        items = []
        drafts = []
        activeDraftId = null
        tree = null
        wikiIndex = []
        rootPath = ''
        previewSkipCount = 0
        previewConflictCount = 0
        currentIndex = -1
        batchIndex = 0
        batchCount = 0
        finished = false
        canceled = false
        cancelRequested = false
        pauseRequested = false
        pausePending = false
        emit()

        /* 1) AI 配置：未配置直接阻止启动并引导配置 */
        let config: BatchCompileAiConfig
        try {
            config = await deps.readAiConfig()
        } catch (configError) {
            logger.warn('[批量编译] 读取 AI 配置异常，按未配置处理：', configError)
            config = {
                configured: false,
                readFailed: true,
                defaultModelId: null,
                defaultModelName: null,
                defaultModelRemote: false,
                hasLocalModel: false
            }
        }
        if (disposed) {
            return
        }
        aiConfig = config
        if (!config.configured) {
            blockedReason = {
                code: config.readFailed ? 'config-read-failed' : 'not-configured'
            }
            phase = 'blocked'
            emit()
            return
        }

        /* 2) 目录树：复用既有 FILE_MANAGER 事件（不新增 IPC） */
        let treeOutcome: BatchCompileTreeOutcome
        try {
            treeOutcome = await deps.loadWorkspaceTree()
        } catch (treeError) {
            treeOutcome = {
                ok: false,
                error: toReadableError(treeError, 'unknown')
            }
        }
        if (disposed) {
            return
        }
        if (!treeOutcome.ok) {
            blockedReason = { code: 'load-failed', detail: treeOutcome.error }
            phase = 'blocked'
            emit()
            return
        }
        tree = treeOutcome.tree
        rootPath = tree.rootPath
        if (tree.rawRootPath === null) {
            blockedReason = { code: 'workspace-unavailable' }
            phase = 'blocked'
            emit()
            return
        }

        /* 3) wiki 既有页面内容 → 索引（source/内容哈希；人工修改保护与增量判定基础） */
        const wikiContents = await readWikiPageContents(tree.wikiPages)
        if (disposed) {
            return
        }
        wikiIndex = buildBatchCompileWikiPageIndex(wikiContents)

        /* 4) 目标过滤 + 预检统计 */
        const targets = resolveBatchCompileTargets(tree.rawFiles, request)
        if (targets.length === 0) {
            blockedReason = { code: 'no-files' }
            phase = 'blocked'
            emit()
            return
        }
        batchSize = request.scope === 'batch' ? request.batchSize : 1
        batchCount = Math.ceil(targets.length / batchSize)
        items = buildItems(targets)
        previewSkipCount = items.filter((item) => item.incrementalSkip).length
        previewConflictCount = items.filter((item) => item.conflict !== null).length
        phase = 'ready'
        emit()
    }

    /* ---------------------------------------------------------------------
     * 阶段 2：执行（批次生成 → 集中/逐个审批）
     * ------------------------------------------------------------------- */

    /** 等待暂停解除（cancel/dispose 时也 resolve，由调用方检查标志决定是否继续） */
    async function waitPause(): Promise<void> {
        if (!pauseRequested || disposed || cancelRequested) {
            return
        }
        pauseRequested = false
        phase = 'paused'
        pausePending = false
        resumeDeferred = createDeferred<void>()
        emit()
        await resumeDeferred.promise
        resumeDeferred = null
        if (disposed) {
            return
        }
        pausePending = false
        if (!cancelRequested) {
            phase = 'generating'
        }
        emit()
    }

    /**
     * 生成后复核人工修改冲突（权威 draftPath + 重新读取当前页面）：
     * - `isUpdate=false` → 无既有页面，无冲突；
     * - 页面读取失败 → unverified（不可安全覆盖，冲突）；
     * - 有记录且哈希/来源一致 → 无冲突；否则按冲突处理。
     */
    async function detectDraftConflict(
        draft: AiIngestSuccess,
        sourcePath: string
    ): Promise<BatchCompileConflict | null> {
        if (draft.isUpdate !== true) {
            return null
        }
        const targetPath = normalizeBatchCompileSourcePath(draft.draftPath)
        if (targetPath === null) {
            return { reason: 'unverified', targetPath: draft.draftPath }
        }
        const absolutePath = joinWorkspaceAbsolutePath(rootPath, targetPath)
        let content: string | null
        try {
            content = await deps.readText(absolutePath)
        } catch (readError) {
            logger.warn('[批量编译] 读取目标 wiki 页面失败（按不可判定处理）：', readError)
            content = null
        }
        const page: BatchCompileWikiPageIndexEntry = {
            relativePath: targetPath,
            absolutePath,
            source: content === null ? null : readBatchCompilePageSource(content),
            contentHash: content === null ? null : hashBatchCompileContent(content),
            unreadable: content === null
        }
        const record = deps.records.get(rootPath, targetPath)
        const pageState = classifyBatchCompilePageState({ page, record, sourcePath })
        const conflictReason = toBatchCompileConflictReason(pageState)
        if (conflictReason === null) {
            return null
        }
        return { reason: conflictReason, targetPath }
    }

    /** 一个批次的生成 + 审批（全量/指定目录范围 batchSize=1 → 逐文件审批） */
    async function runChunks(chunks: BatchCompileItem[][]): Promise<void> {
        phase = 'generating'
        batchCount = chunks.length
        for (let index = 0; index < chunks.length; index += 1) {
            if (disposed || cancelRequested) {
                break
            }
            batchIndex = index
            const chunkDrafts: BatchCompileDraft[] = []
            drafts = []
            activeDraftId = null
            emit()
            for (const item of chunks[index]) {
                if (disposed || cancelRequested) {
                    break
                }
                await waitPause()
                if (disposed || cancelRequested) {
                    break
                }
                item.status = 'generating'
                currentIndex = items.indexOf(item)
                emit()
                let outcome: BatchCompileIngestOutcome
                try {
                    outcome = await deps.ingest(item.rawRelativePath)
                } catch (ingestError) {
                    outcome = { ok: false, error: toReadableError(ingestError, 'unknown') }
                }
                if (disposed) {
                    return
                }
                if (cancelRequested) {
                    item.status = 'canceled'
                    emit()
                    break
                }
                if (!outcome.ok) {
                    item.status = 'failed'
                    item.error = outcome.error
                    logger.warn(
                        '[批量编译] 生成失败（继续后续文件）：',
                        item.rawRelativePath,
                        outcome.error
                    )
                    emit()
                    continue
                }
                const conflict = await detectDraftConflict(outcome.draft, item.rawRelativePath)
                if (disposed) {
                    return
                }
                if (cancelRequested) {
                    item.status = 'canceled'
                    emit()
                    break
                }
                item.draftPath = outcome.draft.draftPath
                item.model = outcome.draft.model ?? null
                item.conflict = conflict
                item.status = 'waiting'
                chunkDrafts.push({ itemId: item.id, draft: outcome.draft, conflict })
                emit()
            }
            if (disposed) {
                return
            }
            if (cancelRequested) {
                markPendingApprovalCanceled(chunkDrafts)
                break
            }
            if (chunkDrafts.length > 0) {
                drafts = chunkDrafts
                activeDraftId = chunkDrafts[0].itemId
                phase = 'approving'
                currentIndex = -1
                emit()
                await waitForApproval(chunkDrafts)
                // 离开审批阶段先回到 generating 再清空草案：避免 UI 观察到
                // 「approving + 空草案列表」的中间态（下一批生成前）。
                phase = 'generating'
                drafts = []
                activeDraftId = null
                currentIndex = -1
                emit()
            }
        }
        finishRun(cancelRequested)
    }

    /** 等待当前批次草案全部处理（应用/跳过/冲突跳过/取消） */
    async function waitForApproval(chunkDrafts: readonly BatchCompileDraft[]): Promise<void> {
        approvalPending = new Set(chunkDrafts.map((entry) => entry.itemId))
        approvalDeferred = createDeferred<void>()
        await approvalDeferred.promise
        approvalDeferred = null
        approvalPending = null
    }

    /** 取消时把审批中的草案对应目标标记为 canceled（未应用一律不写盘） */
    function markPendingApprovalCanceled(chunkDrafts: readonly BatchCompileDraft[]): void {
        for (const entry of chunkDrafts) {
            const item = findItem(entry.itemId)
            if (item && (item.status === 'waiting' || item.status === 'generating')) {
                item.status = 'canceled'
            }
        }
        drafts = []
        activeDraftId = null
    }

    /** 结束一次运行（保留已应用/失败结果，未处理项按取消标记） */
    function finishRun(wasCanceled: boolean): void {
        if (disposed) {
            return
        }
        phase = 'finished'
        finished = true
        canceled = wasCanceled
        pauseRequested = false
        pausePending = false
        currentIndex = -1
        drafts = []
        activeDraftId = null
        for (const item of items) {
            if (
                item.status === 'pending' ||
                item.status === 'generating' ||
                item.status === 'waiting' ||
                item.status === 'applying'
            ) {
                item.status = 'canceled'
            }
        }
        approvalDeferred?.resolve()
        approvalDeferred = null
        approvalPending = null
        logger.info(
            `[批量编译] 运行结束：total=${items.length} applied=${computeCounts(items).applied} ` +
                `skipped=${computeCounts(items).skipped} conflictSkipped=${computeCounts(items).conflictSkipped} ` +
                `failed=${computeCounts(items).failed} canceled=${wasCanceled}`
        )
        emit()
    }

    /** 目标项完成后从待审批集合移除；全部处理完解除等待 */
    function settleApproval(itemId: string): void {
        if (approvalPending !== null) {
            approvalPending.delete(itemId)
        }
        const next = drafts.find((entry) => {
            const item = findItem(entry.itemId)
            return item !== null && item.status === 'waiting'
        })
        activeDraftId = next ? next.itemId : drafts.length > 0 ? drafts[0].itemId : null
        if (approvalPending !== null && approvalPending.size === 0 && approvalDeferred !== null) {
            approvalDeferred.resolve()
        }
    }

    /** 写盘并记录编译记录（应用成功才算「AI 生成并应用成功」） */
    async function applyDraftEntry(entry: BatchCompileDraft): Promise<void> {
        const item = findItem(entry.itemId)
        if (!item || item.status !== 'waiting') {
            return
        }
        item.status = 'applying'
        emit()
        let outcome: BatchCompileApplyOutcome
        try {
            outcome = await deps.apply({
                draftPath: entry.draft.draftPath,
                content: entry.draft.content
            })
        } catch (applyError) {
            outcome = { ok: false, error: toReadableError(applyError, 'unknown') }
        }
        if (disposed) {
            return
        }
        if (outcome.ok) {
            item.status = 'applied'
            item.draftPath = entry.draft.draftPath
            item.appliedAt = now()
            const record: BatchCompileCompileRecord = {
                targetPath: entry.draft.draftPath,
                sourcePath: entry.draft.sourcePath,
                contentHash: hashBatchCompileContent(entry.draft.content),
                updatedAt: now()
            }
            deps.records.set(rootPath, record)
        } else {
            item.status = 'failed'
            item.error = outcome.error
            logger.warn('[批量编译] 写入 wiki 失败：', entry.draft.draftPath, outcome.error)
        }
        // 先结算审批游标（切到下一个待审批草案）再广播，避免 UI 停留在已完成的草案上
        settleApproval(entry.itemId)
        emit()
    }

    async function start(options: BatchCompileStartOptions): Promise<void> {
        if (disposed || phase !== 'ready') {
            return
        }
        mode = options.mode
        remotePrivacyConfirmed = options.remotePrivacyConfirmed === true
        cancelRequested = false
        pauseRequested = false
        finished = false
        canceled = false
        blockedReason = null
        errorText = null
        for (const item of items) {
            if (item.status === 'pending' && shouldSkipBatchCompileTarget(item.pageState, mode)) {
                item.status = 'skipped'
            }
        }
        const remaining = items.filter((item) => item.status === 'pending')
        const efficientBatchSize = request.scope === 'batch' ? batchSize : 1
        const chunks = chunkBatchCompileItems(remaining, efficientBatchSize)
        emit()
        if (chunks.length === 0) {
            finishRun(false)
            return
        }
        await runChunks(chunks)
    }

    /** 目标项分批（与纯逻辑 chunkBatchCompileTargets 同口径，但输入为运行时 item） */
    function chunkBatchCompileItems(
        targetItems: readonly BatchCompileItem[],
        size: number
    ): BatchCompileItem[][] {
        const chunkSize = Number.isInteger(size) && size > 0 ? size : 1
        const chunks: BatchCompileItem[][] = []
        for (let index = 0; index < targetItems.length; index += chunkSize) {
            chunks.push(targetItems.slice(index, index + chunkSize))
        }
        return chunks
    }

    /* ---------------------------------------------------------------------
     * 阶段 3：单项重试 / 重新编译全部
     * ------------------------------------------------------------------- */

    async function retryItem(itemId: string): Promise<void> {
        if (disposed || phase !== 'finished') {
            return
        }
        const item = findItem(itemId)
        if (!item || item.status !== 'failed') {
            return
        }
        const retryItems: BatchCompileItem[] = [item]
        item.status = 'pending'
        item.error = null
        item.conflict = null
        item.draftPath = null
        item.model = null
        item.appliedAt = null
        cancelRequested = false
        finished = false
        canceled = false
        emit()
        await runChunks([retryItems])
    }

    async function restartAll(): Promise<void> {
        if (disposed || isRunningPhase(phase)) {
            return
        }
        const preservedAck = remotePrivacyConfirmed
        await prepare(request)
        if (phase !== 'ready') {
            return
        }
        await start({ mode: 'all', remotePrivacyConfirmed: preservedAck })
    }

    return {
        getState: snapshot,
        onChange(listener) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        prepare,
        start,
        pause() {
            if (disposed || phase !== 'generating') {
                return
            }
            pauseRequested = true
            pausePending = true
            emit()
        },
        resume() {
            if (disposed || phase !== 'paused' || resumeDeferred === null) {
                return
            }
            pausePending = false
            resumeDeferred.resolve()
        },
        cancel() {
            if (disposed || !isRunningPhase(phase) || cancelRequested) {
                return
            }
            cancelRequested = true
            pauseRequested = false
            pausePending = false
            if (resumeDeferred !== null) {
                resumeDeferred.resolve()
            }
            if (phase === 'approving' && drafts.length > 0) {
                markPendingApprovalCanceled(drafts)
                if (approvalDeferred !== null) {
                    approvalDeferred.resolve()
                }
            }
            emit()
        },
        setActiveDraft(itemId) {
            if (disposed || phase !== 'approving') {
                return
            }
            if (findDraft(itemId) === null) {
                return
            }
            activeDraftId = itemId
            emit()
        },
        approveDraft: async (itemId: string) => {
            const entry = findDraft(itemId)
            if (entry === null) {
                return
            }
            await applyDraftEntry(entry)
        },
        skipDraft(itemId) {
            if (disposed) {
                return
            }
            const item = findItem(itemId)
            if (!item || item.status !== 'waiting') {
                return
            }
            item.status = item.conflict !== null ? 'conflict-skipped' : 'skipped-manual'
            settleApproval(itemId)
            emit()
        },
        retryItem,
        restartAll,
        dispose() {
            if (disposed) {
                return
            }
            disposed = true
            cancelRequested = true
            pauseRequested = false
            resumeDeferred?.resolve()
            approvalDeferred?.resolve()
            resumeDeferred = null
            approvalDeferred = null
            approvalPending = null
            listeners.clear()
        }
    }
}

/** 队列 + 归一化请求（宿主/对话框装配用；request 来自 EventBus 载荷的宽容归一化） */
export function createBatchCompileQueueWithRequest(
    deps: BatchCompileDeps,
    payload: unknown
): { queue: BatchCompileQueue; request: NormalizedBatchCompileRequest } {
    return {
        queue: createBatchCompileQueue(deps),
        request: normalizeBatchCompileRequest(payload)
    }
}
