<template>
    <!--
        1.5.7 LLM Wiki L4（T4.1）：关系图谱对话框（B3 图谱的轻量落地）。
        - 数据来自既有工作区索引快照（`FILE.GET_WORKSPACE_INDEX`，无新增 IPC）；
        - 节点 = 索引文件，边 = 已解析的 `[[wiki 链接]]` 关系；只读展示；
        - SVG 自绘（圆点 + 直线 + 标签），支持拖拽平移 / 滚轮缩放 / 点击节点打开文件；
        - 悬停或点击连线在右侧栏展示关系明细（来源 → 目标、行/列、链接原文）。
    -->
    <BaseDialog
        tool-window
        :visible="visible"
        :title="t('editorUi.graphDialog.title')"
        width-size="complex"
        reset-position-on-open
        container-class="graph-dialog"
        @close="handleClose"
    >
        <div class="graph-body" data-testid="graph-dialog">
            <div class="graph-toolbar">
                <label class="graph-filter">
                    <span class="graph-filter-label">{{
                        t('editorUi.graphDialog.filterLabel')
                    }}</span>
                    <select
                        v-model="filter"
                        class="graph-filter-select"
                        data-testid="graph-filter"
                        :disabled="initialLoading"
                        :aria-label="t('editorUi.graphDialog.filterLabel')"
                    >
                        <option value="all">{{ t('editorUi.graphDialog.filterAll') }}</option>
                        <option value="wiki">{{ t('editorUi.graphDialog.filterWiki') }}</option>
                    </select>
                </label>
                <span class="graph-summary" data-testid="graph-summary">{{ summaryText }}</span>
                <span class="graph-toolbar-spacer"></span>
                <div
                    class="graph-zoom-controls"
                    role="group"
                    :aria-label="t('editorUi.graphDialog.zoomGroupLabel')"
                >
                    <button
                        type="button"
                        class="graph-zoom-btn"
                        :title="t('editorUi.graphDialog.zoomIn')"
                        :aria-label="t('editorUi.graphDialog.zoomIn')"
                        data-testid="graph-zoom-in"
                        @click="zoomBy(1.2)"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        class="graph-zoom-btn"
                        :title="t('editorUi.graphDialog.zoomOut')"
                        :aria-label="t('editorUi.graphDialog.zoomOut')"
                        data-testid="graph-zoom-out"
                        @click="zoomBy(1 / 1.2)"
                    >
                        −
                    </button>
                    <button
                        type="button"
                        class="graph-zoom-btn"
                        :title="t('editorUi.graphDialog.zoomReset')"
                        :aria-label="t('editorUi.graphDialog.zoomReset')"
                        data-testid="graph-zoom-reset"
                        @click="resetViewport"
                    >
                        ⟲
                    </button>
                </div>
            </div>

            <div v-if="initialLoading" class="graph-placeholder" role="status">
                {{ t('editorUi.graphDialog.loading') }}
            </div>
            <div
                v-else-if="errorCode === 'no-workspace'"
                class="graph-placeholder graph-placeholder--empty"
                data-testid="graph-no-workspace"
            >
                {{ t('editorUi.graphDialog.noWorkspace') }}
            </div>
            <div
                v-else-if="errorCode === 'error' && snapshot === null"
                class="graph-placeholder graph-placeholder--error"
                role="alert"
                data-testid="graph-error"
            >
                <p class="graph-error-text">{{ t('editorUi.graphDialog.loadFailed') }}</p>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--ghost btn btn-retry-graph"
                    :disabled="loading"
                    @click="handleRefresh"
                >
                    {{ t('editorUi.graphDialog.retry') }}
                </button>
            </div>
            <div
                v-else-if="snapshot !== null && snapshot.files.length === 0"
                class="graph-placeholder graph-placeholder--empty"
                data-testid="graph-empty-workspace"
            >
                {{ t('editorUi.graphDialog.emptyWorkspace') }}
            </div>
            <div
                v-else-if="graphData.nodes.length === 0"
                class="graph-placeholder graph-placeholder--empty"
                data-testid="graph-empty-filter"
            >
                {{
                    filter === 'wiki'
                        ? t('editorUi.graphDialog.emptyWiki')
                        : t('editorUi.graphDialog.emptyGraph')
                }}
            </div>
            <div
                v-else-if="graphData.edges.length === 0"
                class="graph-placeholder graph-placeholder--empty"
                data-testid="graph-empty-links"
            >
                {{ t('editorUi.graphDialog.emptyLinks') }}
            </div>
            <template v-else>
                <div class="graph-stage">
                    <svg
                        ref="svgRef"
                        class="graph-svg"
                        :class="{ 'is-panning': isPanning }"
                        :viewBox="viewBox"
                        preserveAspectRatio="xMidYMid meet"
                        role="group"
                        :aria-label="t('editorUi.graphDialog.canvasLabel')"
                        data-testid="graph-canvas"
                        @wheel.prevent="handleWheel"
                        @pointerdown="handlePointerDown"
                        @pointermove="handlePointerMove"
                        @pointerup="handlePointerUp"
                        @pointercancel="handlePointerUp"
                        @pointerleave="handlePointerUp"
                    >
                        <g :transform="viewportTransform">
                            <g class="graph-edges">
                                <g
                                    v-for="edge in renderedEdges"
                                    :key="edge.id"
                                    class="graph-edge-group"
                                    :class="{
                                        'is-active': activeEdgeId === edge.id,
                                        'is-dimmed': activeEdgeId !== '' && activeEdgeId !== edge.id
                                    }"
                                >
                                    <line
                                        class="graph-edge-hit"
                                        :x1="edge.x1"
                                        :y1="edge.y1"
                                        :x2="edge.x2"
                                        :y2="edge.y2"
                                        data-testid="graph-edge-hit"
                                        :data-edge-id="edge.id"
                                        @mouseenter="handleEdgeEnter(edge.id)"
                                        @mouseleave="handleEdgeLeave(edge.id)"
                                        @click.stop="handleEdgeClick(edge.id)"
                                    >
                                        <title>{{ edge.tooltip }}</title>
                                    </line>
                                    <line
                                        class="graph-edge"
                                        :x1="edge.x1"
                                        :y1="edge.y1"
                                        :x2="edge.x2"
                                        :y2="edge.y2"
                                        aria-hidden="true"
                                    ></line>
                                </g>
                            </g>
                            <g class="graph-nodes">
                                <g
                                    v-for="node in laidOutNodes"
                                    :key="node.id"
                                    class="graph-node"
                                    :class="{
                                        'is-selected': selectedNodeId === node.id,
                                        'is-dimmed':
                                            activeEdgeId !== '' && !activeEdgeNodeIds.has(node.id)
                                    }"
                                    role="button"
                                    tabindex="0"
                                    :aria-label="node.ariaLabel"
                                    data-testid="graph-node"
                                    :data-node-path="node.path"
                                    @click.stop="handleNodeClick(node.id)"
                                    @keydown.enter.prevent="handleNodeClick(node.id)"
                                    @keydown.space.prevent="handleNodeClick(node.id)"
                                >
                                    <circle
                                        class="graph-node-circle"
                                        :cx="node.x"
                                        :cy="node.y"
                                        :r="node.radius"
                                    ></circle>
                                    <text
                                        v-if="node.showLabel"
                                        class="graph-node-label"
                                        :x="node.x"
                                        :y="node.y + node.radius + 16"
                                        text-anchor="middle"
                                    >
                                        {{ node.label }}
                                    </text>
                                    <title>{{ node.tooltip }}</title>
                                </g>
                            </g>
                        </g>
                    </svg>

                    <aside
                        class="graph-panel"
                        :aria-label="t('editorUi.graphDialog.panelLabel')"
                        aria-live="polite"
                        data-testid="graph-panel"
                    >
                        <template v-if="activeEdge !== null">
                            <h3 class="graph-panel-title">
                                {{ t('editorUi.graphDialog.edgePanelTitle') }}
                            </h3>
                            <p class="graph-panel-relation" data-testid="graph-edge-relation">
                                {{ edgeRelationText(activeEdge) }}
                            </p>
                            <dl class="graph-panel-rows">
                                <dt>{{ t('editorUi.graphDialog.edgeSource') }}</dt>
                                <dd>
                                    <code class="graph-panel-path">{{
                                        findNode(activeEdge.source)?.relativePath ??
                                        activeEdge.source
                                    }}</code>
                                </dd>
                                <dt>{{ t('editorUi.graphDialog.edgeTarget') }}</dt>
                                <dd>
                                    <code class="graph-panel-path">{{
                                        findNode(activeEdge.target)?.relativePath ??
                                        activeEdge.target
                                    }}</code>
                                </dd>
                                <dt>{{ t('editorUi.graphDialog.edgeOccurrenceCount') }}</dt>
                                <dd>{{ activeEdge.occurrences.length }}</dd>
                            </dl>
                            <ul
                                class="graph-occurrence-list"
                                :aria-label="t('editorUi.graphDialog.edgeOccurrenceListLabel')"
                            >
                                <li
                                    v-for="(occurrence, index) in activeEdge.occurrences"
                                    :key="`${occurrence.line}-${occurrence.column}-${index}`"
                                    class="graph-occurrence"
                                >
                                    <span class="graph-occurrence-location"
                                        >L{{ occurrence.line }}:{{ occurrence.column }}</span
                                    >
                                    <code class="graph-occurrence-raw">{{ occurrence.raw }}</code>
                                </li>
                            </ul>
                        </template>
                        <template v-else-if="activeNode !== null">
                            <h3 class="graph-panel-title">
                                {{ t('editorUi.graphDialog.nodePanelTitle') }}
                            </h3>
                            <p class="graph-panel-node-title" data-testid="graph-node-title">
                                {{ activeNode.title }}
                            </p>
                            <p class="graph-panel-node-path">{{ activeNode.relativePath }}</p>
                            <p class="graph-panel-node-meta">
                                {{
                                    t('editorUi.graphDialog.nodeDegree', {
                                        count: activeNode.degree
                                    })
                                }}
                            </p>
                            <p v-if="activeNode.tags.length > 0" class="graph-panel-node-meta">
                                {{ t('editorUi.graphDialog.nodeTags') }}:
                                <span v-for="tag in activeNode.tags" :key="tag" class="graph-tag"
                                    >#{{ tag }}</span
                                >
                            </p>
                        </template>
                        <template v-else>
                            <h3 class="graph-panel-title">
                                {{ t('editorUi.graphDialog.legendTitle') }}
                            </h3>
                            <ul class="graph-legend" data-testid="graph-legend">
                                <li>{{ t('editorUi.graphDialog.legendPan') }}</li>
                                <li>{{ t('editorUi.graphDialog.legendZoom') }}</li>
                                <li>{{ t('editorUi.graphDialog.legendNodeClick') }}</li>
                                <li>{{ t('editorUi.graphDialog.legendEdge') }}</li>
                                <li>{{ t('editorUi.graphDialog.legendWikiFilter') }}</li>
                            </ul>
                        </template>
                    </aside>
                </div>

                <div class="graph-hints">
                    <span
                        v-if="graphData.truncated"
                        class="graph-hint graph-hint--warn"
                        role="status"
                        data-testid="graph-truncated"
                    >
                        {{ truncatedText }}
                    </span>
                    <span v-if="loading && snapshot !== null" class="graph-hint" role="status">
                        {{ t('editorUi.graphDialog.refreshing') }}
                    </span>
                    <span
                        v-if="refreshFailed"
                        class="graph-hint graph-hint--error"
                        role="alert"
                        data-testid="graph-refresh-failed"
                    >
                        {{ t('editorUi.graphDialog.refreshFailed') }}
                    </span>
                    <span
                        v-if="openFailed"
                        class="graph-hint graph-hint--error"
                        role="alert"
                        data-testid="graph-open-failed"
                    >
                        {{ t('editorUi.graphDialog.openFailed') }}
                    </span>
                    <span
                        v-else-if="openedTitle !== ''"
                        class="graph-hint graph-hint--ok"
                        role="status"
                        data-testid="graph-opened"
                    >
                        {{ t('editorUi.graphDialog.opened', { title: openedTitle }) }}
                    </span>
                </div>
            </template>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--ghost btn btn-refresh-graph"
                :disabled="loading"
                @click="handleRefresh"
            >
                {{ t('editorUi.graphDialog.refresh') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-graph"
                @click="handleClose"
            >
                {{ t('editorUi.graphDialog.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 1.5.7 LLM Wiki L4（T4.1）：关系图谱对话框（renderer-only，默认能力，不新增 IPC / 依赖）。
 *
 * ## 数据流
 * 1. 打开（visible → true）→ `useWorkspaceIndex().refresh(false)`：优先主进程缓存，
 *    无缓存时主进程构建工作区索引（`raw/` 已在 L1/T1.2 排除，天然不进入图谱）；
 * 2. 快照 → `buildGraphData(snapshot, { filter })`：节点（文件）+ 边（已解析 wiki 链接，
 *    同一对来源/目标聚合 occurrence）+ 过滤 + 200 节点/1000 边上限截断；
 * 3. 图数据 → `computeGraphLayout(nodes, edges)`：确定性力导向布局（逻辑画布 1000×620）；
 * 4. SVG 渲染：`<g transform>` 承载缩放/平移；节点点击 → `openIndexedFile`（既有打开链路），
 *    连线悬停/点击 → 右侧栏展示关系明细。
 *
 * ## 交互
 * - 拖拽空白区域平移；滚轮以鼠标位置为锚点缩放（0.4x ~ 3x）+ 右上角缩放按钮；
 * - 点击节点打开对应文件并保持对话框打开（便于连续浏览）；
 * - 「刷新索引」强制主进程重建快照（失败保留上次结果并提示）。
 *
 * ## 边界
 * - 只经白名单 IPC `FILE.GET_WORKSPACE_INDEX`，不读磁盘、不写盘、不修改编辑器；
 * - 主题：颜色/间距/圆角全部消费 `--ui-*` 令牌，组件内无 `data-style` / `data-density` 分支。
 */
import { computed, ref, watch } from 'vue'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import { useWorkspaceIndex, openIndexedFile } from '../../composables/useWorkspaceIndex'
import BaseDialog from '../dialogs/BaseDialog.vue'
import {
    buildGraphData,
    normalizeGraphFilter,
    type GraphEdge,
    type GraphFilter,
    type GraphNode
} from './graph-data'
import {
    GRAPH_LAYOUT_HEIGHT,
    GRAPH_LAYOUT_WIDTH,
    computeGraphLayout,
    createGraphViewport,
    panGraphViewport,
    shouldShowNodeLabel,
    zoomGraphViewport,
    type GraphViewport
} from './graph-layout'

interface Props {
    /** 显隐开关（真源在宿主 SearchOverlayHost；false → true 时自动加载索引） */
    visible?: boolean
}

const props = withDefaults(defineProps<Props>(), { visible: false })

const emit = defineEmits<{
    (e: 'close'): void
}>()

/** 节点标签最大字符数（超出截断，避免长标题互相遮挡） */
const NODE_LABEL_MAX_CHARS = 16

/** 工作区索引控制器（本实例独立 loading/error；快照由主进程缓存） */
const { state: indexState, refresh } = useWorkspaceIndex()

/** 索引快照（null = 尚未加载成功） */
const snapshot = computed(() => indexState.snapshot)
/** 是否正在请求主进程（首次加载 / 刷新） */
const loading = computed(() => indexState.loading)
/** 首次加载失败原因（no-workspace / error；成功时 null） */
const errorCode = computed(() => indexState.error)
/** 首次加载占位（有旧快照时刷新不阻塞图展示） */
const initialLoading = computed(() => indexState.loading && indexState.snapshot === null)
/** 刷新失败但保留上次快照 */
const refreshFailed = computed(() => indexState.error !== null && indexState.snapshot !== null)

/** 过滤模式（全部索引文件 / 仅 wiki/ 页面） */
const filter = ref<GraphFilter>('all')
/** 布局视口（缩放 + 平移） */
const viewport = ref<GraphViewport>(createGraphViewport())
/** 当前选中的节点 id（空串 = 未选中） */
const selectedNodeId = ref('')
/** 当前选中的边 id（空串 = 未选中） */
const selectedEdgeId = ref('')
/** 当前悬停的边 id（空串 = 未悬停） */
const hoveredEdgeId = ref('')
/** 最近一次打开文件是否失败（对话框内可见提示，不弹错误框） */
const openFailed = ref(false)
/** 最近一次成功打开的文件标题（空串 = 无） */
const openedTitle = ref('')
/** 是否正在拖拽平移 */
const isPanning = ref(false)
/** SVG 容器引用（滚轮缩放/按钮缩放的锚点换算） */
const svgRef = ref<SVGSVGElement | null>(null)
/** 拖拽起点（屏幕坐标） */
let panStartX = 0
let panStartY = 0
/** 加载请求序号：连续刷新时只保留最后一次结果相关的 UI 状态 */
let loadSequence = 0

/** 图数据（节点/边/过滤/上限）；快照或过滤变化时重算 */
const graphData = computed(() => buildGraphData(snapshot.value, { filter: filter.value }))

/** 布局结果（节点坐标；节点/边变化时重算，确定性） */
const layout = computed(() =>
    computeGraphLayout(graphData.value.nodes, graphData.value.edges, {
        width: GRAPH_LAYOUT_WIDTH,
        height: GRAPH_LAYOUT_HEIGHT
    })
)

/** 节点 id → 布局坐标 */
const positionById = computed(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const point of layout.value.points) {
        map.set(point.id, point)
    }
    return map
})

/** 画布 viewBox（逻辑坐标；SVG 随容器等比缩放） */
const viewBox = computed(() => `0 0 ${layout.value.width} ${layout.value.height}`)

/** SVG 内容变换（平移 + 缩放） */
const viewportTransform = computed(
    () =>
        `translate(${viewport.value.offsetX} ${viewport.value.offsetY}) scale(${viewport.value.scale})`
)

/** 未选中时展示悬停边：悬停即时预览关系，点击后保持选中 */
const activeEdgeId = computed(() => selectedEdgeId.value || hoveredEdgeId.value)

/** 当前激活的边（选中优先、其次悬停） */
const activeEdge = computed<GraphEdge | null>(() => {
    const id = activeEdgeId.value
    if (id === '') {
        return null
    }
    return graphData.value.edges.find((edge) => edge.id === id) ?? null
})

/** 当前选中的节点 */
const activeNode = computed<GraphNode | null>(() => {
    const id = selectedNodeId.value
    if (id === '') {
        return null
    }
    return graphData.value.nodes.find((node) => node.id === id) ?? null
})

/** 激活边两端节点 id（用于其余节点降透明） */
const activeEdgeNodeIds = computed(() => {
    const edge = activeEdge.value
    return edge === null ? new Set<string>() : new Set([edge.source, edge.target])
})

/** 渲染用节点（坐标 + 半径 + 标签密度 + 无障碍/悬浮文案） */
const laidOutNodes = computed(() =>
    graphData.value.nodes.map((node) => {
        const position = positionById.value.get(node.id) ?? { x: 0, y: 0 }
        const radius = Math.min(14, 6 + Math.sqrt(node.degree) * 2)
        const showLabel = shouldShowNodeLabel(graphData.value.nodes.length, node.degree)
        return {
            id: node.id,
            path: node.path,
            x: position.x,
            y: position.y,
            radius,
            showLabel,
            label: truncateLabel(node.title.length > 0 ? node.title : node.name),
            tooltip: `${node.title.length > 0 ? node.title : node.name}\n${node.relativePath}`,
            ariaLabel: `${node.title.length > 0 ? node.title : node.name}（${node.relativePath}）`
        }
    })
)

/** 渲染用边（端点坐标 + 悬浮文案；端点缺失时跳过，防御布局/数据不一致） */
const renderedEdges = computed(() => {
    const nodeById = new Map(graphData.value.nodes.map((node) => [node.id, node]))
    const edges: Array<{
        id: string
        x1: number
        y1: number
        x2: number
        y2: number
        tooltip: string
    }> = []
    for (const edge of graphData.value.edges) {
        const sourcePoint = positionById.value.get(edge.source)
        const targetPoint = positionById.value.get(edge.target)
        if (!sourcePoint || !targetPoint) {
            continue
        }
        const sourceTitle = nodeById.get(edge.source)?.title ?? edge.source
        const targetTitle = nodeById.get(edge.target)?.title ?? edge.target
        edges.push({
            id: edge.id,
            x1: sourcePoint.x,
            y1: sourcePoint.y,
            x2: targetPoint.x,
            y2: targetPoint.y,
            tooltip: `${sourceTitle} → ${targetTitle}（${edge.occurrences.length}）`
        })
    }
    return edges
})

/** 顶部汇总文案（节点/关系数量；截断时展示展示比例） */
const summaryText = computed(() => {
    const data = graphData.value
    if (data.truncated) {
        return t('editorUi.graphDialog.summaryFiltered', {
            shown: data.nodes.length,
            total: data.filteredNodeCount,
            edges: data.edges.length
        })
    }
    return t('editorUi.graphDialog.summary', {
        files: data.totalNodeCount,
        edges: data.edges.length
    })
})

/** 截断提示文案 */
const truncatedText = computed(() => {
    const data = graphData.value
    return t('editorUi.graphDialog.truncated', {
        shownNodes: data.nodes.length,
        totalNodes: data.filteredNodeCount,
        omittedEdges: data.omittedEdgeCount
    })
})

/** 按 id 查找节点（侧栏展示路径用） */
function findNode(id: string): GraphNode | undefined {
    return graphData.value.nodes.find((node) => node.id === id)
}

/** 边关系标题（来源标题 → 目标标题） */
function edgeRelationText(edge: GraphEdge): string {
    const source = findNode(edge.source)
    const target = findNode(edge.target)
    return `${source?.title || edge.source} → ${target?.title || edge.target}`
}

/** 截断节点标签（按 Unicode 码点截断，避免截断代理对） */
function truncateLabel(text: string): string {
    const characters = Array.from(text)
    if (characters.length <= NODE_LABEL_MAX_CHARS) {
        return text
    }
    return `${characters.slice(0, NODE_LABEL_MAX_CHARS).join('')}…`
}

/**
 * 打开图谱节点对应文件（既有打开 + 跳行链路）。
 * 失败只给对话框内可见提示并记日志，不弹错误框、不影响对话框继续使用。
 */
async function handleOpenNode(node: GraphNode): Promise<void> {
    openFailed.value = false
    openedTitle.value = ''
    try {
        const opened = await openIndexedFile(node.path, 1)
        if (!opened) {
            openFailed.value = true
            logger.warn('[关系图谱] 打开节点文件失败', node.path)
            return
        }
        openedTitle.value = node.title.length > 0 ? node.title : node.name
    } catch (error) {
        openFailed.value = true
        logger.warn('[关系图谱] 打开节点文件异常', error)
    }
}

/** 点击节点：记录选中态并打开文件 */
function handleNodeClick(nodeId: string): void {
    const node = graphData.value.nodes.find((item) => item.id === nodeId)
    if (!node) {
        return
    }
    selectedNodeId.value = nodeId
    selectedEdgeId.value = ''
    hoveredEdgeId.value = ''
    void handleOpenNode(node)
}

/** 悬停连线（进入） */
function handleEdgeEnter(edgeId: string): void {
    hoveredEdgeId.value = edgeId
}

/** 悬停连线（离开）：仅当该边未处于选中态时清除 */
function handleEdgeLeave(edgeId: string): void {
    if (hoveredEdgeId.value === edgeId) {
        hoveredEdgeId.value = ''
    }
}

/** 点击连线：切换选中态（侧栏固定展示关系明细） */
function handleEdgeClick(edgeId: string): void {
    selectedEdgeId.value = selectedEdgeId.value === edgeId ? '' : edgeId
    selectedNodeId.value = ''
}

/** 读取 SVG 的屏幕坐标原点（滚轮/按钮缩放锚点） */
function readSvgRect(): { left: number; top: number; width: number; height: number } | null {
    const svg = svgRef.value
    if (!svg || typeof svg.getBoundingClientRect !== 'function') {
        return null
    }
    const rect = svg.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** 滚轮缩放：以鼠标所在位置为锚点，保持指针下的图元不动 */
function handleWheel(event: WheelEvent): void {
    const rect = readSvgRect()
    if (!rect) {
        return
    }
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
    viewport.value = zoomGraphViewport(
        viewport.value,
        screenX,
        screenY,
        viewport.value.scale * factor
    )
}

/** 缩放按钮：以画布中心为锚点 */
function zoomBy(factor: number): void {
    const rect = readSvgRect()
    const anchorX = rect ? rect.width / 2 : GRAPH_LAYOUT_WIDTH / 2
    const anchorY = rect ? rect.height / 2 : GRAPH_LAYOUT_HEIGHT / 2
    viewport.value = zoomGraphViewport(
        viewport.value,
        anchorX,
        anchorY,
        viewport.value.scale * factor
    )
}

/** 复位缩放与平移 */
function resetViewport(): void {
    viewport.value = createGraphViewport()
}

/** 指针按下：从画布空白处开始拖拽平移（节点/连线上的按下不触发） */
function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
        return
    }
    const target = event.target as Element | null
    if (target && typeof target.closest === 'function') {
        if (target.closest('.graph-node') || target.closest('.graph-edge-hit')) {
            return
        }
    }
    isPanning.value = true
    panStartX = event.clientX
    panStartY = event.clientY
    const captureTarget = event.currentTarget as Element | null
    if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
        try {
            captureTarget.setPointerCapture(event.pointerId)
        } catch (error) {
            logger.debug('[关系图谱] 指针捕获失败（忽略）', error)
        }
    }
}

/** 指针移动：拖拽中按屏幕增量平移视口 */
function handlePointerMove(event: PointerEvent): void {
    if (!isPanning.value) {
        return
    }
    viewport.value = panGraphViewport(
        viewport.value,
        event.clientX - panStartX,
        event.clientY - panStartY
    )
    panStartX = event.clientX
    panStartY = event.clientY
}

/** 指针抬起/取消/离开：结束拖拽 */
function handlePointerUp(): void {
    isPanning.value = false
}

/**
 * 加载 / 刷新索引。
 *
 * force=false：打开对话框时使用（命中主进程缓存即返回，无缓存才构建）；
 * force=true：用户点「刷新索引 / 重试」时强制主进程重建快照。
 * 失败状态由控制器写入（no-workspace / error），这里只兜异常，保证不抛给 UI。
 */
async function loadIndex(force: boolean): Promise<void> {
    const sequence = ++loadSequence
    openFailed.value = false
    openedTitle.value = ''
    try {
        await refresh(force)
    } catch (error) {
        logger.warn('[关系图谱] 加载工作区索引失败', error)
    }
    if (sequence !== loadSequence) {
        return
    }
}

/** 刷新索引（强制重建快照） */
function handleRefresh(): void {
    void loadIndex(true)
}

/** 关闭对话框（只切显隐，宿主保留） */
function handleClose(): void {
    emit('close')
}

/** 复位临时交互状态（关闭 / 重新打开时调用） */
function resetInteraction(): void {
    filter.value = 'all'
    viewport.value = createGraphViewport()
    selectedNodeId.value = ''
    selectedEdgeId.value = ''
    hoveredEdgeId.value = ''
    isPanning.value = false
    openFailed.value = false
    openedTitle.value = ''
}

// 打开即加载（宿主先挂载、后设置 visible，故 immediate 兜底）；关闭时清理临时 UI 状态
watch(
    () => props.visible,
    (visible: boolean) => {
        if (visible) {
            resetInteraction()
            void loadIndex(false)
        }
    },
    { immediate: true }
)

// 过滤模式归一化（防御模板外的赋值/测试桩）；切换过滤时清空选中态，避免悬空 id
watch(filter, (next) => {
    const normalized = normalizeGraphFilter(next)
    if (normalized !== next) {
        filter.value = normalized
        return
    }
    selectedNodeId.value = ''
    selectedEdgeId.value = ''
    hoveredEdgeId.value = ''
})
</script>

<style scoped>
/* 1.5.7 LLM Wiki L4：关系图谱（四风格 × 三密度全部经 --ui-* 令牌派生，无 data-style 分支） */
.graph-body {
    display: flex;
    flex-direction: column;
    gap: calc(var(--ui-pad) * 0.75);
    padding: var(--ui-pad);
    min-height: 420px;
    color: var(--ui-text);
    font-size: var(--ui-font-size);
}

.graph-toolbar {
    display: flex;
    align-items: center;
    gap: calc(var(--ui-pad) * 0.75);
    padding: calc(var(--ui-pad) * 0.5) calc(var(--ui-pad) * 0.75);
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    flex-wrap: wrap;
}

.graph-filter {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--ui-pad) * 0.5);
    font-size: var(--ui-font-size);
    color: var(--ui-text-secondary);
}

