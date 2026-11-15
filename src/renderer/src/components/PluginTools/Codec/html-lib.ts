/**
 * HTML 实体编解码纯函数（无 DOM 依赖，可单测）。
 *
 * 移植自 jyshare 在线工具 /front-end/691/（HTML 编码/解码）。原版依赖
 * jQuery 的 DOM 序列化/解析；此处改为纯字符串实现，行为对齐：
 * - 编码：转义 & < > " ' 五个字符（覆盖 HTML 属性值的全部危险字符）；
 * - 解码：单趟替换，支持常用命名实体与数字实体 &#nn; / &#xhh;，
 *   未收录的实体与越界码点原样保留（宽容处理，不抛异常）。
 */

/** 需要转义的字符 → 实体对照表 */
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}

/** 常用命名实体 → 字符对照表（含任务要求的最小集与常见排版/符号实体） */
const HTML_NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
    ensp: '\u2002',
    emsp: '\u2003',
    thinsp: '\u2009',
    ndash: '\u2013',
    mdash: '\u2014',
    lsquo: '\u2018',
    rsquo: '\u2019',
    ldquo: '\u201c',
    rdquo: '\u201d',
    laquo: '\u00ab',
    raquo: '\u00bb',
    copy: '\u00a9',
    reg: '\u00ae',
    trade: '\u2122',
    deg: '\u00b0',
    plusmn: '\u00b1',
    times: '\u00d7',
    divide: '\u00f7',
    sect: '\u00a7',
    para: '\u00b6',
    middot: '\u00b7',
    hellip: '\u2026',
    bull: '\u2022'
}

/**
 * 将文本中的 & < > " ' 转义为 HTML 实体，其余字符原样保留。
 * @param text 原文
 * @returns 转义后的字符串
 */
export function encodeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch])
}

/**
 * 解码 HTML 实体：命名实体（常用集）与数字实体 &#nn; / &#xhh;。
 * 单趟替换（不二次解码，如 &amp;lt; 只还原为 &lt;）；
 * 未收录的命名实体与越界码点原样保留，不抛异常。
 * @param text 含实体的字符串
 * @returns 解码后的字符串
 */
export function decodeHtml(text: string): string {
    return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
        if (body.startsWith('#x') || body.startsWith('#X')) {
            return codePointToChar(parseInt(body.slice(2), 16), match)
        }
        if (body.startsWith('#')) {
            return codePointToChar(parseInt(body.slice(1), 10), match)
        }
        const named = HTML_NAMED_ENTITIES[body.toLowerCase()]
        return named !== undefined ? named : match
    })
}

/**
 * 数字实体码点转字符；非法码点（越界/非有限数）时原样保留实体文本。
 * 导出供 unicode-lib.ts 复用（P3 修复：unicode-lib 的 &#nn; 解码不再按 2^16 取模）。
 */
export function codePointToChar(code: number, fallback: string): string {
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback
    return String.fromCodePoint(code)
}
