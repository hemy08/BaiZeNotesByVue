<template>
    <div
        id="plugin-tools-container"
        class="plugin-tools-container"
        :class="containerClassList"
        :data-tool-window-state="toolWindowState"
    >
        <!--
            用户反馈 2026-11-27：顶部 44px 工具条——左侧标题「插件工具」，
            右侧按钮组 [最小化][最大化/还原][返回编辑器]。
            - 最小化：面板折叠为仅 44px 工具条（内容隐藏、按钮保留，再次点击还原）；
            - 最大化：内容区宽度撑满工作区（class 切换 + 减小左右留白，工具组件经
              work-area-width 同步加宽），再次点击还原。
            图标/样式/i18n 与 BaseDialog 非模态工具窗的窗口控制保持一致。
        -->
        <div class="plugin-tools-bar">
            <span class="plugin-tools-bar-title">{{ t('dialogMain.pluginTools.title') }}</span>
            <div class="plugin-tools-bar-actions">
                <button
                    class="plugin-tools-control-btn"
                    type="button"
                    :aria-label="minimizeButtonLabel"
                    :title="minimizeButtonLabel"
                    @click="toggleMinimize"
                >
                    <svg
                        class="plugin-tools-control-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <!-- 最小化：横线；已最小化：双框「还原」 -->
                        <path v-if="toolWindowState !== 'minimized'" d="M5 12h14" />
                        <template v-else>
                            <path d="M4 8h12v12H4z" />
                            <path d="M8 8V4h12v12h-4" />
                        </template>
                    </svg>
                </button>
                <button
                    class="plugin-tools-control-btn"
                    type="button"
                    :aria-label="maximizeButtonLabel"
                    :title="maximizeButtonLabel"
                    @click="toggleMaximize"
                >
                    <svg
                        class="plugin-tools-control-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <!-- 最大化：四角展开；已最大化：四角内缩「还原」 -->
                        <path
                            v-if="toolWindowState !== 'maximized'"
                            d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"
                        />
                        <path v-else d="M9 4v5H4M15 20v-5h5M9 20v-5H4M15 4v5h5" />
                    </svg>
                </button>
                <div id="plugin-tool-close" class="close-button" @click="handleClosePluginTools">
                    <button type="button">{{ t('toolsNetwork.common.backToEditor') }}</button>
                </div>
            </div>
        </div>
        <div v-if="visibleTool" :id="`plugin-tool-${visibleTool.id}`" class="plugin-tool-content">
            <component :is="visibleTool.component" :work-area-width="toolsViewWidth"></component>
        </div>
        <div v-else class="plugin-tool-placeholder">
            <p>{{ t('toolsNetwork.pluginTools.placeholder') }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import EventBus from '../../common/event-bus/event-bus'
// ARC-14：插件工具显示事件走进程内 EventBus（集中常量），
// 原 IPC 通道 'CHANNEL_PLUGIN_TOOL_SHOW' 无任何发送方（死监听）已删除。
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { useEventBus } from '../../composables/useEventBus'
import { t } from '../../common/i18n'
import { pluginTools } from './plugin-tools-const'

// M5：插件工具显示/主题更新订阅经 useEventBus 注册，卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'PluginTools' })

const props = defineProps({
    pluginsAreaWidth: {
        type: String,
        default: '100%'
    }
})

let isShowPluginToolsContainer = false

// ==================== 面板最小化 / 最大化状态（用户反馈 2026-11-27） ====================
/**
 * 插件工具面板状态机（与 BaseDialog 非模态工具窗同名语义，二者互斥）：
 * - `normal`：44px 工具条 + 内容区（沿用既有「总宽 - 100」工作区宽度口径）；
 * - `minimized`：仅保留 44px 工具条（内容 display:none，按钮保留可还原）；
 * - `maximized`：内容区宽度撑满、减小左右留白，工具组件宽度只预留 16px 视觉留白。
 * 面板在 WorkSpace 中常驻（v-show），因此切换工具 / 返回编辑器时显式复位，避免残留折叠态。
 */
type PluginToolsWindowState = 'normal' | 'maximized' | 'minimized'
const toolWindowState = ref<PluginToolsWindowState>('normal')

/** 容器状态 class：供最小化/最大化样式与 E2E/单测断言使用 */
const containerClassList = computed(() => ({
    'plugin-tools-container--minimized': toolWindowState.value === 'minimized',
    'plugin-tools-container--maximized': toolWindowState.value === 'maximized'
}))

/** 最小化按钮文案：正常/最大化时「最小化」，已最小化时「还原」 */
const minimizeButtonLabel = computed(() =>
    toolWindowState.value === 'minimized'
        ? t('dialogMain.toolWindow.restore')
        : t('dialogMain.toolWindow.minimize')
)
/** 最大化按钮文案：正常/最小化时「最大化」，已最大化时「还原」 */
const maximizeButtonLabel = computed(() =>
    toolWindowState.value === 'maximized'
        ? t('dialogMain.toolWindow.restore')
        : t('dialogMain.toolWindow.maximize')
)

function toggleMinimize(): void {
    toolWindowState.value = toolWindowState.value === 'minimized' ? 'normal' : 'minimized'
}

function toggleMaximize(): void {
    toolWindowState.value = toolWindowState.value === 'maximized' ? 'normal' : 'maximized'
}

/**
 * 工具组件工作区宽度：
 * - 正常态沿用既有口径「总宽 - 100」（迁移前行为，零变化）；
 * - 最大化态只预留 16px 视觉留白，让工具内容真正变宽。
 */
const toolsViewWidth = computed(() => {
    const toolWidthValue = parseInt(props.pluginsAreaWidth.replace('px', ''), 10)
    const reservedWidth = toolWindowState.value === 'maximized' ? 16 : 100
    return toolWidthValue - reservedWidth + 'px'
})

const activeToolId = ref('')
const visibleTool = computed(() => {
    return pluginTools.find((tool) => tool.id === activeToolId.value)
})

function handleClosePluginTools() {
    if (isShowPluginToolsContainer) {
        isShowPluginToolsContainer = false
    }
    // 返回编辑器即恢复默认面板布局，下次打开始终是 normal
    toolWindowState.value = 'normal'
    activeToolId.value = ''
    EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
}

onMounted(() => {
    // 监听插件工具显示事件（来自 menu-actions.ts）
    onEventBus(EVENT_BUS.PLUGIN_TOOL_SHOW, handlePluginToolShow)
    // 监听主题更新事件
    onEventBus(EVENT_BUS.THEME_UPDATED, applyThemeStyles)
})

// 组件卸载时 EventBus 监听由 useEventBus 自动清理（无需手写 $off）

// 处理插件工具显示事件
function handlePluginToolShow(action: string) {
    // 从菜单重新选择工具时退出折叠态，保证新工具内容可见（已最大化则保留撑满布局）
    if (toolWindowState.value === 'minimized') {
        toolWindowState.value = 'normal'
    }

    // 显示插件工具容器
    if (!isShowPluginToolsContainer) {
        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        isShowPluginToolsContainer = true
    }

    // 设置当前激活的工具
    activeToolId.value = action
}

function applyThemeStyles() {
    // 主题样式通过 CSS 变量自动应用，无需额外处理
}
</script>

<style scoped>
.plugin-tools-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    background-color: var(--theme-background-color);
    color: var(--theme-text-color);
    overflow-y: auto;
    overflow-x: auto;
}

