// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

import {
    generatePassword,
    generateRandomNumbers,
    generateRandomString,
    randomColorHsv,
    PASSWORD_DIGITS,
    PASSWORD_LOWER,
    PASSWORD_UPPER
} from '@renderer/components/PluginTools/MiscTools/random-lib'
import { evaluateExpression } from '@renderer/components/PluginTools/MiscTools/calculator-lib'

describe('random-lib 密码生成', () => {
    it('生成指定长度（夹取到 4-128）', () => {
        expect(
            generatePassword(16, {
                uppercase: true,
                lowercase: true,
                numbers: true,
                symbols: false
            })
        ).toHaveLength(16)
        expect(
            generatePassword(2, { uppercase: true, lowercase: true, numbers: true, symbols: false })
        ).toHaveLength(4)
        expect(
            generatePassword(200, {
                uppercase: true,
                lowercase: true,
                numbers: true,
                symbols: false
            })
        ).toHaveLength(128)
    })

    it('密码包含所选的全部字符集', () => {
        const password = generatePassword(16, {
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: true
        })
        expect(password).toMatch(/[A-Z]/)
        expect(password).toMatch(/[a-z]/)
        expect(password).toMatch(/[0-9]/)
        expect(password).toMatch(/[^A-Za-z0-9]/)
    })

    it('密码只含所选字符集（不混入未勾选的符号）', () => {
        const password = generatePassword(32, {
            uppercase: true,
            lowercase: false,
            numbers: true,
            symbols: false
        })
        expect(password).toMatch(/^[A-Z0-9]+$/)
    })

    it('全部未勾选时回退为小写字母', () => {
        const password = generatePassword(8, {
            uppercase: false,
            lowercase: false,
            numbers: false,
            symbols: false
        })
        expect(password).toMatch(/^[a-z]+$/)
    })

    it('确定性随机源：每类字符集保证至少出现一次', () => {
        const random = () => 0
        const password = generatePassword(
            8,
            { uppercase: true, lowercase: true, numbers: true, symbols: true },
            random
        )
        expect(password).toHaveLength(8)
        expect(password).toMatch(/[A-Z]/)
        expect(password).toMatch(/[a-z]/)
        expect(password).toMatch(/[0-9]/)
        expect(password).toMatch(/[^A-Za-z0-9]/)
        // random()=0 时所有字符都取自各字符集的第一个字符
        const allFirstChars = new Set([
            PASSWORD_UPPER[0],
            PASSWORD_LOWER[0],
            PASSWORD_DIGITS[0],
            '!'
        ])
        for (const char of password) {
            expect(allFirstChars.has(char)).toBe(true)
        }
    })
})

describe('random-lib 随机字符串', () => {
    it('生成指定长度且仅含指定字符集', () => {
        const result = generateRandomString(10, 'abc')
        expect(result).toHaveLength(10)
        expect(result).toMatch(/^[abc]{10}$/)
    })

    it('空字符集抛错', () => {
        expect(() => generateRandomString(10, '')).toThrow()
    })

    it('确定性随机源可注入', () => {
        expect(generateRandomString(5, 'ab', () => 0)).toBe('aaaaa')
        expect(generateRandomString(4, 'ab', () => 0.999999)).toBe('bbbb')
    })
})

describe('random-lib 随机数', () => {
    it('数量与范围正确', () => {
        const numbers = generateRandomNumbers(1, 100, 10)
        expect(numbers).toHaveLength(10)
        for (const n of numbers) {
            expect(n).toBeGreaterThanOrEqual(1)
            expect(n).toBeLessThanOrEqual(100)
        }
    })

    it('Set 去重：结果无重复', () => {
        const numbers = generateRandomNumbers(1, 1000, 100)
        expect(new Set(numbers).size).toBe(100)
    })

    it('范围不足数量时抛错', () => {
        expect(() => generateRandomNumbers(1, 5, 10)).toThrow()
    })

    it('min > max 抛错', () => {
        expect(() => generateRandomNumbers(5, 1, 3)).toThrow()
    })

    it('范围夹取到 ±1e9', () => {
        const numbers = generateRandomNumbers(-2e9, 2e9, 10)
        for (const n of numbers) {
            expect(n).toBeGreaterThanOrEqual(-1e9)
            expect(n).toBeLessThanOrEqual(1e9)
        }
    })
})

