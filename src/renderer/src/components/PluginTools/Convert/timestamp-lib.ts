/**
 * 时间戳转换纯函数库（jyshare /front-end/852/ 能力移植，去掉 moment 依赖）
 *
 * 全部使用原生 Date（本地时区），不依赖 moment 等第三方库。
 * - timestampToLocal：时间戳（秒/毫秒）→ 本地时间字符串 "YYYY-MM-DD HH:mm:ss"
 * - localToTimestamp：本地时间字符串 → 时间戳（秒/毫秒），严格校验非法输入抛错
 */

/** 补零工具 */
function pad2(n: number): string {
    return String(n).padStart(2, '0')
}

/**
 * 时间戳转本地时间字符串（YYYY-MM-DD HH:mm:ss）。
 * @param ts 时间戳数值（必须为有限整数，允许负数表示 1970 年之前）
 * @param isMs true 表示毫秒级时间戳，false 表示秒级
 * @throws 非法输入或超出 Date 可表示范围时抛错
 */
export function timestampToLocal(ts: number, isMs: boolean): string {
    if (typeof ts !== 'number' || !Number.isFinite(ts) || !Number.isInteger(ts)) {
        throw new Error('时间戳必须为整数：' + String(ts))
    }
    const ms = isMs ? ts : ts * 1000
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) {
        throw new Error('时间戳超出可表示范围：' + String(ts))
    }
    return (
        date.getFullYear() +
        '-' +
        pad2(date.getMonth() + 1) +
        '-' +
        pad2(date.getDate()) +
        ' ' +
        pad2(date.getHours()) +
        ':' +
        pad2(date.getMinutes()) +
        ':' +
        pad2(date.getSeconds())
    )
}

/**
 * 本地时间字符串转时间戳（本地时区手工解析，不依赖 Date.parse 的实现差异）。
 * 支持 "YYYY-MM-DD"、"YYYY-MM-DD HH:mm"、"YYYY-MM-DD HH:mm:ss"
 * （分隔符仅接受 "-"，日期与时间之间可为一个空格或 "T"）。
 * @param str 本地时间字符串
 * @param isMs true 返回毫秒级时间戳，false 返回秒级
 * @throws 格式非法、日期不存在（如 2023-02-30）或时间越界时抛错
 */
export function localToTimestamp(str: string, isMs: boolean): number {
    const cleaned = String(str).trim()
    const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
    if (!match) {
        throw new Error('无效的日期时间格式：' + str + '（应为 YYYY-MM-DD HH:mm:ss）')
    }
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = match[4] === undefined ? 0 : Number(match[4])
    const minute = match[5] === undefined ? 0 : Number(match[5])
    const second = match[6] === undefined ? 0 : Number(match[6])

    if (month < 1 || month > 12) {
        throw new Error('月份无效：' + str)
    }
    if (hour > 23 || minute > 59 || second > 59) {
        throw new Error('时间无效：' + str)
    }
    // 校验实际存在的日期（自动处理闰年与大小月）
    const date = new Date(year, month - 1, day, hour, minute, second)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        throw new Error('日期无效：' + str)
    }
    const ms = date.getTime()
    return isMs ? ms : Math.floor(ms / 1000)
}
