/**
 * 导出模块 - 优化版
 * 使用配置驱动的方式统一处理各种格式的导出
 */

import * as fs from 'fs'
import { dialog, BrowserWindow } from 'electron'
import { showErrorMessageBox, showInfoMessageBox } from './dialog-helpers'

/**
 * 导出配置接口
 */
interface ExportConfig {
    name: string           // 格式名称
    extensions: string[]   // 文件扩展名
    defaultName: string    // 默认文件名
    exporter: (content: string, filePath: string) => Promise<void>  // 导出函数
}

/**
 * 导出配置表
 */
const exportConfigs: Record<string, ExportConfig> = {
    word: {
        name: 'Word 文档',
        extensions: ['docx'],
        defaultName: 'untitled.docx',
        exporter: ToWord
    },
    json: {
        name: 'JSON 文件',
        extensions: ['json'],
        defaultName: 'untitled.json',
        exporter: ToJson
    },
    xml: {
        name: 'XML 文件',
        extensions: ['xml'],
        defaultName: 'untitled.xml',
        exporter: ToXml
    },
    yaml: {
        name: 'YAML 文件',
        extensions: ['yaml', 'yml'],
        defaultName: 'untitled.yaml',
        exporter: ToYaml
    },
    html: {
        name: 'HTML 文件',
        extensions: ['html', 'htm'],
        defaultName: 'untitled.html',
        exporter: ToHtml
    },
    pdf: {
        name: 'PDF 文件',
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
    const currentContent = global.current_active_file?.content || ''

    if (!currentContent) {
        showErrorMessageBox('Currently, there is no content to export')
        return
    }

    const config = exportConfigs[fileType]

    if (!config) {
        showErrorMessageBox(`Currently, exporting to ${fileType} format is not supported`)
        return
    }

    const result = await dialog.showSaveDialog(mainWindow, {
        title: `导出为 ${config.name}`,
        defaultPath: config.defaultName,
        filters: [{ name: config.name, extensions: config.extensions }]
    })

    if (result.canceled || !result.filePath) return

    try {
        await config.exporter(currentContent, result.filePath)
        showInfoMessageBox(`Export successful: ${result.filePath}`)
    } catch (error) {
        showErrorMessageBox(`Exporting file failed: ${error}`)
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
 */
export async function ToWord(content: string, filePath: string): Promise<void> {
    const officeGen = require('officegen')
    const docx = officeGen('docx')

    const lines = content.split('\n')
    lines.forEach((line) => {
        if (line.startsWith('# ')) {
            docx.createP().addText(line.substring(2), { bold: true, fontSize: 20 })
        } else if (line.startsWith('## ')) {
            docx.createP().addText(line.substring(3), { bold: true, fontSize: 18 })
        } else if (line.startsWith('### ')) {
            docx.createP().addText(line.substring(4), { bold: true, fontSize: 16 })
        } else if (line.trim().length > 0) {
            docx.createP().addText(line)
        }
    })

    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath)
        docx.generate(stream)
        stream.on('close', resolve)
        stream.on('error', reject)
    })
}

/**
 * 导出为 JSON 文件
 */
export async function ToJson(content: string, filePath: string): Promise<void> {
    const jsonContent = {
        content: content,
        metadata: {
            exportedAt: new Date().toISOString(),
            version: '1.1.5-beta',
            type: 'markdown',
            app: 'BaiZeNotes'
        }
    }
    fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2), 'utf-8')
}

/**
 * 导出为 XML 文件
 */
export async function ToXml(content: string, filePath: string): Promise<void> {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <exportedAt>${new Date().toISOString()}</exportedAt>
    <version>1.1.5-beta</version>
    <type>markdown</type>
    <app>BaiZeNotes</app>
  </metadata>
  <content><![CDATA[${content}]]></content>
</document>`
    fs.writeFileSync(filePath, xmlContent, 'utf-8')
}

/**
 * 导出为 YAML 文件
 */
export async function ToYaml(content: string, filePath: string): Promise<void> {
    const yamlContent = `content: |
${content.split('\n').map(line => `  ${line}`).join('\n')}
metadata:
  exportedAt: ${new Date().toISOString()}
  version: 1.1.5-beta
  type: markdown
  app: BaiZeNotes`
    fs.writeFileSync(filePath, yamlContent, 'utf-8')
}

/**
 * 导出为 HTML 文件
 */
export async function ToHtml(content: string, filePath: string): Promise<void> {
    const markdownIt = require('markdown-it')
    const md = new markdownIt()

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

    fs.writeFileSync(filePath, htmlContent, 'utf-8')
}

/**
 * 导出为 PDF 文件
 */
export async function ToPdf(content: string, filePath: string): Promise<void> {
    const markdownIt = require('markdown-it')
    const md = new markdownIt()

    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    })

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

    fs.writeFileSync(filePath, pdfData)
    win.close()
}
