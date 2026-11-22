/**
 * 1.5.2 E3 图片 OCR —— 渲染层入口动作（命令面板与「工具」菜单共用）
 *
 * 职责边界：
 * - **只在用户显式触发时**读取系统剪贴板图片（`navigator.clipboard.read()` 取 `image/png`；
 *   不监听、不轮询、后台上传）；
 * - 识别经主进程两个 IPC 通道完成：`OCR.PREPARE_LANG`（首次使用下载语言包到本机，
 *   主进程经状态栏显示下载进度）→ `OCR.RECOGNIZE_IMAGE`（本地 tesseract.js wasm 识别，
 *   图片不上传）；
 * - 文本归一化与插入格式复用 `shared/constants/ocr.ts` 纯函数（normalizeOcrText /
 *   buildOcrInsertMarkdown），插入当前笔记复用 A8 `insertMarkdownAtSelection`（动态 import，
 *   避免 Turndown/Monaco 进入首屏静态闭包）；
 * - 两个动作：识别并插入当前笔记（无活动编辑器时回退复制到剪贴板）/ 识别并复制到剪贴板；
 * - 失败经 `getConfigStore().showError/showWarning/showInfo` 给出可见提示（LOG-08 禁止静默失败）；
 *   能力开关关闭时命令面板不注册入口、菜单动作提示开启，**不读取剪贴板、不调用 OCR 通道**。
 *
 * 调用方：
 * - `components/search/CommandPalette.vue`（命令面板 2 条命令，开关关闭时不注册）；
 * - `components/MenuBar/menu-actions.ts`（工具菜单 2 项，执行前检查 `featureImageOcr`）。
 */
import {
    OCR_DEFAULT_LANGUAGE,
    OCR_IMAGE_MAX_BYTES,
    buildOcrInsertMarkdown,
    formatOcrSizeLimit,
    isPngImageBytes,
    normalizeOcrText,
    type OcrLanguageId
} from '../../../shared/constants/ocr'
import { IPC } from '../../../shared/ipc-channels'
import type {
    OcrErrorCode,
    OcrPrepareLanguageResult,
    OcrRecognizeImageResult
} from '../../../shared/types/ocr'
import { getActiveEditor } from './active-editor'
import { describeActionError } from './action-feedback'
import { t } from './i18n'
import { logger } from './logger'
import { getConfigStore } from './useConfigStore'

/** A8 粘贴增强模块类型（仅类型引用；运行时按需动态加载，不进入首屏静态依赖图） */
type PasteEnhanceModule = typeof import('../components/Markdown/editor-paste-enhance')

/** A8 模块动态加载 Promise（同一会话只加载一次；失败后保持失败缓存，避免重复请求坏 chunk） */
let pasteEnhancePromise: Promise<PasteEnhanceModule> | null = null

/**
 * 按需加载 A8 插入实现（把 Monaco 编辑器模块从命令面板/菜单首屏静态依赖图中移出）。
 */
async function loadPasteEnhance(): Promise<PasteEnhanceModule> {
    pasteEnhancePromise ??= import('../components/Markdown/editor-paste-enhance')
    return pasteEnhancePromise
}

/** 剪贴板图片读取失败原因（渲染层按 reason 映射 i18n 文案） */
export type OcrClipboardFailureReason = 'unavailable' | 'read-failed' | 'no-image' | 'too-large'

/** 剪贴板图片读取结果：ok=true 时携带 PNG 字节 */
export type ClipboardImageReadResult =
    | { ok: true; bytes: Uint8Array }
    | { ok: false; reason: OcrClipboardFailureReason; maxBytes?: number }

/** 剪贴板最小结构接口（便于单测注入替身；不依赖 DOM lib 的 Clipboard 类型） */
export interface ClipboardLike {
    read?: () => Promise<readonly ClipboardImageItemLike[]>
}

/** Blob 最小结构接口（只声明本模块使用的字段） */
export interface ClipboardBlobLike {
    /** 字节数（部分实现可能缺失，缺省时读取后按实际长度校验） */
    size?: number
    arrayBuffer: () => Promise<ArrayBuffer>
}

