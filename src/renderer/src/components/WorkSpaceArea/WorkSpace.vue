<template>
    <!-- 左侧区域导航，固定宽度，放置图标，鼠标悬停显示详细信息 -->
    <div id="left-navi" class="navi-tab" :style="{ width: naviTabWidth, float: 'left' }">
        <NaviTab position="left" @update:navi:tab="onSwitchRightNaviTab" />
    </div>
    <!-- 中间资源管理显示区域，宽度可以调节 -->
    <div
        v-show="isShowResourceMgrArea"
        id="resource-manager"
        class="resource-manager"
        :style="{ width: resMgrWidth }"
    >
        <ResManager :navi-show="naviResManagerShow" />
    </div>
    <!-- 资源管理器和编辑区域的宽度调节条 -->
    <div
        id="resizer-main"
        class="resizer-main"
        :style="{ left: resizerLeft }"
        @mousedown="startCursorPosition($event)"
    ></div>
    <!-- 右侧编辑区域 -->
    <!--
        REQ-12 工作区舞台：承载内容区各容器（md / 插件 / 工具 / HTML / PDF）。
        - 默认横向排布：各容器沿用既有内联宽度（workAreaWidth 已扣左右导航/资源管理器），
          v-show 保证同一时刻只显示一个容器（既有互斥切换契约不变）；
        - 插件面板最小化（44px 工具条）时切纵向排布：工具条在上（44px）+ 编辑器在下（占满剩余
          高度），收起插件区域空白并让编辑器可见；还原/返回编辑器时恢复默认排布。
          折叠状态由 PluginTools 的 window-state-change 事件上抛（无新增 EventBus/IPC 契约）。
    -->
    <div
        class="workspace-stage"
        :class="{ 'workspace-stage--plugin-docked': isPluginPanelDocked }"
        :data-plugin-panel-docked="isPluginPanelDocked ? 'true' : 'false'"
    >
        <div
            v-show="isShowMdContainer || isPluginPanelDocked"
            id="md-container"
            class="md-container"
            :style="{ width: mdContainerWidth }"
        >
            <!-- 1.5.7 体验微调（A5）：编辑区内部三态视图（编辑 / 预览 / 编辑+预览）由统一真源
                 `workspace-layout` 的 viewMode 驱动；切换入口在编辑工具条右侧（本容器不占额外行）。 -->
            <MdContainer :md-container-width="mdContainerWidth" />
        </div>
        <!-- 1.5.7 体验升级：编辑区与 AI 面板之间的可拖动分隔条（split）。
             - 仅 LLM Wiki 模式且面板处于展开态时渲染；收起态 / 传统模式不渲染（零布局变化）；
             - 拖动实时改变 AI 面板宽度（编辑区自动让位）；1.5.7 体验微调（用户反馈）起
               **移除固定上下限**，可拖范围 = [0, 当前工作区可用宽度 − 分隔条宽度]：
               往左可让面板占满工作区（编辑区 0），往右可把面板缩到 0（编辑区占满，面板保留挂载）；
             - ←/→ 键盘微调（±16），Home 缩到 0 / End 拉到可用宽度 − 分隔条，双击恢复默认宽度；
             - 无障碍：role=separator + aria-orientation=vertical + aria-valuenow/min/max。 -->
        <div
            v-if="showLlmAiSplitter"
            id="llm-ai-splitter"
            class="llm-ai-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-controls="llm-ai-panel-container"
            :aria-label="t('editorUi.llmWikiPanel.splitterLabel')"
            :title="t('editorUi.llmWikiPanel.splitterHint')"
            :tabindex="0"
            :aria-valuenow="llmWikiAiPanelWidthPx"
            :aria-valuemin="0"
            :aria-valuemax="llmWikiAiPanelMaxAvailablePx"
            :style="{ width: `${LLM_WIKI_SPLITTER_WIDTH}px` }"
            @mousedown="startLlmWikiPanelResize"
            @dblclick="handleResetLlmWikiAiPanelWidth"
            @keydown="handleLlmWikiSplitterKeydown"
        ></div>
        <!-- 1.5.7 LLM Wiki L5：右侧 AI 输入面板（仅 LLM Wiki 模式 + 编辑区可见时占位；
             切换其它工作区容器时用 v-show 隐藏，保留对话状态；传统模式不渲染）。
             体验调整：用户收起后容器 v-show=false 且宽度 0（完全不占编辑区宽度），
             展开入口移到工作区右侧边栏（见 #right-navi 的 #llm-ai-sidebar-entry）。
             体验微调：宽度拖到 0 时面板挂载保留（对话状态不丢、可再拖回），
             通过 .llm-ai-panel-container--zero-width 去掉 border-left，保证 0 宽时视觉上等于收起。 -->
        <div
            v-if="isLlmWikiMode"
            v-show="showLlmAiPanel"
            id="llm-ai-panel-container"
            class="llm-ai-panel-container"
            :class="{ 'llm-ai-panel-container--zero-width': isLlmAiPanelZeroWidth }"
            :style="{ width: llmAiPanelWidth }"
        >
            <LlmAiPanel
                :document-name="llmWikiEditorContext.documentName"
                :selection-text="llmWikiEditorContext.selectionText"
                :collapsed="isLlmWikiAiPanelCollapsed"
                @toggle-collapse="toggleLlmWikiAiPanelCollapsed"
                @reset-width="handleResetLlmWikiAiPanelWidth"
            />
        </div>
        <div
            v-show="isShowPluginsContainer"
            id="plugin-containers"
            class="plugin-containers"
            :class="{ 'plugin-containers--panel-docked': isPluginPanelDocked }"
            :data-plugin-panel-docked="isPluginPanelDocked ? 'true' : 'false'"
            :style="{ width: workAreaWidth }"
        >
            <PluginTools
                :plugins-area-width="workAreaWidth"
                @window-state-change="onPluginToolsWindowStateChange"
            />
        </div>
        <div
            v-show="isShowToolsContainer"
            id="tool-containers"
            class="tool-containers"
            :style="{ width: workAreaWidth }"
        >
            <HemyTools :tools-area-width="workAreaWidth" />
        </div>
        <!-- HTML 查看器：按需挂载——首次切换到该容器才渲染（避免进入主界面即加载其 chunk），
             激活后仅用 v-show 切换，保留内部状态 -->
        <div
            v-if="htmlContainerActivated"
            v-show="isShowHtmlContainer"
            id="html-containers"
            class="html-containers"
            :style="{ width: workAreaWidth }"
        >
            <ShowHtmlView :html-area-width="workAreaWidth" />
        </div>
        <!-- PDF 预览：同上，首次切换到该容器才挂载，避免主界面初始化即加载 pdfjs-dist -->
        <div
            v-if="pdfContainerActivated"
            v-show="isShowPdfContainer"
            id="pdf-containers"
            class="pdf-containers"
            :style="{ width: workAreaWidth }"
        >
            <ShowPdfEditor :pds-area-width="workAreaWidth" />
        </div>
    </div>
    <!-- 最右侧边框：1.5.7 体验调整——AI 面板收起后入口按钮落在这里（不再占编辑区宽度）。
         1.5.7 体验微调（用户反馈）：传统模式与 LLM Wiki 模式**都显示**该入口——
         - LLM Wiki 模式：面板已收起时显示，点击展开 AI 助手面板（展开态不渲染）；
         - 传统模式：始终显示（编辑区可见时），点击走「切换到 LLM Wiki 模式」确认 + 初始化
           流程，切换成功后布局切换且 AI 面板处于展开态。 -->
    <div
        id="right-navi"
        class="navi-tab"
        :data-llm-ai-entry-visible="showLlmAiSidebarEntry ? 'true' : 'false'"
        :style="{ width: naviTabWidth, float: 'right' }"
    >
        <button
            v-if="showLlmAiSidebarEntry"
            id="llm-ai-sidebar-entry"
            type="button"
            class="llm-ai-sidebar-entry"
            data-llm-ai-entry="true"
            :data-llm-ai-entry-mode="isLlmWikiMode ? 'llm-wiki' : 'traditional'"
            :title="llmAiSidebarEntryLabel"
            :aria-label="llmAiSidebarEntryLabel"
            :aria-controls="isLlmWikiMode ? 'llm-ai-panel-container' : undefined"
            :aria-expanded="false"
            @click="handleLlmAiSidebarEntryClick"
        >
            <!-- 星芒图标（当前色填充，颜色由 .llm-ai-sidebar-entry 的 --ui-accent 令牌驱动） -->
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                    d="M12 2l1.9 5.4a2 2 0 0 0 1.2 1.2L20.5 10.5a.7.7 0 0 1 0 1.3l-5.4 1.9a2 2 0 0 0-1.2 1.2L12 20.3a.7.7 0 0 1-1.3 0L8.8 14.9a2 2 0 0 0-1.2-1.2L2.2 11.8a.7.7 0 0 1 0-1.3l5.4-1.9a2 2 0 0 0 1.2-1.2L11.4 2a.7.7 0 0 1 1.2 0z"
                />
            </svg>
        </button>
        <NaviTab position="right" @update:navi:tab="onSwitchLeftNaviTab" />
    </div>
    <!-- 1.5.7 迁移批次：工作区模式切换迁移弹窗（设置页/菜单栏/边栏三处入口共用）。
         由 `useWorkspaceModeSwitch` 的模块单例状态触发；
         v-if 保证未打开时零 DOM/零副作用（传统模式下不新增常驻对话框节点）。 -->
    <MigrationWizardDialog v-if="workspaceModeSwitchState.visible" />
    <!-- 1.5.7 迁移批次 M2：批量编译对话框宿主（常驻；订阅 LLM_WIKI_COMPILE_REQUEST 后
         等迁移弹窗关闭再打开对话框；未打开时零可见 DOM）。 -->
    <BatchCompileHost />
