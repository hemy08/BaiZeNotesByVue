/**
 * 1.5.2 E3 OCR worker 主进程客户端单测（`src/main/utils/ocr/ocr-worker-client.ts`）
 *
 * 覆盖目标（以注入假 worker 的方式，不启动真实线程/wasm）：
 * 1. 懒启动 + 串行队列：首个任务才创建 worker；同一时刻只有一个在途任务；应答后继续下一个；
 * 2. 请求/应答按 id 配对；未知 id/非法消息忽略；
 * 3. 错误分类：worker 创建失败/线程 error/exit/消息发送失败/超时 → 基础设施或任务错误，
 *    并回收 worker；worker 业务失败 → `OcrWorkerTaskError`；
 * 4. 空闲回收（idleShutdownMs）与 dispose 幂等；
 * 5. `recognizeOcrImageWithWorker` 返回映射与单例 dispose 入口；错误类型守卫。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    OCR_WORKER_IDLE_SHUTDOWN_MS,
    OCR_WORKER_TASK_TIMEOUT_MS,
    OcrWorkerClient,
    OcrWorkerInfrastructureError,
    OcrWorkerTaskError,
    disposeOcrWorkerClient,
    isOcrWorkerInfrastructureError,
    isOcrWorkerTaskError,
    ocrWorkerClient,
    recognizeOcrImageWithWorker,
    type OcrWorkerLike
} from '../../src/main/utils/ocr/ocr-worker-client'

/** 假 worker：记录监听器/posted/terminate，并提供 emit 触发事件 */
class FakeWorker implements OcrWorkerLike {
    posted: Array<Record<string, unknown>> = []
    terminated = false
    unref = vi.fn()
    private listeners = new Map<string, Array<(arg: unknown) => void>>()
    private readonly throwOnPost: boolean

    constructor(options: { throwOnPost?: boolean } = {}) {
        this.throwOnPost = options.throwOnPost ?? false
    }

    postMessage(value: unknown): void {
        if (this.throwOnPost) {
            throw new Error('postMessage failed')
        }
        this.posted.push(value as Record<string, unknown>)
    }

    on(event: string, listener: (arg: never) => void): unknown {
        const list = this.listeners.get(event) ?? []
        list.push(listener as (arg: unknown) => void)
        this.listeners.set(event, list)
        return this
    }

    terminate(): unknown {
        this.terminated = true
        return Promise.resolve()
    }

    /** 触发事件（模拟 worker 线程回包/崩溃） */
    emit(event: string, arg: unknown): void {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(arg)
        }
    }
}

/** 最后一个创建的假 worker（默认工厂） */
let fakeWorker: FakeWorker | null = null

/** 创建由单个假 worker 支撑的客户端 */
function makeClient(
    options: {
        throwOnCreate?: boolean
        throwOnPost?: boolean
        taskTimeoutMs?: number
        idleShutdownMs?: number
    } = {}
): { client: OcrWorkerClient; worker: FakeWorker } {
    const worker = new FakeWorker({ throwOnPost: options.throwOnPost })
    fakeWorker = worker
    const client = new OcrWorkerClient({
        createWorker: () => {
            if (options.throwOnCreate) {
                throw new Error('worker spawn failed')
            }
            return worker
        },
        taskTimeoutMs: options.taskTimeoutMs ?? 30_000,
        idleShutdownMs: options.idleShutdownMs ?? 0
    })
    return { client, worker }
}

const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

beforeEach(() => {
    fakeWorker = null
})

afterEach(() => {
    vi.useRealTimers()
})

