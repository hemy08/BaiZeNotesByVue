/**
 * 语义令牌派生（shared 纯函数层，无任何运行时副作用）
 *
 * ## 为什么需要本模块
 * 28 套应用主题（`src/main/config/theme-config.ts` 的 `ThemeStyles`）只提供 10 个基础配色字段，
 * 而视觉升级需要 18 个语义颜色令牌（`--ui-*`）：页面底/卡片底/凹陷底、工具窗面、两级边框、
 * 三级文字、强调色三态、四个状态色、焦点环与选区。本模块把「10 字段 → 18 语义令牌」的派生
 * 规则收敛为**唯一实现**，供渲染层 `composables/useTheme.ts` 在应用主题时写入 CSS 变量，
 * 供主题契约测试做「28 主题 × 全部令牌」的静态完整性校验。
 *
 * ## 派生规则（对齐视觉升级方案 §5.1）
 * - `bg` = backgroundColor；`bg-elevated` / `surface` = cardBackground；
 *   `bg-sunken` = hoverBackground 加深 8%（代码块/输入框/表格表头等「下压」底色）
 * - `border` = borderColor；`border-strong` = borderColor 加深 8%（分区线）
 * - `text` = textColor；`text-secondary` = secondaryTextColor；
 *   `text-tertiary` = secondaryTextColor 向 backgroundColor 混合 20%（视觉权重再降 20%，
 *   浅色主题更浅、深色主题更暗，两个方向都是「对比度降低」，与辅助文字语义一致）
 * - `accent` = accentColor；`accent-soft` = accentColor 12% alpha（悬停底/选中底）；
 *   `accent-hover` = accentColor 加深 12%（按下/悬停态实色）
 * - `success` / `warning` / `danger` / `info`：全主题共用的固定语义色，浅色系一套、深色系一套
 *   （护眼组均为浅底，沿用浅色系语义色，避免低对比背景下状态色辨识度进一步下降）
 * - `focus-ring` = accentColor 30% alpha；`selection` = accentColor 15% alpha
 *
 * ## 非法色值兜底
 * 主题数据来自主进程注册表，正常不会非法；但历史损坏配置/第三方扩展仍可能传入空串或
 * 非颜色字符串。派生入口先做一次归一化（`normalizeSemanticTokenSource`），非法字段回落到
 * 按明暗分组的**中性兜底色**（不代表任何主题基线，仅保证派生结果永远是合法 CSS 颜色，
 * 不会把 `undefined` / 非法串写进 CSS 变量）。
 *
 * ## 分组判定
 * `buildSemanticTokens(theme, group)` 的 group 由调用方给出；真源工具函数
 * `resolveSemanticThemeGroup(themeType, theme)` 以「护眼组优先、其次按背景亮度、最后按
 * `isDarkThemeType` 兜底」的顺序判定，用于修正 `shared/constants/theme.ts` 已记录的三处
 * 历史归属偏差（`baize-text` / `baize-starry` 实为深色底、`forest` 实为浅色底）。
 */
import type { ThemeStyles } from './types/theme'
import { isDarkThemeType, isEyecareThemeType } from './constants/theme'
import type { ThemeGroupId } from './constants/theme'

/** 语义令牌的 CSS 变量前缀（渲染层写入根元素；与既有 `--theme-*` 20 变量并存，不改旧机制） */
export const SEMANTIC_TOKEN_CSS_PREFIX = '--ui-'

/** RGBA 颜色（各通道 0~255，alpha 0~1） */
export interface RgbaColor {
    /** 红色通道 */
    r: number
    /** 绿色通道 */
    g: number
    /** 蓝色通道 */
    b: number
    /** 透明度（0 全透明 / 1 不透明） */
    a: number
}