</template>

<script setup lang="ts">
import {
    ref,
    computed,
    onMounted,
    onBeforeUnmount,
    watch,
    provide,
    defineAsyncComponent,
    defineComponent,
    h
} from 'vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { useEventBus } from '@renderer/composables/useEventBus'
import { logger } from '@renderer/common/logger'
import { t } from '../../common/i18n'
import NaviTab from '@renderer/components/WorkSpaceArea/NaviTab.vue'
import ResManager from '@renderer/components/ResourceManager/ResourceManager.vue'
import MdContainer from '@renderer/components/Markdown/MarkdownContainer.vue'
import PluginTools from '@renderer/components/PluginTools/PluginTools.vue'
import HemyTools from '@renderer/components/HemyTools/HemyTools.vue'
import LlmAiPanel from '@renderer/components/llm-wiki/LlmAiPanel.vue'
import BatchCompileHost from '@renderer/components/llm-wiki/BatchCompileHost.vue'
import MigrationWizardDialog from '@renderer/components/dialogs/simple/MigrationWizardDialog.vue'
import {
    requestSwitchToLlmWiki,
    workspaceModeSwitchState
} from '@renderer/composables/useWorkspaceModeSwitch'
import {
    disposeWorkspaceModeListener,
    useWorkspaceMode
} from '@renderer/composables/useWorkspaceMode'
import {
    LLM_WIKI_AI_PANEL_WIDTH,
    clampLlmWikiAiPanelWidth,
    ensureLlmWikiWorkbenchStateLoaded,
    llmWikiWorkbenchState,
    resetLlmWikiAiPanelWidth,
    setLlmWikiAiPanelWidth,
    toggleLlmWikiAiPanelCollapsed
} from '@renderer/components/llm-wiki/llm-wiki-workbench'
import { llmWikiEditorContext } from '@renderer/components/llm-wiki/llm-wiki-context'
import { LLM_AI_TRANSPORT_INJECTION_KEY } from '@renderer/components/llm-wiki/llm-ai-transport'
import { createLlmAiIpcTransport } from '@renderer/components/llm-wiki/llm-ai-ipc-transport'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import {
    WORKSPACE_LAYOUT_APPLY_EVENT,
    normalizeWorkspaceLayoutWidth,
    updateCurrentWorkspaceResourceState,
    type WorkspaceLayoutProfile
} from '@renderer/components/Markdown/workspace-layout'

// 2026-11-18（遗留清单 #9/#11）：HTML 查看器与 PDF 预览按需加载——
// PDF 预览内含 pdfjs-dist（较大），静态导入会打进入口 chunk；改为异步组件后
// 仅在首次切换到对应工作区时加载，消除 INEFFECTIVE_DYNAMIC_IMPORT 并减小首屏 chunk。
// 2026-11-19：容器改用 v-if 首次激活才挂载（原 v-show 始终渲染子树，进入主界面即拉取
// pdfjs chunk）。loader 单独抽出，激活时先预加载 chunk，便于挂载后补发缓存的文件选择事件。
const loadShowHtmlView = () => import('@renderer/components/HemyTools/ShowHtmlView.vue')
const loadShowPdfEditor = () => import('@renderer/components/HemyTools/ShowPdfEditor.vue')

