// @vitest-environment jsdom
/**
 * 1.5.1 本地知识库查询对话框（B2/B1/B4）组件契约测试（jsdom + @vue/test-utils）
 *
 * 覆盖口径（task-11）：
 * - tags：标签聚合（tag/count）渲染、点击展开文件、点击文件经既有打开链路打开；
 * - links：缺失/歧义链接的来源文件、行号、target、状态渲染，点击打开来源行；
 * - backlinks：当前活动文件反向链接渲染与空态（无活动文件 / 无反链）；
 * - 加载与刷新：打开调用 refresh(false)、刷新/重试调用 refresh(true)；
 * - 状态：loading、INDEX_ERROR 错误态 + 重试、NO_WORKSPACE 无工作区、空工作区快照、
 *   刷新失败保留上次快照、主进程不可用（不抛错）；
 * - 宿主入口：openKnowledgeDialog 首次挂载、关闭不重建、dispose 清理可重挂载、
 *   无 document 环境返回 false、非法视图归一化。
 *
 * mock 约定（TEST-11）：仅 stub 全局 `window.electron.ipcRenderer` 与 `window.api.config`，
 * 不 mock 业务模块；文件打开断言复用真实 `openIndexedFile` 链路（send + 活动文件确认 +
 * EventBus 跳行），与生产一致。
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import {
    disposeDocumentHistoryFeature,
    documentHistoryState
} from '../../../src/renderer/src/composables/useDocumentHistory'
import {
    closeKnowledgeDialog,
    disposeKnowledgeHost,
    knowledgeDialogState,
    openKnowledgeDialog,
    type KnowledgeDialogMode
} from '../../../src/renderer/src/components/Markdown/knowledge'
import KnowledgeDialog from '../../../src/renderer/src/components/Markdown/knowledge/KnowledgeDialog.vue'
import { IPC } from '../../../src/shared/ipc-channels'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot,
    WorkspaceIndexTag
} from '../../../src/shared/types/workspace-index'

/* ==================== 快照夹具 ==================== */

const ROOT_PATH = 'C:\\ws'
const FILE_A_PATH = 'C:\\ws\\a.md'
const FILE_B_PATH = 'C:\\ws\\notes\\b.md'

/** 工作区文件 a.md：含缺失 / 歧义链接，标签 vue+ts */
const FILE_A: WorkspaceIndexFile = {
    path: FILE_A_PATH,
    relativePath: 'a.md',
    name: 'a.md',
    title: 'A 笔记',
    tags: ['vue', 'ts'],
    links: [
        {
            target: 'ghost',
            raw: '[[ghost]]',
            line: 3,
            column: 1,
            status: 'missing'
        },
        {
            target: 'dup',
            raw: '[[dup]]',
            line: 4,
            column: 1,
            status: 'ambiguous'
        }
    ],
    size: 128,
    mtimeMs: 1_700_000_000_000
}

/** 工作区文件 notes/b.md：唯一 resoved 链接指向 a.md（作为 a.md 的反向链接） */
const FILE_B: WorkspaceIndexFile = {
    path: FILE_B_PATH,
    relativePath: 'notes/b.md',
    name: 'b.md',
    title: 'B 笔记',
    tags: ['vue'],
    links: [
        {
            target: 'a',
            raw: '[[a|A 笔记]]',
            line: 7,
            column: 2,
            status: 'resolved',
            resolvedPath: FILE_A_PATH
        }
    ],
    size: 256,
    mtimeMs: 1_700_000_100_000
}

const TAGS: WorkspaceIndexTag[] = [
    { tag: 'vue', count: 2, files: [FILE_A_PATH, FILE_B_PATH] },
    { tag: 'ts', count: 1, files: [FILE_A_PATH] }
]

