<template>
    <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
       1.5.7 体验微调（用户反馈批次 A5）工具条右侧：
       编辑视图三态切换（编辑 / 预览 / 编辑+预览，传统模式与 LLM Wiki 模式都渲染）
       + 传统模式 ↔ LLM Wiki 模式快速切换（两模式都显示），
       均为纯图标按钮（内联 SVG / currentColor / 24 网格 stroke 1.5），不占用左侧格式按钮的可收缩区。
  -->
    <div ref="toolbarContainer" class="toolbar-container">
        <!-- 左侧格式快捷按钮区：参与既有自适应收缩（宽度不足时按既有算法缩小，必要时裁剪） -->
        <div class="toolbar-quick-access">
            <button
                v-for="(items, index) in QuickAccess"
                :id="items.id"
                :key="index"
                :title="t(items.titleKey)"
                :class="[
                    'tool-btn',
                    items.class,
                    { 'tool-btn--active': isFormatActive(items.param) }
                ]"
                :style="{ width: buttonSize + 'px', height: buttonSize + 'px' }"
                @click="items.clickFn($event, items.param)"
            ></button>
        </div>
        <!-- 右侧视图/模式入口：flex 0 0 auto + margin-left:auto，工具条变窄时始终可见（不参与裁剪） -->
        <div ref="toolbarActions" class="toolbar-actions" data-toolbar-llm-wiki-actions>
            <!-- 编辑视图三态切换：两模式都渲染；图标 = 当前视图，点击循环切换
                 （编辑 → 预览 → 编辑+预览 → 编辑），状态真源为 workspace-layout 的 viewMode。 -->
            <button
                id="workspace-view-mode-toggle"
                type="button"
                class="toolbar-action-btn"
                data-workspace-view-mode-toggle="true"
                :data-view-mode="currentViewMode"
                :title="viewModeToggleLabel"
                :aria-label="viewModeToggleLabel"
                @click="cycleWorkspaceViewMode"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                >
                    <!-- 当前「仅编辑」→ 铅笔 -->
                    <template v-if="currentViewMode === 'edit'">
                        <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                        <path d="M13.5 6.5l4 4" />
                    </template>
                    <!-- 当前「仅预览」→ 眼睛 -->
                    <template v-else-if="currentViewMode === 'preview'">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                    </template>
                    <!-- 当前「编辑+预览」→ 分栏（左右两个窗格） -->
                    <template v-else>
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M12 4v16" />
                    </template>
                </svg>
            </button>
            <!-- 工作区模式快速切换：传统模式显示「切换到 LLM Wiki」，LLM Wiki 模式显示「切换到传统模式」 -->
            <button
                id="llm-workspace-mode-toggle"
                type="button"
                class="toolbar-action-btn"
                data-workspace-mode-toggle="true"
                :data-workspace-mode="isLlmWikiMode ? 'llm-wiki' : 'traditional'"
                :title="workspaceModeToggleLabel"
                :aria-label="workspaceModeToggleLabel"
                :aria-pressed="isLlmWikiMode"
                @click="handleWorkspaceModeToggle"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                >
                    <!-- 传统模式 → 动作「切换到 LLM Wiki」（星芒）；LLM Wiki → 动作「切换到传统」（文稿） -->
                    <path
                        v-if="!isLlmWikiMode"
                        d="M12 3l1.6 4.5a2 2 0 0 0 1.2 1.2L19.5 10l-4.7 1.3a2 2 0 0 0-1.2 1.2L12 17.5l-1.6-5a2 2 0 0 0-1.2-1.2L4.5 10l4.7-1.3a2 2 0 0 0 1.2-1.2L12 3z"
                    />
                    <template v-else>
                        <path d="M14 3H6v18h12V7l-4-4z" />
                        <path d="M14 3v4h4" />
                        <path d="M9 12h6" />
                        <path d="M9 16h6" />
                    </template>
                </svg>
            </button>
        </div>
    </div>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, nextTick, computed } from 'vue'
