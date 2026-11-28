// @vitest-environment node
/**
 * 1.5.7 LLM Wiki L4：关系图谱布局/视口纯函数单测（`Graph/graph-layout.ts`）。
 *
 * 覆盖：
 * 1. 布局确定性（同输入两次逐位一致；不同种子可产生不同结果）；
 * 2. 边界：空节点 / 单节点居中 / 坐标不越出画布留白范围 / 非法边端点被忽略；
 * 3. 节点去重与非法 id 防御；
 * 4. 标签密度阈值；
 * 5. 视口：缩放上下限、锚点保持不动、平移增量、非法值兜底。
 */
import { describe, it, expect } from 'vitest'

import {
    GRAPH_LAYOUT_HEIGHT,
    GRAPH_LAYOUT_PADDING,
    GRAPH_LAYOUT_WIDTH,
    GRAPH_MAX_SCALE,
    GRAPH_MIN_SCALE,
    computeGraphLayout,
    createGraphViewport,
    graphViewportToWorld,
    panGraphViewport,
    shouldShowNodeLabel,
    zoomGraphViewport
} from '../../../src/renderer/src/components/Graph/graph-layout'

/** 构造 n 个节点的线性链（1 → 2 → … → n） */
function makeChain(count: number): {
    nodes: Array<{ id: string }>
    edges: Array<{ source: string; target: string }>
} {
    const nodes = Array.from({ length: count }, (_, index) => ({ id: `node-${index}` }))
    const edges = Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
        source: `node-${index}`,
        target: `node-${index + 1}`
    }))
    return { nodes, edges }
}

describe('computeGraphLayout：确定性与边界', () => {
    it('空节点返回空 points（画布尺寸仍可消费）', () => {
        const layout = computeGraphLayout([], [])
        expect(layout.points).toEqual([])
        expect(layout.width).toBe(GRAPH_LAYOUT_WIDTH)
        expect(layout.height).toBe(GRAPH_LAYOUT_HEIGHT)
    })

    it('单节点位于画布中心', () => {
        const layout = computeGraphLayout([{ id: 'a' }], [])
        expect(layout.points).toHaveLength(1)
        expect(layout.points[0]).toEqual({
            id: 'a',
            x: GRAPH_LAYOUT_WIDTH / 2,
            y: GRAPH_LAYOUT_HEIGHT / 2
        })
    })

    it('同输入两次结果逐位一致（确定性）', () => {
        const { nodes, edges } = makeChain(24)
        const first = computeGraphLayout(nodes, edges)
        const second = computeGraphLayout(nodes, edges)
        expect(second).toEqual(first)
    })

    it('种子参与初始抖动（0 轮迭代时不同种子产生不同初始位置）', () => {
        const { nodes } = makeChain(12)
        const first = computeGraphLayout(nodes, [], { seed: 1, iterations: 0 })
        const second = computeGraphLayout(nodes, [], { seed: 2, iterations: 0 })
        expect(second.points).not.toEqual(first.points)
        // 相同种子 + 相同输入仍逐位一致
        expect(computeGraphLayout(nodes, [], { seed: 1, iterations: 0 })).toEqual(first)
    })

    it('所有坐标不越出画布留白范围且为有限数', () => {
        const { nodes, edges } = makeChain(40)
        const layout = computeGraphLayout(nodes, edges)
        expect(layout.points).toHaveLength(40)
        for (const point of layout.points) {
            expect(Number.isFinite(point.x)).toBe(true)
            expect(Number.isFinite(point.y)).toBe(true)
            expect(point.x).toBeGreaterThanOrEqual(GRAPH_LAYOUT_PADDING)
            expect(point.x).toBeLessThanOrEqual(GRAPH_LAYOUT_WIDTH - GRAPH_LAYOUT_PADDING)
            expect(point.y).toBeGreaterThanOrEqual(GRAPH_LAYOUT_PADDING)
            expect(point.y).toBeLessThanOrEqual(GRAPH_LAYOUT_HEIGHT - GRAPH_LAYOUT_PADDING)
        }
    })

    it('重复/非法节点 id 去重，缺失端点的边被忽略（不抛异常）', () => {
        const layout = computeGraphLayout(
            [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 'b' }],
            [
                { source: 'a', target: 'b' },
                { source: 'a', target: 'missing' },
                { source: 'missing', target: 'b' },
                { source: 'a', target: 'a' }
            ]
        )
        expect(layout.points.map((point) => point.id)).toEqual(['a', 'b'])
    })

    it('无效宽度/高度/迭代数回落安全值（不产生 NaN）', () => {
        const layout = computeGraphLayout([{ id: 'a' }, { id: 'b' }], [], {
            width: 0,
            height: Number.NaN,
            iterations: -5
        })
        expect(layout.points).toHaveLength(2)
        for (const point of layout.points) {
            expect(Number.isFinite(point.x)).toBe(true)
            expect(Number.isFinite(point.y)).toBe(true)
        }
    })
})

