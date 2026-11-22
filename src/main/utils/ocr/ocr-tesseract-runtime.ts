/**
 * OCR worker 内的 tesseract.js 运行时（1.5.2 E3）
 *
 * ## 为什么不用 tesseract.js 的 `createWorker`
 * - v7 的 Node `createWorker` 会再起一个 worker_threads，本项目的 OCR 已经运行在
 *   自己的 worker_threads 内，再嵌套会出现「父线程 terminate 后子线程仍存活」的
 *   生命周期风险，也需要额外的清理协议；
 * - v7 Node 端 `getCore` 按 CPU 特性在 6 个 wasm 变体间选择并忽略 `corePath`，
 *   而体积预算只允许打包 1 个变体（baseline LSTM）——必须自行接管 core 加载；
 * - 我们只需要「单语言 + 只输出文本」的最小子集，直接驱动 worker-script 的
 *   dispatchHandlers 即可，避免引入 createWorker 的图片加载/调度/日志等额外逻辑。
 *
 * ## 实现
 * - 模块级单例状态：core 只加载一次；语言包只在切换语言时重新 loadLanguage；
 *   每次 initialize 由 worker-script 内部负责 `api.End()` 旧实例；
 * - 语言文件走本地缓存目录（`<userData>/ocr/tessdata/<lang>.traineddata.gz`）：
 *   `langPath` 为本地目录 + `gzip: true` + `cacheMethod: 'none'`，由 worker-script
 *   的 Node 端用 node:zlib 解压，不触发网络、不产生第二份缓存文件；
 * - adapter 的 getCore 固定返回 `tesseract.js-core/tesseract-core-lstm`
 *   （baseline LSTM，无 SIMD 前置要求，兼容所有 x64 设备）；
 * - 所有异常归一化为 Error 抛出，由 `ocr-worker-tasks.ts` 转为结构化应答，
 *   不向主进程泄漏堆栈细节。
 */
import { dispatchHandlers, setAdapter } from 'tesseract.js/src/worker-script/index.js'
import gunzip from 'tesseract.js/src/worker-script/node/gunzip.js'
import * as tesseractNodeCache from 'tesseract.js/src/worker-script/node/cache.js'
import TesseractCore from 'tesseract.js-core/tesseract-core-lstm'

/** 本仓库打包的唯一 core 变体名（报告/日志与 electron-builder 排除项同源口径） */
export const OCR_TESSERACT_CORE_VARIANT = 'tesseract-core-lstm'

/** tesseract.js 的 OEM.LSTM_ONLY（constants/OEM：TESSERACT_ONLY=0、LSTM_ONLY=1、DEFAULT=3） */
const OEM_LSTM_ONLY = 1

/** dispatchHandlers 的超时兜底（ms；语言包/识别异常卡住时由主进程客户端超时兜底，这里只防永久悬挂） */
const DISPATCH_TIMEOUT_MS = 90 * 1000

/** 已加载 core 进程内状态（worker 线程单例） */
let adapterInjected = false
let coreLoaded = false
/** 已写入 tesseract 虚拟文件系统的语言集合（避免重复解压 10 MiB 语言包） */
const loadedLanguages = new Set<string>()
/** 最近一次 initialize 的语言（切换语言时必须重新 initialize） */
let initializedLanguage: string | null = null
let jobSequence = 0

/** 归一化任意抛出值为错误文案（Error.message 可能为空） */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.trim() || error.name || '未知错误'
    }
    const text = String(error ?? '').trim()
    return text || '未知错误'
}

/**
 * 注入 tesseract.js worker-script adapter（幂等）。
 *
 * getCore 固定返回 baseline LSTM 变体；其余字段沿用 tesseract.js 的 Node 实现
 * （gunzip/cache），保证内部 loadLanguage 行为与官方一致。
 */
