/**
 * P0：表格编辑器的外部数据导入。
 *
 * 支持：
 * - CSV（含引号、逗号、CRLF、BOM）；
 * - XLSX（OOXML：内置 ZIP 解析 + DOMParser 读取首个 worksheet，支持共享字符串/内联字符串/数字）。
 *
 * `.xls`（旧二进制）不在此处解析，调用方应提示用户另存为 xlsx/csv。
 */

export interface ImportedTable {
    headers: string[]
    rows: string[][]
}

const MAX_COLUMNS = 100
const MAX_ROWS = 2000

/** CSV 文本 → 二维数组（RFC 4180 风格） */
export function parseCsvText(text: string): string[][] {
    const source = text.replace(/^\uFEFF/, '')
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]
        if (inQuotes) {
            if (char === '"') {
                if (source[index + 1] === '"') {
                    cell += '"'
                    index += 1
                } else {
                    inQuotes = false
                }
            } else {
                cell += char
            }
            continue
        }
        if (char === '"') {
            inQuotes = true
            continue
        }
        if (char === ',') {
            row.push(cell)
            cell = ''
            continue
        }
        if (char === '\n' || char === '\r') {
            if (char === '\r' && source[index + 1] === '\n') {
                index += 1
            }
            row.push(cell)
            rows.push(row)
            row = []
            cell = ''
            continue
        }
        cell += char
    }
    row.push(cell)
    if (row.some((value) => value.length > 0) || rows.length === 0) {
        rows.push(row)
    }
    return rows
}

/** 矩阵 → 表格（第一行表头；统一列数；去掉尾部全空行列） */
export function matrixToImportedTable(matrix: readonly (readonly string[])[]): ImportedTable {
    const cleanedRows = matrix.map((row) => row.map((value) => String(value ?? '').trim()))
    while (cleanedRows.length > 0 && cleanedRows[cleanedRows.length - 1].every((value) => !value)) {
        cleanedRows.pop()
    }
    const columnCount = Math.min(
        MAX_COLUMNS,
        cleanedRows.reduce((max, row) => Math.max(max, row.length), 0)
    )
    if (cleanedRows.length === 0 || columnCount === 0) {
        return { headers: [], rows: [] }
    }
    const limitRows = Math.min(MAX_ROWS, cleanedRows.length)
    const headers = Array.from({ length: columnCount }, (_, index) => cleanedRows[0][index] ?? '')
    const rows = cleanedRows
        .slice(1, limitRows)
        .map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''))
    return { headers, rows }
}

/** 从 XML 文本中提取所有 <t> 文本（用于共享字符串 / 内联字符串） */
function extractTexts(xml: string, wrapperTag: string): string[] {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const wrappers = Array.from(document.getElementsByTagName(wrapperTag))
    return wrappers.map((wrapper) =>
        Array.from(wrapper.getElementsByTagName('t'))
            .map((node) => node.textContent ?? '')
            .join('')
    )
}

function columnLettersToIndex(letters: string): number {
    let result = 0
    for (const letter of letters.toUpperCase()) {
        const code = letter.charCodeAt(0)
        if (code < 65 || code > 90) continue
        result = result * 26 + (code - 64)
    }
    return Math.max(0, result - 1)
}

/** 解析 xlsx（仅首个 worksheet）为二维字符串数组 */
interface ZipEntry {
    name: string
    method: number
    compressedSize: number
    dataOffset: number
}

