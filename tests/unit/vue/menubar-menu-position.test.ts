/**
 * 菜单浮层视口定位纯函数单测（1.5.5 用户反馈修复：菜单右缘裁剪 / 三级子菜单翻转）
 *
 * 覆盖 `menu-position.ts` 的两组纯函数：
 * - `resolveTopSubmenuPosition`：顶级下拉按实测宽高夹取到视口内（右缘/左缘/顶部/底部）；
 * - `resolveNestedSubmenuSide`：嵌套子菜单右侧空间不足时翻转左侧的取舍规则。
 *
 * 组件层「量 DOM → 写 class/style」的行为见 `menubar-submenu-layout.test.ts`。
 */
import { describe, expect, it } from 'vitest'
import {
    MENU_VIEWPORT_PADDING,
    SUBMENU_WIDTH_FALLBACK,
    resolveNestedSubmenuSide,
    resolveTopSubmenuPosition
} from '../../../src/renderer/src/components/MenuBar/menu-position'

/** 视口样本：与 jsdom 默认 1024 × 768 一致，便于与组件用例对照 */
const VIEWPORT = { viewportWidth: 1024, viewportHeight: 768 } as const

describe('菜单定位常量与 CSS 契约对齐', () => {
    it('视口内边距 8px、最窄宽度兜底 220px（与 .submenu-list min-width 对齐）', () => {
        expect(MENU_VIEWPORT_PADDING).toBe(8)
        expect(SUBMENU_WIDTH_FALLBACK).toBe(220)
    })
})

describe('resolveTopSubmenuPosition：顶级下拉视口夹取', () => {
    it('不越界时原样使用锚点坐标', () => {
        expect(
            resolveTopSubmenuPosition({ ...VIEWPORT, anchorX: 100, anchorY: 40, submenuWidth: 220 })
        ).toEqual({ x: 100, y: 40 })
    })

    it('右缘越界时左移，使右边缘贴住「视口宽 - 8」', () => {
        // 220 兜底宽度（旧行为：1024 - 220 - 8 = 796）
        expect(resolveTopSubmenuPosition({ ...VIEWPORT, anchorX: 1000, anchorY: 100 })).toEqual({
            x: 796,
            y: 100
        })
        // 实测宽度 400（长菜单项/快捷键列）：按实测宽度夹取，不再溢出右缘
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 1000,
                anchorY: 100,
                submenuWidth: 400
            })
        ).toEqual({ x: 616, y: 100 })
    })

    it('左缘越界时钳制到 8px 内边距；可用视口比面板还窄时左缘优先', () => {
        expect(
            resolveTopSubmenuPosition({ ...VIEWPORT, anchorX: 0, anchorY: 40, submenuWidth: 220 })
        ).toEqual({ x: 8, y: 40 })
        // 视口宽 200、面板实测 400：左右都放不下 → 贴左缘 8
        expect(
            resolveTopSubmenuPosition({
                viewportWidth: 200,
                viewportHeight: 768,
                anchorX: 0,
                anchorY: 40,
                submenuWidth: 400
            })
        ).toEqual({ x: 8, y: 40 })
    })

    it('顶部越界时钳制到 8px 内边距', () => {
        expect(
            resolveTopSubmenuPosition({ ...VIEWPORT, anchorX: 10, anchorY: 0, submenuWidth: 220 })
        ).toEqual({ x: 10, y: 8 })
    })

    it('底部越界时按实测高度上移（替代已移除的滚动容器）', () => {
        // 700 + 300 + 8 > 768 → y = 768 - 300 - 8 = 460
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 100,
                anchorY: 700,
                submenuWidth: 220,
                submenuHeight: 300
            })
        ).toEqual({ x: 100, y: 460 })
    })

    it('菜单比视口还高时贴顶展示（不再引入滚动条，超出部分由窗口自然裁剪）', () => {
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 100,
                anchorY: 40,
                submenuWidth: 220,
                submenuHeight: 900
            })
        ).toEqual({ x: 100, y: 8 })
    })

    it('未测量（0 / 非有限值 / 缺省）时回落最窄宽度并忽略高度夹取', () => {
        for (const submenuWidth of [undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(
                resolveTopSubmenuPosition({
                    ...VIEWPORT,
                    anchorX: 1000,
                    anchorY: 100,
                    submenuWidth
                }),
                String(submenuWidth)
            ).toEqual({ x: 796, y: 100 })
        }
        // 高度未测量：纵向不夹取（与旧行为一致），仅保留顶部 padding
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 10,
                anchorY: 700,
                submenuWidth: 220,
                submenuHeight: 0
            })
        ).toEqual({ x: 10, y: 700 })
    })

    it('自定义内边距按入参生效', () => {
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 1000,
                anchorY: 2,
                submenuWidth: 220,
                padding: 16
            })
        ).toEqual({ x: 1024 - 220 - 16, y: 16 })
    })

    it('非法锚点/视口尺寸不会产生 NaN 坐标', () => {
        expect(
            resolveTopSubmenuPosition({
                anchorX: Number.NaN,
                anchorY: Number.NaN,
                viewportWidth: Number.NaN,
                viewportHeight: Number.NaN,
                submenuWidth: Number.NaN
            })
        ).toEqual({ x: 8, y: 8 })
    })

    it('非法/负内边距按 0~默认值安全降级（不产生负坐标）', () => {
        // 负数内边距 → 按 0 处理：锚点 0 时不再左移出负坐标
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 0,
                anchorY: 0,
                submenuWidth: 220,
                padding: -5
            })
        ).toEqual({ x: 0, y: 0 })
        // 非有限内边距 → 回落默认 8
        expect(
            resolveTopSubmenuPosition({
                ...VIEWPORT,
                anchorX: 1000,
                anchorY: 4,
                submenuWidth: 220,
                padding: Number.NaN
            })
        ).toEqual({ x: 796, y: 8 })
    })
})

