// @vitest-environment jsdom
/**
 * 1.5.7 终端工具（阶段 B）：xterm 主题派生（主题 CSS 变量 → ITheme）。
 *
 * 覆盖：
 * 1. 深色主题：背景/前景/光标/光标强调色/选区 + ANSI 基准色来自 `--ui-*` 令牌；
 * 2. 亮色主题：亮色 ANSI 由提亮改为加深（两种底色上均可读）；
 * 3. 变量缺失 / 非法颜色：省略对应字段（xterm 内置默认兜底），不抛异常、不写死颜色；
 * 4. 候选链兜底（`--ui-bg-sunken` 缺失时回落 `--ui-bg` / `--theme-background-color`）；
 * 5. `readTerminalTheme`：从根元素计算样式读取；非 DOM 环境返回空主题。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    TERMINAL_BRIGHT_COLOR_RATIO,
    TERMINAL_SELECTION_ALPHA,
    TERMINAL_THEME_CSS_VARIABLES,
    buildTerminalTheme,
    readTerminalTheme
} from '../../../src/renderer/src/components/terminal/terminal-theme'
import { darkenColor, lightenColor, mixColor } from '../../../src/shared/theme-tokens'

/** 主题令牌色板（模拟 useTheme 写入根元素的 --ui-* 值） */
const DARK_TOKENS: Record<string, string> = {
    '--ui-bg-sunken': '#1b1b1f',
    '--ui-bg': '#101014',
    '--ui-text': '#e6e6e6',
    '--ui-accent': '#764ba2',
    '--ui-accent-hover': '#67418f',
    '--ui-text-secondary': '#9aa0a6',
    '--ui-text-tertiary': '#777d84',
    '--ui-success': '#66bb6a',
    '--ui-warning': '#ffb74d',
    '--ui-danger': '#ef5350',
    '--ui-info': '#64b5f6',
    '--ui-selection': 'rgba(118, 75, 162, 0.15)'
}

/** 浅色主题色板（背景亮度 > 0.4，走「加深」分支） */
const LIGHT_TOKENS: Record<string, string> = {
    ...DARK_TOKENS,
    '--ui-bg-sunken': '#f7f7f8',
    '--ui-text': '#202124'
}

