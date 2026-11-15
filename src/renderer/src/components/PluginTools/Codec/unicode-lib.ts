/**
 * Unicode 编解码纯函数（无 DOM 依赖，可单测）。
 *
 * 移植自 jyshare 在线工具 /front-end/3602/（Unicode 编码转换），行为对齐：
 * - textToUnicode：非 ASCII 字符（charCodeAt > 127）转为 \uXXXX（4 位十六进制），
 *   ASCII 原样保留；>0xFFFF 字符（如 emoji）按 UTF-16 码元拆成代理对两个 \uXXXX，
 *   往返可逆；
 * - unicodeToText：\uXXXX（十六进制大小写均可）还原为字符；
 * - asciiToEntity：按 Unicode 码点（codePointAt，代理对合并为一个码点）逐字符转为
 *   &#十进制码点; 实体（含 ASCII；emoji 输出单个 &#128512; 形态的实体）；
 * - entityToAscii：&#nn; 与 &#xhh; 数字实体按码点还原（复用 html-lib 的
 *   codePointToChar：>0xFFFF 不再按 2^16 取模，越界码点原样保留），
 *   未匹配的原样保留（P3 修复）。
 */
import { codePointToChar } from './html-lib'

/**
 * 文本 → \uXXXX 格式：ASCII 字符原样保留，其余按 UTF-16 码元输出小写 4 位十六进制。
 * @param text 原文
 * @returns Unicode 转义格式字符串
 */
export function textToUnicode(text: string): string {
    let output = ''
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        output += code > 127 ? '\\u' + code.toString(16).padStart(4, '0') : text[i]
    }
    return output
}

/**
 * \uXXXX → 文本：把每个 \uXXXX 序列还原为对应字符。
 * @param text 含 \uXXXX 的字符串
 * @returns 还原后的文本
 */
export function unicodeToText(text: string): string {
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
    )
}

/**
 * 文本 → &#十进制码点; 实体：每个字符（含 ASCII）按 Unicode 码点输出一个数字实体。
 * emoji 等增补平面字符（码点 >0xFFFF）按 codePointAt 输出单个码点实体（如 😀 → &#128512;），
 * 并跳过低代理位，保证与 entityToAscii 的码点解码往返一致。
 * @param text 原文
 * @returns 实体序列字符串
 */
export function asciiToEntity(text: string): string {
    let output = ''
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i)
        if (code === undefined) break
        output += '&#' + code + ';'
        // 增补平面字符占两个 UTF-16 码元：跳过低代理位，避免输出半个代理对
        if (code > 0xffff) i++
    }
    return output
}

/**
 * &#nn; / &#xhh; 数字实体 → 文本：未匹配的实体序列原样保留。
 * 码点按 Unicode 还原（复用 html-lib 的 codePointToChar），越界码点（>0x10FFFF）
 * 原样保留不抛错（P3 修复：此前 String.fromCharCode 会按 2^16 取模产出错误字符）。
 * @param text 含数字实体的字符串
 * @returns 还原后的文本
 */
export function entityToAscii(text: string): string {
    return text.replace(/&#(x?)([0-9a-fA-F]+);/g, (_match, hex: string, num: string) =>
        codePointToChar(parseInt(num, hex ? 16 : 10), _match)
    )
}
