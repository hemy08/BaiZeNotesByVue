/**
 * 1.5.2 E2 PDF 标注与摘录 —— 渲染层入口动作（ShowPdfEditor.vue 调用）
 *
 * 职责边界：
 * - **只通过两个 FILE 通道读写侧车**（`LOAD_PDF_ANNOTATIONS` / `SAVE_PDF_ANNOTATIONS`），
 *   磁盘路径与原子写全部由主进程负责，渲染层不直接访问文件系统；
 * - 标注数据的创建/清洗/归一化复用 `shared/constants/pdf-annotations.ts` 纯函数
 *   （与主进程同一真源，不做第二套转换逻辑）；
 * - 摘录文本生成复用 shared `buildPdfExcerptMarkdown`；插入当前笔记复用 A8
 *   `components/Markdown/editor-paste-enhance.ts` 的 `insertMarkdownAtSelection`
 *   （动态 import 按需加载，避免把 Turndown / Monaco 编辑器模块拉进首屏静态闭包）；
 * - 无活动编辑器 / 插入失败时回退 `navigator.clipboard.writeText` 并提示「已复制到剪贴板」；
 * - 失败一律经 `getConfigStore().showError/showWarning` 给出可见提示（LOG-08 禁止静默失败），
 *   文案走 `editorUi.pdfAnnotations.*` 中英词典。
 *
 * 能力开关：`featurePdfAnnotations` 默认关闭。调用方传入 `{ enabled: false }` 时**不发起
 * 任何 IPC 调用**（ShowPdfEditor 在关闭时也不会渲染标注 UI）；本模块不做开关状态真源，
 * 避免渲染层出现第二套开关状态。
 */
import {
    buildPdfExcerptMarkdown,
    createPdfAnnotation,
    normalizePdfAnnotations
} from '../../../shared/constants/pdf-annotations'
import { IPC } from '../../../shared/ipc-channels'
import type {
    CreatePdfAnnotationInput,
    PdfAnnotation,
    PdfAnnotationsLoadResult,
    PdfAnnotationsSaveResult
} from '../../../shared/types/pdf-annotations'
import { describeActionError } from './action-feedback'
import { getActiveEditor } from './active-editor'
import { t } from './i18n'
import { logger } from './logger'
import { getConfigStore } from './useConfigStore'

/** 允许调用方传入的能力开关门控（仅 `enabled === false` 表示跳过 IO；缺省按调用方已判定处理） */
export interface PdfAnnotationsActionGate {
    /** 能力开关是否开启（false 时 load/save 直接返回，不发起 IPC） */
    enabled?: boolean
}

/** A8 粘贴增强模块类型（仅类型引用；运行时按需动态加载） */
type PasteEnhanceModule = typeof import('../components/Markdown/editor-paste-enhance')

/** A8 模块动态加载 Promise（同一会话只加载一次；失败后保持失败缓存） */
let pasteEnhancePromise: Promise<PasteEnhanceModule> | null = null

/** 按需加载 A8 插入实现（摘录插入当前笔记） */
async function loadPasteEnhance(): Promise<PasteEnhanceModule> {
    pasteEnhancePromise ??= import('../components/Markdown/editor-paste-enhance')
    return pasteEnhancePromise
}

