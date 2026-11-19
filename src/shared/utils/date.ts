/**
 * 跨进程共享的日期时间格式化纯函数（第 1 批公共接口归位：src/shared/utils/date.ts）。
 *
 * 背景：项目内存在 3 份 `padStart` 日期拼装样板：
 * - `src/main/utils/auto-backup.ts:97-104`（formatAutoBackupStamp：`YYYYMMDD-HHmmss`）；
 * - `src/main/config/config-backup.ts:68-75`（formatBackupStamp：`YYYYMMDD-HHmmss`）；
 * - `src/renderer/src/common/templates/textblock.ts:16-27`（getFmtData：`YYYY-MM-DD HH:mm:ss`）。
 * 本模块用「pattern + 令牌替换」方式统一两种格式，**输出与原拼装结果逐字一致**（仅替换
 * 令牌、补零规则不变），不改变任何既有输出格式。
 */

/** 日期时间令牌匹配：注意 `MM`（月）与 `mm`（分）大小写敏感、含义不同 */
const DATE_TIME_TOKEN_PATTERN = /YYYY|MM|DD|HH|mm|ss/g

/** 默认格式（与 textblock.ts 的「最后更新」时间格式一致） */
export const DEFAULT_DATE_TIME_PATTERN = 'YYYY-MM-DD HH:mm:ss'

/** 两位补零 */
function padTwo(value: number): string {
    return String(value).padStart(2, '0')
}

/**
 * 按 pattern 格式化**本地时间**。
 *
 * 支持令牌（可任意组合，未识别的字符原样保留）：
 * - `YYYY`：四位年份；
 * - `MM`：两位月份（01~12）；
 * - `DD`：两位日期（01~31）；
 * - `HH`：两位小时（00~23，24 小时制）；
 * - `mm`：两位分钟（00~59）；
 * - `ss`：两位秒（00~59）。
 *
 * 两个常用 pattern：
 * - `YYYYMMDD-HHmmss` → `20261119-135551`（备份目录时间戳，对齐 auto-backup/config-backup）；
 * - `YYYY-MM-DD HH:mm:ss` → `2026-11-19 13:55:51`（对齐 textblock.ts）。
 *
 * 边界：`date` 为 Invalid Date 时返回空字符串（原实现会拼出 `NaNNaN...` 的无效时间戳，
 * 这里按「无法格式化」的确定值返回，避免把 NaN 带入目录名/UI）。
 *
 * @param date 日期对象（按本地时区取各字段）
 * @param pattern 格式模板，缺省为 {@link DEFAULT_DATE_TIME_PATTERN}
 * @returns 格式化后的字符串；非法日期返回 `''`
 */
export function formatDateTime(date: Date, pattern: string = DEFAULT_DATE_TIME_PATTERN): string {
    if (Number.isNaN(date.getTime())) {
        return ''
    }
    const values: Record<string, string> = {
        YYYY: String(date.getFullYear()),
        MM: padTwo(date.getMonth() + 1),
        DD: padTwo(date.getDate()),
        HH: padTwo(date.getHours()),
        mm: padTwo(date.getMinutes()),
        ss: padTwo(date.getSeconds())
    }
    return pattern.replace(DATE_TIME_TOKEN_PATTERN, (token) => values[token])
}
