/**
 * 1.5.2 E3 图片 OCR —— 主进程 IPC 层单测（`src/main/ipc/ocr-ipc.ts`，不启动 Electron）
 *
 * 覆盖口径：
 * 1. `validateOcrRecognizePayload` 校验矩阵：载荷类型 / 语言白名单 / PNG 魔数 / 20 MiB 上限；
 * 2. `PREPARE_LANG`：非法载荷与非法语言拒绝且不触达下载；缓存命中无重复提示；
 *    下载进度 → 状态栏文案；下载成功/失败的结构化返回与成功/失败提示；
 * 3. `RECOGNIZE_IMAGE`：语言包兜底准备（失败返回 lang-download-failed）→ worker 串行识别 →
 *    成功返回文本/耗时并提示；worker 基础设施错误 → worker-unavailable；初始化失败 →
 *    清除坏缓存（lang-init-failed）；其他任务错误 → recognition-failed；
 * 4. 注册形状：两个 handle 通道 + componentId 透传 + 监听器透传业务结果。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'
import { OCR_IMAGE_MAX_BYTES } from '../../src/shared/constants/ocr'

const mocks = vi.hoisted(() => ({
    prepareOcrLanguage: vi.fn(),
    invalidateOcrLanguage: vi.fn(),
    getOcrTessdataDir: vi.fn(() => '/fake/tessdata'),
    recognizeOcrImageWithWorker: vi.fn(),
    notifyStatus: vi.fn(),
    registerHandleOnce: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// 语言包下载模块：只验证「是否调用/参数与结果映射」，真实下载/校验由 ocr-tessdata 逻辑与
// 纯函数单测覆盖（避免单测触网/写真实 userData）
vi.mock('../../src/main/utils/ocr/ocr-tessdata', () => ({
    prepareOcrLanguage: mocks.prepareOcrLanguage,
    invalidateOcrLanguage: mocks.invalidateOcrLanguage,
    getOcrTessdataDir: mocks.getOcrTessdataDir
}))
// worker 客户端：真实 wasm/worker 由冒烟实测覆盖；此处验证 IPC 层错误分类与返回值映射
vi.mock('../../src/main/utils/ocr/ocr-worker-client', () => ({
    recognizeOcrImageWithWorker: mocks.recognizeOcrImageWithWorker,
    isOcrWorkerInfrastructureError: (error: unknown) =>
        error instanceof Error && error.name === 'OcrWorkerInfrastructureError',
    isOcrWorkerTaskError: (error: unknown) =>
        error instanceof Error && error.name === 'OcrWorkerTaskError'
}))
// 状态栏提示：只验证「有可见提示 + 文案键」，真实发送由 status-notify 单测覆盖
vi.mock('../../src/main/utils/status-notify', () => ({ notifyStatus: mocks.notifyStatus }))
// sender 校验 / 错误日志由各自单测覆盖；本文件直接放行以验证 handler 形状
vi.mock('../../src/main/utils/ipc-security', () => ({
    withSenderCheck: (_channel: string, handler: unknown) => handler
}))
vi.mock('../../src/main/ipc/handle-error-log', () => ({
    withHandleErrorLog: (_channel: string, handler: unknown) => handler
}))
vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: mocks.registerHandleOnce }
}))
vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))
// 主进程 i18n：保留「键 + 插值参数」形态，便于断言文案键与占位符
vi.mock('../../src/main/utils/i18n', () => ({
    tMain: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}|${JSON.stringify(params)}` : key
}))

import {
    prepareOcrLanguageForIpc,
    recognizeOcrImageForIpc,
    registerOcrIpc,
    validateOcrRecognizePayload
} from '../../src/main/ipc/ocr-ipc'

/** 合法 PNG 字节（8 字节魔数 + 填充） */
function pngBytes(length = 16): Uint8Array {
    const bytes = new Uint8Array(Math.max(8, length))
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    return bytes
}