/** 派生的 18 个语义颜色令牌（camelCase 键 → `--ui-*` CSS 变量，映射见 SEMANTIC_TOKEN_CSS_BINDINGS） */
export interface SemanticTokens {
    /** 页面底色（= backgroundColor） */
    bg: string
    /** 卡片/面板底色（= cardBackground） */
    bgElevated: string
    /** 凹陷底色：代码块/输入框/表格表头（= hoverBackground 加深 8%） */
    bgSunken: string
    /** 工具窗悬浮面（= cardBackground） */
    surface: string
    /** 细边框（= borderColor） */
    border: string
    /** 强调边框/分区线（= borderColor 加深 8%） */
    borderStrong: string
    /** 主文字（= textColor） */
    text: string
    /** 次要文字（= secondaryTextColor） */
    textSecondary: string
    /** 三级辅助文字（= secondaryTextColor 向背景混合 20%） */
    textTertiary: string
    /** 强调色（= accentColor） */
    accent: string
    /** 强调色 12% 透明底（悬停/选中） */
    accentSoft: string
    /** 强调色加深 12%（按下/悬停实色） */
    accentHover: string
    /** 成功状态色（固定语义色） */
    success: string
    /** 警告状态色（固定语义色） */
    warning: string
    /** 错误/危险状态色（固定语义色） */
    danger: string
    /** 信息状态色（固定语义色） */
    info: string
    /** 键盘焦点环（= accentColor 30% alpha） */
    focusRing: string
    /** 文本选区（= accentColor 15% alpha） */
    selection: string
}

/** 语义令牌键清单（测试断言「全部令牌」时使用，顺序与派生表一致） */
export const SEMANTIC_TOKEN_KEYS = [
    'bg',
    'bgElevated',
    'bgSunken',
    'surface',
    'border',
    'borderStrong',
    'text',
    'textSecondary',
    'textTertiary',
    'accent',
    'accentSoft',
    'accentHover',
    'success',
    'warning',
    'danger',
    'info',
    'focusRing',
    'selection'
] as const satisfies readonly (keyof SemanticTokens)[]

/** 语义令牌 → CSS 变量映射项 */
export interface SemanticTokenBinding {
    /** SemanticTokens 键 */
    token: (typeof SEMANTIC_TOKEN_KEYS)[number]
    /** 渲染层根元素写入的 CSS 变量名（`--ui-*`） */
    cssVariable: string
}

/**
 * 语义令牌 → CSS 变量映射表（唯一真源）。
 * 变量一律 `--ui-` 前缀，与既有 20 个主题变量（`--theme-*` / 历史别名）正交，互不覆盖。
 */
export const SEMANTIC_TOKEN_CSS_BINDINGS: readonly SemanticTokenBinding[] = [
    { token: 'bg', cssVariable: '--ui-bg' },
    { token: 'bgElevated', cssVariable: '--ui-bg-elevated' },
    { token: 'bgSunken', cssVariable: '--ui-bg-sunken' },
    { token: 'surface', cssVariable: '--ui-surface' },
    { token: 'border', cssVariable: '--ui-border' },
    { token: 'borderStrong', cssVariable: '--ui-border-strong' },
    { token: 'text', cssVariable: '--ui-text' },
    { token: 'textSecondary', cssVariable: '--ui-text-secondary' },
    { token: 'textTertiary', cssVariable: '--ui-text-tertiary' },
    { token: 'accent', cssVariable: '--ui-accent' },
    { token: 'accentSoft', cssVariable: '--ui-accent-soft' },
    { token: 'accentHover', cssVariable: '--ui-accent-hover' },
    { token: 'success', cssVariable: '--ui-success' },
    { token: 'warning', cssVariable: '--ui-warning' },
    { token: 'danger', cssVariable: '--ui-danger' },
    { token: 'info', cssVariable: '--ui-info' },
    { token: 'focusRing', cssVariable: '--ui-focus-ring' },
    { token: 'selection', cssVariable: '--ui-selection' }
]

/**
 * 状态语义色（浅色系 / 深色系各一套；护眼主题归入浅色系）。
 *
 * 取值口径：在对应背景类别上达到「正文/图标 ≥3:1、大字 ≥3:1」的常用 Material 语义色，
 * 不跟随主题色相（状态色需要跨主题保持一致的识别度，避免用户切换主题后「错误」变绿）。
 */
export const SEMANTIC_STATUS_COLORS: Readonly<
    Record<'light' | 'dark', Pick<SemanticTokens, 'success' | 'warning' | 'danger' | 'info'>>
