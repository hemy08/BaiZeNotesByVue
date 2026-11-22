/**
 * 1.5.2 E3 OCR worker 线程入口单测（`src/main/utils/ocr/ocr-worker.ts`，协议级）
 *
 * 背景：worker 入口是 electron-vite main 构建的独立入口，正常单测进程里 `parentPort` 为 null，
 * 模块主体（消息监听 + 成功/失败日志 + 回包）从不执行。本文件按「mock parentPort + mock 任务
 * 分发」的协议级单测覆盖全部成功/失败/回退分支（与既有 word-worker-entry 测试同一模式）：
 * 1. parentPort 为 null（普通主线程 import）：不注册监听、不抛异常；
 * 2. 成功应答：console.log 记录耗时/识别耗时并回包；
 * 3. 失败应答（带 error）：console.error 记录错误文案并回包；
 * 4. 失败应答（无 error）：日志回退「未知错误」；
 * 5. 连续两条消息按顺序独立回包。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const taskMocks = vi.hoisted(() => ({
    handleOcrWorkerRequest: vi.fn()
}))

vi.mock('../../src/main/utils/ocr/ocr-worker-tasks', () => taskMocks)

interface FakeParentPort {
    on: ReturnType<typeof vi.fn>
    postMessage: ReturnType<typeof vi.fn>
    listeners: Array<(request: unknown) => void>
}

/** 创建可捕获 message 监听的假 parentPort */
function createFakePort(): FakeParentPort {
    const port: FakeParentPort = {
        listeners: [],
        on: vi.fn((event: string, listener: (request: unknown) => void) => {
            if (event === 'message') {
                port.listeners.push(listener)
            }
        }),
        postMessage: vi.fn()
    }
    return port
}

/** 动态导入 worker 入口（parentPort 注入由调用方先 doMock） */
async function importWorkerEntry(port: FakeParentPort | null): Promise<void> {
    vi.doMock('node:worker_threads', () => ({ parentPort: port }))
    await import('../../src/main/utils/ocr/ocr-worker')
}

/** 触发一次消息并等待异步 then 链落定 */
async function dispatch(port: FakeParentPort, request: unknown): Promise<void> {
    expect(port.listeners).toHaveLength(1)
    port.listeners[0](request)
    await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledTimes(1)
    })
}

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.resetModules()
    taskMocks.handleOcrWorkerRequest.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.doUnmock('node:worker_threads')
    vi.resetModules()
})

describe('ocr-worker 入口：parentPort 缺失', () => {
    it('主线程环境（parentPort 为 null）import 入口不注册监听、不抛异常', async () => {
        await expect(importWorkerEntry(null)).resolves.toBeUndefined()
        expect(taskMocks.handleOcrWorkerRequest).not.toHaveBeenCalled()
        expect(logSpy).not.toHaveBeenCalled()
        expect(errorSpy).not.toHaveBeenCalled()
    })
})

describe('ocr-worker 入口：消息协议与日志', () => {
    it('成功应答：记录耗时/识别耗时并原样回包', async () => {
        taskMocks.handleOcrWorkerRequest.mockResolvedValue({
            id: 3,
            ok: true,
            text: 'Hello OCR',
            elapsedMs: 12
        })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 3, type: 'ocrRecognize' })

        expect(taskMocks.handleOcrWorkerRequest).toHaveBeenCalledWith({
            id: 3,
            type: 'ocrRecognize'
        })
        expect(port.postMessage).toHaveBeenCalledWith({
            id: 3,
            ok: true,
            text: 'Hello OCR',
            elapsedMs: 12
        })
        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(String(logSpy.mock.calls[0][0])).toContain('[ocr-worker] 完成')
        expect(String(logSpy.mock.calls[0][0])).toContain('识别 12ms')
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('成功应答（无 elapsedMs）：识别耗时回退 0', async () => {
        taskMocks.handleOcrWorkerRequest.mockResolvedValue({ id: 4, ok: true })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 4, type: 'ocrRecognize' })

        expect(String(logSpy.mock.calls[0][0])).toContain('识别 0ms')
    })

    it('失败应答（带 error）：console.error 记录任务 id/错误并回包', async () => {
        taskMocks.handleOcrWorkerRequest.mockResolvedValue({
            id: 5,
            ok: false,
            error: 'language pack corrupted'
        })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 5, type: 'ocrRecognize' })

        expect(port.postMessage).toHaveBeenCalledWith({
            id: 5,
            ok: false,
            error: 'language pack corrupted'
        })
        expect(errorSpy).toHaveBeenCalledTimes(1)
        const logText = String(errorSpy.mock.calls[0][0])
        expect(logText).toContain('[ocr-worker] 失败')
        expect(logText).toContain('id=5')
        expect(logText).toContain('language pack corrupted')
        expect(logSpy).not.toHaveBeenCalled()
    })

    it('失败应答（无 error 字段）：日志回退「未知错误」', async () => {
        taskMocks.handleOcrWorkerRequest.mockResolvedValue({ id: 6, ok: false })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 6, type: 'ocrRecognize' })

        expect(String(errorSpy.mock.calls[0][0])).toContain('未知错误')
    })

    it('连续两条消息按顺序独立回包', async () => {
        taskMocks.handleOcrWorkerRequest
            .mockResolvedValueOnce({ id: 11, ok: true, text: 'a', elapsedMs: 1 })
            .mockResolvedValueOnce({ id: 12, ok: true, text: 'b', elapsedMs: 2 })
        const port = createFakePort()
        await importWorkerEntry(port)

        port.listeners[0]({ id: 11, type: 'ocrRecognize' })
        port.listeners[0]({ id: 12, type: 'ocrRecognize' })

        await vi.waitFor(() => {
            expect(port.postMessage).toHaveBeenCalledTimes(2)
        })
        expect(port.postMessage.mock.calls.map((call) => (call[0] as { id: number }).id)).toEqual([
            11, 12
        ])
    })
})
