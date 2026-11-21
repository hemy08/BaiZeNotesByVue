/**
 * A8 粘贴 / 复制增强（默认开启，不受能力开关控制）中可复用、可测试的核心实现。
 *
 * 能力拆解：
 * 1. 粘贴 HTML → Markdown：剪贴板存在 `text/html` 时，经 DOMParser 白名单清洗
 *    （剥离 script/style 等危险节点、事件属性与不安全 URL 协议）后由 turndown 转 Markdown；
 *    图片剪贴板与纯文本剪贴板保持既有粘贴路径（Ctrl+V 命令 / 原生 paste 事件各自回退）。
 * 2. 复制为 Markdown / 复制为 HTML：HTML 输出对文本做转义并保留段落/换行基本结构；
 *    优先 `navigator.clipboard.write`，失败回退 `document.execCommand('copy')`。
 *
 * 设计约束：
 * - 纯函数（htmlToMarkdown / selectionToHtml / sanitizeClipboardHtml）不依赖 Monaco、可单测；
 * - 编辑器写入统一走 hemy-editor-common 的既有 insert/replace 能力，不新开编辑通道；
 * - 剪贴板 HTML 大小上限 1 MiB，超限直接放弃转换（回退默认粘贴），避免卡顿。
 */
import type * as monaco from 'monaco-editor'
import TurndownService from 'turndown'
import { logger } from '../../common/logger'
import { EventHandleMaps, OnInsertAfterCursor, replaceSelection } from './hemy-editor-common'

/** 剪贴板 HTML 转 Markdown 的最大字节数（UTF-8）；超限放弃转换 */
export const HTML_TO_MARKDOWN_MAX_BYTES = 1024 * 1024

/** 清洗保留的标签白名单（覆盖粘贴常见富文本结构，其余标签脱壳保留文本） */
const ALLOWED_TAGS = new Set([
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'dd',
    'del',
    'div',
    'dl',
    'dt',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'kbd',
    'li',
    'mark',
    'ol',
    'p',
    'pre',
    's',
    'span',
    'strike',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul'
])

/** 危险/交互节点：整棵移除（不是脱壳），避免脚本、样式、表单、媒体资源进入转换 */
const DANGEROUS_TAGS = new Set([
    'applet',
    'audio',
    'base',
    'button',
    'canvas',
    'embed',
    'frame',
    'frameset',
    'iframe',
    'input',
    'link',
    'math',
    'meta',
    'noscript',
    'object',
    'option',
    'script',
    'select',
    'source',
    'style',
    'svg',
    'template',
    'textarea',
    'track',
    'video'
])

/** 允许保留的属性（其余属性一律移除，含 on* 事件属性与 style） */
const ALLOWED_ATTRIBUTES = new Set(['alt', 'class', 'colspan', 'href', 'rowspan', 'src', 'title'])

/** 代码语言 class（turndown 的围栏代码块按 `language-*` 识别语言） */
const CODE_LANGUAGE_CLASS_PATTERN = /^(?:language|lang)-[\w-]+$/i

/** href 允许的协议（相对路径/锚点不在此列表，按相对 URL 放行） */
const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** 统计 UTF-8 字节数（网页剪贴板 HTML 可能很大，仅用于上限判断） */
function utf8ByteLength(text: string): number {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length
    }
    let bytes = 0
    for (const character of text) {
        const codePoint = character.codePointAt(0) ?? 0
        bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    }
    return bytes
}

/** 校验并归一化 URL 属性；不安全协议返回 null（调用方移除该属性） */
function sanitizeUrlAttribute(
    tagName: string,
    attributeName: string,
    rawValue: string
): string | null {
    const value = rawValue.trim()
    if (!value) {
        return null
    }
    const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i)
    if (!schemeMatch) {
        // 相对路径 / 锚点 / 协议相对（`//host`）
        return value
    }
    const scheme = `${schemeMatch[1].toLowerCase()}:`
    if (attributeName === 'src') {
        if (tagName !== 'img') {
            return null
        }
        if (scheme === 'data:') {
            return /^data:image\//i.test(value) ? value : null
        }
        return scheme === 'http:' || scheme === 'https:' ? value : null
    }
    // href：仅 http/https/mailto，禁止 data:/javascript: 等
    return SAFE_HREF_PROTOCOLS.has(scheme) ? value : null
}

