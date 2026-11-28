// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译对话框组件单测
 * （`components/llm-wiki/BatchCompileDialog.vue`）
 *
 * 覆盖：
 * 1. 准备：加载态 → 参数摘要（范围/文件数/模型）/ 增量预检 / 远程模型隐私提示；
 * 2. 未配置 AI / 目录树失败：阻止启动 + 去配置/重试入口；
 * 3. 执行：进度、当前文件、暂停（当前文件完成后停）/ 继续 / 取消；
 * 4. 审批：逐项应用/跳过、分批列表切换、冲突跳过/覆盖；
 * 5. 完成：汇总、单项失败重试、重新编译全部、打开编译结果、取消提示；
 * 6. 关闭语义：运行中关闭先取消（未应用不写盘）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { t } from '../../../src/renderer/src/common/i18n'
import {
    hashBatchCompileContent,
    normalizeBatchCompileRequest,
    type BatchCompileCompileRecord,
    type BatchCompileRecordStore,
    type BatchCompileWorkspaceTree
} from '../../../src/renderer/src/common/batch-compile'
import type { AiIngestSuccess } from '../../../src/shared/types/ai'
import type {
    BatchCompileAiConfig,
    BatchCompileApplyOutcome,
    BatchCompileDeps,
    BatchCompileIngestOutcome
} from '../../../src/renderer/src/components/llm-wiki/batch-compile-queue'

const { openWorkspaceFileAtLineMock, openAiAssistantMock } = vi.hoisted(() => ({
    openWorkspaceFileAtLineMock: vi.fn(async () => true),
    openAiAssistantMock: vi.fn()
}))

vi.mock('@renderer/composables/useWorkspaceSearch', () => ({
    openWorkspaceFileAtLine: openWorkspaceFileAtLineMock
}))

vi.mock('@renderer/components/dialogs/complex/ai-assistant-dialog-state', () => ({
    openAiAssistantDialogState: openAiAssistantMock
}))

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import BatchCompileDialog from '../../../src/renderer/src/components/llm-wiki/BatchCompileDialog.vue'

/* ============================================================================
 * 测试工具
 * ========================================================================== */

interface MountOptions {
    ai?: BatchCompileAiConfig
    aiError?: boolean
    tree?: BatchCompileWorkspaceTree
    treeError?: string
    pageContents?: Record<string, string>
    records?: BatchCompileCompileRecord[]
    ingest?: (rawPath: string) => Promise<BatchCompileIngestOutcome>
    apply?: (request: { draftPath: string; content: string }) => Promise<BatchCompileApplyOutcome>
}

interface FakeDeps {
    deps: BatchCompileDeps
    ingestCalls: string[]
    applyCalls: Array<{ draftPath: string; content: string }>
    recordsMap: Map<string, BatchCompileCompileRecord>
}

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
        model: 'fake',
        ...overrides
    }
}

function pageContent(source: string): string {
    return `---\nsource: ${source}\n---\n\n# 页面\n`
}

function createFakeDeps(options: MountOptions = {}): FakeDeps {
    const recordsMap = new Map<string, BatchCompileCompileRecord>()
    for (const record of options.records ?? []) {
        recordsMap.set(record.targetPath, record)
    }
    const records: BatchCompileRecordStore = {
        get: (_rootPath, targetPath) => recordsMap.get(targetPath) ?? null,
        set: (_rootPath, record) => {
            recordsMap.set(record.targetPath, record)
        },
        remove: (_rootPath, targetPath) => {
            recordsMap.delete(targetPath)
        },
        getAll: () => [...recordsMap.values()]
    }
    const ingestCalls: string[] = []
    const applyCalls: Array<{ draftPath: string; content: string }> = []
    const deps: BatchCompileDeps = {
        now: () => 1_700_000_000_000,
        readAiConfig: () => {
            if (options.aiError === true) {
                return Promise.reject(new Error('config failed'))
            }
            return Promise.resolve(options.ai ?? configuredAi())
        },
        loadWorkspaceTree: () => {
            if (options.treeError !== undefined) {
                return Promise.resolve({ ok: false, error: options.treeError })
            }
            return Promise.resolve({ ok: true, tree: options.tree ?? makeTree() })
        },
        readText: (absolutePath) => Promise.resolve(options.pageContents?.[absolutePath] ?? null),
        ingest: (rawPath) => {
            ingestCalls.push(rawPath)
            return options.ingest
                ? options.ingest(rawPath)
                : Promise.resolve({ ok: true, draft: makeDraft(rawPath) })
        },
        apply: (request) => {
            applyCalls.push({ ...request })
            return options.apply
                ? options.apply(request)
                : Promise.resolve({ ok: true, path: request.draftPath })
        },
        records
    }
    return { deps, ingestCalls, applyCalls, recordsMap }
}

