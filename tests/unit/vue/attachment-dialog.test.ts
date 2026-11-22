// @vitest-environment jsdom
/**
 * B5 附件管理对话框组件契约测试（jsdom + @vue/test-utils，task-14）
 *
 * 覆盖口径：
 * - 分组渲染：缺失（exists=false）组在前、正常组在后；相对路径 / 引用来源数 / 汇总文案；
 * - 引用来源展开：行内「N 处引用」按钮展开来源文件列表（相对路径 + 标题），再次点击收起；
 * - 资源管理器定位：点击「在资源管理器中显示」发送既有
 *   `IPC.FILE_MANAGER.OPEN_IN_EXPLORER`（携带附件绝对路径），缺失附件同样发送自身路径；
 * - 索引加载：打开 refresh(false)、刷新/重试 refresh(true)、loading 占位、INDEX_ERROR +
 *   重试、NO_WORKSPACE、旧索引版本（快照无 attachments 字段）空态、空附件清单空态、
 *   刷新失败保留上次结果、主进程不可用不抛错；
 * - 宿主入口：openAttachmentDialog 首次挂载、关闭不重建、dispose 清理可重挂载、
 *   无 document 环境返回 false、关闭按钮更新显隐；
 * - 纯查询辅助：buildAttachmentGroups / resolveAttachmentReferences /
 *   countAttachmentReferences / normalizeAttachmentPathKey 的兼容与去重行为。
 *
 * mock 约定（TEST-11）：仅 stub 全局 `window.electron.ipcRenderer` / `window.api.config`，
 * 不 mock 业务模块；索引链路与生产一致（真实 useWorkspaceIndex + 归一化逻辑）。
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
    attachmentDialogState,
    buildAttachmentGroups,
    closeAttachmentDialog,
    countAttachmentReferences,
    disposeAttachmentHost,
    normalizeAttachmentPathKey,
    openAttachmentDialog,
    resolveAttachmentReferences,
    supportsAttachmentIndex
} from '../../../src/renderer/src/components/Markdown/attachments'
import AttachmentDialog from '../../../src/renderer/src/components/Markdown/attachments/AttachmentDialog.vue'
import { IPC } from '../../../src/shared/ipc-channels'
import type {
    WorkspaceAttachment,
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../../src/shared/types/workspace-index'

/* ==================== 快照夹具 ==================== */

const ROOT_PATH = 'C:\\ws'
const SOURCE_A_PATH = 'C:\\ws\\a.md'
const SOURCE_B_PATH = 'C:\\ws\\notes\\b.md'
const IMAGE_PATH = 'C:\\ws\\images\\a.png'
const PDF_PATH = 'C:\\ws\\docs\\report.pdf'
const MISSING_PATH = 'C:\\ws\\images\\ghost.png'

const FILE_A: WorkspaceIndexFile = {
    path: SOURCE_A_PATH,
    relativePath: 'a.md',
    name: 'a.md',
    title: 'A 笔记',
    tags: [],
    links: [],
    size: 128,
    mtimeMs: 1_700_000_000_000
}

const FILE_B: WorkspaceIndexFile = {
    path: SOURCE_B_PATH,
    relativePath: 'notes/b.md',
    name: 'b.md',
    title: 'B 笔记',
    tags: [],
    links: [],
    size: 256,
    mtimeMs: 1_700_000_100_000
}

/** 附件夹具（按 relativePath 升序，与主进程索引排序约定一致） */
const ATTACHMENTS: WorkspaceAttachment[] = [
    {
        path: PDF_PATH,
        relativePath: 'docs/report.pdf',
        exists: true,
        referencedBy: [SOURCE_B_PATH]
    },
    {
        path: IMAGE_PATH,
        relativePath: 'images/a.png',
        exists: true,
        referencedBy: [SOURCE_A_PATH, SOURCE_B_PATH]
    },
    {
        path: MISSING_PATH,
        relativePath: 'images/ghost.png',
        exists: false,
        referencedBy: [SOURCE_A_PATH]
    }
]

interface SnapshotOptions {
    files?: WorkspaceIndexFile[]
    attachments?: WorkspaceAttachment[]
    rootPath?: string
}