/** 递归清洗容器内节点（危险节点整棵移除；非白名单标签脱壳保留文本） */
function sanitizeContainer(container: ParentNode): void {
    const elements = Array.from(container.querySelectorAll('*'))
    for (const element of elements) {
        if (!element.parentNode) {
            // 父节点已被整棵移除，跳过悬挂的子树节点
            continue
        }
        const tagName = element.tagName.toLowerCase()
        if (DANGEROUS_TAGS.has(tagName)) {
            element.remove()
            continue
        }
        if (!ALLOWED_TAGS.has(tagName)) {
            element.replaceWith(...Array.from(element.childNodes))
            continue
        }
        for (const attribute of Array.from(element.attributes)) {
            const attributeName = attribute.name.toLowerCase()
            if (!ALLOWED_ATTRIBUTES.has(attributeName)) {
                element.removeAttribute(attribute.name)
                continue
            }
            if (attributeName === 'class') {
                // class 仅保留代码语言标记（避免样式类进入 Markdown；turndown 依赖它识别语言）
                const languageClass = attribute.value
                    .split(/\s+/)
                    .find((token) => CODE_LANGUAGE_CLASS_PATTERN.test(token))
                if (tagName === 'code' && languageClass) {
                    element.setAttribute('class', languageClass)
                } else {
                    element.removeAttribute('class')
                }
                continue
            }
            if (attributeName === 'href' || attributeName === 'src') {
                const safeValue = sanitizeUrlAttribute(tagName, attributeName, attribute.value)
                if (safeValue === null) {
                    element.removeAttribute(attribute.name)
                } else if (safeValue !== attribute.value) {
                    element.setAttribute(attribute.name, safeValue)
                }
            }
        }
    }
}

/**
 * 清洗剪贴板 HTML：白名单标签 + 白名单属性 + URL 协议校验 + 危险节点移除。
 *
 * @returns 清洗后的 body 内 HTML；输入为空/超限/无 DOMParser 环境时返回空串
 */
export function sanitizeClipboardHtml(
    html: string,
    maxBytes: number = HTML_TO_MARKDOWN_MAX_BYTES
): string {
    if (!html || !html.trim() || utf8ByteLength(html) > maxBytes) {
        return ''
    }
    if (typeof DOMParser === 'undefined') {
        return ''
    }
    let document: Document
    try {
        document = new DOMParser().parseFromString(html, 'text/html')
    } catch (error) {
        logger.warn('[paste-enhance] 剪贴板 HTML 解析失败，已回退默认粘贴:', error)
        return ''
    }
    const body = document.body
    if (!body) {
        return ''
    }
    sanitizeContainer(body)
    return body.innerHTML
}

/** turndown 转换器（惰性单例：避免启动期创建与无 DOM 环境的构造失败） */
let turndownService: TurndownService | null = null

/** 取（或创建）配置好的 turndown 转换器；创建失败返回 null */
function getTurndownService(): TurndownService | null {
    if (turndownService) {
        return turndownService
    }
    try {
        turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            hr: '---'
        })
        return turndownService
    } catch (error) {
        logger.warn('[paste-enhance] turndown 初始化失败，已回退默认粘贴:', error)
        return null
    }
}

