// @vitest-environment jsdom
/**
 * B5 附件管理对话框组件契约测试（jsdom + @vue/test-utils）
 *
 * 覆盖口径（既有 25 用例保持，2026-11-22 扩展孤儿审计 / 回收站 / 重命名）：
 * - 分组渲染：缺失（exists=false）组在前、正常组在后；相对路径 / 引用来源数 / 汇总文案；
 * - 引用来源展开：行内「N 处引用」按钮展开来源文件列表（相对路径 + 标题），再次点击收起；
 * - 资源管理器定位：点击「在资源管理器中显示」发送既有
 *   `IPC.FILE_MANAGER.OPEN_IN_EXPLORER`（携带附件绝对路径），缺失附件同样发送自身路径；
 * - 索引加载：打开 refresh(false)、刷新/重试 refresh(true)、loading 占位、INDEX_ERROR +
 *   重试、NO_WORKSPACE、旧索引版本（快照无 attachments 字段）空态、空附件清单空态、
 *   刷新失败保留上次结果、主进程不可用不抛错；
 * - 孤儿审计（新增）：打开时与索引并行拉取审计（无参数）、孤儿列表相对路径/大小/mtime、
 *   空审计、审计失败 + 重新审计、NO_WORKSPACE、旧主进程无字段（unsupported）、截断提示；
 * - 选择 / 回收站（新增）：单选、全选/取消、刷新后剔除失效选择、对话框内二次确认
 *   （不调用 window.confirm）、确认后传绝对路径数组、成功/部分失败/整体失败、无 IPC 容错、
 *   完成后刷新索引 + 审计；
 * - 重命名（新增）：正常附件行重命名按钮、默认文件名不含扩展名、RENAME_ATTACHMENT 参数、
 *   成功刷新、ALREADY_EXISTS / INVALID_NAME 可见提示、空输入不调用 IPC、取消、无 IPC 容错、
 *   来源文件引用写回失败提示；
 * - 宿主入口：openAttachmentDialog 首次挂载、关闭不重建、dispose 清理可重挂载、
 *   无 document 环境返回 false、关闭按钮更新显隐；
 * - 纯辅助：既有分组/引用解析，以及新增审计/回收站/重命名归一化、格式化、选择集函数。
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
    defaultRenameBaseName,
    describeAttachmentRenameFailure,
    describeAttachmentTrashFailure,
    disposeAttachmentHost,
    formatAttachmentMtime,
    formatAttachmentSize,
    isAllOrphanSelected,
    normalizeAttachmentAuditResult,
    normalizeAttachmentPathKey,
    normalizeAttachmentRenameResult,
    normalizeAttachmentTrashResult,
    openAttachmentDialog,
    orphanSelectionKey,
    prepareAttachmentRename,
    pruneSelectedKeys,
    resolveAttachmentReferences,
    selectAllOrphanKeys,
    sumAttachmentSizes,
    supportsAttachmentIndex,
    toggleOrphanSelected
} from '../../../src/renderer/src/components/Markdown/attachments'
import AttachmentDialog from '../../../src/renderer/src/components/Markdown/attachments/AttachmentDialog.vue'
import { t } from '../../../src/renderer/src/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'
import type { AttachmentAuditEntry } from '../../../src/shared/types/ipc'
import type {
    WorkspaceAttachment,
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../../src/shared/types/workspace-index'

/**
 * 与组件内 `tOr` 同口径解析文案（词典有键用词典，否则用中文兜底）。
 *
 * 该对话框新增文案由主控补 `editorUi.attachments.*` 词典；测试若写死中文兜底，
 * 补词典后可能因措辞调整而失败。这里按「词典优先 + 兜底」解析期望值，保证补词典
 * 前后都断言真实渲染文案（同时能捕获组件用错键 / 漏传参数）。
 */
function message(key: string, fallback: string, params?: Record<string, string | number>): string {
    const text = t(key, params)
    if (text !== key) {
        return text
    }
    if (params === undefined) {
        return fallback
    }
    return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name])
    )
}

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

/** 孤儿审计夹具（默认空列表，既有分组用例不受孤儿区影响） */
const ORPHAN_PNG_PATH = 'C:\\ws\\images\\orphan.png'
const ORPHAN_ZIP_PATH = 'C:\\ws\\assets\\old.zip'

