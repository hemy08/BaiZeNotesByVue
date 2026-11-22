/**
 * 1.5.2 E1 剪贴板剪藏 —— 渲染层入口动作（命令面板与「工具」菜单共用）
 *
 * 职责边界：
 * - **只在用户显式触发时**读取系统剪贴板（不监听、不轮询、不新增本地端口/浏览器扩展）；
 * - HTML → Markdown 复用 A8 `components/Markdown/editor-paste-enhance.ts` 的
 *   `sanitizeClipboardHtml` / `htmlToMarkdown`（内部经白名单清洗 + Turndown），
 *   插入当前笔记复用同模块 `insertMarkdownAtSelection`——不写第二套转换/插入逻辑；
 * - A8 模块以**动态 import** 按需加载：其依赖链含 Turndown 与 Monaco 编辑器模块，
 *   禁止进入首屏静态闭包（首屏体积预算 BUILD-06 / PERF-03）；
 * - 来源元数据（title / sourceUrl）与长度判定复用 `shared/constants/clip-capture.ts` 纯函数；
 * - 剪藏到新笔记：经既有 `IPC.FILE.OPEN_OR_CREATE_ENTRY`（kind='clip'）交给主进程落盘，
 *   **不新增 IPC 通道**，文件在 `inbox/YYYY-MM-DD-HHmmss-clip.md`，由主进程复用既有打开链路；
 * - 剪藏并插入当前笔记：转换后写入当前编辑器光标/选区处，末尾附来源引用行；
 * - 失败经 `getConfigStore().showError/showWarning` 给出可见提示（LOG-08 禁止静默失败），
 *   剪贴板为空/不可用/读取被拒/内容超限/编辑器不可用均有明确文案。
 *
 * 调用方：
 * - `components/search/CommandPalette.vue`（命令面板 2 条命令，开关关闭时不注册）；
 * - `components/MenuBar/menu-actions.ts`（工具菜单 2 项，执行前检查 `featureClipCapture`）。
 */
import {
    CLIP_CONTENT_MAX_BYTES,
    extractClipMetadata,
    sanitizeClipSourceUrl,
    sanitizeClipTitle,
    utf8ByteLength,
    type ClipSourceMetadata
} from '../../../shared/constants/clip-capture'
import { formatEntryDate } from '../../../shared/constants/daily-entries'
import { IPC } from '../../../shared/ipc-channels'
import type { OpenOrCreateEntryRequest, OpenOrCreateEntryResult } from '../../../shared/types/ipc'
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
 * 按需加载 A8 剪贴板转换/插入实现（HTML→Markdown 与插入当前笔记共用）。
 *
 * 说明：把重型依赖（Turndown / Monaco 编辑器模块）从「命令面板/菜单点击即进入首屏静态
 * 依赖图」改为「首次剪藏才加载」，遵守首屏体积预算；失败由调用方降级/提示。
 */
async function loadPasteEnhance(): Promise<PasteEnhanceModule> {
    pasteEnhancePromise ??= import('../components/Markdown/editor-paste-enhance')
    return pasteEnhancePromise
}

/** 剪贴板读取失败/为空的原因（渲染层按 reason 映射 i18n 文案） */
export type ClipReadFailureReason = 'unavailable' | 'read-failed' | 'empty'

/** 剪贴板读取结果：ok=true 时 html / text 至少有一个非空（其余为空串） */
export type ClipboardCaptureReadResult =
    { ok: true; html: string; text: string } | { ok: false; reason: ClipReadFailureReason }

/** 剪藏内容解析失败原因（含超限：HTML 与 Markdown 分别有上限） */
export type ClipContentFailureReason = ClipReadFailureReason | 'too-large'

/** 剪藏内容解析结果 */
export type ClipCaptureContentResult =
    | { ok: true; markdown: string; metadata: ClipSourceMetadata }
    | { ok: false; reason: ClipContentFailureReason; maxBytes?: number }

/** 剪贴板最小结构接口（便于单测注入替身；不依赖 DOM lib 的 Clipboard 类型） */
export interface ClipboardLike {
    read?: () => Promise<readonly ClipboardItemLike[]>
    readText?: () => Promise<string>
}

