/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译队列控制器单测
 * （`components/llm-wiki/batch-compile-queue.ts`，注入依赖替身，不触达 IPC/DOM）
 *
 * 覆盖：
 * 1. 准备阶段：未配置阻止（含配置读取失败）/ 目录树失败 / raw 缺失 / 无文件；
 * 2. 准备预检：增量跳过数量、冲突数量、分批数量、指定目录范围；
 * 3. 执行：逐文件审批（全量/指定目录）、每批集中审批（batch）、应用写盘 + 编译记录、
 *    跳过/冲突跳过/覆盖；
 * 4. 人工修改保护：无记录（manual-create）/ 哈希不一致（manual-edit）/ 来源不一致
 *    （source-mismatch）/ 读取失败（unverified）；
 * 5. 队列控制：暂停（当前文件完成后停）/ 继续 / 取消（已应用不回滚、未应用不写盘）/
 *    单项失败继续 / 失败重试 / 重新编译全部；
 * 6. 订阅与释放：onChange 快照、dispose 后停止广播。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiIngestSuccess } from '../../../src/shared/types/ai'
import {
    buildBatchCompileWikiPageIndex,
    hashBatchCompileContent,
    normalizeBatchCompileRequest,
    type BatchCompileCompileRecord,
    type BatchCompileRecordStore,
    type BatchCompileWorkspaceTree
} from '../../../src/renderer/src/common/batch-compile'
import {
    createBatchCompileQueue,
    type BatchCompileAiConfig,
    type BatchCompileApplyOutcome,
    type BatchCompileDeps,
    type BatchCompileIngestOutcome,
    type BatchCompileQueue,
    type BatchCompileQueueSnapshot
} from '../../../src/renderer/src/components/llm-wiki/batch-compile-queue'