> = {
    // 浅色底（含护眼浅底）使用深一档的状态色，保证白底/米底上的可读性
    light: {
        success: '#2e7d32',
        warning: '#b45309',
        danger: '#c62828',
        info: '#1565c0'
    },
    // 深色底使用提亮一档的状态色，避免深底上过暗
    dark: {
        success: '#66bb6a',
        warning: '#ffb74d',
        danger: '#ef5350',
        info: '#64b5f6'
    }
}

/** 语义令牌派生只读取这几个主题配色字段（便于单测构造最小样本与静态解析） */
export type SemanticTokenSource = Pick<
    ThemeStyles,
    | 'backgroundColor'
    | 'cardBackground'
    | 'textColor'
    | 'secondaryTextColor'
    | 'borderColor'
    | 'accentColor'
    | 'hoverBackground'
>

/** 派生规则常量（集中定义便于评审与测试引用，禁止在各调用点另写字面量） */
export const SEMANTIC_TOKEN_RULES = {
    /** bg-sunken = hoverBackground 加深比例 */
    sunkenDarkenRatio: 0.08,
    /** border-strong = borderColor 加深比例 */
    borderStrongDarkenRatio: 0.08,
    /** text-tertiary = secondaryTextColor 向 backgroundColor 混合比例（视觉权重再降 20%） */
    tertiaryMixRatio: 0.2,
    /** accent-soft 的 alpha */
    accentSoftAlpha: 0.12,
    /** accent-hover 的加深比例 */
    accentHoverDarkenRatio: 0.12,
    /** focus-ring 的 alpha */
    focusRingAlpha: 0.3,
    /** selection 的 alpha */
    selectionAlpha: 0.15
} as const

/** 非法/缺失色值的中性兜底色（仅用于兜底，不代表任何主题基线） */
const FALLBACK_COLOR_SOURCE: Readonly<Record<'light' | 'dark', SemanticTokenSource>> = {
    light: {
        backgroundColor: '#ffffff',
        cardBackground: '#ffffff',
        textColor: '#000000',
        secondaryTextColor: '#666666',
        borderColor: '#e0e0e0',
        accentColor: '#764ba2',
        hoverBackground: '#f0f0f0'
    },
    dark: {
        backgroundColor: '#000000',
        cardBackground: '#121212',
        textColor: '#ffffff',
        secondaryTextColor: '#aaaaaa',
        borderColor: '#333333',
        accentColor: '#bb86fc',
        hoverBackground: '#1f1f1f'
    }
}

/** 十六进制颜色正则（支持 #rgb / #rgba / #rrggbb / #rrggbbaa） */
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3,8})$/
/** rgb() 函数式颜色正则（3 个通道；整串必须匹配，杜绝把任意字符串当颜色） */
const RGB_FUNCTION_PATTERN = /^rgb\(\s*(-?\d{1,3})\s*,\s*(-?\d{1,3})\s*,\s*(-?\d{1,3})\s*\)$/i
/** rgba() 函数式颜色正则（3 个通道 + alpha；alpha 允许越界后钳制） */
const RGBA_FUNCTION_PATTERN =
    /^rgba\(\s*(-?\d{1,3})\s*,\s*(-?\d{1,3})\s*,\s*(-?\d{1,3})\s*,\s*(-?\d*\.?\d+)\s*\)$/i

/** 把颜色通道钳制到 0~255 的整数 */
function clampChannel(channel: number): number {
    return Math.min(255, Math.max(0, Math.round(channel)))
}

/** 把 alpha 钳制到 0~1（保留 3 位小数，避免浮点误差写进 CSS） */
function clampAlpha(alpha: number): number {
    return Math.min(1, Math.max(0, Math.round(alpha * 1000) / 1000))
}

/**
 * 解析颜色为 RGBA（纯函数）。
 *
 * 支持：`#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` / `rgb(r,g,b)` / `rgba(r,g,b,a)`（大小写不敏感）。
 * 其余形式（命名色、hsl、CSS 变量引用、渐变等）一律返回 null——语义令牌派生只接受确定色值，
 * 无法解析时由调用方使用兜底色，避免把非法串写进 CSS 变量。
 */
