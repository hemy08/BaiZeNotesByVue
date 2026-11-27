/**
 * 界面风格层 / 密度层共享常量（视觉升级 P0 唯一真源）
 *
 * ## 分层关系（与主题正交）
 * - 主题（28 套）：只提供颜色（18 组语义令牌由 `src/shared/theme-tokens.ts` 派生）；
 * - 风格（4 种）：只提供材质/装饰（透明度、模糊、阴影、边框强度、圆角），
 *   由根元素 `data-style` 属性切换，CSS 变量表见 `styles/ui-style.css`；
 * - 密度（3 档）：只提供尺寸节奏（行高、控件高、内边距基准、工具窗标题栏高、UI 字号），
 *   由根元素 `data-density` 属性切换；
 * - 组合矩阵：28 主题 × 4 风格 × 3 密度，互不覆盖。
 *
 * ## 默认值 = 现状（硬约束）
 * 默认 `workbench` + `default` 密度下，全部尺寸/阴影/圆角与视觉升级前完全一致——
 * `UI_DENSITY_TOKENS.default` 与 `UI_STYLE_TOKENS.workbench` 是「默认观感零变化」的
 * 数值单一真源，`styles/ui-style.css` 与 `tests/unit/ui-style-tokens.test.ts` 均以此为基准。
 *
 * ## 本文件只放纯常量/纯函数
 * 不依赖 DOM/Node/Electron/Vue（ARCH-05）；不读配置、不写 DOM，运行时不产生副作用。
 */
import type { UiDensity, UiStyle } from '../types/system'

/** 界面风格合法取值（互斥单选；主进程 config-schema 枚举校验与本常量同源） */
export const UI_STYLE_VALUES = [
    'paper',
    'glass',
    'workbench',
    'hybrid'
] as const satisfies readonly UiStyle[]

/** 界面密度合法取值（主进程 config-schema 枚举校验与本常量同源） */
export const UI_DENSITY_VALUES = [
    'compact',
    'default',
    'spacious'
] as const satisfies readonly UiDensity[]

/** 默认界面风格：workbench（与视觉升级前工具区观感最接近，迁移成本最低） */
export const DEFAULT_UI_STYLE: UiStyle = 'workbench'

/** 默认界面密度：default（现状尺寸节奏不变） */
export const DEFAULT_UI_DENSITY: UiDensity = 'default'

/** 默认「减少透明效果」：关闭（glass 默认启用透明度） */
export const DEFAULT_UI_REDUCE_TRANSPARENCY = false

/** 根元素上承载风格/密度的 data 属性名（渲染层 useTheme 写入；P1 组件只读消费） */
export const UI_STYLE_CSS_ATTRIBUTES = {
    /** 生效风格（glass 降级后写降级目标 paper；原始请求值不写 DOM） */
    style: 'data-style',
    /** 密度档位 */
    density: 'data-density',
    /** 玻璃稳健模式（深色主题降透明度；normal / steady / flat） */
    glassMode: 'data-glass-mode',
    /** 减少透明（reduced / normal；兼容系统 prefers-reduced-transparency） */
    transparency: 'data-transparency'
} as const

/**
 * 密度令牌（3 档，数值单一真源）。
 *
 * 口径：与视觉升级前现状对齐（default 档 = 现状），紧凑/宽松按 ±4px 阶梯收缩/放宽。
 * 唯一真源约束：`styles/ui-style.css` 的 `[data-density]` 变量块必须与本表逐项一致，
 * 由 `tests/unit/ui-style-tokens.test.ts` 静态校验（禁止只改一处）。
 */
export interface UiDensityTokens {
    /** 行高：菜单项 / 表格行 / 列表项（px） */
    rowHeight: number
    /** 控件高：按钮 / 输入框 / 下拉（px） */
    controlHeight: number
    /** 内边距基准（px） */
    pad: number
    /** 非模态工具窗标题栏高（px） */
    titleBarHeight: number
    /** UI 字号（px；spacious 只放宽行高，字号不再增大） */
    fontSize: number
}