describe('shouldShowNodeLabel：标签密度', () => {
    it('节点数不超过阈值时全部展示标签', () => {
        expect(shouldShowNodeLabel(10, 0)).toBe(true)
        expect(shouldShowNodeLabel(60, 0)).toBe(true)
    })

    it('超过阈值后只展示连接度达到阈值的节点', () => {
        expect(shouldShowNodeLabel(61, 2)).toBe(false)
        expect(shouldShowNodeLabel(61, 3)).toBe(true)
        expect(shouldShowNodeLabel(200, 10)).toBe(true)
    })

    it('阈值参数可覆盖（供后续调参/单测注入）', () => {
        expect(shouldShowNodeLabel(5, 0, 4, 1)).toBe(false)
        expect(shouldShowNodeLabel(5, 1, 4, 1)).toBe(true)
    })
})

describe('视口纯函数：缩放 / 平移', () => {
    it('初始视口为 1 倍、无平移', () => {
        expect(createGraphViewport()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
    })

    it('缩放倍率收敛到 [MIN, MAX]', () => {
        const viewport = createGraphViewport()
        expect(zoomGraphViewport(viewport, 100, 100, 100).scale).toBe(GRAPH_MAX_SCALE)
        expect(zoomGraphViewport(viewport, 100, 100, 0.01).scale).toBe(GRAPH_MIN_SCALE)
        // 非法倍率忽略该次缩放
        expect(zoomGraphViewport(viewport, 100, 100, Number.NaN)).toEqual(viewport)
    })

    it('以屏幕点为锚点缩放时，该点对应的世界坐标保持不变', () => {
        const viewport = createGraphViewport()
        const anchorX = 320
        const anchorY = 180
        const before = graphViewportToWorld(viewport, anchorX, anchorY)
        const zoomed = zoomGraphViewport(viewport, anchorX, anchorY, 2)
        const after = graphViewportToWorld(zoomed, anchorX, anchorY)
        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
    })

    it('平移按屏幕增量累加；非法增量按 0 处理', () => {
        const moved = panGraphViewport(createGraphViewport(), 12, -8)
        expect(moved).toEqual({ scale: 1, offsetX: 12, offsetY: -8 })
        expect(panGraphViewport(moved, Number.NaN, Number.POSITIVE_INFINITY)).toEqual(moved)
    })

    it('屏幕 → 世界坐标换算与缩放平移一致', () => {
        const viewport = { scale: 2, offsetX: 10, offsetY: 20 }
        expect(graphViewportToWorld(viewport, 110, 220)).toEqual({ x: 50, y: 100 })
        // 倍率非法时按 1 处理，不产生 NaN
        expect(graphViewportToWorld({ scale: 0, offsetX: 0, offsetY: 0 }, 30, 40)).toEqual({
            x: 30,
            y: 40
        })
    })
})