/** 剪贴板条目最小结构接口 */
export interface ClipboardItemLike {
    types: readonly string[]
    getType: (type: string) => Promise<{ text: () => Promise<string> }>
}

/** 从剪贴板条目并发/顺序读取 html 与 text；返回读取结果与是否发生过读取异常 */
async function readClipboardItems(clipboard: ClipboardLike): Promise<{
    html: string
    text: string
    failed: boolean
}> {
    let html = ''
    let text = ''
    let failed = false
    if (typeof clipboard.read !== 'function') {
        return { html, text, failed }
    }
    try {
        const items = await clipboard.read()
        for (const item of items) {
            const types = Array.isArray(item.types) ? item.types : []
            if (!html && types.includes('text/html')) {
                try {
                    html = await (await item.getType('text/html')).text()
                } catch (error) {
                    failed = true
                    logger.warn('[ClipCapture] 读取剪贴板 text/html 失败:', error)
                }
            }
            if (!text && types.includes('text/plain')) {
                try {
                    text = await (await item.getType('text/plain')).text()
                } catch (error) {
                    failed = true
                    logger.warn('[ClipCapture] 读取剪贴板 text/plain 失败:', error)
                }
            }
            if (html && text) {
                break
            }
        }
    } catch (error) {
        failed = true
        logger.warn('[ClipCapture] 读取剪贴板条目失败，尝试纯文本回退:', error)
    }
    return { html, text, failed }
}

/**
 * 读取系统剪贴板：优先 `navigator.clipboard.read()` 取 `text/html` / `text/plain`；
 * 不可用/被拒/条目为空时回退 `navigator.clipboard.readText()`。
 *
 * 主窗口已在主进程放行 `clipboard-read`（SEC-06），正常情况下 read() 可用；
 * 权限被拒/条目读取异常时仍尝试 readText()，两者都失败才返回 read-failed。
 */
export async function readClipboardCapture(): Promise<ClipboardCaptureReadResult> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
        return { ok: false, reason: 'unavailable' }
    }
    const clipboard = navigator.clipboard as ClipboardLike
    const canReadItems = typeof clipboard.read === 'function'
    const canReadText = typeof clipboard.readText === 'function'
    if (!canReadItems && !canReadText) {
        return { ok: false, reason: 'unavailable' }
    }

    const { html, text, failed } = await readClipboardItems(clipboard)
    if (html || text) {
        return { ok: true, html, text }
    }
    let readTextFailed = false
    if (canReadText) {
        try {
            const plainText = await (clipboard.readText as () => Promise<string>)()
            if (plainText) {
                return { ok: true, html: '', text: plainText }
            }
        } catch (error) {
            readTextFailed = true
            logger.warn('[ClipCapture] 读取剪贴板纯文本失败:', error)
        }
    }
    return failed || readTextFailed
        ? { ok: false, reason: 'read-failed' }
        : { ok: false, reason: 'empty' }
}

/** 字节上限 → 可读文案（1 MiB / 512 KiB），用于超限提示中的 {max} 占位符 */
function formatSizeLimit(maxBytes: number): string {
    if (maxBytes >= 1024 * 1024 && maxBytes % (1024 * 1024) === 0) {
        return `${maxBytes / (1024 * 1024)} MiB`
    }
    if (maxBytes >= 1024 && maxBytes % 1024 === 0) {
        return `${maxBytes / 1024} KiB`
    }
    return `${maxBytes} B`
}

/**
 * 读取剪贴板并解析为 Markdown + 来源元数据。
 *
 * 优先级：`text/html`（A8 白名单清洗 + Turndown，按需动态加载）→ `text/plain`（原文回退）。
 * HTML 超过 `HTML_TO_MARKDOWN_MAX_BYTES`、转换结果超过 `CLIP_CONTENT_MAX_BYTES` 均返回 too-large；
 * A8 模块加载失败时降级为纯文本；两者都没有可用内容时返回 empty（调用方给出可见提示）。
 */