/** 剪贴板条目最小结构接口 */
export interface ClipboardImageItemLike {
    types: readonly string[]
    getType: (type: string) => Promise<ClipboardBlobLike>
}

/** OCR 流程任一步骤的失败原因（渲染层统一映射为可见文案） */
type OcrFlowFailureReason =
    | OcrClipboardFailureReason
    | 'prepare-failed'
    | 'lang-init-failed'
    | 'recognize-failed'
    | 'engine-unavailable'
    | 'invoke-failed'
    | 'empty-text'
    | 'copy-failed'
    | 'insert-failed'

/** 统一失败描述（可带错误码/上限/异常文案） */
interface OcrFlowFailure {
    reason: OcrFlowFailureReason
    errorCode?: OcrErrorCode
    maxBytes?: number
    error?: unknown
}

/**
 * 读取系统剪贴板图片字节（仅 `image/png`）。
 *
 * 读取优先级/失败判定：
 * 1. `navigator.clipboard.read()` 不可用 → unavailable；
 * 2. 条目中没有 `image/png` 类型 → no-image（提示「剪贴板没有图片」）；
 * 3. Blob 声明大小或实际字节超过 `OCR_IMAGE_MAX_BYTES`（20 MiB）→ too-large；
 * 4. getType/arrayBuffer 抛错、或字节不是 PNG 魔数 → read-failed。
 */
export async function readClipboardImageBytes(): Promise<ClipboardImageReadResult> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
        return { ok: false, reason: 'unavailable' }
    }
    const clipboard = navigator.clipboard as ClipboardLike
    if (typeof clipboard.read !== 'function') {
        return { ok: false, reason: 'unavailable' }
    }
    let items: readonly ClipboardImageItemLike[]
    try {
        items = await clipboard.read()
    } catch (error) {
        logger.warn('[ImageOcr] 读取剪贴板条目失败:', error)
        return { ok: false, reason: 'read-failed' }
    }
    let target: ClipboardImageItemLike | null = null
    for (const item of items) {
        const types = Array.isArray(item.types) ? item.types : []
        if (types.includes('image/png')) {
            target = item
            break
        }
    }
    if (!target) {
        return { ok: false, reason: 'no-image' }
    }
    try {
        const blob = await target.getType('image/png')
        if (typeof blob?.size === 'number' && blob.size > OCR_IMAGE_MAX_BYTES) {
            return { ok: false, reason: 'too-large', maxBytes: OCR_IMAGE_MAX_BYTES }
        }
        const buffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        if (bytes.length === 0) {
            return { ok: false, reason: 'no-image' }
        }
        if (bytes.length > OCR_IMAGE_MAX_BYTES) {
            return { ok: false, reason: 'too-large', maxBytes: OCR_IMAGE_MAX_BYTES }
        }
        if (!isPngImageBytes(bytes)) {
            logger.warn('[ImageOcr] 剪贴板 image/png 字节不是合法 PNG，已拒绝')
            return { ok: false, reason: 'read-failed' }
        }
        return { ok: true, bytes }
    } catch (error) {
        logger.warn('[ImageOcr] 读取剪贴板 image/png 失败:', error)
        return { ok: false, reason: 'read-failed' }
    }
}

/** 能力开关关闭时的统一提示（菜单动作执行前调用；命令面板按开关直接不注册入口） */
export function showImageOcrFeatureDisabled(): void {
    getConfigStore().showWarning(
        t('editorUi.imageOcr.disabledTitle'),
        t('editorUi.imageOcr.disabledMessage')
    )
}