const ORPHANS: AttachmentAuditEntry[] = [
    {
        path: ORPHAN_PNG_PATH,
        relativePath: 'images/orphan.png',
        size: 2048,
        mtimeMs: 1_700_000_300_000
    },
    {
        path: ORPHAN_ZIP_PATH,
        relativePath: 'assets/old.zip',
        size: 5_242_880,
        mtimeMs: 1_700_000_400_000
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

/** 默认主进程索引返回值：成功 + 命中缓存 */
function successResult(snapshot: WorkspaceIndexSnapshot = createSnapshot()): unknown {
    return { ok: true, snapshot, cached: true }
}

/** 默认主进程审计返回值：成功 + 空孤儿列表 */
function auditSuccessResult(
    orphans: AttachmentAuditEntry[] = [],
    overrides: Record<string, unknown> = {}
): unknown {
    return {
        ok: true,
        orphans,
        referencedCount: ATTACHMENTS.length,
        totalCount: ATTACHMENTS.length + orphans.length,
        truncated: false,
        ...overrides
    }
}

/* ==================== IPC 替身 ==================== */

interface IpcStub {
    invoke: Mock
    send: Mock
    on: Mock
    removeListener: Mock
}

interface IpcOverrides {
    audit?: unknown
    trash?: unknown
    rename?: unknown
}

/**
 * 安装受限 `window.electron.ipcRenderer` 替身：
 * - invoke 按通道返回给定结果（索引 / 审计 / 回收站 / 重命名），其余通道返回 null；
 * - send 记录调用（OPEN_IN_EXPLORER 断言用）。
 */
function installIpc(indexResult: unknown = successResult(), overrides: IpcOverrides = {}): IpcStub {
    const auditResult = 'audit' in overrides ? overrides.audit : auditSuccessResult()
    const trashResult = 'trash' in overrides ? overrides.trash : null
    const renameResult = 'rename' in overrides ? overrides.rename : null
    const invoke = vi.fn()
    invoke.mockImplementation(async (channel: string): Promise<unknown> => {
        if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
            return indexResult
        }
        if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
            return auditResult
        }
        if (channel === IPC.FILE.TRASH_ATTACHMENTS) {
            return trashResult
        }
        if (channel === IPC.FILE.RENAME_ATTACHMENT) {
            return renameResult
        }
        return null
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

/** 取某通道的全部 invoke 调用（含参数），避免受并行审计调用次数影响 */
function callsFor(stub: IpcStub, channel: string): unknown[][] {
    return stub.invoke.mock.calls.filter((call) => call[0] === channel)
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

async function settle(): Promise<void> {
    await flushPromises()
    await nextTick()
}

/** 打开对话框状态并挂载组件（打开即并行触发一次 refresh(false) + 审计） */
async function mountDialog(): Promise<VueWrapper> {
    attachmentDialogState.visible = true
    const wrapper = track(mount(AttachmentDialog, mountOptions))
    await settle()
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

/* ==================== 分组渲染（既有） ==================== */

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

/* ==================== 资源管理器定位（既有） ==================== */

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

/* ==================== 索引加载 / 刷新 / 状态（既有） ==================== */

describe('索引加载、刷新与状态', () => {
    it('打开时 refresh(false)；刷新按钮 refresh(true)', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog()
        const indexCalls = callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)
        expect(indexCalls).toHaveLength(1)
        expect(indexCalls[0][1]).toEqual({ force: false })
        // 打开时并行拉取孤儿审计（新增通道，无参数）
        const auditCalls = callsFor(stub, IPC.FILE.GET_ATTACHMENT_AUDIT)
        expect(auditCalls).toHaveLength(1)
        expect(auditCalls[0]).toEqual([IPC.FILE.GET_ATTACHMENT_AUDIT])

        await wrapper.find('.btn-refresh-attachments').trigger('click')
        await settle()
        expect(callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)).toHaveLength(2)
        expect(callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)[1][1]).toEqual({ force: true })
        // 刷新索引同时重新拉取审计
        expect(callsFor(stub, IPC.FILE.GET_ATTACHMENT_AUDIT)).toHaveLength(2)
    })

    it('索引加载期间显示 loading 占位，完成后渲染分组', async () => {
        let resolveIndex!: (value: unknown) => void
        const pending = new Promise<unknown>((resolve) => {
            resolveIndex = resolve
        })
        const stub = installIpc()
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
                return pending
            }
            if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
                return auditSuccessResult()
            }
            return null
        })

        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder').text()).toContain('正在加载工作区索引')

        resolveIndex(successResult())
        await settle()
        expect(wrapper.findAll('.attachment-item')).toHaveLength(3)
    })

    it('INDEX_ERROR 显示错误态与重试按钮，重试强制刷新', async () => {
        const stub = installIpc({ ok: false, code: 'INDEX_ERROR' })
        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder--error').text()).toContain(
            '加载工作区索引失败'
        )

        await wrapper.find('.btn-retry-attachment').trigger('click')
        await settle()
        const indexCalls = callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)
        expect(indexCalls).toHaveLength(2)
        expect(indexCalls[1][1]).toEqual({ force: true })
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
        await settle()

        expect(wrapper.findAll('.attachment-item')).toHaveLength(3)
        expect(wrapper.find('.attachment-hint--error').text()).toContain('刷新索引失败')
    })

    it('主进程 IPC 不可用时不抛错并进入错误态', async () => {
        vi.stubGlobal('electron', undefined)
        const wrapper = await mountDialog()
        expect(wrapper.find('.attachment-placeholder--error').exists()).toBe(true)
    })
})

/* ==================== 孤儿审计（新增） ==================== */

