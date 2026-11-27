/**
 * 界面风格层 / 密度层令牌契约测试（视觉升级 P0 / T2 + T3）
 *
 * 覆盖点：
 * 1. 4 风格 × 3 密度合法取值与默认值（workbench + default + 不减少透明 = 现状）；
 * 2. 数值单一真源：`shared/constants/ui-style.ts` 的令牌表与 `styles/ui-style.css`
 *    的变量块逐项一致（只改一处会让本测试失败）；
 * 3. 「默认观感零变化」：ui-style.css 只声明 CSS 变量，不对任何既有组件选择器声明样式；
 * 4. 默认档位 = 视觉升级前现状尺寸（行高 28 / 控件 32 / 内边距 12）；
 * 5. 双材质边界：hybrid 内容区 = paper，外壳 = workbench；其余风格内容区与外壳同材质；
 * 6. glass 降级：深色 steady（0.94 + 关模糊）、减少透明/系统偏好回退 paper；
 * 7. 动效与 z-index 令牌表完整；prefers-reduced-motion 降级存在。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
    DEFAULT_UI_DENSITY,
    DEFAULT_UI_REDUCE_TRANSPARENCY,
    DEFAULT_UI_STYLE,
    normalizeUiDensity,
    normalizeUiReduceTransparency,
    normalizeUiStyle,
    resolveEffectiveUiStyle,
    UI_CONTENT_MATERIAL,
    UI_DENSITY_TOKENS,
    UI_DENSITY_VALUES,
    UI_MOTION_TOKENS,
    UI_STYLE_CSS_ATTRIBUTES,
    UI_STYLE_TOKENS,
    UI_STYLE_VALUES,
    UI_Z_INDEX_TOKENS,
    type UiStyleContext
} from '../../src/shared/constants/ui-style'

const ROOT = path.resolve(__dirname, '../..')
const UI_STYLE_CSS = path.join(ROOT, 'src', 'renderer', 'src', 'styles', 'ui-style.css')
const THEME_CSS = path.join(ROOT, 'src', 'renderer', 'src', 'styles', 'theme.css')
const MAIN_TS = path.join(ROOT, 'src', 'renderer', 'src', 'main.ts')

function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 提取 CSS 规则块（sel ... { body }；本文件无嵌套规则，按首个 } 截断） */
function extractRuleBody(source: string, selector: string): string {
    const marker = `${selector} {`
    const start = source.indexOf(marker)
    expect(start, `ui-style.css 应声明 ${selector}`).toBeGreaterThanOrEqual(0)
    const bodyStart = start + marker.length
    const end = source.indexOf('}', bodyStart)
    expect(end, `${selector} 规则块应有结束括号`).toBeGreaterThan(bodyStart)
    return source.slice(bodyStart, end)
}

/** 解析 CSS 声明为 变量名 → 值 映射（只取 --ui-* 自定义属性） */
function parseDeclarations(body: string): Record<string, string> {
    const declarations: Record<string, string> = {}
    for (const line of body.split('\n')) {
        const match = line.match(/^\s*(--ui-[\w-]+)\s*:\s*(.+?);\s*$/)
        if (match) {
            declarations[match[1]] = match[2].trim()
        }
    }
    return declarations
}

/** 从 CSS 中按 selector 取变量声明 */
function readRuleVariables(source: string, selector: string): Record<string, string> {
    return parseDeclarations(extractRuleBody(source, selector))
}

/** 期望的密度 CSS 变量（由令牌表生成，保证测试跟随真源） */
function densityCssVariables(density: (typeof UI_DENSITY_VALUES)[number]): Record<string, string> {
    const tokens = UI_DENSITY_TOKENS[density]
    return {
        '--ui-row-height': `${tokens.rowHeight}px`,
        '--ui-control-height': `${tokens.controlHeight}px`,
        '--ui-pad': `${tokens.pad}px`,
        '--ui-titlebar-height': `${tokens.titleBarHeight}px`,
        '--ui-font-size': `${tokens.fontSize}px`
    }
}

