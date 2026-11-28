/**
 * 1.5.7 LLM Wiki L4（T4.1）：关系图谱布局与视口纯函数（无 Vue / DOM 依赖）。
 *
 * ## 职责
 * - {@link computeGraphLayout}：确定性力导向布局（Fruchterman-Reingold 简化实现），
 *   不引入任何图库依赖；固定迭代次数 + 固定种子抖动，输入相同则输出逐位相同；
 * - 视口辅助（缩放/平移）：组件把 SVG 内的屏幕坐标换算为「世界坐标」后作用于
 *   `<g transform>`；纯函数便于单测（滚轮缩放时鼠标下的点保持不动）。
 *
 * ## 性能口径
 * 节点上限由 `graph-data.ts` 的 `GRAPH_MAX_NODES`（200）保证；本算法每轮 O(n²)
 * 引力/斥力计算，200 节点 × 默认 120 轮约 240 万次距离计算（几十毫秒级，单次打开时执行）。
 */
import type { GraphEdge, GraphNode } from './graph-data'

/** 布局画布逻辑宽度（viewBox 宽度；SVG 通过 viewBox 自适应容器） */
export const GRAPH_LAYOUT_WIDTH = 1000

/** 布局画布逻辑高度（viewBox 高度） */
export const GRAPH_LAYOUT_HEIGHT = 620

/** 布局默认迭代轮数（固定值，保证确定性） */
export const GRAPH_LAYOUT_ITERATIONS = 120

/** 布局画布四周留白（节点中心不会贴边） */
export const GRAPH_LAYOUT_PADDING = 40

/** 固定随机种子（打破初始圆环对称性，保证不同运行结果一致） */
export const GRAPH_LAYOUT_SEED = 20261128

/** 节点标签「全量展示」的节点数阈值（超过后只给高连接度节点显示标签，降低遮挡） */
export const GRAPH_LABEL_ALWAYS_MAX_NODES = 60

/** 节点数超过阈值时，仍展示标签的最小连接度（度为 0 的孤立节点不显示标签） */
export const GRAPH_LABEL_MIN_DEGREE = 3

/** 缩放上下限（滚轮/按钮缩放收敛到该区间，避免缩到不可见或无限放大） */
export const GRAPH_MIN_SCALE = 0.4
export const GRAPH_MAX_SCALE = 3

/** 布局坐标点（逻辑画布坐标，已截断到画布范围内） */
export interface GraphLayoutPoint {
    /** 节点 id（与 {@link GraphNode.id} 一致） */
    id: string
    /** 逻辑画布 x 坐标 */
    x: number
    /** 逻辑画布 y 坐标 */
    y: number
}

/** 布局结果（含画布尺寸，便于 SVG viewBox 直接消费） */
export interface GraphLayoutResult {
    width: number
    height: number
    points: GraphLayoutPoint[]
}

/** 布局选项（全部可选，缺省使用上面的常量） */
export interface GraphLayoutOptions {
    /** 逻辑画布宽度（缺省 {@link GRAPH_LAYOUT_WIDTH}） */
    width?: number
    /** 逻辑画布高度（缺省 {@link GRAPH_LAYOUT_HEIGHT}） */
    height?: number
    /** 迭代轮数（缺省 {@link GRAPH_LAYOUT_ITERATIONS}；非正数按 0 处理） */
    iterations?: number
    /** 留白（缺省 {@link GRAPH_LAYOUT_PADDING}；过大时按画布尺寸收窄） */
    padding?: number
    /** 随机种子（缺省 {@link GRAPH_LAYOUT_SEED}） */
    seed?: number
}

/** 视口状态（SVG `<g>` 的 `transform="translate(offsetX, offsetY) scale(scale)"`） */
export interface GraphViewport {
    /** 缩放倍率（{@link GRAPH_MIN_SCALE} ~ {@link GRAPH_MAX_SCALE}） */
    scale: number
    /** 屏幕 x 方向平移（px） */
    offsetX: number
    /** 屏幕 y 方向平移（px） */
    offsetY: number
}

/** 取有限数值（非法/非有限回退默认值） */
function resolveNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 创建确定性伪随机数生成器（mulberry32；用于初始抖动，非加密用途） */
function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let result = state
        result = Math.imul(result ^ (result >>> 15), result | 1)
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296
    }
}

/** 把坐标截断到 [min, max]；非有限值回退到中点 */
function clampPosition(value: number, min: number, max: number, center: number): number {
    if (!Number.isFinite(value)) {
        return center
    }
    if (value < min) {
        return min
    }
    if (value > max) {
        return max
    }
    return value
}

/** 保留两位小数（消除浮点尾差、便于测试断言确定性输出） */
function roundPosition(value: number): number {
    return Math.round(value * 100) / 100
}