export function parseColor(input: unknown): RgbaColor | null {
    if (typeof input !== 'string') {
        return null
    }
    const text = input.trim()
    if (text.length === 0) {
        return null
    }

    const hexMatch = HEX_COLOR_PATTERN.exec(text)
    if (hexMatch) {
        const digits = hexMatch[1]
        if (digits.length === 3 || digits.length === 4) {
            const [r, g, b, a = 'f'] = digits.split('')
            return {
                r: clampChannel(parseInt(r + r, 16)),
                g: clampChannel(parseInt(g + g, 16)),
                b: clampChannel(parseInt(b + b, 16)),
                a: clampAlpha(parseInt(a + a, 16) / 255)
            }
        }
        if (digits.length === 6 || digits.length === 8) {
            return {
                r: clampChannel(parseInt(digits.slice(0, 2), 16)),
                g: clampChannel(parseInt(digits.slice(2, 4), 16)),
                b: clampChannel(parseInt(digits.slice(4, 6), 16)),
                a: digits.length === 8 ? clampAlpha(parseInt(digits.slice(6, 8), 16) / 255) : 1
            }
        }
        return null
    }

    const rgbMatch = RGB_FUNCTION_PATTERN.exec(text)
    if (rgbMatch) {
        return {
            r: clampChannel(Number(rgbMatch[1])),
            g: clampChannel(Number(rgbMatch[2])),
            b: clampChannel(Number(rgbMatch[3])),
            a: 1
        }
    }

    const rgbaMatch = RGBA_FUNCTION_PATTERN.exec(text)
    if (rgbaMatch) {
        return {
            r: clampChannel(Number(rgbaMatch[1])),
            g: clampChannel(Number(rgbaMatch[2])),
            b: clampChannel(Number(rgbaMatch[3])),
            a: clampAlpha(Number(rgbaMatch[4]))
        }
    }

    return null
}

/** 转十进制通道为两位十六进制 */
function toHexChannel(channel: number): string {
    return clampChannel(channel).toString(16).padStart(2, '0')
}

/** RGBA → `#rrggbb`（丢弃 alpha；alpha 场景请用 formatCssColor） */
export function formatHex(color: RgbaColor): string {
    return `#${toHexChannel(color.r)}${toHexChannel(color.g)}${toHexChannel(color.b)}`
}

/** RGBA → CSS 颜色串（alpha < 1 输出 `rgba(r, g, b, a)`，否则输出十六进制） */
export function formatCssColor(color: RgbaColor): string {
    const alpha = clampAlpha(color.a)
    if (alpha >= 1) {
        return formatHex(color)
    }
    return `rgba(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)}, ${alpha})`
}

/**
 * 归一化颜色：可解析时输出统一小写十六进制；无法解析时输出兜底色（同样归一化）。
 * 用于把主进程/历史配置传入的任意字符串收敛为「一定是合法 CSS 颜色」。
 */
export function normalizeColor(value: unknown, fallback = '#000000'): string {
    const parsed = parseColor(value)
    if (parsed) {
        return formatHex(parsed)
    }
    const fallbackParsed = parseColor(fallback)
    return fallbackParsed ? formatHex(fallbackParsed) : '#000000'
}

/**
 * 加深颜色：每个 RGB 通道乘以 `1 - ratio`（ratio 0~1，非法值钳制）。
 * 无法解析时返回兜底色（不做二次加深）。
 */
export function darkenColor(value: string, ratio: number, fallback = '#000000'): string {
    const parsed = parseColor(value)
    if (!parsed) {
        return normalizeColor(null, fallback)
    }
    const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
    const scale = 1 - safeRatio
    return formatHex({
        r: parsed.r * scale,
        g: parsed.g * scale,
        b: parsed.b * scale,
        a: 1
    })
}

/** 提亮颜色：每个 RGB 通道向 255 混合 `ratio`（ratio 0~1） */
export function lightenColor(value: string, ratio: number, fallback = '#000000'): string {
    const parsed = parseColor(value)
    if (!parsed) {
        return normalizeColor(null, fallback)
    }
    const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
    return formatHex({
        r: parsed.r + (255 - parsed.r) * safeRatio,
        g: parsed.g + (255 - parsed.g) * safeRatio,
        b: parsed.b + (255 - parsed.b) * safeRatio,
        a: 1
    })
}