/** 期望的风格 CSS 变量（外壳材质） */
function styleShellCssVariables(style: (typeof UI_STYLE_VALUES)[number]): Record<string, string> {
    const tokens = UI_STYLE_TOKENS[style]
    return {
        '--ui-surface-opacity': String(tokens.surfaceOpacity),
        '--ui-surface-blur': `${tokens.surfaceBlur}px`,
        '--ui-highlight-border-alpha': String(tokens.highlightBorderAlpha),
        '--ui-radius-sm': `${tokens.radiusSm}px`,
        '--ui-radius-md': `${tokens.radiusMd}px`,
        '--ui-radius-lg': `${tokens.radiusLg}px`,
        '--ui-shadow-1': tokens.shadow1,
        '--ui-shadow-2': tokens.shadow2,
        '--ui-shadow-3': tokens.shadow3
    }
}

/** 期望的内容区材质 CSS 变量（hybrid 取 paper，其余同外壳材质） */
function styleContentCssVariables(style: (typeof UI_STYLE_VALUES)[number]): Record<string, string> {
    const tokens = UI_STYLE_TOKENS[UI_CONTENT_MATERIAL[style]]
    return {
        '--ui-content-surface-opacity': String(tokens.surfaceOpacity),
        '--ui-content-surface-blur': `${tokens.surfaceBlur}px`,
        '--ui-content-radius-sm': `${tokens.radiusSm}px`,
        '--ui-content-radius-md': `${tokens.radiusMd}px`,
        '--ui-content-radius-lg': `${tokens.radiusLg}px`,
        '--ui-content-shadow-1': tokens.shadow1,
        '--ui-content-shadow-2': tokens.shadow2,
        '--ui-content-shadow-3': tokens.shadow3
    }
}

/** 断言 CSS 变量集合包含期望值（允许 CSS 额外声明，但期望项必须逐字一致） */
function expectVariablesToMatch(
    actual: Record<string, string>,
    expected: Record<string, string>,
    label: string
): void {
    for (const [name, value] of Object.entries(expected)) {
        expect(actual[name], `${label} 的 ${name}`).toBe(value)
    }
}

describe('风格/密度取值与默认值', () => {
    it('4 种风格 + 3 档密度，默认 workbench + default + 不减少透明', () => {
        expect(UI_STYLE_VALUES).toEqual(['paper', 'glass', 'workbench', 'hybrid'])
        expect(UI_DENSITY_VALUES).toEqual(['compact', 'default', 'spacious'])
        expect(DEFAULT_UI_STYLE).toBe('workbench')
        expect(DEFAULT_UI_DENSITY).toBe('default')
        expect(DEFAULT_UI_REDUCE_TRANSPARENCY).toBe(false)
    })

    it('根元素属性名约定固定（data-style / data-density / data-glass-mode / data-transparency）', () => {
        expect(UI_STYLE_CSS_ATTRIBUTES).toEqual({
            style: 'data-style',
            density: 'data-density',
            glassMode: 'data-glass-mode',
            transparency: 'data-transparency'
        })
    })

    it('归一化函数：非法值回落默认（CFG-10 白名单归一化口径）', () => {
        expect(normalizeUiStyle('glass')).toBe('glass')
        expect(normalizeUiStyle('paper')).toBe('paper')
        for (const value of [undefined, null, '', 'fancy', 42, {}]) {
            expect(normalizeUiStyle(value), String(value)).toBe('workbench')
        }
        expect(normalizeUiDensity('compact')).toBe('compact')
        for (const value of [undefined, null, '', 'wide', 1, []]) {
            expect(normalizeUiDensity(value), String(value)).toBe('default')
        }
        expect(normalizeUiReduceTransparency(true)).toBe(true)
        for (const value of [undefined, null, 'true', 1, 'yes']) {
            expect(normalizeUiReduceTransparency(value), String(value)).toBe(false)
        }
    })
})

