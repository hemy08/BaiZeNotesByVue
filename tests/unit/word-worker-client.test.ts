/**
 * Word worker 客户端单测（P2-2）
 *
 * 覆盖目标：
 * 1. 请求/应答配对：成功导入返回 Markdown、成功导出 resolve；
 * 2. 失败路径：worker 内转换失败 → `WordWorkerTaskError`（保留原始错误文案）；
 *    启动失败/线程崩溃/线程退出 → `WordWorkerInfrastructureError`（调用方据此降级）；
 *    单任务超时 → 任务错误并回收 worker；
 * 3. 资源回收：空闲超时 terminate、dispose 拒绝未完成任务并终止线程，无悬挂计时器；
 * 4. 真实 worker_threads 往返（夹具线程）验证消息结构化克隆可用。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import {
    WordWorkerClient,
    WordWorkerInfrastructureError,
    WordWorkerTaskError,
    isWordWorkerInfrastructureError,
    type WordWorkerLike
} from '../../src/main/utils/file-utils/word-worker-client'

const TEST_SERVER_PATH = fileURLToPath(
    new URL('./helpers/word-worker-test-server.cjs', import.meta.url)
)

/** 假 worker：EventEmitter + 记录 postMessage/terminate，测试按需回包或触发错误 */
class FakeWorker extends EventEmitter {
    posted: Array<Record<string, unknown>> = []
    terminated = 0
    /** 收到任务后的行为：由每个用例注入 */
    onPost: (message: Record<string, unknown>) => void = () => undefined

    postMessage = vi.fn((value: unknown): void => {
        const message = value as Record<string, unknown>
        this.posted.push(message)
        this.onPost(message)
    })

    terminate = vi.fn(async (): Promise<number> => {
        this.terminated += 1
        return 0
    })

    unref = vi.fn((): void => undefined)

    /** 模拟 worker 回包 */
    reply(message: unknown): void {
        this.emit('message', message)
    }
}

/** 创建注入用假 worker（客户端只使用 WordWorkerLike 子集） */
function createFakeWorker(): { worker: FakeWorker; createWorker: () => WordWorkerLike } {
    const worker = new FakeWorker()
    return {
        worker,
        createWorker: () => worker as unknown as WordWorkerLike
    }
}

/** 让假 worker 对收到的任务自动回包（微任务出队后 emit，模拟真实线程消息时序） */
function autoReplySuccess(
    worker: FakeWorker,
    response: (message: Record<string, unknown>) => Record<string, unknown> = () => ({})
): void {
    worker.onPost = (message) => {
        const replyPayload = response(message)
        queueMicrotask(() => worker.reply({ id: message.id, ok: true, ...replyPayload }))
    }
}

let tmpDir = ''

beforeEach(async () => {
    vi.clearAllMocks()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-word-worker-test-'))
})