const mountOptions = { global: { stubs: { teleport: true } } }
let wrappers: VueWrapper[] = []

function mountDialog(
    request = normalizeBatchCompileRequest({ scope: 'all' }),
    options: MountOptions = {}
): { wrapper: VueWrapper; fake: FakeDeps } {
    const fake = createFakeDeps(options)
    const wrapper = mount(BatchCompileDialog, {
        props: { request, deps: fake.deps },
        ...mountOptions,
        attachTo: document.body
    }) as VueWrapper
    wrappers.push(wrapper)
    return { wrapper, fake }
}

/** 逐项应用当前待审批草案直到完成（立即完成的依赖下 flushPromises 即可推进） */
async function driveApprovals(wrapper: VueWrapper): Promise<void> {
    for (let guard = 0; guard < 20; guard += 1) {
        await flushPromises()
        if (wrapper.find('[data-testid="batch-finished-title"]').exists()) {
            return
        }
        const applyButton = wrapper.find('[data-testid="batch-apply"]')
        if (applyButton.exists() && !(applyButton.element as HTMLButtonElement).disabled) {
            await applyButton.trigger('click')
            continue
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

beforeEach(() => {
    wrappers = []
    openWorkspaceFileAtLineMock.mockReset()
    openWorkspaceFileAtLineMock.mockResolvedValue(true)
    openAiAssistantMock.mockReset()
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

/* ============================================================================
 * 一、准备与参数摘要
 * ========================================================================== */

describe('BatchCompileDialog：准备与参数摘要', () => {
    it('打开即准备：全量范围/文件数/模型/增量预检', async () => {
        const { wrapper } = mountDialog()
        await flushPromises()

        expect(wrapper.find('.batch-compile-dialog').exists()).toBe(true)
        expect(wrapper.find('[data-testid="batch-scope"]').text()).toBe(
            t('editorUi.batchCompile.scopeAll')
        )
        expect(wrapper.find('[data-testid="batch-file-count"]').text()).toContain('2')
        expect(wrapper.find('[data-testid="batch-ai-model"]').text()).toBe('本地 Qwen')
        expect(wrapper.find('[data-testid="batch-preview-skip"]').text()).toContain('0')
        expect(wrapper.find('[data-testid="batch-mode-incremental"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="batch-mode-all"]').exists()).toBe(true)
        // 启动按钮 + 取消
        expect(wrapper.find('[data-testid="batch-start"]').text()).toBe(
            t('editorUi.batchCompile.start')
        )
        expect(wrapper.find('[data-testid="batch-cancel"]').exists()).toBe(true)
        // 本地模型不显示远程隐私提示
        expect(wrapper.find('[data-testid="batch-remote-warning"]').exists()).toBe(false)
    })

    it('指定目录/分批范围文案与降级提示', async () => {
        const directory = mountDialog(
            normalizeBatchCompileRequest({ scope: 'directory', directory: 'notes' }),
            {
                tree: makeTree({
                    rawFiles: [
                        {
                            relativePath: 'raw/notes/a.md',
                            absolutePath: 'E:/ws/raw/notes/a.md',
                            name: 'a.md'
                        },
                        { relativePath: 'raw/b.md', absolutePath: 'E:/ws/raw/b.md', name: 'b.md' }
                    ]
                })
            }
        )
        await flushPromises()
        expect(directory.wrapper.find('[data-testid="batch-scope"]').text()).toContain('notes')
        directory.wrapper.unmount()

        const batch = mountDialog(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 5 }))
        await flushPromises()
        expect(batch.wrapper.find('[data-testid="batch-scope"]').text()).toContain('5')
    })

    it('远程默认模型：隐私提示 + 启动按钮改为「我已知晓，继续编译」', async () => {
        const { wrapper, fake } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            ai: configuredAi({ defaultModelRemote: true, defaultModelName: 'DeepSeek' })
        })
        await flushPromises()

        const warning = wrapper.find('[data-testid="batch-remote-warning"]')
        expect(warning.exists()).toBe(true)
        expect(warning.attributes('role')).toBe('alert')
        expect(warning.text()).toContain('DeepSeek')
        expect(wrapper.find('[data-testid="batch-remote-local-hint"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="batch-start"]').text()).toBe(
            t('editorUi.batchCompile.remoteContinue')
        )

        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()
        expect(fake.ingestCalls).toEqual(['raw/a.md'])
    })

    it('增量预检：已验证页面计入预计跳过、冲突页面提示人工确认', async () => {
        const contentA = pageContent('raw/a.md')
        const contentB = pageContent('raw/b.md')
        const { wrapper } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            tree: makeTree({
                wikiPages: [
                    { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' },
                    { relativePath: 'wiki/b.md', absolutePath: 'E:/ws/wiki/b.md', name: 'b.md' }
                ]
            }),
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
        await flushPromises()
        expect(wrapper.find('[data-testid="batch-preview-skip"]').text()).toContain('1')
        const conflictHint = wrapper.find('[data-testid="batch-preview-conflict"]')
        expect(conflictHint.exists()).toBe(true)
        expect(conflictHint.text()).toContain('1')
    })

    it('选择「重新编译全部」后启动，仍会调用 AI 生成', async () => {
        const { wrapper, fake } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-mode-all"]').setValue(true)
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()
        expect(fake.ingestCalls).toEqual(['raw/a.md'])
    })
})

/* ============================================================================
 * 二、阻止启动
 * ========================================================================== */

describe('BatchCompileDialog：阻止启动与引导', () => {
    it('AI 未配置：提示条 + 去配置 AI 助手（点击关闭并打开配置）', async () => {
        const { wrapper } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            ai: configuredAi({ configured: false })
        })
        await flushPromises()

        const blocked = wrapper.find('[data-testid="batch-blocked"]')
        expect(blocked.exists()).toBe(true)
        expect(blocked.attributes('role')).toBe('alert')
        expect(blocked.text()).toContain(t('editorUi.batchCompile.blockedTitle'))

        await wrapper.find('[data-action="open-ai-config"]').trigger('click')
        expect(openAiAssistantMock).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('AI 配置读取失败：区分引导文案；重试准备按钮可再次读取', async () => {
        const { wrapper, fake } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            aiError: true
        })
        await flushPromises()
        expect(wrapper.find('[data-testid="batch-blocked"]').text()).toContain(
            t('editorUi.batchCompile.blockedConfigReadFailed')
        )
        await wrapper.find('[data-testid="batch-retry-prepare"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="batch-blocked"]').exists()).toBe(true)
        expect(fake.ingestCalls).toEqual([])
    })

    it('目录树加载失败：展示错误详情并允许重试', async () => {
        const { wrapper } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            treeError: '目录树读取超时'
        })
        await flushPromises()
        const blocked = wrapper.find('[data-testid="batch-blocked"]')
        expect(blocked.text()).toContain('目录树读取超时')
        expect(wrapper.find('[data-testid="batch-retry-prepare"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="batch-start"]').exists()).toBe(false)
    })
})