describe('密度层令牌：3 档 = 数值单一真源 = CSS', () => {
    it('三档数值：紧凑 24/28/8、默认 28/32/12、宽松 32/36/16（默认 = 现状）', () => {
        expect(UI_DENSITY_TOKENS.compact).toEqual({
            rowHeight: 24,
            controlHeight: 28,
            pad: 8,
            titleBarHeight: 36,
            fontSize: 12
        })
        expect(UI_DENSITY_TOKENS.default).toEqual({
            rowHeight: 28,
            controlHeight: 32,
            pad: 12,
            titleBarHeight: 40,
            fontSize: 13
        })
        expect(UI_DENSITY_TOKENS.spacious).toEqual({
            rowHeight: 32,
            controlHeight: 36,
            pad: 16,
            titleBarHeight: 44,
            fontSize: 13
        })
    })

    it('每档密度令牌键集合一致（无缺键/多键）', () => {
        const expectedKeys = Object.keys(UI_DENSITY_TOKENS.default).sort()
        for (const density of UI_DENSITY_VALUES) {
            expect(Object.keys(UI_DENSITY_TOKENS[density]).sort()).toEqual(expectedKeys)
        }
    })

    it('CSS 三个 [data-density] 变量块与令牌表逐项一致', () => {
        const source = readSource(UI_STYLE_CSS)
        for (const density of UI_DENSITY_VALUES) {
            const variables = readRuleVariables(source, `[data-density='${density}']`)
            expectVariablesToMatch(
                variables,
                densityCssVariables(density),
                `[data-density='${density}']`
            )
        }
    })

    it(':root 默认密度 = default 档（首屏未写 data 属性时与现状一致）', () => {
        const source = readSource(UI_STYLE_CSS)
        const rootVariables = readRuleVariables(source, ':root')
        expectVariablesToMatch(rootVariables, densityCssVariables('default'), ':root')
    })
})

describe('风格层令牌：4 种材质 = 数值单一真源 = CSS', () => {
    it('workbench 为默认材质，三档阴影 = 视觉升级方案 §3.3 基准值', () => {
        expect(UI_STYLE_TOKENS.workbench).toEqual({
            surfaceOpacity: 1,
            surfaceBlur: 0,
            highlightBorderAlpha: 0,
            radiusSm: 2,
            radiusMd: 4,
            radiusLg: 6,
            shadow1: '0 1px 2px rgba(0, 0, 0, 0.06)',
            shadow2: '0 6px 24px rgba(0, 0, 0, 0.12)',
            shadow3: '0 16px 48px rgba(0, 0, 0, 0.18)'
        })
    })

    it('glass 材质：0.86 不透明度 + 8px 模糊 + 高光边 + 大圆角', () => {
        expect(UI_STYLE_TOKENS.glass.surfaceOpacity).toBe(0.86)
        expect(UI_STYLE_TOKENS.glass.surfaceBlur).toBe(8)
        expect(UI_STYLE_TOKENS.glass.highlightBorderAlpha).toBeGreaterThan(0)
        expect(UI_STYLE_TOKENS.glass.highlightBorderAlpha).toBeLessThanOrEqual(0.18)
        expect(UI_STYLE_TOKENS.glass.radiusLg).toBeGreaterThan(UI_STYLE_TOKENS.workbench.radiusLg)
    })

    it('paper 材质：不透明、无模糊、阴影弱于 workbench', () => {
        expect(UI_STYLE_TOKENS.paper.surfaceOpacity).toBe(1)
        expect(UI_STYLE_TOKENS.paper.surfaceBlur).toBe(0)
        expect(UI_STYLE_TOKENS.paper.shadow2).not.toBe(UI_STYLE_TOKENS.workbench.shadow2)
    })

    it('四风格的令牌键集合一致', () => {
        const expectedKeys = Object.keys(UI_STYLE_TOKENS.workbench).sort()
        for (const style of UI_STYLE_VALUES) {
            expect(Object.keys(UI_STYLE_TOKENS[style]).sort()).toEqual(expectedKeys)
        }
    })

    it('CSS 四个 [data-style] 外壳变量块与令牌表逐项一致', () => {
        const source = readSource(UI_STYLE_CSS)
        for (const style of UI_STYLE_VALUES) {
            const variables = readRuleVariables(source, `[data-style='${style}']`)
            expectVariablesToMatch(
                variables,
                styleShellCssVariables(style),
                `[data-style='${style}']`
            )
        }
    })

    it('CSS 内容区变量块与「内容区材质」映射一致（hybrid = paper，其余同外壳）', () => {
        const source = readSource(UI_STYLE_CSS)
        expect(UI_CONTENT_MATERIAL).toEqual({
            paper: 'paper',
            glass: 'glass',
            workbench: 'workbench',
            hybrid: 'paper'
        })
        for (const style of UI_STYLE_VALUES) {
            const variables = readRuleVariables(source, `[data-style='${style}']`)
            expectVariablesToMatch(
                variables,
                styleContentCssVariables(style),
                `内容区材质 ${style}`
            )
        }
        // 双材质边界：hybrid 内容区圆角/阴影取 paper 值，外壳取 workbench 值
        const hybrid = readRuleVariables(source, "[data-style='hybrid']")
        expect(hybrid['--ui-content-shadow-3']).toBe(UI_STYLE_TOKENS.paper.shadow3)
        expect(hybrid['--ui-shadow-3']).toBe(UI_STYLE_TOKENS.workbench.shadow3)
    })

    it(':root 默认材质 = workbench + 内容区 workbench（首屏与现状一致）', () => {
        const source = readSource(UI_STYLE_CSS)
        const rootVariables = readRuleVariables(source, ':root')
        expectVariablesToMatch(rootVariables, styleShellCssVariables('workbench'), ':root')
        expectVariablesToMatch(rootVariables, styleContentCssVariables('workbench'), ':root 内容区')
    })
})

