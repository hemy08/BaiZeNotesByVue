/**
 * 1.5.7 LLM Wiki L4（T4.1）：关系图谱数据构建（纯函数，无 Vue / DOM / IPC 依赖）。
 *
 * ## 职责
 * 把既有工作区索引快照（`FILE.GET_WORKSPACE_INDEX` 的 `WorkspaceIndexSnapshot`）转换为
 * 可渲染的「节点（文件）+ 边（已解析 Wiki 链接关系）」图数据：
 * - 节点 = 索引中的可索引文件（`.md/.markdown/.txt`；LLM Wiki 模式下 `raw/` 由 T1.2
 *   排除，天然不进入图谱）；
 * - 边 = 每个文件内 `[[target]]` 链接中 `status === 'resolved'` 且 `resolvedPath` 命中
 *   快照内文件的关系；同一对「来源 → 目标」的多处链接聚合为一条边（保留全部出现位置）；
 * - 过滤：`all`（全部索引文件）/ `wiki`（仅相对路径位于 `wiki/` 目录下的页面）；
 * - 上限：节点 ≤ {@link GRAPH_MAX_NODES}、边 ≤ {@link GRAPH_MAX_EDGES}，超出时按
 *   「链接度降序 + 相对路径升序」确定性截断，并回传省略数量供 UI 提示。
 *
 * ## 边界
 * - 只读快照，不读磁盘、不重复解析 Markdown、不写任何状态；
 * - 输出顺序确定（节点按 relativePath 升序、边按来源/目标相对路径升序），便于单测与稳定渲染；
 * - 路径比较统一走 {@link normalizeGraphPath}（`\` → `/`、小写，与 `useWorkspaceIndex`
 *   的 Windows 大小写不敏感口径一致）。
 */
import type { WorkspaceIndexSnapshot } from '../../../../shared/types/workspace-index'
import { LLM_WIKI_WIKI_DIR_NAME } from '../../../../shared/constants/workspace-mode'

/** 图谱节点展示上限（超出时按链接度截断并提示；纯前端渲染性能护栏） */
export const GRAPH_MAX_NODES = 200

/** 图谱边展示上限（防极端稠密图一次性挂载过多 SVG 元素） */
export const GRAPH_MAX_EDGES = 1000

/** 图谱过滤模式：全部索引文件 / 仅 `wiki/` 页面 */
export type GraphFilter = 'all' | 'wiki'

/** 全部合法过滤模式（稳定顺序，供入口校验与测试遍历） */
export const GRAPH_FILTERS: readonly GraphFilter[] = ['all', 'wiki']

/** 图谱节点（一个工作区索引文件） */
export interface GraphNode {
    /** 节点稳定 id：绝对路径归一化（小写 + `/`），同时用于边引用 */
    id: string
    /** 文件绝对路径（用于点击打开文件） */
    path: string
    /** 相对工作区根的展示路径（统一 `/` 分隔） */
    relativePath: string
    /** 文件名（含扩展名） */
    name: string
    /** 展示标题（front matter title > H1 > 文件名） */
    title: string
    /** 是否位于 `wiki/` 目录（LLM Wiki 编译态页面） */
    isWiki: boolean
    /** 关联边数量（入边 + 出边；自环只计一次），用于半径/标签密度 */
    degree: number
    /** 文件标签（图谱侧栏展示；空数组 = 无标签） */
    tags: string[]
}

/** 一条边的单处链接出现位置（点击/悬停连线时展示关系明细） */
export interface GraphEdgeOccurrence {
    /** 链接原文（含 `[[` `]]`） */
    raw: string
    /** 行号（1-based） */
    line: number
    /** 列号（1-based） */
    column: number
}

/** 图谱边（同一对来源/目标聚合后的有向关系） */
export interface GraphEdge {
    /** 边稳定 id：`<sourceId>-><targetId>` */
    id: string
    /** 来源节点 id */
    source: string
    /** 目标节点 id */
    target: string
    /** 该关系在来源文件中出现的全部位置（至少 1 项） */
    occurrences: GraphEdgeOccurrence[]
}

/** 图谱构建结果 */
export interface GraphData {
    /** 最终展示的节点（已过滤 + 截断；按 relativePath 升序） */
    nodes: GraphNode[]
    /** 最终展示的边（两端节点均在 nodes 中；按来源/目标相对路径升序） */
    edges: GraphEdge[]
    /** 快照内文件总数（过滤前） */
    totalNodeCount: number
    /** 过滤后、节点上限前的节点数 */
    filteredNodeCount: number
    /** 因节点上限未展示的节点数（filteredNodeCount - nodes.length） */
    omittedNodeCount: number
    /** 因端点被截断或边上限未展示的边数 */
    omittedEdgeCount: number
    /** 是否发生截断（节点或边任一超限） */
    truncated: boolean
}

