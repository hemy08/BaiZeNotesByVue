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
 *
 * ## glass 非模糊弱效果增强（1.5.6 REQ-14）
 * 背景：整窗 backdrop-filter 因性能约束不启用，glass 只有悬浮层小面积模糊；在纯色/平坦
 * 背景上透明与质感表达偏弱（用户实测「切到玻璃看不到透明感」）。本批在**不启用整窗模糊、
 * 不提升模糊半径**的前提下，只增强「低透明度面 + 高光边」两个非模糊参数，让玻璃在平坦背景
 * 上可感知：
 * - `surfaceOpacity` 0.86 → 0.72：壳层（标题栏/状态栏/侧栏/工具窗/菜单/对话框）与内容区
 *   同时更透明，窗口背景的主题渐变光斑（强度同样由高光边令牌派生）可透出，平坦底色上出现
 *   可见的「透光 + 渐变」而非纯白面；
 * - `highlightBorderAlpha` 0.14 → 0.30：消费方的 `inset 0 1px 0 rgba(255,255,255,α)`
 *   白高光线（inset box-shadow）更清晰；该令牌同时放大窗口背景径向光斑强度
 *   （`BaiZeNotes.vue` 以 `--bz-glass-alpha` 派生 accent 55% / info 28%），是平坦背景上
 *   最主要的可感知来源。
 * 纸感 paper / 混合 hybrid / 工作台 workbench 令牌数值不变；深色 steady 稳健模式
 * （0.94 不透明 + 关闭模糊 + 高光 0.10）与「减少透明」回退规则保持不变（CSS 侧覆盖）。
 */