/** 归一化 Markdown 换行与连续空行，去掉首尾空白 */
function normalizeMarkdown(markdown: string): string {
    return markdown
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * 剪贴板 HTML → Markdown。
 *
 * @param html 剪贴板 `text/html` 数据
 * @param maxBytes 大小上限（默认 1 MiB）
 * @returns Markdown 文本；空输入/超限/清洗后无内容/转换失败时返回空串（调用方回退默认粘贴）
 */
export function htmlToMarkdown(
    html: string,
    maxBytes: number = HTML_TO_MARKDOWN_MAX_BYTES
): string {
    if (!html || utf8ByteLength(html) > maxBytes) {
        return ''
    }
    const sanitizedHtml = sanitizeClipboardHtml(html, maxBytes)
    if (!sanitizedHtml.trim()) {
        return ''
    }
    const service = getTurndownService()
    if (!service) {
        return ''
    }
    try {
        return normalizeMarkdown(service.turndown(sanitizedHtml))
    } catch (error) {
        logger.warn('[paste-enhance] HTML 转 Markdown 失败，已回退默认粘贴:', error)
        return ''
    }
}

/** HTML 文本转义（复制为 HTML 时防止 Markdown 源码被当作标签解析） */
export function escapeHtmlText(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * 选区文本 → HTML（复制为 HTML）。
 *
 * 输出语义：文本全部转义（不解释 Markdown/HTML），空行分段为 `<p>`、段内换行为 `<br>`，
 * 既保证粘贴到富文本编辑器时保留基本段落结构，又不引入任何可执行内容。
 */
export function selectionToHtml(text: string): string {
    if (!text) {
        return ''
    }
    const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/)
    const htmlParts: string[] = []
    for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
            continue
        }
        const lines = paragraph.split('\n').map((line) => escapeHtmlText(line))
        htmlParts.push(`<p>${lines.join('<br>')}</p>`)
    }
    return htmlParts.join('\n')
}

/** 剪贴板写入载荷：text/plain 与 text/html 任选其一或同时提供 */
export interface ClipboardPayload {
    text?: string
    html?: string
}

/** execCommand 回退：临时 copy 监听写入剪贴板（异步 Clipboard API 不可用/被拒时使用） */
function writeClipboardWithExecCommand(payload: ClipboardPayload): boolean {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
        return false
    }
    const handleCopy = (event: ClipboardEvent): void => {
        const data = event.clipboardData
        if (!data) {
            return
        }
        if (payload.text !== undefined) {
            data.setData('text/plain', payload.text)
        }
        if (payload.html !== undefined) {
            data.setData('text/html', payload.html)
        }
        event.preventDefault()
    }
    document.addEventListener('copy', handleCopy, true)
    try {
        return document.execCommand('copy')
    } catch (error) {
        logger.warn('[paste-enhance] execCommand 复制失败:', error)
        return false
    } finally {
        document.removeEventListener('copy', handleCopy, true)
    }
}

/**
 * 写入剪贴板：优先异步 Clipboard API（可同时写 text/plain + text/html），
 * 失败（含权限拒绝、ClipboardItem 不可用）回退 `execCommand('copy')`。
 */
export async function writeClipboardPayload(payload: ClipboardPayload): Promise<boolean> {
    if (payload.text === undefined && payload.html === undefined) {
        return false
    }
    if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem === 'function'
    ) {
        try {
            const entries: Record<string, Blob> = {}
            if (payload.text !== undefined) {
                entries['text/plain'] = new Blob([payload.text], { type: 'text/plain' })
            }
            if (payload.html !== undefined) {
                entries['text/html'] = new Blob([payload.html], { type: 'text/html' })
            }
            await navigator.clipboard.write([new ClipboardItem(entries)])
            return true
        } catch (error) {
            logger.warn('[paste-enhance] Clipboard API 写入失败，回退 execCommand:', error)
        }
    }
    return writeClipboardWithExecCommand(payload)
}

