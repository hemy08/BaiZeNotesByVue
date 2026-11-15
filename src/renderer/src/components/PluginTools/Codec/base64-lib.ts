/**
 * Base64 编解码纯函数（无 DOM 依赖，可单测）。
 *
 * 移植自 jyshare 在线工具 /front-end/693/（Base64 编码/解码），行为对齐：
 * - 编码：文本先按 UTF-8 编码成字节（TextEncoder，中文/emoji 均正确处理），
 *   再按「3 字节 → 4 字符」查标准字母表输出，不足 3 字节用 '=' 填充；
 * - 解码：先过滤字母表以外的非法字符（容忍空白、换行等），还原字节后
 *   按 UTF-8 解码为文本；无效 UTF-8 字节序列以替换字符 U+FFFD 代替，不抛异常。
 */

/** Base64 标准字符表（不含填充符 '='） */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * 将文本按 UTF-8 编码后转换为 Base64 字符串。
 * @param text 原文（支持中文、emoji 等任意 Unicode 文本）
 * @returns Base64 字符串（空串输入返回空串）
 */
export function encodeBase64(text: string): string {
    const bytes = new TextEncoder().encode(text)
    let output = ''
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : -1
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : -1
        output += BASE64_ALPHABET[b0 >> 2]
        output += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4)]
        output += b1 < 0 ? '=' : BASE64_ALPHABET[((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6)]
        output += b2 < 0 ? '=' : BASE64_ALPHABET[b2 & 63]
    }
    return output
}

/**
 * 将 Base64 字符串解码为 UTF-8 文本。
 * 解码时容忍非法字符：自动剔除 Base64 字母表以外的字符（空白、换行等），
 * 遇到无效的 UTF-8 字节序列时用替换字符 U+FFFD 代替，不抛异常。
 * @param b64 Base64 字符串
 * @returns 解码后的文本
 */
export function decodeBase64(b64: string): string {
    const cleaned = b64.replace(/[^A-Za-z0-9+/=]/g, '')
    const bytes: number[] = []
    let buffer = 0
    let bits = 0
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i]
        // 填充符：其后内容忽略
        if (ch === '=') break
        const value = BASE64_ALPHABET.indexOf(ch)
        // 非法字符已被上面的 replace 过滤，此处为防御性跳过
        if (value < 0) continue
        buffer = (buffer << 6) | value
        bits += 6
        if (bits >= 8) {
            bits -= 8
            bytes.push((buffer >> bits) & 0xff)
        }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes))
}