/* ============================================================================
 * 三、执行、暂停、取消
 * ========================================================================== */

describe('BatchCompileDialog：执行与队列控制', () => {
    it('进度条/当前文件渲染；逐项应用后完成汇总 + 打开编译结果', async () => {
        const { wrapper, fake } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()

        // 生成后进入审批：diff 展示 + 待审批列表
        expect(wrapper.find('[data-testid="batch-draft-list"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="batch-draft-detail"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="ingest-diff-lines"]').exists()).toBe(true)

        await driveApprovals(wrapper)
        expect(wrapper.find('[data-testid="batch-finished-title"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="batch-result-summary"]').text()).toContain(
            t('editorUi.batchCompile.summaryApplied', { count: 2 })
        )
        expect(fake.applyCalls).toHaveLength(2)
        // 打开编译结果
        await wrapper.find('[data-testid="batch-open-wiki"]').trigger('click')
        await flushPromises()
        expect(openWorkspaceFileAtLineMock).toHaveBeenCalledWith('E:/ws/wiki/a.md', 1)
        expect(wrapper.find('[data-testid="batch-notice"]').exists()).toBe(false)
    })

    it('打开编译结果失败 → 行内提示', async () => {
        openWorkspaceFileAtLineMock.mockResolvedValue(false)
        const { wrapper } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await driveApprovals(wrapper)
        await wrapper.find('[data-testid="batch-open-wiki"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="batch-notice"]').text()).toBe(
            t('editorUi.batchCompile.openWikiHomeFailed')
        )
    })

    it('暂停：当前文件完成后进入暂停；继续后完成队列', async () => {
        let resolveFirst: (() => void) | null = null
        const { wrapper } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            ingest: (rawPath) => {
                if (rawPath === 'raw/a.md') {
                    return new Promise<BatchCompileIngestOutcome>((resolve) => {
                        resolveFirst = () => resolve({ ok: true, draft: makeDraft(rawPath) })
                    })
                }
                return Promise.resolve({ ok: true, draft: makeDraft(rawPath) })
            }
        })
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await vi.waitFor(() => expect(resolveFirst).not.toBeNull())

        await wrapper.find('[data-testid="batch-pause"]').trigger('click')
        expect(wrapper.find('[data-testid="batch-pause-pending"]').exists()).toBe(true)
        const triggerResolveFirst = resolveFirst as (() => void) | null
        triggerResolveFirst?.()
        await flushPromises()

        // 处理 a 的审批 → 进入暂停
        await wrapper.find('[data-testid="batch-apply"]').trigger('click')
        await vi.waitFor(() =>
            expect(wrapper.find('[data-testid="batch-paused"]').exists()).toBe(true)
        )
        await wrapper.find('[data-testid="batch-resume"]').trigger('click')
        await driveApprovals(wrapper)
        expect(wrapper.find('[data-testid="batch-finished-title"]').exists()).toBe(true)
    })

    it('审批阶段取消：完成页展示「已取消」与未写盘提示', async () => {
        const { wrapper, fake } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="batch-draft-list"]').exists()).toBe(true)
        await wrapper.find('[data-testid="batch-cancel-approval"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="batch-canceled-hint"]').exists()).toBe(true)
        expect(fake.applyCalls).toHaveLength(0)
        expect(wrapper.find('[data-testid="batch-result-summary"]').text()).toContain(
            t('editorUi.batchCompile.summaryCanceled', { count: 2 })
        )
    })

    it('运行中关闭 → 先取消（不写盘）再 emit close', async () => {
        const { wrapper, fake } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="batch-cancel-approval"]').trigger('click')
        await flushPromises()
        // 完成页关闭按钮
        await wrapper.find('[data-testid="batch-close"]').trigger('click')
        expect(wrapper.emitted('close')).toBeTruthy()
        expect(fake.applyCalls).toHaveLength(0)
    })
})