/** 构造索引快照（默认夹具可覆盖 files/tags/missingLinks，stats 按内容自动统计） */
function createSnapshot(
    overrides: {
        files?: WorkspaceIndexFile[]
        tags?: WorkspaceIndexTag[]
        missingLinks?: WorkspaceIndexSnapshot['missingLinks']
    } = {}
): WorkspaceIndexSnapshot {
    const files = overrides.files ?? [FILE_A, FILE_B]
    const tags = overrides.tags ?? TAGS
    const missingLinks =
        overrides.missingLinks ??
        files
            .filter((file) => file.relativePath === FILE_A.relativePath)
            .map((file) => ({
                sourcePath: file.path,
                sourceRelativePath: file.relativePath,
                target: 'ghost',
                line: 3,
                column: 1
            }))
    const linkCount = files.reduce((sum, file) => sum + file.links.length, 0)
    const missingCount = files.reduce(
        (sum, file) => sum + file.links.filter((link) => link.status === 'missing').length,
        0
    )
    const ambiguousCount = files.reduce(
        (sum, file) => sum + file.links.filter((link) => link.status === 'ambiguous').length,
        0
    )
    return {
        rootPath: ROOT_PATH,
        generatedAt: 1_700_000_200_000,
        files,
        tags,
        missingLinks,
        stats: {
            fileCount: files.length,
            linkCount,
            missingCount,
            ambiguousCount
        }
    }
}

/** 默认主进程返回值：成功 + 命中缓存 */
function successResult(snapshot: WorkspaceIndexSnapshot = createSnapshot()): unknown {
    return { ok: true, snapshot, cached: true }
}

/* ==================== IPC 替身 ==================== */

interface IpcStub {
    invoke: Mock
    send: Mock
    on: Mock
    removeListener: Mock
}

/**
 * 安装受限 `window.electron.ipcRenderer` 替身：
 * - invoke 对 `FILE.GET_WORKSPACE_INDEX` 返回给定结果，其余通道返回 null；
 * - send 收到 `FILE.OPEN_SELECT_FILE` 时同步回发 `FILE.USER_SELECT_FILE`，
 *   复刻主进程「打开文件 → 下发活动文件」的真实链路（供 openIndexedFile 等确认用）。
 */
function installIpc(indexResult: unknown = successResult()): IpcStub {
    type IpcListener = (event: unknown, ...args: unknown[]) => void
    const listeners = new Map<string, IpcListener[]>()
    const invoke = vi.fn()
    invoke.mockImplementation(async (channel: string): Promise<unknown> => {
        return channel === IPC.FILE.GET_WORKSPACE_INDEX ? indexResult : null
    })
    const send = vi.fn()
    send.mockImplementation((channel: string, payload?: { path?: string }): void => {
        if (channel !== IPC.FILE.OPEN_SELECT_FILE || typeof payload?.path !== 'string') {
            return
        }
        const openedPath = payload.path
        for (const listener of listeners.get(IPC.FILE.USER_SELECT_FILE) ?? []) {
            listener({}, openedPath)
        }
    })
    const on = vi.fn()
    on.mockImplementation((channel: string, listener: IpcListener): void => {
        const handlers = listeners.get(channel)
        if (handlers === undefined) {
            listeners.set(channel, [listener])
            return
        }
        handlers.push(listener)
    })
    const removeListener = vi.fn()
    removeListener.mockImplementation((channel: string, listener: IpcListener): void => {
        const handlers = listeners.get(channel)
        if (handlers === undefined) {
            return
        }
        const index = handlers.indexOf(listener)
        if (index >= 0) {
            handlers.splice(index, 1)
        }
    })
    const stub: IpcStub = { invoke, send, on, removeListener }
    vi.stubGlobal('electron', { ipcRenderer: stub })
    return stub
}

/* ==================== 挂载工具 ==================== */

const mountOptions = {
    global: { stubs: { teleport: true } },
    attachTo: document.body
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 设置视图并挂载对话框（打开即触发一次 refresh(false)） */
async function mountDialog(mode: KnowledgeDialogMode = 'tags'): Promise<VueWrapper> {
    knowledgeDialogState.mode = mode
    knowledgeDialogState.visible = true
    const wrapper = track(mount(KnowledgeDialog, mountOptions))
    await flushPromises()
    await nextTick()
    return wrapper
}

/** 等待文件打开链路完成（USER_SELECT_FILE 确认后的 80ms 跳行延迟 + 一次微任务） */
async function waitForOpenChain(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 140))
    await flushPromises()
    await nextTick()
}