export interface UiStyleTokens {
    /** 悬浮面不透明度（glass 0.72 低透明度档；其余 1 = 不透明） */
    surfaceOpacity: number
    /** 悬浮面背景模糊半径（px；仅 glass 非 0，禁止整窗大面积模糊） */
    surfaceBlur: number
    /** 高光边 alpha（glass 0.30 = 白高光线 + 窗口光斑强度；其余 0 = 无高光边） */
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
        surfaceOpacity: 0.72,
        surfaceBlur: 8,
        highlightBorderAlpha: 0.3,
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

/**
 * z-index 语义相对阶梯（视觉升级方案 §3.3；防止组件各自定义层级）。
 *
 * 口径：0~80 的**相对阶梯**，新组件一律按相对层级消费；与主题/风格/密度正交，数值恒定。
 * 应用层高层浮层（写作模式 / 对话框 / 欢迎页 / 命令面板 / 缩放热区）在 0~80 之上另占
 * **100~120** 一段（`UI_Z_INDEX_APP_COMPAT` / `UI_Z_INDEX_APP_BASE`，见下），保持
 * 「语义阶梯整体低于应用层」的既有层级关系，且不改变组件的变量消费方式。
 */
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
 * 应用层相对阶梯（视觉升级 1.5.6 P2 批次 E：z-index 应用层相对阶梯化）。
 *
 * ## 从「兼容大数值」到「与语义阶梯协调的相对阶梯」
 * `UI_Z_INDEX_TOKENS` 是 0~80 的**语义相对阶梯**（新组件按相对层级消费）；应用层另有若干
 * 既有高层浮层，历史上直接写死大数值。视觉升级 P2 遗留项 4 先完成「裸值 → 命名令牌」的等值
 * 迁移（当时数值保持 9999 / 10000 / 3000，组件消费 `--ui-z-*-app`）；本批再把**令牌数值**
 * 改为相对档位，消除「大数值与语义阶梯脱节」的遗留：
 * - 语义阶梯 0~80 之上预留 **100~120** 作为应用层相对阶梯（10 一档，留出后续扩展间隙）；
 * - 对话框 / 非模态工具窗遮罩 = 110（原 9999）；
 * - 命令面板 = 120（原 10000，恒高于对话框一档，不依赖「同 z-index 下后渲染者在上」）。
 *
 * ## 层序保持（零回归论证）
 * 旧栈序：语义 0~80 ＜ 写作模式 3000 ＜ 对话框/欢迎页 9999 ＜ 命令面板/缩放热区 10000；
 * 新栈序：语义 0~80 ＜ 写作模式 100 ＜ 对话框/欢迎页 110 ＜ 命令面板/缩放热区 120。
 * 所有「严格小于 / 相等」关系逐对保持（见 `UI_Z_INDEX_APP_BASE`），组件消费的变量名与消费
 * 方式不变（仍 `var(--ui-z-*-app)`），因此栈序零变化；数值收敛为 3 位相对值后，层级语义与
 * `UI_Z_INDEX_TOKENS` 的 0~80 阶梯可直接对比阅读。
 *
 * ## 组件兜底值
 * 消费组件内 `var(--ui-z-dialog-app, 9999)` / `var(--ui-z-palette-app, 10000)` 的兜底只在
 * 样式表未加载（CSS 变量缺失）时生效，保留旧大数值作为「退化安全值」；正常路径恒命中
 * `:root` 的相对阶梯值，不影响本批层级收敛，也不参与单一真源校验。
 */
export const UI_Z_INDEX_APP_COMPAT = {
    /** 对话框 / 非模态工具窗遮罩层（原 9999 → 相对阶梯 110） */
    dialog: 110,
    /** 命令面板（原 10000 → 相对阶梯 120，= 对话框 + 1 档，保证命令面板恒在其它对话框之上） */
    commandPalette: 120
} as const

/**
 * 应用层基座层级（视觉升级 1.5.6 P2 批次 E：应用层基座相对阶梯化完成版）。
 *
 * ## 相对阶梯映射（旧值 → 新值；层序逐对保持）
 * - `writingMode` 3000 → 100：恒低于对话框/工具窗，其上弹窗始终可见（迁移前语义不变）；
 * - `welcome` 9999 → 110：与对话框同值。`App.vue` 中欢迎页与主界面为 `v-if` / `v-else`
 *   互斥渲染，等值不产生竞争（迁移前两者同为 9999，等值关系保持）；
 * - `resize` 10000 → 120：应用内最高层级（与命令面板同值）。`.resize-corner` 取本值、
 *   `.resize-edge` 取本值 − 1 = 119，角 12px 略高于边 6px（迁移前 10000 / 9999 的关系保持）。
 * 与语义阶梯的关系：三个基座均 > `UI_Z_INDEX_TOKENS.guide`(80)，即应用层整体位于语义阶梯
 * 之上——与迁移前「3000 / 9999 / 10000 均远大于 0~80」完全一致。
 *
 * ## 组内派生关系（保持「三值真源」，不额外扩表）
 * - 欢迎页内部窗口控制条 = welcome + 1 = 111（迁移前 10000；仅在本层 stacking context 内参与
 *   局部排序，`WelcomeScreen.vue` 以 `calc(var(--ui-z-welcome-app) + 1)` 表达）；
 * - 缩放热区「边」= resize − 1 = 119（迁移前 9999；`BaiZeNotes.vue` 以
 *   `calc(var(--ui-z-resize-app) - 1)` 表达）。
 *
 * ## 派生值说明（相对化后落在 110 / 120 两档之间，层级关系已评估）
 * - 111（欢迎页控制条）：`.welcome-screen` 为 fixed + z-index 的独立层叠上下文，控制条仅在本层
 *   内参与局部排序，+1 与迁移前的局部关系一致，不改变与对话框/缩放热区的既有栈序；
 * - 119（缩放热区「边」）：严格低于「角」120 与命令面板 120、严格高于对话框遮罩 110。迁移前
 *   「边」9999 与对话框遮罩 9999 **同值**（依赖 DOM 后绘制者在上，遮罩覆盖窗口边缘）；相对化后
 *   热区在窗口边缘严格居上——仅影响「模态遮罩打开时窗口 6px 边缘的拖拽缩放命中优先级」（热区为
 *   透明条带，不遮挡可见内容），风险评估与走查结论见 docs/design/DESIGN.md §5.4。
 *
 * ## 消费方式（唯一真源）
 * CSS 变量在 `styles/ui-style.css` 的 `:root` 逐项声明：`--ui-z-welcome-app` /
 * `--ui-z-resize-app` / `--ui-z-writing-mode-app` / `--ui-z-dialog-app` / `--ui-z-palette-app`；
 * 三个基座组件只消费变量，不再出现 `9999 / 10000 / 3000` 裸值。本表与 CSS 变量的逐项一致性由
 * `tests/unit/visual-p2-acceptance.test.ts` 静态校验（改一处必须同步改另一处，否则测试失败）。
 */
export const UI_Z_INDEX_APP_BASE = {
    /** 写作模式全屏层（原 3000 → 100；恒低于对话框/工具窗） */
    writingMode: 100,
    /** 全屏欢迎层（原 9999 → 110；与对话框同值，靠互斥渲染保证覆盖） */
    welcome: 110,
    /** 窗口缩放热区最高层（原 10000 → 120；角 = 本值，边 = 本值 - 1 = 119） */
    resize: 120
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
 * 5. 其余情况：glass 常规模式（0.72 低透明度 + 8px 小面积模糊 + 0.30 高光边，REQ-14 增强档）。
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