/** 图谱构建选项 */
export interface BuildGraphOptions {
    /** 过滤模式（缺省 `all`；非法值按 `all` 处理） */
    filter?: GraphFilter
    /** 节点上限（缺省 {@link GRAPH_MAX_NODES}；负值/非有限值按默认值） */
    maxNodes?: number
    /** 边上限（缺省 {@link GRAPH_MAX_EDGES}；负值/非有限值按默认值） */
    maxEdges?: number
}

/** 路径归一化为图谱/索引比较键（`\` → `/`、小写） */
export function normalizeGraphPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase()
}

/**
 * 判断相对路径是否位于 `wiki/` 目录下。
 *
 * 只认工作区根下的第一段目录名（`wiki/xx.md`、`wiki/sub/xx.md`），
 * `notes/wiki/xx.md` 这类嵌套目录不算 LLM Wiki 页面。
 */
export function isWikiPagePath(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, '/')
    const segments = normalized.split('/')
    return segments.length > 1 && segments[0] === LLM_WIKI_WIKI_DIR_NAME
}

/** 过滤模式归一化（非法值回落 `all`） */
export function normalizeGraphFilter(value: unknown): GraphFilter {
    return value === 'wiki' ? 'wiki' : 'all'
}

/** 解析上限入参：非有限值/非正数回退默认值并取整 */
function resolveLimit(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback
    }
    return Math.floor(value)
}

/** 按相对路径升序比较（同路径再按 id 升序，保证确定性） */
function compareNodes(left: GraphNode, right: GraphNode): number {
    const pathCompare = left.relativePath.localeCompare(right.relativePath)
    if (pathCompare !== 0) {
        return pathCompare
    }
    return left.id.localeCompare(right.id)
}

/** 按来源/目标相对路径升序比较边（相对路径通过节点表查得；缺节点时按 id 兜底） */
function compareEdges(
    left: GraphEdge,
    right: GraphEdge,
    nodeById: ReadonlyMap<string, GraphNode>
): number {
    const leftSource = nodeById.get(left.source)?.relativePath ?? left.source
    const rightSource = nodeById.get(right.source)?.relativePath ?? right.source
    if (leftSource !== rightSource) {
        return leftSource.localeCompare(rightSource)
    }
    const leftTarget = nodeById.get(left.target)?.relativePath ?? left.target
    const rightTarget = nodeById.get(right.target)?.relativePath ?? right.target
    if (leftTarget !== rightTarget) {
        return leftTarget.localeCompare(rightTarget)
    }
    return left.id.localeCompare(right.id)
}

/**
 * 从工作区索引快照构建图谱数据。
 *
 * 步骤：
 * 1. 建立「归一化路径 → 文件」表，生成全部节点（degree 暂为 0）；
 * 2. 遍历每个文件的 `links`：仅 `resolved` 且 `resolvedPath` 命中快照内文件时建边，
 *    同一对 source/target 聚合 occurrence（按文件遍历顺序 + 链接出现顺序）；
 * 3. 计算节点度数（自环只计一次；每条聚合边对两端各 +1）；
 * 4. 按过滤模式裁剪节点候选；
 * 5. 若候选节点超上限：按「度数降序 → relativePath 升序」排序取前 N，记录省略数；
 * 6. 裁剪边：两端均在最终节点集中；若超边上限，按「出现次数降序 → 来源/目标升序」取前 N；
 * 7. 返回排序后的节点/边与统计。
 *
 * @param snapshot 工作区索引快照（`null` = 尚未加载，返回空图）
 * @param options  过滤/上限选项
 * @returns 确定性图数据（不修改入参）
 */