describe('random-lib 随机颜色', () => {
    it('hue 在 0-360 均匀范围，HEX/RGB 双格式输出', () => {
        const color = randomColorHsv()
        expect(color.h).toBeGreaterThanOrEqual(0)
        expect(color.h).toBeLessThan(360)
        expect(color.s).toBeGreaterThanOrEqual(0)
        expect(color.s).toBeLessThanOrEqual(100)
        expect(color.v).toBeGreaterThanOrEqual(0)
        expect(color.v).toBeLessThanOrEqual(100)
        expect(color.hex).toMatch(/^#[0-9A-F]{6}$/)
        expect(color.rgb).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/)
        // HEX 与 RGB 双格式互相一致
        const [r, g, b] = color.rgb.split(',').map(Number)
        expect(color.hex).toBe(
            '#' +
                [r, g, b]
                    .map((n) => n.toString(16).padStart(2, '0'))
                    .join('')
                    .toUpperCase()
        )
    })

    it('固定饱和度/亮度模式', () => {
        const color = randomColorHsv(() => 0.5, { s: 80, v: 90 })
        expect(color.s).toBe(80)
        expect(color.v).toBe(90)
    })

    it('确定性随机源：hue 由注入源决定', () => {
        expect(randomColorHsv(() => 0, { s: 50, v: 60 }).h).toBe(0)
        // random()=1 时 floor(1*360)=360 → 由 Math.floor 得到 360 会超出范围？
        // 注入 0.999999 避免边界；hue=359
        expect(randomColorHsv(() => 0.999999, { s: 50, v: 60 }).h).toBe(359)
    })
})

describe('calculator-lib 表达式求值', () => {
    it('四则运算优先级：2+3*4 = 14', () => {
        expect(evaluateExpression('2+3*4')).toBe(14)
    })

    it('括号嵌套：(1+2)*3 = 9', () => {
        expect(evaluateExpression('(1+2)*3')).toBe(9)
    })

    it('小数运算：2.5*4 = 10', () => {
        expect(evaluateExpression('2.5*4')).toBe(10)
    })

    it('乘方右结合：2^3^2 = 512', () => {
        expect(evaluateExpression('2^3^2')).toBe(512)
    })

    it('取余：5%3 = 2', () => {
        expect(evaluateExpression('5%3')).toBe(2)
    })

    it('一元负号：-5+3 = -2', () => {
        expect(evaluateExpression('-5+3')).toBe(-2)
        expect(evaluateExpression('2*-3')).toBe(-6)
    })

    it('复合表达式：(1+2)*(3-1) = 6', () => {
        expect(evaluateExpression('(1+2)*(3-1)')).toBe(6)
    })

    it('除零报错', () => {
        expect(() => evaluateExpression('1/0')).toThrow()
        expect(() => evaluateExpression('3%0')).toThrow()
    })

    it('括号不匹配报错', () => {
        expect(() => evaluateExpression('(1+2')).toThrow()
        expect(() => evaluateExpression('1+2)')).toThrow()
        expect(() => evaluateExpression(')1+2(')).toThrow()
    })

    it('非法表达式报错', () => {
        expect(() => evaluateExpression('')).toThrow()
        expect(() => evaluateExpression('abc')).toThrow()
        expect(() => evaluateExpression('2+*3')).toThrow()
        expect(() => evaluateExpression('1+')).toThrow()
        expect(() => evaluateExpression('2 3')).toThrow()
    })

    it('浮点容差：0.1+0.2 ≈ 0.3', () => {
        expect(evaluateExpression('0.1+0.2')).toBeCloseTo(0.3, 10)
    })
})