beforeEach(() => {
    // 渲染层 i18n / 能力开关初始化会读 window.api.config，必须提供替身（同 writing-style 测试）
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn() }
    })
    installIpc()
    disposeDocumentHistoryFeature()
    documentHistoryState.activeFilePath = ''
    knowledgeDialogState.visible = false
    knowledgeDialogState.mode = 'tags'
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

afterEach(async () => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    disposeKnowledgeHost()
    await nextTick()
    disposeDocumentHistoryFeature()
    vi.unstubAllGlobals()
    knowledgeDialogState.visible = false
    knowledgeDialogState.mode = 'tags'
    documentHistoryState.activeFilePath = ''
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

/* ==================== tags 视图（B2） ==================== */

describe('tags 视图：标签聚合与文件展开', () => {
    it('渲染标签与计数，点击展开文件，再次点击收起', async () => {
        const wrapper = await mountDialog('tags')
        const tagItems = wrapper.findAll('.tag-item')
        expect(tagItems).toHaveLength(2)
        expect(tagItems[0].find('.tag-name').text()).toBe('#vue')
        expect(tagItems[0].find('.tag-count').text()).toBe('2')
        expect(tagItems[1].find('.tag-name').text()).toBe('#ts')
        expect(wrapper.findAll('.tag-file')).toHaveLength(0)

        await tagItems[0].trigger('click')
        const expandedFiles = wrapper.findAll('.tag-file')
        expect(expandedFiles).toHaveLength(2)
        expect(expandedFiles[0].text()).toContain('A 笔记')
        expect(expandedFiles[0].text()).toContain('a.md')
        expect(expandedFiles[1].text()).toContain('notes/b.md')

        await tagItems[0].trigger('click')
        expect(wrapper.findAll('.tag-file')).toHaveLength(0)
    })

    it('点击标签文件经既有打开链路打开（OPEN_SELECT_FILE + 跳行事件）', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog('tags')
        await wrapper.findAll('.tag-item')[0].trigger('click')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.findAll('.tag-file')[1].trigger('click')
        await waitForOpenChain()

        expect(stub.send).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ path: FILE_B_PATH })
        )
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: 1 })
    })

    it('工作区没有任何标签时显示 tags 空态', async () => {
        installIpc(
            successResult(
                createSnapshot({
                    files: [{ ...FILE_A, tags: [], links: [] }],
                    tags: [],
                    missingLinks: []
                })
            )
        )
        const wrapper = await mountDialog('tags')
        expect(wrapper.find('.knowledge-placeholder--empty').exists()).toBe(true)
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('还没有任何标签')
    })
})

/* ==================== links 视图（B1） ==================== */

describe('links 视图：缺失 / 歧义链接', () => {
    it('渲染来源文件、行号、target 与状态', async () => {
        installIpc(successResult())
        const wrapper = await mountDialog('links')
        const items = wrapper.findAll('.link-item')
        expect(items).toHaveLength(2)

        expect(items[0].find('.link-location').text()).toBe('L3:1')
        expect(items[0].find('.link-source').text()).toBe('a.md')
        expect(items[0].find('.link-target').text()).toBe('[[ghost]]')
        expect(items[0].find('.link-status').text()).toBe('缺失')

        expect(items[1].find('.link-location').text()).toBe('L4:1')
        expect(items[1].find('.link-target').text()).toBe('[[dup]]')
        expect(items[1].find('.link-status').text()).toBe('歧义')
        expect(wrapper.find('.knowledge-summary').text()).toContain('缺失 1')
        expect(wrapper.find('.knowledge-summary').text()).toContain('歧义 1')
    })

    it('点击问题行打开来源文件的对应行', async () => {
        const stub = installIpc(successResult())
        const wrapper = await mountDialog('links')
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.findAll('.link-item')[1].trigger('click')
        await waitForOpenChain()

        expect(stub.send).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ path: FILE_A_PATH })
        )
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: 4 })
    })

    it('没有缺失 / 歧义链接时显示 links 空态', async () => {
        installIpc(
            successResult(
                createSnapshot({
                    files: [
                        {
                            ...FILE_A,
                            links: [
                                {
                                    target: 'a',
                                    raw: '[[a]]',
                                    line: 1,
                                    column: 1,
                                    status: 'resolved',
                                    resolvedPath: FILE_A_PATH
                                }
                            ]
                        }
                    ],
                    tags: [],
                    missingLinks: []
                })
            )
        )
        const wrapper = await mountDialog('links')
        expect(wrapper.find('.knowledge-placeholder--empty').exists()).toBe(true)
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('没有缺失或歧义的')
    })
})

