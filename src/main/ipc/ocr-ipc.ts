/**
 * 1.5.2 E3 图片 OCR IPC（MVP：剪贴板截图识别，2026-11-22）
 *
 * 链路（IPC-17 六步）：常量（`IPC.OCR.PREPARE_LANG` / `RECOGNIZE_IMAGE`）→ 契约
 * （`shared/types/ocr.ts` + `shared/types/ipc.ts` 三表）→ 生成白名单
 * （build/generate-preload-whitelist.js）→ **本模块 handler** → 渲染层
 * `common/ocr-actions.ts`（命令面板 / 「工具」菜单共用）→ 测试
 * （ocr / ocr-ipc / ocr-actions）。
 *
 * ## 能力语义
 * - `PREPARE_LANG`：把语言包下载/校验到 `<userData>/ocr/tessdata/<lang>.traineddata.gz`
 *   （幂等；缓存命中不下载；下载过程经状态栏显示进度）；
 * - `RECOGNIZE_IMAGE`：校验 PNG 字节（魔数 + 20 MiB 上限）→ 确保语言包就绪 →
 *   经 `utils/ocr/ocr-worker-client` 的 worker_threads 串行队列在本地 tesseract.js
 *   wasm 中识别（**图片不上传**）→ 返回原始文本与识别耗时。
 *
 * ## 安全边界（三条硬红线）
 * - 语言只接受 `OCR_LANGUAGES` 白名单；语言包 URL 由 shared 常量固定为官方 https 源，
 *   渲染层不可覆盖（无 URL/路径入参）；
 * - 图片只接受 PNG 字节（剪贴板 `image/png`），字节上限 20 MiB，不做任何网络外发；
 * - 失败一律结构化返回 `{ ok:false, error }`（不向渲染层抛堆栈）；worker 不可用/失败
 *   均给出可见状态栏提示（LOG-08 禁止静默失败）；
 * - 能力开关 `featureImageOcr`（默认关闭）由渲染层控制入口；关闭时本模块不会被调用，
 *   也就不会下载语言包/加载 wasm（零行为差异，见 `tests/unit/ocr-actions.test.ts`）。
 */
import type { BrowserWindow } from 'electron'
import {
    OCR_IMAGE_MAX_BYTES,
    isOcrLanguage,
    isPngImageBytes,
    type OcrLanguageId
} from '../../shared/constants/ocr'
import { IPC } from '../../shared/ipc-channels'
import type { OcrPrepareLanguageResult, OcrRecognizeImageResult } from '../../shared/types/ocr'
import {
    getOcrTessdataDir,
    invalidateOcrLanguage,
    prepareOcrLanguage,
    type OcrTessdataDownloadProgress,
    type OcrTessdataPrepareResult
} from '../utils/ocr/ocr-tessdata'
import {
    isOcrWorkerInfrastructureError,
    isOcrWorkerTaskError,
    recognizeOcrImageWithWorker
} from '../utils/ocr/ocr-worker-client'
import { tMain } from '../utils/i18n'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { notifyStatus, type StatusNotifyTarget } from '../utils/status-notify'
import { withHandleErrorLog } from './handle-error-log'
import { ipcListenerManager } from './ipc-listener-manager'

/** tesseract 初始化失败的 worker 错误文案特征（由 worker-script initialize 分支返回） */
const INITIALIZATION_FAILED_PATTERN = /initialization failed/i

/** 从任意载荷中提取 `{ lang }`；非法返回 null */
function extractLanguage(payload: unknown): string | null {
    if (!isPlainPayloadObject(payload)) {
        return null
    }
    const lang = payload.lang
    return typeof lang === 'string' ? lang : null
}

/**
 * 判定是否为「普通对象」载荷（IPC-16：结构化克隆后的普通对象）。
 *
 * 数组 / Uint8Array / ArrayBuffer 等结构不是本组通道的载荷形状，统一按 invalid-payload 处理，
 * 避免把「图片字节误传为顶层载荷」这类调用错误误报成 invalid-lang。
 */
function isPlainPayloadObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Uint8Array) &&
        !(value instanceof ArrayBuffer)
    )
}