// 异步组件加载中 / 加载失败占位：内联简单组件，避免为纯占位 UI 新增文件
// eslint-disable-next-line vue/one-component-per-file -- 占位组件仅用于 defineAsyncComponent 的 loading/error 展示
const AsyncLoadingPlaceholder = defineComponent({
    name: 'AsyncLoadingPlaceholder',
    render: () => h('div', { class: 'async-container-placeholder' }, '加载中...')
})
// eslint-disable-next-line vue/one-component-per-file -- 同上，纯占位组件
const AsyncLoadErrorPlaceholder = defineComponent({
    name: 'AsyncLoadErrorPlaceholder',
    render: () => h('div', { class: 'async-container-placeholder' }, '加载失败，请重试')
})

const ShowHtmlView = defineAsyncComponent({
    loader: loadShowHtmlView,
    loadingComponent: AsyncLoadingPlaceholder,
    errorComponent: AsyncLoadErrorPlaceholder,
    delay: 200
})
const ShowPdfEditor = defineAsyncComponent({
    loader: loadShowPdfEditor,
    loadingComponent: AsyncLoadingPlaceholder,
    errorComponent: AsyncLoadErrorPlaceholder,
    delay: 200
})

// 使用 ref 来创建响应式引用
const naviResManagerShow = ref('file-explorer')
const windowWidth = ref(window.innerWidth)
const resMgrWidth = ref('300px')
const naviTabWidth = ref('40px')
const isShowResourceMgrArea = ref(true)
const isShowMdContainer = ref(true)
const isShowPluginsContainer = ref(false)
const isShowToolsContainer = ref(false)
const isShowHtmlContainer = ref(false)
const isShowPdfContainer = ref(false)
// 2026-11-19（按需挂载）：HTML/PDF 容器是否已首次激活（激活后才 v-if 挂载组件）。
// 激活后只切换 v-show，保证来回切换时组件状态（当前文件、页码、缩放）不丢失。
const htmlContainerActivated = ref(false)
const pdfContainerActivated = ref(false)

/**
 * REQ-12：插件工具面板折叠状态（由子组件 PluginTools 的 window-state-change 事件上抛）。
 * - 仅在插件容器显示（isShowPluginsContainer）时生效；
 * - 折叠 → 插件区域只占 44px 工具条 + 编辑器占据剩余高度（收起空白、可见面积扩大）；
 * - 还原（normal/maximized）或「返回编辑器」→ 回到既有容器互斥视图（零回归）。
 */
const isPluginPanelMinimized = ref(false)
const isPluginPanelDocked = computed(
    () => isPluginPanelMinimized.value && isShowPluginsContainer.value
)

/** 插工具面板折叠状态变化（true = 仅保留 44px 工具条） */
function onPluginToolsWindowStateChange(minimized: boolean): void {
    isPluginPanelMinimized.value = minimized
}

// EventBus 注册器（M5）：监听随组件卸载自动清理，替代手写 $on/$off 配对
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'WorkSpace' })

/** 预览文件选择事件载荷（与 FileTreeNode 发出的节点结构保持一致） */
interface PreviewFileSelection {
    path?: string
    name?: string
}

// 按需挂载带来的时序问题：资源管理器点击 .html/.pdf 时，FileTreeNode 先发
// *_FILE_SELECTED、后发 WORKSPACE_SHOW；容器首次挂载的实例在事件发出时还没注册监听，
// 会错过选择而显示空状态。WorkSpace 常驻，这里缓存首次激活前的选择，挂载完成后补发。
let pendingHtmlSelection: PreviewFileSelection | null = null
let pendingPdfSelection: PreviewFileSelection | null = null

/** 缓存 HTML 文件选择（仅首次激活前需要，激活后由查看器实例自行监听） */
function cacheHtmlSelection(node: PreviewFileSelection): void {
    if (!htmlContainerActivated.value) {
        pendingHtmlSelection = node
    }
}

/** 缓存 PDF 文件选择（同上） */
function cachePdfSelection(node: PreviewFileSelection): void {
    if (!pdfContainerActivated.value) {
        pendingPdfSelection = node
    }
}

let mouseStartX = 0

const resizerLeft = computed(() => {
    return resMgrWidth.value
})

// 使用 computed 属性来动态计算 workAreaWidth
const workAreaWidth = computed(() => {
    // 注意这里使用了 parseInt 移除 'px' 后缀，并且确保计算是有效的
    const naviTabWidthValue = parseInt(naviTabWidth.value.replace('px', ''), 10)
    // 减去左右两侧的 naviTabWidth, resMgrWidth 以及可能的间隙（例如 2px）
    // 注意：左右两侧都有 NaviTab，所以需要减去 2 * naviTabWidthValue
    let containerWidth = windowWidth.value - naviTabWidthValue * 2 - 2
    if (isShowResourceMgrArea.value) {
        const resMgrWidthValue = parseInt(resMgrWidth.value.replace('px', ''), 10)
        containerWidth = windowWidth.value - naviTabWidthValue * 2 - resMgrWidthValue - 2
    }
    return containerWidth + 'px'
})

/* ============================================================================
 * 1.5.7 LLM Wiki 工作台布局（左侧编辑区 + 右侧 AI 输入面板）
 *
 * - traditional（默认）：布局与 1.5.6 一致（AI 面板不渲染）；编辑区内部视图由统一三态
 *   真源 `workspace-layout` 的 viewMode 驱动（编辑 / 预览 / 编辑+预览）；
 * - llm-wiki：左侧编辑区内部同样使用统一三态视图（单一真源，入口在编辑工具条右侧），
 *   右侧渲染 `LlmAiPanel`。宽度由 workAreaWidth 派生：
 *   编辑区 = 可用宽度 − AI 面板宽度 − 分隔条宽度。
 * - split 可拖动：编辑区与 AI 面板之间渲染 5px 垂直分隔条，拖动实时改 AI 面板宽度；
 *   面板宽度持久化在 llm-wiki-workbench（`baize:llm-wiki:ai-panel-width`），布局层按
 *   「[0, 当前可用宽度 − 分隔条宽度]」夹取。体验微调（用户反馈「往左拖一点就拖不动」）：
 *   **移除固定上下限 240 / 560**——面板可自由拉宽到占满整个工作区（编辑区压到 0），
 *   也可缩到 0（编辑区占满、面板仍挂载可再拖回）；双击分隔条 / 面板按钮恢复默认 360px
 *   （可用宽度不足 360 + 分隔条时夹到「可用宽度 − 分隔条」）。
 * - 收起只由用户手动触发（面板内按钮）：收起后容器 v-show=false 且宽度 0（完全不占
 *   编辑区宽度），展开入口渲染在工作区右侧边栏（`#right-navi` 的 `#llm-ai-sidebar-entry`），
 *   不再有「窗口过窄自动收起」；收起状态持久化（`baize:llm-wiki:ai-panel-collapsed`）。
 * ========================================================================== */
