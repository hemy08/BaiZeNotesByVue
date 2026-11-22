/**
 * 1.5.2 E3 OCR worker 任务实现单测（`src/main/utils/ocr/ocr-worker-tasks.ts`）
 *
 * 覆盖目标：
 * 1. 请求结构校验：非对象 / id 非法 / 未知任务类型 / 缺少 lang/langDir/imageBytes →
 *    统一返回 `{ ok:false }` 结构化应答（不抛异常，避免 worker 线程崩溃）；
 * 2. 成功路径：调用真实任务实现（此处以替身 mock），原样返回 text/elapsedMs；
 * 3. 失败归一化：Error / 字符串 / 空值 → 错误文案；超长错误截断到 500 字符 + 省略号；
 * 4. 请求 id 解析：非法请求回 -1。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runtimeMocks = vi.hoisted(() => ({
    recognizeOcrImageInWorker: vi.fn()
}))

vi.mock('../../src/main/utils/ocr/ocr-tesseract-runtime', () => ({
    recognizeOcrImageInWorker: runtimeMocks.recognizeOcrImageInWorker
}))

import { handleOcrWorkerRequest } from '../../src/main/utils/ocr/ocr-worker-tasks'
import { OCR_WORKER_TASK } from '../../src/main/utils/ocr/ocr-protocol'

/** 合法任务载荷工厂 */
function validRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 1,
        type: OCR_WORKER_TASK.RECOGNIZE,
        lang: 'eng',
        langDir: '/userdata/ocr/tessdata',
        imageBytes: new Uint8Array([1, 2, 3]),
        ...overrides
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    runtimeMocks.recognizeOcrImageInWorker.mockResolvedValue({
        text: 'Hello OCR',
        elapsedMs: 42
    })
})

describe('handleOcrWorkerRequest：请求结构校验', () => {
    it('非对象 / id 非法 → id=-1 且 ok=false（不抛异常）', async () => {
        for (const request of [null, undefined, 42, 'task', [], [validRequest()]]) {
            const response = await handleOcrWorkerRequest(request)
            expect(response.id).toBe(-1)
            expect(response.ok).toBe(false)
            expect(response.error).toBe('OCR worker 收到非法任务载荷')
        }
        expect(runtimeMocks.recognizeOcrImageInWorker).not.toHaveBeenCalled()
    })

    it('id 缺失/非有限数/负数 → id=-1 拒绝', async () => {
        for (const id of [undefined, null, 'x', Number.NaN, Number.POSITIVE_INFINITY, -1]) {
            const response = await handleOcrWorkerRequest(validRequest({ id }))
            expect(response.id).toBe(-1)
            expect(response.ok).toBe(false)
        }
        expect(runtimeMocks.recognizeOcrImageInWorker).not.toHaveBeenCalled()
    })

    it('未知任务类型 → ok=false 且提示不支持的类型', async () => {
        const response = await handleOcrWorkerRequest(validRequest({ type: 'unknownTask' }))
        expect(response.id).toBe(1)
        expect(response.ok).toBe(false)
        expect(response.error).toContain('不支持的任务类型')
        expect(response.error).toContain('unknownTask')
    })

    it('lang/langDir/imageBytes 缺失或类型非法 → 参数不完整', async () => {
        const invalidCases: Array<Record<string, unknown>> = [
            { lang: '' },
            { lang: '   ' },
            { lang: 42 },
            { langDir: '' },
            { langDir: 42 },
            { imageBytes: undefined },
            { imageBytes: [1, 2, 3] },
            { imageBytes: 'abc' },
            { imageBytes: new Uint8Array(0) }
        ]
        for (const overrides of invalidCases) {
            const response = await handleOcrWorkerRequest(validRequest(overrides))
            expect(response.id, JSON.stringify(overrides)).toBe(1)
            expect(response.ok).toBe(false)
            expect(response.error).toBe('OCR worker 任务参数不完整')
        }
        expect(runtimeMocks.recognizeOcrImageInWorker).not.toHaveBeenCalled()
    })
})

describe('handleOcrWorkerRequest：成功与失败归一化', () => {
    it('成功：调用任务实现并返回 id/text/elapsedMs', async () => {
        const request = validRequest()
        const response = await handleOcrWorkerRequest(request)
        expect(response).toEqual({ id: 1, ok: true, text: 'Hello OCR', elapsedMs: 42 })
        expect(runtimeMocks.recognizeOcrImageInWorker).toHaveBeenCalledWith(
            '/userdata/ocr/tessdata',
            'eng',
            expect.any(Uint8Array)
        )
    })

    it('Error 抛出 → 返回 error.message（不抛异常）', async () => {
        runtimeMocks.recognizeOcrImageInWorker.mockRejectedValue(new Error('initialization failed'))
        const response = await handleOcrWorkerRequest(validRequest({ id: 8 }))
        expect(response).toEqual({ id: 8, ok: false, error: 'initialization failed' })
    })

    it('字符串抛出 → 原样作为错误文案；空字符串 → 「未知错误」', async () => {
        runtimeMocks.recognizeOcrImageInWorker.mockRejectedValueOnce('worker crashed')
        await expect(handleOcrWorkerRequest(validRequest())).resolves.toMatchObject({
            ok: false,
            error: 'worker crashed'
        })

        runtimeMocks.recognizeOcrImageInWorker.mockRejectedValueOnce('')
        await expect(handleOcrWorkerRequest(validRequest())).resolves.toMatchObject({
            ok: false,
            error: '未知错误'
        })
    })

    it('Error 但 message 为空 → 回退 error.name；超长错误截断为 500 字符 + 省略号', async () => {
        const unnamed = new Error('')
        unnamed.name = 'AbortError'
        runtimeMocks.recognizeOcrImageInWorker.mockRejectedValueOnce(unnamed)
        await expect(handleOcrWorkerRequest(validRequest())).resolves.toMatchObject({
            ok: false,
            error: 'AbortError'
        })

        runtimeMocks.recognizeOcrImageInWorker.mockRejectedValueOnce(new Error('x'.repeat(800)))
        const response = await handleOcrWorkerRequest(validRequest())
        expect(response.ok).toBe(false)
        expect(response.error?.length).toBe(501)
        expect(response.error?.endsWith('…')).toBe(true)
    })
})