describe('默认观感零变化：ui-style.css 只声明变量，不覆盖既有组件样式', () => {
    it('全部选择器只允许 :root / [data-style...] / [data-density...]，无既有组件选择器', () => {
        const source = readSource(UI_STYLE_CSS)
        // 去掉注释后收集所有「规则选择器」（以 { 结尾的行首 token）
        const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
        const selectors: string[] = []
        for (const line of withoutComments.split('\n')) {
            const match = line.match(/^\s*([^{}\n]+?)\s*\{$/)
            if (match) {
                selectors.push(match[1].trim())
            }
        }
        expect(selectors.length).toBeGreaterThan(0)
        for (const selector of selectors) {
            // @media 等 at-rule 不是选择器，放行（其内部规则仍逐条检查）
            if (selector.startsWith('@')) {
                continue
            }
            const allowed = selector
                .split(',')
                .map((part) => part.trim())
                .every(
                    (part) =>
                        part === ':root' ||
                        /^\[data-(style|density)[^\]]*\]$/.test(part) ||
                        /^\[data-(style|density)[^\]]*\](?:\[data-[^\]]*\])+$/.test(part) ||
                        /^\[data-style=[^\]]+\]\[data-[^\]]+\]$/.test(part)
                )
            expect(allowed, `ui-style.css 不允许出现既有组件选择器：${selector}`).toBe(true)
        }
    })

    it('ui-style.css 不写死任何主题色（颜色只用 rgba 阴影/var() 引用）', () => {
        const source = readSource(UI_STYLE_CSS)
        const declarationLines = source
            .split('\n')
            .filter((line) => /^\s*--ui-[\w-]+\s*:/.test(line))
        expect(declarationLines.length).toBeGreaterThan(0)
        for (const line of declarationLines) {
            expect(line.includes('#'), `不允许硬编码 hex 颜色：${line}`).toBe(false)
        }
    })

    it('渲染层入口唯一引入 ui-style.css 一次，且在 theme.css 之后', () => {
        const mainSource = readSource(MAIN_TS)
        const importPattern = /^\s*import\s+['"][^'"]*ui-style\.css['"]/gm
        expect([...mainSource.matchAll(importPattern)]).toHaveLength(1)
        const uiStyleIndex = mainSource.indexOf("import './styles/ui-style.css'")
        const themeIndex = mainSource.indexOf("import './styles/theme.css'")
        expect(uiStyleIndex).toBeGreaterThan(themeIndex)
    })

    it('theme.css 的 :root 声明全部 18 个语义颜色变量（首屏兜底）', () => {
        const source = readSource(THEME_CSS)
        const rootBody = source.slice(
            source.indexOf(':root {'),
            source.indexOf('}', source.indexOf(':root {'))
        )
        const semanticVariables = [
            '--ui-bg',
            '--ui-bg-elevated',
            '--ui-bg-sunken',
            '--ui-surface',
            '--ui-border',
            '--ui-border-strong',
            '--ui-text',
            '--ui-text-secondary',
            '--ui-text-tertiary',
            '--ui-accent',
            '--ui-accent-soft',
            '--ui-accent-hover',
            '--ui-success',
            '--ui-warning',
            '--ui-danger',
            '--ui-info',
            '--ui-focus-ring',
            '--ui-selection'
        ]
        for (const variable of semanticVariables) {
            expect(rootBody, `theme.css :root 缺少 ${variable}`).toContain(`${variable}:`)
        }
    })
})

