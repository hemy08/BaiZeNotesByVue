/**
 * 图片 ↔ Base64 字节层纯函数，供 ImageBase64.vue 调用。
 *
 * 移植自 jyshare 在线工具 /front-end/59/（图片转 BASE64 编码），行为对齐：
 * - bytesToBase64：Uint8Array → Base64。按 24576 字节分块转二进制串再 btoa
 *   （一次性展开大数组会超出函数实参上限，分块与 jyshare 原版一致）；
 * - base64ToBytes：Base64（或带 data:…;base64, 前缀的 DataURL）→ Uint8Array。
 *   atob 逐字节还原，容忍空白与换行；非法 Base64 字符由 atob 抛出异常。
 */

/** 单次 String.fromCharCode 展开的最大字节数（与 jyshare 原版一致） */
const BYTES_PER_CHUNK = 24576

/**
 * 字节数组 → Base64 字符串。
 * @param bytes 图片原始字节
 * @returns Base64 字符串（不含 data URL 前缀）
 */
export function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i += BYTES_PER_CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + BYTES_PER_CHUNK))
    }
    return btoa(binary)
}

/**
 * Base64（或 data:…;base64, 前缀的 DataURL）→ 字节数组。
 * 自动剥离 DataURL 前缀并忽略空白/换行；内容非法时 atob 抛出异常。
 * @param input Base64 或 DataURL 字符串
 * @returns 解码后的字节数组（空输入返回空数组）
 */
export function base64ToBytes(input: string): Uint8Array {
    let text = input.trim()
    // 剥离 DataURL 前缀（data:image/png;base64,xxx 等）
    const dataUrlMatch = text.match(/^data:[^,]*;base64,([\s\S]*)$/i)
    if (dataUrlMatch) text = dataUrlMatch[1]
    text = text.replace(/[\t\n\r ]/g, '')
    if (!text) return new Uint8Array(0)
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}
