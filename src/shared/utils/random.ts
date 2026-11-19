/**
 * 跨进程共享的随机串纯函数（第 1 批公共接口归位：src/shared/utils/random.ts）。
 *
 * 说明：项目内原有两个同名 `getMathRandom`，字符集不同且容易误用——
 * - `src/main/utils/file-utils/image-operations.ts:31-37`：纯数字（图片落盘文件名片段）；
 * - `src/main/utils/file-utils/file-operations.ts:70-77`：字母 + 数字（随机 ID）。
 * 本模块按字符集拆成两个语义明确的函数，调用方迁移时按原字符集选择，避免误用。
 *
 * 安全提示：全部使用 `Math.random()`（与现有实现一致），仅用于文件名/缓存键等
 * 非安全场景；不可用于令牌、密码等安全敏感用途（安全场景用 crypto）。
 */

/** 字母数字字符集（与 file-operations.ts:70-77 的 possible 逐字一致：大小写字母在前、数字在后） */
const ALNUM_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * 生成指定长度的纯数字随机串（每位 0~9）。
 *
 * 对齐 `image-operations.ts:31-37`（getMathRandom 纯数字版）：
 * 逐位 `Math.floor(Math.random() * 10)` 拼接，不保证首位非 0。
 *
 * @param length 期望长度（与原实现相同的 `<` 循环语义；非正数返回空串）
 * @returns 仅含数字的字符串
 */
export function randomDigits(length: number): string {
    let result = ''
    for (let index = 0; index < length; index += 1) {
        result += Math.floor(Math.random() * 10)
    }
    return result
}

/**
 * 生成指定长度的字母数字随机串。
 *
 * 对齐 `file-operations.ts:70-77`（getMathRandom 字母数字版）：
 * 字符集固定为 `A-Z a-z 0-9`，逐位 `charAt(Math.floor(Math.random() * 字符集长度))`。
 *
 * @param length 期望长度（与原实现相同的 `<` 循环语义；非正数返回空串）
 * @returns 仅含字母/数字的字符串
 */
export function randomAlnum(length: number): string {
    let result = ''
    for (let index = 0; index < length; index += 1) {
        result += ALNUM_CHARACTERS.charAt(Math.floor(Math.random() * ALNUM_CHARACTERS.length))
    }
    return result
}

/**
 * 生成「时间戳 + 冒号 + 9 位 36 进制随机尾串」的唯一后缀。
 *
 * 对齐现有 4 处同构写法（如 `src/main/ipc/ipc-listener-manager.ts:77`、
 * `src/main/window/window-manager.ts:48`）：
 * `` `${Date.now()}:${Math.random().toString(36).substr(2, 9)}` ``。
 * 这里用 `slice(2, 11)` 替代已废弃的 `substr(2, 9)`——对任意字符串两者结果一致。
 *
 * @returns 形如 `1732000000000:k3j9x0abc` 的字符串
 */
export function uniqueSuffix(): string {
    return `${Date.now()}:${Math.random().toString(36).slice(2, 11)}`
}