describe('OcrWorkerClient：懒启动与串行队列', () => {
    it('默认常量口径：单任务超时 2 分钟、空闲回收 5 分钟', () => {
        expect(OCR_WORKER_TASK_TIMEOUT_MS).toBe(2 * 60 * 1000)
        expect(OCR_WORKER_IDLE_SHUTDOWN_MS).toBe(5 * 60 * 1000)
    })

    it('首个任务才创建 worker；串行执行：前一个应答后第二个才发送', async () => {
        const createWorker = vi.fn(() => {
            const worker = new FakeWorker()
            fakeWorker = worker
            return worker
        })
        const client = new OcrWorkerClient({ createWorker, idleShutdownMs: 0 })
        expect(createWorker).not.toHaveBeenCalled()
        expect(client.isWorkerRunning()).toBe(false)
        expect(client.getPendingCount()).toBe(0)

        const first = client.recognize('eng', '/lang', imageBytes)
        const second = client.recognize('eng', '/lang', imageBytes)
        expect(createWorker).toHaveBeenCalledTimes(1)
        expect(client.isWorkerRunning()).toBe(true)
        expect(client.getPendingCount()).toBe(2)
        const worker = fakeWorker as FakeWorker
        expect(worker.posted).toHaveLength(1)
        expect(worker.posted[0]).toMatchObject({
            id: 1,
            type: 'ocrRecognize',
            lang: 'eng',
            langDir: '/lang'
        })
        expect(worker.posted[0].imageBytes).toBe(imageBytes)

        worker.emit('message', { id: 1, ok: true, text: 'first', elapsedMs: 5 })
        await expect(first).resolves.toMatchObject({ id: 1, ok: true, text: 'first' })
        expect(worker.posted).toHaveLength(2)
        expect(worker.posted[1]).toMatchObject({ id: 2 })

        worker.emit('message', { id: 2, ok: true, text: 'second', elapsedMs: 6 })
        await expect(second).resolves.toMatchObject({ id: 2, ok: true, text: 'second' })
        expect(client.getPendingCount()).toBe(0)
    })

    it('应答配对：未知 id / 非法消息直接忽略；缺失 text/elapsedMs 归一化', async () => {
        const { client, worker } = makeClient()
        const pending = client.recognize('eng', '/lang', imageBytes)
        worker.emit('message', null)
        worker.emit('message', 42)
        worker.emit('message', {})
        worker.emit('message', { id: 999, ok: true })
        worker.emit('message', { id: 1, ok: true })
        await expect(pending).resolves.toEqual({
            id: 1,
            ok: true,
            text: undefined,
            elapsedMs: undefined,
            error: undefined
        })
    })

    it('worker 业务失败应答：resolve 为 ok=false + error（由上层包装映射为任务错误）', async () => {
        const { client, worker } = makeClient()
        const pending = client.recognize('eng', '/lang', imageBytes)
        worker.emit('message', { id: 1, ok: false, error: 'initialization failed' })
        await expect(pending).resolves.toEqual({
            id: 1,
            ok: false,
            text: undefined,
            elapsedMs: undefined,
            error: 'initialization failed'
        })
    })
})

describe('OcrWorkerClient：错误分类与回收', () => {
    it('worker 创建失败 → 基础设施错误（可重试），不缓存失败状态', async () => {
        const client = new OcrWorkerClient({
            createWorker: () => {
                throw new Error('spawn failed')
            },
            idleShutdownMs: 0
        })
        await expect(client.recognize('eng', '/lang', imageBytes)).rejects.toBeInstanceOf(
            OcrWorkerInfrastructureError
        )
        expect(client.isWorkerRunning()).toBe(false)
        expect(client.getPendingCount()).toBe(0)
    })

    it('默认工厂在非 CJS 环境（无 __dirname）→ 基础设施错误', async () => {
        const client = new OcrWorkerClient({ idleShutdownMs: 0 })
        await expect(client.recognize('eng', '/lang', imageBytes)).rejects.toBeInstanceOf(
            OcrWorkerInfrastructureError
        )
    })

    it('worker error 事件：在途与排队任务均按基础设施错误拒绝并终止线程', async () => {
        const { client, worker } = makeClient()
        const first = client.recognize('eng', '/lang', imageBytes)
        const second = client.recognize('eng', '/lang', imageBytes)
        worker.emit('error', new Error('thread crashed'))
        await expect(first).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)
        await expect(second).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)
        expect(worker.terminated).toBe(true)
        expect(client.isWorkerRunning()).toBe(false)
    })

    it('worker exit 事件：同 error 处理（含退出码文案）', async () => {
        const { client, worker } = makeClient()
        const first = client.recognize('eng', '/lang', imageBytes)
        worker.emit('exit', 1)
        await expect(first).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)
        expect(worker.terminated).toBe(true)
    })

    it('消息发送失败 → 基础设施错误并回收 worker', async () => {
        const { client, worker } = makeClient({ throwOnPost: true })
        await expect(client.recognize('eng', '/lang', imageBytes)).rejects.toBeInstanceOf(
            OcrWorkerInfrastructureError
        )
        expect(worker.terminated).toBe(true)
        expect(client.isWorkerRunning()).toBe(false)
    })

    it('单任务超时 → 任务错误 + 回收 worker + 排队任务取消', async () => {
        vi.useFakeTimers()
        const { client, worker } = makeClient({ taskTimeoutMs: 1000 })
        const first = client.recognize('eng', '/lang', imageBytes)
        const second = client.recognize('eng', '/lang', imageBytes)
        const firstAssertion = expect(first).rejects.toBeInstanceOf(OcrWorkerTaskError)
        const secondAssertion = expect(second).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)
        await Promise.resolve()
        vi.advanceTimersByTime(1000)
        await firstAssertion
        await secondAssertion
        expect(worker.terminated).toBe(true)
        expect(client.isWorkerRunning()).toBe(false)
    })

    it('回收后再次调用会重新创建 worker（可恢复）', async () => {
        let created = 0
        const workers: FakeWorker[] = []
        const client = new OcrWorkerClient({
            createWorker: () => {
                created += 1
                const worker = new FakeWorker()
                workers.push(worker)
                return worker
            },
            idleShutdownMs: 0
        })
        const first = client.recognize('eng', '/lang', imageBytes)
        workers[0].emit('error', new Error('crash'))
        await expect(first).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)

        const second = client.recognize('eng', '/lang', imageBytes)
        expect(created).toBe(2)
        workers[1].emit('message', { id: 2, ok: true, text: 'ok', elapsedMs: 1 })
        await expect(second).resolves.toMatchObject({ ok: true, text: 'ok' })
    })
})

