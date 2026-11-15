// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

import {
    cmykToRgb,
    hexToRgb,
    hslToRgb,
    hsvToRgb,
    parseRgbInput,
    rgbToCmyk,
    rgbToHex,
    rgbToHsl,
    rgbToHsv,
    type RgbColor
} from '@renderer/components/PluginTools/Convert/color-lib'
import { convertLength, convertStorage } from '@renderer/components/PluginTools/Convert/unit-lib'
import { rmbToUpper } from '@renderer/components/PluginTools/Convert/rmb-lib'
import {
    localToTimestamp,
    timestampToLocal
} from '@renderer/components/PluginTools/Convert/timestamp-lib'
import {
    convertBase,
    isValidForBase,
    MAX_BASE_INPUT_LENGTH
} from '@renderer/components/PluginTools/Convert/base-lib'

/** 断言 RGB 分量逐项在容差内 */
function expectRgbClose(actual: RgbColor, expected: RgbColor, tolerance = 1): void {
    expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(tolerance)
}

describe('color-lib 颜色转换', () => {
    const samples: RgbColor[] = [
        { r: 255, g: 128, b: 0 },
        { r: 0, g: 255, b: 255 },
        { r: 13, g: 27, b: 190 },
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 },
        { r: 123, g: 45, b: 67 }
    ]

    it('HEX 解析支持 6 位形式', () => {
        expect(hexToRgb('#FF8000')).toEqual({ r: 255, g: 128, b: 0 })
        expect(hexToRgb('FF8000')).toEqual({ r: 255, g: 128, b: 0 })
    })

    it('HEX 解析支持 3 位缩写形式', () => {
        expect(hexToRgb('#F00')).toEqual({ r: 255, g: 0, b: 0 })
        expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 })
    })

    it('HEX 解析支持 8 位 RGBA 形式（忽略透明度）', () => {
        expect(hexToRgb('#FF8000AA')).toEqual({ r: 255, g: 128, b: 0 })
    })

    it('HEX 非法输入抛错', () => {
        expect(() => hexToRgb('xyz')).toThrow()
        expect(() => hexToRgb('#12345')).toThrow()
    })

    it('RGB → HEX → RGB 往返', () => {
        for (const rgb of samples) {
            const hex = rgbToHex(rgb)
            expect(hex).toMatch(/^#[0-9A-F]{6}$/)
            expectRgbClose(hexToRgb(hex), rgb)
        }
    })

    it('RGB → HSV → RGB 往返（容差 ±1）', () => {
        for (const rgb of samples) {
            const hsv = rgbToHsv(rgb)
            expect(hsv.h).toBeGreaterThanOrEqual(0)
            expect(hsv.h).toBeLessThan(360)
            expect(hsv.s).toBeGreaterThanOrEqual(0)
            expect(hsv.s).toBeLessThanOrEqual(100)
            expect(hsv.v).toBeGreaterThanOrEqual(0)
            expect(hsv.v).toBeLessThanOrEqual(100)
            expectRgbClose(hsvToRgb(hsv), rgb)
        }
    })

    it('RGB → HSL → RGB 往返（容差 ±1）', () => {
        for (const rgb of samples) {
            const hsl = rgbToHsl(rgb)
            expect(hsl.h).toBeGreaterThanOrEqual(0)
            expect(hsl.h).toBeLessThan(360)
            expectRgbClose(hslToRgb(hsl), rgb)
        }
    })

    it('RGB → CMYK → RGB 往返（容差 ±1，修正 cmyk2rgb 全分量 /100）', () => {
        for (const rgb of samples) {
            const cmyk = rgbToCmyk(rgb)
            expect(cmyk.k).toBeGreaterThanOrEqual(0)
            expect(cmyk.k).toBeLessThanOrEqual(100)
            expectRgbClose(cmykToRgb(cmyk), rgb)
        }
    })

    it('HEX → HSV → RGB → HEX 往返', () => {
        for (const hex of ['#FF8000', '#00FFFF', '#123456']) {
            const hsv = rgbToHsv(hexToRgb(hex))
            const back = rgbToHex(hsvToRgb(hsv))
            // HSV 量化误差容差：比较每个分量差值 ≤1（hex 两位精度）
            const a = hexToRgb(hex)
            const b = hexToRgb(back)
            expectRgbClose(a, b)
        }
    })

    it('RGB 边界值 0/255', () => {
        expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 })
        expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, v: 100 })
        expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
        expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#FFFFFF')
        // 越界分量夹取
        expect(rgbToHex({ r: 300, g: -5, b: 128 })).toBe('#FF0080')
    })

    it('CMYK 边界：纯黑与纯白', () => {
        expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 })
        expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 })
    })

    it('RGB 输入支持逗号与其他分隔形式', () => {
        expect(parseRgbInput('255,0,0')).toEqual({ r: 255, g: 0, b: 0 })
        expect(parseRgbInput('255, 0, 0')).toEqual({ r: 255, g: 0, b: 0 })
        expect(parseRgbInput('rgb(255,0,0)')).toEqual({ r: 255, g: 0, b: 0 })
        expect(parseRgbInput('255 0 0')).toEqual({ r: 255, g: 0, b: 0 })
        expect(parseRgbInput('abc')).toBeNull()
        expect(parseRgbInput('')).toBeNull()
    })
})

