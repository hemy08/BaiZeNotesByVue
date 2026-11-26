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
    const safeOffset = Math.max(0, Math.min(offset, text.length))
    // 关键：Monaco 模型可能保留 CRLF；不能按「行长 + 1」累加偏移（CRLF 是 2 个字符），
    // 否则表格位于多个 CRLF 行之后时光标行号会前移，导致误判“不在表格内”。
    // 直接统计光标前已出现的 LF 数量即可兼容 LF/CRLF。
    let lineIndex = 0
    for (let i = 0; i < safeOffset; i += 1) {
        if (text.charCodeAt(i) === 10) {
            lineIndex += 1
        }
    }
    if (lineIndex >= lines.length) {
        return null
    }
    // 光标可能落在表格中间行：向上找「下一行是分隔行」的表头候选，再校验光标落在表体内。
    // 不设固定行数上限，避免长表格（>100 行）光标在后半段时误判为“不在表格内”。
    for (let start = lineIndex; start >= 0; start -= 1) {
        if (start + 1 >= lines.length || !isDelimiterRow(splitTableRow(lines[start + 1]))) {
            continue
        }
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