function ensureAdapter(): void {
    if (adapterInjected) {
        return
    }
    setAdapter({
        getCore: async (_oem, _corePath, res) => {
            res.progress({ status: 'loading tesseract core', progress: 0 })
            // 单变体：无论 CPU 是否支持 SIMD 都使用 baseline LSTM（打包只保留此变体）
            res.progress({ status: 'loading tesseract core', progress: 1 })
            return TesseractCore
        },
        gunzip,
        fetch: (url: string) =>
            (globalThis.fetch as unknown as (input: string) => Promise<unknown>)(url),
        readCache: tesseractNodeCache.readCache,
        writeCache: tesseractNodeCache.writeCache,
        deleteCache: tesseractNodeCache.deleteCache,
        checkCache: tesseractNodeCache.checkCache
    })
    adapterInjected = true
}

/**
 * 向 tesseract.js worker-script 分发一个内部任务并等待结果。
 *
 * @param action worker-script 动作（load / loadLanguage / initialize / recognize）
 * @param payload 动作载荷（结构见 tesseract.js `src/worker-script/index.js`）
 * @returns 动作 resolve 的数据
 */
function dispatchOcrAction(action: string, payload: unknown): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
        jobSequence += 1
        const jobId = jobSequence
        const timer = setTimeout(() => {
            reject(new Error(`OCR 内部任务超时（action=${action}，超过 ${DISPATCH_TIMEOUT_MS}ms）`))
        }, DISPATCH_TIMEOUT_MS)
        timer.unref?.()
        let settled = false
        const settle = (fn: () => void): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timer)
            fn()
        }
        try {
            dispatchHandlers(
                { workerId: 'baize-ocr-worker', jobId, action, payload },
                (message) => {
                    if (!message || message.jobId !== jobId) {
                        return
                    }
                    if (message.status === 'resolve') {
                        settle(() => resolve(message.data))
                    } else if (message.status === 'reject') {
                        settle(() => reject(new Error(toErrorMessage(message.data))))
                    }
                }
            )
        } catch (error) {
            settle(() => reject(new Error(toErrorMessage(error))))
        }
    })
}

/** 加载 core（只加载一次；失败时保持未加载状态，下次调用可重试） */
async function ensureCoreLoaded(): Promise<void> {
    ensureAdapter()
    if (coreLoaded) {
        return
    }
    await dispatchOcrAction('load', {
        options: { lstmOnly: true, corePath: '', logging: false }
    })
    coreLoaded = true
}

/**
 * 确保指定语言已加载并完成 initialize（必要时重新加载/重新初始化）。
 *
 * @param langDir 语言包目录绝对路径（含 `<lang>.traineddata.gz`）
 * @param lang 语言代码（主进程已按白名单校验）
 */
async function ensureLanguageReady(langDir: string, lang: string): Promise<void> {
    await ensureCoreLoaded()
    if (!loadedLanguages.has(lang)) {
        await dispatchOcrAction('loadLanguage', {
            langs: [lang],
            options: {
                langPath: langDir,
                cacheMethod: 'none',
                gzip: true,
                lstmOnly: true
            }
        })
        loadedLanguages.add(lang)
    }
    if (initializedLanguage !== lang) {
        await dispatchOcrAction('initialize', { langs: lang, oem: OEM_LSTM_ONLY, config: {} })
        initializedLanguage = lang
    }
}

/**
 * 识别 PNG 图片文字（worker 线程内主入口）。
 *
 * @param langDir 语言包目录绝对路径
 * @param lang 语言代码
 * @param imageBytes 已校验的 PNG 字节
 * @returns 识别文本（原始输出）与 tesseract 识别阶段耗时
 */
export async function recognizeOcrImageInWorker(
    langDir: string,
    lang: string,
    imageBytes: Uint8Array
): Promise<{ text: string; elapsedMs: number }> {
    await ensureLanguageReady(langDir, lang)
    const startedAt = Date.now()
    const result = await dispatchOcrAction('recognize', {
        // Buffer 是 Uint8Array 子类，setImage 可直接写入 Emscripten 虚拟文件系统
        image: Buffer.from(imageBytes),
        options: {},
        output: { text: true }
    })
    const elapsedMs = Date.now() - startedAt
    const text =
        result &&
        typeof result === 'object' &&
        typeof (result as { text?: unknown }).text === 'string'
            ? (result as { text: string }).text
            : ''
    return { text, elapsedMs }
}