const { loggerMock } = vi.hoisted(() => ({
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('@renderer/common/logger', () => ({ logger: loggerMock }))

/* ============================================================================
 * 测试工具
 * ========================================================================== */

/** 默认已配置 AI 摘要（本地模型） */
function configuredAi(overrides: Partial<BatchCompileAiConfig> = {}): BatchCompileAiConfig {
    return {
        configured: true,
        readFailed: false,
        defaultModelId: 'model-1',
        defaultModelName: '本地 Qwen',
        defaultModelRemote: false,
        hasLocalModel: true,
        ...overrides
    }
}

/** 构造工作区目录树（默认 raw/a.md、raw/b.md 两个目标） */
function makeTree(overrides: Partial<BatchCompileWorkspaceTree> = {}): BatchCompileWorkspaceTree {
    return {
        rootPath: 'E:/ws',
        rawRootPath: 'E:/ws/raw',
        wikiRootPath: 'E:/ws/wiki',
        rawFiles: [
            { relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' },
            { relativePath: 'raw/b.md', absolutePath: 'E:/ws/raw/b.md', name: 'b.md' }
        ],
        wikiPages: [],
        ...overrides
    }
}

/** 构造成功草案（默认新建页面） */
function makeDraft(rawPath: string, overrides: Partial<AiIngestSuccess> = {}): AiIngestSuccess {
    const baseName = (rawPath.split('/').pop() ?? rawPath).replace(/\.(md|markdown|txt)$/i, '')
    return {
        ok: true,
        draftPath: `wiki/${baseName}.md`,
        content: `---\nsource: ${rawPath}\n---\n\n# ${baseName}\n`,
        sourcePath: rawPath,
        diff: [{ type: 'add', content: 'x', newLine: 1 }],
        isUpdate: false,
        diffTruncated: false,
        model: 'fake-model',
        ...overrides
    }
}

/** 构造页面 Markdown（front matter source） */
function pageContent(source: string): string {
    return `---\nsource: ${source}\n---\n\n# 页面\n`
}

interface FakeDepsOptions {
    ai?: BatchCompileAiConfig
    aiError?: boolean
    tree?: BatchCompileWorkspaceTree
    treeError?: string
    /** 绝对路径 → 页面内容；未命中返回 undefined（读取按失败/不存在处理） */
    pageContents?: Record<string, string>
    /** 可自定义读文件行为（覆盖 pageContents） */
    readText?: (absolutePath: string) => Promise<string | null>
    /** 初始编译记录 */
    records?: BatchCompileCompileRecord[]
    ingest?: (rawPath: string) => Promise<BatchCompileIngestOutcome>
    apply?: (request: { draftPath: string; content: string }) => Promise<BatchCompileApplyOutcome>
}

interface FakeDeps {
    deps: BatchCompileDeps
    recordsMap: Map<string, BatchCompileCompileRecord>
    ingestCalls: string[]
    applyCalls: Array<{ draftPath: string; content: string }>
}

/** 创建依赖替身（默认全部成功） */
function createFakeDeps(options: FakeDepsOptions = {}): FakeDeps {
    const recordsMap = new Map<string, BatchCompileCompileRecord>()
    for (const record of options.records ?? []) {
        recordsMap.set(record.targetPath, record)
    }
    const records: BatchCompileRecordStore = {
        get: (rootPath, targetPath) => {
            void rootPath
            return recordsMap.get(targetPath) ?? null
        },
        set: (rootPath, record) => {
            void rootPath
            recordsMap.set(record.targetPath, record)
        },
        remove: (rootPath, targetPath) => {
            void rootPath
            recordsMap.delete(targetPath)
        },
        getAll: (rootPath) => {
            void rootPath
            return [...recordsMap.values()]
        }
    }
    const ingestCalls: string[] = []
    const applyCalls: Array<{ draftPath: string; content: string }> = []
    const ingest =
        options.ingest ??
        ((rawPath: string): Promise<BatchCompileIngestOutcome> =>
            Promise.resolve({ ok: true, draft: makeDraft(rawPath) }))
    const apply =
        options.apply ??
        ((request: { draftPath: string; content: string }): Promise<BatchCompileApplyOutcome> =>
            Promise.resolve({ ok: true, path: request.draftPath }))
    const deps: BatchCompileDeps = {
        now: () => 1_700_000_000_000,
        readAiConfig: () => {
            if (options.aiError === true) {
                return Promise.reject(new Error('配置读取失败'))
            }
            return Promise.resolve(options.ai ?? configuredAi())
        },
        loadWorkspaceTree: () => {
            if (options.treeError !== undefined) {
                return Promise.resolve({ ok: false, error: options.treeError })
            }
            return Promise.resolve({ ok: true, tree: options.tree ?? makeTree() })
        },
        readText: (absolutePath) => {
            if (options.readText) {
                return options.readText(absolutePath)
            }
            // 未登记的页面按读取失败/不存在处理（null）
            const content = options.pageContents?.[absolutePath]
            return Promise.resolve(content ?? null)
        },
        ingest: (rawPath) => {
            ingestCalls.push(rawPath)
            return ingest(rawPath)
        },
        apply: (request) => {
            applyCalls.push({ ...request })
            return apply(request)
        },
        records
    }
    return { deps, recordsMap, ingestCalls, applyCalls }
}

/** 等待队列进入指定阶段（微任务 + 短轮询） */
async function waitPhase(
    queue: BatchCompileQueue,
    phase: string
): Promise<BatchCompileQueueSnapshot> {
    await vi.waitFor(() => {
        expect(queue.getState().phase, `等待阶段 ${phase}`).toBe(phase)
    })
    return queue.getState()
}

/** 等待「审批阶段且存在待审批草案」（避免上一批收尾的瞬时状态被误判） */
async function waitForPendingApproval(
    queue: BatchCompileQueue
): Promise<BatchCompileQueueSnapshot> {
    await vi.waitFor(() => {
        const snapshot = queue.getState()
        const hasWaiting = snapshot.drafts.some(
            (entry) => snapshot.items.find((item) => item.id === entry.itemId)?.status === 'waiting'
        )
        if (snapshot.phase !== 'approving' || !hasWaiting) {
            throw new Error('当前没有待审批草案')
        }
    })
    return queue.getState()
}

/** 审批当前批次全部待审批草案（逐项应用） */
async function approveCurrentBatch(queue: BatchCompileQueue): Promise<void> {
    const snapshot = await waitForPendingApproval(queue)
    for (const entry of snapshot.drafts) {
        const item = queue.getState().items.find((candidate) => candidate.id === entry.itemId)
        if (item?.status === 'waiting') {
            await queue.approveDraft(entry.itemId)
        }
    }
}

let queue: BatchCompileQueue | null = null

beforeEach(() => {
    queue = null
    loggerMock.info.mockClear()
    loggerMock.warn.mockClear()
    loggerMock.error.mockClear()
})

afterEach(() => {
    queue?.dispose()
    queue = null
})

/* ============================================================================
 * 一、准备阶段
 * ========================================================================== */

describe('prepare：启动前检查与预检统计', () => {
    it('AI 未配置 → blocked / not-configured，且不调用目录树', async () => {
        const fake = createFakeDeps({ ai: configuredAi({ configured: false }) })
        const loadTree = vi.fn(fake.deps.loadWorkspaceTree)
        fake.deps.loadWorkspaceTree = loadTree
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const state = queue.getState()
        expect(state.phase).toBe('blocked')
        expect(state.blockedReason).toEqual({ code: 'not-configured' })
        expect(loadTree).not.toHaveBeenCalled()
    })

    it('AI 配置读取异常 → blocked / config-read-failed', async () => {
        const fake = createFakeDeps({ aiError: true })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'config-read-failed' })
    })

    it('目录树加载失败 / raw 未初始化 / 无目标文件 → 对应阻止原因', async () => {
        const loadFail = createFakeDeps({ treeError: 'tree down' })
        queue = createBatchCompileQueue(loadFail.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'load-failed', detail: 'tree down' })
        queue.dispose()

        const noRaw = createFakeDeps({ tree: makeTree({ rawRootPath: null, rawFiles: [] }) })
        queue = createBatchCompileQueue(noRaw.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'workspace-unavailable' })
        queue.dispose()

        const noFiles = createFakeDeps({ tree: makeTree({ rawFiles: [] }) })
        queue = createBatchCompileQueue(noFiles.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'no-files' })
        queue.dispose()

        // 目录范围过滤后为空同样按无文件阻止
        const directoryMiss = createFakeDeps({})
        queue = createBatchCompileQueue(directoryMiss.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'directory', directory: 'nope' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'no-files' })
    })

    it('目录树加载抛异常 → blocked / load-failed（异常归一化）', async () => {
        const fake = createFakeDeps({})
        fake.deps.loadWorkspaceTree = () => Promise.reject(new Error('boom'))
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'load-failed', detail: 'boom' })
    })

    it('读取 AI 配置抛异常 → 按未配置处理（readFailed）', async () => {
        const fake = createFakeDeps({})
        fake.deps.readAiConfig = () => Promise.reject(new Error('config boom'))
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().blockedReason).toEqual({ code: 'config-read-failed' })
    })

    it('准备成功：目标数量/批次/远程模型标记/默认增量预检', async () => {
        const fake = createFakeDeps({ ai: configuredAi({ defaultModelRemote: true }) })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 1 }))
        const state = queue.getState()
        expect(state.phase).toBe('ready')
        expect(state.total).toBe(2)
        expect(state.batchSize).toBe(1)
        expect(state.batchCount).toBe(2)
        expect(state.aiConfig?.defaultModelRemote).toBe(true)
        expect(state.previewSkipCount).toBe(0)
        expect(state.previewConflictCount).toBe(0)
        expect(state.items.map((item) => item.status)).toEqual(['pending', 'pending'])
    })

    it('增量预检：有记录且页面未修改 → 预计跳过；无记录页面 → 预计冲突', async () => {
        const contentA = pageContent('raw/a.md')
        const contentB = pageContent('raw/b.md')
        const tree = makeTree({
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' },
                { relativePath: 'wiki/b.md', absolutePath: 'E:/ws/wiki/b.md', name: 'b.md' }
            ]
        })
        const fake = createFakeDeps({
            tree,
            pageContents: { 'E:/ws/wiki/a.md': contentA, 'E:/ws/wiki/b.md': contentB },
            records: [
                {
                    targetPath: 'wiki/a.md',
                    sourcePath: 'raw/a.md',
                    contentHash: hashBatchCompileContent(contentA),
                    updatedAt: 1
                }
            ]
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const state = queue.getState()
        expect(state.previewSkipCount).toBe(1)
        expect(state.previewConflictCount).toBe(1)
        const itemA = state.items.find((item) => item.id === 'raw/a.md')
        const itemB = state.items.find((item) => item.id === 'raw/b.md')
        expect(itemA?.incrementalSkip).toBe(true)
        expect(itemA?.pageState).toBe('verified')
        expect(itemB?.incrementalSkip).toBe(false)
        expect(itemB?.conflict?.reason).toBe('manual-create')
    })

    it('指定目录只包含该目录下的文件', async () => {
        const tree = makeTree({
            rawFiles: [
                {
                    relativePath: 'raw/notes/a.md',
                    absolutePath: 'E:/ws/raw/notes/a.md',
                    name: 'a.md'
                },
                { relativePath: 'raw/b.md', absolutePath: 'E:/ws/raw/b.md', name: 'b.md' }
            ]
        })
        const fake = createFakeDeps({ tree })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(
            normalizeBatchCompileRequest({ scope: 'directory', directory: 'notes' })
        )
        expect(queue.getState().items.map((item) => item.id)).toEqual(['raw/notes/a.md'])
    })
})