/** 三档密度令牌表（default 档 = 视觉升级前现状，硬约束） */
export const UI_DENSITY_TOKENS: Readonly<Record<UiDensity, UiDensityTokens>> = {
    compact: {
        rowHeight: 24,
        controlHeight: 28,
        pad: 8,
        titleBarHeight: 36,
        fontSize: 12
    },
    default: {
        rowHeight: 28,
        controlHeight: 32,
        pad: 12,
        titleBarHeight: 40,
        fontSize: 13
    },
    spacious: {
        rowHeight: 32,
        controlHeight: 36,
        pad: 16,
        titleBarHeight: 44,
        fontSize: 13
    }
}

/**
 * 风格令牌（4 种材质，数值单一真源）。
 *
 * - shadow-1/2/3 与视觉升级方案 §3.3 的三档阴影表一致（workbench = 基准档）；
 * - paper 阴影整体减弱约 33%（0.06/0.12/0.18 → 0.04/0.08/0.12）；
 * - glass 阴影更柔（同透明度下扩散更大），配 8px 小面积模糊与高光边；
 * - hybrid 的「外壳」沿用 workbench（本表取 workbench 值），「内容区」材质见
 *   `UI_CONTENT_MATERIAL`（取 paper 值），二者在内容区边界自然分界。
 */
export interface UiStyleTokens {
    /** 悬浮面不透明度（glass 0.86；其余 1 = 不透明） */
    surfaceOpacity: number
    /** 悬浮面背景模糊半径（px；仅 glass 非 0，禁止整窗大面积模糊） */
    surfaceBlur: number
    /** 高光边 alpha（glass 0.14 = 10~18% 白高光；其余 0 = 无高光边） */
    highlightBorderAlpha: number
    /** 小圆角（chip / 标签 / 菜单项，px） */
    radiusSm: number
    /** 中圆角（输入框 / 卡片，px） */
    radiusMd: number
    /** 大圆角（对话框 / 工具窗 / 命令面板，px） */
    radiusLg: number
    /** 一级阴影（卡片 / 输入聚焦底） */
    shadow1: string
    /** 二级阴影（悬浮层 / 工具窗 / 下拉） */
    shadow2: string
    /** 三级阴影（对话框 / 命令面板） */
    shadow3: string
}

/** 四种风格的材质令牌表（workbench 为默认值 = 现状基准） */
export const UI_STYLE_TOKENS: Readonly<Record<UiStyle, UiStyleTokens>> = {
    paper: {
        surfaceOpacity: 1,
        surfaceBlur: 0,
        highlightBorderAlpha: 0,
        radiusSm: 4,
        radiusMd: 6,
        radiusLg: 8,
        shadow1: '0 1px 2px rgba(0, 0, 0, 0.04)',
        shadow2: '0 6px 24px rgba(0, 0, 0, 0.08)',
        shadow3: '0 16px 48px rgba(0, 0, 0, 0.12)'
    },
    glass: {
        surfaceOpacity: 0.86,
        surfaceBlur: 8,
        highlightBorderAlpha: 0.14,
        radiusSm: 8,
        radiusMd: 8,
        radiusLg: 12,
        shadow1: '0 1px 3px rgba(0, 0, 0, 0.05)',
        shadow2: '0 8px 32px rgba(0, 0, 0, 0.1)',
        shadow3: '0 20px 60px rgba(0, 0, 0, 0.16)'
    },
    workbench: {
        surfaceOpacity: 1,
        surfaceBlur: 0,
        highlightBorderAlpha: 0,
        radiusSm: 2,
        radiusMd: 4,
        radiusLg: 6,
        shadow1: '0 1px 2px rgba(0, 0, 0, 0.06)',
        shadow2: '0 6px 24px rgba(0, 0, 0, 0.12)',
        shadow3: '0 16px 48px rgba(0, 0, 0, 0.18)'
    },
    // hybrid：外壳（顶栏/侧栏/状态栏/工具窗/表格/命令面板）走 workbench 材质
    hybrid: {
        surfaceOpacity: 1,
        surfaceBlur: 0,
        highlightBorderAlpha: 0,
        radiusSm: 2,
        radiusMd: 4,
        radiusLg: 6,
        shadow1: '0 1px 2px rgba(0, 0, 0, 0.06)',
        shadow2: '0 6px 24px rgba(0, 0, 0, 0.12)',
        shadow3: '0 16px 48px rgba(0, 0, 0, 0.18)'
    }
}

