// @vitest-environment node
/**
 * 1.5.2 E3 图片 OCR 渲染层动作单测（`src/renderer/src/common/ocr-actions.ts`）
 *
 * 覆盖口径：
 * 1. 剪贴板图片读取：接口不可用 / 读取失败 / 无 image/png（「剪贴板没有图片」）/
 *    超过 20 MiB / 字节非 PNG / 成功；
 * 2. 识别管线：PREPARE_LANG 失败（下载失败提示）→ 不调用识别；识别错误码 → 文案映射；
 *    空文本提示；IPC 抛错 → 调用失败提示；
 * 3. 识别并插入：复用 A8 `insertMarkdownAtSelection`，插入内容为归一化原文 + 来源行；
 *    无活动编辑器时回退复制到剪贴板并提示；插入失败给出可见错误；
 * 4. 识别并复制：写入剪贴板成功/失败提示；
 * 5. 能力开关关闭提示（菜单动作入口）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OCR_IMAGE_MAX_BYTES, buildOcrTessdataUrl } from '../../src/shared/constants/ocr'
import { IPC } from '../../src/shared/ipc-channels'

const mocks = vi.hoisted(() => ({
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    insertMarkdownAtSelection: vi.fn()
}))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({
        showError: mocks.showError,
        showWarning: mocks.showWarning,
        showInfo: mocks.showInfo
    })
}))
vi.mock('@renderer/common/logger', () => ({ logger: mocks.logger }))
// i18n 替身：保留「键 + 插值参数」形态，便于断言文案键映射与 {max} 占位符
vi.mock('@renderer/common/i18n', () => ({
    t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}|${JSON.stringify(params)}` : key
}))
vi.mock('@renderer/common/action-feedback', () => ({
    describeActionError: (error: unknown, fallback: string) =>
        error instanceof Error && error.message ? error.message : fallback
}))
// A8 插入模块替身（真实插入逻辑由 editor-paste-enhance 单测覆盖）
vi.mock('@renderer/components/Markdown/editor-paste-enhance', () => ({
    insertMarkdownAtSelection: mocks.insertMarkdownAtSelection
}))

import { clearActiveEditor, setActiveEditor } from '../../src/renderer/src/common/active-editor'
import {
    ocrClipboardToClipboard,
    ocrClipboardToEditor,
    readClipboardImageBytes,
    showImageOcrFeatureDisabled
} from '../../src/renderer/src/common/ocr-actions'

/** PNG 文件头（8 字节魔数） */
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 构造 PNG 字节 */
function pngBytes(length = 24): Uint8Array {
    const bytes = new Uint8Array(Math.max(8, length))
    bytes.set(PNG_HEADER, 0)
    return bytes
}

/** 剪贴板条目替身（image/png → Blob 替身） */
interface FakeClipboardItem {
    types: readonly string[]
    getType: (type: string) => Promise<{ size?: number; arrayBuffer: () => Promise<ArrayBuffer> }>
}

/** Blob 替身：由字节构造 arrayBuffer() */
function blobOf(
    bytes: Uint8Array,
    size?: number
): {
    size?: number
    arrayBuffer: () => Promise<ArrayBuffer>
} {
    return {
        size: size ?? bytes.length,
        arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer
    }
}

/** 构造剪贴板条目 */
function itemOf(
    types: string[],
    blobs: Record<string, ReturnType<typeof blobOf>>
): FakeClipboardItem {
    return {
        types,
        getType: async (type: string) => {
            const blob = blobs[type]
            if (!blob) {
                throw new Error(`no blob for ${type}`)
            }
            return blob
        }
    }
}

/** 注入 navigator.clipboard（undefined 表示 navigator 为空对象） */
function stubClipboard(clipboard?: Record<string, unknown>): void {
    vi.stubGlobal('navigator', clipboard === undefined ? {} : { clipboard })
}

let invoke: ReturnType<typeof vi.fn>
let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
    vi.clearAllMocks()
    invoke = vi.fn(async () => ({ ok: true, text: 'Hello OCR', elapsedMs: 120 }))
    writeText = vi.fn(async () => undefined)
    vi.stubGlobal('window', { electron: { ipcRenderer: { invoke } } })
    stubClipboard({
        read: vi.fn(async () => [itemOf(['image/png'], { 'image/png': blobOf(pngBytes()) })]),
        writeText
    })
    mocks.insertMarkdownAtSelection.mockReturnValue(true)
    clearActiveEditor()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

/** 等待动作内部 Promise 链执行完（连续两次宏任务确保动态 import 分支也结算） */
async function flushAction(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
}

