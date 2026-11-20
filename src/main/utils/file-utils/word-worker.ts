/**
 * Word 导入/导出 worker 线程入口（electron-vite main 构建的独立入口）
 *
 * P2-2（2026-11-20 性能扫描）：主进程把 Word 重计算（mammoth / turndown / officegen）
 * 交给本 worker 执行，主线程只负责消息传递与文件路径校验，不再被 100ms 级同步计算冻结。
 *
 * 构建与打包约束：
 * - electron.vite.config.ts 的 main.build.rollupOptions.input 把本文件作为独立入口
 *   `word-worker`，产物为 out/build/main/word-worker.js，与主入口 index.js 同目录；
 * - electron-builder 的 files 白名单已包含 out/build/main/**，因此该文件随 app.asar 打包；
 * - 主进程客户端按 `__dirname/word-worker.js` 加载（开发构建与 asar 内路径解析一致；
 *   已实测 Electron 的 worker_threads 可从 app.asar 内加载脚本并 require asar 内 node_modules）。
 *
 * 本文件不 import electron（worker_threads 中没有 Electron API），只依赖 Node 内建模块。
 */

import { parentPort } from 'node:worker_threads'
import { handleWordWorkerRequest } from './word-worker-tasks'
import type { WordWorkerRequest } from './word-worker-protocol'

if (parentPort) {
    const port = parentPort
    port.on('message', (request: WordWorkerRequest) => {
        const startedAt = Date.now()
        void handleWordWorkerRequest(request).then((response) => {
            // 控制台标记用于诊断与 E2E：可从主进程 stdout / 日志中确认转换确实发生在
            // worker 线程（而非主线程降级路径）；不含用户数据，只有任务类型与耗时。
            const typeLabel = request?.type ?? 'unknown'
            if (response.ok) {
                console.log(`[word-worker] ${typeLabel} 完成（${Date.now() - startedAt}ms）`)
            } else {
                console.error(
                    `[word-worker] ${typeLabel} 失败（${Date.now() - startedAt}ms）：${response.error ?? '未知错误'}`
                )
            }
            port.postMessage(response)
        })
    })
}
