/**
 * 1.5.7 LLM Wiki L4（T4.1）：关系图谱对外入口（供宿主 / 菜单 / 命令面板与测试引用）。
 *
 * 集成方式（宿主 `SearchOverlayHost` 只做一步）：
 * ```ts
 * import { GraphDialog, graphDialogState, closeGraphDialogState } from '@renderer/components/Graph'
 * // 模板：<GraphDialog :visible="graphDialogState.visible" @close="closeGraphDialogState" />
 * ```
 * 打开入口：
 * - 命令面板：`CommandPalette` emit `open-graph` → 宿主调用 `openGraphDialogState()`；
 * - 菜单：「视图 → 关系图谱」→ `menu-actions.ts` 精确拦截 → `openGraphDialogState()`。
 *
 * 图谱为纯前端只读能力：数据来自既有 `FILE.GET_WORKSPACE_INDEX`，不新增 IPC / 依赖。
 */
export { default as GraphDialog } from './GraphDialog.vue'
export {
    GRAPH_DIALOG_MENU_ACTION,
    closeGraphDialogState,
    graphDialogState,
    openGraphDialogState,
    type GraphDialogState
} from './graph-dialog-state'
export {
    GRAPH_FILTERS,
    GRAPH_MAX_EDGES,
    GRAPH_MAX_NODES,
    buildGraphData,
    isWikiPagePath,
    normalizeGraphFilter,
    normalizeGraphPath,
    type BuildGraphOptions,
    type GraphData,
    type GraphEdge,
    type GraphEdgeOccurrence,
    type GraphFilter,
    type GraphNode
} from './graph-data'
export {
    GRAPH_LABEL_ALWAYS_MAX_NODES,
    GRAPH_LABEL_MIN_DEGREE,
    GRAPH_LAYOUT_HEIGHT,
    GRAPH_LAYOUT_ITERATIONS,
    GRAPH_LAYOUT_PADDING,
    GRAPH_LAYOUT_SEED,
    GRAPH_LAYOUT_WIDTH,
    GRAPH_MAX_SCALE,
    GRAPH_MIN_SCALE,
    computeGraphLayout,
    createGraphViewport,
    graphViewportToWorld,
    panGraphViewport,
    shouldShowNodeLabel,
    zoomGraphViewport,
    type GraphLayoutOptions,
    type GraphLayoutPoint,
    type GraphLayoutResult,
    type GraphViewport
} from './graph-layout'
