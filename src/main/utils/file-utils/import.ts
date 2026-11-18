/**
 * 导入模块
 * 提供从外部格式导入内容到Markdown的功能
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import csv from 'csv-parser'
import { dialog, BrowserWindow } from 'electron'
import * as mammoth from 'mammoth'
import { showErrorMessageBox } from './dialog-helpers'
import {
    decodeFileContent,
    notifyPathAccessDenied,
    OpenSelectFile,
    ReloadDirFromDisk
} from './file-operations'
import { appState } from '../app-state'
import { logger } from '../logger'
import { IPC } from '../../../shared/ipc-channels'
import { tMain } from '../i18n'
// P1-AS-1：导入/另存导入文件均涉及文件读写，路径必须位于受信范围；
// 系统对话框返回的路径在返回后登记为受信来源
import { isPathAllowed, registerTrustedPath } from '../security'

// eslint-disable-next-line @typescript-eslint/no-require-imports -- turndown 无 TypeScript 类型声明，require 返回 any 是当前唯一无类型错误的加载方式
const TurndownService = require('turndown')

/**
 * 导入格式模型（CQ-1/TS7053：原对象字面量用 string 索引会隐式 any，
 * 这里显式声明统一结构并以 Record 暴露，索引键收敛为 string 后按值判空）
 */
export interface ImportFormatModel {
    /** 对话框过滤器名称 */
    name: string
    /** 支持的扩展名（不含点） */
    extensions: string[]
    /** 导入（生成新文件）时的内容转换器 */
    importReader: (file: string) => Promise<string>
    /** 插入到当前光标处时的内容转换器 */
    insertReader: (file: string) => Promise<string>
    /** 插入内容前缀 */
    argStart: string
    /** 插入内容后缀 */
    argEnd: string
}

export const InsertImportFrom: Record<string, ImportFormatModel> = {
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
        // FUN-14：xls/xlsx 为二进制格式（OLE/zip），无解析库时按文本读取只会产生乱码。
        // 改为抛出清晰的引导提示，由外层统一弹出，不再把乱码内容插入文档。
        name: 'Sheet Files',
        extensions: ['xls', 'xlsx'],
        importReader: rejectExcelImport,
        insertReader: rejectExcelImport,
        argStart: '',
        argEnd: ''
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
    ini: {
        // FUN-14：菜单"插入 → 来自文件 → *.ini"（templates.ts）走独立 ini 键，
        // 此前注册表无此键导致恒弹"暂不支持"。归入文本类导入，走编码探测。
        name: 'INI Files',
        extensions: ['ini'],
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

/**
 * FUN-14：文本类文件统一读取入口。
 * 复用第一轮 file-operations 的编码探测（BOM 优先 + jschardet + iconv 转码），
 * GBK 等中文存量文本文件导入不再乱码。
 */
async function ReadFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath)
    return decodeFileContent(buffer).content
}

/**
 * FUN-14：xls/xlsx 无法可靠解析时给出清晰提示，
 * 引导用户先导出为 CSV 再导入（不再读二进制出乱码）。
 */
async function rejectExcelImport(): Promise<string> {
    throw new Error(tMain('mainMsg.file.excelImportUnsupported'))
}

async function convertDocxToMarkdown(file: string): Promise<string> {
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
    // FUN-13：转换失败时抛出错误，由外层 InsertImportFormFile 的 catch
    // 统一提示并中止插入，不再返回 'convert failed' 伪内容混入用户文档。
    // FE-19：内层不再 showErrorMessageBox——原实现内层提示 + 外层 catch 再提示
    // 导致一次失败弹两个错误框；错误统一上抛，仅由外层提示一处。
    const htmlContent = await ReadFile(file)
    const turndownService = new TurndownService()
    return turndownService.turndown(htmlContent)
}

/**
 * CSV 单元格 → Markdown 表格单元格：
 * - 空值 / 短行缺列统一按空字符串处理，保证每行列数恒等于表头列数；
 * - 单元格内的换行折叠为 <br>、竖线转义为 \|，否则会破坏 Markdown 表格的行/列结构。
 */
function toMarkdownCell(value: string | null | undefined): string {
    return String(value ?? '')
        .replace(/\r\n|\r|\n/g, '<br>')
        .replace(/\|/g, '\\|')
}

/**
 * 按表头顺序拼出 Markdown 表格文本；表头为空（空白文件）时返回空字符串。
 * 行格式统一为 `| a | b |`，分隔行为 `| --- | --- |`，不再出现无空格/双竖线的畸形行。
 */
function buildMarkdownTable(headers: string[], rows: string[][]): string {
    if (headers.length === 0) return ''
    const formatRow = (cells: string[]): string => `| ${cells.join(' | ')} |\n`
    let markdownTable = formatRow(headers.map((header) => toMarkdownCell(header)))
    markdownTable += formatRow(headers.map(() => '---'))
    rows.forEach((cells) => {
        markdownTable += formatRow(cells)
    })
    return markdownTable
}