/* ============================================================================
 * 四、审批：跳过 / 分批 / 冲突
 * ========================================================================== */

describe('BatchCompileDialog：逐项审批与冲突处理', () => {
    it('跳过本项：不调用写盘，完成后统计跳过', async () => {
        const { wrapper, fake } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="batch-skip"]').trigger('click')
        await driveApprovals(wrapper)
        await flushPromises()

        expect(fake.applyCalls).toHaveLength(1)
        const summary = wrapper.find('[data-testid="batch-result-summary"]').text()
        expect(summary).toContain(t('editorUi.batchCompile.summarySkipped', { count: 1 }))
        expect(wrapper.find('[data-testid="batch-skipped-list"]').exists()).toBe(true)
    })

    it('分批模式：同一批草案可切换选择并逐项应用', async () => {
        const tree = makeTree({
            rawFiles: [
                { relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' },
                { relativePath: 'raw/b.md', absolutePath: 'E:/ws/raw/b.md', name: 'b.md' }
            ]
        })
        const { wrapper, fake } = mountDialog(
            normalizeBatchCompileRequest({ scope: 'batch', batchSize: 2 }),
            { tree }
        )
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()

        expect(wrapper.findAll('.batch-draft-item')).toHaveLength(2)
        await wrapper.find('[data-testid="batch-draft-1"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="batch-draft-1"]').classes()).toContain('is-active')
        await wrapper.find('[data-testid="batch-apply"]').trigger('click')
        await flushPromises()
        expect(fake.applyCalls[0].draftPath).toBe('wiki/b.md')
        await driveApprovals(wrapper)
        expect(wrapper.find('[data-testid="batch-finished-title"]').exists()).toBe(true)
    })

    it('人工修改冲突：展示冲突原因与「跳过/覆盖」，覆盖仍写盘', async () => {
        const tree = makeTree({
            rawFiles: [{ relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' }],
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        const { wrapper, fake } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            tree,
            pageContents: { 'E:/ws/wiki/a.md': pageContent('raw/a.md') },
            ingest: (rawPath) =>
                Promise.resolve({
                    ok: true,
                    draft: makeDraft(rawPath, { draftPath: 'wiki/a.md', isUpdate: true })
                })
        })
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()

        const conflict = wrapper.find('[data-testid="batch-conflict"]')
        expect(conflict.exists()).toBe(true)
        expect(conflict.text()).toContain(t('editorUi.batchCompile.conflictManualCreate'))
        expect(wrapper.find('[data-testid="batch-conflict-skip"]').exists()).toBe(true)

        await wrapper.find('[data-testid="batch-conflict-overwrite"]').trigger('click')
        await flushPromises()
        expect(fake.applyCalls).toHaveLength(1)
        await driveApprovals(wrapper)
        expect(wrapper.find('[data-testid="batch-finished-title"]').exists()).toBe(true)
    })

    it('冲突时选择跳过 → 冲突跳过统计，不写盘', async () => {
        const tree = makeTree({
            rawFiles: [{ relativePath: 'raw/a.md', absolutePath: 'E:/ws/raw/a.md', name: 'a.md' }],
            wikiPages: [
                { relativePath: 'wiki/a.md', absolutePath: 'E:/ws/wiki/a.md', name: 'a.md' }
            ]
        })
        const { wrapper, fake } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            tree,
            pageContents: { 'E:/ws/wiki/a.md': pageContent('raw/a.md') },
            ingest: (rawPath) =>
                Promise.resolve({
                    ok: true,
                    draft: makeDraft(rawPath, { draftPath: 'wiki/a.md', isUpdate: true })
                })
        })
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="batch-conflict-skip"]').trigger('click')
        await flushPromises()

        expect(fake.applyCalls).toHaveLength(0)
        expect(wrapper.find('[data-testid="batch-result-summary"]').text()).toContain(
            t('editorUi.batchCompile.summaryConflictSkipped', { count: 1 })
        )
    })
})