async function resolveClipContent(): Promise<ClipCaptureContentResult> {
    const read = await readClipboardCapture()
    if (!read.ok) {
        return read
    }
    const metadata = extractClipMetadata(read.html, read.text)
    let markdown = ''
    if (read.html && read.html.trim()) {
        try {
            const pasteEnhance = await loadPasteEnhance()
            if (utf8ByteLength(read.html) > pasteEnhance.HTML_TO_MARKDOWN_MAX_BYTES) {
                return {
                    ok: false,
                    reason: 'too-large',
                    maxBytes: pasteEnhance.HTML_TO_MARKDOWN_MAX_BYTES
                }
            }
            markdown = pasteEnhance.htmlToMarkdown(read.html)
        } catch (error) {
            // 转换 chunk 加载失败：降级纯文本（无纯文本时下方返回 empty 并给出可见提示）
            logger.error('[ClipCapture] A8 剪贴板转换模块加载失败，回退纯文本：', error)
        }
    }
    if (!markdown && read.text && read.text.trim()) {
        // 纯文本回退：原文即 Markdown（不做转义，保留用户复制到的换行/缩进）
        markdown = read.text.replace(/\r\n?/g, '\n').trim()
    }
    if (!markdown) {
        return { ok: false, reason: 'empty' }
    }
    if (utf8ByteLength(markdown) > CLIP_CONTENT_MAX_BYTES) {
        return { ok: false, reason: 'too-large', maxBytes: CLIP_CONTENT_MAX_BYTES }
    }
    return { ok: true, markdown, metadata }
}

/** 能力开关关闭时的统一提示（菜单动作执行前调用；命令面板按开关直接不注册入口） */
export function showClipCaptureFeatureDisabled(): void {
    getConfigStore().showWarning(
        t('editorUi.clipCapture.disabledTitle'),
        t('editorUi.clipCapture.disabledMessage')
    )
}

/** 剪贴板/内容解析失败 → 已本地化文案（禁止静默失败） */
function describeClipContentFailure(failure: {
    reason: ClipContentFailureReason
    maxBytes?: number
}): string {
    switch (failure.reason) {
        case 'empty':
            return t('editorUi.clipCapture.emptyClipboard')
        case 'unavailable':
            return t('editorUi.clipCapture.unavailable')
        case 'read-failed':
            return t('editorUi.clipCapture.readFailed')
        case 'too-large':
            return t('editorUi.clipCapture.contentTooLarge', {
                max: formatSizeLimit(failure.maxBytes ?? CLIP_CONTENT_MAX_BYTES)
            })
    }
}

/** 展示剪贴板/内容解析失败提示（日志 + 错误对话框） */
function showClipContentFailure(failure: {
    reason: ClipContentFailureReason
    maxBytes?: number
}): void {
    const message = describeClipContentFailure(failure)
    logger.error(`[ClipCapture] 读取/解析剪贴板失败（reason=${failure.reason}）：`, message)
    getConfigStore().showError(t('editorUi.clipCapture.failedTitle'), message)
}

/** 主进程结构化 reason → 已本地化文案（未知 reason 回退通用文案） */
function describeClipNoteFailure(result: OpenOrCreateEntryResult | null | undefined): string {
    switch (result?.reason) {
        case 'no-workspace':
            return t('editorUi.clipCapture.noWorkspace')
        case 'invalid-kind':
            return t('editorUi.clipCapture.invalidKind')
        case 'write-failed':
            return t('editorUi.clipCapture.writeFailed')
        case 'content-too-large':
            return t('editorUi.clipCapture.contentTooLarge', {
                max: formatSizeLimit(CLIP_CONTENT_MAX_BYTES)
            })
        default:
            return t('editorUi.clipCapture.failedMessage')
    }
}

/**
 * 来源引用行（插入当前笔记末尾）：`> 剪藏自：<title 或 URL> · <date>`；
 * 无标题且无来源 URL 时返回空串（调用方省略该行）。
 */