describe('resolveNestedSubmenuSide：嵌套子菜单左右翻转', () => {
    it('右侧空间足够时保持右侧展开（既有默认行为）', () => {
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 1024,
                triggerLeft: 600,
                triggerRight: 720,
                submenuWidth: 220
            })
        ).toBe('right')
    })

    it('右侧空间不足、左侧足够时翻转到左侧', () => {
        // 右侧可用 = 1024 - 8 - 900 = 116 < 220；左侧可用 = 800 - 8 = 792 ≥ 220
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 1024,
                triggerLeft: 800,
                triggerRight: 900,
                submenuWidth: 220
            })
        ).toBe('left')
    })

    it('右侧恰好放得下（边界相等）时仍保持右侧', () => {
        // 右侧可用 = 1024 - 8 - 796 = 220，与面板宽度相等
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 1024,
                triggerLeft: 700,
                triggerRight: 796,
                submenuWidth: 220
            })
        ).toBe('right')
    })

    it('两侧都不足时选空间更大的一侧（不整块移出视口）', () => {
        // 右侧 = 400 - 8 - 380 = 12；左侧 = 200 - 8 = 192 → 左侧空间更大
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 400,
                triggerLeft: 200,
                triggerRight: 380,
                submenuWidth: 300
            })
        ).toBe('left')
        // 右侧 = 400 - 8 - 150 = 242；左侧 = 20 - 8 = 12 → 右侧空间更大
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 400,
                triggerLeft: 20,
                triggerRight: 150,
                submenuWidth: 300
            })
        ).toBe('right')
    })

    it('未测量（0）时按最窄宽度 220 判定', () => {
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 400,
                triggerLeft: 350,
                triggerRight: 390,
                submenuWidth: 0
            })
        ).toBe('left')
    })

    it('自定义内边距与非法入参安全降级', () => {
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 1024,
                triggerLeft: 900,
                triggerRight: 1000,
                submenuWidth: 220,
                padding: 16
            })
        ).toBe('left')
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: Number.NaN,
                triggerLeft: Number.NaN,
                triggerRight: Number.NaN,
                submenuWidth: Number.NaN
            })
        ).toBe('right')
        // 非有限内边距回落默认 8：右侧 1024-8-1010=6 < 220、左侧 940-8=932 ≥ 220 → 左侧
        expect(
            resolveNestedSubmenuSide({
                viewportWidth: 1024,
                triggerLeft: 940,
                triggerRight: 1010,
                submenuWidth: 220,
                padding: Number.NaN
            })
        ).toBe('left')
    })
})
