/**
 * OCR worker 任务实现（1.5.2 E3，worker 线程内执行）
 *
 * 职责：把主进程客户端发来的结构化任务转成「tesseract.js 内部动作序列」并返回结构化应答。
 * 本文件运行在 worker_threads 线程里：**不 import electron**，只依赖 Node 内建 + 本目录
 * 的运行时封装；所有异常在这里收敛为 `{ ok: false, error }`，不向线程外抛错
 * （未捕获异常会导致 worker 崩溃，主进程只能按基础设施错误重建）。
 */
import { OCR_WORKER_TASK, type OcrWorkerRequest, type OcrWorkerTaskResponse } from './ocr-protocol'
import { recognizeOcrImageInWorker } from './ocr-tesseract-runtime'

/** 错误文案最大长度（跨线程回传，避免把巨大调试字符串塞回主进程） */
const MAX_ERROR_MESSAGE_LENGTH = 500

/** 归一化任意抛出值为错误文案（Error.message 可能为空；长度截断） */
function toErrorMessage(error: unknown): string {
    const raw =
        error instanceof Error
            ? error.message.trim() || error.name || ''
            : String(error ?? '').trim()
    const text = raw || '未知错误'
    return text.length > MAX_ERROR_MESSAGE_LENGTH
        ? `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
        : text
}

/** 请求 id（非法请求返回 -1，客户端按协议错误处理） */
function resolveRequestId(request: unknown): number {
    if (request && typeof request === 'object') {
        const id = (request as { id?: unknown }).id
        if (typeof id === 'number' && Number.isFinite(id)) {
            return id
        }
    }
    return -1
}

/**
 * 处理单个 worker 任务（结构校验 + 分派 + 结构化应答）。
 *
 * @param request 主进程发来的任务消息（任意类型，内部校验）
 * @returns 结构化应答（成功/失败均返回，不抛异常）
 */
export async function handleOcrWorkerRequest(request: unknown): Promise<OcrWorkerTaskResponse> {
    const id = resolveRequestId(request)
    const task = request as Partial<OcrWorkerRequest> | null
    if (!task || typeof task !== 'object' || task.id !== id || id < 0) {
        return { id, ok: false, error: 'OCR worker 收到非法任务载荷' }
    }
    if (task.type !== OCR_WORKER_TASK.RECOGNIZE) {
        return { id, ok: false, error: `OCR worker 不支持的任务类型：${String(task.type)}` }
    }
    const lang = typeof task.lang === 'string' ? task.lang.trim() : ''
    const langDir = typeof task.langDir === 'string' ? task.langDir.trim() : ''
    const imageBytes = task.imageBytes
    if (!lang || !langDir || !(imageBytes instanceof Uint8Array) || imageBytes.length === 0) {
        return { id, ok: false, error: 'OCR worker 任务参数不完整' }
    }
    try {
        const result = await recognizeOcrImageInWorker(langDir, lang, imageBytes)
        return { id, ok: true, text: result.text, elapsedMs: result.elapsedMs }
    } catch (error) {
        return { id, ok: false, error: toErrorMessage(error) }
    }
}
