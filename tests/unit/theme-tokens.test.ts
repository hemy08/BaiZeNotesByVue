/**
 * 语义令牌派生单元测试（视觉升级 P0 / T1）
 *
 * 覆盖点：
 * 1. 颜色工具：hex(#rgb/#rgba/#rrggbb/#rrggbbaa)/rgb()/rgba() 解析、非法值返回 null、
 *    hex/rgba 格式化、加深/提亮/alpha/混合、相对亮度/对比度/深色判定；
 * 2. 派生规则（方案 §5.1）：baize 浅色主题逐项期望值、深色/护眼分组状态色切换；
 * 3. 非法色值兜底：任意非法输入下 18 个令牌仍全部是合法 CSS 颜色（不产出 undefined/空串）；
 * 4. 映射表：18 个令牌 ↔ 18 个 `--ui-*` 变量，键/变量名不重复，与旧 `--theme-*` 前缀不冲突；
 * 5. 纯函数：重复调用结果稳定、不修改入参；
 * 6. 主题分组判定：护眼优先、背景亮度优先（修正 baize-text / forest 历史归属偏差）。
 */
import { describe, it, expect } from 'vitest'
import {
    buildSemanticCssVariables,
    buildSemanticTokens,
    contrastRatio,
    darkenColor,
    formatCssColor,
    formatHex,
    isDarkColor,
    lightenColor,
    mixColor,
    normalizeColor,
    parseColor,
    relativeLuminance,
    resolveSemanticThemeGroup,
    SEMANTIC_STATUS_COLORS,
    SEMANTIC_TOKEN_CSS_BINDINGS,
    SEMANTIC_TOKEN_CSS_PREFIX,
    SEMANTIC_TOKEN_KEYS,
    SEMANTIC_TOKEN_RULES,
    withAlphaColor,
    type SemanticTokenSource
} from '../../src/shared/theme-tokens'

/** 默认 baize 主题配色（派生期望值的基线样本） */
const BAIZE: SemanticTokenSource = {
    backgroundColor: '#f5f0ff',
    cardBackground: '#ffffff',
    textColor: '#2d2d2d',
    secondaryTextColor: '#666666',
    borderColor: '#e0d4f0',
    accentColor: '#764ba2',
    hoverBackground: '#f0e8ff'
}

/** 深色主题样本（deepdark 配色） */
const DEEPDARK: SemanticTokenSource = {
    backgroundColor: '#000000',
    cardBackground: '#121212',
    textColor: '#ffffff',
    secondaryTextColor: '#aaaaaa',
    borderColor: '#333333',
    accentColor: '#bb86fc',
    hoverBackground: '#1f1f1f'
}

/** 护眼主题样本（eyecare-green 配色） */
const EYECARE_GREEN: SemanticTokenSource = {
    backgroundColor: '#e8f5e9',
    cardBackground: '#f1f8f2',
    textColor: '#2e4a2f',
    secondaryTextColor: '#5a7a5b',
    borderColor: '#c8e6c9',
    accentColor: '#4caf50',
    hoverBackground: '#d4edda'
}

/** 断言值是可解析的颜色（hex / rgb() / rgba()） */
function expectCssColor(value: string): void {
    expect(typeof value).toBe('string')
    expect(value.length).toBeGreaterThan(0)
    expect(value).not.toContain('undefined')
    expect(value).not.toContain('NaN')
    const parsed = parseColor(value)
    expect(parsed, `不是合法 CSS 颜色: ${value}`).not.toBeNull()
}