/* ==================== backlinks 视图（B4） ==================== */

describe('backlinks 视图：当前文件反向链接', () => {
    it('渲染活动文件反向链接并点击打开来源行', async () => {
        const stub = installIpc(successResult())
        documentHistoryState.activeFilePath = FILE_A_PATH
        const wrapper = await mountDialog('backlinks')
        const items = wrapper.findAll('.backlink-item')
        expect(items).toHaveLength(1)
        expect(items[0].find('.backlink-location').text()).toBe('L7:2')
        expect(items[0].find('.backlink-source').text()).toBe('notes/b.md')
        expect(items[0].find('.backlink-title').text()).toBe('B 笔记')
        expect(wrapper.find('.knowledge-target').text()).toContain('a.md')

        const emitSpy = vi.spyOn(EventBus, '$emit')
        await items[0].trigger('click')
        await waitForOpenChain()
        expect(stub.send).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ path: FILE_B_PATH })
        )
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: 7 })
    })

    it('没有活动文件时显示空态', async () => {
        installIpc(successResult())
        const wrapper = await mountDialog('backlinks')
        expect(wrapper.find('.knowledge-placeholder--empty').exists()).toBe(true)
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('没有打开的文件')
        expect(wrapper.findAll('.backlink-item')).toHaveLength(0)
    })

    it('有活动文件但没有反向链接时显示空态', async () => {
        installIpc(successResult())
        documentHistoryState.activeFilePath = FILE_B_PATH
        const wrapper = await mountDialog('backlinks')
        // 文案随 i18n 词典变化，这里断言「空态存在 + 主题词」，不锁定整句
        expect(wrapper.find('.knowledge-placeholder--empty').exists()).toBe(true)
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('反向链接')
        expect(wrapper.findAll('.backlink-item')).toHaveLength(0)
    })
})

/* ==================== 加载 / 刷新 / 状态 ==================== */

describe('索引加载、刷新与状态', () => {
    it('打开时调用 refresh(false)，刷新按钮调用 refresh(true)', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog('tags')
        expect(stub.invoke).toHaveBeenCalledTimes(1)
        expect(stub.invoke.mock.calls[0][0]).toBe(IPC.FILE.GET_WORKSPACE_INDEX)
        expect(stub.invoke.mock.calls[0][1]).toEqual({ force: false })

        await wrapper.find('.btn-refresh-knowledge').trigger('click')
        await flushPromises()
        await nextTick()
        expect(stub.invoke).toHaveBeenCalledTimes(2)
        expect(stub.invoke.mock.calls[1][0]).toBe(IPC.FILE.GET_WORKSPACE_INDEX)
        expect(stub.invoke.mock.calls[1][1]).toEqual({ force: true })
    })

    it('索引加载期间显示 loading 占位，完成后渲染列表', async () => {
        let resolveIndex!: (value: unknown) => void
        const pending = new Promise<unknown>((resolve) => {
            resolveIndex = resolve
        })
        const stub = installIpc()
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            return channel === IPC.FILE.GET_WORKSPACE_INDEX ? pending : null
        })

        const wrapper = await mountDialog('tags')
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('正在加载工作区索引')

        resolveIndex(successResult())
        await flushPromises()
        await nextTick()
        expect(wrapper.findAll('.tag-item')).toHaveLength(2)
    })

    it('INDEX_ERROR 显示错误态与重试按钮，重试再次强制刷新', async () => {
        const stub = installIpc({ ok: false, code: 'INDEX_ERROR' })
        const wrapper = await mountDialog('tags')
        expect(wrapper.find('.knowledge-placeholder--error').text()).toContain('加载工作区索引失败')

        await wrapper.find('.btn-retry-knowledge').trigger('click')
        await flushPromises()
        await nextTick()
        expect(stub.invoke).toHaveBeenCalledTimes(2)
        expect(stub.invoke.mock.calls[1][1]).toEqual({ force: true })
    })

    it('NO_WORKSPACE 显示「先打开工作区」空态', async () => {
        installIpc({ ok: false, code: 'NO_WORKSPACE' })
        const wrapper = await mountDialog('tags')
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('尚未打开工作区')
    })

    it('空工作区快照显示「没有可索引文件」空态', async () => {
        installIpc(successResult(createSnapshot({ files: [], tags: [], missingLinks: [] })))
        const wrapper = await mountDialog('tags')
        expect(wrapper.find('.knowledge-placeholder--empty').exists()).toBe(true)
        expect(wrapper.find('.knowledge-placeholder').text()).toContain('没有可索引的')
    })

    it('刷新失败保留上次快照并给出可见提示', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog('tags')
        expect(wrapper.findAll('.tag-item')).toHaveLength(2)

        stub.invoke.mockImplementation(async (): Promise<unknown> => {
            return { ok: false, code: 'INDEX_ERROR' }
        })
        await wrapper.find('.btn-refresh-knowledge').trigger('click')
        await flushPromises()
        await nextTick()

        expect(wrapper.findAll('.tag-item')).toHaveLength(2)
        expect(wrapper.find('.knowledge-hint--error').text()).toContain('刷新索引失败')
    })

    it('主进程 IPC 不可用时不抛错并进入错误态', async () => {
        vi.stubGlobal('electron', undefined)
        const wrapper = await mountDialog('tags')
        expect(wrapper.find('.knowledge-placeholder--error').exists()).toBe(true)
    })
})

