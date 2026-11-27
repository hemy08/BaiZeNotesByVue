/**
 * 菜单浮层视口定位纯函数（1.5.5 用户反馈修复：菜单滚动条 / 三级子菜单被裁剪 / 靠右菜单越界）
 *
 * ## 为什么单独抽层
 * 用户反馈的两个定位问题本质都是「浮层几何计算」：
 * - 顶级下拉用固定 `left/top` 跟随菜单项，必须按**实测宽高**夹取到视口内（此前写死 220px 宽度，
 *   实际下拉可达 400px，靠近窗口右缘的「AI 导航」等菜单会溢出被裁剪）；
 * - 嵌套（三级）子菜单固定从父项右侧 100% 展开，右侧空间不足时必须翻转到左侧
 *   （此前 `overflow-y: auto` 还会把绝对定位的嵌套层整体裁掉，用户看到「子菜单没展示」）。
 *
 * 抽成纯函数后：组件只负责「量 DOM + 写 class/style」，边界（左右夹取、翻转取舍、
 * 实测宽度缺失兜底）可脱离 jsdom 直接单测，后续菜单层级/尺寸调整也只改这一处。
 *
 * ## 坐标口径
 * 全部使用视口坐标系（与 `getBoundingClientRect()` 一致），不涉及滚动偏移换算；
 * 下拉容器是 teleport 到 body 的 `position: fixed` 浮层，因此可直接相减。
 *
 * ## 风格/密度无关
 * 本模块不含任何主题色/风格判断（ARCH-05：shared/renderer 纯计算层），只消费调用方传入的
 * 「实测尺寸 + 视口尺寸 + 内边距」。
 */

/** 浮层与视口边缘的最小间距（与既有菜单定位口径一致：8px） */
export const MENU_VIEWPORT_PADDING = 8

/**
 * 下拉面板宽度兜底值（px）。
 *
 * 对应 `MenuSubmenu.vue` 的 `.submenu-list { min-width: 220px }`：jsdom 不排版时
 * `getBoundingClientRect()` 恒为 0，必须用「最窄宽度」兜底才能保证既有定位用例可复现；
 * 真实渲染下调用方传入实测宽度，兜底值不生效。
 */
export const SUBMENU_WIDTH_FALLBACK = 220

/** 顶级下拉的视口定位结果（视口坐标系） */
export interface SubmenuPosition {
    /** 下拉左边缘（px） */
    x: number
    /** 下拉上边缘（px） */
    y: number
}

/** 顶级下拉定位输入（实测量由组件传入，纯函数不做 DOM 访问） */
export interface TopSubmenuPlacementInput {
    /** 顶层菜单项左边缘（`getBoundingClientRect().left`） */
    anchorX: number
    /** 顶层菜单项下边缘（`getBoundingClientRect().bottom`） */
    anchorY: number
    /** 实测下拉宽度（未测量/为 0 时用 `SUBMENU_WIDTH_FALLBACK`） */
    submenuWidth?: number
    /** 实测下拉高度（未测量/为 0 时不参与纵向夹取） */
    submenuHeight?: number
    /** 视口宽度（`window.innerWidth`） */
    viewportWidth: number
    /** 视口高度（`window.innerHeight`） */
    viewportHeight: number
    /** 与视口边缘的最小间距（默认 `MENU_VIEWPORT_PADDING`） */
    padding?: number
}

/** 嵌套子菜单展开方向：right = 父项右侧（默认），left = 翻转至父项左侧 */
export type NestedSubmenuSide = 'right' | 'left'

/** 嵌套子菜单水平放置输入 */
export interface NestedSubmenuPlacementInput {
    /** 触发组（`.submenu-item-wrapper`）左边缘 */
    triggerLeft: number
    /** 触发组（`.submenu-item-wrapper`）右边缘 */
    triggerRight: number
    /** 实测嵌套面板宽度（未测量/为 0 时用 `SUBMENU_WIDTH_FALLBACK`） */
    submenuWidth?: number
    /** 视口宽度 */
    viewportWidth: number
    /** 与视口边缘的最小间距（默认 `MENU_VIEWPORT_PADDING`） */
    padding?: number
}

