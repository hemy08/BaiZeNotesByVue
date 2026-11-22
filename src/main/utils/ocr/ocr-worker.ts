/**
 * OCR worker 线程入口（electron-vite main 构建的独立入口，1.5.2 E3）
 *
 * 构建与打包约束（对齐既有 Word worker）：
 * - electron.vite.config.ts 的 main.build.rollupOptions.input 把本文件作为独立入口
 *   `ocr-worker`，产物为 out/build/main/ocr-worker.js，与主入口 index.js 同目录；
 * - electron-builder 的 files 白名单已包含 out/build/main/**，该文件随 app.asar 打包；
 * - 主进程客户端按 `__dirname/ocr-worker.js` 加载（开发构建与 asar 内路径一致；
 *   Electron 的 worker_threads 可从 app.asar 内加载脚本并 require asar 内 node_modules，
 *   Word worker 已实测同一链路）。
 *
 * 本文件不 import electron（worker_threads 中没有 Electron API），只依赖 Node 内建模块；
 * tesseract.js 的 wasm 加载与语言包解压全部发生在本线程内，主进程事件循环零阻塞。
 */
import { parentPort } from 'node:worker_threads'
import { handleOcrWorkerRequest } from './ocr-worker-tasks'

if (parentPort) {
    const port = parentPort
    port.on('message', (request: unknown) => {
        const startedAt = Date.now()
        void handleOcrWorkerRequest(request).then((response) => {
            // 仅用于诊断与日志（不包含图片内容；失败文案已截断）：
            // 成功 = 任务类型 + 耗时；失败 = 任务 id + 耗时 + 错误文案
            if (response.ok) {
                console.log(
                    `[ocr-worker] 完成（${Date.now() - startedAt}ms，识别 ${response.elapsedMs ?? 0}ms）`
                )
            } else {
                console.error(
                    `[ocr-worker] 失败（id=${response.id}，${Date.now() - startedAt}ms）：${response.error ?? '未知错误'}`
                )
            }
            port.postMessage(response)
        })
    })
}
