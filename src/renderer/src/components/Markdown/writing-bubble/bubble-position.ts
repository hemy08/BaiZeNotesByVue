/**
 * 写作气泡工具栏 / Slash 命令菜单 —— 浮层定位纯函数（P0-6）
 *
 * 坐标口径：全部使用「视口坐标」。宿主组件以 `position: fixed` 渲染浮层，因此：
 * 1. 编辑器在视口中的位置取自 `editor.getDomNode().getBoundingClientRect()`（top/left）；
 * 2. 行/光标相对编辑器左上角的可视位置取自 `editor.getScrolledVisiblePosition(...)`
 *    （返回 { top, left, height }，已扣除滚动量）；
 * 3. 两者相加得到锚点，再按视口边界钳制，避免浮层被裁出屏幕。
 *
 * 本模块不依赖 Vue / Monaco / DOM，边界（上方空间不足翻转、贴边钳制、非法输入）全部
 * 可用纯函数单测覆盖；组件只负责取数据与渲染。
 */

/** 视口尺寸（window.innerWidth / innerHeight） */
export interface ViewportSize {
    width: number
    height: number
}

/** 浮层尺寸 */
export interface Size {
    width: number
    height: number
}

/** 视口坐标点 */
export interface Point {
    top: number
    left: number
}

/** 行/光标在视口中的矩形（只有高度，宽度由浮层自身决定） */
export interface LineRect extends Point {
    height: number
}

/** 浮层相对锚点的展示方向 */
export type FloatingPlacement = 'above' | 'below'

/** 计算后的浮层位置（top/left 已取整，直接用于 CSS px） */
export interface FloatingPosition {
    top: number
    left: number
    placement: FloatingPlacement
}

/** 气泡工具栏定位入参 */
export interface BubblePositionInput {
    /** 编辑器 DOM 在视口中的位置（getBoundingClientRect 的 top/left） */
    editorRect: Point
    /** 选区起始行相对编辑器左上角的可视位置 */
    lineRect: LineRect
    /** 气泡工具栏尺寸（由按钮数量推导，见 computeBubbleToolbarSize） */
    bubbleSize: Size
    /** 视口尺寸 */
    viewport: ViewportSize
    /** 浮层与锚点的垂直间距（默认 FLOATING_GAP） */
    gap?: number
    /** 浮层与视口边缘的最小间距（默认 VIEWPORT_MARGIN） */
    margin?: number
}

/** Slash 菜单定位入参 */
export interface SlashMenuPositionInput {
    /** 编辑器 DOM 在视口中的位置（getBoundingClientRect 的 top/left） */
    editorRect: Point
    /** 光标行相对编辑器左上角的可视位置 */
    cursorRect: LineRect
    /** 菜单尺寸（由命令条数推导，见 computeSlashMenuSize） */
    menuSize: Size
    /** 视口尺寸 */
    viewport: ViewportSize
    gap?: number
    margin?: number
}

/** 浮层与锚点的默认垂直间距（px） */
export const FLOATING_GAP = 8
/** 浮层与视口边缘的默认最小间距（px） */
export const VIEWPORT_MARGIN = 8

/** 气泡按钮尺寸（与 EditorBubbleToolbar.vue 的 .writing-bubble__btn 样式保持一致） */
export const BUBBLE_BUTTON_SIZE: Size = { width: 26, height: 26 }
/** 气泡按钮间距（与 .writing-bubble 的 gap 一致） */
export const BUBBLE_BUTTON_GAP = 2
/** 气泡面板内边距（与 .writing-bubble 的 padding 一致） */
export const BUBBLE_PANEL_PADDING = 4
/** 气泡面板边框宽度（与 .writing-bubble 的 border 一致） */
export const BUBBLE_PANEL_BORDER = 1

/** Slash 菜单固定宽度（与 .writing-slash 的 width 一致） */
export const SLASH_MENU_WIDTH = 240
/** Slash 菜单最大高度（与 .writing-slash 的 max-height 一致） */
export const SLASH_MENU_MAX_HEIGHT = 240
/** Slash 单条命令的估算高度（含上下内边距，与样式保持一致） */
export const SLASH_MENU_ITEM_HEIGHT = 26
/** Slash 菜单除列表项以外的固定高度（上下内边距 + 底部提示行 + 边框） */
export const SLASH_MENU_EXTRA_HEIGHT = 46

/** 数值是否为有限数（NaN / Infinity 视为非法输入） */
function isFiniteNumber(value: number): boolean {
    return typeof value === 'number' && Number.isFinite(value)
}

/** 视口尺寸是否可用（宽高必须为正） */
function isValidViewport(viewport: ViewportSize): boolean {
    return (
        isFiniteNumber(viewport.width) &&
        isFiniteNumber(viewport.height) &&
        viewport.width > 0 &&
        viewport.height > 0
    )
}

/** 浮层尺寸是否可用（宽高必须为正，避免除零/负宽度钳制） */
function isValidSize(size: Size): boolean {
    return (
        isFiniteNumber(size.width) &&
        isFiniteNumber(size.height) &&
        size.width > 0 &&
        size.height > 0
    )
}

/** 锚点位置是否可用（Monaco 在行不可见时可能返回异常值，必须拦截） */
function isValidPoint(point: Point): boolean {
    return isFiniteNumber(point.top) && isFiniteNumber(point.left)
}

/** 行矩形是否可用（高度允许为 0，但不允许负数/NaN） */
function isValidLineRect(lineRect: LineRect): boolean {
    return isValidPoint(lineRect) && isFiniteNumber(lineRect.height) && lineRect.height >= 0
}