const { isLlmWikiMode } = useWorkspaceMode()

// L3↔L5 联调：AI 面板经注入的 transport 调用主进程 AI.CHAT（不可用时面板内显示提示）
provide(LLM_AI_TRANSPORT_INJECTION_KEY, createLlmAiIpcTransport())
// 首帧即恢复持久化 UI 状态（AI 面板收起 / AI 面板宽度），避免布局二次跳变
ensureLlmWikiWorkbenchStateLoaded()

/** 未自定义宽度时的窗口分档默认值：宽窗 360 / 窄窗 280（px） */
const AI_PANEL_WIDTH_NARROW = 280
/** 编辑区与 AI 面板之间的分隔条宽度（px；5px 热区，视觉线由 CSS 绘制） */
const LLM_WIKI_SPLITTER_WIDTH = 5
/** 分隔条键盘微调步长（px；← 变宽 / → 变窄） */
const LLM_WIKI_PANEL_KEYBOARD_STEP = 16
/** 窗口宽度不超过该值时用窄档默认面板宽度（仅用户尚未自定义宽度时生效） */
const AI_PANEL_NARROW_WINDOW_WIDTH = 1100

/** 工作区可用宽度（数值 px；workAreaWidth 的解析结果） */
const workAreaWidthPx = computed(() => parseInt(workAreaWidth.value, 10) || 0)

/** 面板是否处于用户手动收起态（状态真源：llm-wiki-workbench，localStorage 持久化） */
const isLlmWikiAiPanelCollapsed = computed(() => llmWikiWorkbenchState.aiPanelCollapsed)

/** AI 面板可用上下文：LLM Wiki 模式 + 编辑区容器可见 + 插件面板未折叠停靠 */
const isLlmAiPanelAvailable = computed(
    () => isLlmWikiMode.value && isShowMdContainer.value && !isPluginPanelDocked.value
)

/** 面板是否展开显示：可用上下文 + 未收起（收起仅由用户手动控制，无窗口自动收起） */
const showLlmAiPanel = computed(
    () => isLlmAiPanelAvailable.value && !isLlmWikiAiPanelCollapsed.value
)

/**
 * 右侧边栏 AI 入口按钮：传统模式与 LLM Wiki 模式都显示（1.5.7 体验微调，用户反馈）。
 *
 * - 仅编辑区可见（且插件面板未折叠停靠）时渲染——入口属于编辑区工具入口，切到插件/工具/
 *   HTML/PDF 容器时不显示；
 * - LLM Wiki 模式：面板已收起时显示（点击展开面板），展开态不渲染（收起按钮在面板头部）；
 * - 传统模式：始终显示，点击走「切换到 LLM Wiki 模式」确认 + 初始化流程。
 */
const showLlmAiSidebarEntry = computed(() => {
    if (!isShowMdContainer.value || isPluginPanelDocked.value) {
        return false
    }
    return isLlmWikiMode.value ? isLlmWikiAiPanelCollapsed.value : true
})

/** 右侧边栏 AI 入口的 title / aria-label（随模式变化；t() 在 computed 内保证响应式） */
const llmAiSidebarEntryLabel = computed(() =>
    isLlmWikiMode.value
        ? t('editorUi.llmWikiPanel.expand')
        : t('editorUi.llmWikiPanel.switchToLlmWikiEntry')
)

/** 拖动中的临时面板宽度：仅内存态，mouseup 时才写回持久化状态（避免高频写 localStorage） */
const llmWikiAiPanelDragWidth = ref<number | null>(null)

/** 当前可用宽度下面板能达到的最大值（= 工作区可用宽度 − 分隔条宽度；此时编辑区宽度为 0） */
const llmWikiAiPanelMaxAvailablePx = computed(() =>
    Math.max(0, workAreaWidthPx.value - LLM_WIKI_SPLITTER_WIDTH)
)

/**
 * 把目标宽度夹取到 `[0, 当前可用宽度 − 分隔条宽度]`。
 * 1.5.7 体验微调（用户反馈）：移除固定上下限 240 / 560——面板可自由拖到占满整个工作区
 * （编辑区宽度 0），也可缩到 0（编辑区占满；面板保留挂载可再拖回）；持久化宽度在挂载 /
 * 窗口 resize 时同样经本函数夹取（不覆盖用户保存的宽度偏好）。
 */
function clampLlmWikiAiPanelWidthToAvailable(desired: number): number {
    return Math.min(clampLlmWikiAiPanelWidth(desired), llmWikiAiPanelMaxAvailablePx.value)
}

/**
 * AI 面板展开态宽度（px）：取「拖动临时值 > 持久化宽度 > 窗口分档默认值」，
 * 并始终夹取到 `[0, 可用宽度 − 分隔条]`（窗口 resize 时自动夹取，不破坏用户保存的宽度偏好）。
 * 收起态不读取本值：面板容器宽度由 `llmAiPanelWidth` 直接置 0（不占编辑区宽度）。
 */