describe('glass 降级路径（CSS 兜底 + 纯函数规则）', () => {
    it('深色主题 steady 模式：不透明度提高、模糊关闭', () => {
        const source = readSource(UI_STYLE_CSS)
        const steady = readRuleVariables(source, "[data-style='glass'][data-glass-mode='steady']")
        expect(steady['--ui-surface-opacity']).toBe('0.94')
        expect(steady['--ui-surface-blur']).toBe('0px')
    })

    it('减少透明兜底：glass 回退不透明、无模糊', () => {
        const source = readSource(UI_STYLE_CSS)
        const reduced = readRuleVariables(
            source,
            "[data-style='glass'][data-transparency='reduced']"
        )
        expect(reduced['--ui-surface-opacity']).toBe('1')
        expect(reduced['--ui-surface-blur']).toBe('0px')
    })

    it('存在 prefers-reduced-transparency 与 prefers-reduced-motion 降级块', () => {
        const source = readSource(UI_STYLE_CSS)
        expect(source).toContain('@media (prefers-reduced-transparency: reduce)')
        expect(source).toContain('@media (prefers-reduced-motion: reduce)')
    })

    it('减少动效：状态/弹出/对话框/页面时长降为 0ms（遮罩保留 100ms 淡入）', () => {
        const source = readSource(UI_STYLE_CSS)
        const mediaStart = source.indexOf('@media (prefers-reduced-motion: reduce)')
        expect(mediaStart).toBeGreaterThanOrEqual(0)
        const body = source.slice(mediaStart)
        expect(body).toContain('--ui-duration-fast: 0ms;')
        expect(body).toContain('--ui-duration-pop: 0ms;')
        expect(body).toContain('--ui-duration-dialog: 0ms;')
        expect(body).toContain('--ui-duration-overlay: 100ms;')
        expect(body).toContain('--ui-duration-page: 0ms;')
    })
})

