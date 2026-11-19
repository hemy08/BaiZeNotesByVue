/**
 * 跨进程共享的 FNV-1a 32 位哈希纯函数（第 1 批公共接口归位：src/shared/utils/hash.ts）。
 *
 * 背景：项目内原有 4 份等价的 FNV-1a 32 位实现，仅「输出进制」与「输入键的归一化方式」
 * 不同，哈希核心完全一致（同一偏移基准 `0x811c9dc5`、同一质数 `0x01000193`、
 * 同一 `Math.imul` 乘法）：
 * - `src/main/utils/file-utils/directory-tree.ts:466-474`（buildStableItemId：路径键 → 10 进制再 `toString(36)`）；
 * - `src/renderer/src/components/ResourceManager/resource-manager.ts:23-57`（ComputeTocSignature：多段混入，返回数字）；
 * - `src/renderer/src/components/Markdown/preview-chapters.ts:35-47`（mixString：多段混入，返回数字）；
 * - `src/renderer/src/components/Markdown/hemy-editor-render.ts:73-83`（hashString：返回 `toString(16)` 字符串）。
 *
 * 四处已逐一核对：偏移基准、质数、逐字符 XOR + imul 顺序、`>>> 0` 无符号化一致，
 * 不存在语义分叉；因此以「最完整」的 `fnv1a32Mix`（支持分段续算）为基准抽取公共实现，
 * 各调用方保留自己的进制参数（通过 {@link toRadixString}）与输入键归一化逻辑。
 *
 * 仅作指纹/缓存键使用，无须密码学强度。
 */

/** FNV-1a 32 位偏移基准（与四处原实现一致） */
export const FNV_OFFSET_BASIS = 0x811c9dc5

/** FNV-1a 32 位质数（与四处原实现一致） */
export const FNV_PRIME = 0x01000193

/**
 * 把一个字符串混入已有的 FNV-1a 32 位哈希（分段续算）。
 *
 * 对齐 `preview-chapters.ts:40-47`（mixString）、`resource-manager.ts:40-46`（mixString 闭包）
 * 的逐字逻辑：逐字符 `hash ^= charCodeAt(i)` 后 `hash = Math.imul(hash, FNV_PRIME)`。
 *
 * 返回值与 `Math.imul` 一致为有符号 32 位整数，最终输出请再 `>>> 0`（或使用
 * {@link fnv1a32} / {@link toRadixString}，二者内部已做无符号化）。
 *
 * @param hash 已有哈希（首次传入 {@link FNV_OFFSET_BASIS}）
 * @param str 要混入的字符串
 * @returns 混入后的 32 位哈希（有符号表示，语义位模式不变）
 */
export function fnv1a32Mix(hash: number, str: string): number {
    let mixed = hash
    for (let index = 0; index < str.length; index += 1) {
        mixed ^= str.charCodeAt(index)
        mixed = Math.imul(mixed, FNV_PRIME)
    }
    return mixed
}

/**
 * 计算字符串的 FNV-1a 32 位哈希（无符号）。
 *
 * 对齐 `directory-tree.ts:466-474`、`hemy-editor-render.ts:73-83` 的完整实现
 * （`hash >>> 0`）。
 *
 * @param str 输入字符串
 * @returns 32 位无符号整数哈希（0 ~ 4294967295）
 */
export function fnv1a32(str: string): number {
    return fnv1a32Mix(FNV_OFFSET_BASIS, str) >>> 0
}

/**
 * 把 32 位哈希（或任意数字）按指定进制输出为字符串。
 *
 * 对齐 `directory-tree.ts:473` 的 `(hash >>> 0).toString(36)` 与
 * `hemy-editor-render.ts:82` 的 `(hash >>> 0).toString(16)`：
 * 先 `>>> 0` 转无符号 32 位，再调用 `Number.prototype.toString(radix)`。
 *
 * @param num 待格式化的数字（负数/超 32 位会按 `>>> 0` 截断，与原实现一致）
 * @param radix 进制（2~36，与原生 toString 一致；越界抛 RangeError）
 * @returns 指定进制的字符串（小写字母）
 */
export function toRadixString(num: number, radix: number): string {
    return (num >>> 0).toString(radix)
}