/**
 * 计算确定性力导向布局。
 *
 * 算法（简化 Fruchterman-Reingold）：
 * 1. 初始位置：均匀分布在画布中心圆环上（半径 = 可用区域短边 40%），并用种子抖动
 *    打破完全对称，避免迭代初期节点重合；
 * 2. 每轮计算：任意两点斥力 `k²/d` + 边两端引力 `d²/k`（k = 可用面积均摊边长）；
 * 3. 位移按线性降温（`maxTemp` 递减到接近 0）限幅后应用，并截断在留白范围内；
 * 4. 迭代结束四舍五入到两位小数。
 *
 * 边界：
 * - 空节点 → 返回空 points；单节点 → 画布中心；
 * - 边端点不在节点表时忽略该边（防御过期/非法输入）；
 * - 所有输出坐标保证在 `[padding, width - padding]` 内（画布过小/留白过大时自动收窄）。
 *
 * @param nodes 节点（只用 `id`；重复 id 只保留首个）
 * @param edges 边（只用 `source` / `target`）
 * @param options 布局选项
 * @returns 布局结果（确定性；不修改入参）
 */
export function computeGraphLayout(
    nodes: readonly Pick<GraphNode, 'id'>[],
    edges: readonly Pick<GraphEdge, 'source' | 'target'>[],
    options: GraphLayoutOptions = {}
): GraphLayoutResult {
    const width = Math.max(1, resolveNumber(options.width, GRAPH_LAYOUT_WIDTH))
    const height = Math.max(1, resolveNumber(options.height, GRAPH_LAYOUT_HEIGHT))
    const iterationCount = Math.max(
        0,
        Math.floor(resolveNumber(options.iterations, GRAPH_LAYOUT_ITERATIONS))
    )
    const maxPadding = Math.max(0, Math.min(width, height) / 2 - 1)
    const padding = Math.max(
        0,
        Math.min(resolveNumber(options.padding, GRAPH_LAYOUT_PADDING), maxPadding)
    )
    const random = createSeededRandom(Math.floor(resolveNumber(options.seed, GRAPH_LAYOUT_SEED)))
    const centerX = width / 2
    const centerY = height / 2
    const minX = padding
    const maxX = width - padding
    const minY = padding
    const maxY = height - padding

    /** 去重后的节点 id（保持输入顺序，保证确定性） */
    const ids: string[] = []
    const indexById = new Map<string, number>()
    for (const node of nodes) {
        const id = typeof node?.id === 'string' ? node.id : ''
        if (id.length === 0 || indexById.has(id)) {
            continue
        }
        indexById.set(id, ids.length)
        ids.push(id)
    }
    const count = ids.length
    if (count === 0) {
        return { width, height, points: [] }
    }
    if (count === 1) {
        return {
            width,
            height,
            points: [{ id: ids[0], x: roundPosition(centerX), y: roundPosition(centerY) }]
        }
    }

    const positionsX = new Float64Array(count)
    const positionsY = new Float64Array(count)
    const radius = Math.min(maxX - minX, maxY - minY) * 0.4
    for (let index = 0; index < count; index += 1) {
        const angle = (2 * Math.PI * index) / count
        const jitter = (random() - 0.5) * 2
        positionsX[index] = centerX + Math.cos(angle) * radius + jitter
        positionsY[index] = centerY + Math.sin(angle) * radius + jitter
    }

    /** 引力边索引对（忽略端点缺失/自环；两端有效才参与） */
    const attractionPairs: Array<[number, number]> = []
    for (const edge of edges) {
        const source = indexById.get(edge?.source)
        const target = indexById.get(edge?.target)
        if (source === undefined || target === undefined || source === target) {
            continue
        }
        attractionPairs.push([source, target])
    }

    const area = (maxX - minX) * (maxY - minY)
    const idealDistance = Math.sqrt(area / count)
    const displacementX = new Float64Array(count)
    const displacementY = new Float64Array(count)
    const maxTemperature = Math.max(1, Math.min(width, height) / 10)
    const epsilon = 0.01

    for (let iteration = 0; iteration < iterationCount; iteration += 1) {
        displacementX.fill(0)
        displacementY.fill(0)

        // 斥力：任意两点（O(n²)）
        for (let left = 0; left < count; left += 1) {
            for (let right = left + 1; right < count; right += 1) {
                let deltaX = positionsX[left] - positionsX[right]
                let deltaY = positionsY[left] - positionsY[right]
                let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                if (distance < epsilon) {
                    // 完全重合时用确定性极小偏移拆开（避免除零与 NaN）
                    deltaX = (left - right) * epsilon
                    deltaY = epsilon
                    distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                }
                const force = (idealDistance * idealDistance) / distance
                const unitX = deltaX / distance
                const unitY = deltaY / distance
                displacementX[left] += unitX * force
                displacementY[left] += unitY * force
                displacementX[right] -= unitX * force
                displacementY[right] -= unitY * force
            }
        }

        // 引力：仅边两端
        for (const [source, target] of attractionPairs) {
            const deltaX = positionsX[source] - positionsX[target]
            const deltaY = positionsY[source] - positionsY[target]
            let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
            if (distance < epsilon) {
                distance = epsilon
            }
            const force = (distance * distance) / idealDistance
            const unitX = deltaX / distance
            const unitY = deltaY / distance
            displacementX[source] -= unitX * force
            displacementY[source] -= unitY * force
            displacementX[target] += unitX * force
            displacementY[target] += unitY * force
        }

        // 降温 + 限幅 + 边界截断
        const temperature = maxTemperature * (1 - iteration / Math.max(1, iterationCount)) + epsilon
        for (let index = 0; index < count; index += 1) {
            const length = Math.sqrt(
                displacementX[index] * displacementX[index] +
                    displacementY[index] * displacementY[index]
            )
            if (length <= 0 || !Number.isFinite(length)) {
                continue
            }
            const scale = Math.min(length, temperature) / length
            positionsX[index] = clampPosition(
                positionsX[index] + displacementX[index] * scale,
                minX,
                maxX,
                centerX
            )
            positionsY[index] = clampPosition(
                positionsY[index] + displacementY[index] * scale,
                minY,
                maxY,
                centerY
            )
        }
    }

    const points: GraphLayoutPoint[] = ids.map((id, index) => ({
        id,
        x: roundPosition(positionsX[index]),
        y: roundPosition(positionsY[index])
    }))
    return { width, height, points }
}