/** 构造索引快照（stats 按内容自动统计） */
function createSnapshot(options: SnapshotOptions = {}): WorkspaceIndexSnapshot {
    const files = options.files ?? [FILE_A, FILE_B]
    const attachments = options.attachments ?? ATTACHMENTS
    return {
        rootPath: options.rootPath ?? ROOT_PATH,
        generatedAt: 1_700_000_200_000,
        files,
        tags: [],
        missingLinks: [],
        attachments,
        stats: {
            fileCount: files.length,
            linkCount: files.reduce((sum, file) => sum + file.links.length, 0),
            missingCount: 0,
            ambiguousCount: 0,
            attachmentCount: attachments.length,
            missingAttachmentCount: attachments.filter((attachment) => !attachment.exists).length
        }
    }
}

/** 旧主进程返回的旧快照：没有 attachments 字段与附件统计字段 */
function createLegacySnapshot(): WorkspaceIndexSnapshot {
    const snapshot = createSnapshot()
    delete snapshot.attachments
    delete snapshot.stats.attachmentCount
    delete snapshot.stats.missingAttachmentCount
    return snapshot
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
 * - send 记录调用（OPEN_IN_EXPLORER 断言用）。
 */
function installIpc(indexResult: unknown = successResult()): IpcStub {
    const invoke = vi.fn()
    invoke.mockImplementation(async (channel: string): Promise<unknown> => {
        return channel === IPC.FILE.GET_WORKSPACE_INDEX ? indexResult : null
    })
    const send = vi.fn()
    const stub: IpcStub = {
        invoke,
        send,
        on: vi.fn(),
        removeListener: vi.fn()
    }
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

/** 打开对话框状态并挂载组件（打开即触发一次 refresh(false)） */
async function mountDialog(): Promise<VueWrapper> {
    attachmentDialogState.visible = true
    const wrapper = track(mount(AttachmentDialog, mountOptions))
    await flushPromises()
    await nextTick()
    return wrapper
}

beforeEach(() => {
    // 渲染层 i18n 初始化会读 window.api.config，必须提供替身（同 knowledge / writing-style 测试）
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn() }
    })
    installIpc()
    attachmentDialogState.visible = false
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
    disposeAttachmentHost()
    await nextTick()
    vi.unstubAllGlobals()
    attachmentDialogState.visible = false
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

/* ==================== 分组渲染 ==================== */

describe('附件分组渲染', () => {
    it('按缺失 / 正常分组渲染：缺失组在前，显示相对路径与引用来源数', async () => {
        const wrapper = await mountDialog()

        const sections = wrapper.findAll('.attachment-section')
        expect(sections).toHaveLength(2)
        expect(sections[0].classes()).toContain('attachment-section--missing')
        expect(sections[1].classes()).toContain('attachment-section--available')

        // 缺失组：1 条，带缺失徽标，引用 1 处
        const missingRows = wrapper.findAll('.attachment-row--missing')
        expect(missingRows).toHaveLength(1)
        expect(missingRows[0].find('.attachment-badge').text()).toContain('缺失')
        expect(missingRows[0].find('.attachment-path').text()).toBe('images/ghost.png')
        expect(missingRows[0].find('.attachment-ref-toggle').text()).toContain('1')

        // 正常组：2 条，顺序与快照一致
        const availableSection = wrapper.find('.attachment-section--available')
        expect(availableSection.findAll('.attachment-row')).toHaveLength(2)
        const availablePaths = availableSection
            .findAll('.attachment-path')
            .map((node) => node.text())
        expect(availablePaths).toEqual(['docs/report.pdf', 'images/a.png'])
        expect(availableSection.findAll('.attachment-row--missing')).toHaveLength(0)

        // 汇总：共 3 个附件（缺失 1 / 正常 2），引用来源共 4 处
        const summary = wrapper.find('.attachment-summary').text()
        expect(summary).toContain('3')
        expect(summary).toContain('缺失 1')
        expect(summary).toContain('正常 2')
        expect(summary).toContain('4')
    })

    it('引用来源列表默认收起，点击「N 处引用」展开来源文件（相对路径 + 标题）', async () => {
        const wrapper = await mountDialog()
        expect(wrapper.findAll('.attachment-refs')).toHaveLength(0)

        // 展开 images/a.png（正常组第 2 行，2 个来源）
        const availableRows = wrapper.findAll('.attachment-section--available .attachment-row')
        const toggle = availableRows[1].find('.attachment-ref-toggle')
        expect(toggle.text()).toContain('2')
        await toggle.trigger('click')

        const refs = wrapper.findAll('.attachment-refs')
        expect(refs).toHaveLength(1)
        expect(toggle.attributes('aria-expanded')).toBe('true')
        const refTexts = refs[0].findAll('.attachment-ref').map((node) => node.text())
        expect(refTexts.some((text) => text.includes('a.md') && text.includes('A 笔记'))).toBe(true)
        expect(
            refTexts.some((text) => text.includes('notes/b.md') && text.includes('B 笔记'))
        ).toBe(true)

        // 再次点击收起
        await toggle.trigger('click')
        expect(wrapper.findAll('.attachment-refs')).toHaveLength(0)
        expect(toggle.attributes('aria-expanded')).toBe('false')
    })

    it('同一时间只展开一个附件的引用来源', async () => {
        const wrapper = await mountDialog()
        const missingToggle = wrapper.find('.attachment-section--missing .attachment-ref-toggle')
        const availableRows = wrapper.findAll('.attachment-section--available .attachment-row')

        await missingToggle.trigger('click')
        expect(wrapper.findAll('.attachment-refs')).toHaveLength(1)

        await availableRows[0].find('.attachment-ref-toggle').trigger('click')
        expect(wrapper.findAll('.attachment-refs')).toHaveLength(1)
        // 原先缺失附件的展开项已收起
        expect(missingToggle.attributes('aria-expanded')).toBe('false')
    })
})

/* ==================== 资源管理器定位 ==================== */

describe('在资源管理器中显示', () => {
    it('点击「在资源管理器中显示」发送 OPEN_IN_EXPLORER（缺失附件发送自身绝对路径）', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog()

        const revealButtons = wrapper.findAll('.btn-reveal-attachment')
        expect(revealButtons).toHaveLength(3)

        // DOM 顺序：缺失组（ghost）→ 正常组（report.pdf、a.png）
        await revealButtons[0].trigger('click')
        expect(stub.send).toHaveBeenLastCalledWith(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, MISSING_PATH)

        await revealButtons[1].trigger('click')
        expect(stub.send).toHaveBeenLastCalledWith(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, PDF_PATH)

        await revealButtons[2].trigger('click')
        expect(stub.send).toHaveBeenLastCalledWith(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, IMAGE_PATH)
    })

    it('渲染层 IPC 不可用时给出可见失败提示而不抛错', async () => {
        const wrapper = await mountDialog()
        vi.stubGlobal('electron', undefined)
        await wrapper.findAll('.btn-reveal-attachment')[0].trigger('click')

        const hint = wrapper.find('.attachment-hint--error')
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toContain('无法在资源管理器中显示')
    })
})