describe('动效与 z-index 令牌', () => {
    it('动效令牌表完整且被 CSS :root 声明', () => {
        const expectedMotion: Record<string, string> = {
            '--ui-duration-fast': UI_MOTION_TOKENS.durationFast,
            '--ui-duration-pop': UI_MOTION_TOKENS.durationPop,
            '--ui-duration-dialog': UI_MOTION_TOKENS.durationDialog,
            '--ui-duration-overlay': UI_MOTION_TOKENS.durationOverlay,
            '--ui-duration-page': UI_MOTION_TOKENS.durationPage,
            '--ui-ease-standard': UI_MOTION_TOKENS.easeStandard,
            '--ui-ease-page': UI_MOTION_TOKENS.easePage
        }
        expectVariablesToMatch(
            readRuleVariables(readSource(UI_STYLE_CSS), ':root'),
            expectedMotion,
            '动效令牌'
        )
        expect(Object.values(UI_MOTION_TOKENS).every((value) => value.length > 0)).toBe(true)
    })

    it('z-index 层级表完整且被 CSS :root 声明', () => {
        const expectedZIndex: Record<string, string> = {
            '--ui-z-content': String(UI_Z_INDEX_TOKENS.content),
            '--ui-z-sidebar': String(UI_Z_INDEX_TOKENS.sidebar),
            '--ui-z-drag': String(UI_Z_INDEX_TOKENS.drag),
            '--ui-z-toolwindow': String(UI_Z_INDEX_TOKENS.toolWindow),
            '--ui-z-dropdown': String(UI_Z_INDEX_TOKENS.dropdown),
            '--ui-z-dialog': String(UI_Z_INDEX_TOKENS.dialog),
            '--ui-z-palette': String(UI_Z_INDEX_TOKENS.commandPalette),
            '--ui-z-toast': String(UI_Z_INDEX_TOKENS.toast),
            '--ui-z-guide': String(UI_Z_INDEX_TOKENS.guide)
        }
        expectVariablesToMatch(
            readRuleVariables(readSource(UI_STYLE_CSS), ':root'),
            expectedZIndex,
            'z-index 令牌'
        )
    })
})

describe('resolveEffectiveUiStyle：glass 降级规则', () => {
    /** 构造风格解析上下文（默认浅色普通主题、未开启减少透明） */
    function context(overrides: Partial<UiStyleContext> = {}): UiStyleContext {
        return {
            isDark: false,
            isSaturated: false,
            isEyecare: false,
            reduceTransparency: false,
            preferReducedTransparency: false,
            ...overrides
        }
    }

    it('paper / workbench / hybrid 原样生效（不受主题类别影响）', () => {
        for (const style of ['paper', 'workbench', 'hybrid'] as const) {
            for (const isDark of [false, true]) {
                expect(resolveEffectiveUiStyle(style, context({ isDark }))).toEqual({
                    style,
                    glassMode: 'normal'
                })
            }
        }
    })

    it('glass 浅色普通主题：常规模式（0.86 + 8px 模糊）', () => {
        expect(resolveEffectiveUiStyle('glass', context())).toEqual({
            style: 'glass',
            glassMode: 'normal'
        })
    })

    it('glass 深色主题：保留 glass 但进入 steady 稳健模式', () => {
        expect(resolveEffectiveUiStyle('glass', context({ isDark: true }))).toEqual({
            style: 'glass',
            glassMode: 'steady'
        })
    })

    it('glass 高饱和主题：降级为 paper 材质', () => {
        expect(resolveEffectiveUiStyle('glass', context({ isSaturated: true }))).toEqual({
            style: 'paper',
            glassMode: 'flat'
        })
    })

    it('glass 护眼主题：降级为 paper 材质', () => {
        expect(resolveEffectiveUiStyle('glass', context({ isEyecare: true }))).toEqual({
            style: 'paper',
            glassMode: 'flat'
        })
    })

    it('glass + 减少透明开关 / 系统偏好：回退 paper 材质', () => {
        expect(resolveEffectiveUiStyle('glass', context({ reduceTransparency: true }))).toEqual({
            style: 'paper',
            glassMode: 'flat'
        })
        expect(
            resolveEffectiveUiStyle('glass', context({ preferReducedTransparency: true }))
        ).toEqual({ style: 'paper', glassMode: 'flat' })
    })

    it('降级优先级：减少透明 > 高饱和/护眼 > 深色（深色 + 减少透明 → paper）', () => {
        expect(
            resolveEffectiveUiStyle(
                'glass',
                context({ isDark: true, isSaturated: true, reduceTransparency: true })
            )
        ).toEqual({ style: 'paper', glassMode: 'flat' })
        // 深色 + 高饱和（未开减少透明）→ paper（高饱和优先于深色 steady）
        expect(
            resolveEffectiveUiStyle('glass', context({ isDark: true, isSaturated: true }))
        ).toEqual({ style: 'paper', glassMode: 'flat' })
    })
})