/** 构造读取函数（未提供的变量返回空串，等价于主题尚未应用） */
function createGetter(tokens: Record<string, string>): (name: string) => string {
    return (name: string) => tokens[name] ?? ''
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('buildTerminalTheme：深色主题派生', () => {
    it('背景/前景/光标/光标强调色/选区全部来自主题令牌', () => {
        const theme = buildTerminalTheme(createGetter(DARK_TOKENS))
        expect(theme.background).toBe('#1b1b1f')
        expect(theme.foreground).toBe('#e6e6e6')
        expect(theme.cursor).toBe('#764ba2')
        expect(theme.cursorAccent).toBe('#1b1b1f')
        // --ui-selection 的透明度（rgba）保真保留
        expect(theme.selectionBackground).toBe('rgba(118, 75, 162, 0.15)')
    })

    it('ANSI 基准色由语义令牌派生：红/绿/黄/蓝 = danger/success/warning/info', () => {
        const theme = buildTerminalTheme(createGetter(DARK_TOKENS))
        expect(theme.red).toBe('#ef5350')
        expect(theme.green).toBe('#66bb6a')
        expect(theme.yellow).toBe('#ffb74d')
        expect(theme.blue).toBe('#64b5f6')
        // 黑/亮黑/白/亮白由文字层级令牌派生
        expect(theme.black).toBe('#777d84')
        expect(theme.brightBlack).toBe('#9aa0a6')
        expect(theme.white).toBe('#e6e6e6')
        expect(theme.brightWhite).toBe(lightenColor('#e6e6e6', TERMINAL_BRIGHT_COLOR_RATIO))
    })

    it('洋红/青为令牌混合派生；亮色 ANSI 在深色底上提亮', () => {
        const theme = buildTerminalTheme(createGetter(DARK_TOKENS))
        expect(theme.magenta).toBe(mixColor('#67418f', '#ef5350', 0.5))
        expect(theme.cyan).toBe(mixColor('#64b5f6', '#66bb6a', 0.5))
        expect(theme.brightRed).toBe(lightenColor('#ef5350', TERMINAL_BRIGHT_COLOR_RATIO))
        expect(theme.brightGreen).toBe(lightenColor('#66bb6a', TERMINAL_BRIGHT_COLOR_RATIO))
        expect(theme.brightYellow).toBe(lightenColor('#ffb74d', TERMINAL_BRIGHT_COLOR_RATIO))
        expect(theme.brightBlue).toBe(lightenColor('#64b5f6', TERMINAL_BRIGHT_COLOR_RATIO))
        expect(theme.brightMagenta).toBe(
            lightenColor(mixColor('#67418f', '#ef5350', 0.5), TERMINAL_BRIGHT_COLOR_RATIO)
        )
        expect(theme.brightCyan).toBe(
            lightenColor(mixColor('#64b5f6', '#66bb6a', 0.5), TERMINAL_BRIGHT_COLOR_RATIO)
        )
    })
})

describe('buildTerminalTheme：浅色主题与兜底链', () => {
    it('浅色底上亮色 ANSI 改为加深（不会白到不可见）', () => {
        const theme = buildTerminalTheme(createGetter(LIGHT_TOKENS))
        expect(theme.background).toBe('#f7f7f8')
        expect(theme.foreground).toBe('#202124')
        expect(theme.brightRed).toBe(darkenColor('#ef5350', TERMINAL_BRIGHT_COLOR_RATIO))
        expect(theme.brightWhite).toBe(darkenColor('#202124', TERMINAL_BRIGHT_COLOR_RATIO))
    })

    it('候选链兜底：--ui-bg-sunken 缺失时依次回落 --ui-bg / --theme-background-color', () => {
        const onlyUiBg = buildTerminalTheme(
            createGetter({
                '--ui-bg': '#123456',
                '--ui-text': '#abcdef'
            })
        )
        expect(onlyUiBg.background).toBe('#123456')

        const legacyOnly = buildTerminalTheme(
            createGetter({
                '--theme-background-color': '#0a0a0a',
                '--theme-text-color': '#fafafa',
                '--theme-accent-color': '#3366cc'
            })
        )
        expect(legacyOnly.background).toBe('#0a0a0a')
        expect(legacyOnly.foreground).toBe('#fafafa')
        expect(legacyOnly.cursor).toBe('#3366cc')
    })

    it('全部令牌缺失/为空时返回空主题（xterm 内置默认配色兜底，不写死颜色）', () => {
        expect(buildTerminalTheme(() => '')).toEqual({})
        expect(buildTerminalTheme(() => '   ')).toEqual({})
    })

    it('非法颜色（命名色 / hsl / 垃圾值）被忽略：只输出可解析字段', () => {
        const theme = buildTerminalTheme(
            createGetter({
                '--ui-bg-sunken': 'not-a-color',
                '--ui-bg': 'hsl(210 40% 20%)',
                '--ui-text': '#e6e6e6',
                '--ui-accent': 'red',
                '--ui-danger': '#ef5350'
            })
        )
        expect(theme.background).toBeUndefined()
        expect(theme.cursor).toBeUndefined()
        expect(theme.foreground).toBe('#e6e6e6')
        expect(theme.red).toBe('#ef5350')
        // 只有红色令牌时不应生成混合色（缺强调色/绿色等依赖）
        expect(theme.magenta).toBeUndefined()
        expect(theme.cyan).toBeUndefined()
    })

    it('--ui-selection 缺失时按强调色 + 固定 alpha 生成选区背景', () => {
        const theme = buildTerminalTheme(
            createGetter({
                '--ui-bg-sunken': '#1b1b1f',
                '--ui-text': '#e6e6e6',
                '--ui-accent': '#764ba2'
            })
        )
        expect(theme.selectionBackground).toBe(`rgba(118, 75, 162, ${TERMINAL_SELECTION_ALPHA})`)
    })

    it('主题变量声明表覆盖背景/前景/强调/状态色/选区（防止漏接令牌）', () => {
        expect(TERMINAL_THEME_CSS_VARIABLES.background).toEqual([
            '--ui-bg-sunken',
            '--ui-bg',
            '--theme-background-color'
        ])
        expect(TERMINAL_THEME_CSS_VARIABLES.foreground).toEqual(['--ui-text', '--theme-text-color'])
        expect(TERMINAL_THEME_CSS_VARIABLES.accent).toEqual(['--ui-accent', '--theme-accent-color'])
        expect(TERMINAL_THEME_CSS_VARIABLES.selection).toEqual(['--ui-selection'])
        for (const key of ['success', 'warning', 'danger', 'info'] as const) {
            expect(TERMINAL_THEME_CSS_VARIABLES[key]).toEqual([`--ui-${key}`])
        }
    })
})

describe('readTerminalTheme：从根元素计算样式读取', () => {
    it('通过 getComputedStyle(documentElement) 读取 --ui-* 并派生主题', () => {
        const getPropertyValue = vi.fn((name: string) => DARK_TOKENS[name] ?? '')
        const getComputedStyleSpy = vi
            .spyOn(window, 'getComputedStyle')
            .mockReturnValue({ getPropertyValue } as unknown as CSSStyleDeclaration)

        const theme = readTerminalTheme()
        expect(getComputedStyleSpy).toHaveBeenCalledWith(document.documentElement)
        expect(theme.background).toBe('#1b1b1f')
        expect(theme.foreground).toBe('#e6e6e6')
        expect(getPropertyValue).toHaveBeenCalledWith('--ui-bg-sunken')
    })

    it('非 DOM 环境返回空主题（不抛异常）', () => {
        vi.stubGlobal('document', undefined)
        expect(() => readTerminalTheme(null)).not.toThrow()
        expect(readTerminalTheme(null)).toEqual({})
    })
})