const llmWikiAiPanelWidthPx = computed(() => {
    const desired =
        llmWikiAiPanelDragWidth.value ??
        llmWikiWorkbenchState.aiPanelWidth ??
        (windowWidth.value <= AI_PANEL_NARROW_WINDOW_WIDTH
            ? AI_PANEL_WIDTH_NARROW
            : LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
    return clampLlmWikiAiPanelWidthToAvailable(desired)
})

/** AI 面板容器内联宽度（收起 / 非 LLM Wiki 上下文不占位） */
const llmAiPanelWidth = computed(
    () => `${showLlmAiPanel.value ? llmWikiAiPanelWidthPx.value : 0}px`
)

/** 展开态但宽度被拖到 0：面板仍挂载（对话状态不丢、可再拖回），仅去掉左侧 border 保证视觉 0 宽 */
const isLlmAiPanelZeroWidth = computed(
    () => showLlmAiPanel.value && llmWikiAiPanelWidthPx.value === 0
)

/** 分隔条是否渲染（仅展开态；收起 / 传统模式 / 其它工作区容器下不渲染） */
const showLlmAiSplitter = computed(() => showLlmAiPanel.value)

/** 编辑区容器宽度：面板展开时扣除面板与分隔条（编辑区最小 0）；收起/其它容器/传统模式保持既有宽度 */
const mdContainerWidth = computed(() => {
    if (!showLlmAiPanel.value) {
        return workAreaWidth.value
    }
    const remaining = workAreaWidthPx.value - llmWikiAiPanelWidthPx.value - LLM_WIKI_SPLITTER_WIDTH
    return `${Math.max(0, remaining)}px`
})

/* ---------------- split 拖动 / 键盘 / 恢复默认 ---------------- */

/** 拖拽起点（clientX）与起点面板宽度 */
let llmPanelResizeStartX = 0
let llmPanelResizeStartWidth = 0

/** 摘除拖动期间挂在 window 上的全局监听（重入前与卸载时成对调用） */
function detachLlmPanelResizeListeners(): void {
    window.removeEventListener('mousemove', handleLlmPanelResizeMove)
    window.removeEventListener('mouseup', stopLlmPanelResize)
}

/** 按下分隔条开始拖动（左键；阻止默认的文本选择/原生拖拽） */
function startLlmWikiPanelResize(event: MouseEvent): void {
    if (event.button !== 0) {
        return
    }
    event.preventDefault()
    detachLlmPanelResizeListeners()
    llmPanelResizeStartX = event.clientX
    llmPanelResizeStartWidth = llmWikiAiPanelWidthPx.value
    llmWikiAiPanelDragWidth.value = llmPanelResizeStartWidth
    window.addEventListener('mousemove', handleLlmPanelResizeMove)
    window.addEventListener('mouseup', stopLlmPanelResize)
}

/** 拖动中：分隔条向左 → AI 面板变宽（增量取反），实时夹取到可用区间 */
function handleLlmPanelResizeMove(event: MouseEvent): void {
    if (llmWikiAiPanelDragWidth.value === null) {
        return
    }
    const delta = llmPanelResizeStartX - event.clientX
    llmWikiAiPanelDragWidth.value = clampLlmWikiAiPanelWidthToAvailable(
        llmPanelResizeStartWidth + delta
    )
}

/** 结束拖动：把最终宽度写回持久化状态（内存态先保留同值再清理，避免一帧跳变） */
function stopLlmPanelResize(): void {
    const width = llmWikiAiPanelDragWidth.value
    if (width !== null) {
        setLlmWikiAiPanelWidth(width)
    }
    llmWikiAiPanelDragWidth.value = null
    detachLlmPanelResizeListeners()
}

/** 应用绝对宽度（键盘/恢复默认共用；夹取到 [0, 可用宽度 − 分隔条] 并持久化） */
function applyLlmWikiAiPanelWidth(width: number): void {
    llmWikiAiPanelDragWidth.value = null
    setLlmWikiAiPanelWidth(clampLlmWikiAiPanelWidthToAvailable(width))
}

/**
 * 键盘分隔条：← 变宽 / → 变窄（±16px）；Home 缩到 0（最小）/ End 拉到可用宽度 − 分隔条（最大）。
 * 1.5.7 体验微调：移除固定上下限后 Home/End 改为「面板可拖范围的两端」，与 aria-valuemin/max 同步。
 */
function handleLlmWikiSplitterKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) {
        return
    }
    const current = llmWikiAiPanelWidthPx.value
    if (event.key === 'ArrowLeft') {
        event.preventDefault()
        applyLlmWikiAiPanelWidth(current + LLM_WIKI_PANEL_KEYBOARD_STEP)
    } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        applyLlmWikiAiPanelWidth(current - LLM_WIKI_PANEL_KEYBOARD_STEP)
    } else if (event.key === 'Home') {
        event.preventDefault()
        applyLlmWikiAiPanelWidth(0)
    } else if (event.key === 'End') {
        event.preventDefault()
        applyLlmWikiAiPanelWidth(llmWikiAiPanelMaxAvailablePx.value)
    }
}

/**
 * 恢复默认面板宽度（双击分隔条 / 面板「恢复默认宽度」按钮）。
 * 默认 360px；当前可用宽度不足 360 + 分隔条时由布局层夹取到「可用宽度 − 分隔条」。
 */
function handleResetLlmWikiAiPanelWidth(): void {
    llmWikiAiPanelDragWidth.value = null
    resetLlmWikiAiPanelWidth()
}

/**
 * 右侧边栏 AI 入口点击（两模式共用同一个按钮）：
 * - LLM Wiki 模式（面板已收起）：展开面板（隐藏入口按钮）；
 *   宽度沿用持久化的上次宽度 / 窗口分档默认值（不重置用户宽度偏好）；
 *   清空拖动临时态，避免上一次拖动的内存值覆盖持久化宽度；
 * - 传统模式：与系统设置「功能」页签、菜单栏模式按钮走同样处理——打开迁移弹窗，
 *   用户选择迁移方式/范围/编译选项后：迁移（可选）→ 初始化 raw/ 与 wiki/ → 写系统配置
 *   （主进程广播 → 布局切到 LLM Wiki），成功后 AI 面板处于展开态。
 */
function handleLlmAiSidebarEntryClick(): void {
    if (!isLlmWikiMode.value) {
        requestSwitchToLlmWiki()
        return
    }
    handleOpenLlmWikiAiPanel()
}

/**
 * 右侧边栏 AI 入口：展开面板（隐藏入口按钮）。
 * 宽度沿用持久化的上次宽度 / 窗口分档默认值（不重置用户宽度偏好）；
 * 清空拖动临时态，避免上一次拖动的内存值覆盖持久化宽度。
 */
function handleOpenLlmWikiAiPanel(): void {
    llmWikiAiPanelDragWidth.value = null
    toggleLlmWikiAiPanelCollapsed()
}

// 定义事件处理函数
const handlePluginToolsContainerShow = (value: boolean) => {
    if (value) {
        isShowMdContainer.value = false
        isShowPluginsContainer.value = true
    } else {
        isShowMdContainer.value = true
        isShowPluginsContainer.value = false
    }
}

/**
 * 首次激活按需挂载的预览容器。
 * 1) 先将 activated 置 true 触发挂载（defineAsyncComponent 立即显示 loading 占位）；
 * 2) 预加载组件 chunk（与异步组件内部 loader 共享模块缓存）；
 * 3) 等一个宏任务——异步组件「loader 完成 → 渲染真实组件 → onMounted 注册监听」
 *    整条链路都由微任务驱动，宏任务执行时微任务队列（含 Vue 渲染 flush）已清空；
 * 4) 补发此前缓存的文件选择事件，避免首次从资源管理器打开时显示空状态。
 */
