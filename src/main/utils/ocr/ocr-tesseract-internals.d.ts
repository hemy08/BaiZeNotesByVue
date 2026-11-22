/**
 * tesseract.js v7 内部模块的最小类型声明（仅本仓库 OCR worker 使用）。
 *
 * ## 为什么需要它
 * tesseract.js v7 的 Node 端 `createWorker` 会**再启动一个 worker_threads**
 * （`new Worker(workerPath)`），且其 `worker-script/node/getCore.js` 按 CPU 特性
 * （relaxedSimd / simd / 标量）动态 require `tesseract.js-core` 的多个 wasm 变体，
 * **忽略 `corePath` 选项**（v7 实现里第二个参数未使用）。本项目的体积预算只允许打包
 * 1 个 LSTM 变体，因此 OCR worker 不复用 `createWorker`，而是：
 * 1. 直接加载 tesseract.js 的 worker-script 调度器（`dispatchHandlers` / `setAdapter`）；
 * 2. 自定义 adapter.getCore，固定返回本仓库打包的唯一 core 变体
 *    （baseline LSTM，无 SIMD 前置要求，兼容性最好）；
 * 3. 在主进程自己的 worker_threads 内直接驱动 `load → loadLanguage → initialize →
 *    recognize`，不再嵌套第二个线程（避免父线程退出后子线程悬挂）。
 *
 * 上述模块均无类型定义（package.json 无 exports 映射、无 .d.ts），此文件按「全局命名空间 +
 * 环境模块声明」的形式给出最小接口；升级 tesseract.js 主版本时必须重新核对
 * （`tests/unit/ocr-worker-runtime.test.ts` 对这些内部导出的存在性做契约断言）。
 */

declare namespace OcrTesseractInternals {
    /** tesseract.js 内部任务/进度消息（worker-script 统一信封） */
    interface Envelope {
        workerId?: string
        jobId?: number
        action?: string
        status?: 'resolve' | 'reject' | 'progress'
        data?: unknown
    }

    /** TessModule 的最小结构（worker-script 内部会使用 FS 与 TessBaseAPI） */
    interface CoreModule {
        FS: {
            writeFile: (path: string, data: string | Uint8Array) => void
            readFile: (path: string, opts?: { encoding?: string; flags?: string }) => string
            mkdir: (path: string) => void
            unlink: (path: string) => void
        }
        TessBaseAPI: new () => unknown
        OSResults: new () => unknown
    }

    /** core 模块工厂（emscripten 导出，调用后返回 TessModule） */
    interface CoreFactory {
        (moduleArg: {
            TesseractProgress?: (percent: number) => void
            wasmBinary?: Uint8Array
        }): Promise<CoreModule>
    }

    /** worker-script 的 adapter（Node 端由 worker-script/node/index.js 注入） */
    interface Adapter {
        /** 返回 core 工厂；第二参数 corePath 在 v7 Node 端被忽略，本项目固定单变体 */
        getCore: (
            oem: unknown,
            corePath: unknown,
            res: { progress: (message: { status: string; progress: number }) => void }
        ) => Promise<CoreFactory>
        /** .traineddata.gz → 解压后的 Uint8Array（Node 端为 node:zlib） */
        gunzip: (data: Uint8Array) => Uint8Array
        /** 本地路径模式下不触发网络，但 adapter 契约要求提供 */
        fetch: (url: string) => Promise<unknown>
        /** 语言包缓存读取（本项目 cacheMethod='none'，仅保留契约完整性） */
        readCache: (filePath: string) => Promise<Uint8Array>
        writeCache: (filePath: string, data: Uint8Array) => Promise<void>
        deleteCache: (filePath: string) => Promise<void>
        checkCache?: (filePath: string) => Promise<boolean>
    }
}

declare module 'tesseract.js/src/worker-script/index.js' {
    /** 注入 adapter（覆盖 tesseract.js 默认的 getCore/缓存实现） */
    export function setAdapter(adapter: OcrTesseractInternals.Adapter): void

    /** 分发单个任务：结果经 send 回调以 resolve/reject/progress 三种 status 返回 */
    export function dispatchHandlers(
        packet: { workerId: string; jobId: number; action: string; payload: unknown },
        send: (message: OcrTesseractInternals.Envelope) => void
    ): void
}

declare module 'tesseract.js/src/worker-script/node/gunzip.js' {
    /** Node 端 gzip 解压（node:zlib），入参与返回值均为字节数组 */
    function gunzip(data: Uint8Array): Uint8Array
    export = gunzip
}

declare module 'tesseract.js/src/worker-script/node/cache.js' {
    /** 读取缓存文件（本项目 cacheMethod='none' 时不使用，仅为 adapter 契约完整性保留） */
    export function readCache(filePath: string): Promise<Uint8Array>
    /** 写入缓存文件 */
    export function writeCache(filePath: string, data: Uint8Array): Promise<void>
    /** 删除缓存文件（幂等，失败吞掉） */
    export function deleteCache(filePath: string): Promise<void>
    /** 探测缓存文件是否存在 */
    export function checkCache(filePath: string): Promise<boolean>
}

declare module 'tesseract.js-core/tesseract-core-lstm' {
    /** 仅保留 baseline LSTM 变体（无 SIMD 前置要求，wasm 约 2.7 MiB + glue 约 87 KiB） */
    const factory: OcrTesseractInternals.CoreFactory
    export = factory
}