describe('unit-lib 单位换算', () => {
    it('长度已知值', () => {
        expect(convertLength(1, 'km', 'm')).toBeCloseTo(1000, 10)
        expect(convertLength(1, 'mile', 'm')).toBeCloseTo(1609.344, 10)
        expect(convertLength(1, 'inch', 'cm')).toBeCloseTo(2.54, 10)
        expect(convertLength(1, 'li3', 'm')).toBeCloseTo(500, 10)
        expect(convertLength(1, 'zhang', 'm')).toBeCloseTo(3.3333, 10)
        expect(convertLength(1, 'pt', 'inch')).toBeCloseTo(1 / 72, 10)
        expect(convertLength(1, 'px', 'inch')).toBeCloseTo(1 / 96, 10)
    })

    it('长度反向换算与单位一致', () => {
        expect(convertLength(1000, 'm', 'km')).toBeCloseTo(1, 10)
        expect(convertLength(2.54, 'cm', 'inch')).toBeCloseTo(1, 10)
    })

    it('存储二进制 1024 制（IEC 命名）', () => {
        expect(convertStorage(1, 'MiB', 'KiB', false)).toBeCloseTo(1024, 10)
        expect(convertStorage(1, 'GiB', 'MiB', false)).toBeCloseTo(1024, 10)
        expect(convertStorage(1, 'KiB', 'B', false)).toBeCloseTo(1024, 10)
    })

    it('存储 SI 十进制 1000 制', () => {
        expect(convertStorage(1, 'GB', 'MB', true)).toBeCloseTo(1000, 10)
        expect(convertStorage(1, 'KB', 'B', true)).toBeCloseTo(1000, 10)
        expect(convertStorage(1, 'TB', 'GB', true)).toBeCloseTo(1000, 10)
    })

    it('存储普通 key 在 si=false 时按 1024 制', () => {
        expect(convertStorage(1, 'KB', 'B', false)).toBeCloseTo(1024, 10)
        expect(convertStorage(1024, 'B', 'KB', false)).toBeCloseTo(1, 10)
    })

    it('存储二进制与 SI 可互转（跨制式）', () => {
        // 1 MiB = 1048576 B = 1.048576 MB（SI）
        expect(convertStorage(1, 'MiB', 'MB', true)).toBeCloseTo(1.048576, 10)
        expect(convertStorage(1, 'MiB', 'KB', true)).toBeCloseTo(1048.576, 10)
    })

    it('非法单位抛错', () => {
        expect(() => convertLength(1, 'foo' as never, 'm')).toThrow()
        expect(() => convertStorage(1, 'XX', 'KB', false)).toThrow()
        expect(() => convertStorage(NaN, 'B', 'KB', false)).toThrow()
    })
})

