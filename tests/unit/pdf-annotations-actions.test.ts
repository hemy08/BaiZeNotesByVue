/**
 * 1.5.2 E2：PDF 标注与摘录 —— 渲染层动作单测（`src/renderer/src/common/pdf-annotations-actions.ts`）
 *
 * 覆盖口径：
 * 1. load/save 的 IPC 通道与参数（只传 PDF 路径 + 归一化纯 JSON 标注数组）、成功路径无提示；
 * 2. 失败 reason → i18n 文案映射、invoke 拒绝、受限 ipcRenderer 不可用（LOG-08 禁止静默失败）；
 * 3. 能力开关关闭（`{ enabled: false }`）时**不发起任何 IPC**；
 * 4. 草稿增删（纯函数）：新增归一化/非法输入提示、删除不存在 id 时返回等价列表；
 * 5. 摘录：活动编辑器插入 vs 剪贴板回退 vs 全部失败；空文本不落剪贴板。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'
import { buildPdfExcerptMarkdown } from '../../src/shared/constants/pdf-annotations'
import type { PdfAnnotation } from '../../src/shared/types/pdf-annotations'

const mocks = vi.hoisted(() => ({
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    insertMarkdownAtSelection: vi.fn(),
    clipboardWriteText: vi.fn()
}))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({
        showError: mocks.showError,
        showWarning: mocks.showWarning,
        showInfo: mocks.showInfo
    })
}))
vi.mock('@renderer/common/logger', () => ({ logger: mocks.logger }))
// i18n 替身：保留「键 + 插值参数」形态，便于断言 reason → 文案键的映射关系
vi.mock('@renderer/common/i18n', () => ({
    t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}|${JSON.stringify(params)}` : key
}))
vi.mock('@renderer/common/action-feedback', () => ({
    describeActionError: (error: unknown, fallback: string) =>
        error instanceof Error && error.message ? error.message : fallback
}))
// A8 粘贴增强模块在单测中替身化：只验证「复用插入 API」而非重复实现
vi.mock('@renderer/components/Markdown/editor-paste-enhance', () => ({
    insertMarkdownAtSelection: mocks.insertMarkdownAtSelection
}))

import { clearActiveEditor, setActiveEditor } from '../../src/renderer/src/common/active-editor'
import {
    addPdfAnnotation,
    excerptPdfAnnotation,
    loadPdfAnnotations,
    removePdfAnnotation,
    savePdfAnnotations
} from '../../src/renderer/src/common/pdf-annotations-actions'

/** 构造一条合法标注 */
function makeAnnotation(overrides: Partial<PdfAnnotation> = {}): PdfAnnotation {
    return {
        id: 'a1',
        page: 2,
        text: '摘录正文',
        createdAt: '2026-01-04T09:05:06.000Z',
        rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }],
        ...overrides
    }
}

let invoke: ReturnType<typeof vi.fn>

/** 安装 window 替身（electron.ipcRenderer.invoke + navigator.clipboard.writeText） */
function stubRendererWindow(options: { withIpc?: boolean; withClipboard?: boolean } = {}): void {
    const { withIpc = true, withClipboard = true } = options
    const windowStub: Record<string, unknown> = {}
    if (withIpc) {
        windowStub.electron = { ipcRenderer: { invoke } }
    }
    if (withClipboard) {
        vi.stubGlobal('navigator', {
            clipboard: { writeText: mocks.clipboardWriteText }
        })
    }
    vi.stubGlobal('window', windowStub)
}

beforeEach(() => {
    vi.clearAllMocks()
    invoke = vi.fn()
    mocks.insertMarkdownAtSelection.mockReturnValue(true)
    mocks.clipboardWriteText.mockResolvedValue(undefined)
    clearActiveEditor()
})

afterEach(() => {
    clearActiveEditor()
    vi.unstubAllGlobals()
})

describe('loadPdfAnnotations：IPC 调用与成功路径', () => {
    it('调用 LOAD_PDF_ANNOTATIONS 并传 PDF 路径，返回归一化标注', async () => {
        stubRendererWindow()
        invoke.mockResolvedValue({ ok: true, annotations: [makeAnnotation()] })

        const annotations = await loadPdfAnnotations('C:/docs/a.pdf')

        expect(invoke).toHaveBeenCalledWith(IPC.FILE.LOAD_PDF_ANNOTATIONS, 'C:/docs/a.pdf')
        expect(annotations).toEqual([makeAnnotation()])
        expect(mocks.showError).not.toHaveBeenCalled()
        expect(mocks.showWarning).not.toHaveBeenCalled()
    })

    it('渲染层再归一化一次（剥离未知字段 / 丢弃非法条目）', async () => {
        stubRendererWindow()
        invoke.mockResolvedValue({
            ok: true,
            annotations: [{ ...makeAnnotation(), hacked: 'x' }, { bad: true }]
        })
        const annotations = await loadPdfAnnotations('C:/docs/a.pdf')
        expect(annotations).toEqual([makeAnnotation()])
    })

    it('开关关闭（enabled=false）时不调用 IPC 且返回空数组', async () => {
        stubRendererWindow()
        const annotations = await loadPdfAnnotations('C:/docs/a.pdf', { enabled: false })
        expect(annotations).toEqual([])
        expect(invoke).not.toHaveBeenCalled()
    })
})

