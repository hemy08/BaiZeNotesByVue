/**
 * Word 导入/导出 worker 的主进程客户端
 *
 * P2-2（2026-11-20 性能扫描）：主进程通过 `worker_threads` 把 mammoth/turndown/officegen
 * 的重计算移出主线程，本文件只负责「懒启动 worker、请求/应答配对、超时、崩溃回收、
 * 空闲回收」，本身不做任何转换计算。
 *
 * 设计要点：
 * - **懒启动**：只有用户真正执行 Word 导入/导出时才创建 worker（主进程启动期零成本，
 *   不改变 P1-7 的启动期依赖裁剪结论）；
 * - **单 worker 串行复用**：Word 导入/导出是用户手动触发的低频长任务，单线程足够；
 *   消息按自增 id 配对，避免并发请求串包；
 * - **失败分类**：worker 启动失败/线程崩溃/协议异常 → `WordWorkerInfrastructureError`
 *   （调用方降级为主进程内转换，功能可用性兜底）；转换本身失败（docx 损坏等）→
 *   `WordWorkerTaskError`（保留原有错误提示语义，不降级、不重试）；
 * - **无泄漏**：任务超时/线程崩溃会终止 worker；空闲 60s 后自动 terminate 释放线程与
 *   已加载依赖内存；worker 与空闲计时器均 unref，不阻止应用退出。
 *
 * 本文件不 import electron（保持可单测、可被 worker 之外的 Node 环境复用）。
 */

import * as path from 'node:path'
import { Worker } from 'node:worker_threads'
import { WORD_WORKER_TASK, type WordWorkerTaskResponse } from './word-worker-protocol'

/** 默认单任务超时：10 分钟（超大数据量 docx 也留有充足余量；超时视为异常并回收 worker） */
export const WORD_WORKER_TASK_TIMEOUT_MS = 10 * 60 * 1000
/** 默认空闲回收：60s 内无任务则 terminate worker，释放线程与已加载的 mammoth/officegen 内存 */
export const WORD_WORKER_IDLE_SHUTDOWN_MS = 60 * 1000

/**
 * worker 的最小接口（Node `worker_threads.Worker` 的结构子集；单测可注入轻量假实现）。
 * 只声明客户端实际使用的方法，避免测试为了类型完整去实现整个 Worker。
 */
export interface WordWorkerLike {
    postMessage(value: unknown): void
    on(event: 'message', listener: (message: unknown) => void): unknown
    on(event: 'error', listener: (error: Error) => void): unknown
    on(event: 'exit', listener: (code: number) => void): unknown
    terminate(): unknown
    unref?(): void
}

/** worker 基础设施不可用（启动失败/线程崩溃/协议错误/已回收）：调用方可降级为进程内转换 */
export class WordWorkerInfrastructureError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause })
        this.name = 'WordWorkerInfrastructureError'
    }
}

/** worker 正常收到任务但转换失败（docx 损坏、写盘失败等）：保留原始错误语义，不降级 */
export class WordWorkerTaskError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'WordWorkerTaskError'
    }
}

/** 判断是否为「worker 不可用」类错误（调用方据此决定是否降级为进程内转换） */
export function isWordWorkerInfrastructureError(
    error: unknown
): error is WordWorkerInfrastructureError {
    return error instanceof WordWorkerInfrastructureError
}

/** 归一化任意抛出值为错误文案（Error.message 可能为空） */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.trim() || error.name || '未知错误'
    }
    const text = String(error).trim()
    return text || '未知错误'
}

/** 客户端内部的「不含 id」任务输入（id 由客户端按自增序分配，避免调用方参与协议细节） */
type WordWorkerTaskInput =
    | { type: typeof WORD_WORKER_TASK.IMPORT; filePath: string }
    | { type: typeof WORD_WORKER_TASK.EXPORT; content: string; filePath: string }

/** 一条等待 worker 应答的任务 */
interface PendingTask {
    resolve: (response: WordWorkerTaskResponse) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

/** `WordWorkerClient` 的可注入选项（全部有默认值；单测通过 createWorker 注入假 worker） */
export interface WordWorkerClientOptions {
    /** 创建 worker 的工厂；默认加载构建产物同目录的 word-worker.js */
    createWorker?: () => WordWorkerLike
    /** 单任务超时（毫秒，默认 10 分钟） */
    taskTimeoutMs?: number
    /** 空闲回收时间（毫秒，默认 60s；<=0 表示不回收，仅测试/诊断使用） */
    idleShutdownMs?: number
}

/**
 * 解析默认 worker 脚本路径。
 *
 * 构建产物为 CJS（electron-vite main 输出），`__dirname` 指向 out/build/main，
 * 与主入口 index.js 同目录；打包后该路径位于 app.asar 内，Electron 的 worker_threads
 * 已实测可从 asar 加载脚本并解析 asar 内 node_modules。
 * 非 CJS 运行环境（如 vitest 以 ESM 直接运行源码）拿不到 `__dirname`，按基础设施不可用处理。
 */
function resolveDefaultWorkerPath(): string {
    if (typeof __dirname !== 'string' || __dirname.length === 0) {
        throw new WordWorkerInfrastructureError('当前运行环境无法解析 Word worker 路径')
    }
    return path.join(__dirname, 'word-worker.js')
}

/** 默认 worker 工厂：创建真实 worker 并 unref（不阻止应用退出） */
function createDefaultWorker(): WordWorkerLike {
    const workerPath = resolveDefaultWorkerPath()
    const worker = new Worker(workerPath)
    worker.unref()
    return worker as unknown as WordWorkerLike
}

/**
 * Word worker 客户端：串行复用单个 worker，按 id 配对请求/应答，负责超时与回收。
 *
 * 生产代码使用文件底部导出的单例；单测可直接 `new WordWorkerClient({ createWorker })`。
 */
export class WordWorkerClient {
    private readonly createWorker: () => WordWorkerLike
    private readonly taskTimeoutMs: number
    private readonly idleShutdownMs: number