/**
 * 为颜色附加透明度（固定输出 `rgba(r, g, b, a)`；alpha 钳制到 0~1）。
 * 与 formatCssColor 的区别：{@link withAlphaColor} 语义就是「带 alpha 的叠色」，
 * 因此 alpha 恰好为 1 时也输出 rgba()，调用方无需区分两种字符串形态。
 */
export function withAlphaColor(value: string, alpha: number, fallback = '#000000'): string {
    const parsed = parseColor(value) ?? parseColor(fallback)
    if (!parsed) {
        return 'rgba(0, 0, 0, 0)'
    }
    const safeAlpha = clampAlpha(Number.isFinite(alpha) ? alpha : 0)
    return `rgba(${clampChannel(parsed.r)}, ${clampChannel(parsed.g)}, ${clampChannel(parsed.b)}, ${safeAlpha})`
}

/**
 * 线性混合两个颜色：ratio=0 返回 from，ratio=1 返回 to（ratio 钳制到 0~1）。
 * 用于派生「视觉权重再降」的三级文字色（向背景混合）。
 */
export function mixColor(from: string, to: string, ratio: number, fallback = '#000000'): string {
    const fromColor = parseColor(from) ?? parseColor(fallback)
    const toColor = parseColor(to) ?? parseColor(fallback)
    if (!fromColor || !toColor) {
        return normalizeColor(null, fallback)
    }
    const safeRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
    return formatHex({
        r: fromColor.r + (toColor.r - fromColor.r) * safeRatio,
        g: fromColor.g + (toColor.g - fromColor.g) * safeRatio,
        b: fromColor.b + (toColor.b - fromColor.b) * safeRatio,
        a: 1
    })
}

/**
 * 相对亮度（WCAG 2.x 定义，sRGB 线性化后加权：0.2126R + 0.7152G + 0.0722B）。
 * 无法解析时返回 null。
 */
export function relativeLuminance(value: unknown): number | null {
    const parsed = parseColor(value)
    if (!parsed) {
        return null
    }
    const linearize = (channel: number): number => {
        const normalized = channel / 255
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4)
    }
    return (
        0.2126 * linearize(parsed.r) + 0.7152 * linearize(parsed.g) + 0.0722 * linearize(parsed.b)
    )
}

/**
 * WCAG 对比度（前景/背景，1~21）。任一颜色无法解析时返回 null。
 * 供主题派生评审与测试做「正文 ≥4.5:1」抽样校验，不参与运行时样式计算。
 */
