/**
 * 跨进程共享的输入校验纯函数（第 1 批公共接口归位：src/shared/utils/validate.ts）。
 *
 * 来源（两处实现逐字同构，核对后抽取）：
 * - `src/main/utils/security.ts:185-193`（hasControlChars）；
 * - `src/main/config/config-schema.ts:70-106`（isPlainObject / isFiniteNumber / clampNumber /
 *   hasControlChars）；
 * - `src/main/config/config-manager.ts:87-89`（isPlainObject 副本）。
 */

/**
 * 是否含控制字符（NUL / 换行 / 制表 / DEL 等，用于路径与单行文本字段校验）。
 *
 * 对齐 `security.ts:185-193` 与 `config-schema.ts:98-106`：
 * 逐字符判断 `code <= 0x1f || code === 0x7f`（使用逐字符判断而不是控制字符正则，
 * 避免 ESLint `no-control-regex` 告警）。
 *
 * 与来源实现相比唯一的签名扩展：入参类型放宽为 `unknown`（安全校验的调用方常直接拿到
 * IPC 载荷/配置值，先判类型再判字符可少写一次分支）；非字符串一律返回 `false`。
 *
 * @param value 待检查值
 * @returns 字符串含控制字符返回 true；非字符串或不含控制字符返回 false
 */
export function hasControlChars(value: unknown): boolean {
    if (typeof value !== 'string') {
        return false
    }
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index)
        if (code <= 0x1f || code === 0x7f) {
            return true
        }
    }
    return false
}

/**
 * 是否为纯对象（排除数组 / null / 函数 / 原始值）。
 *
 * 对齐 `config-schema.ts:70-72`、`config-manager.ts:87-89`：
 * `typeof data === 'object' && data !== null && !Array.isArray(data)`。
 * 注意这是**宽松版**纯对象判定：`Date`、`Map` 等对象也会返回 true（与原实现一致，
 * 原实现只用于 JSON 配置对象判定，不涉及类实例）。
 *
 * @param value 待检查值
 * @returns 是纯对象返回 true，并收窄为 `Record<string, unknown>`
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 是否为有限数字（拒绝 NaN / Infinity / 字符串数字）。
 *
 * 对齐 `config-schema.ts:74-77`：`typeof value === 'number' && Number.isFinite(value)`。
 *
 * @param value 待检查值
 * @returns 是有限数字返回 true，并收窄为 `number`
 */
export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 数值钳制到 `[min, max]` 区间。
 *
 * 对齐 `config-schema.ts:79-95`（clampNumber）的区间钳制语义；签名按要求收敛为
 * 「数字进、数字出」：
 * - `value < min` → `min`；`value > max` → `max`；区间内原样返回；
 * - `NaN` 无法表达「非法返回 null」（config-schema 原实现返回 `null`），本函数回退
 *   `min` 作为确定值——调用方若需要区分「非法/被钳制」，先自行用 {@link isFiniteNumber}
 *   判断，再调用本函数；
 * - `Infinity` / `-Infinity` 按区间钳制为 `max` / `min`（与 `Math.min/Math.max` 语义一致）。
 *
 * @param value 待钳制数值
 * @param min 下界
 * @param max 上界
 * @returns 钳制后的数值
 */
export function clampNumber(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) {
        return min
    }
    return Math.min(max, Math.max(min, value))
}