afterEach(async () => {
    vi.useRealTimers()
    await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('WordWorkerClient：成功路径', () => {
    it('导入任务应返回 worker 回传的 Markdown，并带上自增 id/任务类型', async () => {
        const { worker, createWorker } = createFakeWorker()
        autoReplySuccess(worker, () => ({ markdown: '# 标题\n\n正文' }))
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        await expect(client.convertDocxToMarkdown('C:\\docs\\a.docx')).resolves.toBe(
            '# 标题\n\n正文'
        )
        expect(worker.posted).toEqual([{ id: 1, type: 'wordImport', filePath: 'C:\\docs\\a.docx' }])
        client.dispose()
    })

    it('导出任务应返回 resolve，并把全文与目标路径传入 worker', async () => {
        const { worker, createWorker } = createFakeWorker()
        autoReplySuccess(worker)
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        await expect(
            client.exportMarkdownToWord('# 导出内容', 'C:\\docs\\out.docx')
        ).resolves.toBeUndefined()
        expect(worker.posted).toEqual([
            { id: 1, type: 'wordExport', content: '# 导出内容', filePath: 'C:\\docs\\out.docx' }
        ])
        client.dispose()
    })

    it('worker 只创建一次（串行复用），连续任务按 id 递增', async () => {
        const createWorker = vi.fn(() => {
            const { worker } = createFakeWorker()
            autoReplySuccess(worker, () => ({ markdown: 'ok' }))
            return worker as unknown as WordWorkerLike
        })
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        await client.convertDocxToMarkdown('a.docx')
        await client.convertDocxToMarkdown('b.docx')

        expect(createWorker).toHaveBeenCalledTimes(1)
        expect(client.getPendingCount()).toBe(0)
        client.dispose()
    })
})

describe('WordWorkerClient：失败路径', () => {
    it('worker 回包 ok:false 应抛 WordWorkerTaskError 并保留错误文案', async () => {
        const { worker, createWorker } = createFakeWorker()
        worker.onPost = (message) => {
            setTimeout(
                () => worker.reply({ id: message.id, ok: false, error: 'docx 文件已损坏' }),
                0
            )
        }
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        const error = await client.convertDocxToMarkdown('bad.docx').catch((reason) => reason)
        expect(error).toBeInstanceOf(WordWorkerTaskError)
        expect(error.message).toBe('docx 文件已损坏')
        client.dispose()
    })

    it('导入成功但缺少 markdown 字段应按任务失败处理', async () => {
        const { worker, createWorker } = createFakeWorker()
        autoReplySuccess(worker)
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        await expect(client.convertDocxToMarkdown('a.docx')).rejects.toBeInstanceOf(
            WordWorkerTaskError
        )
        client.dispose()
    })

    it('worker 启动失败应抛 WordWorkerInfrastructureError（调用方可据此降级）', async () => {
        const client = new WordWorkerClient({
            createWorker: () => {
                throw new Error('Cannot find module word-worker.js')
            },
            idleShutdownMs: 0
        })

        const error = await client.convertDocxToMarkdown('a.docx').catch((reason) => reason)
        expect(error).toBeInstanceOf(WordWorkerInfrastructureError)
        expect(isWordWorkerInfrastructureError(error)).toBe(true)
        expect(error.message).toContain('Word worker 启动失败')
        expect(client.getPendingCount()).toBe(0)
    })

    it('worker 线程 error 事件应拒绝等待中的任务并终止线程', async () => {
        const { worker, createWorker } = createFakeWorker()
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        const task = client.convertDocxToMarkdown('a.docx')
        await Promise.resolve()
        worker.emit('error', new Error('线程崩溃'))

        await expect(task).rejects.toBeInstanceOf(WordWorkerInfrastructureError)
        expect(worker.terminate).toHaveBeenCalledTimes(1)
        expect(client.isWorkerRunning()).toBe(false)
        expect(client.getPendingCount()).toBe(0)
    })

    it('worker 线程异常退出（exit code != 0）应拒绝等待中的任务', async () => {
        const { worker, createWorker } = createFakeWorker()
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        const task = client.convertDocxToMarkdown('a.docx')
        await Promise.resolve()
        worker.emit('exit', 1)

        await expect(task).rejects.toBeInstanceOf(WordWorkerInfrastructureError)
        expect(client.getPendingCount()).toBe(0)
    })

    it('postMessage 同步抛错应拒绝任务而不是悬挂', async () => {
        const { worker, createWorker } = createFakeWorker()
        worker.postMessage = vi.fn(() => {
            throw new Error('MessagePort closed')
        })
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        await expect(client.convertDocxToMarkdown('a.docx')).rejects.toBeInstanceOf(
            WordWorkerInfrastructureError
        )
        expect(client.getPendingCount()).toBe(0)
        client.dispose()
    })

    it('任务超时应抛 WordWorkerTaskError 并回收 worker', async () => {
        vi.useFakeTimers()
        const { worker, createWorker } = createFakeWorker()
        const client = new WordWorkerClient({
            createWorker,
            taskTimeoutMs: 5_000,
            idleShutdownMs: 0
        })

        const task = client.convertDocxToMarkdown('huge.docx')
        const assertion = expect(task).rejects.toBeInstanceOf(WordWorkerTaskError)
        await vi.advanceTimersByTimeAsync(5_000)
        await assertion
        expect(worker.terminate).toHaveBeenCalledTimes(1)
        expect(client.isWorkerRunning()).toBe(false)
        expect(client.getPendingCount()).toBe(0)
    })
})

describe('WordWorkerClient：资源回收', () => {
    it('空闲超过阈值应 terminate worker（再次使用时重新创建）', async () => {
        vi.useFakeTimers()
        const createWorker = vi.fn(() => {
            const { worker } = createFakeWorker()
            autoReplySuccess(worker, () => ({ markdown: 'ok' }))
            return worker as unknown as WordWorkerLike
        })
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 100 })

        await client.convertDocxToMarkdown('a.docx')
        expect(client.isWorkerRunning()).toBe(true)

        await vi.advanceTimersByTimeAsync(100)
        expect(client.isWorkerRunning()).toBe(false)

        // 空闲回收后下一次任务重新创建 worker
        await client.convertDocxToMarkdown('b.docx')
        expect(createWorker).toHaveBeenCalledTimes(2)
        client.dispose()
    })

    it('空闲阈值 <=0 时不自动回收（仅显式 dispose）', async () => {
        vi.useFakeTimers()
        const fake = createFakeWorker()
        autoReplySuccess(fake.worker, () => ({ markdown: 'ok' }))
        const client = new WordWorkerClient({
            createWorker: fake.createWorker,
            idleShutdownMs: 0
        })
        await client.convertDocxToMarkdown('a.docx')
        await vi.advanceTimersByTimeAsync(10_000)
        expect(client.isWorkerRunning()).toBe(true)
        client.dispose()
    })

    it('dispose 应拒绝未完成任务、清空计时器并终止线程', async () => {
        const { worker, createWorker } = createFakeWorker()
        const client = new WordWorkerClient({ createWorker, idleShutdownMs: 0 })

        const task = client.convertDocxToMarkdown('a.docx')
        await Promise.resolve()
        client.dispose()

        await expect(task).rejects.toBeInstanceOf(WordWorkerInfrastructureError)
        expect(worker.terminate).toHaveBeenCalledTimes(1)
        expect(client.getPendingCount()).toBe(0)
        expect(client.isWorkerRunning()).toBe(false)
    })
})

describe('WordWorkerClient：真实 worker_threads 往返', () => {
    it('通过真实线程夹具完成导入/导出（结构化克隆与应答配对）', async () => {
        const client = new WordWorkerClient({
            createWorker: () => new Worker(TEST_SERVER_PATH) as unknown as WordWorkerLike,
            idleShutdownMs: 0
        })
        try {
            await expect(client.convertDocxToMarkdown('C:\\docs\\real.docx')).resolves.toBe(
                '# echo C:\\docs\\real.docx'
            )

            const target = path.join(tmpDir, 'real-out.docx')
            await client.exportMarkdownToWord('真实线程导出', target)
            await expect(fs.readFile(target, 'utf-8')).resolves.toBe(
                `FAKE-DOCX:${'真实线程导出'.length}`
            )
        } finally {
            client.dispose()
        }
    })
})