/** 把 Markdown 插入当前选区（有选区替换、无选区插入光标处），换行按模型 EOL 归一化 */
export function insertMarkdownAtSelection(
    editor: monaco.editor.IStandaloneCodeEditor,
    markdown: string
): boolean {
    if (!markdown) {
        return false
    }
    const model = editor.getModel()
    if (!model) {
        return false
    }
    const eol = typeof model.getEOL === 'function' ? model.getEOL() : '\n'
    const text = markdown.replace(/\r\n?|\n/g, eol)
    const selection = editor.getSelection()
    if (selection && !selection.isEmpty()) {
        replaceSelection(editor, text, true, selection)
    } else {
        OnInsertAfterCursor(editor, text)
    }
    return true
}

/* ==================== 键盘粘贴会话守卫 ====================
 * 应用既有行为：Ctrl+V 由编辑器命令接管（自定义命令读取剪贴板后插入），
 * 键盘粘贴通常不会触发原生 paste 事件；但个别运行时/输入法仍会触发。
 * 键盘命令开始到结束的短暂窗口内忽略原生 paste 监听，避免同一次粘贴插入两遍。
 */
/** 防止重复插入的守卫窗口（毫秒） */
export const KEYBOARD_PASTE_GUARD_MS = 1500
let keyboardPasteSessionDeadline = 0

/** 标记键盘粘贴开始（守卫窗口内忽略原生 paste 事件） */
export function beginKeyboardPasteSession(): void {
    keyboardPasteSessionDeadline = Date.now() + KEYBOARD_PASTE_GUARD_MS
}

/** 标记键盘粘贴结束（恢复原生 paste 事件处理） */
export function endKeyboardPasteSession(): void {
    keyboardPasteSessionDeadline = 0
}

/** 当前是否处于键盘粘贴守卫窗口 */
export function isKeyboardPasteSessionActive(): boolean {
    return Date.now() < keyboardPasteSessionDeadline
}

/** 读取剪贴板条目；不可用/被拒时返回空数组（调用方继续走纯文本回退） */
async function readClipboardItems(): Promise<readonly ClipboardItem[]> {
    if (
        typeof navigator === 'undefined' ||
        !navigator.clipboard ||
        typeof navigator.clipboard.read !== 'function'
    ) {
        return []
    }
    try {
        return await navigator.clipboard.read()
    } catch (error) {
        // 权限被拒/安全策略下 read() 会抛错，此时仍可尝试 readText()
        logger.warn('[paste-enhance] 读取剪贴板条目失败，回退纯文本:', error)
        return []
    }
}

/** Blob → data URL（图片粘贴仍复用既有 INSERT_IMAGE 通道，需要 data URL） */
function blobToDataUrl(blob: Blob): Promise<string | null> {
    if (typeof FileReader !== 'function') {
        return Promise.resolve(null)
    }
    return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
            resolve(typeof reader.result === 'string' ? reader.result : null)
        }
        reader.onerror = () => {
            logger.warn('[paste-enhance] 图片剪贴板读取失败:', reader.error)
            resolve(null)
        }
        reader.readAsDataURL(blob)
    })
}

/** 剪贴板读取结果的归属（便于调用方/单测断言走了哪条粘贴路径） */
export type ClipboardPasteKind = 'html' | 'image' | 'text' | 'none'

/**
 * 键盘 Ctrl+V 粘贴入口：图片 → 既有 INSERT_IMAGE 通道；HTML → Markdown；
 * 其余 → 既有纯文本插入。任何一步失败都回退到后续通道，不静默吞掉整次粘贴。
 */