async function activatePreviewContainer(kind: 'html' | 'pdf'): Promise<void> {
    const isHtml = kind === 'html'
    const activated = isHtml ? htmlContainerActivated : pdfContainerActivated
    if (activated.value) {
        // 非首次切换：实例已挂载并自行监听事件
        return
    }
    activated.value = true
    try {
        // 先等 chunk 就绪（模块缓存与异步组件内部 loader 共享，重复 import 不会重复下载）
        await (isHtml ? loadShowHtmlView() : loadShowPdfEditor())
    } catch (error) {
        logger.error('按需预览组件加载失败:', error)
        return
    }
    // 等微任务队列清空（真实组件完成挂载）
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
    })
    const pending = isHtml ? pendingHtmlSelection : pendingPdfSelection
    if (isHtml) {
        pendingHtmlSelection = null
    } else {
        pendingPdfSelection = null
    }
    if (pending) {
        EventBus.$emit(isHtml ? EVENT_BUS.HTML_FILE_SELECTED : EVENT_BUS.PDF_FILE_SELECTED, pending)
    }
}

const handleWorkAreaContainerShow = (value: string) => {
    isShowMdContainer.value = false
    isShowPluginsContainer.value = false
    isShowToolsContainer.value = false
    isShowHtmlContainer.value = false
    isShowPdfContainer.value = false
    if (value === 'plugins') {
        isShowPluginsContainer.value = true
    } else if (value === 'html') {
        isShowHtmlContainer.value = true
        // 首次切换到 HTML 查看器：按需挂载（并补发可能已发出的文件选择事件）
        void activatePreviewContainer('html')
    } else if (value === 'pdf') {
        isShowPdfContainer.value = true
        // 首次切换到 PDF 预览：按需挂载（并补发可能已发出的文件选择事件）
        void activatePreviewContainer('pdf')
    } else if (value === 'tools') {
        // FE-26：工具面板（HemyTools 容器）此前没有对应分支——只能靠左侧导航直接
        // 翻转 isShowToolsContainer，且不会隐藏编辑器容器（两个容器叠加显示）。
        // 现纳入统一切换逻辑：显示工具面板时隐藏其他容器，'md' 可正常切回。
        isShowToolsContainer.value = true
    } else {
        isShowMdContainer.value = true
    }
}
function onSwitchRightNaviTab(value: string) {
    if (value == 'switch-open-close') {
        isShowResourceMgrArea.value = !isShowResourceMgrArea.value
    } else if (value == 'file-explorer') {
        naviResManagerShow.value = 'file-explorer'
        isShowResourceMgrArea.value = true
    } else if (value == 'markdown-toc') {
        // 保存当前tree信息
        naviResManagerShow.value = 'markdown-toc'
        isShowResourceMgrArea.value = true
    } else {
        naviResManagerShow.value = 'file-explorer'
    }
}

function onSwitchLeftNaviTab(value: string) {
    if (value == 'switch-open-close') {
        // FE-26：左侧导航「当前项再次点击」= 工具面板开/关。原实现直接翻转
        // isShowToolsContainer，不经过容器切换逻辑：工具面板打开时编辑器容器仍显示，
        // 布局叠加且返回按钮无响应。现统一走 handleWorkAreaContainerShow，
        // 保证各容器互斥，HemyTools.vue 的「返回编辑器」按钮（发 WORKSPACE_SHOW('md')）
        // 也能正确隐藏工具面板。
        handleWorkAreaContainerShow(isShowToolsContainer.value ? 'md' : 'tools')
    }
}

function startCursorPosition(e: MouseEvent) {
    mouseStartX = e.clientX
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
    const moveX = e.clientX - mouseStartX
    const newWidth = parseInt(resMgrWidth.value, 10) + moveX
    // 限制最小和最大宽度（可选）
    const minWidth = 100
    const maxWidth = windowWidth.value - 600
    if (newWidth > maxWidth) {
        resMgrWidth.value = maxWidth + 'px'
    } else if (newWidth < minWidth) {
        resMgrWidth.value = minWidth + 'px'
    } else {
        resMgrWidth.value = newWidth + 'px'
    }
    mouseStartX = e.clientX
}

function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
}

const handleHideDisplayResManager = () => {
    isShowResourceMgrArea.value = !isShowResourceMgrArea.value
}

function onWindowResized() {
    windowWidth.value = window.innerWidth
}

/** E11：应用布局 profile（仅调整资源管理器显隐/宽度，不改变编辑器内容） */
function handleApplyWorkspaceLayout(event: Event): void {
    const detail = (event as CustomEvent<WorkspaceLayoutProfile>).detail
    if (!detail) {
        return
    }
    isShowResourceMgrArea.value = detail.resourceManagerVisible === true
    resMgrWidth.value = `${normalizeWorkspaceLayoutWidth(detail.resourceManagerWidth)}px`
    updateCurrentWorkspaceResourceState(
        isShowResourceMgrArea.value,
        normalizeWorkspaceLayoutWidth(detail.resourceManagerWidth)
    )
}

watch([isShowResourceMgrArea, resMgrWidth], () => {
    updateCurrentWorkspaceResourceState(
        isShowResourceMgrArea.value,
        parseInt(resMgrWidth.value, 10)
    )
})

onMounted(() => {
    windowWidth.value = window.innerWidth
    window.addEventListener('resize', onWindowResized)
    window.addEventListener(WORKSPACE_LAYOUT_APPLY_EVENT, handleApplyWorkspaceLayout)
    updateCurrentWorkspaceResourceState(
        isShowResourceMgrArea.value,
        parseInt(resMgrWidth.value, 10)
    )

    onEventBus(EVENT_BUS.PLUGIN_TOOLS_CONTAINER_SHOW, handlePluginToolsContainerShow)
    onEventBus(EVENT_BUS.WORKSPACE_SHOW, handleWorkAreaContainerShow)
    // 按需挂载：缓存首次激活 HTML/PDF 容器前发出的文件选择事件（挂载后补发）
    onEventBus(EVENT_BUS.HTML_FILE_SELECTED, cacheHtmlSelection)
    onEventBus(EVENT_BUS.PDF_FILE_SELECTED, cachePdfSelection)
    window.electron.ipcRenderer.on(IPC.VIEW.TOGGLE_RES_MANAGER, handleHideDisplayResManager)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', onWindowResized)
    window.removeEventListener(WORKSPACE_LAYOUT_APPLY_EVENT, handleApplyWorkspaceLayout)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    // 1.5.7 体验升级：AI 面板分隔条拖拽期间挂在 window 上的监听成对摘除
    detachLlmPanelResizeListeners()
    window.electron.ipcRenderer.removeListener(
        IPC.VIEW.TOGGLE_RES_MANAGER,
        handleHideDisplayResManager
    )
    // 1.5.7 LLM Wiki L5：工作区模式广播监听为应用级单例，随主工作区卸载显式释放
    //（与 useFeatureFlags 在 App 卸载时释放同口径；内存生命周期静态检查要求订阅/退订配对）
    disposeWorkspaceModeListener()
    // EventBus 监听已由 useEventBus 自动清理（本组件在 setup 内注册，先于此处执行）
})
</script>

