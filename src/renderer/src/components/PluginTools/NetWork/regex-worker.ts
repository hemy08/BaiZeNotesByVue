/**
 * 正则测试 Web Worker 入口（P1-1：灾难性回溯主线程冻结修复）
 *
 * 主线程 regex-lib.ts 通过
 * `new Worker(new URL('./regex-worker.ts', import.meta.url), { type: 'module' })`
 * 启动本模块：用户正则在独立线程执行，主线程为单次匹配设 3 秒时间预算，
 * 超时直接 worker.terminate() 并拒绝调用方，渲染进程（含未保存笔记）不再
 * 因 (a+)+$ 之类灾难性回溯而无限期冻结。
 *
 * 通信协议（structured clone 安全的纯对象）：
 *   请求 { id, pattern, flags, text }
 *   响应 { id, matches, truncated }（成功）或 { id, error }（失败，中文提示）
 */
import { runRegexCore, type RegexMatch } from './regex-core'

/** 主线程 → worker 请求 */
export interface RegexWorkerRequest {
    /** 请求序号（主线程分配，用于配对响应与清理超时） */
    id: number
    /** 正则表达式 */
    pattern: string
    /** 标志字符串（d/g/i/m/s/u/v/y 组合，u/v 互斥） */
    flags: string
    /** 测试文本 */
    text: string
}

/** worker → 主线程响应（纯对象，structured clone 安全） */
export interface RegexWorkerResponse {
    /** 请求序号（原样回传） */
    id: number
    /** 匹配结果（成功时存在） */
    matches?: RegexMatch[]
    /** 匹配数达 5000 项上限被截断（成功且截断时为 true） */
    truncated?: boolean
    /** 中文错误信息（失败时存在） */
    error?: string
}

/**
 * 处理单条匹配请求（纯函数）。
 * 独立导出以便单测直接覆盖协议层，无需真实 worker 环境。
 */
export function handleRegexRequest(request: RegexWorkerRequest): RegexWorkerResponse {
    try {
        const result = runRegexCore(request.pattern, request.flags, request.text)
        const response: RegexWorkerResponse = { id: request.id, matches: result }
        if (result.truncated) {
            response.truncated = true
        }
        return response
    } catch (error) {
        return { id: request.id, error: error instanceof Error ? error.message : String(error) }
    }
}

// 模块 worker 全局作用域最小接口（不依赖 lib.webworker，web/test 两套 tsconfig 均可编译）
interface RegexWorkerScope {
    onmessage: ((event: MessageEvent<RegexWorkerRequest>) => void) | null
    postMessage(message: RegexWorkerResponse): void
}

// 模块 worker 全局作用域：接消息 → 执行 → 回传
const scope = self as unknown as RegexWorkerScope
scope.onmessage = (event: MessageEvent<RegexWorkerRequest>) => {
    scope.postMessage(handleRegexRequest(event.data))
}