export function buildGraphData(
    snapshot: WorkspaceIndexSnapshot | null,
    options: BuildGraphOptions = {}
): GraphData {
    const filter = normalizeGraphFilter(options.filter)
    const maxNodes = resolveLimit(options.maxNodes, GRAPH_MAX_NODES)
    const maxEdges = resolveLimit(options.maxEdges, GRAPH_MAX_EDGES)
    if (snapshot === null || !Array.isArray(snapshot.files)) {
        return {
            nodes: [],
            edges: [],
            totalNodeCount: 0,
            filteredNodeCount: 0,
            omittedNodeCount: 0,
            omittedEdgeCount: 0,
            truncated: false
        }
    }

    /** 归一化路径 → 索引文件 */
    const fileByKey = new Map<string, WorkspaceIndexSnapshot['files'][number]>()
    /** 节点表（含全部文件，截断前） */
    const nodeById = new Map<string, GraphNode>()
    for (const file of snapshot.files) {
        const id = normalizeGraphPath(file.path)
        if (id.length === 0 || nodeById.has(id)) {
            continue
        }
        fileByKey.set(id, file)
        nodeById.set(id, {
            id,
            path: file.path,
            relativePath: file.relativePath,
            name: file.name,
            title: file.title,
            isWiki: isWikiPagePath(file.relativePath),
            degree: 0,
            tags: Array.isArray(file.tags) ? [...file.tags] : []
        })
    }

    const totalNodeCount = nodeById.size
    /** 聚合边：`sourceId->targetId` → 边 */
    const edgeById = new Map<string, GraphEdge>()
    for (const file of snapshot.files) {
        const sourceId = normalizeGraphPath(file.path)
        if (!nodeById.has(sourceId)) {
            continue
        }
        const links = Array.isArray(file.links) ? file.links : []
        for (const link of links) {
            if (link.status !== 'resolved' || typeof link.resolvedPath !== 'string') {
                continue
            }
            const targetId = normalizeGraphPath(link.resolvedPath)
            if (!nodeById.has(targetId) || targetId === sourceId) {
                // 目标不在快照内（防御旧快照/索引竞态）或自链接：不进入关系图
                continue
            }
            const edgeId = `${sourceId}->${targetId}`
            const existing = edgeById.get(edgeId)
            if (existing) {
                existing.occurrences.push({
                    raw: link.raw,
                    line: link.line,
                    column: link.column
                })
            } else {
                edgeById.set(edgeId, {
                    id: edgeId,
                    source: sourceId,
                    target: targetId,
                    occurrences: [{ raw: link.raw, line: link.line, column: link.column }]
                })
            }
        }
    }

    // 度数：入边 + 出边（聚合边对两端各计一次；自环已在上方排除）
    for (const edge of edgeById.values()) {
        const sourceNode = nodeById.get(edge.source)
        const targetNode = nodeById.get(edge.target)
        if (sourceNode) {
            sourceNode.degree += 1
        }
        if (targetNode) {
            targetNode.degree += 1
        }
    }

    // 过滤：候选节点
    const candidates: GraphNode[] = []
    for (const node of nodeById.values()) {
        if (filter === 'wiki' && !node.isWiki) {
            continue
        }
        candidates.push(node)
    }
    const filteredNodeCount = candidates.length

    // 节点上限：按度数降序 + 相对路径升序确定性截断
    let keptNodes = candidates
    if (candidates.length > maxNodes) {
        keptNodes = [...candidates].sort((left, right) => {
            if (left.degree !== right.degree) {
                return right.degree - left.degree
            }
            return compareNodes(left, right)
        })
        keptNodes = keptNodes.slice(0, maxNodes)
    }
    const keptNodeIds = new Set(keptNodes.map((node) => node.id))
    const omittedNodeCount = filteredNodeCount - keptNodes.length

    // 裁剪边：两端节点均保留 + 边上限
    let keptEdges = [...edgeById.values()].filter(
        (edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)
    )
    const omittedEdgeCountByNode = edgeById.size - keptEdges.length
    if (keptEdges.length > maxEdges) {
        keptEdges = [...keptEdges]
            .sort((left, right) => {
                if (left.occurrences.length !== right.occurrences.length) {
                    return right.occurrences.length - left.occurrences.length
                }
                return compareEdges(left, right, nodeById)
            })
            .slice(0, maxEdges)
    }
    const edgesBeforeEdgeCap = edgeById.size - omittedEdgeCountByNode
    const omittedEdgeCount =
        omittedEdgeCountByNode + Math.max(0, edgesBeforeEdgeCap - keptEdges.length)
    keptEdges.sort((left, right) => compareEdges(left, right, nodeById))
    keptNodes.sort(compareNodes)

    return {
        nodes: keptNodes,
        edges: keptEdges,
        totalNodeCount,
        filteredNodeCount,
        omittedNodeCount,
        omittedEdgeCount,
        truncated: omittedNodeCount > 0 || omittedEdgeCount > 0
    }
}