/** 主进程错误码 → 已本地化文案（未知回退通用文案） */
function describeOcrErrorCode(errorCode: OcrErrorCode | undefined): string {
    switch (errorCode) {
        case 'invalid-lang':
            return t('editorUi.imageOcr.invalidLanguage')
        case 'invalid-payload':
            return t('editorUi.imageOcr.failedMessage')
        case 'image-too-large':
            return t('editorUi.imageOcr.tooLarge', {
                max: formatOcrSizeLimit(OCR_IMAGE_MAX_BYTES)
            })
        case 'not-png':
            return t('editorUi.imageOcr.notPng')
        case 'lang-download-failed':
            return t('editorUi.imageOcr.downloadFailed')
        case 'lang-init-failed':
            return t('editorUi.imageOcr.initFailed')
        case 'recognition-failed':
            return t('editorUi.imageOcr.recognitionFailed')
        case 'worker-unavailable':
            return t('editorUi.imageOcr.engineUnavailable')
        default:
            return t('editorUi.imageOcr.failedMessage')
    }
}

/** 流程失败原因 → 已本地化文案（剪贴板类原因优先，其余按错误码） */
function describeFlowFailure(failure: OcrFlowFailure): string {
    switch (failure.reason) {
        case 'unavailable':
            return t('editorUi.imageOcr.unavailable')
        case 'read-failed':
            return t('editorUi.imageOcr.readFailed')
        case 'no-image':
            return t('editorUi.imageOcr.noImage')
        case 'too-large':
            return t('editorUi.imageOcr.tooLarge', {
                max: formatOcrSizeLimit(failure.maxBytes ?? OCR_IMAGE_MAX_BYTES)
            })
        case 'prepare-failed':
            return describeOcrErrorCode(failure.errorCode ?? 'lang-download-failed')
        case 'lang-init-failed':
            return t('editorUi.imageOcr.initFailed')
        case 'recognize-failed':
            // 主进程返回的具体错误码优先（如 image-too-large / not-png / invalid-payload），
            // 缺省回退通用「识别失败」文案
            return failure.errorCode
                ? describeOcrErrorCode(failure.errorCode)
                : t('editorUi.imageOcr.recognitionFailed')
        case 'engine-unavailable':
            return t('editorUi.imageOcr.engineUnavailable')
        case 'invoke-failed':
            return t('editorUi.imageOcr.invokeFailed', {
                error: describeActionError(failure.error, t('editorUi.imageOcr.failedMessage'))
            })
        case 'empty-text':
            return t('editorUi.imageOcr.emptyMessage')
        case 'copy-failed':
            return t('editorUi.imageOcr.copyFailed')
        case 'insert-failed':
            return t('editorUi.imageOcr.insertFailed')
    }
}

/** 展示失败提示（日志 + 错误对话框；禁止静默失败） */
function showOcrFailure(failure: OcrFlowFailure): void {
    const message = describeFlowFailure(failure)
    logger.error(`[ImageOcr] 图片文字识别失败（reason=${failure.reason}）：`, message)
    getConfigStore().showError(t('editorUi.imageOcr.failedTitle'), message)
}

/** 写入系统剪贴板（失败返回 false，不抛异常） */
async function writeTextToClipboard(text: string): Promise<boolean> {
    if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
    ) {
        return false
    }
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch (error) {
        logger.warn('[ImageOcr] 写入剪贴板失败:', error)
        return false
    }
}

/** 渲染层受限 ipcRenderer 的最小结构（单测注入替身） */
interface OcrIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 取受限 ipcRenderer（不存在返回 null，调用方给出可见提示） */
function getOcrIpcRenderer(): OcrIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = (window as { electron?: { ipcRenderer?: OcrIpcRendererLike } }).electron
        ?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** OCR 识别管线成功结果 */
type OcrPipelineResult =
    { ok: true; text: string; elapsedMs: number } | { ok: false; failure: OcrFlowFailure }

/**
 * 完整 OCR 管线：读剪贴板图片 → 准备语言包 → 主进程识别 → 归一化文本。
 *
 * 失败不抛异常，统一返回可见提示所需的失败原因；
 * 语言包下载进度由主进程经状态栏推送（本函数不重复提示）。
 */