/** 构造指定 name 的 Error（模拟 worker 客户端两类错误） */
function makeNamedError(name: string, message: string): Error {
    const error = new Error(message)
    error.name = name
    return error
}

/** 状态栏消息文案列表（notifyStatus 第一次参数） */
function statusMessages(): string[] {
    return mocks.notifyStatus.mock.calls.map((call) => (call[0] as { message: string }).message)
}

/** 状态栏消息类型列表 */
function statusTypes(): string[] {
    return mocks.notifyStatus.mock.calls.map((call) => (call[0] as { type: string }).type)
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.getOcrTessdataDir.mockReturnValue('/fake/tessdata')
    mocks.prepareOcrLanguage.mockResolvedValue({
        ok: true,
        lang: 'eng',
        fromCache: true,
        bytes: 1024 * 1024
    })
})

describe('validateOcrRecognizePayload：载荷校验矩阵', () => {
    it('非对象载荷 → invalid-payload（不读取任何字段）', () => {
        for (const payload of [
            null,
            undefined,
            42,
            'eng',
            [],
            new Uint8Array(8),
            new ArrayBuffer(8)
        ]) {
            expect(validateOcrRecognizePayload(payload)).toEqual({
                ok: false,
                error: 'invalid-payload'
            })
        }
    })

    it('语言不在白名单 → invalid-lang（先于字节校验）', () => {
        for (const lang of ['chi_sim', '', 42, null, undefined]) {
            expect(validateOcrRecognizePayload({ lang, imageBytes: pngBytes() })).toEqual({
                ok: false,
                error: 'invalid-lang'
            })
        }
    })

    it('imageBytes 缺失/类型错误/空字节 → invalid-payload', () => {
        for (const imageBytes of [
            undefined,
            null,
            'abc',
            [],
            new Uint8Array(0),
            new ArrayBuffer(8)
        ]) {
            expect(validateOcrRecognizePayload({ lang: 'eng', imageBytes })).toEqual({
                ok: false,
                error: 'invalid-payload'
            })
        }
    })

    it('超过 20 MiB → image-too-large（PNG 魔数校验之前拦截）', () => {
        const oversized = pngBytes(OCR_IMAGE_MAX_BYTES + 1)
        expect(validateOcrRecognizePayload({ lang: 'eng', imageBytes: oversized })).toEqual({
            ok: false,
            error: 'image-too-large'
        })
    })

    it('非 PNG 字节（如 BMP 头）→ not-png', () => {
        const bmp = new Uint8Array([0x42, 0x4d, 0x00, 0x00])
        expect(validateOcrRecognizePayload({ lang: 'eng', imageBytes: bmp })).toEqual({
            ok: false,
            error: 'not-png'
        })
    })

    it('合法 PNG（含 Buffer 形态，Electron 结构化克隆后可能为 Buffer）→ ok', () => {
        const png = pngBytes(32)
        expect(validateOcrRecognizePayload({ lang: 'eng', imageBytes: png })).toEqual({
            ok: true,
            imageBytes: png,
            lang: 'eng'
        })
        const buffer = Buffer.from(png)
        const result = validateOcrRecognizePayload({ lang: 'eng', imageBytes: buffer })
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.lang).toBe('eng')
        }
    })
})