describe('loadPdfAnnotations：失败提示（i18n 映射）', () => {
    it('主进程结构化失败 code → 对应中文文案（read-failed 等）', async () => {
        stubRendererWindow()
        invoke.mockResolvedValue({ ok: false, error: 'read-failed', annotations: [] })
        const annotations = await loadPdfAnnotations('C:/docs/a.pdf')
        expect(annotations).toEqual([])
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.loadFailedTitle',
            'editorUi.pdfAnnotations.loadFailed|{"error":"editorUi.pdfAnnotations.readFailed"}'
        )
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('未知/缺失 code → 通用失败文案，不抛异常', async () => {
        stubRendererWindow()
        invoke.mockResolvedValue({ ok: false, annotations: [] })
        await expect(loadPdfAnnotations('C:/docs/a.pdf')).resolves.toEqual([])
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.loadFailedTitle',
            'editorUi.pdfAnnotations.loadFailed|{"error":"editorUi.pdfAnnotations.failedMessage"}'
        )
    })

    it('invoke 拒绝 → 提示携带归一化错误信息', async () => {
        stubRendererWindow()
        invoke.mockRejectedValueOnce(new Error('ipc broken'))
        await loadPdfAnnotations('C:/docs/a.pdf')
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.loadFailedTitle',
            'editorUi.pdfAnnotations.invokeFailed|{"error":"ipc broken"}'
        )
        expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('受限 ipcRenderer 不可用 → 可见提示且不抛异常', async () => {
        stubRendererWindow({ withIpc: false })
        await expect(loadPdfAnnotations('C:/docs/a.pdf')).resolves.toEqual([])
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.loadFailedTitle',
            'editorUi.pdfAnnotations.unavailable'
        )
    })
})

describe('savePdfAnnotations：IPC 调用与失败提示', () => {
    it('调用 SAVE_PDF_ANNOTATIONS，传 PDF 路径 + 归一化纯 JSON 数组', async () => {
        stubRendererWindow()
        invoke.mockResolvedValue({ ok: true })
        const raw = [
            { ...makeAnnotation({ id: 'b', page: 2 }), proxy: true },
            makeAnnotation({ id: 'a', page: 1 })
        ] as PdfAnnotation[]

        await expect(savePdfAnnotations('C:/docs/a.pdf', raw)).resolves.toBe(true)

        expect(invoke).toHaveBeenCalledTimes(1)
        const [channel, path, payload] = invoke.mock.calls[0] as [string, string, PdfAnnotation[]]
        expect(channel).toBe(IPC.FILE.SAVE_PDF_ANNOTATIONS)
        expect(path).toBe('C:/docs/a.pdf')
        // 纯 JSON：无未知字段、按 page → createdAt → id 排序
        expect(payload).toEqual([
            makeAnnotation({ id: 'a', page: 1 }),
            makeAnnotation({ id: 'b', page: 2 })
        ])
        expect(mocks.showError).not.toHaveBeenCalled()
    })

    it('开关关闭（enabled=false）时不调用 IPC 并返回 false', async () => {
        stubRendererWindow()
        await expect(
            savePdfAnnotations('C:/docs/a.pdf', [makeAnnotation()], { enabled: false })
        ).resolves.toBe(false)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('主进程失败 → saveFailed 提示（含错误码映射）', async () => {
        stubRendererWindow()
        invoke.mockResolvedValue({ ok: false, error: 'write-failed' })
        await expect(savePdfAnnotations('C:/docs/a.pdf', [makeAnnotation()])).resolves.toBe(false)
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.saveFailedTitle',
            'editorUi.pdfAnnotations.saveFailed|{"error":"editorUi.pdfAnnotations.writeFailed"}'
        )
        expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('invoke 拒绝 → 可见错误提示', async () => {
        stubRendererWindow()
        invoke.mockRejectedValueOnce(new Error('ipc broken'))
        await expect(savePdfAnnotations('C:/docs/a.pdf', [])).resolves.toBe(false)
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.saveFailedTitle',
            'editorUi.pdfAnnotations.invokeFailed|{"error":"ipc broken"}'
        )
    })

    it('受限 ipcRenderer 不可用 → 可见错误提示', async () => {
        stubRendererWindow({ withIpc: false })
        await expect(savePdfAnnotations('C:/docs/a.pdf', [])).resolves.toBe(false)
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.saveFailedTitle',
            'editorUi.pdfAnnotations.unavailable'
        )
    })
})

describe('addPdfAnnotation / removePdfAnnotation：草稿增删（纯函数）', () => {
    it('新增：生成标注并返回归一化有序列表（追加到末尾后按 page 排序）', () => {
        const next = addPdfAnnotation([makeAnnotation({ id: 'a', page: 1 })], {
            page: 2,
            text: '新标注',
            rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }],
            id: 'new-id',
            createdAt: '2026-01-05T00:00:00.000Z'
        })
        expect(next).toHaveLength(2)
        expect(next?.[1]).toMatchObject({
            id: 'new-id',
            page: 2,
            text: '新标注',
            createdAt: '2026-01-05T00:00:00.000Z'
        })
        expect(mocks.showWarning).not.toHaveBeenCalled()
    })

    it('新增非法输入：返回 null 并提示（不产生半合法数据）', () => {
        expect(addPdfAnnotation([], { page: 0, text: 'x' })).toBeNull()
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.addFailedTitle',
            'editorUi.pdfAnnotations.addInvalid'
        )
    })

    it('删除：按 id 过滤并归一化；id 不存在时返回等价列表', () => {
        const current = [makeAnnotation({ id: 'a' }), makeAnnotation({ id: 'b', page: 3 })]
        expect(removePdfAnnotation(current, 'a').map((item) => item.id)).toEqual(['b'])
        expect(removePdfAnnotation(current, 'missing')).toEqual(current)
    })
})

