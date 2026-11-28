/**
 * 1.5.7 终端工具（阶段 B）：xterm 主题派生（从当前应用主题的 CSS 变量读取）。
 *
 * ## 为什么不在组件里写死配色
 * 应用有 28 套主题 × 4 种界面风格，终端面板必须与 AI 面板一样跟随主题切换，不能出现
 * 「深色主题里终端仍是亮底」的割裂感。本模块把「主题 CSS 变量 → xterm ITheme」的映射
 * 收敛为**纯函数**（可单测）：组件只负责在挂载 / 主题切换事件后调用 `readTerminalTheme()`
 * 并写回 `term.options.theme`。
 *
 * ## 取值口径
 * - 背景 / 前景 / 光标 / 选区 / ANSI 基准色全部来自 `--ui-*` 语义令牌（`useTheme` 把
 *   主进程主题写根元素；`--theme-*` 作为历史兜底链），**源码中不出现任何颜色字面量**
 *   （颜色真源只有主题层，符合「UI 必须走主题变量」规范）；
 * - ANSI 16 色以语义令牌为基准派生（红/绿/黄/蓝 = danger/success/warning/info，
 *   洋红/青为强调色与状态色的混合），深色底提亮、浅色底加深（`shared/theme-tokens` 的
 *   颜色纯函数），保证 28 套主题下命令输出仍可读；
 * - 令牌缺失/非法（非 DOM 环境、主题尚未应用、异常持久化值）时**省略对应字段**，
 *   由 xterm 内置默认配色兜底（不抛异常，也不引入固定主题色）。
 */
import type { ITheme } from '@xterm/xterm'
import {
    darkenColor,
    formatCssColor,
    isDarkColor,
    lightenColor,
    mixColor,
    parseColor,
    withAlphaColor
} from '../../../../shared/theme-tokens'

/** CSS 变量读取函数（`getPropertyValue` 形态；便于单测注入固定色板） */
export type TerminalCssVariableGetter = (name: string) => string

/**
 * 主题令牌 → xterm 主题字段的变量候选链（按优先级；首个非空且可解析为颜色的值生效）。
 *
 * 说明：`--ui-*` 由 `useTheme.applyThemeStyles` 写入根元素；`--theme-*` 为历史主变量，
 * 作为兜底链保证不同初始化阶段都有可用颜色。
 */
export const TERMINAL_THEME_CSS_VARIABLES = {
    background: ['--ui-bg-sunken', '--ui-bg', '--theme-background-color'],
    foreground: ['--ui-text', '--theme-text-color'],
    accent: ['--ui-accent', '--theme-accent-color'],
    accentHover: ['--ui-accent-hover', '--ui-accent', '--theme-accent-color'],
    textSecondary: ['--ui-text-secondary', '--theme-secondary-text-color'],
    textTertiary: ['--ui-text-tertiary', '--ui-text-secondary', '--theme-secondary-text-color'],
    success: ['--ui-success'],
    warning: ['--ui-warning'],
    danger: ['--ui-danger'],
    info: ['--ui-info'],
    selection: ['--ui-selection']
} as const

/** 选中区域背景相对强调色的 alpha（`--ui-selection` 不存在时的兜底叠色比例） */
export const TERMINAL_SELECTION_ALPHA = 0.15

/** 亮色 ANSI 相对基准色的提亮/加深比例（深色底提亮、浅色底加深） */
export const TERMINAL_BRIGHT_COLOR_RATIO = 0.16

/** 从候选链中取首个非空 CSS 变量值；全部缺失时返回 null */
function pickTerminalThemeVariable(
    getVariable: TerminalCssVariableGetter,
    chain: readonly string[]
): string | null {
    for (const name of chain) {
        const value = getVariable(name)
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim()
        }
    }
    return null
}

/**
 * 从候选链解析一个「一定合法」的十六进制颜色。
 * 变量缺失或无法解析（命名色 / hsl / 非法持久化值等）时返回 null（由调用方省略字段）。
 */
function resolveTerminalThemeColor(
    getVariable: TerminalCssVariableGetter,
    chain: readonly string[]
): string | null {
    const raw = pickTerminalThemeVariable(getVariable, chain)
    if (raw === null) {
        return null
    }
    const parsed = parseColor(raw)
    if (!parsed) {
        return null
    }
    return formatCssColor({ ...parsed, a: 1 })
}

/**
 * 归一化选区背景：保留 `--ui-selection` 的透明度（rgba），非法/缺失时按强调色 + 固定
 * alpha 兜底。`normalizeColor` 会丢弃 alpha，因此这里单独用 `formatCssColor` 保真。
 */
