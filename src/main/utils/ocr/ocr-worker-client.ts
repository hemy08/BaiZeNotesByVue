/**
 * OCR worker 的主进程客户端（1.5.2 E3）
 *
 * 参考既有 Word worker 客户端（`utils/file-utils/word-worker-client.ts`）的成熟模式：
 * 懒启动、请求/应答按自增 id 配对、超时回收、崩溃回收、空闲回收、进程退出幂等清理。
 * 与 Word worker 的差异：
 * - **串行队列**：OCR 是内存敏感任务（单次识别可能占用 100~300MB），同一时刻只允许一个
 *   任务在 worker 内执行；并发请求在客户端排队，worker 内状态（core/语言/api）无需加锁；
 * - **空闲回收 5 分钟**（Word 为 60s）：OCR 首次识别包含 2.7 MiB wasm 加载与 10 MiB 语言包
 *   解压/初始化（数秒到数十秒），短空闲回收会让频繁截图的用户反复付出该成本；
 *   worker 与空闲计时器均 unref，不阻止应用退出；进程退出由 cleanupApp 显式 dispose。
 *
 * 本文件不 import electron（保持可单测）；worker 脚本路径由 `__dirname` 解析，
 * 构建产物为 `out/build/main/ocr-worker.js`（electron.vite.config.ts 独立入口）。
 */
import * as path from 'node:path'
import { Worker } from 'node:worker_threads'
import { OCR_WORKER_TASK, type OcrWorkerTaskResponse } from './ocr-protocol'

/** 单任务超时：2 分钟（含首次 wasm 加载 + 语言包解压 + initialize；超时视为异常并回收 worker） */
export const OCR_WORKER_TASK_TIMEOUT_MS = 2 * 60 * 1000

/** 空闲回收：5 分钟内无任务则 terminate worker，释放 wasm/语言数据内存 */
export const OCR_WORKER_IDLE_SHUTDOWN_MS = 5 * 60 * 1000

/** worker 的最小接口（Node `worker_threads.Worker` 的结构子集；单测可注入轻量假实现） */
export interface OcrWorkerLike {
    postMessage(value: unknown): void
    on(event: 'message', listener: (message: unknown) => void): unknown
    on(event: 'error', listener: (error: Error) => void): unknown
    on(event: 'exit', listener: (code: number) => void): unknown
    terminate(): unknown
    unref?(): void
}

/** worker 基础设施不可用（启动失败/线程崩溃/协议错误/已回收）：调用方可提示重试 */
export class OcrWorkerInfrastructureError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause })
        this.name = 'OcrWorkerInfrastructureError'
    }
}

/** worker 正常收到任务但识别失败（语言包损坏/初始化失败等）：保留原始错误语义，不重试 */
export class OcrWorkerTaskError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'OcrWorkerTaskError'
    }
}

/** 判断是否为「worker 不可用」类错误（IPC 层映射为 worker-unavailable 错误码） */
export function isOcrWorkerInfrastructureError(
    error: unknown
): error is OcrWorkerInfrastructureError {
    return error instanceof OcrWorkerInfrastructureError
}

/** 判断是否为「worker 已运行但识别失败」类错误（IPC 层映射为 recognition-failed / lang-init-failed） */
export function isOcrWorkerTaskError(error: unknown): error is OcrWorkerTaskError {
    return error instanceof OcrWorkerTaskError
}

/** 归一化任意抛出值为错误文案（Error.message 可能为空） */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.trim() || error.name || '未知错误'
    }
    const text = String(error ?? '').trim()
    return text || '未知错误'
}

/** 等待中的任务（串行队列元素） */
interface QueuedTask {
    input: { lang: string; langDir: string; imageBytes: Uint8Array }
    resolve: (response: OcrWorkerTaskResponse) => void
    reject: (error: Error) => void
}

