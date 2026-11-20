/**
 * 随机生成器纯函数库（jyshare 随机四件套能力移植：密码/字符串/数字/颜色）
 *
 * 随机源约定：所有随机函数接受可选的 random 参数（() => [0, 1) 均匀浮点），
 * 便于单测注入确定性随机源；默认使用 crypto.getRandomValues 的无偏拒绝采样，
 * 不使用 Math.random。
 */
import { hsvToRgb, rgbToHex } from '../Convert/color-lib'

/** 随机源类型：[0, 1) 均匀分布的浮点函数 */
export type RandomSource = () => number

/** 密码字符集常量 */
export const PASSWORD_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const PASSWORD_LOWER = 'abcdefghijklmnopqrstuvwxyz'
export const PASSWORD_DIGITS = '0123456789'
export const PASSWORD_SYMBOLS = '!@#$%^&*()_+{}:<>?[]\\|~'

/** 密码生成选项 */
export interface PasswordOptions {
    uppercase: boolean
    lowercase: boolean
    numbers: boolean
    symbols: boolean
}

/** 默认安全随机源：crypto.getRandomValues 生成 [0, 1) 浮点（2^32 精度，无偏） */
export function secureRandom(): number {
    const buf = new Uint32Array(1)
    // Electron 渲染层 / Node 均提供全局 crypto（webcrypto）
    globalThis.crypto.getRandomValues(buf)
    return buf[0] / 4294967296
}

/**
 * 无偏整数采样 [min, max]（闭区间）。
 * 默认源下用拒绝采样消除 2^32 模偏差；注入源下用 floor(random()*range)。
 */
function randomInt(min: number, max: number, random: RandomSource): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new Error('无效的随机数范围')
    }
    const range = max - min + 1
    if (random === secureRandom) {
        // 无偏拒绝采样（与 jyshare 6680 页一致）
        const limit = Math.floor(4294967296 / range) * range
        const buf = new Uint32Array(1)
        let v: number
        do {
            globalThis.crypto.getRandomValues(buf)
            v = buf[0]
        } while (v >= limit)
        return min + (v % range)
    }
    const v = Math.floor(random() * range)
    return min + Math.min(v, range - 1)
}

/** 从字符集中随机取一个字符 */
function pickChar(charset: string, random: RandomSource): string {
    return charset.charAt(randomInt(0, charset.length - 1, random))
}

/** Fisher-Yates 洗牌（使用注入随机源） */
function shuffle<T>(items: T[], random: RandomSource): T[] {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
        const j = randomInt(0, i, random)
        const tmp = result[i]
        result[i] = result[j]
        result[j] = tmp
    }
    return result
}

/**
 * 生成随机密码。
 * - 长度夹取到 4-128；
 * - 保证每个勾选的字符集至少出现一次，其余位置随机填充，最后洗牌；
 * - 全部未勾选时回退为仅小写字母。
 */
export function generatePassword(
    len: number,
    opts: PasswordOptions,
    random: RandomSource = secureRandom
): string {
    const length = Math.max(4, Math.min(128, Math.floor(len)))
    const sets: string[] = []
    if (opts.uppercase) sets.push(PASSWORD_UPPER)
    if (opts.lowercase) sets.push(PASSWORD_LOWER)
    if (opts.numbers) sets.push(PASSWORD_DIGITS)
    if (opts.symbols) sets.push(PASSWORD_SYMBOLS)
    if (sets.length === 0) sets.push(PASSWORD_LOWER)

    const all = sets.join('')
    const chars: string[] = []
    // 每个选中字符集先保证至少一个字符
    for (const set of sets) {
        chars.push(pickChar(set, random))
    }
    while (chars.length < length) {
        chars.push(pickChar(all, random))
    }
    return shuffle(chars.slice(0, length), random).join('')
}

/**
 * 生成随机字符串。
 * @param len 长度（夹取到 1-4096）
 * @param charset 字符集（必须非空）
 */
export function generateRandomString(
    len: number,
    charset: string,
    random: RandomSource = secureRandom
): string {
    if (!charset || charset.length === 0) {
        throw new Error('字符集不能为空')
    }
    const length = Math.max(1, Math.min(4096, Math.floor(len)))
    let result = ''
    for (let i = 0; i < length; i++) {
        result += pickChar(charset, random)
    }
    return result
}

/**
 * 生成一批不重复的随机整数（Set 去重）。
 * @param min 最小值（夹取到 ±1e9）
 * @param max 最大值（夹取到 ±1e9）
 * @param count 数量（夹取到 1-100；大于闭区间长度时抛错）
 */
export function generateRandomNumbers(
    min: number,
    max: number,
    count: number,
    random: RandomSource = secureRandom
): number[] {
    const lo = Math.max(-1e9, Math.min(1e9, Math.floor(min)))
    const hi = Math.max(-1e9, Math.min(1e9, Math.floor(max)))
    if (lo > hi) {
        throw new Error('最小值不能大于最大值')
    }
    const amount = Math.max(1, Math.min(100, Math.floor(count)))
    if (hi - lo + 1 < amount) {
        throw new Error('范围太小，无法生成 ' + amount + ' 个不重复的随机数')
    }
    const seen = new Set<number>()
    while (seen.size < amount) {
        seen.add(randomInt(lo, hi, random))
    }
    return [...seen]
}

/** 随机颜色结果（含 HSV 与换算后的 HEX/RGB 双格式） */
export interface RandomColorResult {
    h: number
    s: number
    v: number
    hex: string
    rgb: string
}

/**
 * 生成随机颜色：hue 在 0-360 均匀随机，s/v 按选项固定或随机亮度，
 * 输出 HEX 与 RGB 双格式（经 HSV→RGB 换算）。
 * @param opts.s 固定饱和度（0-100），缺省随机 50-100
 * @param opts.v 固定亮度（0-100），缺省随机 70-100
 */
export function randomColorHsv(
    random: RandomSource = secureRandom,
    opts?: { s?: number; v?: number }
): RandomColorResult {
    const h = Math.floor(random() * 360)
    const s = opts && opts.s !== undefined ? opts.s : 50 + Math.floor(random() * 51)
    const v = opts && opts.v !== undefined ? opts.v : 70 + Math.floor(random() * 31)
    const rgb = hsvToRgb({ h, s, v })
    return {
        h,
        s,
        v,
        hex: rgbToHex(rgb),
        rgb: rgb.r + ',' + rgb.g + ',' + rgb.b
    }
}
