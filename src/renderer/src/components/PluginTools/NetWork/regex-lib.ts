/**
 * 正则测试主线程 API（异步：Web Worker + 时间预算）
 *
 * P1-1 修复：用户正则一律在独立 Worker（regex-worker.ts）执行，主线程
 * 永不运行单次 regex.exec()，(a+)+$ 之类的灾难性回溯不再冻结渲染进程
 * （含未保存笔记）。防护策略：
 *   - 前置校验（长度 / 标志 / 语法编译）在主线程完成——编译本身线性耗时，
 *     可安全执行，且语法错误立即可见、不占用 worker 预算；
 *   - 单次匹配设 REGEX_EXEC_TIMEOUT_MS（3 秒）时间预算，超时立即
 *     worker.terminate() 并拒绝本次及在途请求，下次调用自动重建 worker；
 *   - worker 崩溃 / 不可用时同样走「拒绝 + 重建」，主线程永不阻塞；
 *   - 替换展开 substituteReplace 保持主线程线性实现，与匹配解耦。
 *
 * 算法细节（零宽推进、命名分组、截断上限等）见 regex-core.ts，
 * 移植自 jyshare 854 页面的 regex-worker.js。
 */
import {
    compileRegex,
    MAX_INPUT_LENGTH,
    MAX_MATCHES,
    MAX_OUTPUT_LENGTH,
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    substituteReplace,
    type RegexMatch,
    type RegexRunResult
} from './regex-core'

export {
    MAX_INPUT_LENGTH,
    MAX_MATCHES,
    MAX_OUTPUT_LENGTH,
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    substituteReplace,
    type RegexMatch,
    type RegexRunResult
}

/** 单次匹配时间预算（毫秒）：超时即终止 worker 并拒绝调用方 */
export const REGEX_EXEC_TIMEOUT_MS = 3000

/** 超时错误类型：组件据此显示 i18n 的「执行超时」提示 */
export class RegexTimeoutError extends Error {
    constructor() {
        super(
            `匹配执行超过 ${REGEX_EXEC_TIMEOUT_MS / 1000} 秒已中止；该正则可能触发灾难性回溯，请简化表达式或缩短测试文本。`
        )
        this.name = 'RegexTimeoutError'
    }
}

/** 在途请求登记项 */
interface PendingRequest {
    resolve: (result: RegexRunResult) => void
    reject: (error: Error) => void
    /** 时间预算计时器 */
    timer: ReturnType<typeof setTimeout>
}

/** worker 回传信封（纯对象，structured clone 安全，见 regex-worker.ts） */
interface RegexWorkerPayload {
    id: number
    matches?: RegexMatch[]
    truncated?: boolean
    error?: string
}

/**
 * 常驻 worker 管理器：复用同一 worker 串行处理请求；
 * 超时 / 异常时 terminate + 置空，下次调用重建。
 */
class RegexRunner {
    private worker: Worker | null = null
    private nextId = 1
    private readonly pending = new Map<number, PendingRequest>()

    /**
     * 执行正则匹配（异步）。
     * 前置校验失败与超时均以 rejected promise 呈现，不会同步抛出。
     */
    run(pattern: string, flags: string, input: string): Promise<RegexRunResult> {
        // 前置校验：长度 / 标志 / 语法。编译线性耗时，主线程安全；失败快速拒绝。
        try {
            compileRegex(pattern, flags, input)
        } catch (error) {
            return Promise.reject(error)
        }

        let worker: Worker
        try {
            worker = this.ensureWorker()
        } catch (error) {
            return Promise.reject(error)
        }

        const id = this.nextId++
        return new Promise<RegexRunResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                // 时间预算耗尽：终止 worker 并拒绝本次及全部在途请求
                this.failAll(new RegexTimeoutError())
            }, REGEX_EXEC_TIMEOUT_MS)
            this.pending.set(id, { resolve, reject, timer })
            try {
                worker.postMessage({ id, pattern, flags, text: input })
            } catch {
                // postMessage 失败（worker 已被外部终止等）：拒绝本次及全部在途请求并重建
                this.failAll(new Error('正则匹配后台线程不可用，已中止。请重试。'))
            }
        })
    }

    /** 释放 worker 与全部在途请求（组件卸载时调用） */
    dispose(): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(new Error('正则匹配已取消。'))
        }
        this.pending.clear()
        this.destroyWorker()
    }

    /** 获取或创建常驻 worker（创建失败时抛出，由调用方转为 rejected） */
    private ensureWorker(): Worker {
        if (this.worker) return this.worker
        const worker = new Worker(new URL('./regex-worker.ts', import.meta.url), {
            type: 'module'
        })
        worker.onmessage = (event: MessageEvent) => {
            this.onMessage(event.data as RegexWorkerPayload)
        }
        worker.onerror = () => {
            this.failAll(new Error('正则匹配后台线程异常，已中止。请重试或简化表达式。'))
        }
        this.worker = worker
        return worker
    }

    /** 处理 worker 回传：配对在途请求并清理计时器 */
    private onMessage(payload: RegexWorkerPayload): void {
        if (!payload || typeof payload.id !== 'number') return
        const pending = this.pending.get(payload.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(payload.id)
        if (payload.error !== undefined) {
            pending.reject(new Error(payload.error))
            return
        }
        const result = (payload.matches ?? []) as RegexRunResult
        if (payload.truncated) {
            result.truncated = true
        }
        pending.resolve(result)
    }

    /** 终止 worker 并拒绝全部在途请求（超时 / 线程异常 / 通道故障共用） */
    private failAll(error: Error): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(error)
        }
        this.pending.clear()
        this.destroyWorker()
    }

    /** 终止并丢弃当前 worker（下次调用重建） */
    private destroyWorker(): void {
        this.worker?.terminate()
        this.worker = null
    }
}

/** 进程内单例 runner（worker 常驻复用） */
let runner: RegexRunner | null = null

function getRunner(): RegexRunner {
    if (!runner) {
        runner = new RegexRunner()
    }
    return runner
}

/**
 * 执行正则匹配（异步：Web Worker + 3 秒时间预算）。
 * @param pattern 正则表达式
 * @param flags 标志字符串（d/g/i/m/s/u/v/y 组合，u/v 互斥）
 * @param input 测试文本
 * @returns 匹配结果数组（达到 5000 项上限时截断并置 truncated 标志）
 * @rejects 非法标志 / 超长输入 / 正则语法错误 / 超时（RegexTimeoutError）
 */
export function runRegex(pattern: string, flags: string, input: string): Promise<RegexRunResult> {
    return getRunner().run(pattern, flags, input)
}

/** 释放常驻 worker（RegexTester 卸载时调用，避免 worker 线程常驻） */
export function disposeRegexRunner(): void {
    runner?.dispose()
    runner = null
}
