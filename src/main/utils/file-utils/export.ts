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

/**
 * 导出配置接口
 */
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