/** 取有限数值，非法值（NaN/Infinity/undefined）回落兜底 */
function toFiniteOr(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 归一化最小间距：负数按 0 处理（调用方传错值时退化但不出界） */
function normalizePadding(padding: number | undefined): number {
    return Math.max(0, toFiniteOr(padding, MENU_VIEWPORT_PADDING))
}

/** 归一化实测宽度：≤0（未测量/隐藏）时回落到最窄宽度兜底 */
function normalizeSubmenuWidth(width: number | undefined): number {
    const measured = toFiniteOr(width, 0)
    return measured > 0 ? measured : SUBMENU_WIDTH_FALLBACK
}

/**
 * 计算顶级下拉的视口内位置。
 *
 * 规则（顺序即优先级）：
 * 1. 右缘 clamp：`x + 宽度 + padding > 视口宽` 时左移，使右边缘贴住 `视口宽 - padding`；
 * 2. 左缘 clamp：结果仍 `< padding`（浮层比可用视口还宽/锚点极左）时贴住左缘；
 * 3. 顶部 clamp：`y < padding` 时下移到 `padding`；
 * 4. 底部 clamp：仅在传入实测高度时生效——`y + 高度 + padding > 视口高` 时上移，
 *    上移后仍不小于 `padding`（菜单比视口高时只能贴顶，由窗口自然裁剪，不再引入滚动容器，
 *    避免再次出现用户反馈的滚动条与嵌套裁剪）。
 */
export function resolveTopSubmenuPosition(input: TopSubmenuPlacementInput): SubmenuPosition {
    const padding = normalizePadding(input.padding)
    const viewportWidth = toFiniteOr(input.viewportWidth, 0)
    const viewportHeight = toFiniteOr(input.viewportHeight, 0)
    const width = normalizeSubmenuWidth(input.submenuWidth)
    const height = Math.max(0, toFiniteOr(input.submenuHeight, 0))

    // 水平：先按右缘夹取（贴住窗口右侧内边距），再兜底左缘
    let x = toFiniteOr(input.anchorX, padding)
    if (x + width + padding > viewportWidth) {
        x = viewportWidth - width - padding
    }
    if (x < padding) {
        x = padding
    }

    // 垂直：顶部至少留出 padding；实测高度已知时保证下边缘也不出视口
    let y = toFiniteOr(input.anchorY, padding)
    if (y < padding) {
        y = padding
    }
    if (height > 0 && y + height + padding > viewportHeight) {
        y = Math.max(padding, viewportHeight - height - padding)
    }

    return { x, y }
}

/**
 * 决定嵌套子菜单展开在父项右侧还是翻转至左侧。
 *
 * 规则：
 * 1. 右侧可用空间（`视口宽 - padding - 父项右边缘`）足够 → 右侧（与既有默认一致）；
 * 2. 否则左侧可用空间（`父项左边缘 - padding`）足够 → 左侧翻转；
 * 3. 两侧都不足 → 选空间更大的一侧（保证至少展示更多内容，不整块移出视口）。
 */
export function resolveNestedSubmenuSide(input: NestedSubmenuPlacementInput): NestedSubmenuSide {
    const padding = normalizePadding(input.padding)
    const viewportWidth = toFiniteOr(input.viewportWidth, 0)
    const width = normalizeSubmenuWidth(input.submenuWidth)
    const triggerLeft = toFiniteOr(input.triggerLeft, 0)
    const triggerRight = toFiniteOr(input.triggerRight, triggerLeft)

    const rightSpace = viewportWidth - padding - triggerRight
    if (rightSpace >= width) {
        return 'right'
    }
    const leftSpace = triggerLeft - padding
    if (leftSpace >= width) {
        return 'left'
    }
    return leftSpace > rightSpace ? 'left' : 'right'
}
