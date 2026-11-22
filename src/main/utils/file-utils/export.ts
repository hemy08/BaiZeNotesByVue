/**
 * 导出模块 - 优化版
 * 使用配置驱动的方式统一处理各种格式的导出
 *
 * P1-7（2026-11-20 全量代码扫描）：HTML/PDF 导出专用的 markdown-it（≈4.7ms）原先在模块
 * 顶层静态加载，会进入主进程启动期急切 require 图。现改为「首次执行 HTML/PDF 导出时
 * 才惰性 require」（模块级缓存）；officegen 原本就只在 ToWord 函数内 require，本次保持不变。
 *
 * P2-2（2026-11-20 性能扫描）：Word 导出（officegen 流式生成，实测 1MB 文本 76ms）原先在
 * 主进程同步执行，期间所有窗口 UI/IPC/菜单/定时器停摆。现改为在 Node worker 线程执行
 * （见 word-worker-client.ts / word-worker.ts），主进程只做消息转发与成功/失败提示；
 * worker 基础设施不可用时降级为主进程内导出并记录 WARN（功能可用性兜底）。
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { dialog, BrowserWindow, app, shell } from 'electron'
// P1-7：markdown-it 改为首次 HTML/PDF 导出时惰性 require，这里只保留类型导入（编译期擦除）
import type MarkdownItType from 'markdown-it'
import { showErrorMessageBox, showInfoMessageBox } from './dialog-helpers'
import { appState } from '../app-state'
import { tMain } from '../i18n'
import { logger } from '../logger'
// P1-AS-1：导出目标来自系统保存对话框（用户显式选择），返回后登记为受信精确文件；
// 导出器只写该路径，避免渲染层通过其它入口驱动任意写
import { registerTrustedPath, isSameOrWithin } from '../security'
import { getThemeApiFromProvider } from '../providers'
// P2-2：Word 重计算改由 worker 线程执行；基础设施不可用时降级为进程内导出
import {
    exportMarkdownToWordWithWorker,
    isWordWorkerInfrastructureError
} from './word-worker-client'
import { exportMarkdownToWordInProcess } from './word-worker-tasks'

/** P1-7：markdown-it 构造函数类型（默认导入为可直接 new 的构造器） */
type MarkdownItConstructor = typeof MarkdownItType

let markdownItConstructor: MarkdownItConstructor | null = null

/**
 * P1-7：按需加载 markdown-it（仅 HTML/PDF 导出使用）。
 * 采用函数内 require（首次使用时同步加载）而非顶层静态 import：主进程产物为 CJS，
 * require 在文件系统 / asar 内的解析行为稳定（Electron 主进程原生 `import()` 加载 asar
 * 内 node_modules 存在历史兼容问题 electron#38957）；与既有 officegen 同一模式。
 */
function loadMarkdownItConstructor(): MarkdownItConstructor {
    if (!markdownItConstructor) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- P1-7：启动期不加载，首次 HTML/PDF 导出时才 require；asar 内原生 import() 兼容性差，采用与 officegen 一致的惰性 require
        markdownItConstructor = require('markdown-it') as MarkdownItConstructor
    }
    return markdownItConstructor
}

/**
 * C4：自包含 HTML 导出的可选上下文。
 * - sourceFilePath：当前活动文件路径，用于把相对图片解析到文件所在目录；
 * - workspaceRoot：工作区根；图片 realpath 必须落在根内（防止导出时越界读取）；
 * - 两者缺省时退化为只导出 Markdown 正文，不内联本地图片。
 */
export interface HtmlExportOptions {
    sourceFilePath?: string | null
    workspaceRoot?: string | null
}

/** 导出文档图片内联上限：单张 5 MiB、整篇 20 MiB，避免导出文件失控。 */
const EXPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const EXPORT_IMAGES_TOTAL_MAX_BYTES = 20 * 1024 * 1024

const EXPORT_IMAGE_MIME: Readonly<Record<string, string>> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon'
}

interface ExportHeading {
    level: number
    text: string
    id: string
}

interface ExportThemeStyles {
    name: string
    backgroundColor: string
    cardBackground: string
    textColor: string
    secondaryTextColor: string
    borderColor: string
    accentColor: string
}

const FALLBACK_EXPORT_THEME: ExportThemeStyles = {
    name: 'baize',
    backgroundColor: '#fbf9fe',
    cardBackground: '#ffffff',
    textColor: '#252233',
    secondaryTextColor: '#6d6980',
    borderColor: '#e7e2ef',
    accentColor: '#764ba2'
}