/** 发送状态栏提示（窗口不可用时静默；文案统一经 tMain 本地化） */
function sendStatus(
    target: StatusNotifyTarget | null | undefined,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' | 'loading'
): void {
    notifyStatus({ message, type }, target)
}

/** 语言包下载进度 → 状态栏（percent 未知时显示「正在下载…」） */
function reportDownloadProgress(
    target: StatusNotifyTarget | null | undefined,
    progress: OcrTessdataDownloadProgress
): void {
    const message =
        progress.percent === null
            ? tMain('mainMsg.ocr.preparing')
            : tMain('mainMsg.ocr.preparingProgress', { percent: progress.percent })
    sendStatus(target, message, 'loading')
}

/**
 * `OCR.PREPARE_LANG` 业务入口：确保语言包就绪（缓存命中或下载成功）。
 *
 * @param payload 渲染层载荷（`{ lang: string }`，任意类型，内部校验）
 * @param target 状态栏提示目标（主窗口；单测可传桩对象或省略）
 * @returns 结构化结果（ok + lang/fromCache/bytes 或 error code）
 */
export async function prepareOcrLanguageForIpc(
    payload: unknown,
    target?: StatusNotifyTarget | null
): Promise<OcrPrepareLanguageResult> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        logger.warn('[IPC] 已拒绝准备 OCR 语言包：载荷不是对象')
        return { ok: false, error: 'invalid-payload' }
    }
    const rawLang = extractLanguage(payload)
    if (!isOcrLanguage(rawLang)) {
        logger.warn('[IPC] 已拒绝准备 OCR 语言包：语言不在白名单：', rawLang)
        return { ok: false, error: 'invalid-lang' }
    }
    const lang: OcrLanguageId = rawLang
    const result = await prepareOcrLanguage(lang, {
        onProgress: (progress) => reportDownloadProgress(target, progress)
    })
    if (!result.ok) {
        sendStatus(target, tMain('mainMsg.ocr.failed'), 'error')
        return { ok: false, error: 'lang-download-failed' }
    }
    if (!result.fromCache) {
        sendStatus(target, tMain('mainMsg.ocr.ready'), 'success')
    }
    return { ok: true, lang, fromCache: result.fromCache, bytes: result.bytes }
}

/** 图片字节校验结果：成功携带字节，失败携带错误码 */
type ImagePayloadValidation =
    | { ok: true; imageBytes: Uint8Array; lang: OcrLanguageId }
    | { ok: false; error: 'invalid-payload' | 'invalid-lang' | 'image-too-large' | 'not-png' }

/**
 * 校验 `RECOGNIZE_IMAGE` 载荷（语言白名单 + PNG 字节 + 20 MiB 上限）。
 *
 * 导出以便单测直接覆盖校验矩阵（注册层只做透传）。
 */
export function validateOcrRecognizePayload(payload: unknown): ImagePayloadValidation {
    if (!isPlainPayloadObject(payload)) {
        return { ok: false, error: 'invalid-payload' }
    }
    const source = payload as { lang?: unknown; imageBytes?: unknown }
    if (!isOcrLanguage(source.lang)) {
        return { ok: false, error: 'invalid-lang' }
    }
    const imageBytes = source.imageBytes
    if (!(imageBytes instanceof Uint8Array) || imageBytes.length === 0) {
        return { ok: false, error: 'invalid-payload' }
    }
    if (imageBytes.length > OCR_IMAGE_MAX_BYTES) {
        return { ok: false, error: 'image-too-large' }
    }
    if (!isPngImageBytes(imageBytes)) {
        return { ok: false, error: 'not-png' }
    }
    return { ok: true, imageBytes, lang: source.lang }
}

/** 语言包准备失败 → 状态栏 + 结构化结果（复用 prepare 入口的错误语义） */
async function ensureLanguageReadyForRecognize(
    lang: OcrLanguageId,
    target: StatusNotifyTarget | null | undefined
): Promise<OcrTessdataPrepareResult> {
    const result = await prepareOcrLanguage(lang, {
        onProgress: (progress) => reportDownloadProgress(target, progress)
    })
    if (!result.ok) {
        sendStatus(target, tMain('mainMsg.ocr.failed'), 'error')
        return result
    }
    if (!result.fromCache) {
        sendStatus(target, tMain('mainMsg.ocr.ready'), 'success')
    }
    return result
}