.graph-filter-label {
    flex: none;
}

.graph-filter-select {
    height: var(--ui-control-height);
    padding: 0 calc(var(--ui-pad) * 0.5);
    color: var(--ui-text);
    background: var(--ui-bg-elevated);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    font-family: inherit;
    font-size: var(--ui-font-size);
}

.graph-filter-select:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.graph-summary {
    flex: none;
    color: var(--ui-text-secondary);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: calc(var(--ui-font-size) - 1px);
}

.graph-toolbar-spacer {
    flex: 1;
}

.graph-zoom-controls {
    display: inline-flex;
    gap: calc(var(--ui-pad) * 0.25);
}

.graph-zoom-btn {
    width: var(--ui-control-height);
    height: var(--ui-control-height);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ui-text);
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    font-family: inherit;
    font-size: calc(var(--ui-font-size) + 1px);
    line-height: 1;
    cursor: pointer;
    transition: background var(--ui-duration-fast) var(--ui-ease-standard);
}

.graph-zoom-btn:hover {
    background: var(--ui-accent-soft);
    border-color: var(--ui-accent);
}

.graph-zoom-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.graph-placeholder {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-pad);
    padding: var(--ui-pad);
    text-align: center;
    font-size: var(--ui-font-size);
    color: var(--ui-text-secondary);
    background: var(--ui-surface);
    border: 1px dashed var(--ui-border);
    border-radius: var(--ui-radius-md);
}