import { t } from '../../common/i18n'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { useEventBus } from '../../composables/useEventBus'
import { useWorkspaceMode } from '../../composables/useWorkspaceMode'
import {
    requestSwitchToLlmWiki,
    switchToTraditional
} from '../../composables/useWorkspaceModeSwitch'
// 结构优化第 2 批 2.2（H4）：直接从功能模块引入 QuickAccess，避免经 `hemy-editor`
// 聚合桶把 Monaco/编辑器动作等重型依赖带进工具栏 chunk（该组件已改为按需加载）。
import { MdEditQuickAccess as QuickAccess } from './hemy-editor-quick-access'
import {
    currentWorkspaceLayout,
    isWorkspaceLayoutViewMode,
    updateCurrentWorkspaceViewMode,
    type WorkspaceLayoutViewMode
} from './workspace-layout'

type InlineFormatState = {
    bold: boolean
    italic: boolean
    strike: boolean
    code: boolean
}

const activeFormats = ref<InlineFormatState>({
    bold: false,
    italic: false,
    strike: false,
    code: false
})

function isFormatActive(param: string): boolean {
    const key = (
        { bold: 'bold', italic: 'italic', deleteline: 'strike', codeline: 'code' } as const
    )[param as 'bold' | 'italic' | 'deleteline' | 'codeline']
    return key ? activeFormats.value[key] : false
}

const { on: onEventBus } = useEventBus({ componentIdPrefix: 'MarkdownEditTools' })
onEventBus(EVENT_BUS.MONACO_FORMAT_STATE_CHANGED, (state: unknown) => {
    if (state && typeof state === 'object') {
        activeFormats.value = state as InlineFormatState
    }
})

/* ============================================================================
 * 1.5.7 体验微调（用户反馈批次 A5）：工具条右侧视图/模式图标按钮
 *
 * - 编辑视图三态切换：传统模式与 LLM Wiki 模式都渲染；状态真源为 `workspace-layout`
 *   的 `currentWorkspaceLayout.viewMode`（与视图菜单 F9/F10/F11、布局 profile 共用，
 *   不新增第二份视图状态）。点击按「编辑 → 预览 → 编辑+预览 → 编辑」循环，
 *   图标显示当前视图，title/aria-label 说明「当前视图 + 点击后的目标视图」；
 *   两个窗格由 `MarkdownEditComponent` 按同一真源用 v-show 承接（实例不重建）；
 * - 模式快速切换：两模式都渲染；传统 → LLM Wiki 与系统设置同样处理（确认 + 初始化 +
 *   写配置，见 `useWorkspaceModeSwitch`）；LLM Wiki → 传统直接写配置生效；
 * - 全部为纯图标按钮（title/aria-label 走 i18n），四风格 × 三密度由 --ui-* 令牌派生。
 * ========================================================================== */
const { isLlmWikiMode } = useWorkspaceMode()

/** 三态视图的循环顺序（编辑 → 预览 → 编辑+预览 → 编辑） */
const VIEW_MODE_CYCLE: readonly WorkspaceLayoutViewMode[] = ['edit', 'preview', 'edit-preview']

/** i18n：当前视图描述键 */
const VIEW_MODE_CURRENT_LABEL_KEYS: Record<WorkspaceLayoutViewMode, string> = {
    edit: 'editorUi.viewModeToggle.currentEdit',
    preview: 'editorUi.viewModeToggle.currentPreview',
    'edit-preview': 'editorUi.viewModeToggle.currentEditPreview'
}

/** i18n：点击后的目标视图描述键 */
const VIEW_MODE_NEXT_LABEL_KEYS: Record<WorkspaceLayoutViewMode, string> = {
    edit: 'editorUi.viewModeToggle.switchToPreview',
    preview: 'editorUi.viewModeToggle.switchToEditPreview',
    'edit-preview': 'editorUi.viewModeToggle.switchToEdit'
}

/** 当前视图模式（单一真源；非法/损坏值回落默认「编辑+预览」，保证按钮文案可解析） */
const currentViewMode = computed<WorkspaceLayoutViewMode>(() =>
    isWorkspaceLayoutViewMode(currentWorkspaceLayout.viewMode)
        ? currentWorkspaceLayout.viewMode
        : 'edit-preview'
)