async function runOcrPipeline(): Promise<OcrPipelineResult> {
    const read = await readClipboardImageBytes()
    if (!read.ok) {
        return { ok: false, failure: { reason: read.reason, maxBytes: read.maxBytes } }
    }
    const ipcRenderer = getOcrIpcRenderer()
    if (!ipcRenderer) {
        return { ok: false, failure: { reason: 'engine-unavailable' } }
    }
    const lang: OcrLanguageId = OCR_DEFAULT_LANGUAGE
    try {
        const prepareRaw: unknown = await ipcRenderer.invoke(IPC.OCR.PREPARE_LANG, { lang })
        const prepared = prepareRaw as OcrPrepareLanguageResult | null | undefined
        if (prepared?.ok !== true) {
            return {
                ok: false,
                failure: { reason: 'prepare-failed', errorCode: prepared?.error }
            }
        }
        const recognizeRaw: unknown = await ipcRenderer.invoke(IPC.OCR.RECOGNIZE_IMAGE, {
            imageBytes: read.bytes,
            lang
        })
        const result = recognizeRaw as OcrRecognizeImageResult | null | undefined
        if (result?.ok !== true) {
            const reason: OcrFlowFailureReason =
                result?.error === 'lang-init-failed'
                    ? 'lang-init-failed'
                    : result?.error === 'worker-unavailable'
                      ? 'engine-unavailable'
                      : 'recognize-failed'
            return { ok: false, failure: { reason, errorCode: result?.error } }
        }
        const normalized = normalizeOcrText(result.text ?? '')
        if (!normalized) {
            return { ok: false, failure: { reason: 'empty-text' } }
        }
        return { ok: true, text: normalized, elapsedMs: result.elapsedMs ?? 0 }
    } catch (error) {
        return { ok: false, failure: { reason: 'invoke-failed', error } }
    }
}

/**
 * 识别剪贴板图片文字并插入当前笔记。
 *
 * - 当前无可用编辑器时回退为「复制到剪贴板」并提示（不静默丢弃结果）；
 * - 插入失败时给出可见错误提示；
 * - 插入格式：归一化原文 + 末尾来源说明行（`> —— 来自图片文字识别`）。
 */
export function ocrClipboardToEditor(): void {
    void (async () => {
        const result = await runOcrPipeline()
        if (!result.ok) {
            showOcrFailure(result.failure)
            return
        }
        const editor = getActiveEditor()
        if (!editor) {
            logger.warn('[ImageOcr] 当前没有可用的编辑器，回退复制到剪贴板')
            if (await writeTextToClipboard(result.text)) {
                getConfigStore().showInfo(
                    t('editorUi.imageOcr.copiedTitle'),
                    t('editorUi.imageOcr.noEditorCopiedMessage')
                )
            } else {
                showOcrFailure({ reason: 'copy-failed' })
            }
            return
        }
        const markdown = buildOcrInsertMarkdown(result.text, t('editorUi.imageOcr.sourceLine'))
        let inserted = false
        try {
            const pasteEnhance = await loadPasteEnhance()
            inserted = pasteEnhance.insertMarkdownAtSelection(editor, markdown)
        } catch (error) {
            logger.error('[ImageOcr] A8 插入模块加载失败：', error)
        }
        if (!inserted) {
            showOcrFailure({ reason: 'insert-failed' })
        }
    })()
}

/**
 * 识别剪贴板图片文字并复制到剪贴板（不依赖编辑器）。
 *
 * 成功经 `showInfo` 明确提示「已复制到剪贴板」（复制是纯写操作，用户需要确认结果去向）。
 */
export function ocrClipboardToClipboard(): void {
    void (async () => {
        const result = await runOcrPipeline()
        if (!result.ok) {
            showOcrFailure(result.failure)
            return
        }
        const copied = await writeTextToClipboard(result.text)
        if (!copied) {
            showOcrFailure({ reason: 'copy-failed' })
            return
        }
        getConfigStore().showInfo(
            t('editorUi.imageOcr.copiedTitle'),
            t('editorUi.imageOcr.copiedMessage')
        )
    })()
}