/* ============================================================================
 * 二、执行与审批
 * ========================================================================== */

describe('start：执行与逐项审批（全量/指定目录）', () => {
    it('逐文件生成 → 审批 → 应用成功写盘并记录编译记录', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })

        await approveCurrentBatch(queue)
        await approveCurrentBatch(queue)
        await startPromise

        const state = queue.getState()
        expect(state.phase).toBe('finished')
        expect(state.counts).toMatchObject({ total: 2, applied: 2, failed: 0, processed: 2 })
        expect(fake.ingestCalls).toEqual(['raw/a.md', 'raw/b.md'])
        expect(fake.applyCalls.map((call) => call.draftPath)).toEqual(['wiki/a.md', 'wiki/b.md'])
        expect(fake.recordsMap.get('wiki/a.md')).toMatchObject({
            sourcePath: 'raw/a.md',
            contentHash: hashBatchCompileContent(makeDraft('raw/a.md').content)
        })
        // 完成页可打开首个已应用页面
        expect(state.openablePageAbsolutePath).toBe('E:/ws/wiki/a.md')
    })

    it('审批中跳过 → 不写盘、不记录；完成后统计跳过', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        const snapshot = await waitForPendingApproval(queue)
        queue.skipDraft(snapshot.activeDraftId as string)
        await approveCurrentBatch(queue)
        await startPromise

        const state = queue.getState()
        expect(state.counts.skipped).toBe(1)
        expect(state.counts.applied).toBe(1)
        expect(fake.applyCalls).toHaveLength(1)
        expect(fake.recordsMap.has('wiki/a.md')).toBe(false)
    })

    it('AI 生成失败不中断队列：失败项记录错误，后续继续并可在完成页重试', async () => {
        let failFirst = true
        const fake = createFakeDeps({
            ingest: (rawPath) => {
                if (rawPath === 'raw/a.md' && failFirst) {
                    return Promise.resolve({ ok: false, error: '超时' })
                }
                return Promise.resolve({ ok: true, draft: makeDraft(rawPath) })
            }
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await approveCurrentBatch(queue) // b 通过
        await startPromise

        let state = queue.getState()
        expect(state.counts.failed).toBe(1)
        expect(state.counts.applied).toBe(1)
        expect(state.items.find((item) => item.id === 'raw/a.md')?.error).toBe('超时')

        // 单项重试成功
        failFirst = false
        const retryPromise = queue.retryItem('raw/a.md')
        await approveCurrentBatch(queue)
        await retryPromise
        state = queue.getState()
        expect(state.phase).toBe('finished')
        expect(state.counts.failed).toBe(0)
        expect(state.counts.applied).toBe(2)
    })

    it('写盘失败 → 目标项 failed（可重试），不写编译记录', async () => {
        const fake = createFakeDeps({
            apply: () => Promise.resolve({ ok: false, error: '磁盘只读' })
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await approveCurrentBatch(queue)
        await approveCurrentBatch(queue)
        await startPromise
        const state = queue.getState()
        expect(state.counts.failed).toBe(2)
        expect(state.items[0].error).toBe('磁盘只读')
        expect(fake.recordsMap.size).toBe(0)
    })

    it('写盘抛异常 → 归一化为可读错误（不崩溃）', async () => {
        const fake = createFakeDeps({
            apply: () => Promise.reject(new Error('IPC 断开'))
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await approveCurrentBatch(queue)
        await approveCurrentBatch(queue)
        await startPromise
        expect(queue.getState().items[0].error).toBe('IPC 断开')
    })

    it('增量模式：已验证页面直接跳过（不调用 AI），其余继续编译', async () => {
        const contentA = pageContent('raw/a.md')
        const tree = makeTree({
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        const fake = createFakeDeps({
            tree,
            pageContents: { 'E:/ws/wiki/a.md': contentA },
            records: [
                {
                    targetPath: 'wiki/a.md',
                    sourcePath: 'raw/a.md',
                    contentHash: hashBatchCompileContent(contentA),
                    updatedAt: 1
                }
            ]
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'incremental' })
        await approveCurrentBatch(queue)
        await startPromise

        const state = queue.getState()
        expect(fake.ingestCalls).toEqual(['raw/b.md'])
        expect(state.items.find((item) => item.id === 'raw/a.md')?.status).toBe('skipped')
        expect(state.counts).toMatchObject({ applied: 1, skipped: 1 })
    })

    it('增量模式全部跳过 → 直接完成（不发起 AI 调用）', async () => {
        const contentA = pageContent('raw/a.md')
        const contentB = pageContent('raw/b.md')
        const tree = makeTree({
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' },
                { relativePath: 'wiki/b.md', absolutePath: 'E:/ws/wiki/b.md', name: 'b.md' }
            ]
        })
        const fake = createFakeDeps({
            tree,
            pageContents: { 'E:/ws/wiki/a.md': contentA, 'E:/ws/wiki/b.md': contentB },
            records: [
                {
                    targetPath: 'wiki/a.md',
                    sourcePath: 'raw/a.md',
                    contentHash: hashBatchCompileContent(contentA),
                    updatedAt: 1
                },
                {
                    targetPath: 'wiki/b.md',
                    sourcePath: 'raw/b.md',
                    contentHash: hashBatchCompileContent(contentB),
                    updatedAt: 1
                }
            ]
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        await queue.start({ mode: 'incremental' })
        expect(fake.ingestCalls).toEqual([])
        expect(queue.getState().phase).toBe('finished')
        expect(queue.getState().counts.skipped).toBe(2)
    })

    it('重新编译全部模式：即使已验证页面也不会跳过', async () => {
        const contentA = pageContent('raw/a.md')
        const tree = makeTree({
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        const fake = createFakeDeps({
            tree,
            pageContents: { 'E:/ws/wiki/a.md': contentA },
            records: [
                {
                    targetPath: 'wiki/a.md',
                    sourcePath: 'raw/a.md',
                    contentHash: hashBatchCompileContent(contentA),
                    updatedAt: 1
                }
            ],
            ingest: (rawPath) =>
                Promise.resolve({
                    ok: true,
                    draft: makeDraft(rawPath, {
                        draftPath: `wiki/${rawPath.split('/')[1]}`,
                        isUpdate: rawPath === 'raw/a.md'
                    })
                })
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await approveCurrentBatch(queue)
        await approveCurrentBatch(queue)
        await startPromise
        expect(fake.ingestCalls).toHaveLength(2)
        expect(queue.getState().counts.applied).toBe(2)
    })
})

/* ============================================================================
 * 三、分批集中审批
 * ========================================================================== */

describe('start：batch 模式每批集中审批', () => {
    it('每批生成 N 个草案集中审批，全部处理完后进入下一批', async () => {
        const tree = makeTree({
            rawFiles: [
                { relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' },
                { relativePath: 'raw/b.md', absolutePath: 'E:/ws/raw/b.md', name: 'b.md' },
                { relativePath: 'raw/c.md', absolutePath: 'E:/ws/raw/c.md', name: 'c.md' }
            ]
        })
        const fake = createFakeDeps({ tree })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 2 }))
        expect(queue.getState().batchCount).toBe(2)
        const startPromise = queue.start({ mode: 'all' })

        const firstBatch = await waitForPendingApproval(queue)
        expect(firstBatch.batchIndex).toBe(0)
        expect(firstBatch.batchCount).toBe(2)
        expect(firstBatch.drafts).toHaveLength(2)
        await queue.approveDraft(firstBatch.drafts[0].itemId)
        await queue.approveDraft(firstBatch.drafts[1].itemId)

        const secondBatch = await waitForPendingApproval(queue)
        expect(secondBatch.batchIndex).toBe(1)
        expect(secondBatch.drafts).toHaveLength(1)
        await queue.approveDraft(secondBatch.drafts[0].itemId)
        await startPromise

        expect(queue.getState().counts.applied).toBe(3)
    })

    it('切换活动草案：setActiveDraft 生效，非法 id 忽略', async () => {
        const tree = makeTree({
            rawFiles: [
                { relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' },
                { relativePath: 'raw/b.md', absolutePath: 'E:/ws/raw/b.md', name: 'b.md' }
            ]
        })
        const fake = createFakeDeps({ tree })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 2 }))
        const startPromise = queue.start({ mode: 'all' })
        const snapshot = await waitForPendingApproval(queue)
        expect(snapshot.activeDraftId).toBe('raw/a.md')
        queue.setActiveDraft('raw/b.md')
        expect(queue.getState().activeDraftId).toBe('raw/b.md')
        queue.setActiveDraft('raw/none.md')
        expect(queue.getState().activeDraftId).toBe('raw/b.md')
        await queue.approveDraft('raw/a.md')
        await queue.approveDraft('raw/b.md')
        await startPromise
    })
})

/* ============================================================================
 * 四、人工修改保护
 * ========================================================================== */

describe('人工修改冲突：生成后复核与处理', () => {
    function conflictFixture(pageState: 'manual-create' | 'manual-edit' | 'source-mismatch') {
        const contentA = pageContent('raw/a.md')
        const tree = makeTree({
            rawFiles: [{ relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' }],
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        const records: BatchCompileCompileRecord[] = []
        if (pageState !== 'manual-create') {
            records.push({
                targetPath: 'wiki/a.md',
                sourcePath: pageState === 'source-mismatch' ? 'raw/other.md' : 'raw/a.md',
                contentHash:
                    pageState === 'manual-edit'
                        ? hashBatchCompileContent('旧内容')
                        : hashBatchCompileContent(contentA),
                updatedAt: 1
            })
        }
        return createFakeDeps({
            tree,
            pageContents: { 'E:/ws/wiki/a.md': contentA },
            records,
            ingest: (rawPath) =>
                Promise.resolve({
                    ok: true,
                    draft: makeDraft(rawPath, { draftPath: 'wiki/a.md', isUpdate: true })
                })
        })
    }

    it.each([
        ['manual-create', 'manual-create'],
        ['manual-edit', 'manual-edit'],
        ['source-mismatch', 'source-mismatch']
    ] as const)('冲突原因 %s：跳过不写盘', async (pageState, expectedReason) => {
        const fake = conflictFixture(pageState)
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        const snapshot = await waitForPendingApproval(queue)
        expect(snapshot.drafts[0].conflict?.reason).toBe(expectedReason)
        queue.skipDraft('raw/a.md')
        await startPromise
        expect(fake.applyCalls).toHaveLength(0)
        expect(queue.getState().counts.conflictSkipped).toBe(1)
    })

    it('冲突时显式覆盖：仍执行 APPLY_INGEST 并写记录', async () => {
        const fake = conflictFixture('manual-edit')
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await waitForPendingApproval(queue)
        await queue.approveDraft('raw/a.md')
        await startPromise
        expect(fake.applyCalls).toHaveLength(1)
        expect(queue.getState().counts.applied).toBe(1)
        expect(fake.recordsMap.get('wiki/a.md')?.contentHash).toBe(
            hashBatchCompileContent(makeDraft('raw/a.md').content)
        )
    })

    it('目标页面读取失败 → unverified 冲突（不可安全覆盖）', async () => {
        const tree = makeTree({
            rawFiles: [{ relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' }],
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        let prepareReads = 0
        const fake = createFakeDeps({
            tree,
            readText: () => {
                prepareReads += 1
                // 准备阶段读取成功（建立索引），生成后复核读取失败
                if (prepareReads <= 1) {
                    return Promise.resolve(pageContent('raw/a.md'))
                }
                return Promise.resolve(null)
            },
            ingest: (rawPath) =>
                Promise.resolve({
                    ok: true,
                    draft: makeDraft(rawPath, { draftPath: 'wiki/a.md', isUpdate: true })
                })
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        const snapshot = await waitForPendingApproval(queue)
        expect(snapshot.drafts[0].conflict?.reason).toBe('unverified')
        queue.skipDraft('raw/a.md')
        await startPromise
    })
})

/* ============================================================================
 * 五、暂停 / 取消 / 重新编译全部
 * ========================================================================== */

describe('队列控制：暂停 / 继续 / 取消', () => {
    it('暂停在当前文件完成后生效，继续后恢复队列', async () => {
        let resolveFirst: (() => void) | null = null
        const fake = createFakeDeps({
            ingest: (rawPath) => {
                if (rawPath === 'raw/a.md') {
                    return new Promise<BatchCompileIngestOutcome>((resolve) => {
                        resolveFirst = () => resolve({ ok: true, draft: makeDraft(rawPath) })
                    })
                }
                return Promise.resolve({ ok: true, draft: makeDraft(rawPath) })
            }
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await vi.waitFor(() => expect(resolveFirst).not.toBeNull())

        // 当前文件（a）生成中请求暂停：a 生成完成后先进入审批，处理完 a 后进入暂停
        queue.pause()
        expect(queue.getState().pausePending).toBe(true)
        const triggerResolveFirst = resolveFirst as (() => void) | null
        triggerResolveFirst?.()
        const approvalOfA = await waitForPendingApproval(queue)
        expect(approvalOfA.drafts[0].itemId).toBe('raw/a.md')
        await queue.approveDraft('raw/a.md')
        await waitPhase(queue, 'paused')
        expect(queue.getState().pausePending).toBe(false)

        queue.resume()
        await approveCurrentBatch(queue) // b 审批
        await startPromise
        expect(queue.getState().phase).toBe('finished')
        expect(queue.getState().canceled).toBe(false)
        expect(queue.getState().counts.applied).toBe(2)
    })

    it('暂停/继续在非对应阶段调用为 no-op', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        queue.pause()
        queue.resume()
        queue.cancel()
        expect(queue.getState().phase).toBe('idle')
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        queue.resume()
        queue.cancel()
        expect(queue.getState().phase).toBe('ready')
    })

    it('生成阶段取消：停止后续、未应用不写盘、未处理项标记 canceled', async () => {
        let resolveFirst: (() => void) | null = null
        const fake = createFakeDeps({
            ingest: (rawPath) => {
                if (rawPath === 'raw/a.md') {
                    return new Promise<BatchCompileIngestOutcome>((resolve) => {
                        resolveFirst = () => resolve({ ok: true, draft: makeDraft(rawPath) })
                    })
                }
                return Promise.resolve({ ok: true, draft: makeDraft(rawPath) })
            }
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await vi.waitFor(() => expect(resolveFirst).not.toBeNull())
        queue.cancel()
        const triggerResolveFirst = resolveFirst as (() => void) | null
        triggerResolveFirst?.()
        await startPromise

        const state = queue.getState()
        expect(state.phase).toBe('finished')
        expect(state.canceled).toBe(true)
        expect(state.counts.applied).toBe(0)
        expect(fake.applyCalls).toHaveLength(0)
        expect(state.items.every((item) => item.status === 'canceled')).toBe(true)
    })

    it('审批阶段取消：待审批草案全部作废（不写盘）', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 2 }))
        const startPromise = queue.start({ mode: 'all' })
        await waitForPendingApproval(queue)
        queue.cancel()
        await startPromise
        const state = queue.getState()
        expect(state.canceled).toBe(true)
        expect(fake.applyCalls).toHaveLength(0)
        expect(state.counts.canceled).toBe(2)
    })

    it('取消后再次启动无效（需重新打开对话框）', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await waitForPendingApproval(queue)
        queue.cancel()
        await startPromise
        await queue.start({ mode: 'all' })
        expect(queue.getState().phase).toBe('finished')
    })
})

describe('重新编译全部 / 释放', () => {
    it('restartAll 重新准备并以 all 模式重跑（增量记录不再跳过）', async () => {
        const contentA = pageContent('raw/a.md')
        const contentB = pageContent('raw/b.md')
        const tree = makeTree({
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' },
                { relativePath: 'wiki/b.md', absolutePath: 'E:/ws/wiki/b.md', name: 'b.md' }
            ]
        })
        const records: BatchCompileCompileRecord[] = [
            {
                targetPath: 'wiki/a.md',
                sourcePath: 'raw/a.md',
                contentHash: hashBatchCompileContent(contentA),
                updatedAt: 1
            },
            {
                targetPath: 'wiki/b.md',
                sourcePath: 'raw/b.md',
                contentHash: hashBatchCompileContent(contentB),
                updatedAt: 1
            }
        ]
        const fake = createFakeDeps({
            tree,
            pageContents: { 'E:/ws/wiki/a.md': contentA, 'E:/ws/wiki/b.md': contentB },
            records,
            ingest: (rawPath) =>
                Promise.resolve({
                    ok: true,
                    draft: makeDraft(rawPath, {
                        draftPath: rawPath === 'raw/a.md' ? 'wiki/a.md' : 'wiki/b.md',
                        isUpdate: true
                    })
                })
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        await queue.start({ mode: 'incremental' })
        expect(fake.ingestCalls).toEqual([])

        const restartPromise = queue.restartAll()
        await approveCurrentBatch(queue)
        await approveCurrentBatch(queue)
        await restartPromise
        expect(fake.ingestCalls).toEqual(['raw/a.md', 'raw/b.md'])
        expect(queue.getState().counts.applied).toBe(2)
    })

    it('onChange 广播快照；dispose 后停止广播且后续操作 no-op', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        const listener = vi.fn()
        const unsubscribe = queue.onChange(listener)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(listener).toHaveBeenCalled()
        const callsBeforeDispose = listener.mock.calls.length
        unsubscribe()
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(listener.mock.calls.length).toBe(callsBeforeDispose)

        const listener2 = vi.fn()
        queue.onChange(listener2)
        queue.dispose()
        const afterDispose = listener2.mock.calls.length
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        await queue.start({ mode: 'all' })
        queue.cancel()
        queue.setActiveDraft('raw/a.md')
        queue.skipDraft('raw/a.md')
        await queue.retryItem('raw/a.md')
        await queue.restartAll()
        queue.pause()
        queue.resume()
        expect(listener2.mock.calls.length).toBe(afterDispose)
    })
})

/* ============================================================================
 * 六、边界与防御
 * ========================================================================== */

describe('边界与防御', () => {
    it('未准备（idle）时 start 无效', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.start({ mode: 'all' })
        expect(queue.getState().phase).toBe('idle')
        expect(fake.ingestCalls).toEqual([])
    })

    it('无效审批动作 / 无效重试 / 非完成阶段重试均为 no-op', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        queue.skipDraft('raw/a.md')
        await queue.approveDraft('raw/a.md')
        await queue.retryItem('raw/none.md')
        await queue.retryItem('raw/a.md')
        expect(queue.getState().phase).toBe('ready')
        expect(fake.applyCalls).toHaveLength(0)
    })

    it('AI 配置读取返回 readFailed=true 但 configured=true 时仍可启动', async () => {
        const fake = createFakeDeps({
            ai: configuredAi({ configured: true, readFailed: true })
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().phase).toBe('ready')
        expect(queue.getState().aiConfig?.readFailed).toBe(true)
    })

    it('准备阶段 dispose：后续 prepare 不再广播（组件关闭竞态）', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        const listener = vi.fn()
        queue.onChange(listener)
        queue.dispose()
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(listener).not.toHaveBeenCalled()
        expect(queue.getState().phase).toBe('idle')
    })

    it('准备阶段读取 wiki 页面抛异常 → 页面按不可用处理（不阻塞准备）', async () => {
        const tree = makeTree({
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        const fake = createFakeDeps({
            tree,
            readText: () => Promise.reject(new Error('read boom'))
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        expect(queue.getState().phase).toBe('ready')
        const itemA = queue.getState().items.find((item) => item.id === 'raw/a.md')
        // 页面读取失败 → 无法匹配来源 → 视为无既有页面（新页面）
        expect(itemA?.pageState).toBe('missing')
    })

    it('快照为深拷贝：外部修改不影响内部状态', async () => {
        const fake = createFakeDeps({})
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const snapshot = queue.getState()
        snapshot.items[0].status = 'applied'
        snapshot.items.length = 0
        expect(queue.getState().items).toHaveLength(2)
        expect(queue.getState().items[0].status).toBe('pending')
    })

    it('模式切换为 all 时 preview 记录不影响实际跳过（显式 mode=all）', async () => {
        const fake = createFakeDeps({
            tree: makeTree({
                wikiPages: [
                    { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
                ]
            }),
            pageContents: { 'E:/ws/wiki/a.md': pageContent('raw/a.md') },
            records: [
                {
                    targetPath: 'wiki/a.md',
                    sourcePath: 'raw/a.md',
                    contentHash: hashBatchCompileContent(pageContent('raw/a.md')),
                    updatedAt: 1
                }
            ],
            ingest: (rawPath) =>
                Promise.resolve({ ok: true, draft: makeDraft(rawPath, { isUpdate: false }) })
        })
        queue = createBatchCompileQueue(fake.deps)
        await queue.prepare(normalizeBatchCompileRequest({ scope: 'all' }))
        const startPromise = queue.start({ mode: 'all' })
        await approveCurrentBatch(queue)
        await approveCurrentBatch(queue)
        await startPromise
        expect(fake.ingestCalls).toHaveLength(2)
    })
})

/* ============================================================================
 * 辅助：验证 buildBatchCompileWikiPageIndex 与队列预检口径一致（防止两处漂移）
 * ========================================================================== */
describe('队列预检口径与纯逻辑一致', () => {
    it('buildBatchCompileWikiPageIndex 索引结果能定位 raw 来源页面', () => {
        const index = buildBatchCompileWikiPageIndex([
            {
                page: { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' },
                content: pageContent('raw/a.md')
            }
        ])
        expect(index[0].source).toBe('raw/a.md')
    })
})