export function contrastRatio(foreground: unknown, background: unknown): number | null {
    const foregroundLuminance = relativeLuminance(foreground)
    const backgroundLuminance = relativeLuminance(background)
    if (foregroundLuminance === null || backgroundLuminance === null) {
        return null
    }
    const lighter = Math.max(foregroundLuminance, backgroundLuminance)
    const darker = Math.min(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
}

/** 是否为深色（相对亮度 < 0.4；无法解析按浅色处理，与默认主题方向一致） */
export function isDarkColor(value: unknown): boolean {
    const luminance = relativeLuminance(value)
    return luminance !== null && luminance < 0.4
}

/** 语义令牌分组（浅色 / 深色 / 护眼，真源是 shared/constants/theme.ts 的三组清单） */
export type SemanticThemeGroup = ThemeGroupId

/**
 * 判定主题应使用的语义色分组（纯函数）。
 *
 * 顺序：护眼组优先 → 表面亮度（卡片/悬浮面 cardBackground 亮度 <0.45 视为深色，
 * 无法解析时回退页面底色 backgroundColor）→ `isDarkThemeType` 兜底。
 *
 * 为什么按「表面」而不是页面底色：18 个语义令牌里状态色/文字色主要绘制在卡片/工具窗面上
 * （`surface` = cardBackground），按表面亮度选语义色才能保证实际对比度；且
 * `shared/constants/theme.ts` 已记录三处历史归属与真实配色相反（`baize-text` /
 * `baize-starry` 实为深色底、`forest` 实为浅色底），亮度判定可自动修正。
 * 主题分组口径本身不变（THEME_GROUPS 仍用于主题设置对话框与标题栏 logo）。
 */
export function resolveSemanticThemeGroup(
    themeType: string,
    theme?: SemanticTokenSource | null
): SemanticThemeGroup {
    if (isEyecareThemeType(themeType)) {
        return 'eyecare'
    }
    const surfaceLuminance =
        relativeLuminance(theme?.cardBackground) ?? relativeLuminance(theme?.backgroundColor)
    if (surfaceLuminance !== null) {
        return surfaceLuminance < 0.45 ? 'dark' : 'light'
    }
    return isDarkThemeType(themeType) ? 'dark' : 'light'
}

/** 按分组把任意主题配色归一化为「一定合法」的派生源 */
function normalizeSemanticTokenSource(
    theme: SemanticTokenSource,
    group: SemanticThemeGroup
): SemanticTokenSource {
    const fallback = FALLBACK_COLOR_SOURCE[group === 'dark' ? 'dark' : 'light']
    return {
        backgroundColor: normalizeColor(theme?.backgroundColor, fallback.backgroundColor),
        cardBackground: normalizeColor(theme?.cardBackground, fallback.cardBackground),
        textColor: normalizeColor(theme?.textColor, fallback.textColor),
        secondaryTextColor: normalizeColor(theme?.secondaryTextColor, fallback.secondaryTextColor),
        borderColor: normalizeColor(theme?.borderColor, fallback.borderColor),
        accentColor: normalizeColor(theme?.accentColor, fallback.accentColor),
        hoverBackground: normalizeColor(theme?.hoverBackground, fallback.hoverBackground)
    }
}

/**
 * 派生 18 个语义颜色令牌（纯函数，无副作用）。
 *
 * @param theme 主题配色（ThemeStyles 的子集；多余字段忽略）
 * @param group 语义色分组（light / dark / eyecare），由 resolveSemanticThemeGroup 判定
 * @returns 18 个语义令牌（值一律为合法 CSS 颜色：hex 或 rgba(...)）
 */
export function buildSemanticTokens(
    theme: SemanticTokenSource,
    group: SemanticThemeGroup
): SemanticTokens {
    const source = normalizeSemanticTokenSource(theme, group)
    const statusColors = SEMANTIC_STATUS_COLORS[group === 'dark' ? 'dark' : 'light']
    return {
        bg: source.backgroundColor,
        bgElevated: source.cardBackground,
        bgSunken: darkenColor(source.hoverBackground, SEMANTIC_TOKEN_RULES.sunkenDarkenRatio),
        surface: source.cardBackground,
        border: source.borderColor,
        borderStrong: darkenColor(source.borderColor, SEMANTIC_TOKEN_RULES.borderStrongDarkenRatio),
        text: source.textColor,
        textSecondary: source.secondaryTextColor,
        textTertiary: mixColor(
            source.secondaryTextColor,
            source.backgroundColor,
            SEMANTIC_TOKEN_RULES.tertiaryMixRatio
        ),
        accent: source.accentColor,
        accentSoft: withAlphaColor(source.accentColor, SEMANTIC_TOKEN_RULES.accentSoftAlpha),
        accentHover: darkenColor(source.accentColor, SEMANTIC_TOKEN_RULES.accentHoverDarkenRatio),
        success: statusColors.success,
        warning: statusColors.warning,
        danger: statusColors.danger,
        info: statusColors.info,
        focusRing: withAlphaColor(source.accentColor, SEMANTIC_TOKEN_RULES.focusRingAlpha),
        selection: withAlphaColor(source.accentColor, SEMANTIC_TOKEN_RULES.selectionAlpha)
    }
}

/**
 * 派生「CSS 变量名 → 值」映射（18 项，前缀 `--ui-`）。
 * 渲染层 `useTheme.applyThemeStyles` 直接写入根元素；既有 20 个主题变量完全不受影响。
 */
export function buildSemanticCssVariables(
    theme: SemanticTokenSource,
    group: SemanticThemeGroup
): Record<string, string> {
    const tokens = buildSemanticTokens(theme, group)
    const variables: Record<string, string> = {}
    for (const binding of SEMANTIC_TOKEN_CSS_BINDINGS) {
        variables[binding.cssVariable] = tokens[binding.token]
    }
    return variables
}