describe('rmb-lib 人民币大写', () => {
    it('角分处理：100.5 → 壹佰元伍角', () => {
        expect(rmbToUpper(100.5)).toBe('壹佰元伍角')
    })

    it('整数结尾：100000 → 壹拾万元整', () => {
        expect(rmbToUpper(100000)).toBe('壹拾万元整')
    })

    it('纯小数：0.05 → 零元伍分', () => {
        expect(rmbToUpper(0.05)).toBe('零元伍分')
    })

    it('亿级：100000000 → 壹亿元整', () => {
        expect(rmbToUpper(100000000)).toBe('壹亿元整')
    })

    it('负数：-100 → 负壹佰元整', () => {
        expect(rmbToUpper(-100)).toBe('负壹佰元整')
        expect(rmbToUpper('-100')).toBe('负壹佰元整')
    })

    it('角分组合与补零', () => {
        expect(rmbToUpper(100.53)).toBe('壹佰元伍角叁分')
        expect(rmbToUpper(100.05)).toBe('壹佰元零伍分')
        expect(rmbToUpper(0)).toBe('零元整')
    })

    it('中间全零组补零：100000001 → 壹亿零壹元整', () => {
        expect(rmbToUpper(100000001)).toBe('壹亿零壹元整')
    })

    it('组内零压缩：1001 → 壹仟零壹元整', () => {
        expect(rmbToUpper(1001)).toBe('壹仟零壹元整')
        expect(rmbToUpper(101)).toBe('壹佰零壹元整')
    })

    it('千分位逗号字符串输入', () => {
        expect(rmbToUpper('1,000.5')).toBe('壹仟元伍角')
    })

    it('P2 边界：>2^53 整数按字符串精确转换（不再浮点舍入出错）', () => {
        // 2^53 + 1：Number 无法精确表示（会舍入为 9007199254740992），字符串输入必须精确
        expect(rmbToUpper('9007199254740993')).toBe(
            '玖仟零柒兆壹仟玖佰玖拾贰亿伍仟肆佰柒拾肆万玖佰玖拾叁元整'
        )
        // number 字面量在解析期已损失精度（9007199254740992），结果与 String(num) 一致，
        // 保证「字符串走精确路径、数字走 String 语义」两条路径行为自洽
        // （BigInt → Number 转换与数字字面量解析期的舍入一致，避免直接写字面量触发 lint 精度告警）
        const roundedAsNumber = Number(9007199254740993n)
        expect(roundedAsNumber).toBe(9007199254740992)
        expect(rmbToUpper(roundedAsNumber)).toBe(rmbToUpper(String(roundedAsNumber)))
        expect(rmbToUpper('9007199254740992')).toBe(
            '玖仟零柒兆壹仟玖佰玖拾贰亿伍仟肆佰柒拾肆万玖佰玖拾贰元整'
        )
        // 超大整数（>10^21，历史实现会因 toFixed 指数形式直接拒绝）
        expect(rmbToUpper('12345678901234567890123')).toBe(
            '壹佰贰拾叁垓肆仟伍佰陆拾柒京捌仟玖佰零壹兆贰仟叁佰肆拾伍亿陆仟柒佰捌拾玖万壹佰贰拾叁元整'
        )
    })

    it('P2 边界：小数四舍五入走字符串十进制运算（含进位到整数部分）', () => {
        expect(rmbToUpper('100.999')).toBe('壹佰零壹元整')
        expect(rmbToUpper('100.994')).toBe('壹佰元玖角玖分')
        expect(rmbToUpper('0.005')).toBe('零元壹分')
        expect(rmbToUpper('0.004')).toBe('零元整')
        // 进位作用于超长整数（2^53+1 的整数部分 + 0.999 进位）
        expect(rmbToUpper('9007199254740993.999')).toBe(
            '玖仟零柒兆壹仟玖佰玖拾贰亿伍仟肆佰柒拾肆万玖佰玖拾肆元整'
        )
        // 前导零整数按历史 Number 语义解析
        expect(rmbToUpper('007')).toBe('柒元整')
    })

    it('超出 9 组大单位支持范围抛错', () => {
        // 37 位数字 → 10 个 4 位组，超过 BIG_UNITS 的 9 组上限
        expect(() => rmbToUpper('1' + '0'.repeat(36))).toThrow()
    })

    it('非法输入抛错', () => {
        expect(() => rmbToUpper('abc')).toThrow()
        expect(() => rmbToUpper(NaN)).toThrow()
        expect(() => rmbToUpper(Infinity)).toThrow()
        expect(() => rmbToUpper('1e3')).toThrow()
    })
})