/* ==================== 加载 / 刷新 / 状态 ==================== */

describe('索引加载、刷新与状态', () => {
    it('打开时 refresh(false)；刷新按钮 refresh(true)', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog()
        expect(stub.invoke).toHaveBeenCalledTimes(1)
        expect(stub.invoke.mock.calls[0][0]).toBe(IPC.FILE.GET_WORKSPACE_INDEX)
        expect(stub.invoke.mock.calls[0][1]).toEqual({ force: false })

        await wrapper.find('.btn-refresh-attachments').trigger('click')
        await flushPromises()
        await nextTick()
        expect(stub.invoke).toHaveBeenCalledTimes(2)
        expect(stub.invoke.mock.calls[1][0]).toBe(IPC.FILE.GET_WORKSPACE_INDEX)
        expect(stub.invoke.mock.calls[1][1]).toEqual({ force: true })
    })

    it('索引加载期间显示 loading 占位，完成后渲染分组', async () => {
        let resolveIndex!: (value: unknown) => void
        const pending = new Promise<unknown>((resolve) => {
            resolveIndex = resolve
        })
        const stub = installIpc()
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            return channel === IPC.FILE.GET_WORKSPACE_INDEX ? pending : null
        })

        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder').text()).toContain('正在加载工作区索引')

        resolveIndex(successResult())
        await flushPromises()
        await nextTick()
        expect(wrapper.findAll('.attachment-item')).toHaveLength(3)
    })

    it('INDEX_ERROR 显示错误态与重试按钮，重试强制刷新', async () => {
        const stub = installIpc({ ok: false, code: 'INDEX_ERROR' })
        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder--error').text()).toContain(
            '加载工作区索引失败'
        )

        await wrapper.find('.btn-retry-attachment').trigger('click')
        await flushPromises()
        await nextTick()
        expect(stub.invoke).toHaveBeenCalledTimes(2)
        expect(stub.invoke.mock.calls[1][1]).toEqual({ force: true })
    })

    it('NO_WORKSPACE 显示「先打开工作区」空态', async () => {
        installIpc({ ok: false, code: 'NO_WORKSPACE' })
        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder').text()).toContain('尚未打开工作区')
    })

    it('旧索引版本（快照无 attachments 字段）显示「索引版本不支持附件信息」空态', async () => {
        installIpc(successResult(createLegacySnapshot()))
        const wrapper = await mountDialog()

        expect(wrapper.find('.attachment-placeholder--unsupported').exists()).toBe(true)
        expect(wrapper.find('.attachment-placeholder').text()).toContain('附件信息')
        expect(wrapper.findAll('.attachment-item')).toHaveLength(0)
    })

    it('附件清单为空数组时显示「没有引用任何附件」空态', async () => {
        installIpc(successResult(createSnapshot({ attachments: [] })))
        const wrapper = await mountDialog()

        expect(wrapper.find('.attachment-placeholder--empty').exists()).toBe(true)
        expect(wrapper.find('.attachment-placeholder').text()).toContain('没有引用任何附件')
        expect(wrapper.findAll('.attachment-item')).toHaveLength(0)
    })

    it('空工作区（files 与 attachments 均为空）显示附件空态', async () => {
        installIpc(successResult(createSnapshot({ files: [], attachments: [] })))
        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder').text()).toContain('没有引用任何附件')
    })

    it('刷新失败保留上次快照并给出可见提示', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog()
        expect(wrapper.findAll('.attachment-item')).toHaveLength(3)

        stub.invoke.mockImplementation(async (): Promise<unknown> => {
            return { ok: false, code: 'INDEX_ERROR' }
        })
        await wrapper.find('.btn-refresh-attachments').trigger('click')
        await flushPromises()
        await nextTick()

        expect(wrapper.findAll('.attachment-item')).toHaveLength(3)
        expect(wrapper.find('.attachment-hint--error').text()).toContain('刷新索引失败')
    })

    it('主进程 IPC 不可用时不抛错并进入错误态', async () => {
        vi.stubGlobal('electron', undefined)
        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder--error').exists()).toBe(true)
    })
})