/** 解析间距：未传/非法/负数时回落默认值 */
export function resolveGap(gap?: number): number {
    if (typeof gap === 'number' && Number.isFinite(gap) && gap >= 0) return gap
    return FLOATING_GAP
}

/** 解析边缘边距：未传/非法/负数时回落默认值 */
export function resolveMargin(margin?: number): number {
    if (typeof margin === 'number' && Number.isFinite(margin) && margin >= 0) return margin
    return VIEWPORT_MARGIN
}

/** 数值钳制（max < min 时取下限，保证返回有限值） */
export function clampValue(value: number, min: number, max: number): number {
    if (max < min) return min
    return Math.min(Math.max(value, min), max)
}

/** 可视区垂直可用空间（上下各留 margin） */
function verticalRange(viewport: ViewportSize, margin: number): { min: number; max: number } {
    return { min: margin, max: viewport.height - margin }
}

/**
 * 由按钮数量推导气泡工具栏尺寸：
 * 宽度 = 按钮数 × 宽 + 按钮间距 × (按钮数 - 1) + 左右内边距 + 左右边框；
 * 高度 = 按钮高 + 上下内边距 + 上下边框。
 */
export function computeBubbleToolbarSize(buttonCount: number): Size {
    const count = Number.isInteger(buttonCount) && buttonCount > 0 ? buttonCount : 0
    const contentWidth =
        count * BUBBLE_BUTTON_SIZE.width + Math.max(0, count - 1) * BUBBLE_BUTTON_GAP
    return {
        width: contentWidth + BUBBLE_PANEL_PADDING * 2 + BUBBLE_PANEL_BORDER * 2,
        height: BUBBLE_BUTTON_SIZE.height + BUBBLE_PANEL_PADDING * 2 + BUBBLE_PANEL_BORDER * 2
    }
}

/** 由命令条数推导 Slash 菜单尺寸（高度按条数估算并封顶，避免超出视口） */
export function computeSlashMenuSize(itemCount: number): Size {
    const count = Number.isInteger(itemCount) && itemCount > 0 ? itemCount : 0
    const height = count * SLASH_MENU_ITEM_HEIGHT + SLASH_MENU_EXTRA_HEIGHT
    return {
        width: SLASH_MENU_WIDTH,
        height: Math.min(height, SLASH_MENU_MAX_HEIGHT)
    }
}

/**
 * 计算气泡工具栏位置：
 * 1. 锚点优先放在选区起始行上方（工具栏不遮挡选中的文字），上方空间不足时翻转到行下方；
 * 2. 水平方向以选区起始列为准，超出视口则钳制到边缘；
 * 3. 任何整数非法/视口异常/尺寸异常都返回 null，由调用方隐藏浮层（不抛错）。
 */
export function computeBubblePosition(input: BubblePositionInput): FloatingPosition | null {
    const { editorRect, lineRect, bubbleSize, viewport } = input
    if (
        !isValidViewport(viewport) ||
        !isValidSize(bubbleSize) ||
        !isValidPoint(editorRect) ||
        !isValidLineRect(lineRect)
    ) {
        return null
    }
    const gap = resolveGap(input.gap)
    const margin = resolveMargin(input.margin)
    const anchorTop = editorRect.top + lineRect.top
    const anchorLeft = editorRect.left + lineRect.left
    const spaceAbove = anchorTop - gap - margin
    const placement: FloatingPlacement = spaceAbove >= bubbleSize.height ? 'above' : 'below'
    const rawTop =
        placement === 'above'
            ? anchorTop - gap - bubbleSize.height
            : anchorTop + lineRect.height + gap
    const { min: minTop, max: maxTopBase } = verticalRange(viewport, margin)
    const maxTop = maxTopBase - bubbleSize.height
    const maxLeft = viewport.width - margin - bubbleSize.width
    return {
        top: Math.round(clampValue(rawTop, minTop, maxTop)),
        left: Math.round(clampValue(anchorLeft, margin, maxLeft)),
        placement
    }
}

/**
 * 计算 Slash 菜单位置：
 * 1. 优先显示在光标行下方（不遮挡输入行）；
 * 2. 下方空间不足且上方空间足够时翻转显示在光标行上方；
 * 3. 上下都不足时仍放下方并钳制到视口内（菜单自身 max-height + 滚动兜底）。
 */
export function computeSlashMenuPosition(input: SlashMenuPositionInput): FloatingPosition | null {
    const { editorRect, cursorRect, menuSize, viewport } = input
    if (
        !isValidViewport(viewport) ||
        !isValidSize(menuSize) ||
        !isValidPoint(editorRect) ||
        !isValidLineRect(cursorRect)
    ) {
        return null
    }
    const gap = resolveGap(input.gap)
    const margin = resolveMargin(input.margin)
    const anchorTop = editorRect.top + cursorRect.top
    const anchorLeft = editorRect.left + cursorRect.left
    const belowTop = anchorTop + cursorRect.height + gap
    const aboveTop = anchorTop - gap - menuSize.height
    const { min: minTop, max: maxTopBase } = verticalRange(viewport, margin)
    const maxTop = maxTopBase - menuSize.height
    const fitsBelow = belowTop <= maxTop
    const fitsAbove = aboveTop >= minTop
    const placement: FloatingPlacement = fitsBelow || !fitsAbove ? 'below' : 'above'
    const rawTop = placement === 'below' ? belowTop : aboveTop
    const maxLeft = viewport.width - margin - menuSize.width
    return {
        top: Math.round(clampValue(rawTop, minTop, maxTop)),
        left: Math.round(clampValue(anchorLeft, margin, maxLeft)),
        placement
    }
}