describe('timestamp-lib 时间戳转换', () => {
    it('时间戳 → 本地时间格式（YYYY-MM-DD HH:mm:ss）', () => {
        const result = timestampToLocal(1700000000, false)
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
        // 与本地 Date 拼接结果一致
        const date = new Date(1700000000 * 1000)
        const expected =
            date.getFullYear() +
            '-' +
            String(date.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(date.getDate()).padStart(2, '0') +
            ' ' +
            String(date.getHours()).padStart(2, '0') +
            ':' +
            String(date.getMinutes()).padStart(2, '0') +
            ':' +
            String(date.getSeconds()).padStart(2, '0')
        expect(result).toBe(expected)
    })

    it('本地时间往返：1700000000 秒 → 本地时间 → 时间戳', () => {
        const local = timestampToLocal(1700000000, false)
        expect(localToTimestamp(local, false)).toBe(1700000000)
    })

    it('秒/毫秒切换', () => {
        // 毫秒级时间戳转本地时间与秒级结果一致（123ms 被截断到秒）
        expect(timestampToLocal(1700000000123, true)).toBe(timestampToLocal(1700000000, false))
        // 同一字符串在秒/毫秒单位下的时间戳关系
        const str = '2023-11-15 10:30:45'
        expect(localToTimestamp(str, false)).toBe(Math.floor(localToTimestamp(str, true) / 1000))
    })

    it('本地时间解析与 Date 构造一致（本地时区）', () => {
        const str = '2023-11-15 10:30:45'
        expect(localToTimestamp(str, true)).toBe(new Date(2023, 10, 15, 10, 30, 45).getTime())
    })

    it('支持省略秒/时间的宽松格式', () => {
        expect(localToTimestamp('2023-11-15', false)).toBe(
            Math.floor(new Date(2023, 10, 15, 0, 0, 0).getTime() / 1000)
        )
        expect(localToTimestamp('2023-11-15 08:30', true)).toBe(
            new Date(2023, 10, 15, 8, 30, 0).getTime()
        )
    })

    it('非法输入抛错', () => {
        expect(() => localToTimestamp('abc', false)).toThrow()
        expect(() => localToTimestamp('2023-02-30 10:00:00', false)).toThrow()
        expect(() => localToTimestamp('2023-13-01 10:00:00', false)).toThrow()
        expect(() => localToTimestamp('2023-01-01 25:00:00', false)).toThrow()
        expect(() => timestampToLocal(1.5, false)).toThrow()
        expect(() => timestampToLocal('abc' as never, false)).toThrow()
    })
})

describe('base-lib 进制转换', () => {
    it('十进制 255 → 十六进制 FF', () => {
        expect(convertBase('255', 10, 16)).toBe('FF')
    })

    it('十六进制 FF → 二进制 11111111', () => {
        expect(convertBase('FF', 16, 2)).toBe('11111111')
    })

    it('小数转换：十进制 3.5 → 二进制 11.1', () => {
        expect(convertBase('3.5', 10, 2)).toBe('11.1')
    })

    it('负数与零', () => {
        expect(convertBase('-3.5', 10, 2)).toBe('-11.1')
        expect(convertBase('-255', 10, 16)).toBe('-FF')
        expect(convertBase('0', 10, 2)).toBe('0')
        expect(convertBase('-0', 10, 2)).toBe('0')
    })

    it('十进制与八进制/二进制互转', () => {
        expect(convertBase('255', 10, 8)).toBe('377')
        expect(convertBase('377', 8, 10)).toBe('255')
        expect(convertBase('11111111', 2, 10)).toBe('255')
        expect(convertBase('FF', 16, 10)).toBe('255')
    })

    it('小数按乘基取整（20 位精度内）', () => {
        expect(convertBase('0.1', 10, 2)).toBe('0.00011001100110011001')
        expect(convertBase('0.5', 10, 2)).toBe('0.1')
        expect(convertBase('0.5', 10, 16)).toBe('0.8')
    })

    it('大整数用 BigInt 精确计算', () => {
        expect(convertBase('FFFFFFFFFFFFFFFF', 16, 10)).toBe('18446744073709551615')
        expect(convertBase('18446744073709551615', 10, 16)).toBe('FFFFFFFFFFFFFFFF')
    })

    it('36 进制字母映射', () => {
        expect(convertBase('Z', 36, 10)).toBe('35')
        expect(convertBase('35', 10, 36)).toBe('Z')
        expect(convertBase('z', 36, 10)).toBe('35') // 小写输入
    })

    it('isValidForBase 非法字符与结构校验', () => {
        expect(isValidForBase('12Z', 10)).toBe(false)
        expect(isValidForBase('1A', 16)).toBe(true)
        expect(isValidForBase('FF', 2)).toBe(false)
        expect(isValidForBase('1.5.5', 10)).toBe(false)
        expect(isValidForBase('', 10)).toBe(false)
        expect(isValidForBase('-', 10)).toBe(false)
        expect(isValidForBase('-3.5', 10)).toBe(true)
        expect(isValidForBase('abc', 37)).toBe(false)
    })

    it('非法输入与非法进制抛错', () => {
        expect(() => convertBase('2', 2, 10)).toThrow()
        expect(() => convertBase('abc', 10, 16)).toThrow()
        expect(() => convertBase('10', 1, 10)).toThrow()
        expect(() => convertBase('10', 10, 37)).toThrow()
    })

    it('P2 边界：超过 10000 字符上限拒绝转换（防巨大指数运算冻结 UI）', () => {
        const oversized = '1'.repeat(MAX_BASE_INPUT_LENGTH + 1)
        expect(isValidForBase(oversized, 10)).toBe(false)
        expect(() => convertBase(oversized, 10, 2)).toThrow()
        // 上限内仍可正常转换
        const withinLimit = '1'.repeat(MAX_BASE_INPUT_LENGTH)
        expect(isValidForBase(withinLimit, 2)).toBe(true)
    })
})
