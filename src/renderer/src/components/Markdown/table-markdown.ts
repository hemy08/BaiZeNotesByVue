/**
 * P0：GFM 表格的解析、序列化与基础编辑（纯函数，不依赖 Monaco）。
 *
 * 只处理标准 GFM 管道表格：
 *   | a | b |
 *   | --- | :---: |
 *   | c | d |
 * 支持单元格内转义 `\|`；不支持合并单元格（GFM 无此语义）。
 */

export type TableAlignment = 'default' | 'left' | 'center' | 'right'

export interface MarkdownTable {
    headers: string[]
    rows: string[][]
    alignments: TableAlignment[]
    /** 表格首行/末行的 0 基行号（含分隔行） */
    startLine: number
    endLine: number
}

/** 判断一行是否像表格行（至少一个未转义管道） */
export function isTableRowLine(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed.includes('|')) {
        return false
    }
    return trimmed.startsWith('|') || trimmed.endsWith('|') || /\|.+\|/.test(trimmed)
}

function splitTableRow(line: string): string[] {
    const trimmed = line.trim()
    const content = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
    const withoutTrailing = content.endsWith('|') ? content.slice(0, -1) : content
    const cells: string[] = []
    let current = ''
    for (let i = 0; i < withoutTrailing.length; i += 1) {
        const char = withoutTrailing[i]
        if (char === '\\' && withoutTrailing[i + 1] === '|') {
            current += '|'
            i += 1
            continue
        }
        if (char === '|') {
            cells.push(current.trim())
            current = ''
            continue
        }
        current += char
    }
    cells.push(current.trim())
    return cells
}

function parseAlignmentCell(cell: string): TableAlignment {
    const trimmed = cell.trim()
    const left = trimmed.startsWith(':')
    const right = trimmed.endsWith(':')
    if (left && right) return 'center'
    if (left) return 'left'
    if (right) return 'right'
    return 'default'
}

function isDelimiterRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()))
}

function escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/** 从全文行数组中解析以 startLine 开始的表格；失败返回 null */
export function parseMarkdownTableAtLine(
    lines: readonly string[],
    startLine: number
): MarkdownTable | null {
    if (startLine < 0 || startLine + 1 >= lines.length) {
        return null
    }
    const header = splitTableRow(lines[startLine])
    const delimiter = splitTableRow(lines[startLine + 1])
    if (header.length === 0 || !isDelimiterRow(delimiter)) {
        return null
    }
    if (header.length !== delimiter.length) {
        return null
    }
    let endLine = startLine + 1
    const rows: string[][] = []
    while (endLine + 1 < lines.length && isTableRowLine(lines[endLine + 1])) {
        const next = splitTableRow(lines[endLine + 1])
        // 只接受列数一致的行；否则视为表格结束（避免吞掉后续正文）
        if (next.length !== header.length) {
            break
        }
        rows.push(next)
        endLine += 1
    }
    return {
        headers: header,
        rows,
        alignments: delimiter.map(parseAlignmentCell),
        startLine,
        endLine
    }
}

/** 根据全文与光标字符偏移解析光标所在表格 */
export function parseMarkdownTableAtOffset(text: string, offset: number): MarkdownTable | null {
    const lines = text.split(/\r?\n/)
    let lineIndex = 0
    let consumed = 0
    const safeOffset = Math.max(0, Math.min(offset, text.length))
    for (; lineIndex < lines.length; lineIndex += 1) {
        const lineLength = lines[lineIndex].length
        const lineEnd = consumed + lineLength + (lineIndex < lines.length - 1 ? 1 : 0)
        if (safeOffset <= lineEnd) {
            break
        }
        consumed = lineEnd
    }
    if (lineIndex >= lines.length) {
        return null
    }
    // 光标可能落在表格中间行：向上找最近的表头（前一行是分隔行）
    for (let start = lineIndex; start >= 0 && start >= lineIndex - 100; start -= 1) {
        const table = parseMarkdownTableAtLine(lines, start)
        if (table && lineIndex >= table.startLine && lineIndex <= table.endLine) {
            return table
        }
    }
    return null
}

/** 序列化为标准 GFM 表格（对齐行按列输出） */
export function serializeMarkdownTable(table: MarkdownTable): string {
    const columns = table.headers.length
    const alignments = Array.from(
        { length: columns },
        (_, index) => table.alignments[index] ?? 'default'
    )
    const renderRow = (cells: readonly string[]): string =>
        `| ${Array.from({ length: columns }, (_, index) => escapeCell(cells[index] ?? '')).join(
            ' | '
        )} |`
    const alignCell = (alignment: TableAlignment): string => {
        if (alignment === 'left') return ':---'
        if (alignment === 'center') return ':---:'
        if (alignment === 'right') return '---:'
        return '---'
    }
    const lines = [
        renderRow(table.headers),
        `| ${alignments.map(alignCell).join(' | ')} |`,
        ...table.rows.map(renderRow)
    ]
    return lines.join('\n')
}

/** 创建空表格 */
export function createEmptyTable(rows = 3, columns = 3): MarkdownTable {
    const columnCount = Math.max(1, Math.min(20, Math.round(columns)))
    const rowCount = Math.max(0, Math.min(100, Math.round(rows)))
    return {
        headers: Array.from({ length: columnCount }, (_, index) => `列 ${index + 1}`),
        rows: Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => '')),
        alignments: Array.from({ length: columnCount }, () => 'default'),
        startLine: 0,
        endLine: 0
    }
}