describe('OcrWorkerClient：空闲回收与 dispose', () => {
    it('空闲超时后终止 worker，释放 wasm/语言内存', async () => {
        vi.useFakeTimers()
        const { client, worker } = makeClient({ idleShutdownMs: 500 })
        const pending = client.recognize('eng', '/lang', imageBytes)
        worker.emit('message', { id: 1, ok: true, text: 'x', elapsedMs: 1 })
        await expect(pending).resolves.toMatchObject({ ok: true })
        expect(worker.terminated).toBe(false)
        vi.advanceTimersByTime(500)
        expect(worker.terminated).toBe(true)
        expect(client.isWorkerRunning()).toBe(false)
    })

    it('dispose：拒绝未完成任务、终止线程、幂等', async () => {
        const { client, worker } = makeClient()
        const first = client.recognize('eng', '/lang', imageBytes)
        const second = client.recognize('eng', '/lang', imageBytes)
        client.dispose()
        await expect(first).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)
        await expect(second).rejects.toBeInstanceOf(OcrWorkerInfrastructureError)
        expect(worker.terminated).toBe(true)
        expect(client.isWorkerRunning()).toBe(false)
        // 幂等：重复 dispose 不抛异常
        expect(() => client.dispose()).not.toThrow()
        // dispose 后再次调用会重新创建 worker（不会永久残废）
        const third = client.recognize('eng', '/lang', imageBytes)
        expect(client.isWorkerRunning()).toBe(true)
        // 第二个任务从未获得 id（排队时被 dispose 取消），第三个任务实际 id 为 2
        const thirdRequest = worker.posted.at(-1) as { id: number }
        worker.emit('message', { id: thirdRequest.id, ok: true, text: 'again', elapsedMs: 1 })
        await expect(third).resolves.toMatchObject({ ok: true, text: 'again' })
    })
})

describe('recognizeOcrImageWithWorker 与单例入口', () => {
    it('成功应答 → 返回 text/elapsedMs；缺省字段回退空串/0', async () => {
        const spy = vi
            .spyOn(ocrWorkerClient, 'recognize')
            .mockResolvedValueOnce({ id: 1, ok: true, text: 'Hello', elapsedMs: 12 })
            .mockResolvedValueOnce({ id: 2, ok: true })
        await expect(recognizeOcrImageWithWorker('eng', '/lang', imageBytes)).resolves.toEqual({
            text: 'Hello',
            elapsedMs: 12
        })
        await expect(recognizeOcrImageWithWorker('eng', '/lang', imageBytes)).resolves.toEqual({
            text: '',
            elapsedMs: 0
        })
        expect(spy).toHaveBeenCalledWith('eng', '/lang', imageBytes)
    })

    it('ok=false 应答 → 抛出任务错误（保留 worker 错误文案）', async () => {
        vi.spyOn(ocrWorkerClient, 'recognize').mockResolvedValueOnce({
            id: 1,
            ok: false,
            error: 'initialization failed'
        })
        await expect(
            recognizeOcrImageWithWorker('eng', '/lang', imageBytes)
        ).rejects.toBeInstanceOf(OcrWorkerTaskError)
    })

    it('disposeOcrWorkerClient 调用单例 dispose（幂等空操作安全）', () => {
        const spy = vi.spyOn(ocrWorkerClient, 'dispose').mockImplementation(() => undefined)
        disposeOcrWorkerClient()
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('错误类型守卫：分别识别两类错误与普通错误', () => {
        expect(isOcrWorkerInfrastructureError(new OcrWorkerInfrastructureError('x'))).toBe(true)
        expect(isOcrWorkerInfrastructureError(new OcrWorkerTaskError('x'))).toBe(false)
        expect(isOcrWorkerInfrastructureError(new Error('x'))).toBe(false)
        expect(isOcrWorkerTaskError(new OcrWorkerTaskError('x'))).toBe(true)
        expect(isOcrWorkerTaskError(new OcrWorkerInfrastructureError('x'))).toBe(false)
        expect(isOcrWorkerTaskError('x')).toBe(false)
    })
})