describe('excerptPdfAnnotation：摘录插入 vs 剪贴板回退', () => {
    const PDF_NAME = '手册.pdf'

    it('有活动编辑器：调用 insertMarkdownAtSelection 插入摘录 Markdown', async () => {
        stubRendererWindow()
        const editor = { id: 'editor' }
        setActiveEditor(editor as never)
        const annotation = makeAnnotation({ text: '第一行\n第二行', page: 3 })

        await expect(excerptPdfAnnotation(annotation, PDF_NAME)).resolves.toBe('inserted')

        expect(mocks.insertMarkdownAtSelection).toHaveBeenCalledTimes(1)
        const [target, markdown] = mocks.insertMarkdownAtSelection.mock.calls[0] as [
            unknown,
            string
        ]
        expect(target).toBe(editor)
        expect(markdown).toBe(
            buildPdfExcerptMarkdown({ text: '第一行\n第二行', pdfFileName: PDF_NAME, page: 3 })
        )
        expect(mocks.clipboardWriteText).not.toHaveBeenCalled()
        expect(mocks.showInfo).not.toHaveBeenCalled()
    })

    it('无活动编辑器：回退剪贴板并提示「已复制到剪贴板」', async () => {
        stubRendererWindow()
        const annotation = makeAnnotation()

        await expect(excerptPdfAnnotation(annotation, PDF_NAME)).resolves.toBe('copied')

        expect(mocks.insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(mocks.clipboardWriteText).toHaveBeenCalledWith(
            buildPdfExcerptMarkdown({
                text: annotation.text,
                pdfFileName: PDF_NAME,
                page: annotation.page
            })
        )
        expect(mocks.showInfo).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.copiedTitle',
            'editorUi.pdfAnnotations.copiedMessage'
        )
    })

    it('编辑器插入返回 false → 回退剪贴板', async () => {
        stubRendererWindow()
        setActiveEditor({ id: 'editor' } as never)
        mocks.insertMarkdownAtSelection.mockReturnValue(false)
        await expect(excerptPdfAnnotation(makeAnnotation(), PDF_NAME)).resolves.toBe('copied')
        expect(mocks.clipboardWriteText).toHaveBeenCalledTimes(1)
    })

    it('A8 模块加载失败（动态 import 抛错）→ 回退剪贴板', async () => {
        stubRendererWindow()
        setActiveEditor({ id: 'editor' } as never)
        // 首次已加载成功后模块被缓存；此处直接构造失败的动态 import 分支较难触发，
        // 通过「插入函数抛错」等价覆盖 catch 分支。
        mocks.insertMarkdownAtSelection.mockImplementationOnce(() => {
            throw new Error('insert failed')
        })
        await expect(excerptPdfAnnotation(makeAnnotation(), PDF_NAME)).resolves.toBe('copied')
        expect(mocks.clipboardWriteText).toHaveBeenCalledTimes(1)
    })

    it('剪贴板也不可用 → 失败提示（不抛异常）', async () => {
        stubRendererWindow({ withClipboard: false })
        await expect(excerptPdfAnnotation(makeAnnotation(), PDF_NAME)).resolves.toBe('failed')
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.excerptFailedTitle',
            'editorUi.pdfAnnotations.excerptInsertFailed'
        )
    })

    it('剪贴板写入被拒 → 失败提示', async () => {
        stubRendererWindow()
        mocks.clipboardWriteText.mockRejectedValueOnce(new Error('denied'))
        await expect(excerptPdfAnnotation(makeAnnotation(), PDF_NAME)).resolves.toBe('failed')
        expect(mocks.logger.warn).toHaveBeenCalled()
        expect(mocks.showError).toHaveBeenCalled()
    })

    it('空文本标注：不插入、不写剪贴板，提示无法摘录', async () => {
        stubRendererWindow()
        await expect(excerptPdfAnnotation(makeAnnotation({ text: '   ' }), PDF_NAME)).resolves.toBe(
            'failed'
        )
        expect(mocks.insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(mocks.clipboardWriteText).not.toHaveBeenCalled()
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.pdfAnnotations.excerptFailedTitle',
            'editorUi.pdfAnnotations.excerptInvalid'
        )
    })
})