/* ============================================================================
 * 五、失败重试 / 重新编译全部
 * ========================================================================== */

describe('BatchCompileDialog：失败重试与重新编译全部', () => {
    it('单项失败：完成页展示失败清单，点击重试后重新生成并审批', async () => {
        let failFirst = true
        const { wrapper } = mountDialog(normalizeBatchCompileRequest({ scope: 'all' }), {
            ingest: (rawPath) => {
                if (rawPath === 'raw/a.md' && failFirst) {
                    return Promise.resolve({ ok: false, error: '模型超时' })
                }
                return Promise.resolve({ ok: true, draft: makeDraft(rawPath) })
            }
        })
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await driveApprovals(wrapper)

        const failedList = wrapper.find('[data-testid="batch-failed-list"]')
        expect(failedList.exists()).toBe(true)
        expect(failedList.text()).toContain('模型超时')
        failFirst = false
        await wrapper.find('[data-testid="batch-retry-raw/a.md"]').trigger('click')
        await driveApprovals(wrapper)
        expect(wrapper.find('[data-testid="batch-failed-list"]').exists()).toBe(false)
    })

    it('重新编译全部：再次生成全部目标', async () => {
        const { wrapper, fake } = mountDialog()
        await flushPromises()
        await wrapper.find('[data-testid="batch-start"]').trigger('click')
        await driveApprovals(wrapper)
        expect(fake.ingestCalls).toHaveLength(2)

        await wrapper.find('[data-testid="batch-restart-all"]').trigger('click')
        await flushPromises()
        await driveApprovals(wrapper)
        expect(fake.ingestCalls).toHaveLength(4)
        expect(wrapper.find('[data-testid="batch-finished-title"]').exists()).toBe(true)
    })
})