/* ==================== 宿主入口与关闭语义 ==================== */

describe('宿主入口 openKnowledgeDialog / closeKnowledgeDialog / disposeKnowledgeHost', () => {
    it('首次调用挂载宿主并打开；关闭不重建；dispose 清理后可重新打开', async () => {
        installIpc()
        expect(await openKnowledgeDialog('tags')).toBe(true)
        await flushPromises()
        await nextTick()
        expect(knowledgeDialogState.visible).toBe(true)
        expect(knowledgeDialogState.mode).toBe('tags')
        expect(document.querySelectorAll('#baize-knowledge-host')).toHaveLength(1)
        expect(document.querySelectorAll('.tag-item').length).toBeGreaterThan(0)

        closeKnowledgeDialog()
        expect(knowledgeDialogState.visible).toBe(false)
        expect(await openKnowledgeDialog('links')).toBe(true)
        await flushPromises()
        expect(knowledgeDialogState.mode).toBe('links')
        // 关闭只切显隐，不重新 createApp / 追加容器
        expect(document.querySelectorAll('#baize-knowledge-host')).toHaveLength(1)

        disposeKnowledgeHost()
        expect(document.querySelectorAll('#baize-knowledge-host')).toHaveLength(0)
        expect(knowledgeDialogState.visible).toBe(false)

        // dispose 后再次打开会重新挂载（幂等可重入）
        expect(await openKnowledgeDialog('backlinks')).toBe(true)
        await flushPromises()
        expect(document.querySelectorAll('#baize-knowledge-host')).toHaveLength(1)
    })

    it('无 document 环境（宿主无法挂载）返回 false 且不抛错', async () => {
        const savedDocument = globalThis.document
        vi.stubGlobal('document', undefined)
        try {
            await expect(openKnowledgeDialog('tags')).resolves.toBe(false)
        } finally {
            vi.stubGlobal('document', savedDocument)
        }
        expect(knowledgeDialogState.visible).toBe(false)
    })

    it('非法视图归一化为 tags', async () => {
        installIpc()
        expect(await openKnowledgeDialog('unknown' as unknown as KnowledgeDialogMode)).toBe(true)
        await flushPromises()
        expect(knowledgeDialogState.mode).toBe('tags')
        expect(document.querySelectorAll('#baize-knowledge-host')).toHaveLength(1)
    })

    it('关闭按钮更新对话框显隐状态', async () => {
        installIpc()
        const wrapper = await mountDialog('tags')
        await wrapper.find('.btn-close-knowledge').trigger('click')
        expect(knowledgeDialogState.visible).toBe(false)
    })
})