.graph-placeholder--error {
    color: var(--ui-danger);
}

.graph-error-text {
    margin: 0;
}

.graph-stage {
    display: flex;
    gap: calc(var(--ui-pad) * 0.75);
    min-height: 360px;
}

.graph-svg {
    flex: 1;
    min-width: 0;
    height: min(54vh, 520px);
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.graph-svg.is-panning {
    cursor: grabbing;
}

.graph-svg:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

/* 连线：默认弱色；激活/悬停高亮。hit 线透明加宽，提升鼠标命中率。 */
.graph-edge {
    stroke: var(--ui-border-strong);
    stroke-width: 1.2;
    fill: none;
    pointer-events: none;
}

.graph-edge-hit {
    stroke: transparent;
    stroke-width: 12;
    fill: none;
    cursor: pointer;
}

.graph-edge-group.is-active .graph-edge {
    stroke: var(--ui-accent);
    stroke-width: 2;
}

.graph-edge-group.is-dimmed {
    opacity: 0.35;
}

.graph-node {
    cursor: pointer;
    outline: none;
}

.graph-node-circle {
    fill: var(--ui-accent);
    stroke: var(--ui-surface);
    stroke-width: 1.5;
    transition: fill var(--ui-duration-fast) var(--ui-ease-standard);
}

.graph-node:hover .graph-node-circle,
.graph-node:focus-visible .graph-node-circle {
    fill: var(--ui-accent-hover);
}

.graph-node.is-selected .graph-node-circle {
    fill: var(--ui-accent-hover);
    stroke: var(--ui-warning);
    stroke-width: 2.5;
}

.graph-node.is-dimmed {
    opacity: 0.35;
}

.graph-node-label {
    fill: var(--ui-text);
    font-size: calc(var(--ui-font-size) - 2px);
    font-family: inherit;
    pointer-events: none;
}

.graph-panel {
    flex: none;
    width: 250px;
    max-height: min(54vh, 520px);
    overflow: auto;
    padding: calc(var(--ui-pad) * 0.75);
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-text);
}