/**
 * CSV 文本 → Markdown 表格。
 *
 * task-47 修复两个真实缺陷（根因经 out/check-csv-parser.js 用真实 csv-parser 3.2.1 核验）：
 * 1) 表头输出列索引 `0|1|2` 而非真实列名：csv-parser 的 'headers' 事件参数是
 *    `string[]`（如 `["a","b","c"]`），旧实现按对象处理并 `Object.keys()` 取键，
 *    而数组的键恰是下标 "0"/"1"/"2"；
 * 2) 数据行多一个前导空单元格：旧实现的行模板为 `` `| ${rowString} |` ``，而
 *    rowString 自身已由 `| ${value} ` 拼出前导 `| `，双重竖线制造了一个空列；
 *    另外旧实现用 `Object.values(row)` 取值，短行会少列、无法与表头对齐。
 *
 * 修复后：表头取事件参数原数组并保序；数据行按表头名依次取值（`row` 的键即表头名），
 * 缺列补空、多余列按表头列数截断；空行（csv-parser 会推入 `{}`）与空文件不产生表格。
 */
function csvStringParser(csvData: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // BOM 兜底：convertCsvToMarkdown 已由 decodeFileContent 剥离 BOM，
        // 这里再防一次直接传入带 BOM 文本的调用（csv-parser 自身不处理 BOM）
        const content = csvData.charCodeAt(0) === 0xfeff ? csvData.slice(1) : csvData
        const headers: string[] = []
        const rows: string[][] = []
        const csvParser = csv()
        csvParser.on('headers', (headerRow: Array<string | null>) => {
            headers.push(...headerRow.map((header) => toMarkdownCell(header)))
        })
        csvParser.on('data', (row: { [key: string]: string }) => {
            // 空行会被 csv-parser 解析为 {}，不产生数据行
            if (Object.keys(row).length === 0) return
            rows.push(headers.map((header) => toMarkdownCell(row[header])))
        })
        csvParser.on('end', () => {
            resolve(buildMarkdownTable(headers, rows))
        })
        csvParser.on('error', reject)
        csvParser.write(content)
        csvParser.end()
    })
}

async function convertCsvToMarkdown(csvFile: string): Promise<string> {
    // FUN-14：与其它文本导入统一，复用 file-operations 的编码探测（BOM + jschardet + iconv）
    const buffer = await fs.readFile(csvFile)
    const utf8String = decodeFileContent(buffer).content
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
            result +=
                indentStr +
                '"' +
                key +
                '": ' +
                formatterJson((obj as { [key: string]: unknown })[key], indentLevel + 1)
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
        // FUN-27：文案补全 mhtml/xml/log（此前遗漏），并注明 xls/xlsx 的处理方式
        showErrorMessageBox(tMain('mainMsg.file.importUnsupportedFormat'))
        return
    }

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: model.name, extensions: model.extensions }]
    })

    if (result.canceled) return

    const file = result.filePaths[0]
    // P1-AS-1：文件来自系统打开对话框（用户显式选择），登记为受信精确文件后再读取
    registerTrustedPath(file)
    if (!isPathAllowed(file)) {
        notifyPathAccessDenied(file, 'mainMsg.status.operationFailed')
        return
    }
    const readerFn = model.importReader

    try {
        const context = await readerFn(file)
        const content = model.argStart + context + model.argEnd

        if (isImport) {
            mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'importOption', { content })
        } else {
            mainWindow.webContents.send(IPC.MONACO.AFTER_CURSOR, content)
        }
    } catch (err) {
        showErrorMessageBox(tMain('mainMsg.file.importFailed', { error: String(err) }))
    }
}

export async function ImportCreateNewFile(
    mainWindow: BrowserWindow,
    content: string
): Promise<{ success: boolean; filePath?: string }> {
    const currentFilePath = appState.currentActiveFile?.path
    const importedFileName = tMain('mainMsg.file.importDefaultFileName')
    const defaultPath = currentFilePath
        ? path.dirname(currentFilePath) + '/' + importedFileName
        : importedFileName

    const result = await dialog.showSaveDialog(mainWindow, {
        title: tMain('mainMsg.dialog.saveImportFileTitle'),
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
    // P1-AS-1：保存目标是用户在系统保存对话框中显式选择的路径 → 登记为受信精确文件；
    // 异常形态（设备路径等）仍会被守卫拒绝并给出提示
    registerTrustedPath(filePath)
    if (!isPathAllowed(filePath)) {
        notifyPathAccessDenied(filePath, 'mainMsg.status.saveFailed')
        return { success: false }
    }

    await fs.writeFile(filePath, content, 'utf-8')

    await OpenSelectFile({
        name: path.basename(filePath),
        path: filePath,
        type: 'file',
        content: content
    })

    setTimeout(async () => {
        try {
            await ReloadDirFromDisk()
        } catch (err) {
            logger.error('Failed to reload from disk:', err)
        }
    }, 100)

    return { success: true, filePath }
}