/* ==================== 宿主入口与关闭语义 ==================== */

describe('宿主入口 openAttachmentDialog / closeAttachmentDialog / disposeAttachmentHost', () => {
    it('首次调用挂载宿主并打开；关闭不重建；dispose 清理后可重新打开', async () => {
        installIpc()
        expect(await openAttachmentDialog()).toBe(true)
        await flushPromises()
        await nextTick()
        expect(attachmentDialogState.visible).toBe(true)
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(1)
        expect(document.querySelectorAll('.attachment-item').length).toBeGreaterThan(0)

        closeAttachmentDialog()
        expect(attachmentDialogState.visible).toBe(false)
        expect(await openAttachmentDialog()).toBe(true)
        await flushPromises()
        // 关闭只切显隐，不重新 createApp / 追加容器
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(1)

        disposeAttachmentHost()
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(0)
        expect(attachmentDialogState.visible).toBe(false)

        // dispose 后再次打开会重新挂载（幂等可重入）
        expect(await openAttachmentDialog()).toBe(true)
        await flushPromises()
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(1)
        expect(document.querySelectorAll('.attachment-item').length).toBeGreaterThan(0)
    })

    it('无 document 环境（宿主无法挂载）返回 false 且不抛错', async () => {
        const savedDocument = globalThis.document
        vi.stubGlobal('document', undefined)
        try {
            await expect(openAttachmentDialog()).resolves.toBe(false)
        } finally {
            vi.stubGlobal('document', savedDocument)
        }
        expect(attachmentDialogState.visible).toBe(false)
    })

    it('关闭按钮更新对话框显隐状态', async () => {
        installIpc()
        const wrapper = await mountDialog()
        await wrapper.find('.btn-close-attachment').trigger('click')
        expect(attachmentDialogState.visible).toBe(false)
    })
})

/* ==================== 纯查询辅助 ==================== */

