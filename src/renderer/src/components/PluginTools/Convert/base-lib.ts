/**
 * 进制转换纯函数库（jyshare /front-end/58/ 能力移植，去掉 bignumber.js 依赖）
 *
 * 支持 2~36 进制任意互转，输入支持：
 * - 整数与小数（小数乘基取整，最多保留 20 位）；
 * - 负数（前置 "-"）；
 * - 大小写字母（输出统一大写）。
 * 实现：整数部分用原生 BigInt（除基取余），小数部分用“分数表示法”字符串算法
 * （分子/分母均为 BigInt），避免浮点误差。
 */

/** 2-36 进制数字表 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * P2 修复：输入长度上限（字符数）。
 * 此前无上限，超长小数会执行 fromBig ** BigInt(n) 的巨大指数运算冻结 UI；
 * 10000 字符的解析与指数运算为毫秒级（配合组件侧 200ms 防抖）。
 */
export const MAX_BASE_INPUT_LENGTH = 10000

/** 单字符转数值（0-9 / A-Z，大小写均可），非法字符返回 -1 */
function charToValue(char: string): number {
    const value = DIGITS.indexOf(char.toUpperCase())
    return value
}

/** 校验进制数是否在 2-36 之间（整数） */
function assertBase(base: number): void {
    if (!Number.isInteger(base) || base < 2 || base > 36) {
        throw new Error('进制必须在 2-36 之间：' + String(base))
    }
}

/**
 * 校验输入字符串是否为指定进制的合法数字。
 * 允许：开头一个 "-"、至多一个小数点、字母大小写；不允许空串与孤立符号。
 * 超过长度上限直接判非法（避免超长输入进入转换管线）。
 */
export function isValidForBase(input: string, base: number): boolean {
    if (!Number.isInteger(base) || base < 2 || base > 36) return false
    const text = String(input).trim()
    if (text === '' || text === '-' || text === '.' || text === '-.') return false
    if (text.length > MAX_BASE_INPUT_LENGTH) return false
    const rest = text.startsWith('-') ? text.slice(1) : text
    if (rest === '') return false
    const dotCount = (rest.match(/\./g) ?? []).length
    if (dotCount > 1) return false
    // 至少含一个有效数字，且所有字符都在进制数字表内
    let digitCount = 0
    for (const char of rest) {
        if (char === '.') continue
        const value = charToValue(char)
        if (value < 0 || value >= base) return false
        digitCount++
    }
    return digitCount > 0
}

/** 整数部分字符串（可空）转 BigInt */
function parseIntegerToBigInt(intStr: string, from: number): bigint {
    if (intStr === '') return 0n
    let acc = 0n
    const base = BigInt(from)
    for (const char of intStr) {
        acc = acc * base + BigInt(charToValue(char))
    }
    return acc
}

/** 非负 BigInt 转目标进制字符串 */
function bigIntToBase(value: bigint, to: number): string {
    if (value === 0n) return '0'
    const base = BigInt(to)
    let v = value
    let result = ''
    while (v > 0n) {
        result = DIGITS[Number(v % base)] + result
        v = v / base
    }
    return result
}

/**
 * 任意进制互转（2-36）。
 * @param input 输入数字（支持负号与小数点，如 "-3.5"、"FF"）
 * @param from 源进制
 * @param to 目标进制
 * @returns 目标进制数字字符串（字母大写；小数最多保留 20 位，去除尾随零）
 */
export function convertBase(input: string, from: number, to: number): string {
    assertBase(from)
    assertBase(to)
    const text = String(input).trim()
    // 防御性上限检查（组件侧已先拦截并提示；直接调用库时同样生效）
    if (text.length > MAX_BASE_INPUT_LENGTH) {
        throw new Error('输入超过 ' + MAX_BASE_INPUT_LENGTH + ' 字符上限：' + text.length)
    }
    if (!isValidForBase(text, from)) {
        throw new Error('输入不是合法的 ' + from + ' 进制数字：' + input)
    }

    const negative = text.startsWith('-')
    const unsigned = negative ? text.slice(1) : text
    const dotIndex = unsigned.indexOf('.')
    const intStr = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex)
    const fracStr = dotIndex === -1 ? '' : unsigned.slice(dotIndex + 1)

    // 分数表示法：value = num / den = 整数部分 / from^n + 小数部分 / from^n
    const n = fracStr.length
    const fromBig = BigInt(from)
    const den = fromBig ** BigInt(n)
    let num = parseIntegerToBigInt(intStr, from) * den
    if (n > 0) {
        num += parseIntegerToBigInt(fracStr, from)
    }

    // 整数部分：num 除以 den 的商（负号已提前剥离，num/den 必为非负）
    const intValue = num / den
    let remainder = num - intValue * den // 非负余数

    const intOut = bigIntToBase(intValue, to)

    // 小数部分：乘基取整，最多 20 位
    let fracOut = ''
    const toBig = BigInt(to)
    for (let i = 0; i < 20 && remainder !== 0n; i++) {
        remainder *= toBig
        const digit = remainder / den
        fracOut += DIGITS[Number(digit)]
        remainder -= digit * den
    }
    // 去除尾随零
    fracOut = fracOut.replace(/0+$/, '')

    let result = intOut
    if (fracOut !== '') {
        result += '.' + fracOut
    }
    // 负号：输入为负且结果非零（"-0" 输出 "0"）
    if (negative && result !== '0') {
        result = '-' + result
    }
    return result
}
