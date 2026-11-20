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
import { dialog, BrowserWindow, app } from 'electron'
// P1-7：markdown-it 改为首次 HTML/PDF 导出时惰性 require，这里只保留类型导入（编译期擦除）
import type MarkdownItType from 'markdown-it'
import { showErrorMessageBox, showInfoMessageBox } from './dialog-helpers'
import { appState } from '../app-state'
import { tMain } from '../i18n'
import { logger } from '../logger'
// P1-AS-1：导出目标来自系统保存对话框（用户显式选择），返回后登记为受信精确文件；
// 导出器只写该路径，避免渲染层通过其它入口驱动任意写
import { registerTrustedPath } from '../security'
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
 * 导出配置接口
 */
interface ExportConfig {
    name: string // 格式名称
    extensions: string[] // 文件扩展名
    defaultName: string // 默认文件名
    exporter: (content: string, filePath: string) => Promise<void> // 导出函数
}

/**
 * 导出配置表
 * CMP-30：内置格式名称经 getter 按当前语言实时翻译（自定义注册格式仍直接使用 name 字面量）
 */
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
        await config.exporter(currentContent, result.filePath)
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
 * 导出为 HTML 文件
 */
export async function ToHtml(content: string, filePath: string): Promise<void> {
    // P1-7：首次 HTML 导出时才加载 markdown-it
    const MarkdownIt = loadMarkdownItConstructor()
    const md = new MarkdownIt()

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported from BaiZeNotes</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        pre {
            background-color: #f4f4f4;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        code {
            background-color: #f4f4f4;
            padding: 2px 4px;
            border-radius: 2px;
        }
        blockquote {
            border-left: 4px solid #ddd;
            margin: 0;
            padding-left: 16px;
            color: #666;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f4f4f4;
        }
    </style>
</head>
<body>
${md.render(content)}
<footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
    Exported from BaiZeNotes at ${new Date().toLocaleString('zh-CN')}
</footer>
</body>
</html>`

    await fs.writeFile(filePath, htmlContent, 'utf-8')
}

/**
 * 导出为 PDF 文件
 */
export async function ToPdf(content: string, filePath: string): Promise<void> {
    // P1-7：首次 PDF 导出时才加载 markdown-it
    const MarkdownIt = loadMarkdownItConstructor()
    const md = new MarkdownIt()

    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    })

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