describe('prepareOcrLanguageForIpc：语言包准备', () => {
    it('非法载荷 / 非法语言 → 拒绝且不触发下载', async () => {
        await expect(prepareOcrLanguageForIpc(null)).resolves.toEqual({
            ok: false,
            error: 'invalid-payload'
        })
        await expect(prepareOcrLanguageForIpc({ lang: 'chi_sim' })).resolves.toEqual({
            ok: false,
            error: 'invalid-lang'
        })
        expect(mocks.prepareOcrLanguage).not.toHaveBeenCalled()
        expect(mocks.notifyStatus).not.toHaveBeenCalled()
    })

    it('缓存命中：无额外状态栏提示，返回 fromCache=true', async () => {
        await expect(prepareOcrLanguageForIpc({ lang: 'eng' })).resolves.toEqual({
            ok: true,
            lang: 'eng',
            fromCache: true,
            bytes: 1024 * 1024
        })
        expect(mocks.prepareOcrLanguage).toHaveBeenCalledTimes(1)
        expect(statusMessages()).toEqual([])
    })

    it('下载成功：进度 → 状态栏 loading 文案（含百分比），完成后 success 提示', async () => {
        mocks.prepareOcrLanguage.mockImplementation(async (_lang: unknown, options: unknown) => {
            const onProgress = (options as { onProgress?: (p: unknown) => void }).onProgress
            onProgress?.({ receivedBytes: 512 * 1024, totalBytes: 1024 * 1024, percent: 50 })
            return { ok: true, lang: 'eng', fromCache: false, bytes: 1024 * 1024 }
        })
        await expect(prepareOcrLanguageForIpc({ lang: 'eng' })).resolves.toEqual({
            ok: true,
            lang: 'eng',
            fromCache: false,
            bytes: 1024 * 1024
        })
        // 首/次进度均为 loading；最后一条为成功提示
        expect(statusTypes()[0]).toBe('loading')
        expect(statusMessages()[0]).toContain('mainMsg.ocr.preparingProgress')
        expect(statusMessages()[0]).toContain('"percent":50')
        expect(statusTypes().at(-1)).toBe('success')
        expect(statusMessages().at(-1)).toContain('mainMsg.ocr.ready')
    })

    it('进度百分比未知（Content-Length 缺失）→ 「正在下载」文案；下载失败 → error 提示 + 结构化错误码', async () => {
        mocks.prepareOcrLanguage.mockImplementationOnce(
            async (_lang: unknown, options: unknown) => {
                const onProgress = (options as { onProgress?: (p: unknown) => void }).onProgress
                onProgress?.({ receivedBytes: 1024, totalBytes: null, percent: null })
                return { ok: false, error: 'lang-download-failed' }
            }
        )
        await expect(prepareOcrLanguageForIpc({ lang: 'eng' })).resolves.toEqual({
            ok: false,
            error: 'lang-download-failed'
        })
        expect(statusMessages()[0]).toContain('mainMsg.ocr.preparing')
        expect(statusTypes().at(-1)).toBe('error')
        expect(statusMessages().at(-1)).toContain('mainMsg.ocr.failed')
    })
})

