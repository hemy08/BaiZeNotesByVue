/**
 * 1.5.2 E3 图片 OCR（MVP：剪贴板截图识别）—— 跨进程契约类型
 *
 * 链路（IPC-17 六步）：
 *   1. 常量：`shared/ipc-channels.ts` 的 `IPC.OCR.PREPARE_LANG` / `RECOGNIZE_IMAGE`；
 *   2. 契约：本文件类型 + `shared/types/ipc.ts` 的 IpcRequests / IpcResponses 登记；
 *   3. 白名单：`build/generate-preload-whitelist.js` 生成（禁止手改）；
 *   4. 主进程：`ipc/ocr-ipc.ts`（registry 编排 + withSenderCheck）→
 *      `utils/ocr/**`（语言包下载缓存 + worker_threads 识别 + 串行队列）；
 *   5. 渲染层：`common/ocr-actions.ts`（读剪贴板图片 → 插入当前笔记 / 复制到剪贴板），
 *      命令面板与「工具」菜单共用；
 *   6. 测试：ocr（shared 纯函数）/ ocr-ipc（主进程校验与下载）/ ocr-actions（渲染层流程）
 *      + 通道命名/契约/白名单/注册门禁。
 *
 * 安全边界：
 * - 渲染层只能传「白名单语言 + PNG 图片字节」，不能传任意路径/URL/语言；
 * - 语言包下载地址与语言白名单由主进程 shared 常量唯一决定；
 * - 图片只在本地 worker（tesseract.js wasm）中处理，**不上传**；
 * - 所有失败以结构化 error code 返回，不向渲染层抛堆栈。
 */

/**
 * OCR 结构化错误码（渲染层按 code 映射 i18n 文案）：
 * - invalid-lang：语言不在白名单；
 * - invalid-payload：请求载荷结构非法；
 * - image-too-large：图片字节超过 `OCR_IMAGE_MAX_BYTES`（20 MiB）；
 * - not-png：图片字节不是 PNG（MVP 只支持剪贴板 `image/png`）；
 * - lang-download-failed：语言包下载失败（网络/超时/校验不通过/写盘失败）；
 * - lang-init-failed：语言包文件已存在但 tesseract 初始化失败（已失效缓存，下次重试会重新下载）；
 * - recognition-failed：OCR 识别失败（wasm/worker 异常）；
 * - worker-unavailable：OCR worker 线程不可用（启动失败/超时/已回收）。
 */
export type OcrErrorCode =
    | 'invalid-lang'
    | 'invalid-payload'
    | 'image-too-large'
    | 'not-png'
    | 'lang-download-failed'
    | 'lang-init-failed'
    | 'recognition-failed'
    | 'worker-unavailable'

/** `IPC.OCR.PREPARE_LANG` 请求载荷 */
export interface OcrPrepareLanguageRequest {
    /** 语言标识（必须是 `OCR_LANGUAGES` 白名单内的值） */
    lang: string
}

/** `IPC.OCR.PREPARE_LANG` 返回结构（下载/校验语言包到 userData，幂等） */
export interface OcrPrepareLanguageResult {
    /** 语言包是否已就绪（缓存命中或本次下载成功） */
    ok: boolean
    /** 就绪的语言（ok=true 时存在） */
    lang?: string
    /** 是否直接命中本地缓存（false = 本次下载成功） */
    fromCache?: boolean
    /** 语言包字节数（ok=true 时存在，用于日志/报告核对） */
    bytes?: number
    /** 失败原因（ok=false 时存在） */
    error?: OcrErrorCode
}

/** `IPC.OCR.RECOGNIZE_IMAGE` 请求载荷 */
export interface OcrRecognizeImageRequest {
    /** 剪贴板 PNG 图片字节（渲染层 `Blob.arrayBuffer()` 转换结果） */
    imageBytes: Uint8Array
    /** 语言标识（必须是 `OCR_LANGUAGES` 白名单内的值） */
    lang: string
}

/** `IPC.OCR.RECOGNIZE_IMAGE` 返回结构 */
export interface OcrRecognizeImageResult {
    /** 是否识别成功 */
    ok: boolean
    /** 识别文本（原始输出，未归一化；ok=true 时存在，可能为空串 = 图中无文字） */
    text?: string
    /** 识别耗时（毫秒，仅统计 tesseract 识别阶段，不含首次语言包下载/初始化） */
    elapsedMs?: number
    /** 失败原因（ok=false 时存在） */
    error?: OcrErrorCode
}