describe('颜色工具：parseColor', () => {
    it('解析 #rgb / #rrggbb（不区分大小写、允许首尾空白）', () => {
        expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
        expect(parseColor('  #FF0000  ')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
        expect(parseColor('#123456')).toEqual({ r: 0x12, g: 0x34, b: 0x56, a: 1 })
    })

    it('解析 #rgba / #rrggbbaa（alpha 归一化到 0~1）', () => {
        expect(parseColor('#ffff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
        const halfAlpha = parseColor('#ff000080')
        expect(halfAlpha?.r).toBe(255)
        expect(halfAlpha?.a).toBeCloseTo(128 / 255, 3)
    })

    it('解析 rgb() / rgba() 函数式颜色', () => {
        expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
        expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 })
        expect(parseColor('RGBA(255,255,255,0)')).toEqual({ r: 255, g: 255, b: 255, a: 0 })
        // 越界通道/alpha 钳制，不抛异常
        expect(parseColor('rgb(300, -5, 3)')).toEqual({ r: 255, g: 0, b: 3, a: 1 })
        expect(parseColor('rgba(1, 2, 3, 9)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    })

    it('非法输入一律返回 null（不把命名色/渐变/变量引用当颜色）', () => {
        const invalidInputs: unknown[] = [
            undefined,
            null,
            42,
            {},
            '',
            '   ',
            'red',
            'transparent',
            '#12345',
            '#1234567',
            '#gggggg',
            'rgb(1, 2)',
            'rgba(1,2,3)',
            'hsl(0, 0%, 0%)',
            'var(--accent-color)',
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        ]
        for (const input of invalidInputs) {
            expect(parseColor(input), String(input)).toBeNull()
        }
    })
})

describe('颜色工具：格式化/加深/提亮/alpha/混合', () => {
    it('formatHex 丢弃 alpha 并统一小写两位十六进制；formatCssColor 保留 alpha', () => {
        expect(formatHex({ r: 255, g: 0, b: 16, a: 1 })).toBe('#ff0010')
        expect(formatCssColor({ r: 1, g: 2, b: 3, a: 1 })).toBe('#010203')
        expect(formatCssColor({ r: 1, g: 2, b: 3, a: 0.5 })).toBe('rgba(1, 2, 3, 0.5)')
    })

    it('darkenColor：按比例降低每个通道；比例钳制 0~1；非法色值回落兜底', () => {
        expect(darkenColor('#ffffff', 0.08)).toBe('#ebebeb')
        expect(darkenColor('#ffffff', 0)).toBe('#ffffff')
        expect(darkenColor('#ffffff', 2)).toBe('#000000')
        expect(darkenColor('#808080', -1)).toBe('#808080')
        expect(darkenColor('not-a-color', 0.5, '#ff0000')).toBe('#ff0000')
    })

    it('lightenColor：按比例向白色混合', () => {
        expect(lightenColor('#000000', 0.5)).toBe('#808080')
        expect(lightenColor('#000000', 0)).toBe('#000000')
        expect(lightenColor('#123456', 1)).toBe('#ffffff')
        expect(lightenColor('bad', 0.5, '#00ff00')).toBe('#00ff00')
    })

    it('withAlphaColor：输出 rgba()，alpha 钳制 0~1', () => {
        expect(withAlphaColor('#764ba2', 0.12)).toBe('rgba(118, 75, 162, 0.12)')
        expect(withAlphaColor('#764ba2', 2)).toBe('rgba(118, 75, 162, 1)')
        expect(withAlphaColor('#764ba2', -1)).toBe('rgba(118, 75, 162, 0)')
        expect(withAlphaColor('bad', 0.3, '#000000')).toBe('rgba(0, 0, 0, 0.3)')
    })

    it('mixColor：线性混合，ratio 0/1 分别返回起止色', () => {
        expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000')
        expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff')
        expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080')
        // 三级文字派生：secondary 向背景混合 20% 后对比度下降（浅底更浅）
        const tertiary = mixColor('#666666', '#ffffff', 0.2)
        expect(tertiary).toBe('#858585')
        expect(contrastRatio(tertiary, '#ffffff')).toBeLessThan(
            contrastRatio('#666666', '#ffffff') as number
        )
    })
})

describe('颜色工具：亮度/对比度/深色判定', () => {
    it('relativeLuminance：纯黑 0 / 纯白 1 / 非法 null', () => {
        expect(relativeLuminance('#000000')).toBe(0)
        expect(relativeLuminance('#ffffff')).toBe(1)
        expect(relativeLuminance('bad')).toBeNull()
    })

    it('contrastRatio：黑白 21:1、同色 1:1、非法 null', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
        expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5)
        expect(contrastRatio('bad', '#ffffff')).toBeNull()
    })

    it('isDarkColor：亮度 < 0.4 判深色，非法按浅色处理', () => {
        expect(isDarkColor('#000000')).toBe(true)
        expect(isDarkColor('#1a1625')).toBe(true)
        expect(isDarkColor('#ffffff')).toBe(false)
        expect(isDarkColor('bad')).toBe(false)
    })

    it('normalizeColor：可解析值归一化小写 hex，非法值回落兜底色', () => {
        expect(normalizeColor('#FFF')).toBe('#ffffff')
        expect(normalizeColor('rgb(1, 2, 3)')).toBe('#010203')
        expect(normalizeColor('bad')).toBe('#000000')
        expect(normalizeColor(null, '#abcdef')).toBe('#abcdef')
    })
})

describe('语义令牌映射表', () => {
    it('令牌键为 18 项、CSS 变量为 18 项，键与变量均不重复', () => {
        expect(SEMANTIC_TOKEN_KEYS).toHaveLength(18)
        expect(new Set(SEMANTIC_TOKEN_KEYS).size).toBe(18)
        expect(SEMANTIC_TOKEN_CSS_BINDINGS).toHaveLength(18)
        const variables = SEMANTIC_TOKEN_CSS_BINDINGS.map((binding) => binding.cssVariable)
        expect(new Set(variables).size).toBe(18)
        expect([...variables].sort()).toEqual([...new Set(variables)].sort())
    })

    it('全部变量以 --ui- 前缀命名，且不与旧 --theme-* 主变量重名', () => {
        for (const binding of SEMANTIC_TOKEN_CSS_BINDINGS) {
            expect(binding.cssVariable.startsWith(SEMANTIC_TOKEN_CSS_PREFIX)).toBe(true)
            expect(binding.cssVariable.startsWith('--theme-')).toBe(false)
        }
    })

    it('映射表覆盖全部令牌键（无遗漏/无多余）', () => {
        const mappedTokens = SEMANTIC_TOKEN_CSS_BINDINGS.map((binding) => binding.token)
        expect([...mappedTokens].sort()).toEqual([...SEMANTIC_TOKEN_KEYS].sort())
    })
})

describe('buildSemanticTokens：派生规则（方案 §5.1）', () => {
    it('baize 主题逐项符合派生规则', () => {
        const tokens = buildSemanticTokens(BAIZE, 'light')
        expect(tokens.bg).toBe('#f5f0ff')
        expect(tokens.bgElevated).toBe('#ffffff')
        expect(tokens.bgSunken).toBe('#ddd5eb') // hoverBackground #f0e8ff 加深 8%
        expect(tokens.surface).toBe('#ffffff')
        expect(tokens.border).toBe('#e0d4f0')
        expect(tokens.borderStrong).toBe('#cec3dd') // borderColor 加深 8%
        expect(tokens.text).toBe('#2d2d2d')
        expect(tokens.textSecondary).toBe('#666666')
        expect(tokens.textTertiary).toBe('#838285') // secondary 向背景混合 20%
        expect(tokens.accent).toBe('#764ba2')
        expect(tokens.accentSoft).toBe('rgba(118, 75, 162, 0.12)')
        expect(tokens.accentHover).toBe('#68428f') // accent 加深 12%
        expect(tokens.success).toBe(SEMANTIC_STATUS_COLORS.light.success)
        expect(tokens.warning).toBe(SEMANTIC_STATUS_COLORS.light.warning)
        expect(tokens.danger).toBe(SEMANTIC_STATUS_COLORS.light.danger)
        expect(tokens.info).toBe(SEMANTIC_STATUS_COLORS.light.info)
        expect(tokens.focusRing).toBe('rgba(118, 75, 162, 0.3)')
        expect(tokens.selection).toBe('rgba(118, 75, 162, 0.15)')
    })

    it('深色分组：使用深色语义状态色（与浅色一套不同）', () => {
        const tokens = buildSemanticTokens(DEEPDARK, 'dark')
        expect(tokens.success).toBe(SEMANTIC_STATUS_COLORS.dark.success)
        expect(tokens.warning).toBe(SEMANTIC_STATUS_COLORS.dark.warning)
        expect(tokens.danger).toBe(SEMANTIC_STATUS_COLORS.dark.danger)
        expect(tokens.info).toBe(SEMANTIC_STATUS_COLORS.dark.info)
        expect(tokens.danger).not.toBe(SEMANTIC_STATUS_COLORS.light.danger)
        // 深色主题下三级文字更暗（向深背景混合），对比度低于二级文字
        expect(contrastRatio(tokens.textTertiary, tokens.bg)).toBeLessThan(
            contrastRatio(tokens.textSecondary, tokens.bg) as number
        )
    })

    it('护眼分组：沿用浅色语义状态色（护眼主题均为浅底）', () => {
        const tokens = buildSemanticTokens(EYECARE_GREEN, 'eyecare')
        expect(tokens.success).toBe(SEMANTIC_STATUS_COLORS.light.success)
        expect(tokens.danger).toBe(SEMANTIC_STATUS_COLORS.light.danger)
    })

    it('派生常量被真实引用（比例变化会让期望值断言失败）', () => {
        expect(SEMANTIC_TOKEN_RULES.sunkenDarkenRatio).toBe(0.08)
        expect(SEMANTIC_TOKEN_RULES.borderStrongDarkenRatio).toBe(0.08)
        expect(SEMANTIC_TOKEN_RULES.tertiaryMixRatio).toBe(0.2)
        expect(SEMANTIC_TOKEN_RULES.accentSoftAlpha).toBe(0.12)
        expect(SEMANTIC_TOKEN_RULES.accentHoverDarkenRatio).toBe(0.12)
        expect(SEMANTIC_TOKEN_RULES.focusRingAlpha).toBe(0.3)
        expect(SEMANTIC_TOKEN_RULES.selectionAlpha).toBe(0.15)
    })

    it('正文与背景对比度满足 AA 基线（4.5:1）抽样：baize / 深色主题', () => {
        const lightTokens = buildSemanticTokens(BAIZE, 'light')
        expect(contrastRatio(lightTokens.text, lightTokens.bg) as number).toBeGreaterThanOrEqual(
            4.5
        )
        const darkTokens = buildSemanticTokens(DEEPDARK, 'dark')
        expect(contrastRatio(darkTokens.text, darkTokens.bg) as number).toBeGreaterThanOrEqual(4.5)
    })
})

describe('buildSemanticTokens：非法色值兜底与纯函数性', () => {
    it('全部字段非法时仍产出 18 个合法 CSS 颜色（浅色/深色分组各自兜底）', () => {
        const broken: SemanticTokenSource = {
            backgroundColor: '',
            cardBackground: 'not-a-color',
            textColor: 'transparent',
            secondaryTextColor: '#12345',
            borderColor: 'rgb()',
            accentColor: 'hsl(0,0%,0%)',
            hoverBackground: 'undefined'
        }
        for (const group of ['light', 'dark', 'eyecare'] as const) {
            const tokens = buildSemanticTokens(broken, group)
            for (const key of SEMANTIC_TOKEN_KEYS) {
                expectCssColor(tokens[key])
            }
        }
    })

    it('部分字段非法时只回落该字段，合法字段保持原值', () => {
        const tokens = buildSemanticTokens({ ...BAIZE, borderColor: 'bad' }, 'light')
        expect(tokens.border).toBe('#e0e0e0') // 浅色分组兜底边框色
        expect(tokens.bg).toBe(BAIZE.backgroundColor)
        expect(tokens.accent).toBe(BAIZE.accentColor)
    })

    it('重复调用结果稳定，且不修改入参对象', () => {
        const source = { ...BAIZE }
        const first = buildSemanticTokens(source, 'light')
        const second = buildSemanticTokens(source, 'light')
        expect(second).toEqual(first)
        expect(source).toEqual(BAIZE)
    })
})

describe('buildSemanticCssVariables', () => {
    it('生成 18 个 --ui-* 变量，值与令牌一一对应', () => {
        const tokens = buildSemanticTokens(BAIZE, 'light')
        const variables = buildSemanticCssVariables(BAIZE, 'light')
        expect(Object.keys(variables)).toHaveLength(18)
        for (const binding of SEMANTIC_TOKEN_CSS_BINDINGS) {
            expect(variables[binding.cssVariable]).toBe(tokens[binding.token])
        }
        expect(variables['--ui-bg']).toBe('#f5f0ff')
        expect(variables['--ui-accent-soft']).toBe('rgba(118, 75, 162, 0.12)')
        expect(variables['--ui-focus-ring']).toBe('rgba(118, 75, 162, 0.3)')
    })

    it('深色主题的 --ui-* 变量与浅色主题不同（状态色 + 背景派生均变化）', () => {
        const lightVariables = buildSemanticCssVariables(BAIZE, 'light')
        const darkVariables = buildSemanticCssVariables(DEEPDARK, 'dark')
        expect(darkVariables['--ui-bg']).not.toBe(lightVariables['--ui-bg'])
        expect(darkVariables['--ui-success']).not.toBe(lightVariables['--ui-success'])
    })
})

describe('resolveSemanticThemeGroup：主题分组判定', () => {
    it('护眼主题优先判为 eyecare', () => {
        expect(resolveSemanticThemeGroup('eyecare-green', EYECARE_GREEN)).toBe('eyecare')
        expect(
            resolveSemanticThemeGroup('eyecare-amber', {
                ...EYECARE_GREEN,
                backgroundColor: '#000000'
            })
        ).toBe('eyecare')
    })

    it('按表面（cardBackground）亮度判定深/浅：修正 baize-text / forest 的历史归属偏差', () => {
        // baize-text 在 UI 分组中属浅色，但实际为深色底 → 语义色按深色套
        expect(
            resolveSemanticThemeGroup('baize-text', {
                ...BAIZE,
                backgroundColor: '#1a1625',
                cardBackground: '#2d2640'
            })
        ).toBe('dark')
        // forest 在 UI 分组中属深色，但实际为浅色底 → 语义色按浅色套
        expect(
            resolveSemanticThemeGroup('forest', {
                ...BAIZE,
                backgroundColor: '#f5f8f5',
                cardBackground: '#ffffff'
            })
        ).toBe('light')
    })

    it('页面底浅但卡片面深（历史异常快照）→ 按表面判深色，保证状态色对比度', () => {
        // 历史快照：dark（深邃夜空）曾误用 rose 的 backgroundColor #fff0f0（页面底浅）、
        // cardBackground #1a1a2e（表面深），该异常已于 2026-11-27 修复为 #0d0d1a 深色页面底。
        // 本用例保留该合成样本，锁定「表面亮度优先于 isDarkThemeType 分组」的判定顺序：
        // 即便未来再次出现页面底与卡片面异明暗的主题（或历史配置），语义色仍按实际表面选深色套。
        expect(
            resolveSemanticThemeGroup('dark', {
                backgroundColor: '#fff0f0',
                cardBackground: '#1a1a2e',
                textColor: '#e0e0e0',
                secondaryTextColor: '#888888',
                borderColor: '#2a2a4a',
                accentColor: '#4fc3f7',
                hoverBackground: '#252540'
            })
        ).toBe('dark')
    })

    it('表面与页面底色都无法解析时回退 isDarkThemeType 分组口径', () => {
        expect(
            resolveSemanticThemeGroup('deepdark', {
                ...DEEPDARK,
                backgroundColor: 'bad',
                cardBackground: 'bad'
            })
        ).toBe('dark')
        expect(
            resolveSemanticThemeGroup('baize', {
                ...BAIZE,
                backgroundColor: 'bad',
                cardBackground: 'bad'
            })
        ).toBe('light')
        expect(resolveSemanticThemeGroup('deepdark', null)).toBe('dark')
    })
})