<style scoped>
#navi-tab {
    height: 100%;
    /* 视觉升级（主窗口可见性修复）：左右导航条按风格切换表面（paper 纸感 / glass 半透明 /
       workbench 与 hybrid 壳层保持现状卡片底；圆角与高光边在 workbench 恒为 0）。 */
    background-color: var(--theme-card-background, white);
    background-color: var(--bz-shell-surface, var(--theme-card-background, white));
    background-image: linear-gradient(
        var(--bz-shell-veil, transparent),
        var(--bz-shell-veil, transparent)
    );
    display: flex;
    float: left;
    width: 40px;
    border-right: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--bz-shell-radius, 0);
    /* glass 顶部高光边：基色与透明度由 content-tokens.css 的 --ui-highlight-border-color 派生
       （workbench/paper/hybrid 的透明度为 0 → transparent，默认观感零变化）。 */
    box-shadow: inset 0 1px 0 var(--ui-highlight-border-color);
}

/* 2026-11-20（编辑器底部光标不可见修复）：工作区子容器统一跟随父容器高度，
   禁止各自用 100vh 推算；编辑器/预览滚动容器必须能收缩（min-height:0）。
   1.5.5 主窗口可见性修复：侧栏表面材质由 ResourceManager 组件消费 --bz-shell-* 提供，
   本容器保持透明，避免半透明面叠加导致 glass 透明感下降。 */
#resource-manager {
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

#resource-manager .resource-manager {
    height: 100vh;
    display: flex;
    float: left;
    margin-right: 2px;
    flex-direction: column;
    background: var(--theme-background-color, whitesmoke);
    border-right: 1px solid var(--theme-border-color);
}

#resizer-main {
    cursor: ew-resize;
    color: var(--theme-accent-color, blue);
    width: 2px;
    background-color: var(--ui-border, var(--theme-border-color));
    height: 100%;
    float: left;
    /* Other styles... */
}

#md-container {
    display: flex;
    flex-direction: column;
    float: left;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

/* 2026-11-19（UI 实测修复）：HTML/PDF 查看器容器此前缺少布局样式（md/plugin/tool 均有），
   导致容器高度不受控：iframe 内文档变化或锚点导航时内容可撑动布局，出现"显示区域上移、
   被菜单栏遮挡"。这里与其它容器对齐并固定高度/裁剪溢出，保证查看器内容只在自身区域滚动。
   背景/圆角/描边统一由上方内容区材质规则提供（避免此处覆盖导致四风格失真）。 */
#html-containers,
#pdf-containers {
    display: flex;
    flex-direction: column;
    float: left;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

#plugin-containers {
    display: flex;
    flex-direction: column;
    float: left;
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
}

#tool-containers {
    display: flex;
    flex-direction: column;
    float: left;
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
}

/* ============================================================================
 * REQ-12 工作区舞台：插件面板最小化联动（收起插件区域空白，给编辑器让位）
 *
 * - 默认（.workspace-stage）：横向 flex，仍是「同一时刻只显示一个容器」的既有互斥视图；
 *   各容器内联宽度 = workAreaWidth（父容器宽度契约不变）。
 * - 插件面板最小化（.workspace-stage--plugin-docked）：切纵向，插件容器固定 44px 工具条
 *   （order:-1 置顶），编辑器占满剩余高度；插件容器内联宽度仍为 workAreaWidth。
 * - 只做布局排布，颜色/描边/材质仍由 --ui-* / --bz-content-* 令牌提供（四风格 × 三密度零硬编码）。
 * ========================================================================== */
.workspace-stage {
    display: flex;
    flex-direction: row;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

.workspace-stage--plugin-docked {
    flex-direction: column;
}

.workspace-stage--plugin-docked #plugin-containers {
    order: -1;
    flex: 0 0 44px;
    height: 44px;
    min-height: 44px;
    overflow: hidden;
}

.workspace-stage--plugin-docked #md-container {
    order: 0;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
}

/* ============================================================================
 * 内容区（工区）容器：四风格材质（视觉升级 1.5.5 修复）
 *
 * 消费 --bz-content-*（由 #editor-container 从 P0 冻结令牌派生；hybrid 内容区 = paper）：
 * - 表面：glass 半透明（--ui-content-surface-opacity 0.72，1.5.6 增强）/ paper 与 hybrid 纸感底 /
 *   workbench 保持既有 --theme-background-color（--ui-bg 同值）；
 * - 圆角/描边/阴影：workbench 下全部为 0 或不可见，默认观感零变化。
 * ::after 负责描边与阴影（paint 在子内容之上，1px hairline 不会被 Monaco 覆盖）；
 * workbench 时 opacity 0 不参与绘制。
 *
 * 注：本组材质规则放在各容器「布局规则」之后，避免改变既有布局契约静态测试
 * （tests/unit/viewer-layout-contract.test.ts 以「首个选择器出现位置」取布局块）的解析口径。
 * ========================================================================== */
#md-container,
#plugin-containers,
#tool-containers,
#html-containers,
#pdf-containers {
    background-color: var(--theme-background-color);
    background-color: var(--bz-content-surface, var(--theme-background-color));
    background-image: linear-gradient(
        var(--bz-content-veil, transparent),
        var(--bz-content-veil, transparent)
    );
    border-radius: var(--bz-content-radius, 0);
    /* 仅供内容区材质描边/阴影层（::after）定位，不改变子元素既有绝对定位基准 */
    position: relative;
}

#md-container::after,
#plugin-containers::after,
#tool-containers::after,
#html-containers::after,
#pdf-containers::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    opacity: var(--bz-content-on, 0);
    border-radius: var(--bz-content-radius, 0);
    box-shadow:
        inset 0 0 0 var(--bz-content-hairline, 0) var(--ui-border, var(--theme-border-color)),
        inset 0 1px 0 var(--ui-highlight-border-color),
        var(--ui-shadow-1);
}