/** worker/识别异常 → 结构化错误码（含坏缓存自愈） */
async function resolveRecognizeError(
    error: unknown,
    lang: OcrLanguageId
): Promise<'worker-unavailable' | 'lang-init-failed' | 'recognition-failed'> {
    if (isOcrWorkerInfrastructureError(error)) {
        logger.error('[IPC] OCR worker 不可用：', error)
        return 'worker-unavailable'
    }
    if (isOcrWorkerTaskError(error)) {
        if (INITIALIZATION_FAILED_PATTERN.test(error.message)) {
            // 语言包损坏/版本不匹配：删除缓存，下次用户重试会重新下载
            await invalidateOcrLanguage(lang)
            logger.error('[OCR] 语言包初始化失败，已失效缓存：', lang, error)
            return 'lang-init-failed'
        }
        logger.error('[IPC] OCR 识别失败：', error)
        return 'recognition-failed'
    }
    logger.error('[IPC] OCR 识别发生未知异常：', error)
    return 'recognition-failed'
}

/**
 * `OCR.RECOGNIZE_IMAGE` 业务入口：校验 → 确保语言包 → worker 串行识别 → 结构化返回。
 *
 * @param payload 渲染层载荷（`{ imageBytes: Uint8Array; lang: string }`，任意类型，内部校验）
 * @param target 状态栏提示目标（主窗口；单测可传桩对象或省略）
 * @returns 结构化结果（ok + text/elapsedMs 或 error code）
 */
export async function recognizeOcrImageForIpc(
    payload: unknown,
    target?: StatusNotifyTarget | null
): Promise<OcrRecognizeImageResult> {
    const validation = validateOcrRecognizePayload(payload)
    if (!validation.ok) {
        logger.warn('[IPC] 已拒绝识别图片文字：', validation.error)
        return { ok: false, error: validation.error }
    }
    const { imageBytes, lang } = validation
    const prepared = await ensureLanguageReadyForRecognize(lang, target)
    if (!prepared.ok) {
        return { ok: false, error: 'lang-download-failed' }
    }
    sendStatus(target, tMain('mainMsg.ocr.recognizing'), 'loading')
    try {
        const result = await recognizeOcrImageWithWorker(lang, getOcrTessdataDir(), imageBytes)
        sendStatus(
            target,
            tMain('mainMsg.ocr.recognizeDone', { elapsed: result.elapsedMs }),
            'success'
        )
        return { ok: true, text: result.text, elapsedMs: result.elapsedMs }
    } catch (error) {
        const errorCode = await resolveRecognizeError(error, lang)
        sendStatus(target, tMain('mainMsg.ocr.failed'), 'error')
        return { ok: false, error: errorCode }
    }
}

/**
 * 注册图片 OCR IPC（两个 invoke 通道）。
 *
 * @param mainWindow 主窗口（同时作为状态栏提示目标与 sender 校验登记来源）
 * @param componentId 监听台账组件 ID（来源 registry 编排）
 */
export function registerOcrIpc(mainWindow: BrowserWindow, componentId: string): void {
    ipcListenerManager.registerHandleOnce(
        IPC.OCR.PREPARE_LANG,
        withSenderCheck(
            IPC.OCR.PREPARE_LANG,
            withHandleErrorLog(
                IPC.OCR.PREPARE_LANG,
                async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                    prepareOcrLanguageForIpc(payload, mainWindow)
            ),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.OCR.RECOGNIZE_IMAGE,
        withSenderCheck(
            IPC.OCR.RECOGNIZE_IMAGE,
            withHandleErrorLog(
                IPC.OCR.RECOGNIZE_IMAGE,
                async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                    recognizeOcrImageForIpc(payload, mainWindow)
            ),
            { kind: 'handle' }
        ),
        componentId
    )
}