describe('孤儿附件审计', () => {
    it('打开时与索引并行拉取审计，审计通道不传参数', async () => {
        const stub = installIpc(successResult(), { audit: auditSuccessResult(ORPHANS) })
        await mountDialog()

        const indexCalls = callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)
        const auditCalls = callsFor(stub, IPC.FILE.GET_ATTACHMENT_AUDIT)
        expect(indexCalls).toHaveLength(1)
        expect(auditCalls).toHaveLength(1)
        expect(auditCalls[0]).toEqual([IPC.FILE.GET_ATTACHMENT_AUDIT])
    })

    it('孤儿区渲染相对路径、格式化大小、mtime 与多选框', async () => {
        installIpc(successResult(), { audit: auditSuccessResult(ORPHANS) })
        const wrapper = await mountDialog()

        expect(wrapper.find('.attachment-orphan-title').text()).toContain(
            message('editorUi.attachments.titleOrphans', '孤儿附件（{count}）', { count: 2 })
        )
        const items = wrapper.findAll('.attachment-orphan-item')
        expect(items).toHaveLength(2)
        expect(items[0].find('.attachment-orphan-path').text()).toBe('images/orphan.png')
        const sizes = wrapper.findAll('.attachment-orphan-size').map((node) => node.text())
        expect(sizes).toEqual(['2.0 KB', '5.0 MB'])
        const mtimes = wrapper.findAll('.attachment-orphan-mtime').map((node) => node.text())
        expect(mtimes[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        expect(wrapper.findAll('.attachment-orphan-check')).toHaveLength(2)
        expect(wrapper.findAll('.attachment-orphan-select-all')).toHaveLength(1)
        // 与「正常附件」分组互不混淆
        expect(wrapper.findAll('.attachment-item')).toHaveLength(3)
    })

    it('审计结果为空时显示「没有发现孤儿附件」', async () => {
        installIpc()
        const wrapper = await mountDialog()

        expect(wrapper.find('.attachment-audit-status').text()).toContain(
            message('editorUi.attachments.emptyOrphans', '没有发现孤儿附件')
        )
        expect(wrapper.findAll('.attachment-orphan-item')).toHaveLength(0)
        expect(wrapper.find('.btn-trash-orphans').exists()).toBe(false)
    })

    it('审计失败显示可见错误与重新审计按钮，点击后重新拉取审计', async () => {
        const stub = installIpc(successResult(), { audit: { ok: false, code: 'AUDIT_ERROR' } })
        const wrapper = await mountDialog()

        const failed = wrapper.find('.attachment-audit-status--error')
        expect(failed.exists()).toBe(true)
        expect(failed.text()).toContain(
            message('editorUi.attachments.auditFailed', '孤儿附件审计失败，请稍后重试')
        )
        expect(wrapper.find('.btn-retry-audit').exists()).toBe(true)

        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
                return successResult()
            }
            if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
                return auditSuccessResult(ORPHANS)
            }
            return null
        })
        await wrapper.find('.btn-retry-audit').trigger('click')
        await settle()

        expect(callsFor(stub, IPC.FILE.GET_ATTACHMENT_AUDIT)).toHaveLength(2)
        expect(wrapper.findAll('.attachment-orphan-item')).toHaveLength(2)
    })

    it('审计明确 NO_WORKSPACE 时显示无工作区提示', async () => {
        installIpc(successResult(), { audit: { ok: false, code: 'NO_WORKSPACE' } })
        const wrapper = await mountDialog()

        expect(wrapper.find('.attachment-audit-status--error').text()).toContain(
            message('editorUi.attachments.noWorkspaceOrphans', '尚未打开工作区，无法审计孤儿附件')
        )
    })

    it('旧主进程返回 ok 但缺少 orphans 字段时显示「不支持孤儿审计」而不是空审计', async () => {
        installIpc(successResult(), { audit: { ok: true } })
        const wrapper = await mountDialog()

        const status = wrapper.find('.attachment-audit-status').text()
        expect(status).toContain(
            message(
                'editorUi.attachments.auditUnsupported',
                '当前主进程版本不支持孤儿审计，请更新应用后重试'
            )
        )
        // 不能误报成「没有发现孤儿附件」（旧主进程字段未知 ≠ 空审计）
        expect(status).not.toContain(
            message('editorUi.attachments.emptyOrphans', '没有发现孤儿附件')
        )
        expect(wrapper.findAll('.attachment-orphan-item')).toHaveLength(0)
    })

    it('审计截断时显示截断提示', async () => {
        installIpc(successResult(), {
            audit: auditSuccessResult(ORPHANS, { truncated: true })
        })
        const wrapper = await mountDialog()

        expect(wrapper.find('.attachment-orphan-badge').text()).toContain(
            message('editorUi.attachments.auditTruncated', '审计结果已截断，仅显示部分孤儿附件')
        )
    })
})

/* ==================== 孤儿选择（新增） ==================== */