.graph-panel-title {
    margin: 0 0 calc(var(--ui-pad) * 0.5);
    font-size: calc(var(--ui-font-size) - 1px);
    font-weight: 600;
    color: var(--ui-text);
}

.graph-panel-relation,
.graph-panel-node-title {
    margin: 0 0 calc(var(--ui-pad) * 0.5);
    font-weight: 600;
    color: var(--ui-accent);
    word-break: break-word;
}

.graph-panel-node-path,
.graph-panel-node-meta {
    margin: 0 0 calc(var(--ui-pad) * 0.35);
    color: var(--ui-text-secondary);
    word-break: break-all;
}

.graph-panel-rows {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: calc(var(--ui-pad) * 0.25) calc(var(--ui-pad) * 0.5);
    margin: 0 0 calc(var(--ui-pad) * 0.5);
}

.graph-panel-rows dt {
    color: var(--ui-text-secondary);
}

.graph-panel-rows dd {
    margin: 0;
    min-width: 0;
}

.graph-panel-path {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: calc(var(--ui-font-size) - 2px);
    word-break: break-all;
}

.graph-occurrence-list,
.graph-legend {
    list-style: none;
    margin: 0;
    padding: 0;
}

.graph-occurrence {
    display: flex;
    gap: calc(var(--ui-pad) * 0.5);
    padding: calc(var(--ui-pad) * 0.25) 0;
    border-top: 1px solid var(--ui-border);
    align-items: baseline;
}

.graph-occurrence-location {
    flex: none;
    color: var(--ui-text-tertiary);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: calc(var(--ui-font-size) - 2px);
}

.graph-occurrence-raw {
    min-width: 0;
    color: var(--ui-text);
    word-break: break-all;
}

.graph-legend li {
    padding: calc(var(--ui-pad) * 0.25) 0;
    color: var(--ui-text-secondary);
    line-height: 1.5;
}

.graph-tag {
    display: inline-block;
    margin-right: calc(var(--ui-pad) * 0.35);
    color: var(--ui-accent);
}

.graph-hints {
    display: flex;
    flex-direction: column;
    gap: calc(var(--ui-pad) * 0.25);
    min-height: calc(var(--ui-row-height) * 0.8);
}

.graph-hint {
    padding: calc(var(--ui-pad) * 0.35) calc(var(--ui-pad) * 0.6);
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-text-secondary);
    background: var(--ui-bg-elevated);
    border-radius: var(--ui-radius-sm);
}

.graph-hint--warn {
    color: var(--ui-warning);
}

.graph-hint--error {
    color: var(--ui-danger);
}

.graph-hint--ok {
    color: var(--ui-success);
}
</style>