/** 正在执行的任务（已发送给 worker，等待应答） */
interface InFlightTask {
    id: number
    resolve: (response: OcrWorkerTaskResponse) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

/** `OcrWorkerClient` 的可注入选项（全部有默认值；单测通过 createWorker 注入假 worker） */
export interface OcrWorkerClientOptions {
    /** 创建 worker 的工厂；默认加载构建产物同目录的 ocr-worker.js */
    createWorker?: () => OcrWorkerLike
    /** 单任务超时（毫秒，默认 2 分钟） */
    taskTimeoutMs?: number
    /** 空闲回收时间（毫秒，默认 5 分钟；<=0 表示不回收，仅测试/诊断使用） */
    idleShutdownMs?: number
}

/**
 * 解析默认 worker 脚本路径。
 *
 * 构建产物为 CJS（electron-vite main 输出），`__dirname` 指向 out/build/main，与主入口
 * index.js 同目录；打包后该路径位于 app.asar 内（Electron worker_threads 可从 asar 加载，
 * Word worker 同链路已实测）。非 CJS 运行环境（如 vitest 以 ESM 直接运行源码）拿不到
 * `__dirname`，按基础设施不可用处理。
 */
function resolveDefaultWorkerPath(): string {
    if (typeof __dirname !== 'string' || __dirname.length === 0) {
        throw new OcrWorkerInfrastructureError('当前运行环境无法解析 OCR worker 路径')
    }
    return path.join(__dirname, 'ocr-worker.js')
}

/** 默认 worker 工厂：创建真实 worker 并 unref（不阻止应用退出） */
function createDefaultWorker(): OcrWorkerLike {
    const workerPath = resolveDefaultWorkerPath()
    const worker = new Worker(workerPath)
    worker.unref()
    return worker as unknown as OcrWorkerLike
}

/**
 * OCR worker 客户端：串行复用单个 worker，按 id 配对请求/应答，负责超时与空闲回收。
 *
 * 生产代码使用文件底部导出的单例；单测可直接 `new OcrWorkerClient({ createWorker })`。
 */
export class OcrWorkerClient {
    private readonly createWorker: () => OcrWorkerLike
    private readonly taskTimeoutMs: number
    private readonly idleShutdownMs: number

    private worker: OcrWorkerLike | null = null
    private idleTimer: NodeJS.Timeout | null = null
    private inFlight: InFlightTask | null = null
    private readonly queue: QueuedTask[] = []
    private nextId = 1

    constructor(options: OcrWorkerClientOptions = {}) {
        this.createWorker = options.createWorker ?? createDefaultWorker
        this.taskTimeoutMs = options.taskTimeoutMs ?? OCR_WORKER_TASK_TIMEOUT_MS
        this.idleShutdownMs = options.idleShutdownMs ?? OCR_WORKER_IDLE_SHUTDOWN_MS
    }

    /** 当前是否有存活的 worker 线程（诊断/单测用） */
    isWorkerRunning(): boolean {
        return this.worker !== null
    }

    /** 当前排队等待的任务数（诊断/单测用） */
    getPendingCount(): number {
        return this.queue.length + (this.inFlight ? 1 : 0)
    }

    /**
     * 识别 PNG 图片文字（串行排队；失败抛 `OcrWorkerTaskError` / `OcrWorkerInfrastructureError`）。
     *
     * @param lang 语言代码
     * @param langDir 语言包目录绝对路径
     * @param imageBytes 已校验的 PNG 字节
     */
    recognize(
        lang: string,
        langDir: string,
        imageBytes: Uint8Array
    ): Promise<OcrWorkerTaskResponse> {
        return new Promise<OcrWorkerTaskResponse>((resolve, reject) => {
            this.queue.push({ input: { lang, langDir, imageBytes }, resolve, reject })
            this.processNext()
        })
    }

    /** 回收 worker（应用退出/单测清理用）：终止线程并拒绝所有未完成任务，不抛异常 */
    dispose(): void {
        const worker = this.worker
        this.worker = null
        this.clearIdleTimer()
        this.rejectAll(new OcrWorkerInfrastructureError('OCR worker 已回收'))
        if (worker) {
            try {
                void Promise.resolve(worker.terminate()).catch(() => undefined)
            } catch {
                // 终止失败（线程已退出等）不影响清理语义
            }
        }
    }