/**
 * 是否展示某节点标签（节点过多时只显示高连接度节点，降低标签遮挡）。
 *
 * @param nodeCount 当前图谱节点总数
 * @param degree 该节点连接度
 * @param alwaysMax 全量展示阈值（缺省 {@link GRAPH_LABEL_ALWAYS_MAX_NODES}）
 * @param minDegree 超阈值时仍展示的最小连接度（缺省 {@link GRAPH_LABEL_MIN_DEGREE}）
 */
export function shouldShowNodeLabel(
    nodeCount: number,
    degree: number,
    alwaysMax: number = GRAPH_LABEL_ALWAYS_MAX_NODES,
    minDegree: number = GRAPH_LABEL_MIN_DEGREE
): boolean {
    if (nodeCount <= alwaysMax) {
        return true
    }
    return degree >= minDegree
}

/** 创建初始视口（不缩放、不平移） */
export function createGraphViewport(): GraphViewport {
    return { scale: 1, offsetX: 0, offsetY: 0 }
}

/** 把缩放倍率截断到合法区间；非有限值回退 1 */
function clampScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1
    }
    return Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, scale))
}

/**
 * 以屏幕坐标 (screenX, screenY) 为锚点缩放视口（保持鼠标下的世界点不动）。
 *
 * 变换关系：`screen = offset + world * scale`；缩放后 world 不变 ⇒
 * `offset' = screen - (screen - offset) * scale' / scale`。
 *
 * @param viewport 当前视口
 * @param screenX 锚点屏幕 x（相对 SVG 左上角）
 * @param screenY 锚点屏幕 y
 * @param nextScale 目标缩放倍率（自动截断到合法区间；非法值忽略该次缩放）
 */
export function zoomGraphViewport(
    viewport: GraphViewport,
    screenX: number,
    screenY: number,
    nextScale: number
): GraphViewport {
    if (typeof nextScale !== 'number' || !Number.isFinite(nextScale)) {
        return { ...viewport }
    }
    const currentScale = clampScale(viewport.scale)
    const targetScale = clampScale(nextScale)
    if (targetScale === currentScale) {
        return { scale: currentScale, offsetX: viewport.offsetX, offsetY: viewport.offsetY }
    }
    const ratio = targetScale / currentScale
    return {
        scale: targetScale,
        offsetX: screenX - (screenX - viewport.offsetX) * ratio,
        offsetY: screenY - (screenY - viewport.offsetY) * ratio
    }
}

/** 平移视口（dx/dy 为屏幕 px 增量；非有限增量忽略） */
export function panGraphViewport(
    viewport: GraphViewport,
    deltaX: number,
    deltaY: number
): GraphViewport {
    const safeDeltaX = Number.isFinite(deltaX) ? deltaX : 0
    const safeDeltaY = Number.isFinite(deltaY) ? deltaY : 0
    return {
        scale: clampScale(viewport.scale),
        offsetX: viewport.offsetX + safeDeltaX,
        offsetY: viewport.offsetY + safeDeltaY
    }
}

/** 屏幕坐标 → 世界坐标（用于命中/锚点换算；视口倍率为 0 时回退 1） */
export function graphViewportToWorld(
    viewport: GraphViewport,
    screenX: number,
    screenY: number
): { x: number; y: number } {
    const scale = viewport.scale > 0 && Number.isFinite(viewport.scale) ? viewport.scale : 1
    return {
        x: (screenX - viewport.offsetX) / scale,
        y: (screenY - viewport.offsetY) / scale
    }
}
