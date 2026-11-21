/**
 * Slash 命令触发判定纯函数（P0-6）
 *
 * 设计目标（与产品要求一一对应）：
 * 1. **只在行首或空白字符后**输入 `/` 才视为触发，避免误触 URL（`https://...`）、
 *    路径（`a/b`）、比较运算等；
 * 2. `/` 到光标之间只允许「命令查询字符」（字母/数字/下划线/连字符，含中文），
 *    出现空格或其他符号即视为普通正文，菜单关闭；
 * 3. 行内代码（奇数个未闭合反引号之前）不触发；围栏代码块（``` / ~~~）由
 *    `isInsideFencedCodeBlock` 结合模型全文判定，二者共同满足「不误触代码」。
 *
 * 本模块不依赖 Vue / Monaco / DOM，可完整单测。
 */

/** Slash 触发信息 */
export interface SlashTrigger {
    /** `/` 与光标之间的查询文本（可为空字符串） */
    query: string
    /** 光标所在行中 `/` 的列号（1 基，与 Monaco 列号口径一致） */
    startColumn: number
}

/** 查询文本允许的字符：字母（含中日韩）、数字、下划线、连字符 */
const SLASH_QUERY_PATTERN = /^[\p{L}\p{N}_-]*$/u

/** 围栏代码块标记：最多 3 个前导空格 + ≥3 个反引号或波浪线（可带信息串） */
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/

/** 统计文本中的反引号数量（用于判断行内代码） */
function countBacktick(text: string): number {
    let count = 0
    for (const char of text) {
        if (char === '`') count += 1
    }
    return count
}

/** 字符是否为空白（空格 / 制表符 / 全角空格等统一按 /\s/ 判定） */
function isWhitespace(char: string | undefined): boolean {
    return char !== undefined && /\s/u.test(char)
}

/**
 * 判定 lineText 中 [0, charIndex) 区间是否处于未闭合的行内代码内。
 * 行内代码不会跨行（CommonMark 允许跨行，但写作场景跨行极少且由围栏判定兜底），
 * 这里只按本行反引号奇偶判定，宁可少触发也不误触。
 */
function isInsideInlineCode(lineText: string, charIndex: number): boolean {
    return countBacktick(lineText.slice(0, charIndex)) % 2 === 1
}

/**
 * 匹配 Slash 触发。
 *
 * @param lineText 光标所在行的完整文本（不含换行符）
 * @param column 光标列号（1 基，允许等于行长度 + 1，即行尾）
 * @returns 命中返回 { query, startColumn }；未命中 / 参数非法返回 null
 *
 * 边界约定：
 * - 光标前最后一个 `/` 必须是行首字符或紧跟空白字符；
 * - `/` 到光标之间不能出现空白或特殊符号（否则视为普通正文）；
 * - `/` 若处于行内代码中则不触发；
 * - 列号越界（<1 或 > 行长度+1）返回 null。
 */
export function matchSlashTrigger(lineText: string, column: number): SlashTrigger | null {
    if (typeof lineText !== 'string') return null
    if (!Number.isInteger(column) || column < 1 || column > lineText.length + 1) return null
    const beforeCursor = lineText.slice(0, column - 1)
    const slashIndex = beforeCursor.lastIndexOf('/')
    if (slashIndex < 0) return null
    // 行首或空白后的 `/` 才是命令触发；URL 中的 `//`、路径中的 `/` 因前一个字符
    // 是 `:` / `/` / 字母等非空白字符而被排除。
    if (slashIndex > 0 && !isWhitespace(beforeCursor.charAt(slashIndex - 1))) return null
    const query = beforeCursor.slice(slashIndex + 1)
    if (!SLASH_QUERY_PATTERN.test(query)) return null
    if (isInsideInlineCode(lineText, slashIndex)) return null
    // startColumn 为 `/` 所在列（1 基）；例如行首 `/tab` 光标在第 5 列时 startColumn = 1。
    return { query, startColumn: slashIndex + 1 }
}

/**
 * 判定指定行（1 基行号）是否处于未闭合的围栏代码块内。
 *
 * 规则对齐 CommonMark 的常用子集：
 * - 围栏标记最多 3 个前导空格，≥3 个反引号或波浪线，可带信息串；
 * - 闭合标记必须与开启标记同字符、长度不短于开启标记、且闭后无其他非空白字符；
 * - 不同字符的围栏互不闭合（`~` 不会闭合 ```）。
 *
 * @param lines 文档全部行（ITextModel.getLinesContent()）
 * @param lineNumber 目标行号（1 基）
 * @returns 目标行位于未闭合围栏内返回 true；参数非法/行号越界返回 false
 */
export function isInsideFencedCodeBlock(lines: readonly string[], lineNumber: number): boolean {
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > lines.length + 1) {
        return false
    }
    let openChar = ''
    let openLength = 0
    for (let index = 0; index < lineNumber - 1; index += 1) {
        const line = lines[index]
        if (typeof line !== 'string') continue
        const match = FENCE_PATTERN.exec(line)
        if (!match) continue
        const marker = match[1]
        const char = marker.charAt(0)
        if (openChar.length === 0) {
            openChar = char
            openLength = marker.length
            continue
        }
        if (char !== openChar) continue
        const rest = (match[2] ?? '').trim()
        // 闭合围栏：同字符、不短于开启长度、且其后只允许空白
        if (marker.length >= openLength && rest.length === 0) {
            openChar = ''
            openLength = 0
        }
    }
    return openChar.length > 0
}