describe('recognizeOcrImageForIpc：识别流程', () => {
    it('非法载荷/超限/非 PNG → 结构化错误码，且不触发语言包准备与 worker', async () => {
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: new Uint8Array(0) })
        ).resolves.toEqual({ ok: false, error: 'invalid-payload' })
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes(OCR_IMAGE_MAX_BYTES + 1) })
        ).resolves.toEqual({ ok: false, error: 'image-too-large' })
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: new Uint8Array([0x42, 0x4d]) })
        ).resolves.toEqual({ ok: false, error: 'not-png' })
        expect(mocks.prepareOcrLanguage).not.toHaveBeenCalled()
        expect(mocks.recognizeOcrImageWithWorker).not.toHaveBeenCalled()
        expect(mocks.notifyStatus).not.toHaveBeenCalled()
    })

    it('语言包准备失败 → lang-download-failed（含 error 提示），不进入 worker', async () => {
        mocks.prepareOcrLanguage.mockResolvedValue({ ok: false, error: 'lang-download-failed' })
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes() })
        ).resolves.toEqual({ ok: false, error: 'lang-download-failed' })
        expect(mocks.recognizeOcrImageWithWorker).not.toHaveBeenCalled()
        expect(statusTypes().at(-1)).toBe('error')
    })

    it('识别成功：返回原始文本与耗时，状态栏先「识别中」再成功提示；语言包目录取主进程真源', async () => {
        mocks.recognizeOcrImageWithWorker.mockResolvedValue({
            text: 'Hello OCR',
            elapsedMs: 321
        })
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes() })
        ).resolves.toEqual({ ok: true, text: 'Hello OCR', elapsedMs: 321 })
        expect(mocks.recognizeOcrImageWithWorker).toHaveBeenCalledWith(
            'eng',
            '/fake/tessdata',
            expect.any(Uint8Array)
        )
        expect(statusMessages().some((m) => m.includes('mainMsg.ocr.recognizing'))).toBe(true)
        const done = statusMessages().at(-1) ?? ''
        expect(done).toContain('mainMsg.ocr.recognizeDone')
        expect(done).toContain('"elapsed":321')
        expect(statusTypes().at(-1)).toBe('success')
    })

    it('worker 基础设施错误 → worker-unavailable + error 提示', async () => {
        mocks.recognizeOcrImageWithWorker.mockRejectedValue(
            makeNamedError('OcrWorkerInfrastructureError', '线程启动失败')
        )
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes() })
        ).resolves.toEqual({ ok: false, error: 'worker-unavailable' })
        expect(statusTypes().at(-1)).toBe('error')
    })

    it('初始化失败（语言包损坏）→ 清除缓存并返回 lang-init-failed', async () => {
        mocks.recognizeOcrImageWithWorker.mockRejectedValue(
            makeNamedError('OcrWorkerTaskError', 'initialization failed')
        )
        mocks.invalidateOcrLanguage.mockResolvedValue(true)
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes() })
        ).resolves.toEqual({ ok: false, error: 'lang-init-failed' })
        expect(mocks.invalidateOcrLanguage).toHaveBeenCalledWith('eng')
        expect(statusTypes().at(-1)).toBe('error')
    })

    it('其他识别错误 → recognition-failed（不清缓存）；未知异常同样归一化', async () => {
        mocks.recognizeOcrImageWithWorker.mockRejectedValue(
            makeNamedError('OcrWorkerTaskError', 'recognize crashed')
        )
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes() })
        ).resolves.toEqual({ ok: false, error: 'recognition-failed' })
        expect(mocks.invalidateOcrLanguage).not.toHaveBeenCalled()

        mocks.recognizeOcrImageWithWorker.mockRejectedValueOnce(new Error('unexpected'))
        await expect(
            recognizeOcrImageForIpc({ lang: 'eng', imageBytes: pngBytes() })
        ).resolves.toEqual({ ok: false, error: 'recognition-failed' })
    })
})

describe('registerOcrIpc：注册形状', () => {
    it('注册两个 handle 通道（PREPARE_LANG / RECOGNIZE_IMAGE），透传 componentId', () => {
        const mainWindow = { webContents: { send: vi.fn() } }
        registerOcrIpc(mainWindow as never, 'global-ocr-ipc')
        expect(mocks.registerHandleOnce).toHaveBeenCalledTimes(2)
        const channels = mocks.registerHandleOnce.mock.calls.map((call) => call[0])
        expect(channels).toEqual([IPC.OCR.PREPARE_LANG, IPC.OCR.RECOGNIZE_IMAGE])
        for (const call of mocks.registerHandleOnce.mock.calls) {
            expect(call[2]).toBe('global-ocr-ipc')
            expect(typeof call[1]).toBe('function')
        }
    })

    it('监听器透传业务结果（非法载荷路径无需触网/触盘）', async () => {
        const mainWindow = { webContents: { send: vi.fn() } }
        registerOcrIpc(mainWindow as never, 'global-ocr-ipc')
        const prepareHandler = mocks.registerHandleOnce.mock.calls[0][1] as (
            event: unknown,
            payload: unknown
        ) => Promise<unknown>
        const recognizeHandler = mocks.registerHandleOnce.mock.calls[1][1] as (
            event: unknown,
            payload: unknown
        ) => Promise<unknown>
        await expect(prepareHandler({}, { lang: 'chi_sim' })).resolves.toEqual({
            ok: false,
            error: 'invalid-lang'
        })
        await expect(
            recognizeHandler({}, { lang: 'eng', imageBytes: new Uint8Array([1, 2, 3]) })
        ).resolves.toEqual({ ok: false, error: 'not-png' })
    })
})
