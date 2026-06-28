/**
 * 导入模块
 * 提供从外部格式导入内容到Markdown的功能
 */

import { promises as fs } from 'fs'
import csv from 'csv-parser'
import { detect } from 'jschardet'
import { dialog, BrowserWindow } from 'electron'
import { showErrorMessageBox } from './dialog-helpers'
import { OpenSelectFile } from './file-operations'
import { appState } from '../app-state'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')
const TurndownService = require('turndown')
const iconv = require('iconv-lite')

export const InsertImportFrom = {
    word: {
        name: 'Word Files',
        extensions: ['doc', 'docx'],
        importReader: convertDocxToMarkdown,
        insertReader: convertDocxToMarkdown,
        argStart: '',
        argEnd: ''
    },
    html: {
        name: 'HTML Files',
        extensions: ['html', 'htm', 'mhtml'],
        importReader: convertHtmlToMarkdown,
        insertReader: convertHtmlToMarkdown,
        argStart: '',
        argEnd: ''
    },
    excel: {
        name: 'Sheet Files',
        extensions: ['xls', 'xlsx'],
        importReader: ReadFile,
        insertReader: ReadFile,
        argStart: '```text\r\n',
        argEnd: '\r\n```\r\n'
    },
    csv: {
        name: 'Sheet Files',
        extensions: ['csv'],
        importReader: convertCsvToMarkdown,
        insertReader: convertCsvToMarkdown,
        argStart: '\r\n',
        argEnd: '\r\n'
    },
    json: {
        name: 'Json Files',
        extensions: ['json'],
        importReader: formatJsonString,
        insertReader: formatJsonString,
        argStart: '```json\r\n',
        argEnd: '\r\n```\r\n'
    },
    text: {
        name: 'Text Files',
        extensions: ['txt', 'log', 'ini'],
        importReader: ReadFile,
        insertReader: ReadFile,
        argStart: '```text\r\n',
        argEnd: '\r\n```\r\n'
    },
    yaml: {
        name: 'YAML Files',
        extensions: ['yaml', 'yml'],
        importReader: ReadFile,
        insertReader: ReadFile,
        argStart: '```yaml\r\n',
        argEnd: '\r\n```\r\n'
    },
    xml: {
        name: 'XML Files',
        extensions: ['xml'],
        importReader: ReadFile,
        insertReader: ReadFile,
        argStart: '```xml\r\n',
        argEnd: '\r\n```\r\n'
    }
}

async function ReadFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf8')
}

async function convertDocxToMarkdown(file: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth')
    return mammoth
        .convertToHtml({ path: file })
        .then((result: { value: string }) => {
            const turndownService = new TurndownService()
            return turndownService.turndown(result.value)
        })
        .catch((error: unknown) => {
            throw error
        })
}

async function convertHtmlToMarkdown(file: string): Promise<string> {
    try {
        const htmlContent = await ReadFile(file)
        const turndownService = new TurndownService()
        return turndownService.turndown(htmlContent)
    } catch (error) {
        showErrorMessageBox('Error converting HTML to Markdown:' + error)
        return 'convert failed'
    }
}

function csvStringParser(csvData: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const headers: string[] = []
        const rows: { [key: string]: string }[] = []
        const csvParser = csv()
        csvParser.on('headers', (headerRow: { [key: string]: string }) => {
            headers.push(...Object.keys(headerRow))
        })
        csvParser.on('data', (row: { [key: string]: string }) => {
            rows.push(row)
        })
        csvParser.on('end', () => {
            let markdownTable = `| ${headers.join('| ')} |\n| ${headers.map(() => '---').join('| ')} |\n`
            rows.forEach((row) => {
                const rowString = Object.values(row)
                    .map((value) => `| ${value} `)
                    .join('')
                markdownTable += `| ${rowString} |\n`
            })
            resolve(markdownTable)
        })
        csvParser.on('error', reject)
        csvParser.write(csvData)
        csvParser.end()
    })
}

async function convertCsvToMarkdown(csvFile: string): Promise<string> {
    const buffer = await fs.readFile(csvFile)
    const detectCode = detect(buffer)
    const utf8String = iconv.decode(buffer, detectCode.encoding)
    return await csvStringParser(utf8String)
}

function formatterJson(obj: unknown, indentLevel = 0, indent = 2): string {
    let result = ''
    const indentStr = ' '.repeat(indentLevel * indent)

    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            if (index > 0) {
                result += ',\n'
            }
            result += indentStr + '  ' + formatterJson(item, indentLevel + 1)
        })
        return '[' + (result ? '\n' + indentStr + result + '\n' + indentStr : result) + ']'
    } else if (typeof obj === 'object' && obj !== null) {
        const keys = Object.keys(obj)
        keys.forEach((key, index) => {
            if (index > 0) {
                result += ',\n'
            }
            result += indentStr + '"' + key + '": ' + formatterJson((obj as { [key: string]: unknown })[key], indentLevel + 1)
        })
        return '{' + (result ? '\n' + indentStr + result + '\n' + indentStr : result) + '}'
    } else {
        return JSON.stringify(obj)
    }
}

async function formatJsonString(filePath: string): Promise<string> {
    const jsonStr = await ReadFile(filePath)
    try {
        const parsed = JSON.parse(jsonStr) as unknown
        return formatterJson(parsed)
    } catch {
        return jsonStr
    }
}

export async function InsertImportFormFile(
    mainWindow: Electron.BrowserWindow,
    fileType: string,
    isImport: boolean
): Promise<void> {
    const model = InsertImportFrom[fileType]
    if (!model) {
        showErrorMessageBox(
            '暂不支持当前格式的文件。\r\n' +
            '当前支持*.txt、*.json、*.yaml、*.yml、*.csv、*.ini、*.doc、*.docx、*.html、*.htm、*.xls、*.xlsx'
        )
        return
    }

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: model.name, extensions: model.extensions }]
    })

    if (result.canceled) return

    const file = result.filePaths[0]
    const readerFn = model.importReader

    try {
        const context = await readerFn(file)
        const content = model.argStart + context + model.argEnd

        if (isImport) {
            mainWindow.webContents.send('open-vue-dialog', 'importOption', { content })
        } else {
            mainWindow.webContents.send('monaco-editor-insert-after-cursor', content)
        }
    } catch (err) {
        showErrorMessageBox('导入文件失败: ' + err)
    }
}

export async function ImportCreateNewFile(mainWindow: BrowserWindow, content: string): Promise<{ success: boolean; filePath?: string }> {
    const currentFilePath = appState.currentActiveFile?.path
    const defaultPath = currentFilePath
        ? path.dirname(currentFilePath) + '/导入文件.md'
        : '导入文件.md'

    const result = await dialog.showSaveDialog(mainWindow, {
        title: '保存导入文件',
        defaultPath: defaultPath,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
    })

    if (result.canceled || !result.filePath) {
        return { success: false }
    }

    let filePath = result.filePath
    if (!filePath.endsWith('.md')) {
        filePath += '.md'
    }

    await fs.writeFile(filePath, content, 'utf-8')

    await OpenSelectFile({
        name: path.basename(filePath),
        path: filePath,
        type: 'file',
        content: content
    })

    setTimeout(async () => {
        const { ReloadDirFromDisk } = require('./file-operations')
        try {
            await ReloadDirFromDisk()
        } catch (err) {
            console.error('Failed to reload from disk:', err)
        }
    }, 100)

    return { success: true, filePath }
}