/** 默认 prepare 成功替身（按调用顺序：prepare → recognize） */
function stubInvokeFlow(
    prepareResult: unknown = { ok: true, lang: 'eng', fromCache: true, bytes: 1024 },
    recognizeResult: unknown = { ok: true, text: 'Hello OCR', elapsedMs: 120 }
): void {
    invoke.mockImplementation(async (channel: string) => {
        if (channel === IPC.OCR.PREPARE_LANG) {
            return prepareResult
        }
        if (channel === IPC.OCR.RECOGNIZE_IMAGE) {
            return recognizeResult
        }
        throw new Error(`unexpected channel ${channel}`)
    })
}

describe('readClipboardImageBytes：剪贴板图片读取', () => {
    it('navigator / clipboard / read 不可用 → unavailable', async () => {
        vi.stubGlobal('navigator', undefined)
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'unavailable'
        })
        stubClipboard(undefined)
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'unavailable'
        })
        stubClipboard({})
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'unavailable'
        })
    })

    it('read() 抛错 → read-failed', async () => {
        stubClipboard({
            read: vi.fn(async () => {
                throw new Error('permission denied')
            })
        })
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'read-failed'
        })
    })

    it('条目中没有 image/png → no-image（提示「剪贴板没有图片」）', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                itemOf(['text/plain'], { 'text/plain': blobOf(new Uint8Array([1, 2, 3])) })
            ])
        })
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'no-image'
        })
    })

    it('Blob 声明大小超过 20 MiB → too-large（携带上限）', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                itemOf(['image/png'], {
                    'image/png': blobOf(pngBytes(), OCR_IMAGE_MAX_BYTES + 1)
                })
            ])
        })
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'too-large',
            maxBytes: OCR_IMAGE_MAX_BYTES
        })
    })

    it('实际字节超过 20 MiB（size 缺失）→ too-large', async () => {
        const oversized = pngBytes(OCR_IMAGE_MAX_BYTES + 1)
        stubClipboard({
            read: vi.fn(async () => [
                itemOf(['image/png'], { 'image/png': blobOf(oversized, undefined) })
            ])
        })
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'too-large',
            maxBytes: OCR_IMAGE_MAX_BYTES
        })
    })

    it('字节不是 PNG（魔数不符）→ read-failed（渲染层也做一道防御）', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                itemOf(['image/png'], {
                    'image/png': blobOf(new Uint8Array([0x42, 0x4d, 0x00, 0x00]))
                })
            ])
        })
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'read-failed'
        })
    })

    it('getType 抛错 → read-failed；成功 → 返回 PNG 字节', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                {
                    types: ['image/png'],
                    getType: async () => {
                        throw new Error('blob read failed')
                    }
                }
            ])
        })
        await expect(readClipboardImageBytes()).resolves.toEqual({
            ok: false,
            reason: 'read-failed'
        })

        const bytes = pngBytes(32)
        stubClipboard({
            read: vi.fn(async () => [itemOf(['image/png'], { 'image/png': blobOf(bytes) })])
        })
        const result = await readClipboardImageBytes()
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(Array.from(result.bytes.slice(0, 8))).toEqual(PNG_HEADER)
        }
    })
})