function buildSourceReferenceLine(metadata: ClipSourceMetadata, now: Date): string {
    const source = metadata.title ?? metadata.sourceUrl
    if (!source) {
        return ''
    }
    return `> ${t('editorUi.clipCapture.sourceLine', {
        source,
        date: formatEntryDate(now)
    })}`
}

/**
 * 剪藏到新笔记：读剪贴板 → 转换 Markdown → 经既有 `FILE.OPEN_OR_CREATE_ENTRY`
 * （kind='clip'，不新增通道）在工作区 `inbox/` 下新建剪藏笔记并打开。
 *
 * 异步执行、不向调用方抛错；所有失败路径均有可见提示。
 */
export function captureClipToNote(): void {
    void (async () => {
        const resolved = await resolveClipContent()
        if (!resolved.ok) {
            showClipContentFailure(resolved)
            return
        }
        const ipcRenderer = typeof window !== 'undefined' ? window.electron?.ipcRenderer : undefined
        if (!ipcRenderer) {
            logger.error('[ClipCapture] 受限 ipcRenderer 不可用，无法剪藏到新笔记')
            getConfigStore().showError(
                t('editorUi.clipCapture.failedTitle'),
                t('editorUi.clipCapture.unavailable')
            )
            return
        }
        const payload: OpenOrCreateEntryRequest = {
            kind: 'clip',
            content: resolved.markdown
        }
        const title = sanitizeClipTitle(resolved.metadata.title)
        if (title) {
            payload.title = title
        }
        const sourceUrl = sanitizeClipSourceUrl(resolved.metadata.sourceUrl)
        if (sourceUrl) {
            payload.sourceUrl = sourceUrl
        }
        try {
            const raw: unknown = await ipcRenderer.invoke(IPC.FILE.OPEN_OR_CREATE_ENTRY, payload)
            const result = raw as OpenOrCreateEntryResult | null | undefined
            if (result?.ok === true) {
                return
            }
            const message = describeClipNoteFailure(result)
            logger.error('[ClipCapture] 剪藏到新笔记失败：', result)
            getConfigStore().showError(t('editorUi.clipCapture.failedTitle'), message)
        } catch (error) {
            logger.error('[ClipCapture] 剪藏到新笔记 IPC 调用异常：', error)
            getConfigStore().showError(
                t('editorUi.clipCapture.failedTitle'),
                t('editorUi.clipCapture.invokeFailed', {
                    error: describeActionError(error, t('common.unknown'))
                })
            )
        }
    })()
}

/**
 * 剪藏并插入当前笔记：读剪贴板 → 转换 Markdown → `insertMarkdownAtSelection`
 * 写入当前活动编辑器光标/选区处，末尾附来源引用行（无来源信息时省略）。
 *
 * @param now 当前时间（仅供单测注入固定值；生产不传，取本机当前时间）
 */
export function captureClipToEditor(now: Date = new Date()): void {
    void (async () => {
        const resolved = await resolveClipContent()
        if (!resolved.ok) {
            showClipContentFailure(resolved)
            return
        }
        const editor = getActiveEditor()
        if (!editor) {
            logger.error('[ClipCapture] 当前没有可用的编辑器，已取消插入')
            getConfigStore().showError(
                t('editorUi.clipCapture.failedTitle'),
                t('editorUi.clipCapture.editorUnavailable')
            )
            return
        }
        const sourceLine = buildSourceReferenceLine(resolved.metadata, now)
        const markdown = sourceLine ? `${resolved.markdown}\n\n${sourceLine}` : resolved.markdown
        let inserted = false
        try {
            const pasteEnhance = await loadPasteEnhance()
            inserted = pasteEnhance.insertMarkdownAtSelection(editor, markdown)
        } catch (error) {
            logger.error('[ClipCapture] A8 剪贴板插入模块加载失败：', error)
        }
        if (!inserted) {
            logger.error('[ClipCapture] 插入当前笔记失败（编辑器不可写/无模型）')
            getConfigStore().showError(
                t('editorUi.clipCapture.failedTitle'),
                t('editorUi.clipCapture.insertFailed')
            )
        }
    })()
}
