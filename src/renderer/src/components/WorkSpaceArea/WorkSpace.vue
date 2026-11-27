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
    <div
        v-show="isShowMdContainer"
        id="md-container"
        class="md-container"
        :style="{ width: workAreaWidth }"
    >
        <MdContainer :md-container-width="workAreaWidth" />
    </div>
    <div
        v-show="isShowPluginsContainer"
        id="plugin-containers"
        class="plugin-containers"
        :style="{ width: workAreaWidth }"
    >
        <PluginTools :plugins-area-width="workAreaWidth" />
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
    <!-- 最右侧边框 -->
    <div id="right-navi" class="navi-tab" :style="{ width: naviTabWidth, float: 'right' }">
        <NaviTab position="right" @update:navi:tab="onSwitchLeftNaviTab" />
    </div>
</template>

<script setup lang="ts">
import {
    ref,
    computed,
    onMounted,
    onBeforeUnmount,
    watch,
    defineAsyncComponent,
    defineComponent,
    h
} from 'vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { useEventBus } from '@renderer/composables/useEventBus'
import { logger } from '@renderer/common/logger'
import NaviTab from '@renderer/components/WorkSpaceArea/NaviTab.vue'
import ResManager from '@renderer/components/ResourceManager/ResourceManager.vue'
import MdContainer from '@renderer/components/Markdown/MarkdownContainer.vue'
import PluginTools from '@renderer/components/PluginTools/PluginTools.vue'
import HemyTools from '@renderer/components/HemyTools/HemyTools.vue'
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
    window.electron.ipcRenderer.removeListener(
        IPC.VIEW.TOGGLE_RES_MANAGER,
        handleHideDisplayResManager
    )
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
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0));
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
 * 内容区（工区）容器：四风格材质（视觉升级 1.5.5 修复）
 *
 * 消费 --bz-content-*（由 #editor-container 从 P0 冻结令牌派生；hybrid 内容区 = paper）：
 * - 表面：glass 半透明（--ui-content-surface-opacity 0.86）/ paper 与 hybrid 纸感底 /
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
        inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0)),
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
    color: var(--theme-text-secondary, #757575);
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