function resolveSelectionBackground(
    getVariable: TerminalCssVariableGetter,
    accent: string | null
): string | null {
    const raw = pickTerminalThemeVariable(getVariable, TERMINAL_THEME_CSS_VARIABLES.selection)
    const parsed = raw === null ? null : parseColor(raw)
    if (parsed) {
        return formatCssColor(parsed)
    }
    return accent === null ? null : withAlphaColor(accent, TERMINAL_SELECTION_ALPHA, accent)
}

/**
 * 把主题 CSS 变量读取函数映射为 xterm `ITheme`（纯函数，便于单测断言派生规则）。
 *
 * 只输出「已解析成功」的字段：令牌缺失时保持 undefined，让 xterm 使用内置默认配色；
 * 这样既保证主题切换即时生效，又不会在源码里引入固定色值。
 *
 * @param getVariable CSS 变量读取函数（如根元素 `getComputedStyle().getPropertyValue`）
 * @returns xterm 主题（背景/前景/光标/选区 + ANSI 16 色中可派生的部分）
 */
export function buildTerminalTheme(getVariable: TerminalCssVariableGetter): ITheme {
    const background = resolveTerminalThemeColor(
        getVariable,
        TERMINAL_THEME_CSS_VARIABLES.background
    )
    const foreground = resolveTerminalThemeColor(
        getVariable,
        TERMINAL_THEME_CSS_VARIABLES.foreground
    )
    const accent = resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.accent)
    const accentHover =
        resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.accentHover) ?? accent
    const textSecondary = resolveTerminalThemeColor(
        getVariable,
        TERMINAL_THEME_CSS_VARIABLES.textSecondary
    )
    const textTertiary =
        resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.textTertiary) ??
        textSecondary
    const success = resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.success)
    const warning = resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.warning)
    const danger = resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.danger)
    const info = resolveTerminalThemeColor(getVariable, TERMINAL_THEME_CSS_VARIABLES.info)

    // 深色底提亮、浅色底加深：亮色 ANSI 在两种底色上都保持可辨识；
    // 无法判定底色时按终端常见深色底处理（仅影响亮色变体，不影响基准色）
    const isDarkBackground = background === null ? true : isDarkColor(background)
    const emphasize = (color: string): string =>
        isDarkBackground
            ? lightenColor(color, TERMINAL_BRIGHT_COLOR_RATIO, color)
            : darkenColor(color, TERMINAL_BRIGHT_COLOR_RATIO, color)

    // 洋红/青没有独立语义令牌：由强调色/状态色混合派生（结果稳定、可单测）
    const magenta =
        accentHover !== null && danger !== null
            ? mixColor(accentHover, danger, 0.5, accentHover)
            : null
    const cyan = info !== null && success !== null ? mixColor(info, success, 0.5, info) : null

    const theme: ITheme = {}
    if (background !== null) {
        theme.background = background
    }
    if (foreground !== null) {
        theme.foreground = foreground
    }
    if (accent !== null) {
        theme.cursor = accent
        if (background !== null) {
            theme.cursorAccent = background
        }
    }
    const selectionBackground = resolveSelectionBackground(getVariable, accent)
    if (selectionBackground !== null) {
        theme.selectionBackground = selectionBackground
    }
    if (textTertiary !== null) {
        theme.black = textTertiary
    }
    if (danger !== null) {
        theme.red = danger
        theme.brightRed = emphasize(danger)
    }
    if (success !== null) {
        theme.green = success
        theme.brightGreen = emphasize(success)
    }
    if (warning !== null) {
        theme.yellow = warning
        theme.brightYellow = emphasize(warning)
    }
    if (info !== null) {
        theme.blue = info
        theme.brightBlue = emphasize(info)
    }
    if (magenta !== null) {
        theme.magenta = magenta
        theme.brightMagenta = emphasize(magenta)
    }
    if (cyan !== null) {
        theme.cyan = cyan
        theme.brightCyan = emphasize(cyan)
    }
    if (foreground !== null) {
        theme.white = foreground
        theme.brightWhite = emphasize(foreground)
    }
    if (textSecondary !== null) {
        theme.brightBlack = textSecondary
    }
    return theme
}

/**
 * 读取当前应用主题下的 xterm 主题。
 *
 * @param documentRef 目标 Document（缺省取全局 document；测试可注入替身）
 * @returns xterm 主题；非 DOM 环境/无法读取时返回空主题（xterm 内置默认配色，不抛异常）
 */
export function readTerminalTheme(documentRef?: Document | null): ITheme {
    const targetDocument = documentRef ?? (typeof document === 'undefined' ? null : document)
    const canReadComputedStyle =
        targetDocument !== null &&
        targetDocument.documentElement !== null &&
        typeof window !== 'undefined' &&
        typeof window.getComputedStyle === 'function'
    if (!canReadComputedStyle) {
        return {}
    }
    const rootStyle = window.getComputedStyle(targetDocument.documentElement)
    return buildTerminalTheme((name) => rootStyle.getPropertyValue(name))
}