/** 下一个循环到的视图模式（indexOf 返回 -1 时 `(index + 1) % 3 = 0`，回落「仅编辑」） */
const nextViewMode = computed<WorkspaceLayoutViewMode>(() => {
    const index = VIEW_MODE_CYCLE.indexOf(currentViewMode.value)
    return VIEW_MODE_CYCLE[(index + 1) % VIEW_MODE_CYCLE.length]
})

/** 视图切换按钮文案：当前视图 + 点击后的目标视图 */
const viewModeToggleLabel = computed(() =>
    t('editorUi.viewModeToggle.title', {
        current: t(VIEW_MODE_CURRENT_LABEL_KEYS[currentViewMode.value]),
        next: t(VIEW_MODE_NEXT_LABEL_KEYS[currentViewMode.value])
    })
)

/** 循环切换编辑视图：写入单一真源，由 MarkdownEditComponent 按状态渲染三态布局 */
function cycleWorkspaceViewMode(): void {
    updateCurrentWorkspaceViewMode(nextViewMode.value)
}

/** 工作区模式快速切换按钮文案：描述点击后的目标模式 */
const workspaceModeToggleLabel = computed(() =>
    t(
        isLlmWikiMode.value
            ? 'editorUi.llmWikiPanel.switchToTraditional'
            : 'editorUi.llmWikiPanel.switchToLlmWiki'
    )
)

/** 工作区模式快速切换：传统 → LLM Wiki 走确认+初始化；LLM Wiki → 传统直接写配置 */
function handleWorkspaceModeToggle(): void {
    if (isLlmWikiMode.value) {
        void switchToTraditional()
        return
    }
    requestSwitchToLlmWiki()
}

const showWidth = ref('')
const toolbarContainer = ref<HTMLElement | null>(null)
const toolbarActions = ref<HTMLElement | null>(null)
const buttonSize = ref(35) // 默认按钮大小
const MIN_BUTTON_SIZE = 20 // 最小按钮大小
const MAX_BUTTON_SIZE = 35 // 最大按钮大小
const BUTTON_GAP = 2 // 按钮之间的间距

// PF-12：保存 ResizeObserver 实例引用，组件卸载时才能 disconnect()。
// 此前 observer 在 onMounted 里创建后引用即丢失，卸载后仍观察已脱离 DOM 的容器，
// 阻碍组件实例与容器节点回收（内存泄漏缺口）。
let resizeObserver: ResizeObserver | null = null

const props = defineProps({
    // 编辑器宽度
    toolBarWidth: {
        type: String,
        default: '100%'
    }
})

function initButtonSvg() {
    for (const key in QuickAccess) {
        if (Object.prototype.hasOwnProperty.call(QuickAccess, key)) {
            // 确保 key 是 svgs 对象自身的属性
            const element = document.getElementById(key)
            if (element) {
                element.innerHTML = QuickAccess[key].svg
            }
        }
    }
}

/**
 * 计算按钮大小，确保左侧格式按钮在一行显示。
 * 1.5.7 体验微调：可用宽度需扣除右侧视图/模式按钮区（它们不参与收缩、始终可见）。
 */
function calculateButtonSize() {
    if (!toolbarContainer.value) return

    const actionsWidth = toolbarActions.value?.offsetWidth ?? 0
    const containerWidth = Math.max(0, toolbarContainer.value.clientWidth - actionsWidth)
    const buttonCount = Object.keys(QuickAccess).length

    if (buttonCount === 0) return

    // 计算每个按钮可用的大小（考虑间距）
    const availableSize = (containerWidth - (buttonCount - 1) * BUTTON_GAP) / buttonCount

    // 限制在最小和最大值之间
    const calculatedSize = Math.min(Math.max(availableSize, MIN_BUTTON_SIZE), MAX_BUTTON_SIZE)

    buttonSize.value = Math.floor(calculatedSize)
}

/**
 * 处理窗口大小变化
 */