/**
 * 各风格的「内容区」材质（正文/预览区域）。
 *
 * hybrid 是唯一双材质风格：外壳 = workbench、内容区 = paper（正文纸感 + 工具区紧凑）；
 * 其余风格内容区与外壳同材质。内容区边界口径见 `docs/design/DESIGN.md`：
 * 内容区 = 编辑器正文 / Markdown 预览（消费 `--ui-content-*` 变量），
 * 外壳 = 标题栏 / 菜单栏 / 侧栏 / 状态栏 / 工具窗 / 对话框 / 命令面板（消费 `--ui-*` 变量）。
 */
export const UI_CONTENT_MATERIAL: Readonly<Record<UiStyle, UiStyle>> = {
    paper: 'paper',
    glass: 'glass',
    workbench: 'workbench',
    hybrid: 'paper'
}

/** 动效令牌（视觉升级方案 §3.4；CSS 变量在 `styles/ui-style.css` 按本表声明） */
export const UI_MOTION_TOKENS = {
    /** 状态反馈（hover / active / toggle） */
    durationFast: '120ms',
    /** 弹出 / 收起（下拉、工具窗；自动淡入 + 位移 4px） */
    durationPop: '180ms',
    /** 对话框进出 */
    durationDialog: '240ms',
    /** 遮罩淡入 */
    durationOverlay: '200ms',
    /** 页面 / 模式切换 */
    durationPage: '300ms',
    /** 标准缓动（状态反馈 / 弹出） */
    easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
    /** 页面切换缓动 */
    easePage: 'cubic-bezier(0.4, 0, 0.2, 1)',
    /** prefers-reduced-motion 下时长降级 */
    reducedDuration: '0ms',
    /** prefers-reduced-motion 下允许保留的淡入时长 */
    reducedFadeDuration: '100ms'
} as const

/** z-index 层级表（视觉升级方案 §3.3；防止组件各自定义层级） */
export const UI_Z_INDEX_TOKENS = {
    content: 0,
    sidebar: 10,
    drag: 20,
    toolWindow: 30,
    dropdown: 40,
    dialog: 50,
    commandPalette: 60,
    toast: 70,
    guide: 80
} as const

/**
 * 应用层兼容层级（视觉升级 P2 / T12 收敛，语义令牌 → 既有高层浮层数值的唯一映射）。
 *
 * ## 为什么需要「语义 rank」之外的映射
 * `UI_Z_INDEX_TOKENS` 是 0~80 的**语义相对阶梯**（新组件一律按相对层级消费），但当前应用
 * 存在若干 P2 写域之外的既有高层浮层，它们直接写死大数值、且必须与对话框的相对顺序保持
 * 不变（任何调整都可能在写作模式/欢迎页/窗口缩放热区上产生真实回归）：
 * - 欢迎页 `WelcomeScreen.vue`：`z-index: 9999`（全屏欢迎层）；
 * - 写作模式 `WritingModeHost.vue`：`z-index: 3000`（全屏写作层，必须被对话框/工具窗压住）；
 * - 窗口缩放热区 `BaiZeNotes.vue`：`.resize-edge` 9999 / `.resize-corner` 10000（无边框窗口
 *   拖拽缩放热区，位于视口四周，需保持在最上层）。
 *
 * 因此 T12 采用「保留既有栈序 + 收敛为单一命名令牌」策略：
 * - 对话框/非模态工具窗 = 9999（与既有 9999 完全等值，全部浮层行为零变化）；
 * - 命令面板 = 10000（比对话框高 1 档，保证后打开的命令面板永远在对话框/工具窗之上，
 *   不再依赖「同 z-index 下后渲染者在上」的 DOM 顺序巧合；同时仍低于 `.resize-corner`
 *   的 10000 同值不覆盖——热区只有 12px 边缘，命中优先级不变）。
 *
 * 后续把欢迎页/写作模式/缩放热区统一迁移到 `UI_Z_INDEX_TOKENS` 相对阶梯时，只需把本表
 * 与 `styles/ui-style.css` 的 `--ui-z-*-app` 变量改为相对值即可，组件无需再改。
 */