    /** 从队列取下一个任务发送给 worker（同一时刻只允许一个在途任务） */
    private processNext(): void {
        if (this.inFlight || this.queue.length === 0) {
            return
        }
        const task = this.queue.shift()
        if (!task) {
            return
        }
        let worker: OcrWorkerLike
        try {
            worker = this.ensureWorker()
        } catch (error) {
            if (error instanceof OcrWorkerInfrastructureError) {
                task.reject(error)
            } else {
                task.reject(
                    new OcrWorkerInfrastructureError(
                        `OCR worker 启动失败：${toErrorMessage(error)}`,
                        error
                    )
                )
            }
            // 单个任务启动失败：继续尝试后续排队任务（下次会重新尝试启动）
            this.processNext()
            return
        }
        const id = this.nextId
        this.nextId += 1
        const timer = setTimeout(() => this.handleTaskTimeout(id), this.taskTimeoutMs)
        timer.unref?.()
        this.clearIdleTimer()
        this.inFlight = { id, resolve: task.resolve, reject: task.reject, timer }
        try {
            worker.postMessage({ id, type: OCR_WORKER_TASK.RECOGNIZE, ...task.input })
        } catch (error) {
            this.inFlight = null
            clearTimeout(timer)
            task.reject(
                new OcrWorkerInfrastructureError(
                    `OCR worker 消息发送失败：${toErrorMessage(error)}`,
                    error
                )
            )
            this.recycleWorker()
            this.processNext()
        }
    }

    /** 懒创建 worker 并挂上消息/崩溃监听（创建失败归一化为基础设施错误） */
    private ensureWorker(): OcrWorkerLike {
        if (this.worker) {
            return this.worker
        }
        let worker: OcrWorkerLike
        try {
            worker = this.createWorker()
        } catch (error) {
            throw new OcrWorkerInfrastructureError(
                `OCR worker 启动失败：${toErrorMessage(error)}`,
                error
            )
        }
        worker.on('message', (message) => this.handleWorkerMessage(message))
        worker.on('error', (error) => this.handleWorkerFailure(worker, error))
        worker.on('exit', (code) =>
            this.handleWorkerFailure(worker, new Error(`OCR worker 线程退出（code=${code}）`))
        )
        this.worker = worker
        return worker
    }

    /** 应答配对：未知 id/非法消息直接忽略（避免旧线程残留消息影响新任务） */
    private handleWorkerMessage(message: unknown): void {
        if (typeof message !== 'object' || message === null) {
            return
        }
        const response = message as Partial<OcrWorkerTaskResponse>
        if (typeof response.id !== 'number' || !this.inFlight || this.inFlight.id !== response.id) {
            return
        }
        const task = this.inFlight
        this.inFlight = null
        clearTimeout(task.timer)
        task.resolve({
            id: response.id,
            ok: response.ok === true,
            text: typeof response.text === 'string' ? response.text : undefined,
            elapsedMs: typeof response.elapsedMs === 'number' ? response.elapsedMs : undefined,
            error: typeof response.error === 'string' ? response.error : undefined
        })
        this.scheduleIdleShutdown()
        this.processNext()
    }

    /** worker 崩溃/异常退出：终止线程、清空计时器并把在途与排队任务按基础设施错误拒绝 */
    private handleWorkerFailure(worker: OcrWorkerLike, error: Error): void {
        if (this.worker !== worker) {
            return
        }
        this.worker = null
        this.clearIdleTimer()
        this.rejectInFlight(
            new OcrWorkerInfrastructureError(`OCR worker 线程异常：${toErrorMessage(error)}`, error)
        )
        this.rejectQueue(new OcrWorkerInfrastructureError('OCR worker 线程异常，任务已取消'))
        try {
            void Promise.resolve(worker.terminate()).catch(() => undefined)
        } catch {
            // 线程可能已退出，忽略
        }
    }