/** 受限 ipcRenderer 最小接口（便于单测注入替身） */
interface LimitedIpcRenderer {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 取受限 ipcRenderer；未注入（极简测试环境/启动异常）返回 null */
function getIpcRenderer(): LimitedIpcRenderer | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = window.electron?.ipcRenderer as LimitedIpcRenderer | undefined
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/**
 * 主进程结构化错误码 → 已本地化文案。
 *
 * 未知/缺失 code（含未受信 sender 拒绝对象）回退通用失败文案，不把内部结构展示给用户。
 */
function describeAnnotationsError(error: unknown): string {
    switch (error) {
        case 'invalid-path':
            return t('editorUi.pdfAnnotations.invalidPath')
        case 'invalid-extension':
            return t('editorUi.pdfAnnotations.invalidExtension')
        case 'path-denied':
            return t('editorUi.pdfAnnotations.pathDenied')
        case 'invalid-payload':
            return t('editorUi.pdfAnnotations.invalidPayload')
        case 'too-large':
            return t('editorUi.pdfAnnotations.tooLarge')
        case 'read-failed':
            return t('editorUi.pdfAnnotations.readFailed')
        case 'write-failed':
            return t('editorUi.pdfAnnotations.writeFailed')
        default:
            return t('editorUi.pdfAnnotations.failedMessage')
    }
}

/**
 * 读取当前 PDF 的标注（失败返回空数组，不阻塞预览）。
 *
 * @param pdfPath PDF 绝对路径
 * @param gate 能力开关门控（enabled === false 时不调用 IPC）
 * @returns 归一化后的标注数组；失败/开关关闭时为空数组
 */
export async function loadPdfAnnotations(
    pdfPath: string,
    gate: PdfAnnotationsActionGate = {}
): Promise<PdfAnnotation[]> {
    if (gate.enabled === false) {
        return []
    }
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[PdfAnnotations] 受限 ipcRenderer 不可用，无法读取 PDF 标注')
        getConfigStore().showWarning(
            t('editorUi.pdfAnnotations.loadFailedTitle'),
            t('editorUi.pdfAnnotations.unavailable')
        )
        return []
    }
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.FILE.LOAD_PDF_ANNOTATIONS, pdfPath)
        const result = raw as PdfAnnotationsLoadResult | null | undefined
        if (result?.ok === true) {
            // 主进程已归一化；渲染层再归一化一次防御异常实现/旧版本主进程
            return normalizePdfAnnotations(result.annotations)
        }
        const detail = describeAnnotationsError(result?.error)
        logger.warn('[PdfAnnotations] 读取 PDF 标注失败：', result?.error)
        getConfigStore().showWarning(
            t('editorUi.pdfAnnotations.loadFailedTitle'),
            t('editorUi.pdfAnnotations.loadFailed', { error: detail })
        )
        return []
    } catch (error) {
        logger.error('[PdfAnnotations] 调用读取 PDF 标注 IPC 异常：', error)
        getConfigStore().showWarning(
            t('editorUi.pdfAnnotations.loadFailedTitle'),
            t('editorUi.pdfAnnotations.invokeFailed', {
                error: describeActionError(error, t('common.unknown'))
            })
        )
        return []
    }
}

/**
 * 保存当前 PDF 的标注（主进程归一化 + 原子写）。
 *
 * @param pdfPath PDF 绝对路径
 * @param annotations 当前标注列表（内部先归一化为纯 JSON，避免把 Vue Proxy 交给结构化克隆）
 * @param gate 能力开关门控（enabled === false 时不调用 IPC，返回 false）
 * @returns 是否成功写盘
 */
export async function savePdfAnnotations(
    pdfPath: string,
    annotations: readonly PdfAnnotation[],
    gate: PdfAnnotationsActionGate = {}
): Promise<boolean> {
    if (gate.enabled === false) {
        return false
    }
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[PdfAnnotations] 受限 ipcRenderer 不可用，无法保存 PDF 标注')
        getConfigStore().showError(
            t('editorUi.pdfAnnotations.saveFailedTitle'),
            t('editorUi.pdfAnnotations.unavailable')
        )
        return false
    }
    try {
        // IPC-16 / CFG-06：只传纯 JSON 值（normalize 返回全新普通对象，不含 Vue 响应式代理）
        const payload = normalizePdfAnnotations(annotations)
        const raw: unknown = await ipcRenderer.invoke(
            IPC.FILE.SAVE_PDF_ANNOTATIONS,
            pdfPath,
            payload
        )
        const result = raw as PdfAnnotationsSaveResult | null | undefined
        if (result?.ok === true) {
            return true
        }
        const detail = describeAnnotationsError(result?.error)
        logger.error('[PdfAnnotations] 保存 PDF 标注失败：', result?.error)
        getConfigStore().showError(
            t('editorUi.pdfAnnotations.saveFailedTitle'),
            t('editorUi.pdfAnnotations.saveFailed', { error: detail })
        )
        return false
    } catch (error) {
        logger.error('[PdfAnnotations] 调用保存 PDF 标注 IPC 异常：', error)
        getConfigStore().showError(
            t('editorUi.pdfAnnotations.saveFailedTitle'),
            t('editorUi.pdfAnnotations.invokeFailed', {
                error: describeActionError(error, t('common.unknown'))
            })
        )
        return false
    }
}

