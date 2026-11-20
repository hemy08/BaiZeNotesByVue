/**
 * 单测夹具：Word worker 协议的最小实现（真实 worker_threads 线程）
 *
 * 用途：`word-worker-client.test.ts` 用真实 `new Worker()` 加载本文件，验证客户端与
 * worker 之间的结构化克隆/应答配对在真实线程上可用（不依赖 electron-vite 构建产物）。
 * 本文件不是测试套件（文件名不以 .test.ts 结尾，不会被执行），只实现协议的最小分支。
 */
const { parentPort } = require('node:worker_threads')
const { createWriteStream } = require('node:fs')

parentPort.on('message', (request) => {
    if (!request || typeof request.id !== 'number') {
        return
    }
    if (request.type === 'wordImport') {
        if (typeof request.filePath !== 'string') {
            parentPort.postMessage({ id: request.id, ok: false, error: '缺少文件路径' })
            return
        }
        parentPort.postMessage({
            id: request.id,
            ok: true,
            markdown: `# echo ${request.filePath}`
        })
        return
    }
    if (request.type === 'wordExport') {
        if (typeof request.content !== 'string' || typeof request.filePath !== 'string') {
            parentPort.postMessage({ id: request.id, ok: false, error: '缺少导出参数' })
            return
        }
        const stream = createWriteStream(request.filePath)
        stream.end(`FAKE-DOCX:${request.content.length}`)
        stream.on('close', () => parentPort.postMessage({ id: request.id, ok: true }))
        stream.on('error', (error) =>
            parentPort.postMessage({ id: request.id, ok: false, error: String(error) })
        )
        return
    }
    parentPort.postMessage({ id: request.id, ok: false, error: '未知任务类型' })
})