/* ==================== 顶部工具条（44px） ==================== */
/* 用户反馈 2026-11-27：左侧标题「插件工具」+ 右侧 [最小化][最大化][返回编辑器]；
   颜色/边框全部消费 --ui-* 令牌（四风格 × 三密度自动生效），不写死主题色。 */
.plugin-tools-bar {
    position: sticky;
    top: 0;
    z-index: 5;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    height: 44px;
    padding: 0 10px;
    box-sizing: border-box;
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    background: var(--ui-bg-sunken, var(--theme-background-color));
    color: var(--ui-text, var(--theme-text-color));
}

.plugin-tools-bar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ui-text, var(--theme-text-color));
    white-space: nowrap;
}

.plugin-tools-bar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

/* 控制按钮：与 BaseDialog 工具窗一致（28×28、hover --ui-accent-soft、焦点环 --ui-focus-shadow） */
.plugin-tools-control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    cursor: pointer;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tools-control-btn:hover {
    background: var(--ui-accent-soft, var(--theme-hover-background));
    color: var(--ui-text, var(--theme-text-color));
}

.plugin-tools-control-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tools-control-icon {
    display: block;
    width: 16px;
    height: 16px;
}

/* 「返回编辑器」按钮容器：随工具条右侧排列（原为绝对定位，现并入 44px 工具条） */
.close-button {
    display: flex;
    align-items: center;
    cursor: pointer;
}

.close-button button {
    background-color: var(--theme-button-background);
    color: var(--theme-button-text-color);
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.close-button button:hover {
    background-color: var(--theme-hover-background);
}

/* ==================== 最小化 / 最大化 ==================== */
/* 最小化：面板折叠为仅 44px 工具条，直接子节点中除工具条外全部隐藏（含 Tab 次序） */
.plugin-tools-container--minimized {
    height: 44px;
    min-height: 44px;
    overflow: hidden;
}

.plugin-tools-container--minimized > :not(.plugin-tools-bar) {
    display: none;
}

/* 最大化：内容区宽度撑满、减小左右留白（默认态的居中/受限宽度不再限制） */
.plugin-tools-container--maximized .plugin-tool-content {
    width: 100%;
    max-width: none;
    padding-left: 4px;
    padding-right: 4px;
}

.plugin-tools-container--maximized .plugin-tool-placeholder {
    width: 100%;
    max-width: none;
}

/* 确保动态组件容器正确显示 */
.plugin-tool-content {
    width: 100%;
    min-height: 100%;
    padding: 10px;
    box-sizing: border-box;
}

/* 占位符样式 */
.plugin-tool-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-secondary-text-color);
}

.plugin-tool-placeholder p {
    font-size: 16px;
    text-align: center;
}

.tool-section h1 {
    text-align: center;
}
</style>