/** 读取 ZIP 中央目录。仅实现 xlsx 所需的 store/deflate 两种压缩方式。 */
function readZipEntries(buffer: ArrayBuffer): ZipEntry[] {
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    const decoder = new TextDecoder('utf-8')
    let eocd = -1
    for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            eocd = offset
            break
        }
    }
    if (eocd < 0) throw new Error('XLSX 不是有效的 ZIP 文件')
    const entryCount = view.getUint16(eocd + 10, true)
    let cursor = view.getUint32(eocd + 16, true)
    const entries: ZipEntry[] = []
    for (let index = 0; index < entryCount; index += 1) {
        if (view.getUint32(cursor, true) !== 0x02014b50) break
        const method = view.getUint16(cursor + 10, true)
        const compressedSize = view.getUint32(cursor + 20, true)
        const nameLength = view.getUint16(cursor + 28, true)
        const extraLength = view.getUint16(cursor + 30, true)
        const commentLength = view.getUint16(cursor + 32, true)
        const localOffset = view.getUint32(cursor + 42, true)
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
        const localNameLength = view.getUint16(localOffset + 26, true)
        const localExtraLength = view.getUint16(localOffset + 28, true)
        entries.push({
            name,
            method,
            compressedSize,
            dataOffset: localOffset + 30 + localNameLength + localExtraLength
        })
        cursor += 46 + nameLength + extraLength + commentLength
    }
    return entries
}

async function readZipText(
    buffer: ArrayBuffer,
    entries: readonly ZipEntry[],
    name: string
): Promise<string | null> {
    const entry = entries.find((candidate) => candidate.name === name)
    if (!entry) return null
    const compressed = new Uint8Array(buffer, entry.dataOffset, entry.compressedSize)
    if (entry.method === 0) {
        return new TextDecoder('utf-8').decode(compressed)
    }
    if (entry.method !== 8) {
        throw new Error(`XLSX 使用了不支持的 ZIP 压缩方式（method=${entry.method}）`)
    }
    const stream = new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
    return await new Response(stream).text()
}

/** 解析 xlsx（仅首个 worksheet）为二维字符串数组 */
export async function parseXlsxFile(file: File): Promise<ImportedTable> {
    const buffer = await file.arrayBuffer()
    const entries = readZipEntries(buffer)
    const sharedStringsXml = await readZipText(buffer, entries, 'xl/sharedStrings.xml')
    const sharedStrings = sharedStringsXml ? extractTexts(sharedStringsXml, 'si') : []
    const worksheetNames = entries
        .map((entry) => entry.name)
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    if (worksheetNames.length === 0) {
        throw new Error('XLSX 文件中没有可读取的工作表')
    }
    const worksheetXml = await readZipText(buffer, entries, worksheetNames[0])
    if (!worksheetXml) {
        throw new Error('无法读取 XLSX 工作表数据')
    }
    const document = new DOMParser().parseFromString(worksheetXml, 'application/xml')
    const matrix: string[][] = []
    const cells = Array.from(document.getElementsByTagName('c'))
    for (const cell of cells) {
        const reference = cell.getAttribute('r') ?? ''
        const match = reference.match(/^([A-Z]+)(\d+)$/i)
        if (!match) continue
        const columnIndex = columnLettersToIndex(match[1])
        const rowIndex = Number(match[2]) - 1
        if (columnIndex >= MAX_COLUMNS || rowIndex >= MAX_ROWS) continue
        const type = cell.getAttribute('t')
        let value: string
        if (type === 'inlineStr') {
            value = Array.from(cell.getElementsByTagName('t'))
                .map((node) => node.textContent ?? '')
                .join('')
        } else {
            const raw = cell.getElementsByTagName('v')[0]?.textContent ?? ''
            value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw
        }
        while (matrix.length <= rowIndex) matrix.push([])
        while (matrix[rowIndex].length <= columnIndex) matrix[rowIndex].push('')
        matrix[rowIndex][columnIndex] = value
    }
    return matrixToImportedTable(matrix)
}

/** 解析 CSV/XLSX 文件；xls 抛出不支持提示 */
export async function parseTableFile(file: File): Promise<ImportedTable> {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')) {
        return matrixToImportedTable(parseCsvText(await file.text()))
    }
    if (name.endsWith('.xlsx')) {
        return parseXlsxFile(file)
    }
    throw new Error('仅支持 .xlsx 或 .csv；旧版 .xls 请另存为 .xlsx/.csv 后再导入')
}
