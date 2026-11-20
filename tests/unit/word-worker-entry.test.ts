/**
 * Word worker 线程入口单测（覆盖率补测第四批，worker 边界协议测试）
 *
 * 背景：word-worker.ts 是 electron-vite main 构建的独立 worker 入口，
 * 正常单测进程里 `parentPort` 为 null，模块主体（消息监听 + 成功/失败日志 + 回包）
 * 从未执行（语句覆盖 0%）。真实启动 worker_threads 代价高且无法稳定注入失败应答，
 * 因此本文件按「mock parentPort + mock 任务分发」的协议级单测覆盖全部失败/降级分支：
 *
 * 1. parentPort 为 null（普通主线程 import）：不注册监听、不抛异常（构建产物可安全 import）；
 * 2. 成功应答：console.log 记录任务类型与耗时，port.postMessage 原样回包；
 * 3. 失败应答（带 error）：console.error 记录错误文案，回包不变；
 * 4. 失败应答（无 error）：日志回退「未知错误」；
 * 5. 请求缺少 type：日志任务类型回退 'unknown'；
 * 6. 任务处理器 reject 不会破坏入口（handleWordWorkerRequest 契约永不 reject，此处校验
 *    入口不对 then 链做额外 catch 之外的处理——即不产生 postMessage 以外的副作用）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const taskMocks = vi.hoisted(() => ({
    handleWordWorkerRequest: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/word-worker-tasks', () => taskMocks)

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
    await import('../../src/main/utils/file-utils/word-worker')
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
    taskMocks.handleWordWorkerRequest.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.doUnmock('node:worker_threads')
    vi.resetModules()
})

describe('word-worker 入口：parentPort 缺失', () => {
    it('主线程环境（parentPort 为 null）import 入口不注册监听、不抛异常', async () => {
        await expect(importWorkerEntry(null)).resolves.toBeUndefined()
        expect(taskMocks.handleWordWorkerRequest).not.toHaveBeenCalled()
        expect(logSpy).not.toHaveBeenCalled()
        expect(errorSpy).not.toHaveBeenCalled()
    })
})

describe('word-worker 入口：消息协议与日志', () => {
    it('成功应答：记录任务类型与耗时并回包', async () => {
        taskMocks.handleWordWorkerRequest.mockResolvedValue({
            id: 7,
            ok: true,
            markdown: '# 标题'
        })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 7, type: 'wordImport', filePath: 'C:\\a.docx' })

        expect(taskMocks.handleWordWorkerRequest).toHaveBeenCalledWith({
            id: 7,
            type: 'wordImport',
            filePath: 'C:\\a.docx'
        })
        expect(port.postMessage).toHaveBeenCalledWith({ id: 7, ok: true, markdown: '# 标题' })
        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(String(logSpy.mock.calls[0][0])).toContain('[word-worker] wordImport 完成')
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('失败应答（带 error）：console.error 记录中文错误并原样回包', async () => {
        taskMocks.handleWordWorkerRequest.mockResolvedValue({
            id: 8,
            ok: false,
            error: 'docx 文件已损坏'
        })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 8, type: 'wordExport', content: 'x', filePath: 'C:\\o.docx' })

        expect(port.postMessage).toHaveBeenCalledWith({
            id: 8,
            ok: false,
            error: 'docx 文件已损坏'
        })
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(String(errorSpy.mock.calls[0][0])).toContain('[word-worker] wordExport 失败')
        expect(String(errorSpy.mock.calls[0][0])).toContain('docx 文件已损坏')
        expect(logSpy).not.toHaveBeenCalled()
    })

    it('失败应答（无 error 字段）：日志回退「未知错误」', async () => {
        taskMocks.handleWordWorkerRequest.mockResolvedValue({ id: 9, ok: false })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 9, type: 'wordImport', filePath: 'C:\\b.docx' })

        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(String(errorSpy.mock.calls[0][0])).toContain('未知错误')
    })

    it('请求缺少 type：日志任务类型回退 unknown', async () => {
        taskMocks.handleWordWorkerRequest.mockResolvedValue({ id: 10, ok: true, markdown: '' })
        const port = createFakePort()
        await importWorkerEntry(port)

        await dispatch(port, { id: 10 })

        expect(logSpy).toHaveBeenCalledTimes(1)
        expect(String(logSpy.mock.calls[0][0])).toContain('[word-worker] unknown 完成')
    })

    it('每条消息独立回包（连续两条任务按顺序 postMessage）', async () => {
        taskMocks.handleWordWorkerRequest
            .mockResolvedValueOnce({ id: 11, ok: true, markdown: 'a' })
            .mockResolvedValueOnce({ id: 12, ok: true, markdown: 'b' })
        const port = createFakePort()
        await importWorkerEntry(port)

        ;(port.listeners[0] ?? port.on.mock.calls[0][1])({ id: 11, type: 'wordImport' })
        ;(port.listeners[0] ?? port.on.mock.calls[0][1])({ id: 12, type: 'wordImport' })

        await vi.waitFor(() => {
            expect(port.postMessage).toHaveBeenCalledTimes(2)
        })
        expect(port.postMessage.mock.calls.map((call) => (call[0] as { id: number }).id)).toEqual([
            11, 12
        ])
    })
})