    private worker: WordWorkerLike | null = null
    private idleTimer: NodeJS.Timeout | null = null
    private readonly pending = new Map<number, PendingTask>()
    private nextId = 1

    constructor(options: WordWorkerClientOptions = {}) {
        this.createWorker = options.createWorker ?? createDefaultWorker
        this.taskTimeoutMs = options.taskTimeoutMs ?? WORD_WORKER_TASK_TIMEOUT_MS
        this.idleShutdownMs = options.idleShutdownMs ?? WORD_WORKER_IDLE_SHUTDOWN_MS
    }

    /** 当前是否有存活的 worker 线程（诊断/单测用） */
    isWorkerRunning(): boolean {
        return this.worker !== null
    }

    /** 当前等待应答的任务数（诊断/单测用） */
    getPendingCount(): number {
        return this.pending.size
    }

    /** docx → Markdown；失败时抛 `WordWorkerTaskError` / `WordWorkerInfrastructureError` */
    async convertDocxToMarkdown(filePath: string): Promise<string> {
        const response = await this.run({ type: WORD_WORKER_TASK.IMPORT, filePath })
        if (typeof response.markdown !== 'string') {
            throw new WordWorkerTaskError('Word worker 未返回 Markdown 内容')
        }
        return response.markdown
    }

    /** Markdown → docx 文件；失败时抛 `WordWorkerTaskError` / `WordWorkerInfrastructureError` */
    async exportMarkdownToWord(content: string, filePath: string): Promise<void> {
        await this.run({ type: WORD_WORKER_TASK.EXPORT, content, filePath })
    }

    /** 回收 worker（应用退出/单测清理用）：终止线程并拒绝所有未完成任务，不抛异常 */
    dispose(): void {
        const worker = this.worker
        this.worker = null
        this.clearIdleTimer()
        this.rejectAllPending(new WordWorkerInfrastructureError('Word worker 已回收'))
        if (worker) {
            try {
                void Promise.resolve(worker.terminate()).catch(() => undefined)
            } catch {
                // 终止失败（线程已退出等）不影响清理语义
            }
        }
    }

    /** 发送任务并等待应答（统一处理超时、发消息失败、worker 崩溃） */
    private run(request: WordWorkerTaskInput): Promise<WordWorkerTaskResponse> {
        const promise = new Promise<WordWorkerTaskResponse>((resolve, reject) => {
            let worker: WordWorkerLike
            try {
                worker = this.ensureWorker()
            } catch (error) {
                reject(error)
                return
            }

            const id = this.nextId
            this.nextId += 1
            const timer = setTimeout(() => this.handleTaskTimeout(id), this.taskTimeoutMs)
            timer.unref()
            this.pending.set(id, { resolve, reject, timer })
            this.clearIdleTimer()

            try {
                worker.postMessage({ ...request, id })
            } catch (error) {
                this.pending.delete(id)
                clearTimeout(timer)
                reject(
                    new WordWorkerInfrastructureError(
                        `Word worker 消息发送失败：${toErrorMessage(error)}`,
                        error
                    )
                )
            }
        })

        // 无论成功失败，结算后都尝试安排空闲回收；尚未结束的任务不会触发
        return promise
            .then((response) => {
                if (!response.ok) {
                    throw new WordWorkerTaskError(response.error || 'Word 转换失败')
                }
                return response
            })
            .finally(() => {
                this.scheduleIdleShutdown()
            })
    }

    /** 懒创建 worker 并挂上消息/崩溃监听（创建失败归一化为基础设施错误） */
    private ensureWorker(): WordWorkerLike {
        if (this.worker) {
            return this.worker
        }
        let worker: WordWorkerLike
        try {
            worker = this.createWorker()
        } catch (error) {
            throw new WordWorkerInfrastructureError(
                `Word worker 启动失败：${toErrorMessage(error)}`,
                error
            )
        }
        worker.on('message', (message) => this.handleWorkerMessage(message))
        worker.on('error', (error) => this.handleWorkerFailure(worker, error))
        worker.on('exit', (code) =>
            this.handleWorkerFailure(worker, new Error(`Word worker 线程退出（code=${code}）`))
        )
        this.worker = worker
        return worker
    }