    /** 单任务超时：回收 worker 并按任务错误上报（不在主线程重试，避免重复卡顿） */
    private handleTaskTimeout(id: number): void {
        if (!this.inFlight || this.inFlight.id !== id) {
            return
        }
        const task = this.inFlight
        this.inFlight = null
        clearTimeout(task.timer)
        task.reject(
            new OcrWorkerTaskError(
                `OCR 识别超时（超过 ${this.taskTimeoutMs}ms），已回收 worker 线程`
            )
        )
        this.recycleWorker()
        this.rejectQueue(new OcrWorkerInfrastructureError('OCR worker 因任务超时被回收'))
    }

    /** 终止并清空当前 worker（失败静默，回收语义由调用方保证） */
    private recycleWorker(): void {
        const worker = this.worker
        this.worker = null
        this.clearIdleTimer()
        if (worker) {
            try {
                void Promise.resolve(worker.terminate()).catch(() => undefined)
            } catch {
                // 线程已退出，忽略
            }
        }
    }

    /** 拒绝在途任务（清空计时器，避免计时器泄漏） */
    private rejectInFlight(error: Error): void {
        const task = this.inFlight
        this.inFlight = null
        if (!task) {
            return
        }
        clearTimeout(task.timer)
        task.reject(error)
    }

    /** 拒绝排队任务（清空数组，避免悬挂） */
    private rejectQueue(error: Error): void {
        const tasks = this.queue.splice(0)
        for (const task of tasks) {
            task.reject(error)
        }
    }

    /** 拒绝全部未完成任务 */
    private rejectAll(error: Error): void {
        this.rejectInFlight(error)
        this.rejectQueue(error)
    }

    /** 安排空闲回收（任务结算后调用；已有空闲计时器时重置；无 worker 时跳过） */
    private scheduleIdleShutdown(): void {
        this.clearIdleTimer()
        if (this.idleShutdownMs <= 0 || !this.worker || this.inFlight || this.queue.length > 0) {
            return
        }
        this.idleTimer = setTimeout(() => {
            this.idleTimer = null
            this.shutdownIdleWorker()
        }, this.idleShutdownMs)
        this.idleTimer.unref?.()
    }

    /** 空闲回收：仅当无在途/排队任务时终止线程（正常回收不产生错误） */
    private shutdownIdleWorker(): void {
        if (!this.worker || this.inFlight || this.queue.length > 0) {
            return
        }
        this.recycleWorker()
    }

    /** 清理空闲计时器 */
    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer)
            this.idleTimer = null
        }
    }
}

/** 生产环境单例：OCR 语言准备与识别共享同一 worker 线程（串行复用） */
export const ocrWorkerClient = new OcrWorkerClient()

/**
 * 应用退出清理：终止 OCR worker 线程并拒绝未完成任务（幂等，由 main/index.ts cleanupApp 调用）。
 */
export function disposeOcrWorkerClient(): void {
    ocrWorkerClient.dispose()
}

/**
 * 识别 PNG 图片文字（主进程 OCR 管线入口）。
 *
 * 失败语义：
 * - `OcrWorkerInfrastructureError` → worker 不可用（IPC 层映射 worker-unavailable）；
 * - `OcrWorkerTaskError` → worker 已运行但识别/初始化失败（映射 recognition-failed /
 *   lang-init-failed，由调用方按错误文案细分）。
 */
export function recognizeOcrImageWithWorker(
    lang: string,
    langDir: string,
    imageBytes: Uint8Array
): Promise<{ text: string; elapsedMs: number }> {
    return ocrWorkerClient.recognize(lang, langDir, imageBytes).then((response) => {
        if (!response.ok) {
            throw new OcrWorkerTaskError(response.error || 'OCR 识别失败')
        }
        return {
            text: typeof response.text === 'string' ? response.text : '',
            elapsedMs: typeof response.elapsedMs === 'number' ? response.elapsedMs : 0
        }
    })
}