describe('孤儿附件选择', () => {
    it('勾选单个孤儿后「移入回收站」按钮可用', async () => {
        installIpc(successResult(), { audit: auditSuccessResult(ORPHANS) })
        const wrapper = await mountDialog()

        const trashButton = wrapper.find('.btn-trash-orphans')
        expect(trashButton.attributes('disabled')).toBeDefined()

        await wrapper.findAll('.attachment-orphan-check')[0].setValue(true)
        expect(trashButton.attributes('disabled')).toBeUndefined()
        expect(wrapper.find('.attachment-orphan-selected').text()).toContain(
            message('editorUi.attachments.selectedCount', '已选 {selected} 个 / 共 {total} 个', {
                selected: 1,
                total: 2
            })
        )
    })

    it('全选复选框选中全部孤儿，取消后清空选择', async () => {
        installIpc(successResult(), { audit: auditSuccessResult(ORPHANS) })
        const wrapper = await mountDialog()

        const selectAll = wrapper.find('.attachment-orphan-select-all')
        await selectAll.setValue(true)
        const checks = wrapper.findAll('.attachment-orphan-check')
        expect(checks.every((check) => (check.element as HTMLInputElement).checked)).toBe(true)
        expect(wrapper.find('.attachment-orphan-selected').text()).toContain(
            message('editorUi.attachments.selectedCount', '已选 {selected} 个 / 共 {total} 个', {
                selected: 2,
                total: 2
            })
        )

        await selectAll.setValue(false)
        const unchecked = wrapper.findAll('.attachment-orphan-check')
        expect(unchecked.every((check) => !(check.element as HTMLInputElement).checked)).toBe(true)
        expect(wrapper.find('.btn-trash-orphans').attributes('disabled')).toBeDefined()
    })

    it('重新审计后剔除已不存在的选择项', async () => {
        const stub = installIpc(successResult(), { audit: auditSuccessResult(ORPHANS) })
        const wrapper = await mountDialog()

        await wrapper.find('.attachment-orphan-select-all').setValue(true)
        expect(wrapper.find('.attachment-orphan-selected').text()).toContain(
            message('editorUi.attachments.selectedCount', '已选 {selected} 个 / 共 {total} 个', {
                selected: 2,
                total: 2
            })
        )

        // 主进程重新审计后返回空列表（例如孤儿已被外部处理）
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
                return successResult()
            }
            if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
                return auditSuccessResult()
            }
            return null
        })
        await wrapper.find('.btn-refresh-attachments').trigger('click')
        await settle()

        expect(wrapper.findAll('.attachment-orphan-item')).toHaveLength(0)
        expect(wrapper.find('.attachment-orphan-selected').exists()).toBe(false)
    })
})

/* ==================== 移入回收站（新增） ==================== */

describe('批量移入回收站', () => {
    /** 打开含 2 个孤儿的对话框并全选，返回 wrapper 与 IPC 替身 */
    async function mountWithSelection(): Promise<{ wrapper: VueWrapper; stub: IpcStub }> {
        const stub = installIpc(successResult(), { audit: auditSuccessResult(ORPHANS) })
        const wrapper = await mountDialog()
        await wrapper.find('.attachment-orphan-select-all').setValue(true)
        return { wrapper, stub }
    }

    it('点击「移入回收站」进入对话框内二次确认，不立即调用 IPC', async () => {
        const { wrapper, stub } = await mountWithSelection()
        expect(wrapper.find('.attachment-confirm').exists()).toBe(false)

        await wrapper.find('.btn-trash-orphans').trigger('click')
        expect(wrapper.find('.attachment-confirm').exists()).toBe(true)
        expect(wrapper.find('.attachment-confirm-message').text()).toContain(
            message(
                'editorUi.attachments.trashConfirmMessage',
                '确认将 {count} 个孤儿附件（共 {size}）移入系统回收站？',
                { count: 2, size: '5.0 MB' }
            )
        )
        expect(callsFor(stub, IPC.FILE.TRASH_ATTACHMENTS)).toHaveLength(0)
    })

    it('取消二次确认不调用 TRASH_ATTACHMENTS 并保留勾选', async () => {
        const { wrapper, stub } = await mountWithSelection()
        await wrapper.find('.btn-trash-orphans').trigger('click')
        await wrapper.find('.btn-cancel-trash').trigger('click')

        expect(wrapper.find('.attachment-confirm').exists()).toBe(false)
        expect(callsFor(stub, IPC.FILE.TRASH_ATTACHMENTS)).toHaveLength(0)
        expect(wrapper.find('.attachment-orphan-selected').text()).toContain(
            message('editorUi.attachments.selectedCount', '已选 {selected} 个 / 共 {total} 个', {
                selected: 2,
                total: 2
            })
        )
    })

    it('确认后调用 TRASH_ATTACHMENTS 传入选中孤儿的绝对路径数组', async () => {
        const { wrapper, stub } = await mountWithSelection()
        await wrapper.find('.btn-trash-orphans').trigger('click')
        await wrapper.find('.btn-confirm-trash').trigger('click')
        await settle()

        const trashCalls = callsFor(stub, IPC.FILE.TRASH_ATTACHMENTS)
        expect(trashCalls).toHaveLength(1)
        expect(trashCalls[0][1]).toEqual([ORPHAN_PNG_PATH, ORPHAN_ZIP_PATH])
    })

    it('全部成功时显示成功提示并刷新索引与审计', async () => {
        const { wrapper, stub } = await mountWithSelection()
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
                return successResult()
            }
            if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
                return auditSuccessResult()
            }
            if (channel === IPC.FILE.TRASH_ATTACHMENTS) {
                return { ok: true, trashed: 2, failed: [] }
            }
            return null
        })

        await wrapper.find('.btn-trash-orphans').trigger('click')
        await wrapper.find('.btn-confirm-trash').trigger('click')
        await settle()

        expect(wrapper.find('.attachment-op-status--ok').text()).toContain(
            message('editorUi.attachments.trashSuccess', '已将 {count} 个孤儿附件移入系统回收站', {
                count: 2
            })
        )
        // 完成后刷新索引（force）+ 重新审计
        const indexCalls = callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)
        expect(indexCalls).toHaveLength(2)
        expect(indexCalls[1][1]).toEqual({ force: true })
        expect(callsFor(stub, IPC.FILE.GET_ATTACHMENT_AUDIT)).toHaveLength(2)
        expect(wrapper.findAll('.attachment-orphan-item')).toHaveLength(0)
    })

    it('部分失败时逐项展示失败原因，成功项不回滚且仍刷新', async () => {
        const { wrapper, stub } = await mountWithSelection()
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
                return successResult()
            }
            if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
                return auditSuccessResult()
            }
            if (channel === IPC.FILE.TRASH_ATTACHMENTS) {
                return {
                    ok: true,
                    trashed: 1,
                    failed: [{ path: ORPHAN_ZIP_PATH, reason: 'STILL_REFERENCED' }]
                }
            }
            return null
        })

        await wrapper.find('.btn-trash-orphans').trigger('click')
        await wrapper.find('.btn-confirm-trash').trigger('click')
        await settle()

        const status = wrapper.find('.attachment-op-status--error')
        expect(status.text()).toContain(
            message(
                'editorUi.attachments.trashPartial',
                '已移入回收站 {trashed} 个，失败 {failed} 个',
                { trashed: 1, failed: 1 }
            )
        )
        const failures = status.findAll('.attachment-op-failures li')
        expect(failures).toHaveLength(1)
        expect(failures[0].text()).toContain(ORPHAN_ZIP_PATH)
        expect(failures[0].text()).toContain(
            message('editorUi.attachments.trashReasonStillReferenced', '仍被 Markdown 引用')
        )
        expect(callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)).toHaveLength(2)
    })

    it('整体失败时显示失败提示且不刷新索引', async () => {
        const { wrapper, stub } = await mountWithSelection()
        stub.invoke.mockImplementation(async (channel: string): Promise<unknown> => {
            if (channel === IPC.FILE.GET_WORKSPACE_INDEX) {
                return successResult()
            }
            if (channel === IPC.FILE.GET_ATTACHMENT_AUDIT) {
                return auditSuccessResult(ORPHANS)
            }
            if (channel === IPC.FILE.TRASH_ATTACHMENTS) {
                return { ok: false, code: 'TRASH_ERROR' }
            }
            return null
        })

        await wrapper.find('.btn-trash-orphans').trigger('click')
        await wrapper.find('.btn-confirm-trash').trigger('click')
        await settle()

        expect(wrapper.find('.attachment-op-status--error').text()).toContain(
            message('editorUi.attachments.trashFailed', '移入回收站失败，请稍后重试')
        )
        expect(callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)).toHaveLength(1)
        // 失败保留勾选，便于重试
        expect(wrapper.find('.attachment-orphan-selected').text()).toContain(
            message('editorUi.attachments.selectedCount', '已选 {selected} 个 / 共 {total} 个', {
                selected: 2,
                total: 2
            })
        )
    })

    it('渲染层 IPC 不可用时移入回收站显示失败提示而不抛错', async () => {
        const { wrapper } = await mountWithSelection()
        vi.stubGlobal('electron', undefined)

        await wrapper.find('.btn-trash-orphans').trigger('click')
        await wrapper.find('.btn-confirm-trash').trigger('click')
        await settle()

        expect(wrapper.find('.attachment-op-status--error').text()).toContain(
            message('editorUi.attachments.trashFailed', '移入回收站失败，请稍后重试')
        )
    })
})