/** 读取当前应用主题（失败时回退内置默认色，不阻塞导出）。 */
function loadExportTheme(): ExportThemeStyles {
    try {
        const styles = getThemeApiFromProvider().getCurrentThemeStyles()
        return styles && typeof styles === 'object'
            ? { ...FALLBACK_EXPORT_THEME, ...styles }
            : FALLBACK_EXPORT_THEME
    } catch {
        return FALLBACK_EXPORT_THEME
    }
}

function escapeExportHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function decodeExportImageSrc(value: string): string {
    let decoded = value.replace(/&amp;/g, '&')
    try {
        decoded = decodeURIComponent(decoded)
    } catch {
        // 非法百分号编码保持原值，后续按路径解析失败即跳过
    }
    return decoded
}

/**
 * 把 Markdown 中的相对本地图片内联为 data URI。
 * 安全口径：只读取 realpath 落在工作区根内的文件；远程/data/协议 URL 原样保留，不发起读取。
 */
async function inlineLocalExportImages(html: string, options: HtmlExportOptions): Promise<string> {
    const sourceFilePath = options.sourceFilePath ?? null
    const workspaceRoot = options.workspaceRoot ?? appState.rootPath ?? ''
    if (!workspaceRoot) {
        return html
    }
    const sourceDir = sourceFilePath ? path.dirname(sourceFilePath) : workspaceRoot
    let totalBytes = 0
    const matches = Array.from(html.matchAll(/(<img\b[^>]*\bsrc=")([^"]*)(")/gi))
    for (const match of matches) {
        const rawSrc = match[2]
        if (
            !rawSrc ||
            /^(?:data:|https?:|\/\/|blob:|app:|file:)/i.test(rawSrc) ||
            rawSrc.startsWith('#')
        ) {
            continue
        }
        const withoutQuery = rawSrc.split(/[?#]/, 1)[0]
        const decoded = decodeExportImageSrc(withoutQuery)
        const candidate = path.isAbsolute(decoded)
            ? path.normalize(decoded)
            : path.resolve(sourceDir, decoded)
        let realCandidate: string
        try {
            realCandidate = await fs.realpath(candidate)
        } catch {
            continue
        }
        if (!isSameOrWithin(realCandidate, workspaceRoot)) {
            continue
        }
        const ext = path.extname(realCandidate).toLowerCase()
        const mime = EXPORT_IMAGE_MIME[ext]
        if (!mime) {
            continue
        }
        try {
            const stat = await fs.stat(realCandidate)
            if (!stat.isFile() || stat.size <= 0 || stat.size > EXPORT_IMAGE_MAX_BYTES) {
                continue
            }
            if (totalBytes + stat.size > EXPORT_IMAGES_TOTAL_MAX_BYTES) {
                break
            }
            const data = await fs.readFile(realCandidate)
            totalBytes += data.byteLength
            html = html.replace(
                match[0],
                `${match[1]}data:${mime};base64,${data.toString('base64')}${match[3]}`
            )
        } catch {
            // 单张图片不可读时跳过，不影响整篇导出
        }
    }
    return html
}

/**
 * 构建主题化、自包含的 HTML 文档（HTML 导出 / 打印预览共用）。
 * - 标题加稳定锚点并生成可点击目录；
 * - 内联当前主题 CSS；本地图片按安全路径校验后内联 base64；
 * - 不引入脚本、不加载外部 CSS/字体，导出文件可离线打开。
 */
export async function BuildStandaloneHtml(
    content: string,
    options: HtmlExportOptions = {}
): Promise<string> {
    const MarkdownIt = loadMarkdownItConstructor()
    const md = new MarkdownIt({ html: false, linkify: true, typographer: false })
    const env: Record<string, unknown> = {}
    const tokens = md.parse(content, env)
    const headings: ExportHeading[] = []
    for (const token of tokens) {
        if (token.type !== 'heading_open' || !/^h[1-6]$/.test(token.tag)) {
            continue
        }
        const inline = tokens[tokens.indexOf(token) + 1]
        const text = inline && inline.type === 'inline' ? inline.content : ''
        const level = Number(token.tag.slice(1))
        const id = `section-${headings.length + 1}`
        token.attrSet('id', id)
        headings.push({ level, text, id })
    }
    const body = md.renderer.render(tokens, md.options, env)
    const titleHeading = headings.find((heading) => heading.level === 1)
    const title =
        titleHeading?.text ||
        (options.sourceFilePath
            ? path.basename(options.sourceFilePath, path.extname(options.sourceFilePath))
            : 'BaiZeNotes')
    const tocHeadings = headings.filter((heading) => heading.level === 2 || heading.level === 3)
    const toc = tocHeadings.length
        ? `<nav class="export-toc" aria-label="目录"><h2>目录</h2>${tocHeadings
              .map(
                  (heading) =>
                      `<a class="export-toc-level-${heading.level}" href="#${heading.id}">${escapeExportHtml(heading.text)}</a>`
              )
              .join('')}</nav>`
        : ''
    const theme = loadExportTheme()
    const version = await getAppVersionForExport()
    const exportedAt = new Date().toLocaleString('zh-CN')
    const htmlWithImages = await inlineLocalExportImages(body, options)
    const footer = `由白泽笔记 v${escapeExportHtml(version)} 导出于 ${escapeExportHtml(exportedAt)}`
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="BaiZeNotes v${escapeExportHtml(version)}">
<title>${escapeExportHtml(title)}</title>
<style>
:root{--export-bg:${theme.backgroundColor};--export-card:${theme.cardBackground};--export-text:${theme.textColor};--export-muted:${theme.secondaryTextColor};--export-border:${theme.borderColor};--export-accent:${theme.accentColor};}
*{box-sizing:border-box}
body{margin:0;background:var(--export-bg);color:var(--export-text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;line-height:1.75}
.export-layout{max-width:980px;margin:0 auto;padding:32px 24px 56px}
.export-header{border-bottom:1px solid var(--export-border);padding-bottom:14px;margin-bottom:24px}
.export-header h1{margin:0;font-size:2rem}
.export-toc{background:var(--export-card);border:1px solid var(--export-border);border-radius:10px;padding:14px 18px;margin:0 0 24px}
.export-toc h2{margin:0 0 8px;font-size:1.05rem;color:var(--export-muted)}
.export-toc a{display:block;color:var(--export-accent);text-decoration:none;padding:2px 0}
.export-toc a:hover{text-decoration:underline}
.export-toc-level-3{padding-left:18px!important;font-size:.92em}
.export-content h1,.export-content h2,.export-content h3{scroll-margin-top:16px;line-height:1.35}
.export-content h2{border-bottom:1px solid var(--export-border);padding-bottom:6px;margin-top:1.8em}
.export-content h3{margin-top:1.4em}
.export-content a{color:var(--export-accent)}
.export-content img{max-width:100%;height:auto}
.export-content pre{background:var(--export-card);border:1px solid var(--export-border);border-radius:8px;padding:12px;overflow:auto}
.export-content code{background:var(--export-card);border:1px solid var(--export-border);border-radius:4px;padding:1px 5px}
.export-content pre code{border:0;padding:0}
.export-content blockquote{border-left:4px solid var(--export-accent);margin:1em 0;padding:6px 16px;background:var(--export-card);color:var(--export-muted)}
.export-content table{border-collapse:collapse;width:100%;margin:1em 0}
.export-content th,.export-content td{border:1px solid var(--export-border);padding:8px 10px;text-align:left}
.export-content th{background:var(--export-card)}
.export-footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--export-border);color:var(--export-muted);font-size:12px}
@media print{body{background:#fff;color:#111}.export-layout{max-width:none;padding:0}.export-toc{break-inside:avoid}.export-content a{color:#111}.export-footer{color:#666}}
@page{size:A4;margin:16mm 15mm 18mm}
</style>
</head>
<body>
<div class="export-layout">
<header class="export-header"><h1>${escapeExportHtml(title)}</h1></header>
${toc}
<main class="export-content">${htmlWithImages}</main>
<footer class="export-footer">${footer}</footer>
</div>
</body>
</html>`
}

/* ============================================================================
 * C1：EPUB 导出 / E8：幻灯片 HTML 导出
 * ========================================================================== */

/** 去掉 Markdown 顶部 YAML front matter（仅用于 EPUB/幻灯片正文，不改变原文件）。 */
function stripMarkdownFrontMatter(content: string): string {
    return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/** 读取并收集 HTML 中的本地图片，替换为 EPUB 内相对路径。 */
async function collectEpubImages(
    html: string,
    options: HtmlExportOptions
): Promise<{ html: string; images: Array<{ name: string; mime: string; data: Buffer }> }> {
    const sourceFilePath = options.sourceFilePath ?? null
    const workspaceRoot = options.workspaceRoot ?? appState.rootPath ?? ''
    if (!workspaceRoot) {
        return { html, images: [] }
    }
    const sourceDir = sourceFilePath ? path.dirname(sourceFilePath) : workspaceRoot
    const images: Array<{ name: string; mime: string; data: Buffer }> = []
    const matches = Array.from(html.matchAll(/(<img\b[^>]*\bsrc=")([^"]*)(")/gi))
    for (const match of matches) {
        const rawSrc = match[2]
        if (
            !rawSrc ||
            /^(?:data:|https?:|\/\/|blob:|app:|file:)/i.test(rawSrc) ||
            rawSrc.startsWith('#')
        ) {
            continue
        }
        const withoutQuery = rawSrc.split(/[?#]/, 1)[0]
        const decoded = decodeExportImageSrc(withoutQuery)
        const candidate = path.isAbsolute(decoded)
            ? path.normalize(decoded)
            : path.resolve(sourceDir, decoded)
        let realCandidate: string
        try {
            realCandidate = await fs.realpath(candidate)
        } catch {
            continue
        }
        if (!isSameOrWithin(realCandidate, workspaceRoot)) {
            continue
        }
        const ext = path.extname(realCandidate).toLowerCase()
        const mime = EXPORT_IMAGE_MIME[ext]
        if (!mime) {
            continue
        }
        try {
            const stat = await fs.stat(realCandidate)
            if (!stat.isFile() || stat.size <= 0 || stat.size > EXPORT_IMAGE_MAX_BYTES) {
                continue
            }
            const data = await fs.readFile(realCandidate)
            const name = `images/image-${images.length + 1}${ext}`
            images.push({ name, mime, data })
            html = html.replace(match[0], `${match[1]}${name}${match[3]}`)
        } catch {
            // 单张图片不可读时跳过，保留原 src
        }
    }
    return { html, images }
}

/** 构建 EPUB3 包（mimetype 必须第一个且不压缩）。 */
export async function ToEpub(
    content: string,
    filePath: string,
    options: HtmlExportOptions = {}
): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- EPUB 导出低频，首次使用时才加载 jszip
    const JSZip = require('jszip') as typeof import('jszip')
    const MarkdownIt = loadMarkdownItConstructor()
    const md = new MarkdownIt({ html: false, linkify: true, typographer: false, xhtmlOut: true })
    const bodyMarkdown = stripMarkdownFrontMatter(content)
    const rendered = md.render(bodyMarkdown)
    const collected = await collectEpubImages(rendered, options)
    const title = (() => {
        const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(rendered)
        if (heading) return heading[1].replace(/<[^>]+>/g, '').trim() || 'BaiZeNotes'
        return options.sourceFilePath
            ? path.basename(options.sourceFilePath, path.extname(options.sourceFilePath))
            : 'BaiZeNotes'
    })()
    const version = await getAppVersionForExport()
    const escapedTitle = escapeExportHtml(title)
    const bookId = `urn:uuid:baizenotes-${Date.now()}`
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    zip.file(
        'META-INF/container.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
    )
    zip.file('OEBPS/style.css', EPUB_STYLE_CSS)
    zip.file(
        'OEBPS/content.xhtml',
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head><meta charset="UTF-8"/><title>${escapedTitle}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><h1>${escapedTitle}</h1>${collected.html}</body>
</html>`
    )
    zip.file(
        'OEBPS/nav.xhtml',
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head><meta charset="UTF-8"/><title>目录</title></head>
<body><nav epub:type="toc" id="toc"><h1>目录</h1><ol><li><a href="content.xhtml">${escapedTitle}</a></li></ol></nav></body>
</html>`
    )
    zip.file(
        'OEBPS/toc.ncx',
        `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${bookId}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${escapedTitle}</text></docTitle>
<navMap><navPoint id="navpoint-1" playOrder="1"><navLabel><text>${escapedTitle}</text></navLabel><content src="content.xhtml"/></navPoint></navMap>
</ncx>`
    )
    const imageManifest = collected.images
        .map(
            (image) =>
                `<item id="${image.name.replace(/[^a-z0-9]/gi, '_')}" href="${image.name}" media-type="${image.mime}"/>`
        )
        .join('\n    ')
    zip.file(
        'OEBPS/content.opf',
        `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${bookId}</dc:identifier>
    <dc:title>${escapedTitle}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>BaiZeNotes</dc:creator>
    <dc:description>由白泽笔记 v${escapeExportHtml(version)} 导出</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${imageManifest}
  </manifest>
  <spine toc="ncx"><itemref idref="content"/></spine>
</package>`
    )
    for (const image of collected.images) {
        zip.file(`OEBPS/${image.name}`, image.data)
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await fs.writeFile(filePath, buffer)
}

const EPUB_STYLE_CSS = `body{font-family:serif;line-height:1.7;margin:1.2em;color:#222}
h1,h2,h3{font-family:sans-serif;line-height:1.3}
pre{background:#f4f4f4;padding:.6em;overflow-x:auto;white-space:pre-wrap}
code{background:#f4f4f4;padding:.1em .3em}
blockquote{border-left:3px solid #999;margin:0;padding-left:1em;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.4em}
img{max-width:100%;height:auto}`

/**
 * E8：把 Markdown 按 `---` 分页导出为单文件 HTML 幻灯片。
 * - 不依赖 reveal/Marp 运行时，离线可打开；
 * - 键盘 ←/→/PageUp/PageDown/空格 翻页，也支持点击左右按钮；
 * - 打印时每张幻灯片一页（@media print）。
 */
export async function ToSlidesHtml(
    content: string,
    filePath: string,
    options: HtmlExportOptions = {}
): Promise<void> {
    const MarkdownIt = loadMarkdownItConstructor()
    const md = new MarkdownIt({ html: false, linkify: true, typographer: false, xhtmlOut: true })
    const source = stripMarkdownFrontMatter(content)
    const rawSlides = splitSlideMarkdown(source)
    const slides = rawSlides
        .map((slide) => md.render(slide))
        .filter((html) => html.trim().length > 0)
    const finalSlides = slides.length > 0 ? slides : ['<p>（空文档）</p>']
    const title = (() => {
        const firstHeading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(finalSlides[0])
        if (firstHeading) return firstHeading[1].replace(/<[^>]+>/g, '').trim() || 'BaiZeNotes'
        return options.sourceFilePath
            ? path.basename(options.sourceFilePath, path.extname(options.sourceFilePath))
            : 'BaiZeNotes'
    })()
    const body = finalSlides
        .map(
            (slide, index) =>
                `<section class="slide${index === 0 ? ' active' : ''}" data-index="${index}">${slide}</section>`
        )
        .join('\n')
    const htmlWithImages = await inlineLocalExportImages(
        `<div class="slides">${body}</div>`,
        options
    )
    const escapedTitle = escapeExportHtml(title)
    const version = await getAppVersionForExport()
    const deck = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedTitle} · 幻灯片</title>
<style>
:root{--slide-bg:#1f1833;--slide-fg:#f7f3ff;--slide-accent:#b79cff;--slide-card:#2e2545}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--slide-bg);color:var(--slide-fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
body{overflow:hidden}
.deck-toolbar{position:fixed;right:18px;bottom:16px;z-index:20;display:flex;gap:8px;align-items:center;font-size:13px;color:#cfc4e8}
.deck-toolbar button{border:1px solid #6f5d97;background:#31264d;color:inherit;border-radius:6px;padding:5px 12px;cursor:pointer}
.deck-toolbar button:hover{border-color:var(--slide-accent)}
.slides{height:100%;position:relative}
.slide{position:absolute;inset:0;display:none;overflow:auto;padding:8vh 10vw;line-height:1.7;font-size:clamp(20px,2.4vw,38px)}
.slide.active{display:block}
.slide h1{font-size:clamp(36px,5vw,72px);line-height:1.2;margin:0 0 .6em;color:#fff;border-bottom:2px solid var(--slide-accent);padding-bottom:.2em}
.slide h2{font-size:1.35em;color:var(--slide-accent);margin:1.2em 0 .4em}
.slide p{margin:.6em 0}
.slide ul,.slide ol{margin:.5em 0;padding-left:1.4em}
.slide li{margin:.3em 0}
.slide a{color:var(--slide-accent)}
.slide img{max-width:100%;max-height:58vh;object-fit:contain}
.slide pre{background:#130f20;border:1px solid #4c3e6b;border-radius:8px;padding:.7em;overflow:auto;font-size:.68em}
.slide code{background:#130f20;border:1px solid #4c3e6b;padding:.08em .3em;border-radius:4px}
.slide pre code{border:0;padding:0}
.slide blockquote{border-left:4px solid var(--slide-accent);margin:.8em 0;padding:.3em 1em;background:var(--slide-card);color:#d9d0ee}
.slide table{border-collapse:collapse;width:100%;font-size:.8em}.slide th,.slide td{border:1px solid #5a4b7a;padding:.4em}
.deck-footer{position:fixed;left:22px;bottom:16px;font-size:12px;color:#8f83aa;z-index:20}
@media print{
  html,body{overflow:visible;background:#fff;color:#111}
  .deck-toolbar,.deck-footer{display:none}
  .slides{height:auto;position:static}
  .slide{position:static;display:block!important;page-break-after:always;padding:12mm 14mm;color:#111;font-size:15pt}
  .slide h1{color:#111;border-color:#764ba2}
  .slide h2{color:#5b3e8f}
  .slide pre{background:#f5f5f5;color:#111;border-color:#ddd}
  .slide code{background:#f5f5f5;color:#111;border-color:#ddd}
  .slide blockquote{background:#f5f5f5;color:#444}
  .slide table th,.slide td{border-color:#bbb}
}
@page{size:A4 landscape;margin:0}
</style>
</head>
<body>
<div class="slides" id="slides">${htmlWithImages}</div>
<div class="deck-toolbar"><button type="button" id="prev" aria-label="上一页">←</button><span id="counter">1 / ${finalSlides.length}</span><button type="button" id="next" aria-label="下一页">→</button><button type="button" id="print">打印/导出 PDF</button></div>
<div class="deck-footer">白泽笔记 v${escapeExportHtml(version)} · 幻灯片</div>
<script>
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));var index=0;
  var counter=document.getElementById('counter');
  function show(next){index=Math.max(0,Math.min(slides.length-1,next));slides.forEach(function(s,i){s.classList.toggle('active',i===index)});counter.textContent=(index+1)+' / '+slides.length;}
  document.getElementById('prev').onclick=function(){show(index-1)};
  document.getElementById('next').onclick=function(){show(index+1)};
  document.getElementById('print').onclick=function(){window.print()};
  document.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(index-1)}else if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();show(index+1)}});
  show(0);
})();
</script>
</body>
</html>`
    await fs.writeFile(filePath, deck, 'utf-8')
}

/** 按独立 `---` 行拆分幻灯片，跳过代码围栏内部的 `---`。 */
function splitSlideMarkdown(markdown: string): string[] {
    const slides: string[] = []
    let current: string[] = []
    let fence: string | null = null
    for (const line of markdown.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
            const marker = trimmed.slice(0, 3)
            if (fence === null) fence = marker
            else if (fence === marker) fence = null
            current.push(line)
            continue
        }
        if (fence === null && /^---\s*$/.test(trimmed)) {
            slides.push(current.join('\n'))
            current = []
            continue
        }
        current.push(line)
    }
    slides.push(current.join('\n'))
    return slides
}

interface ExportConfig {
    name: string // 格式名称
    extensions: string[] // 文件扩展名
    defaultName: string // 默认文件名
    exporter: (content: string, filePath: string, options?: HtmlExportOptions) => Promise<void> // 导出函数（HTML/PDF 打印类导出可读取图片上下文）
}
const exportConfigs: Record<string, ExportConfig> = {
    word: {
        get name() {
            return tMain('mainMsg.filters.word')
        },
        extensions: ['docx'],
        defaultName: 'untitled.docx',
        exporter: ToWord
    },
    json: {
        get name() {
            return tMain('mainMsg.filters.json')
        },
        extensions: ['json'],
        defaultName: 'untitled.json',
        exporter: ToJson
    },
    xml: {
        get name() {
            return tMain('mainMsg.filters.xml')
        },
        extensions: ['xml'],
        defaultName: 'untitled.xml',
        exporter: ToXml
    },
    yaml: {
        get name() {
            return tMain('mainMsg.filters.yaml')
        },
        extensions: ['yaml', 'yml'],
        defaultName: 'untitled.yaml',
        exporter: ToYaml
    },
    html: {
        get name() {
            return tMain('mainMsg.filters.html')
        },
        extensions: ['html', 'htm'],
        defaultName: 'untitled.html',
        exporter: ToHtml
    },
    pdf: {
        get name() {
            return tMain('mainMsg.filters.pdf')
        },
        extensions: ['pdf'],
        defaultName: 'untitled.pdf',
        exporter: ToPdf
    },
    epub: {
        get name() {
            return tMain('mainMsg.filters.epub')
        },
        extensions: ['epub'],
        defaultName: 'untitled.epub',
        exporter: ToEpub
    },
    slides: {
        get name() {
            return tMain('mainMsg.filters.slides')
        },
        extensions: ['html', 'htm'],
        defaultName: 'untitled-slides.html',
        exporter: ToSlidesHtml
    }
}

/**
 * 通用导出函数
 * @param mainWindow 主窗口
 * @param fileType 文件类型（word, json, xml, yaml, html, pdf）
 */
export async function ExportToFile(mainWindow: BrowserWindow, fileType: string): Promise<void> {
    const currentContent = appState.currentActiveFile?.content || ''

    if (!currentContent) {
        // FUN-27：用户可见提示统一中文
        showErrorMessageBox(tMain('mainMsg.file.noExportContent'))
        return
    }

    const config = exportConfigs[fileType]

    if (!config) {
        showErrorMessageBox(tMain('mainMsg.file.unsupportedExportFormat', { format: fileType }))
        return
    }

    const result = await dialog.showSaveDialog(mainWindow, {
        title: tMain('mainMsg.dialog.exportTitle', { name: config.name }),
        defaultPath: config.defaultName,
        filters: [{ name: config.name, extensions: config.extensions }]
    })

    if (result.canceled || !result.filePath) return

    // P1-AS-1：登记用户选择的导出目标为受信路径（放行「导出到用户选择的位置」）
    registerTrustedPath(result.filePath)

    try {
        await config.exporter(currentContent, result.filePath, {
            sourceFilePath: appState.currentActiveFile?.path ?? null,
            workspaceRoot: appState.rootPath || null
        })
        showInfoMessageBox(tMain('mainMsg.dialog.exportSuccess', { path: result.filePath }))
    } catch (error) {
        showErrorMessageBox(tMain('mainMsg.dialog.exportFailed', { error: String(error) }))
    }
}

/**
 * 应用版本号缓存（FUN-15：导出元数据版本与 package.json 保持一致）
 */
let cachedAppVersion: string | null = null

/**
 * FUN-15：从 package.json 读取应用版本，作为导出元数据版本号。
 * 开发模式 app.getAppPath() 指向项目根目录；打包后指向 asar，package.json 随包发布。
 * 读取失败时依次回退 electron 的 app.getVersion()（打包后即 package.json 版本）与 'unknown'。
 */
export async function getAppVersionForExport(): Promise<string> {
    if (cachedAppVersion) {
        return cachedAppVersion
    }
    try {
        const pkgPath = path.join(app.getAppPath(), 'package.json')
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8')) as { version?: string }
        cachedAppVersion = pkg.version || ''
        return cachedAppVersion
    } catch {
        // 读取 package.json 失败（如测试环境无 app 对象）时回退
        try {
            cachedAppVersion = app.getVersion()
        } catch {
            cachedAppVersion = 'unknown'
        }
        return cachedAppVersion
    }
}

/**
 * 获取支持的导出格式列表
 */
export function getSupportedExportFormats(): string[] {
    return Object.keys(exportConfigs)
}

/**
 * 添加新的导出格式
 * @param formatKey 格式键名
 * @param config 导出配置
 */
export function registerExportFormat(formatKey: string, config: ExportConfig): void {
    exportConfigs[formatKey] = config
}

// ========== 具体的导出实现函数 ==========

/**
 * 导出为 Word 文档
 *
 * P2-2：officegen 的文档组装与 zip 流式生成在 Node worker 线程执行（实测 1MB 文本
 * 76ms 的主进程同步阻塞被移出主线程）；成功/失败返回契约不变（Promise 完成/抛错，
 * 由 ExportToFile 统一提示）。worker 基础设施不可用时降级为主进程内导出并记录 WARN。
 */
export async function ToWord(content: string, filePath: string): Promise<void> {
    try {
        await exportMarkdownToWordWithWorker(content, filePath)
        logger.info('[word-worker] Word 导出由 worker 线程完成')
    } catch (error) {
        if (!isWordWorkerInfrastructureError(error)) {
            throw error
        }
        logger.warn('[export] Word worker 不可用，降级为主进程内导出（本次会阻塞主线程）:', error)
        await exportMarkdownToWordInProcess(content, filePath)
    }
}

/**
 * 导出为 JSON 文件
 */
export async function ToJson(content: string, filePath: string): Promise<void> {
    // FUN-15：元数据版本号从 package.json 读取，与应用实际版本保持一致
    const version = await getAppVersionForExport()
    const jsonContent = {
        content: content,
        metadata: {
            exportedAt: new Date().toISOString(),
            version: version,
            type: 'markdown',
            app: 'BaiZeNotes'
        }
    }
    await fs.writeFile(filePath, JSON.stringify(jsonContent, null, 2), 'utf-8')
}

/**
 * 导出为 XML 文件
 */
export async function ToXml(content: string, filePath: string): Promise<void> {
    // FUN-15：正文中的 ]]> 会提前终结 CDATA 段，必须先拆开（标准写法：
    // 替换为 ]]]]><![CDATA[>），否则生成非法 XML
    const safeContent = content.replace(/]]>/g, ']]]]><![CDATA[>')
    // FUN-15：元数据版本号从 package.json 读取
    const version = await getAppVersionForExport()
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <exportedAt>${new Date().toISOString()}</exportedAt>
    <version>${version}</version>
    <type>markdown</type>
    <app>BaiZeNotes</app>
  </metadata>
  <content><![CDATA[${safeContent}]]></content>
</document>`
    await fs.writeFile(filePath, xmlContent, 'utf-8')
}

/**
 * 导出为 YAML 文件
 */
export async function ToYaml(content: string, filePath: string): Promise<void> {
    // FUN-15：元数据版本号从 package.json 读取
    const version = await getAppVersionForExport()
    const yamlContent = `content: |
${content
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')}
metadata:
  exportedAt: ${new Date().toISOString()}
  version: ${version}
  type: markdown
  app: BaiZeNotes`
    await fs.writeFile(filePath, yamlContent, 'utf-8')
}

/**
 * 导出为 HTML 文件（C4：主题化 / 自包含）
 *
 * 输出单个可离线打开的 HTML：内联主题 CSS、标题目录、本地图片 data URI；
 * 图片读取遵守工作区边界与单张/总量上限，远程图片不做网络读取。
 */
export async function ToHtml(
    content: string,
    filePath: string,
    options: HtmlExportOptions = {}
): Promise<void> {
    const htmlContent = await BuildStandaloneHtml(content, options)
    await fs.writeFile(filePath, htmlContent, 'utf-8')
}

/**
 * 导出为 PDF 文件
 */
export async function ToPdf(content: string, filePath: string): Promise<void> {
    // P1-7：首次 PDF 导出时才加载 markdown-it
    const MarkdownIt = loadMarkdownItConstructor()
    const md = new MarkdownIt()

    // P3-1（安全剩余项）：PDF 导出隐藏窗口与主窗口安全基线对齐。
    // 该窗口只渲染应用生成的静态 HTML（markdown-it 默认 html:false），不注入 preload、
    // 不参与任何应用交互；sandbox/webSecurity 为纵深防御，防止未来内容注入后接触 Node/网络面。
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true
        }
    })

    // P3-1：隐藏窗口不允许任何导航/重定向/新窗口（纵深防御；正常流程只 loadURL 一次
    // 应用拼装的 data:text/html）。data: 页面中的链接/表单若被注入也不会在导出窗内继续加载。
    win.webContents.on('will-navigate', (event) => {
        event.preventDefault()
    })
    win.webContents.on('will-redirect', (event) => {
        event.preventDefault()
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    try {
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            line-height: 1.6;
        }
    </style>
</head>
<body>
${md.render(content)}
</body>
</html>`

        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

        const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: {
                top: 1,
                bottom: 1,
                left: 1,
                right: 1
            }
        })

        await fs.writeFile(filePath, pdfData)
    } finally {
        // FUN-15/MEM-07：加载、打印或写盘任一步失败都必须关闭隐藏窗口，
        // 避免导出失败时窗口泄漏累积
        if (!win.isDestroyed()) {
            win.close()
        }
    }
}

/**
 * C3：打印当前 Markdown 文件。
 *
 * - print：经 Electron print API 打开系统打印对话框（用户可预览/选打印机）；
 * - preview：先用 printToPDF 生成临时 PDF，再交给系统默认 PDF 阅读器预览分页。
 *
 * 渲染使用与 C4 相同的主题化 HTML；隐藏窗口沿用 ToPdf 的安全基线（sandbox /
 * contextIsolation / 禁止 preload / 禁止导航与新窗口）。
 */
export async function PrintActiveFile(mode: 'print' | 'preview' = 'print'): Promise<void> {
    const currentContent = appState.currentActiveFile?.content || ''
    if (!currentContent) {
        showErrorMessageBox(tMain('mainMsg.file.noExportContent'))
        return
    }

    const html = await BuildStandaloneHtml(currentContent, {
        sourceFilePath: appState.currentActiveFile?.path ?? null,
        workspaceRoot: appState.rootPath || null
    })
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true
        }
    })
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.webContents.on('will-redirect', (event) => event.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        if (mode === 'preview') {
            const pdfData = await win.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4'
            })
            // 每次预览使用唯一临时文件：系统 PDF 阅读器可能锁定上次文件，
            // 复用固定文件名会导致第二次预览 EBUSY。
            const previewPath = path.join(
                app.getPath('temp'),
                `BaiZeNotes-print-preview-${Date.now()}.pdf`
            )
            await fs.writeFile(previewPath, pdfData)
            const openError = await shell.openPath(previewPath)
            if (openError) {
                throw new Error(openError)
            }
            return
        }

        await new Promise<void>((resolve, reject) => {
            win.webContents.print(
                {
                    silent: false,
                    printBackground: true
                },
                (success, failureReason) => {
                    // 用户取消打印不是失败，不弹错误框
                    if (success || failureReason === 'cancelled') {
                        resolve()
                        return
                    }
                    reject(new Error(failureReason || 'print failed'))
                }
            )
        })
    } catch (error) {
        logger.error('[Export] 打印失败：', error)
        showErrorMessageBox(tMain('mainMsg.file.printFailed', { error: String(error) }))
    } finally {
        if (!win.isDestroyed()) {
            win.close()
        }
    }
}
