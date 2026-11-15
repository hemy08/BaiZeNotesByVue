/**
 * JSON 工具核心库（格式化 / 压缩 / 转义 / 去转义，全部纯函数）
 *
 * - 格式化：JSON.parse 校验 + JSON.stringify(value, null, 2)；解析失败报错含行列位置；
 * - 压缩：JSON.parse 校验 + JSON.stringify 无空格；
 * - 转义/去转义：正确实现 \" \\ \/ \b \f \n \r \t（另兼容 \uXXXX 逆转义）。
 *   注意：原 jyshare 7683 页面的去转义实现有缺陷（\\" 还原错误、\/ 被替换成空格、
 *   只处理 \r\n 组合且 \r 单独不处理），本库采用逐个字符扫描的解析器修正之。
 */

/** 将 V8 的 "at position N" 报错转为含行列的提示 */
function describeParseError(input: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error)
    const posMatch = /at position (\d+)/.exec(message)
    if (posMatch) {
        const index = Number(posMatch[1])
        const before = input.slice(0, index)
        const line = before.split('\n').length
        const lineStart = before.lastIndexOf('\n') + 1
        const column = index - lineStart + 1
        return new Error(`${message}（第 ${line} 行，第 ${column} 列）`)
    }
    return new Error(message)
}

/** 校验并解析 JSON（失败时报错含位置信息） */
function parseJson(input: string): unknown {
    try {
        return JSON.parse(input)
    } catch (error) {
        throw describeParseError(input, error)
    }
}

/** JSON 格式化：校验 + 2 空格缩进；解析失败抛错（含位置） */
export function formatJson(input: string): string {
    return JSON.stringify(parseJson(input), null, 2)
}

/** JSON 压缩：校验 + 无空格序列化；解析失败抛错（含位置） */
export function minifyJson(input: string): string {
    return JSON.stringify(parseJson(input))
}

/** JSON 字符串转义：\" \\ \/ \b \f \n \r \t（反斜杠最先处理，避免二次转义） */
export function escapeJson(input: string): string {
    return (
        input
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\//g, '\\/')
            // [\b] 字符类中的 \b 是退格符（U+0008），不是单词边界
            .replace(/[\b]/g, '\\b')
            .replace(/\f/g, '\\f')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
    )
}

/**
 * JSON 字符串去转义：逐字符扫描，正确还原 \" \\ \/ \b \f \n \r \t 与 \uXXXX；
 * 未知转义序列（如 \x）原样保留，不吞掉反斜杠，保证与 escapeJson 往返自洽。
 */
export function unescapeJson(input: string): string {
    let result = ''
    for (let i = 0; i < input.length; i++) {
        const ch = input.charAt(i)
        if (ch !== '\\') {
            result += ch
            continue
        }
        const next = input.charAt(i + 1)
        switch (next) {
            case '"':
                result += '"'
                i++
                break
            case '\\':
                result += '\\'
                i++
                break
            case '/':
                result += '/'
                i++
                break
            case 'b':
                result += '\b'
                i++
                break
            case 'f':
                result += '\f'
                i++
                break
            case 'n':
                result += '\n'
                i++
                break
            case 'r':
                result += '\r'
                i++
                break
            case 't':
                result += '\t'
                i++
                break
            case 'u': {
                const hex = input.substr(i + 2, 4)
                if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                    result += String.fromCharCode(parseInt(hex, 16))
                    i += 5
                } else {
                    // 非法 \u：原样保留 \u，后续字符继续正常处理
                    result += '\\u'
                    i++
                }
                break
            }
            default:
                // 未知转义：保留反斜杠与下一字符，与转义侧保持一致
                result += '\\' + next
                i++
        }
    }
    return result
}