/**
 * 在草稿列表中追加一条新标注（纯函数，不写盘；写盘由调用方按 300ms 防抖统一调度）。
 *
 * @param current 当前标注列表
 * @param input 新标注输入（页码 / 文本 / 矩形）
 * @returns 归一化后的新列表；输入无效（空文本/非法页码）时返回 null 并给出可见提示
 */
export function addPdfAnnotation(
    current: readonly PdfAnnotation[],
    input: CreatePdfAnnotationInput
): PdfAnnotation[] | null {
    const created = createPdfAnnotation(input)
    if (created === null) {
        logger.warn('[PdfAnnotations] 创建标注失败（文本为空或页码无效）')
        getConfigStore().showWarning(
            t('editorUi.pdfAnnotations.addFailedTitle'),
            t('editorUi.pdfAnnotations.addInvalid')
        )
        return null
    }
    return normalizePdfAnnotations([...current, created])
}

/**
 * 从草稿列表中删除指定标注（纯函数，不写盘）。
 *
 * @param current 当前标注列表
 * @param annotationId 要删除的标注 id
 * @returns 归一化后的新列表（id 不存在时返回等价列表，调用方可据此跳过保存）
 */
export function removePdfAnnotation(
    current: readonly PdfAnnotation[],
    annotationId: string
): PdfAnnotation[] {
    return normalizePdfAnnotations(current.filter((annotation) => annotation.id !== annotationId))
}

/** 摘录动作结果（供组件/单测区分插入编辑器、复制剪贴板、失败三条路径） */
export type PdfExcerptOutcome = 'inserted' | 'copied' | 'failed'

/** 复制摘录 Markdown 到系统剪贴板；不可用/被拒返回 false（不抛异常） */
async function writeExcerptToClipboard(markdown: string): Promise<boolean> {
    if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== 'function'
    ) {
        return false
    }
    try {
        await navigator.clipboard.writeText(markdown)
        return true
    } catch (error) {
        logger.warn('[PdfAnnotations] 复制摘录到剪贴板失败：', error)
        return false
    }
}

/**
 * 摘录一条标注：生成 Markdown 块 → 插入当前活动 Markdown 编辑器；
 * 无活动编辑器或插入失败时回退复制到剪贴板，并提示「已复制到剪贴板」。
 *
 * @param annotation 要摘录的标注
 * @param pdfFileName PDF 文件名（来源行展示；可传空串，来源行降级为页码）
 * @returns 实际结果（inserted / copied / failed；失败路径已给出可见提示）
 */
export async function excerptPdfAnnotation(
    annotation: PdfAnnotation,
    pdfFileName: string
): Promise<PdfExcerptOutcome> {
    const markdown = buildPdfExcerptMarkdown({
        text: annotation?.text ?? '',
        pdfFileName,
        page: annotation?.page ?? 1
    })
    if (markdown.length === 0) {
        logger.warn('[PdfAnnotations] 摘录文本为空，已取消摘录')
        getConfigStore().showWarning(
            t('editorUi.pdfAnnotations.excerptFailedTitle'),
            t('editorUi.pdfAnnotations.excerptInvalid')
        )
        return 'failed'
    }
    const editor = getActiveEditor()
    if (editor) {
        try {
            const pasteEnhance = await loadPasteEnhance()
            if (pasteEnhance.insertMarkdownAtSelection(editor, markdown)) {
                return 'inserted'
            }
            logger.warn('[PdfAnnotations] 插入当前笔记失败（编辑器不可写/无模型），回退剪贴板')
        } catch (error) {
            logger.warn('[PdfAnnotations] A8 插入模块加载失败，回退剪贴板：', error)
        }
    }
    if (await writeExcerptToClipboard(markdown)) {
        getConfigStore().showInfo(
            t('editorUi.pdfAnnotations.copiedTitle'),
            t('editorUi.pdfAnnotations.copiedMessage')
        )
        return 'copied'
    }
    logger.error('[PdfAnnotations] 摘录插入与剪贴板回退均失败')
    getConfigStore().showError(
        t('editorUi.pdfAnnotations.excerptFailedTitle'),
        t('editorUi.pdfAnnotations.excerptInsertFailed')
    )
    return 'failed'
}