/* ==================== 附件重命名（新增） ==================== */

describe('附件重命名', () => {
    /** 打开对话框并点击第一个正常附件的重命名按钮（docs/report.pdf） */
    async function openRename(wrapper: VueWrapper): Promise<void> {
        const renameButtons = wrapper.findAll('.btn-rename-attachment')
        expect(renameButtons).toHaveLength(2)
        await renameButtons[0].trigger('click')
        await nextTick()
    }

    it('正常附件行渲染重命名按钮，输入框默认当前文件名不含扩展名', async () => {
        const wrapper = await mountDialog()
        await openRename(wrapper)

        const input = wrapper.find('.attachment-rename-input')
        expect(input.exists()).toBe(true)
        expect((input.element as HTMLInputElement).value).toBe('report')
        expect(wrapper.find('.attachment-rename-box').text()).toContain('docs/report.pdf')
    })

    it('确认重命名调用 RENAME_ATTACHMENT（oldPath + newName），成功后刷新并提示', async () => {
        const stub = installIpc(successResult(), {
            rename: {
                ok: true,
                newPath: 'C:\\ws\\docs\\report-final.pdf',
                updatedFiles: 2,
                replacements: 3,
                failedFiles: []
            }
        })
        const wrapper = await mountDialog()
        await openRename(wrapper)

        await wrapper.find('.attachment-rename-input').setValue('report-final')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()

        const renameCalls = callsFor(stub, IPC.FILE.RENAME_ATTACHMENT)
        expect(renameCalls).toHaveLength(1)
        expect(renameCalls[0][1]).toBe(PDF_PATH)
        expect(renameCalls[0][2]).toBe('report-final')
        expect(wrapper.find('.attachment-op-status--ok').text()).toContain(
            message(
                'editorUi.attachments.renameSuccess',
                '已重命名为 {name}，并更新 {files} 个文件 / {replacements} 处引用',
                { name: 'report-final', files: 2, replacements: 3 }
            )
        )
        expect(wrapper.find('.attachment-rename-box').exists()).toBe(false)
        const indexCalls = callsFor(stub, IPC.FILE.GET_WORKSPACE_INDEX)
        expect(indexCalls).toHaveLength(2)
        expect(indexCalls[1][1]).toEqual({ force: true })
        expect(callsFor(stub, IPC.FILE.GET_ATTACHMENT_AUDIT)).toHaveLength(2)
    })

    it('重命名冲突（ALREADY_EXISTS）显示可见冲突提示并保留输入', async () => {
        installIpc(successResult(), { rename: { ok: false, code: 'ALREADY_EXISTS' } })
        const wrapper = await mountDialog()
        await openRename(wrapper)

        await wrapper.find('.attachment-rename-input').setValue('images')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()

        const error = wrapper.find('.attachment-rename-error')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain(
            message('editorUi.attachments.renameConflict', '目标名称已存在，请换一个名称')
        )
        expect((wrapper.find('.attachment-rename-input').element as HTMLInputElement).value).toBe(
            'images'
        )
    })

    it('重命名名称非法（INVALID_NAME）显示可见提示', async () => {
        installIpc(successResult(), { rename: { ok: false, code: 'INVALID_NAME' } })
        const wrapper = await mountDialog()
        await openRename(wrapper)

        // 含平台非法字符（但不含路径分隔符）：前端放行、由主进程返回 INVALID_NAME
        await wrapper.find('.attachment-rename-input').setValue('bad?name')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()

        expect(wrapper.find('.attachment-rename-error').text()).toContain(
            message(
                'editorUi.attachments.renameInvalidName',
                '文件名不合法（不能包含路径分隔符或特殊字符）'
            )
        )
    })

    it('前端校验：空名称与含路径分隔符的输入不调用 IPC', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog()
        await openRename(wrapper)

        await wrapper.find('.attachment-rename-input').setValue('   ')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()
        expect(wrapper.find('.attachment-rename-error').text()).toContain(
            message('editorUi.attachments.renameNameRequired', '请输入新文件名')
        )
        expect(callsFor(stub, IPC.FILE.RENAME_ATTACHMENT)).toHaveLength(0)

        await wrapper.find('.attachment-rename-input').setValue('a/b')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()
        expect(wrapper.find('.attachment-rename-error').text()).toContain(
            message(
                'editorUi.attachments.renameInvalidName',
                '文件名不合法（不能包含路径分隔符或特殊字符）'
            )
        )
        expect(callsFor(stub, IPC.FILE.RENAME_ATTACHMENT)).toHaveLength(0)
    })

    it('取消重命名不调用 IPC 并收起输入框', async () => {
        const stub = installIpc()
        const wrapper = await mountDialog()
        await openRename(wrapper)

        await wrapper.find('.btn-cancel-rename').trigger('click')
        await nextTick()

        expect(wrapper.find('.attachment-rename-box').exists()).toBe(false)
        expect(callsFor(stub, IPC.FILE.RENAME_ATTACHMENT)).toHaveLength(0)
    })

    it('渲染层 IPC 不可用时重命名显示失败提示而不抛错', async () => {
        const wrapper = await mountDialog()
        await openRename(wrapper)
        vi.stubGlobal('electron', undefined)

        await wrapper.find('.attachment-rename-input').setValue('new-name')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()

        expect(wrapper.find('.attachment-rename-error').text()).toContain(
            message('editorUi.attachments.renameFailed', '重命名失败，请稍后重试')
        )
    })

    it('成功但存在来源文件引用写回失败时提示需手动修复', async () => {
        installIpc(successResult(), {
            rename: {
                ok: true,
                newPath: 'C:\\ws\\docs\\report-final.pdf',
                updatedFiles: 1,
                replacements: 1,
                failedFiles: [SOURCE_B_PATH]
            }
        })
        const wrapper = await mountDialog()
        await openRename(wrapper)

        await wrapper.find('.attachment-rename-input').setValue('report-final')
        await wrapper.find('.btn-confirm-rename').trigger('click')
        await settle()

        const warning = wrapper.find('.attachment-op-warning')
        expect(warning.exists()).toBe(true)
        expect(warning.text()).toContain(
            message(
                'editorUi.attachments.renameRefUpdateFailed',
                '有 {count} 个来源文件引用更新失败（文件已改名，需手动修复）：{files}',
                { count: 1, files: [SOURCE_B_PATH].join('、') }
            )
        )
        expect(warning.text()).toContain(SOURCE_B_PATH)
    })
})