export const UI_Z_INDEX_APP_COMPAT = {
    /** 对话框 / 非模态工具窗遮罩层（= 既有 9999） */
    dialog: 9999,
    /** 命令面板（= 对话框 + 1，保证命令面板恒在其它对话框之上） */
    commandPalette: 10000
} as const

/** 玻璃材质模式：normal（常规）/ steady（深色主题稳健模式：降透明度、关模糊）/ flat（已回退纸感） */
export type GlassMode = 'normal' | 'steady' | 'flat'

/** 风格解析上下文（由 useTheme 从主题数据与系统设置收集，本模块只做纯计算） */
export interface UiStyleContext {
    /** 当前主题是否深色底（按实际配色亮度判定，含分组偏差修正） */
    isDark: boolean
    /** 当前主题是否高饱和/渐变主题（shared SATURATED_THEME_TYPES） */
    isSaturated: boolean
    /** 当前主题是否护眼主题（shared EYECARE_THEME_TYPES） */
    isEyecare: boolean
    /** 用户是否开启「减少透明效果」 */
    reduceTransparency: boolean
    /** 系统是否偏好减少透明（prefers-reduced-transparency: reduce） */
    preferReducedTransparency: boolean
}

/** 风格解析结果 */
export interface EffectiveUiStyle {
    /** 实际生效材质（写根元素 data-style；降级时可能不同于请求值） */
    style: UiStyle
    /** 玻璃材质模式（写根元素 data-glass-mode） */
    glassMode: GlassMode
}

/**
 * 解析实际生效的界面风格（纯函数）。
 *
 * 降级规则（视觉升级方案 §5.1）：
 * 1. 非 glass 风格：原样生效（paper/workbench/hybrid 不受主题类别影响）；
 * 2. glass + 「减少透明」开关 或 系统 prefers-reduced-transparency：回退 paper 材质；
 * 3. glass + 高饱和/渐变主题 或 护眼主题：回退 paper 材质（半透明叠彩色/低对比底会失控）；
 * 4. glass + 深色主题：保留 glass 但进入 steady 稳健模式（CSS 降低透明度、关闭模糊）；
 * 5. 其余情况：glass 常规模式（0.86 不透明度 + 8px 小面积模糊）。
 */
export function resolveEffectiveUiStyle(
    requested: UiStyle,
    context: UiStyleContext
): EffectiveUiStyle {
    if (requested !== 'glass') {
        return { style: requested, glassMode: 'normal' }
    }
    if (context.reduceTransparency || context.preferReducedTransparency) {
        return { style: 'paper', glassMode: 'flat' }
    }
    if (context.isSaturated || context.isEyecare) {
        return { style: 'paper', glassMode: 'flat' }
    }
    if (context.isDark) {
        return { style: 'glass', glassMode: 'steady' }
    }
    return { style: 'glass', glassMode: 'normal' }
}

/** 归一化界面风格：未知值回落默认 workbench（CFG-10 白名单归一化口径） */
export function normalizeUiStyle(value: unknown): UiStyle {
    return typeof value === 'string' && (UI_STYLE_VALUES as readonly string[]).includes(value)
        ? (value as UiStyle)
        : DEFAULT_UI_STYLE
}

/** 归一化界面密度：未知值回落默认 default */
export function normalizeUiDensity(value: unknown): UiDensity {
    return typeof value === 'string' && (UI_DENSITY_VALUES as readonly string[]).includes(value)
        ? (value as UiDensity)
        : DEFAULT_UI_DENSITY
}

/** 归一化「减少透明效果」：仅接受布尔值，其余回落默认 false */
export function normalizeUiReduceTransparency(value: unknown): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_UI_REDUCE_TRANSPARENCY
}