describe('ocrClipboardToEditor：识别并插入当前笔记', () => {
    it('剪贴板没有图片 → 可见错误提示，不调用 OCR 通道', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                itemOf(['text/plain'], { 'text/plain': blobOf(new Uint8Array([1])) })
            ]),
            writeText
        })
        ocrClipboardToEditor()
        await flushAction()
        expect(mocks.showError).toHaveBeenCalledTimes(1)
        const [title, message] = mocks.showError.mock.calls[0]
        expect(title).toBe('editorUi.imageOcr.failedTitle')
        expect(message).toBe('editorUi.imageOcr.noImage')
        expect(invoke).not.toHaveBeenCalled()
    })

    it('语言包准备失败 → 下载失败文案，不调用识别通道', async () => {
        stubInvokeFlow({ ok: false, error: 'lang-download-failed' })
        ocrClipboardToEditor()
        await flushAction()
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke.mock.calls[0][0]).toBe(IPC.OCR.PREPARE_LANG)
        expect(invoke.mock.calls[0][1]).toEqual({ lang: 'eng' })
        expect(mocks.showError.mock.calls[0][1]).toBe('editorUi.imageOcr.downloadFailed')
    })

    it('识别返回可用文本 → A8 插入（归一化原文 + 来源行），不弹错误', async () => {
        stubInvokeFlow(undefined, { ok: true, text: 'Hello\r\n\r\n\r\nWorld  ', elapsedMs: 88 })
        setActiveEditor({ id: 'editor' } as never)
        ocrClipboardToEditor()
        await flushAction()
        expect(invoke).toHaveBeenCalledTimes(2)
        expect(invoke.mock.calls[1][0]).toBe(IPC.OCR.RECOGNIZE_IMAGE)
        const payload = invoke.mock.calls[1][1] as { lang: string; imageBytes: Uint8Array }
        expect(payload.lang).toBe('eng')
        expect(payload.imageBytes instanceof Uint8Array).toBe(true)
        expect(mocks.insertMarkdownAtSelection).toHaveBeenCalledTimes(1)
        const markdown = mocks.insertMarkdownAtSelection.mock.calls[0][1] as string
        expect(markdown).toBe('Hello\n\nWorld\n\n> —— editorUi.imageOcr.sourceLine')
        expect(mocks.showError).not.toHaveBeenCalled()
    })

    it('识别文本为空/纯空白 → 「未识别到文字」可见提示', async () => {
        stubInvokeFlow(undefined, { ok: true, text: '   \n\n ', elapsedMs: 10 })
        setActiveEditor({ id: 'editor' } as never)
        ocrClipboardToEditor()
        await flushAction()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.imageOcr.failedTitle',
            'editorUi.imageOcr.emptyMessage'
        )
        expect(mocks.insertMarkdownAtSelection).not.toHaveBeenCalled()
    })

    it('无活动编辑器 → 回退复制到剪贴板并提示（不静默丢弃结果）', async () => {
        stubInvokeFlow()
        ocrClipboardToEditor()
        await flushAction()
        expect(writeText).toHaveBeenCalledWith('Hello OCR')
        expect(mocks.showInfo).toHaveBeenCalledWith(
            'editorUi.imageOcr.copiedTitle',
            'editorUi.imageOcr.noEditorCopiedMessage'
        )
        expect(mocks.showError).not.toHaveBeenCalled()
    })

    it('A8 插入失败 → 可见错误提示；识别错误码映射为对应文案', async () => {
        stubInvokeFlow()
        setActiveEditor({ id: 'editor' } as never)
        mocks.insertMarkdownAtSelection.mockReturnValue(false)
        ocrClipboardToEditor()
        await flushAction()
        expect(mocks.showError.mock.calls[0][1]).toBe('editorUi.imageOcr.insertFailed')

        mocks.showError.mockClear()
        stubInvokeFlow(undefined, { ok: false, error: 'worker-unavailable' })
        ocrClipboardToEditor()
        await flushAction()
        expect(mocks.showError.mock.calls[0][1]).toBe('editorUi.imageOcr.engineUnavailable')
    })

    it('IPC 抛错 → 「调用主进程失败」文案（含错误信息）', async () => {
        invoke.mockRejectedValue(new Error('boom'))
        ocrClipboardToEditor()
        await flushAction()
        expect(mocks.showError.mock.calls[0][1]).toContain('editorUi.imageOcr.invokeFailed')
        expect(mocks.showError.mock.calls[0][1]).toContain('boom')
    })
})

describe('ocrClipboardToClipboard：识别并复制到剪贴板', () => {
    it('成功 → 归一化文本写入剪贴板并提示已复制', async () => {
        stubInvokeFlow(undefined, { ok: true, text: '  Line1\r\nLine2  ', elapsedMs: 50 })
        ocrClipboardToClipboard()
        await flushAction()
        expect(writeText).toHaveBeenCalledWith('  Line1\nLine2')
        expect(mocks.showInfo).toHaveBeenCalledWith(
            'editorUi.imageOcr.copiedTitle',
            'editorUi.imageOcr.copiedMessage'
        )
    })

    it('写入剪贴板失败 → copy-failed 可见错误提示', async () => {
        stubInvokeFlow()
        writeText.mockRejectedValue(new Error('clipboard deny'))
        ocrClipboardToClipboard()
        await flushAction()
        expect(mocks.showError.mock.calls[0][1]).toBe('editorUi.imageOcr.copyFailed')
    })

    it('超限图片错误码 → 文案含 {max} 上限占位符', async () => {
        stubInvokeFlow(undefined, { ok: false, error: 'image-too-large' })
        ocrClipboardToClipboard()
        await flushAction()
        expect(mocks.showError.mock.calls[0][1]).toContain('editorUi.imageOcr.tooLarge')
        expect(mocks.showError.mock.calls[0][1]).toContain('"max":"20 MiB"')
    })
})

describe('showImageOcrFeatureDisabled：能力开关关闭提示', () => {
    it('只弹警告提示，不读取剪贴板、不调用 IPC 通道', () => {
        showImageOcrFeatureDisabled()
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.imageOcr.disabledTitle',
            'editorUi.imageOcr.disabledMessage'
        )
        expect(invoke).not.toHaveBeenCalled()
        expect(writeText).not.toHaveBeenCalled()
    })
})

describe('语言包下载源与纯函数联动（防止实现与契约漂移）', () => {
    it('主源 URL 为 tesseract.js 官方 LSTM-only 数据（https/固定版本）', () => {
        const url = buildOcrTessdataUrl('eng')
        expect(url.startsWith('https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/')).toBe(true)
        expect(url.endsWith('/eng.traineddata.gz')).toBe(true)
    })
})