/* ==================== 宿主入口与关闭语义（既有） ==================== */

describe('宿主入口 openAttachmentDialog / closeAttachmentDialog / disposeAttachmentHost', () => {
    it('首次调用挂载宿主并打开；关闭不重建；dispose 清理后可重新打开', async () => {
        installIpc()
        expect(await openAttachmentDialog()).toBe(true)
        await settle()
        expect(attachmentDialogState.visible).toBe(true)
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(1)
        expect(document.querySelectorAll('.attachment-item').length).toBeGreaterThan(0)

        closeAttachmentDialog()
        expect(attachmentDialogState.visible).toBe(false)
        expect(await openAttachmentDialog()).toBe(true)
        await settle()
        // 关闭只切显隐，不重新 createApp / 追加容器
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(1)

        disposeAttachmentHost()
        expect(document.querySelectorAll('#baize-attachment-host')).toHaveLength(0)
        expect(attachmentDialogState.visible).toBe(false)

        // dispose 后再次打开会重新挂载（幂等可重入）
        expect(await openAttachmentDialog()).toBe(true)
        await settle()
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

/* ==================== 纯查询辅助（既有） ==================== */

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

/* ==================== 审计 / 回收站 / 重命名纯辅助（新增） ==================== */

describe('孤儿审计结果归一化（旧主进程 / 异常载荷兼容）', () => {
    it('非对象 / ok 缺失 / invoke 失败（null）统一按 INVALID_PAYLOAD 失败', () => {
        for (const raw of [null, undefined, 1, 'x', [], {}, { ok: 'yes' }]) {
            const view = normalizeAttachmentAuditResult(raw)
            expect(view.status).toBe('failed')
            expect(view.code).toBe('INVALID_PAYLOAD')
            expect(view.orphans).toEqual([])
        }
    })

    it('ok:false 透传白名单失败码，未知码统一 AUDIT_ERROR', () => {
        expect(normalizeAttachmentAuditResult({ ok: false, code: 'NO_WORKSPACE' }).code).toBe(
            'NO_WORKSPACE'
        )
        expect(normalizeAttachmentAuditResult({ ok: false, code: 'AUDIT_ERROR' }).code).toBe(
            'AUDIT_ERROR'
        )
        const unknown = normalizeAttachmentAuditResult({ ok: false, code: 'INDEX_ERROR' })
        expect(unknown.status).toBe('failed')
        expect(unknown.code).toBe('AUDIT_ERROR')
        expect(normalizeAttachmentAuditResult({ ok: false }).code).toBe('AUDIT_ERROR')
    })

    it('ok:true 缺少 orphans 字段视为旧版本不支持，不误报为空审计', () => {
        const view = normalizeAttachmentAuditResult({ ok: true, referencedCount: 2 })
        expect(view.status).toBe('unsupported')
        expect(view.orphans).toEqual([])
    })

    it('ok:true 空数组为合法空审计；异常条目过滤、重复路径去重', () => {
        expect(normalizeAttachmentAuditResult({ ok: true, orphans: [] }).status).toBe('ok')
        const view = normalizeAttachmentAuditResult({
            ok: true,
            orphans: [
                ORPHANS[0],
                { path: '', relativePath: 'bad', size: 1, mtimeMs: 1 },
                { path: 'C:\\WS\\images\\ORPHAN.png', relativePath: 'dup', size: 999 },
                {
                    path: ORPHAN_ZIP_PATH,
                    relativePath: 'assets/old.zip',
                    size: 'bad',
                    mtimeMs: -5
                }
            ],
            referencedCount: 3,
            totalCount: 'bad',
            truncated: true
        })
        expect(view.status).toBe('ok')
        expect(view.orphans).toHaveLength(2)
        expect(view.orphans[0].path).toBe(ORPHAN_PNG_PATH)
        expect(view.orphans[1]).toMatchObject({ path: ORPHAN_ZIP_PATH, size: 0, mtimeMs: 0 })
        expect(view.totalCount).toBe(0)
        expect(view.truncated).toBe(true)
    })
})

describe('附件大小 / 时间 / 重命名名称格式化', () => {
    it('formatAttachmentSize 按 B / KB / MB / GB 展示，异常值回退 —', () => {
        expect(formatAttachmentSize(0)).toBe('0 B')
        expect(formatAttachmentSize(512)).toBe('512 B')
        expect(formatAttachmentSize(1024)).toBe('1.0 KB')
        expect(formatAttachmentSize(1536)).toBe('1.5 KB')
        expect(formatAttachmentSize(5_242_880)).toBe('5.0 MB')
        expect(formatAttachmentSize(1_073_741_824)).toBe('1.0 GB')
        expect(formatAttachmentSize(Number.NaN)).toBe('—')
        expect(formatAttachmentSize(-1)).toBe('—')
    })

    it('formatAttachmentMtime 输出 YYYY-MM-DD HH:mm，异常值回退 —', () => {
        expect(formatAttachmentMtime(1_700_000_300_000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
        expect(formatAttachmentMtime(0)).toBe('—')
        expect(formatAttachmentMtime(Number.NaN)).toBe('—')
    })

    it('defaultRenameBaseName 去掉最后一个扩展名（含多点文件名）', () => {
        expect(defaultRenameBaseName('docs/report.pdf')).toBe('report')
        expect(defaultRenameBaseName('C:\\ws\\archive.tar.gz')).toBe('archive.tar')
        expect(defaultRenameBaseName('no-extension')).toBe('no-extension')
        expect(defaultRenameBaseName('.hidden')).toBe('.hidden')
        expect(defaultRenameBaseName('')).toBe('')
    })

    it('prepareAttachmentRename 只拦截空 / 路径分隔符 / 控制字符等明显非法输入', () => {
        expect(prepareAttachmentRename('  report-final  ')).toEqual({
            valid: true,
            newName: 'report-final',
            reason: null
        })
        expect(prepareAttachmentRename('')).toMatchObject({ valid: false, reason: 'empty' })
        expect(prepareAttachmentRename('   ')).toMatchObject({ valid: false, reason: 'empty' })
        expect(prepareAttachmentRename('a/b')).toMatchObject({ valid: false, reason: 'invalid' })
        expect(prepareAttachmentRename('a\\b')).toMatchObject({ valid: false, reason: 'invalid' })
        expect(prepareAttachmentRename('..')).toMatchObject({ valid: false, reason: 'invalid' })
        expect(prepareAttachmentRename('a\u0001b')).toMatchObject({
            valid: false,
            reason: 'invalid'
        })
    })
})

describe('孤儿选择集纯函数', () => {
    it('toggle / selectAll / prune / isAll 行为', () => {
        const keys = ['c:/ws/images/orphan.png', 'c:/ws/assets/old.zip']
        const one = toggleOrphanSelected(new Set<string>(), keys[0], true)
        expect(Array.from(one)).toEqual([keys[0]])
        expect(isAllOrphanSelected(one, keys)).toBe(false)
        const all = selectAllOrphanKeys(keys)
        expect(isAllOrphanSelected(all, keys)).toBe(true)
        expect(isAllOrphanSelected(new Set<string>(), keys)).toBe(false)
        expect(isAllOrphanSelected(new Set<string>(), [])).toBe(false)
        const removed = toggleOrphanSelected(all, keys[1], false)
        expect(Array.from(removed)).toEqual([keys[0]])
        expect(pruneSelectedKeys(all, [keys[0]])).toEqual(new Set([keys[0]]))
        expect(orphanSelectionKey({ path: 'C:\\WS\\Images\\Orphan.PNG' })).toBe(keys[0])
    })

    it('sumAttachmentSizes 忽略异常大小', () => {
        expect(sumAttachmentSizes(ORPHANS)).toBe(5_244_928)
        expect(sumAttachmentSizes([{ size: -1 }, { size: Number.NaN }, { size: 3 }])).toBe(3)
        expect(sumAttachmentSizes([])).toBe(0)
    })
})

describe('回收站 / 重命名结果归一化与文案映射', () => {
    it('normalizeAttachmentTrashResult：成功 / 部分失败 / 整体失败 / 异常载荷', () => {
        expect(normalizeAttachmentTrashResult({ ok: true, trashed: 2, failed: [] })).toEqual({
            ok: true,
            trashed: 2,
            failed: [],
            code: null,
            message: null
        })

        const partial = normalizeAttachmentTrashResult({
            ok: true,
            trashed: 1,
            failed: [
                { path: ORPHAN_ZIP_PATH, reason: 'STILL_REFERENCED' },
                { path: '', reason: 'TRASH_FAILED' },
                { path: ORPHAN_PNG_PATH, reason: 'UNKNOWN_REASON' }
            ]
        })
        expect(partial.ok).toBe(true)
        expect(partial.trashed).toBe(1)
        expect(partial.failed).toHaveLength(2)
        expect(partial.failed[0]).toEqual({ path: ORPHAN_ZIP_PATH, reason: 'STILL_REFERENCED' })
        // 未知原因回退 TRASH_FAILED
        expect(partial.failed[1]).toEqual({ path: ORPHAN_PNG_PATH, reason: 'TRASH_FAILED' })

        const failed = normalizeAttachmentTrashResult({ ok: false, code: 'TRASH_ERROR' })
        expect(failed.ok).toBe(false)
        expect(failed.code).toBe('TRASH_ERROR')
        // 未知码 / 异常载荷统一 TRASH_ERROR
        expect(normalizeAttachmentTrashResult({ ok: false, code: 'X' }).code).toBe('TRASH_ERROR')
        expect(normalizeAttachmentTrashResult(null).code).toBe('TRASH_ERROR')
    })

    it('normalizeAttachmentRenameResult：成功 / 失败码 / 异常载荷', () => {
        const success = normalizeAttachmentRenameResult({
            ok: true,
            newPath: 'C:\\ws\\docs\\new.pdf',
            updatedFiles: 2,
            replacements: 3,
            failedFiles: [SOURCE_A_PATH, '', 42]
        })
        expect(success.ok).toBe(true)
        if (success.ok) {
            expect(success.updatedFiles).toBe(2)
            expect(success.replacements).toBe(3)
            expect(success.failedFiles).toEqual([SOURCE_A_PATH])
        }

        const conflict = normalizeAttachmentRenameResult({ ok: false, code: 'ALREADY_EXISTS' })
        expect(conflict).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' })
        expect(normalizeAttachmentRenameResult({ ok: false, code: 'NOPE' })).toMatchObject({
            ok: false,
            code: 'RENAME_FAILED'
        })
        expect(normalizeAttachmentRenameResult(undefined)).toMatchObject({
            ok: false,
            code: 'RENAME_FAILED'
        })
    })

    it('describeAttachmentTrashFailure / describeAttachmentRenameFailure 返回建议键与中文兜底', () => {
        const reason = describeAttachmentTrashFailure('STILL_REFERENCED')
        expect(reason.key).toBe('editorUi.attachments.trashReasonStillReferenced')
        expect(reason.fallback).toContain('仍被 Markdown 引用')
        expect(describeAttachmentTrashFailure('UNKNOWN').key).toBe(
            'editorUi.attachments.trashReasonTrashFailed'
        )

        const conflict = describeAttachmentRenameFailure('ALREADY_EXISTS')
        expect(conflict.key).toBe('editorUi.attachments.renameConflict')
        expect(conflict.fallback).toContain('已存在')
        expect(describeAttachmentRenameFailure('INVALID_NAME').key).toBe(
            'editorUi.attachments.renameInvalidName'
        )
        expect(describeAttachmentRenameFailure('PATH_DENIED').key).toBe(
            'editorUi.attachments.renamePathDenied'
        )
        expect(describeAttachmentRenameFailure('UNKNOWN').key).toBe(
            'editorUi.attachments.renameFailed'
        )
    })
})