    /** 应答配对：未知 id/非法消息直接忽略（避免旧线程残留消息影响新任务） */
    private handleWorkerMessage(message: unknown): void {
        if (typeof message !== 'object' || message === null) {
            return
        }
        const response = message as Partial<WordWorkerTaskResponse>
        if (typeof response.id !== 'number') {
            return
        }
        const task = this.pending.get(response.id)
        if (!task) {
            return
        }
        this.pending.delete(response.id)
        clearTimeout(task.timer)
        task.resolve({
            id: response.id,
            ok: response.ok === true,
            markdown: typeof response.markdown === 'string' ? response.markdown : undefined,
            error: typeof response.error === 'string' ? response.error : undefined
        })
    }

    /** worker 崩溃/异常退出：终止线程、清空计时器并把所有等待任务按基础设施错误拒绝 */
    private handleWorkerFailure(worker: WordWorkerLike, error: Error): void {
        if (this.worker !== worker) {
            return
        }
        this.worker = null
        this.clearIdleTimer()
        this.rejectAllPending(
            new WordWorkerInfrastructureError(
                `Word worker 线程异常：${toErrorMessage(error)}`,
                error
            )
        )
        try {
            void Promise.resolve(worker.terminate()).catch(() => undefined)
        } catch {
            // 线程可能已退出，忽略
        }
    }

    /** 单任务超时：回收 worker 并按任务错误上报（不在主线程重试，避免主线程再次被阻塞） */
    private handleTaskTimeout(id: number): void {
        const task = this.pending.get(id)
        if (!task) {
            return
        }
        this.pending.delete(id)
        clearTimeout(task.timer)
        const worker = this.worker
        this.worker = null
        this.clearIdleTimer()
        task.reject(
            new WordWorkerTaskError(
                `Word 转换超时（超过 ${this.taskTimeoutMs}ms），已回收 worker 线程`
            )
        )
        // 另一个可能仍挂起的任务（极端并发）随 worker 终止一并失败，避免悬挂
        this.rejectAllPending(new WordWorkerInfrastructureError('Word worker 因任务超时被回收'))
        if (worker) {
            try {
                void Promise.resolve(worker.terminate()).catch(() => undefined)
            } catch {
                // 同上
            }
        }
    }

    /** 拒绝所有等待中的任务（清空定时器，避免计时器泄漏） */
    private rejectAllPending(error: Error): void {
        const tasks = [...this.pending.values()]
        this.pending.clear()
        for (const task of tasks) {
            clearTimeout(task.timer)
            task.reject(error)
        }
    }

    /** 安排空闲回收（已有空闲计时器时重置；无任务/worker 时跳过） */
    private scheduleIdleShutdown(): void {
        this.clearIdleTimer()
        if (this.idleShutdownMs <= 0 || !this.worker || this.pending.size > 0) {
            return
        }
        this.idleTimer = setTimeout(() => {
            this.idleTimer = null
            this.shutdownIdleWorker()
        }, this.idleShutdownMs)
        this.idleTimer.unref()
    }

    /** 空闲回收：仅当无等待任务时终止线程（正常回收不产生错误） */
    private shutdownIdleWorker(): void {
        const worker = this.worker
        if (!worker || this.pending.size > 0) {
            return
        }
        this.worker = null
        try {
            void Promise.resolve(worker.terminate()).catch(() => undefined)
        } catch {
            // 线程已退出，忽略
        }
    }

    /** 清理空闲计时器 */
    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer)
            this.idleTimer = null
        }
    }
}

/** 生产环境单例：Word 导入/导出共用同一 worker 线程（串行复用） */
export const wordWorkerClient = new WordWorkerClient()

/**
 * 应用退出清理（内存与生命周期治理 P3）：终止 Word worker 线程并拒绝未完成任务。
 *
 * 背景：worker 与空闲回收计时器均已 unref（不阻止进程退出），但退出链路
 *（cleanupApp）此前未显式回收该线程——若退出时恰有 Word 转换在途，线程会活到进程
 * 终止；在「关闭窗口但进程常驻（托盘）」场景则要等 60s 空闲回收才释放。
 * 这里提供幂等清理入口，由 main/index.ts 的 cleanupApp 统一调用
 *（WordWorkerClient.dispose 自身幂等：重复调用安全）。
 */
export function disposeWordWorkerClient(): void {
    wordWorkerClient.dispose()
}

/**
 * Word 导入（docx → Markdown）经 worker 执行。
 * 基础设施不可用时调用方应捕获 `WordWorkerInfrastructureError` 并降级为进程内转换。
 */
export function convertDocxToMarkdownWithWorker(filePath: string): Promise<string> {
    return wordWorkerClient.convertDocxToMarkdown(filePath)
}

/**
 * Word 导出（Markdown → docx）经 worker 执行。
 * 基础设施不可用时调用方应捕获 `WordWorkerInfrastructureError` 并降级为进程内导出。
 */
export function exportMarkdownToWordWithWorker(content: string, filePath: string): Promise<void> {
    return wordWorkerClient.exportMarkdownToWord(content, filePath)
}