function handleResize() {
    calculateButtonSize()
}

onMounted(() => {
    initButtonSvg()

    // 初始计算按钮大小
    nextTick(() => {
        calculateButtonSize()
    })

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize)

    // 使用 ResizeObserver 监听容器大小变化（PF-12：保存实例引用供卸载时断开）
    if (toolbarContainer.value) {
        resizeObserver = new ResizeObserver(() => {
            calculateButtonSize()
        })
        resizeObserver.observe(toolbarContainer.value)
    }
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
    // PF-12：断开 ResizeObserver，解除对工具栏容器的观察引用
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
    }
})

watch(
    () => props.toolBarWidth,
    (value) => {
        showWidth.value = value
        // 当工具栏宽度变化时，重新计算按钮大小
        nextTick(() => {
            calculateButtonSize()
        })
    }
)

// 1.5.7 体验微调（A5）：三态视图按钮与模式按钮在传统 / LLM Wiki 两模式都常驻，
// 右侧按钮区宽度不随模式变化（不再需要模式切换时重算左侧按钮大小）。
</script>

<style scoped>
.toolbar-container {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    overflow: hidden;
    width: 100%;
    gap: 2px;
}

/* 左侧格式按钮区：允许收缩（flex-shrink 1 + min-width 0），宽度不足时按既有算法缩小并裁剪，
   右侧视图/模式按钮区不参与收缩，永远可见（用户反馈要求右侧按钮常驻）。 */
.toolbar-quick-access {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
}

/* 右侧视图/模式入口区：固定内容宽度、靠右对齐（独立于左侧可收缩区） */
.toolbar-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    margin-left: auto;
}

.tool-btn {
    border: none;
    background-color: var(--theme-background-color);
    color: var(--theme-text-color, black);
    fill: var(--theme-text-color, black);
    place-items: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0; /* 防止按钮被压缩 */
    padding: 2px;
    box-sizing: border-box;
}

.tool-btn:hover {
    background-color: var(--theme-hover-background);
}

/* P0：光标/选区处于粗体、斜体、删除线、行内代码时高亮对应按钮 */
.tool-btn--active {
    background-color: var(--theme-accent-color);
    color: var(--theme-button-text-color);
    fill: var(--theme-button-text-color);
    box-shadow: inset 0 0 0 1px var(--theme-border-color);
}

/* 确保 SVG 图标自适应按钮大小 */
.tool-btn :deep(svg) {
    width: 80%;
    height: 80%;
}

/* ============================================================================
 * 1.5.7 体验微调（用户反馈批次 A5）：工具条右侧纯图标按钮
 *
 * - 尺寸随界面密度派生（--ui-row-height 紧凑 24 / 标准 28 / 宽松 32），与工具条同行；
 * - 表面透明、hover 走 --ui-accent-soft；视图切换按钮的当前态由图标 + `data-view-mode`
 *   表达（循环式三态按钮不使用 aria-pressed——它不是开/关语义），模式按钮的激活态
 *   （LLM Wiki 模式）走 aria-pressed + 强调色；
 * - 键盘焦点环走 --ui-focus-shadow（UI-10），不写任何固定色值。
 * ========================================================================== */
.toolbar-action-btn {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--ui-row-height, 28px);
    height: var(--ui-row-height, 28px);
    padding: 0;
    color: var(--ui-text-secondary, var(--theme-text-color));
    fill: currentColor;
    cursor: pointer;
    background: transparent;
    border: var(--ui-hairline-width, 1px) solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.toolbar-action-btn:hover {
    color: var(--ui-text, var(--theme-text-color));
    background-color: var(--ui-accent-soft, var(--theme-hover-background));
}

/* 激活态：工作区模式按钮表示「当前处于 LLM Wiki 模式」 */
.toolbar-action-btn[aria-pressed='true'] {
    color: var(--ui-accent, var(--theme-accent-color));
    border-color: var(--ui-accent, var(--theme-accent-color));
}

.toolbar-action-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.toolbar-action-btn svg {
    width: 80%;
    height: 80%;
}
</style>
