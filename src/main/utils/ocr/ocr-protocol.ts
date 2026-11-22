/**
 * OCR worker 协议（主进程 ↔ Node worker_threads，1.5.2 E3）
 *
 * 设计要点（对齐既有 Word worker 协议四件套模式，`utils/file-utils/word-worker*`）：
 * - 本文件只放「可结构化克隆」的消息结构，不依赖 electron / tesseract.js / 第三方库，
 *   供主进程客户端与 worker 入口共用；
 * - 任务输入输出均为普通对象：语言代码、语言包目录绝对路径、PNG 字节（Uint8Array），
 *   由 Node 结构化克隆在两端传递（20 MiB 上限内一次拷贝可接受）；
 * - worker 内**不嵌套** tesseract.js 自带的 worker_threads（见 ocr-tesseract-runtime.ts），
 *   因此无需额外生命周期协议；主进程客户端 terminate 本线程即释放全部 wasm 内存。
 */

/** worker 支持的任务类型（MVP 只有一个：识别 PNG 图片文字） */
export const OCR_WORKER_TASK = {
    /** 识别 PNG 图片文字（主进程已完成语言包下载/校验，worker 内按需加载语言） */
    RECOGNIZE: 'ocrRecognize'
} as const

/** 任务类型字面量联合（`as const` 派生，新增任务时类型检查强制同步处理分支） */
export type OcrWorkerTaskType = (typeof OCR_WORKER_TASK)[keyof typeof OCR_WORKER_TASK]

/** 识别任务：PNG 字节 → 文本 */
export interface OcrWorkerRecognizeRequest {
    /** 自增任务 id（客户端按 id 配对请求/应答，避免串包） */
    id: number
    type: typeof OCR_WORKER_TASK.RECOGNIZE
    /** 语言代码（主进程已按 `OCR_LANGUAGES` 白名单校验） */
    lang: string
    /** 语言包所在绝对目录（`<userData>/ocr/tessdata`，含 `<lang>.traineddata.gz`） */
    langDir: string
    /** 剪贴板 PNG 图片字节（主进程已校验 PNG 魔数与 20 MiB 上限） */
    imageBytes: Uint8Array
}

/** 主进程 → worker 的任务消息 */
export type OcrWorkerRequest = OcrWorkerRecognizeRequest

/**
 * worker → 主进程的任务应答（成功/失败均走同一结构，避免错误对象跨线程序列化兼容问题；
 * 失败时主进程按 `error` 归类为结构化错误码，不向渲染层泄漏堆栈）。
 */
export interface OcrWorkerTaskResponse {
    /** 与请求 id 对应（非法请求无法解析 id 时为 -1，客户端按协议错误处理） */
    id: number
    ok: boolean
    /** 成功时的识别文本（原始输出，归一化由 shared 纯函数统一完成） */
    text?: string
    /** 成功时 tesseract 识别阶段耗时（毫秒；不含语言包下载） */
    elapsedMs?: number
    /** 失败时的错误文案（worker 内 Error.message/String 归一化，已做长度截断） */
    error?: string
}