export async function pasteFromSystemClipboard(
    editor: monaco.editor.IStandaloneCodeEditor
): Promise<ClipboardPasteKind> {
    beginKeyboardPasteSession()
    try {
        if (typeof navigator === 'undefined' || !navigator.clipboard) {
            return 'none'
        }
        const clipboard = navigator.clipboard
        const items = await readClipboardItems()

        // 1) 图片优先：与原 Ctrl+V 行为一致（图片不进入文本/Markdown 通道）
        for (const item of items) {
            const imageType = item.types.find(
                (type) => type === 'image/png' || type === 'image/jpeg'
            )
            if (!imageType) {
                continue
            }
            let dataUrl: string | null = null
            try {
                dataUrl = await blobToDataUrl(await item.getType(imageType))
            } catch (error) {
                logger.warn('[paste-enhance] 图片剪贴板读取失败，继续尝试文本:', error)
            }
            if (dataUrl) {
                EventHandleMaps.insertimage(dataUrl)
                return 'image'
            }
        }

        // 2) HTML → Markdown（转换失败/超限时继续走纯文本，保持既有行为）
        for (const item of items) {
            if (!item.types.includes('text/html')) {
                continue
            }
            try {
                const html = await (await item.getType('text/html')).text()
                const markdown = htmlToMarkdown(html)
                if (markdown && insertMarkdownAtSelection(editor, markdown)) {
                    return 'html'
                }
            } catch (error) {
                logger.warn('[paste-enhance] 剪贴板 HTML 读取失败，回退纯文本:', error)
            }
        }

        // 3) 纯文本：与原 Ctrl+V 行为一致
        if (typeof clipboard.readText === 'function') {
            const text = await clipboard.readText()
            EventHandleMaps.paste(editor, text)
            return 'text'
        }
        return 'none'
    } catch (error) {
        logger.warn('[paste-enhance] 粘贴失败，已取消本次粘贴:', error)
        return 'none'
    } finally {
        endKeyboardPasteSession()
    }
}

/** 粘贴增强监听句柄 */
export interface PasteEnhanceDisposable {
    dispose(): void
}

/** 剪贴板 DataTransfer 中是否含图片文件（含图片时保持既有图片粘贴路径，不拦截） */
function hasImageFile(data: DataTransfer): boolean {
    for (let index = 0; index < data.items.length; index++) {
        const item = data.items[index]
        if (item && item.kind === 'file' && item.type.startsWith('image/')) {
            return true
        }
    }
    return false
}

/**
 * 处理原生 paste 事件（DOM capture）：剪贴板有 HTML 且成功转换插入时拦截默认粘贴。
 *
 * @returns 是否已拦截（true 表示调用方不应再执行默认粘贴）
 */
export function handleNativePasteEvent(
    editor: monaco.editor.IStandaloneCodeEditor,
    event: ClipboardEvent
): boolean {
    if (isKeyboardPasteSessionActive()) {
        // 键盘命令正在处理同一次粘贴，避免重复插入
        return false
    }
    const clipboardData = event.clipboardData
    if (!clipboardData) {
        return false
    }
    if (hasImageFile(clipboardData)) {
        // 图片粘贴保持既有路径
        return false
    }
    let html: string
    try {
        html = clipboardData.getData('text/html')
    } catch {
        return false
    }
    if (!html) {
        // 纯文本走默认粘贴
        return false
    }
    const markdown = htmlToMarkdown(html)
    if (!markdown || !insertMarkdownAtSelection(editor, markdown)) {
        return false
    }
    event.preventDefault()
    event.stopPropagation()
    return true
}

/**
 * 给编辑器 DOM 根节点注册原生 paste 捕获监听（覆盖右键菜单/原生菜单粘贴等非 Ctrl+V 命令路径）。
 *
 * @returns 监听句柄；编辑器无 DOM 根节点时返回 null
 */
export function attachPasteEnhance(
    editor: monaco.editor.IStandaloneCodeEditor
): PasteEnhanceDisposable | null {
    if (!editor || typeof editor.getDomNode !== 'function') {
        return null
    }
    const domNode = editor.getDomNode()
    if (!domNode || typeof domNode.addEventListener !== 'function') {
        return null
    }
    const handler = (event: ClipboardEvent): void => {
        handleNativePasteEvent(editor, event)
    }
    domNode.addEventListener('paste', handler, true)
    return {
        dispose(): void {
            domNode.removeEventListener('paste', handler, true)
        }
    }
}
