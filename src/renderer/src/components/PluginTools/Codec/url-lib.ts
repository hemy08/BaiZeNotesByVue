/**
 * URL 编解码纯函数。
 *
 * 移植自 jyshare 在线工具 /front-end/695/（URL 编码/解码），原版即直接调用
 * 浏览器内置 API，无任何自定义处理：
 * - encodeUrl：encodeURIComponent（文本按 UTF-8 百分号编码）；
 * - decodeUrl：decodeURIComponent（非法百分号序列抛出 URIError，由调用方捕获提示）。
 */

/**
 * URL 编码：将文本按 UTF-8 转换为百分号编码。
 * @param text 原文
 * @returns 编码后的字符串
 */
export function encodeUrl(text: string): string {
    return encodeURIComponent(text)
}

/**
 * URL 解码：将百分号编码还原为 UTF-8 文本。
 * 输入包含非法百分号序列（如单独的 '%'）时抛出 URIError。
 * @param text 编码后的字符串
 * @returns 解码后的文本
 */
export function decodeUrl(text: string): string {
    return decodeURIComponent(text)
}