/* 内容区表面延伸到编辑器工具栏条（MarkdownContainer 内 #md-edit-tools-bar）：paper / hybrid
   下编辑区顶部条与内容区同底，workbench 下取 --ui-bg = 既有 --theme-background-color（零变化）。
   本规则只接管背景材质，不改动布局/字号/文字色。 */
#md-container :deep(#md-edit-tools-bar) {
    background-color: var(--bz-content-surface, var(--theme-background-color));
    background-image: linear-gradient(
        var(--bz-content-veil, transparent),
        var(--bz-content-veil, transparent)
    );
}

/* 预览区纸感底（内容区 = paper / hybrid 的素材边界）：workbench 下 --bz-content-card-surface
   计算为 --theme-card-background（与既有预览底完全同值，零变化）；paper / hybrid 叠主题色
   低饱和薄雾、glass 为半透明面。只接管背景材质，不改变预览正文/代码/表格的既有配色。 */
#md-container :deep(.md-preview) {
    background-color: var(--theme-card-background);
    background-color: var(--bz-content-card-surface, var(--theme-card-background));
}

#md-container :deep(#markdown-preview-html) {
    background-color: var(--theme-card-background);
    background-color: var(--bz-content-card-surface, var(--theme-card-background));
}

/* 按需挂载的 HTML/PDF 异步组件占位（加载中 / 加载失败） */
.async-container-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 120px;
    font-size: 14px;
    /* 历史令牌 --theme-text-secondary 已由 styles/content-tokens.css 等值补定义（原兜底 #757575） */
    color: var(--theme-text-secondary);
}

/* ============================================================================
 * 1.5.7 LLM Wiki L5：右侧 AI 面板容器
 *
 * - 材质走上壳层材质（--bz-shell-*，由 #editor-container 从 P0 冻结令牌派生）：workbench
 *   下与既有卡片底同值（观感零变化），paper / glass / hybrid 自动获得风格化表面；
 * - 宽度由父组件内联 style 提供（展开 / 窄档 / 折叠三态），本规则只负责材质、可收缩与分隔；
 * - 四风格 × 三密度差异全部由 --ui-* / --bz-* 令牌派生，不写风格分支。
 * ========================================================================== */
.llm-ai-panel-container {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    position: relative;
    background-color: var(--theme-card-background);
    background-color: var(--bz-shell-surface, var(--theme-card-background));
    background-image: linear-gradient(
        var(--bz-shell-veil, transparent),
        var(--bz-shell-veil, transparent)
    );
    border-left: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--bz-shell-radius, 0);
}

/* 1.5.7 体验微调：宽度拖到 0 时面板仍挂载（对话状态不丢、可再拖回），
   去掉左侧 hairline 并置 visibility:hidden，保证 0 宽时视觉上等于收起、
   面板内不可见的控件也不会进入 Tab 焦点序列（宽度恢复后自动还原）。 */
.llm-ai-panel-container--zero-width {
    border-left: none;
    visibility: hidden;
}

/* ============================================================================
 * 1.5.7 体验升级：编辑区与 AI 面板之间的 split 分隔条
 *
 * - 5px 透明热区（宽度由脚本常量绑定内联 style，单一真源），视觉分隔线由面板
 *   既有 border-left hairline 承担，不重复画线；
 * - hover / focus-visible 高亮（--ui-accent-soft 底 + 居中强调线），cursor: col-resize；
 * - 拖动/键盘交互在脚本；四风格 × 三密度差异全部由 --ui-* 令牌派生，不写风格分支。
 * ========================================================================== */
.llm-ai-splitter {
    position: relative;
    flex: 0 0 auto;
    align-self: stretch;
    min-height: 0;
    cursor: col-resize;
    touch-action: none;
    background: transparent;
    transition: background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-splitter::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: var(--ui-hairline-width, 1px);
    background: transparent;
    transform: translateX(-50%);
    transition: background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-splitter:hover,
.llm-ai-splitter:focus-visible {
    background-color: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-ai-splitter:hover::before,
.llm-ai-splitter:focus-visible::before {
    background-color: var(--ui-accent, var(--theme-accent-color));
}

.llm-ai-splitter:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

/* ============================================================================
 * 1.5.7 体验调整：AI 面板收起后的右侧边栏入口
 *
 * - 入口按钮渲染在工作区右侧导航条（#right-navi）顶部，宽度跟随右侧栏（40px），
 *   **不占编辑区宽度**；
 * - 1.5.7 体验微调（用户反馈）：传统模式与 LLM Wiki 模式都显示——LLM Wiki 模式在面板
 *   收起时显示（点击展开；展开态不渲染，收起按钮在 AI 面板头部）；传统模式始终显示，
 *   点击走「切换到 LLM Wiki 模式」的确认 + 初始化流程（与系统设置页同样处理）；
 * - 图标按钮：title / aria-label 走 i18n（随模式切换文案），原生 button 可 Tab 聚焦；
 * - 四风格 × 三密度差异全部由 --ui-* / --bz-* 令牌派生，不写风格分支；
 * - #right-navi 改纵向 flex：入口固定顶部、NaviTab 内容区占据剩余高度并可滚动，
 *   保证入口按钮不会因右侧快捷链接数量而移出可视区（传统模式零布局变化：仅多一个入口）。
 * ========================================================================== */
#right-navi {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow: hidden;
}

#right-navi :deep(#navi-tab) {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    overflow-y: auto;
}

.llm-ai-sidebar-entry {
    box-sizing: border-box;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 100%;
    /* 三密度：入口行高与图标尺寸随 --ui-row-height（紧凑 24 / 标准 28 / 宽松 32）派生 */
    height: calc(var(--ui-row-height, 28px) + 8px);
    padding: 0;
    color: var(--ui-accent, var(--theme-accent-color));
    cursor: pointer;
    background-color: var(--theme-card-background);
    background-color: var(--bz-shell-surface, var(--theme-card-background));
    border: none;
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.llm-ai-sidebar-entry:hover {
    background-color: var(--ui-accent-soft, var(--theme-hover-background));
}

.llm-ai-sidebar-entry:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.llm-ai-sidebar-entry svg {
    width: calc(var(--ui-row-height, 28px) - 6px);
    height: calc(var(--ui-row-height, 28px) - 6px);
    fill: currentColor;
}

/* 应用主题到所有子元素 */
* {
    color: var(--theme-text-color);
}

/* 链接颜色 */
a {
    color: var(--theme-accent-color);
}

/* 按钮样式 */
button {
    background-color: var(--theme-button-background);
    color: var(--theme-button-text-color);
}

button:hover {
    background-color: var(--theme-hover-background);
}
</style>