describe('纯查询辅助（旧快照兼容 / 去重 / 展示映射）', () => {
    it('supportsAttachmentIndex 区分「旧快照无字段」与「空数组」', () => {
        expect(supportsAttachmentIndex(null)).toBe(false)
        expect(supportsAttachmentIndex(createLegacySnapshot())).toBe(false)
        expect(supportsAttachmentIndex(createSnapshot({ attachments: [] }))).toBe(true)
        expect(supportsAttachmentIndex(createSnapshot())).toBe(true)
    })

    it('buildAttachmentGroups 统计缺失 / 正常 / 引用总数', () => {
        const groups = buildAttachmentGroups(createSnapshot())
        expect(groups.supported).toBe(true)
        expect(groups.missing.map((item) => item.relativePath)).toEqual(['images/ghost.png'])
        expect(groups.available.map((item) => item.relativePath)).toEqual([
            'docs/report.pdf',
            'images/a.png'
        ])
        expect(groups.total).toBe(3)
        expect(groups.referenceTotal).toBe(4)
    })

    it('buildAttachmentGroups 对旧快照与空快照返回不支持 / 空组', () => {
        expect(buildAttachmentGroups(null)).toEqual({
            supported: false,
            missing: [],
            available: [],
            total: 0,
            referenceTotal: 0
        })
        expect(buildAttachmentGroups(createLegacySnapshot()).supported).toBe(false)
    })

    it('buildAttachmentGroups 按绝对路径（大小写不敏感去重）合并重复附件与引用来源', () => {
        const snapshot = createSnapshot({
            attachments: [
                {
                    path: IMAGE_PATH,
                    relativePath: 'images/a.png',
                    exists: true,
                    referencedBy: [SOURCE_A_PATH, SOURCE_A_PATH]
                },
                {
                    path: 'c:\\WS\\images\\A.png',
                    relativePath: 'images/a.png',
                    exists: true,
                    referencedBy: [SOURCE_B_PATH]
                }
            ]
        })
        const groups = buildAttachmentGroups(snapshot)
        expect(groups.total).toBe(1)
        expect(groups.available[0].referencedBy).toHaveLength(2)
        expect(groups.referenceTotal).toBe(2)
        expect(countAttachmentReferences(groups.available[0])).toBe(2)
    })

    it('buildAttachmentGroups 缺失判定取严格 exists===true（缺字段按缺失）', () => {
        const snapshot = createSnapshot({
            attachments: [
                {
                    path: 'C:\\ws\\images\\no-exists-field.png',
                    relativePath: 'images/no-exists-field.png',
                    // 故意省略 exists：旧结构/异常载荷
                    referencedBy: []
                } as unknown as WorkspaceAttachment
            ]
        })
        const groups = buildAttachmentGroups(snapshot)
        expect(groups.total).toBe(1)
        expect(groups.missing).toHaveLength(1)
        expect(groups.available).toHaveLength(0)
    })

    it('resolveAttachmentReferences 命中快照文件时返回相对路径与标题', () => {
        const snapshot = createSnapshot()
        const image = snapshot.attachments?.find((item) => item.path === IMAGE_PATH)
        expect(image).toBeDefined()
        const refs = resolveAttachmentReferences(snapshot, image!)
        expect(refs).toHaveLength(2)
        expect(refs[0]).toMatchObject({
            path: SOURCE_A_PATH,
            relativePath: 'a.md',
            title: 'A 笔记'
        })
        expect(refs[1]).toMatchObject({
            path: SOURCE_B_PATH,
            relativePath: 'notes/b.md',
            title: 'B 笔记'
        })
    })

    it('resolveAttachmentReferences 未命中快照文件时回退裁剪相对路径 + 文件名', () => {
        const snapshot = createSnapshot()
        const missingSource = 'C:\\ws\\gone\\old.md'
        const attachment: WorkspaceAttachment = {
            path: IMAGE_PATH,
            relativePath: 'images/a.png',
            exists: true,
            referencedBy: [missingSource, missingSource.toUpperCase()]
        }
        const refs = resolveAttachmentReferences(snapshot, attachment)
        // 大小写不敏感去重后只剩 1 条；工作区前缀被裁剪，标题回退文件名
        expect(refs).toHaveLength(1)
        expect(refs[0].path).toBe(missingSource)
        expect(refs[0].relativePath).toBe('gone/old.md')
        expect(refs[0].title).toBe('old.md')
    })

    it('normalizeAttachmentPathKey 统一分隔符与大小写', () => {
        expect(normalizeAttachmentPathKey('C:\\WS\\Images\\A.PNG')).toBe('c:/ws/images/a.png')
        expect(normalizeAttachmentPathKey('c:/ws/images/a.png')).toBe('c:/ws/images/a.png')
    })
})
