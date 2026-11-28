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

            1.5.6 批次 B（REQ-04/05）：工具条中部新增「工具列表 + 搜索框 + 当前工具收藏星标」，
            工具条下方在「无激活工具 / 搜索中 / 用户点工具列表」时显示可发现性视图：
            收藏 → 最近使用 → 全部工具（详见 script 顶部说明）。
        -->
        <div class="plugin-tools-bar">
            <div class="plugin-tools-bar-main">
                <span class="plugin-tools-bar-title">{{ t('dialogMain.pluginTools.title') }}</span>
                <!-- 工具列表（默认视图）入口：仅在工具打开后需要，最小化时不显示（内容区不可见） -->
                <button
                    v-if="!isMinimized"
                    class="plugin-tools-home-btn"
                    :class="{ 'plugin-tools-home-btn--active': isHomeView }"
                    type="button"
                    :aria-label="t('toolsNetwork.pluginTools.backToToolList')"
                    :aria-pressed="isHomeView"
                    :title="t('toolsNetwork.pluginTools.homeHint')"
                    @click="showToolList"
                >
                    <svg
                        class="plugin-tools-bar-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                    </svg>
                </button>
                <!-- REQ-04 搜索框：最小化状态不可用/不显示（v-if 直接卸载，含 Tab 次序）；
                     1.5.6 插件搜索入口视图下隐藏（内容区已渲染大搜索框，避免同屏两个搜索框） -->
                <div v-if="!isMinimized && !searchEntryOpen" class="plugin-tools-search">
                    <svg
                        class="plugin-tools-search-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <circle cx="10.5" cy="10.5" r="6.5" />
                        <path d="M15.3 15.3 20 20" />
                    </svg>
                    <input
                        ref="searchInputRef"
                        v-model="searchText"
                        class="plugin-tools-search-input"
                        type="search"
                        :placeholder="t('toolsNetwork.pluginTools.searchPlaceholder')"
                        :aria-label="t('toolsNetwork.pluginTools.searchAriaLabel')"
                        :aria-expanded="isSearching"
                        :aria-controls="showDiscovery ? 'plugin-tool-search-results' : undefined"
                        autocomplete="off"
                        spellcheck="false"
                        @keydown="handleSearchKeydown"
                    />
                    <button
                        v-if="searchText.length > 0"
                        class="plugin-tools-search-clear"
                        type="button"
                        :aria-label="t('toolsNetwork.pluginTools.searchClear')"
                        :title="t('toolsNetwork.pluginTools.searchClear')"
                        @click="clearSearchAndRefocus"
                    >
                        <svg
                            class="plugin-tools-bar-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                    </button>
                </div>
                <!-- 收藏上限提示（aria-live：读屏可感知，3s 后自动收起） -->
                <span v-if="favoriteLimitNotice" class="plugin-tool-favorite-notice" role="status">
                    {{ favoriteLimitNotice }}
                </span>
                <!-- REQ-05 当前工具收藏星标（工具内收藏入口） -->
                <button
                    v-if="!isMinimized && visibleTool"
                    class="plugin-tools-favorite-btn"
                    :class="{ 'plugin-tools-favorite-btn--active': isActiveToolFavorite }"
                    type="button"
                    :aria-pressed="isActiveToolFavorite"
                    :aria-label="activeToolFavoriteLabel"
                    :title="activeToolFavoriteLabel"
                    @click="toggleFavorite(activeToolId)"
                >
                    <svg
                        class="plugin-tools-bar-icon"
                        viewBox="0 0 24 24"
                        :fill="isActiveToolFavorite ? 'currentColor' : 'none'"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            d="M12 3.6l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.9l5.9-.9L12 3.6z"
                        />
                    </svg>
                </button>
            </div>
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

        <!--
            当前激活工具：v-if 保证「无激活工具不渲染」；v-show 让搜索/工具列表视图出现时
            只隐藏、不卸载组件实例（避免用户在搜索框输入时把工具里正在编辑的内容清空）。
            PLUGIN-06「一次只渲染当前激活工具」与懒加载契约不变。
        -->
        <div
            v-if="visibleTool"
            v-show="!showDiscovery"
            :id="`plugin-tool-${visibleTool.id}`"
            class="plugin-tool-content"
        >
            <component :is="visibleTool.component" :work-area-width="toolsViewWidth"></component>
        </div>

        <!--
            可发现性视图（REQ-04/05）：搜索中 → 结果列表；否则默认视图（收藏 → 最近使用 → 全部工具）。
            最小化时由容器 CSS 统一隐藏（直接子节点除工具条外全部 display:none）。
            说明：默认视图容器沿用既有 `.plugin-tool-placeholder` class 作为「无激活工具」状态标记
            （既有单测以该 class 断言占位区存在），新视觉由 `.plugin-tool-home` 覆盖为列表布局。
        -->
        <div
            v-if="showDiscovery"
            id="plugin-tool-search-results"
            ref="discoveryPanelRef"
            class="plugin-tool-discovery-panel"
            :class="
                isSearching
                    ? 'plugin-tool-search-panel'
                    : 'plugin-tool-placeholder plugin-tool-home'
            "
            :data-plugin-tool-view="discoveryViewKind"
        >
            <!--
                1.5.6 插件搜索入口视图（菜单「插件 → 插件搜索」进入）：
                内容区大搜索框（进入即自动聚焦、占主要视觉空间）；空白查询下方依次展示
                「最近使用（≤20）」与「全部工具」；输入即过滤，Enter/点击打开工具。
                输入/结果切换期间本块保持挂载（不做 v-if 切换），否则输入框会被卸载而丢焦点；
                工具条搜索框在入口视图下隐藏，避免同屏出现两个搜索框。
            -->
            <div v-if="searchEntryOpen" class="plugin-tool-search-entry">
                <h2 class="plugin-tool-search-entry-title">
                    {{ t('toolsNetwork.pluginTools.searchEntryTitle') }}
                </h2>
                <div class="plugin-tool-search-entry-box">
                    <svg
                        class="plugin-tool-search-entry-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <circle cx="10.5" cy="10.5" r="6.5" />
                        <path d="M15.3 15.3 20 20" />
                    </svg>
                    <input
                        ref="entrySearchInputRef"
                        v-model="searchText"
                        class="plugin-tools-entry-search-input"
                        type="search"
                        :placeholder="t('toolsNetwork.pluginTools.searchPlaceholder')"
                        :aria-label="t('toolsNetwork.pluginTools.searchAriaLabel')"
                        autocomplete="off"
                        spellcheck="false"
                        @keydown="handleSearchKeydown"
                    />
                    <button
                        v-if="searchText.length > 0"
                        class="plugin-tool-search-entry-clear"
                        type="button"
                        :aria-label="t('toolsNetwork.pluginTools.searchClear')"
                        :title="t('toolsNetwork.pluginTools.searchClear')"
                        @click="clearSearchAndRefocus"
                    >
                        <svg
                            class="plugin-tool-search-entry-clear-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                    </button>
                </div>
                <p class="plugin-tool-search-entry-hint">
                    {{ t('toolsNetwork.pluginTools.searchEntryHint') }}
                </p>
            </div>
            <div
                v-if="isSearching && searchResults.length === 0"
                class="plugin-tool-search-empty"
                role="status"
            >
                <p class="plugin-tool-search-empty-title">
                    {{ t('toolsNetwork.pluginTools.noResult') }}
                </p>
                <p class="plugin-tool-search-empty-hint">
                    {{ t('toolsNetwork.pluginTools.noResultHint') }}
                </p>
            </div>
            <div v-else class="plugin-tool-discovery">
                <!-- 入口视图且无最近记录：合理空态（不遮挡下方「全部工具」，用户仍可直接选择） -->
                <p v-if="showEntryRecentEmpty" class="plugin-tool-search-entry-empty" role="status">
                    {{ t('toolsNetwork.pluginTools.searchEntryRecentEmpty') }}
                </p>
                <section
                    v-for="section in discoverySections"
                    :key="section.key"
                    class="plugin-tool-section"
                    :data-plugin-tool-section="section.key"
                >
                    <h2 class="plugin-tool-section-title">{{ section.title }}</h2>
                    <!--
                        REQ-06：`全部工具` 分区按 8 个分类分组渲染（收藏/最近/搜索结果仍为单一平铺列表）。
                        - 分类标题行 = 分类图标 + 分类名 + 折叠箭头（整行按钮，aria-expanded）；
                        - 折叠状态持久化到 localStorage（baize:plugin-tools:collapsed-groups）；
                        - 折叠只隐藏行（v-show），不卸载 DOM：搜索过滤/键盘高亮/收藏状态零回归。
                    -->
                    <ul class="plugin-tool-list">
                        <li
                            v-for="group in sectionGroups(section)"
                            :key="`${section.key}-${group.sectionId || 'flat'}`"
                            class="plugin-tool-group"
                            :class="{
                                'plugin-tool-group--collapsed': isGroupCollapsed(group.sectionId)
                            }"
                            :data-plugin-tool-group="group.sectionId || undefined"
                            :data-plugin-tool-group-collapsed="
                                group.sectionId
                                    ? String(isGroupCollapsed(group.sectionId))
                                    : undefined
                            "
                        >
                            <h3 v-if="group.sectionId" class="plugin-tool-group-title">
                                <button
                                    class="plugin-tool-group-toggle"
                                    type="button"
                                    :aria-expanded="!isGroupCollapsed(group.sectionId)"
                                    :aria-controls="groupListId(group.sectionId)"
                                    :title="groupToggleTitle(group.sectionId)"
                                    @click="toggleGroupCollapsed(group.sectionId)"
                                >
                                    <svg
                                        class="plugin-tool-group-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.5"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <path
                                            v-for="(iconPath, iconIndex) in getPluginToolIconPaths(
                                                group.sectionId
                                            )"
                                            :key="iconIndex"
                                            :d="iconPath"
                                        />
                                    </svg>
                                    <span class="plugin-tool-group-name">{{ group.title }}</span>
                                    <svg
                                        class="plugin-tool-group-chevron"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.5"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <path d="M6 9l6 6 6-6" />
                                    </svg>
                                </button>
                            </h3>
                            <ul
                                v-show="!isGroupCollapsed(group.sectionId)"
                                :id="group.sectionId ? groupListId(group.sectionId) : undefined"
                                class="plugin-tool-list plugin-tool-group-list"
                            >
                                <li
                                    v-for="(tool, index) in group.tools"
                                    :key="`${section.key}-${tool.actionId}`"
                                    class="plugin-tool-item"
                                    :class="{
                                        'plugin-tool-item--active': isActiveSearchItem(tool)
                                    }"
                                    :data-tool-action-id="tool.actionId"
                                >
                                    <button
                                        class="plugin-tool-item-main"
                                        type="button"
                                        @click="openTool(tool.actionId)"
                                        @mouseenter="handleToolItemHover(index)"
                                    >
                                        <!-- REQ-06：每工具 24 网格线框图标（currentColor，随 --ui-* 令牌） -->
                                        <svg
                                            class="plugin-tool-item-icon"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
                                            <path
                                                v-for="(iconPath, iconIndex) in tool.iconPaths"
                                                :key="iconIndex"
                                                :d="iconPath"
                                            />
                                        </svg>
                                        <span class="plugin-tool-item-name">{{ tool.name }}</span>
                                        <span
                                            v-if="tool.category"
                                            class="plugin-tool-item-category"
                                        >
                                            {{ tool.category }}
                                        </span>
                                    </button>
                                    <button
                                        class="plugin-tool-item-favorite"
                                        :class="{
                                            'plugin-tool-item-favorite--active': isFavorite(
                                                tool.actionId
                                            )
                                        }"
                                        type="button"
                                        :aria-pressed="isFavorite(tool.actionId)"
                                        :aria-label="favoriteButtonLabel(tool.actionId)"
                                        :title="favoriteButtonLabel(tool.actionId)"
                                        @click.stop="toggleFavorite(tool.actionId)"
                                    >
                                        <svg
                                            class="plugin-tool-item-favorite-icon"
                                            viewBox="0 0 24 24"
                                            :fill="
                                                isFavorite(tool.actionId) ? 'currentColor' : 'none'
                                            "
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
                                            <path
                                                d="M12 3.6l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.9l5.9-.9L12 3.6z"
                                            />
                                        </svg>
                                    </button>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EventBus from '../../common/event-bus/event-bus'
// ARC-14：插件工具显示事件走进程内 EventBus（集中常量），
// 原 IPC 通道 'CHANNEL_PLUGIN_TOOL_SHOW' 无任何发送方（死监听）已删除。
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { useEventBus } from '../../composables/useEventBus'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import { pluginTools } from './plugin-tools-const'
import {
    PLUGIN_TOOL_SECTION_IDS,
    PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY,
    PLUGIN_TOOLS_FAVORITES_LIMIT,
    PLUGIN_TOOLS_FAVORITES_STORAGE_KEY,
    PLUGIN_TOOLS_RECENT_LIMIT,
    PLUGIN_TOOLS_RECENT_STORAGE_KEY,
    getPluginToolIconPaths,
    getPluginToolSectionLabelKey,
    groupPluginToolEntriesBySection,
    readPluginToolIds,
    recordRecentPluginToolId,
    resolvePluginToolSearchEntries,
    searchPluginTools,
    toggleCollapsedPluginToolGroup,
    toggleFavoritePluginToolId,
    writePluginToolIds,
    type PluginToolSearchEntry,
    type PluginToolSectionGroup,
    type PluginToolsStorageLike
} from './plugin-tools-search'

// M5：插件工具显示/主题更新订阅经 useEventBus 注册，卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'PluginTools' })

const props = defineProps({
    pluginsAreaWidth: {
        type: String,
        default: '100%'
    }
})

/**
 * REQ-12：面板折叠状态上抛给工作区（父组件 WorkSpace）。
 * 选择 Props/emit（父子直连）而非新增 EventBus 事件：不产生跨组件契约条目、不涉及 IPC，
 * 事件本身由「PluginTools emit ↔ WorkSpace 监听」两侧单测锁定（tool-window-controls /
 * workspace-shell）；WorkSpace 收到 minimized=true 时收起插件区域空白、让编辑器可见。
 */
const emit = defineEmits<{
    (event: 'window-state-change', minimized: boolean): void
}>()

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

/** 是否处于最小化态：搜索框与可发现性视图均不可用/不显示 */
const isMinimized = computed(() => toolWindowState.value === 'minimized')

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

// ==================== 1.5.6 批次 B：工具可发现性（REQ-04 搜索 / REQ-05 最近+收藏） ====================
/**
 * 可发现性视图状态：
 * - `searchText`：工具条/入口视图搜索框内容（trim 后非空即进入搜索结果模式）；
 * - `homeViewOpen`：用户点「工具列表」回到默认视图（工具仍记住，但内容区让位给列表）；
 * - `searchEntryOpen`（1.5.6 插件搜索）：菜单「插件 → 插件搜索」打开的搜索入口视图，
 *   内容区渲染大搜索框（自动聚焦）；查询为空时展示「最近使用 ≤20 → 全部工具」；
 * - 默认视图 = 无激活工具 / 用户主动回列表，分区顺序固定「收藏 → 最近使用 → 全部工具」；
 * - 打开任意工具（菜单或列表/搜索结果）会清空搜索并回到工具内容，最近使用随之更新。
 */
const searchText = ref('')
const homeViewOpen = ref(false)
/** 插件搜索入口视图开关（菜单 PLUGIN_SEARCH_SHOW 置位；打开工具 / 工具列表 / 返回编辑器复位） */
const searchEntryOpen = ref(false)
const activeSearchIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
/** 入口视图内容区大搜索框（自动聚焦目标；与工具条搜索框共用 searchText） */
const entrySearchInputRef = ref<HTMLInputElement | null>(null)
const discoveryPanelRef = ref<HTMLElement | null>(null)
const favoriteLimitNotice = ref('')
let favoriteLimitNoticeTimer: ReturnType<typeof setTimeout> | null = null

/** 当前注册表（38 项）的可搜索条目（名称/分类按当前语言解析，切语言自动重算） */
const registeredActionIds = pluginTools.map((tool) => tool.id)
const registeredActionIdSet = new Set(registeredActionIds)
const searchEntries = computed<PluginToolSearchEntry[]>(() =>
    resolvePluginToolSearchEntries(registeredActionIds, t)
)
const searchEntryMap = computed(
    () => new Map(searchEntries.value.map((entry) => [entry.actionId, entry]))
)

/** 是否处于搜索模式（结果列表替换工具内容/默认视图） */
const isSearching = computed(() => searchText.value.trim().length > 0)
/** 是否处于「插件搜索」入口视图（菜单进入且查询为空；输入后切换为搜索结果） */
const isSearchEntryView = computed(() => searchEntryOpen.value && !isSearching.value)
/** 默认视图是否可见：搜索优先，其次「无激活工具」或用户点了工具列表（入口视图另算） */
const isHomeView = computed(
    () => !isSearching.value && !searchEntryOpen.value && (!visibleTool.value || homeViewOpen.value)
)
const showDiscovery = computed(
    () => isSearching.value || isSearchEntryView.value || isHomeView.value
)
/** 可发现性视图种类（供 data-plugin-tool-view 与单测/E2E 断言）：搜索结果 / 插件搜索入口 / 默认工具列表 */
const discoveryViewKind = computed<'search' | 'search-entry' | 'home'>(() => {
    if (isSearching.value) {
        return 'search'
    }
    return isSearchEntryView.value ? 'search-entry' : 'home'
})

/** 搜索结果（空查询返回空数组；相关度排序见 plugin-tools-search.searchPluginTools） */
const searchResults = computed(() => searchPluginTools(searchEntries.value, searchText.value))

// ==================== localStorage（最近使用 / 收藏；无 IPC、无配置文件） ====================
/** 解析本机 localStorage；隐私模式/被禁用时返回 null（功能降级为仅内存） */
function resolvePluginToolsStorage(): PluginToolsStorageLike | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null
        }
        return window.localStorage
    } catch {
        return null
    }
}

const pluginToolsStorage = resolvePluginToolsStorage()
let storageWarningLogged = false

/** 存储写入失败只告警一次（避免每次收藏/打开工具都刷屏），功能本身仍在本会话内存内生效 */
function warnStorageFailureOnce(message: string): void {
    if (storageWarningLogged) {
        return
    }
    storageWarningLogged = true
    logger.warn(message)
}

const recentIds = ref<string[]>(
    readPluginToolIds(pluginToolsStorage, PLUGIN_TOOLS_RECENT_STORAGE_KEY, {
        validIds: registeredActionIdSet,
        limit: PLUGIN_TOOLS_RECENT_LIMIT
    })
)
const favoriteIds = ref<string[]>(
    readPluginToolIds(pluginToolsStorage, PLUGIN_TOOLS_FAVORITES_STORAGE_KEY, {
        validIds: registeredActionIdSet,
        limit: PLUGIN_TOOLS_FAVORITES_LIMIT
    })
)

/** 分区视图模型：title 在 computed 内取 t()（切语言随 currentLocale 响应式更新） */
interface PluginToolSectionView {
    readonly key: 'search' | 'favorites' | 'recent' | 'all'
    readonly title: string
    readonly tools: readonly PluginToolSearchEntry[]
}

/** id → 条目（收藏/最近/全部共用，丢弃已不在注册表中的旧 id） */
function resolveStoredTools(ids: readonly string[]): PluginToolSearchEntry[] {
    return ids
        .map((id) => searchEntryMap.value.get(id))
        .filter((entry): entry is PluginToolSearchEntry => entry !== undefined)
}

const favoriteTools = computed(() => resolveStoredTools(favoriteIds.value))
const recentTools = computed(() => resolveStoredTools(recentIds.value))

/** 入口视图且无最近记录：显示空态提示（下方仍展示全部工具，保证任何情况下都能选择工具） */
const showEntryRecentEmpty = computed(
    () => isSearchEntryView.value && recentTools.value.length === 0
)

/**
 * 渲染分区：搜索模式 → 单一「搜索结果」分区；插件搜索入口→ 最近使用（≤20）→ 全部工具；
 * 默认视图 → 收藏/最近（有内容才显示）→ 全部工具。
 * 默认视图的分区顺序是需求契约（收藏 → 最近使用 → 全部工具）；
 * 入口视图按 1.5.6 需求口径只展示「最近使用 → 全部工具」（空白区域展示最近 20 个插件）。
 */
const discoverySections = computed<PluginToolSectionView[]>(() => {
    if (isSearching.value) {
        return searchResults.value.length > 0
            ? [
                  {
                      key: 'search',
                      title: t('toolsNetwork.pluginTools.searchResultCount', {
                          count: searchResults.value.length
                      }),
                      tools: searchResults.value
                  }
              ]
            : []
    }
    if (isSearchEntryView.value) {
        const entrySections: PluginToolSectionView[] = []
        if (recentTools.value.length > 0) {
            entrySections.push({
                key: 'recent',
                title: t('toolsNetwork.pluginTools.recent'),
                tools: recentTools.value
            })
        }
        entrySections.push({
            key: 'all',
            title: t('toolsNetwork.pluginTools.allTools'),
            tools: searchEntries.value
        })
        return entrySections
    }
    if (!isHomeView.value) {
        return []
    }
    const sections: PluginToolSectionView[] = []
    if (favoriteTools.value.length > 0) {
        sections.push({
            key: 'favorites',
            title: t('toolsNetwork.pluginTools.favorites'),
            tools: favoriteTools.value
        })
    }
    if (recentTools.value.length > 0) {
        sections.push({
            key: 'recent',
            title: t('toolsNetwork.pluginTools.recent'),
            tools: recentTools.value
        })
    }
    sections.push({
        key: 'all',
        title: t('toolsNetwork.pluginTools.allTools'),
        tools: searchEntries.value
    })
    return sections
})

// ==================== REQ-06 分类折叠（8 分组，状态持久化） ====================
/**
 * 已折叠的分类 id（如 `['encrypt','net']`）：读取容错（JSON 损坏/旧分类 id → 自动过滤），
 * 只落本机 localStorage；写入失败降级为本次会话内存生效（与最近使用/收藏同一错误策略）。
 */
const collapsedGroupIds = ref<string[]>(
    readPluginToolIds(pluginToolsStorage, PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY, {
        validIds: new Set(PLUGIN_TOOL_SECTION_IDS)
    })
)

/** 分组视图（sectionId + 分类标题；标题随语言切换由 computed 重算） */
interface PluginToolGroupView extends PluginToolSectionGroup {
    readonly title: string
}

/** 分类标题：已知分类取菜单分组词条；未知分类回退「分类路径末级 → 分区 id」，不出现空标题 */
function resolvePluginToolGroupTitle(group: PluginToolSectionGroup): string {
    const labelKey = getPluginToolSectionLabelKey(group.sectionId)
    if (labelKey) {
        return t(labelKey)
    }
    const firstEntry = group.tools[0]
    return firstEntry?.categoryPath[firstEntry.categoryPath.length - 1] ?? group.sectionId
}

/** 「全部工具」的 8 分类分组（收藏/最近/搜索结果仍为平铺列表，不分折叠） */
const allToolGroups = computed<PluginToolGroupView[]>(() =>
    groupPluginToolEntriesBySection(searchEntries.value).map((group) => ({
        ...group,
        title: resolvePluginToolGroupTitle(group)
    }))
)

/** 分区渲染分组：`全部工具` → 8 分类分组；其余分区 → 单一平铺伪分组（sectionId 为空串、无标题行） */
function sectionGroups(section: PluginToolSectionView): PluginToolGroupView[] {
    if (section.key === 'all') {
        return allToolGroups.value
    }
    return [{ sectionId: '', title: '', tools: section.tools }]
}

/** 某分类是否处于折叠态（空 sectionId 的伪分组恒为展开） */
function isGroupCollapsed(sectionId: string): boolean {
    return sectionId.length > 0 && collapsedGroupIds.value.includes(sectionId)
}

/** 分组列表容器 id（折叠按钮 aria-controls 目标；同屏仅「全部工具」分区带分组，id 唯一） */
function groupListId(sectionId: string): string {
    return `plugin-tool-group-list-${sectionId}`
}

/** 折叠/展开按钮 title（可访问名由可见分类名 + aria-expanded 承载，title 仅作鼠标提示） */
function groupToggleTitle(sectionId: string): string {
    return isGroupCollapsed(sectionId)
        ? t('toolsNetwork.pluginTools.expandGroup')
        : t('toolsNetwork.pluginTools.collapseGroup')
}

/** 折叠切换 + 持久化（纯函数计算新清单，组件只负责存储降级提示） */
function toggleGroupCollapsed(sectionId: string): void {
    if (sectionId.length === 0) {
        return
    }
    collapsedGroupIds.value = toggleCollapsedPluginToolGroup(collapsedGroupIds.value, sectionId)
    if (
        !writePluginToolIds(
            pluginToolsStorage,
            PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY,
            collapsedGroupIds.value
        )
    ) {
        warnStorageFailureOnce(
            '[插件工具] 分类折叠状态写入 localStorage 失败（本次会话内存内生效）'
        )
    }
}

function isFavorite(actionId: string): boolean {
    return favoriteIds.value.includes(actionId)
}

function favoriteButtonLabel(actionId: string): string {
    return isFavorite(actionId)
        ? t('toolsNetwork.pluginTools.removeFavorite')
        : t('toolsNetwork.pluginTools.addFavorite')
}

const isActiveToolFavorite = computed(
    () => visibleTool.value !== undefined && isFavorite(activeToolId.value)
)
const activeToolFavoriteLabel = computed(() =>
    isActiveToolFavorite.value
        ? t('toolsNetwork.pluginTools.removeFavorite')
        : t('toolsNetwork.pluginTools.addFavorite')
)

/** 搜索列表高亮项（仅搜索模式；默认视图不出现高亮） */
function isActiveSearchItem(tool: PluginToolSearchEntry): boolean {
    if (!isSearching.value) {
        return false
    }
    return searchResults.value[activeSearchIndex.value]?.actionId === tool.actionId
}

/** 滚动高亮项到可视区（jsdom 无 scrollIntoView 时安全跳过） */
async function scrollActiveSearchItemIntoView(): Promise<void> {
    await nextTick()
    const active = discoveryPanelRef.value?.querySelector<HTMLElement>('.plugin-tool-item--active')
    if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' })
    }
}

/** 设置搜索高亮序号（循环移动：↑↓ 越界回绕） */
function setActiveSearchIndex(index: number): void {
    if (!isSearching.value) {
        return
    }
    const count = searchResults.value.length
    if (count === 0) {
        activeSearchIndex.value = 0
        return
    }
    activeSearchIndex.value = ((index % count) + count) % count
    void scrollActiveSearchItemIntoView()
}

/** 鼠标悬停搜索结果行时同步高亮（不影响键盘继续上下移动） */
function handleToolItemHover(index: number): void {
    if (!isSearching.value) {
        return
    }
    setActiveSearchIndex(index)
}

/** REQ-04 键盘契约：↑/↓ 移动、Enter 打开、Esc 清空并收起 */
function handleSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
        return
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (searchResults.value.length > 0) {
            setActiveSearchIndex(activeSearchIndex.value + 1)
        }
        return
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (searchResults.value.length > 0) {
            setActiveSearchIndex(activeSearchIndex.value - 1)
        }
        return
    }
    if (event.key === 'Enter') {
        const target = searchResults.value[activeSearchIndex.value]
        if (target) {
            event.preventDefault()
            openTool(target.actionId)
        }
        return
    }
    if (event.key === 'Escape' && searchText.value.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        clearSearch()
    }
}

function clearSearch(): void {
    searchText.value = ''
    activeSearchIndex.value = 0
}

/**
 * 聚焦「当前可见的搜索框」：入口视图 → 内容区大搜索框；其余状态 → 工具条搜索框。
 * 等下一次 DOM 更新后再聚焦（面板/视图刚由事件切换，输入框可能尚未挂载或仍在隐藏容器内）。
 */
async function focusActiveSearchInput(): Promise<void> {
    await nextTick()
    if (searchEntryOpen.value) {
        entrySearchInputRef.value?.focus()
        return
    }
    searchInputRef.value?.focus()
}

/** 清空按钮：清空后用键盘继续输入无需再次点击搜索框 */
function clearSearchAndRefocus(): void {
    clearSearch()
    void focusActiveSearchInput()
}

/** 打开默认视图（工具列表）：保留当前工具，但内容区让位给列表（退出插件搜索入口视图） */
function showToolList(): void {
    clearSearch()
    searchEntryOpen.value = false
    homeViewOpen.value = true
}

/** 记录最近使用（去重置顶，≤20）并持久化 */
function rememberRecentTool(actionId: string): void {
    const next = recordRecentPluginToolId(recentIds.value, actionId)
    recentIds.value = next
    if (!writePluginToolIds(pluginToolsStorage, PLUGIN_TOOLS_RECENT_STORAGE_KEY, next)) {
        warnStorageFailureOnce(
            '[插件工具] 最近使用记录写入 localStorage 失败（本次会话内存内生效）'
        )
    }
}

/** 收藏上限提示（3s 自动收起；定时器在组件卸载时清理） */
function showFavoriteLimitNotice(): void {
    favoriteLimitNotice.value = t('toolsNetwork.pluginTools.favoritesLimitReached', {
        count: PLUGIN_TOOLS_FAVORITES_LIMIT
    })
    if (favoriteLimitNoticeTimer !== null) {
        clearTimeout(favoriteLimitNoticeTimer)
    }
    favoriteLimitNoticeTimer = setTimeout(() => {
        favoriteLimitNotice.value = ''
        favoriteLimitNoticeTimer = null
    }, 3000)
}

/** REQ-05 收藏切换：已收藏→取消；未收藏→置顶加入（上限 10，超出提示不新增） */
function toggleFavorite(actionId: string): void {
    if (actionId.length === 0) {
        return
    }
    const result = toggleFavoritePluginToolId(favoriteIds.value, actionId)
    if (result.rejected) {
        showFavoriteLimitNotice()
        return
    }
    favoriteIds.value = [...result.ids]
    if (
        !writePluginToolIds(
            pluginToolsStorage,
            PLUGIN_TOOLS_FAVORITES_STORAGE_KEY,
            favoriteIds.value
        )
    ) {
        warnStorageFailureOnce('[插件工具] 收藏写入 localStorage 失败（本次会话内存内生效）')
    }
}

/** 保证面板可见（最小化时先还原；未显示时切到插件工作区） */
function ensurePluginPanelVisible(): void {
    if (toolWindowState.value === 'minimized') {
        toolWindowState.value = 'normal'
    }
    if (!isShowPluginToolsContainer) {
        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        isShowPluginToolsContainer = true
    }
}

/**
 * 打开工具（菜单事件 / 搜索点击 / 键盘 Enter / 默认视图点击共用）：
 * 清空搜索 → 退出默认视图与插件搜索入口视图 → 保证面板可见 → 设置激活工具 → 记录最近使用。
 */
function openTool(actionId: string): void {
    if (actionId.length === 0) {
        return
    }
    clearSearch()
    homeViewOpen.value = false
    searchEntryOpen.value = false
    ensurePluginPanelVisible()
    activeToolId.value = actionId
    rememberRecentTool(actionId)
}

function handleClosePluginTools() {
    if (isShowPluginToolsContainer) {
        isShowPluginToolsContainer = false
    }
    // 返回编辑器即恢复默认面板布局与视图，下次打开始终是 normal
    toolWindowState.value = 'normal'
    activeToolId.value = ''
    homeViewOpen.value = false
    searchEntryOpen.value = false
    clearSearch()
    EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
}

/**
 * 1.5.6「插件 → 插件搜索」入口（EventBus.PLUGIN_SEARCH_SHOW，来自 menu-actions.ts）：
 * 1) 打开插件工具面板（最小化先还原；工作区切到 plugins）；
 * 2) 进入搜索入口视图：内容区大搜索框自动聚焦，空白查询展示最近使用（≤20）→ 全部工具；
 * 3) 不清空 activeToolId —— 工具实例保留（仅被 v-show 隐藏），退出入口视图即可恢复，
 *    避免用户正在编辑的工具内容因「搜一下」而丢失。
 */
function handlePluginSearchShow(): void {
    ensurePluginPanelVisible()
    homeViewOpen.value = false
    searchEntryOpen.value = true
    clearSearch()
    void focusActiveSearchInput()
}

// 最小化态搜索不可用：折叠时清空搜索并收起结果（搜索框随 v-if 卸载，含 Tab 次序）
watch(isMinimized, (minimized) => {
    // REQ-12：把折叠状态交给父组件（WorkSpace 收起插件区域空白、让编辑器可见）
    emit('window-state-change', minimized)
    if (minimized) {
        clearSearch()
    }
})

// 查询变化即回到首个结果，避免旧高亮序号越界
watch(searchText, () => {
    activeSearchIndex.value = 0
})

onMounted(() => {
    // 监听插件工具显示事件（来自 menu-actions.ts）
    onEventBus(EVENT_BUS.PLUGIN_TOOL_SHOW, handlePluginToolShow)
    // 监听「插件 → 插件搜索」入口事件（打开面板 + 进入搜索入口视图）
    onEventBus(EVENT_BUS.PLUGIN_SEARCH_SHOW, handlePluginSearchShow)
    // 监听主题更新事件
    onEventBus(EVENT_BUS.THEME_UPDATED, applyThemeStyles)
})

onBeforeUnmount(() => {
    if (favoriteLimitNoticeTimer !== null) {
        clearTimeout(favoriteLimitNoticeTimer)
        favoriteLimitNoticeTimer = null
    }
})

// 组件卸载时 EventBus 监听由 useEventBus 自动清理（无需手写 $off）

// 处理插件工具显示事件
function handlePluginToolShow(action: string) {
    // 从菜单重新选择工具时：退出折叠态 + 清空搜索/退出列表视图 + 记录最近使用（openTool 统一处理）
    openTool(action)
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
   颜色/边框全部消费 --ui-* 令牌（四风格 × 三密度自动生效），不写死主题色。
   1.5.6 批次 B：中部追加 [工具列表][搜索框][当前工具收藏]（按钮类名独立，保持既有窗口控制契约）。 */
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
    padding: 0 8px;
    box-sizing: border-box;
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    background: var(--ui-bg-sunken, var(--theme-background-color));
    color: var(--ui-text, var(--theme-text-color));
}

.plugin-tools-bar-main {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
}

.plugin-tools-bar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ui-text, var(--theme-text-color));
    white-space: nowrap;
}

/* 工具列表 / 收藏星标：与窗口控制按钮同尺寸（28×28），hover/focus 走统一令牌 */
.plugin-tools-home-btn,
.plugin-tools-favorite-btn,
.plugin-tools-search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
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

.plugin-tools-home-btn:hover,
.plugin-tools-favorite-btn:hover,
.plugin-tools-search-clear:hover {
    background: var(--ui-accent-soft, var(--theme-hover-background));
    color: var(--ui-text, var(--theme-text-color));
}

.plugin-tools-home-btn:focus-visible,
.plugin-tools-favorite-btn:focus-visible,
.plugin-tools-search-clear:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tools-home-btn--active,
.plugin-tools-favorite-btn--active {
    color: var(--ui-accent, var(--accent-color));
}

.plugin-tools-bar-icon {
    display: block;
    width: 16px;
    height: 16px;
}

/* ==================== 搜索框（REQ-04） ==================== */
.plugin-tools-search {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 180px;
    min-width: 96px;
    height: 28px;
    padding: 0 8px;
    box-sizing: border-box;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg, var(--theme-background-color));
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    transition:
        border-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tools-search:focus-within {
    border-color: var(--ui-accent, var(--accent-color));
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tools-search-icon {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
}

.plugin-tools-search-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--ui-text, var(--theme-text-color));
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
}

.plugin-tools-search-input::placeholder {
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
}

/* 部分平台 type=search 自带清除按钮，与自绘清除按钮重复，隐藏原生实现 */
.plugin-tools-search-input::-webkit-search-cancel-button {
    display: none;
}

.plugin-tools-search-clear {
    width: 20px;
    height: 20px;
}

/* 收藏上限提示（仅短暂显示，避免挤占搜索框；超长省略） */
.plugin-tool-favorite-notice {
    flex: 0 1 auto;
    max-width: 200px;
    overflow: hidden;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    font-size: var(--ui-font-size, 13px);
    white-space: nowrap;
    text-overflow: ellipsis;
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

/* 占位符样式（无激活工具时的可发现性视图容器；默认视图由 .plugin-tool-home 覆盖为列表布局） */
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

/* ==================== 可发现性视图（REQ-04 搜索结果 / REQ-05 默认视图） ==================== */
.plugin-tool-discovery-panel {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow-y: auto;
}

/* 默认视图：收藏 → 最近使用 → 全部工具（列表面板，不再居中显示旧占位文案） */
.plugin-tool-placeholder.plugin-tool-home {
    display: block;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    color: var(--theme-text-color);
}

.plugin-tool-discovery {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 16px;
    box-sizing: border-box;
}

.plugin-tools-container--maximized .plugin-tool-discovery {
    max-width: 1040px;
}

.plugin-tool-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.plugin-tool-section-title {
    margin: 0;
    padding: 0 8px;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
}

.plugin-tool-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
}

/* ==================== 8 分类分组（REQ-06：可折叠，状态持久） ==================== */
/* 分组 = 标题行（分类图标 + 分类名 + 折叠箭头）+ 工具行列表；颜色/圆角/焦点环全部消费 --ui-* 令牌 */
.plugin-tool-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.plugin-tool-group-title {
    margin: 0;
    padding: 0;
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
}

.plugin-tool-group-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tool-group-toggle:hover {
    background: var(--ui-accent-soft, var(--theme-hover-background));
    color: var(--ui-text, var(--theme-text-color));
}

.plugin-tool-group-toggle:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tool-group-icon {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
}

.plugin-tool-group-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

/* 折叠箭头：展开时朝下，折叠时旋转 -90° 朝右（仅图标动画，行本身 v-show 隐藏） */
.plugin-tool-group-chevron {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    transition: transform var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tool-group--collapsed .plugin-tool-group-chevron {
    transform: rotate(-90deg);
}

/* 分组内工具列表：与平铺列表同一套行样式（嵌套 ul 重置默认缩进/标记） */
.plugin-tool-group-list {
    padding-left: 0;
}

.plugin-tool-item {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    border-radius: var(--ui-radius-md, 4px);
    transition: background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tool-item:hover,
.plugin-tool-item--active {
    background: var(--ui-accent-soft, var(--theme-hover-background));
}

.plugin-tool-item-main {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text, var(--theme-text-color));
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    text-align: left;
    cursor: pointer;
}

.plugin-tool-item-main:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tool-item-icon {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
}

.plugin-tool-item-name {
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--ui-text, var(--theme-text-color));
    white-space: nowrap;
    text-overflow: ellipsis;
}

.plugin-tool-item-category {
    flex: 1 1 auto;
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
    font-size: var(--ui-font-size, 13px);
    white-space: nowrap;
    text-align: right;
    text-overflow: ellipsis;
}

.plugin-tool-item-favorite {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
    cursor: pointer;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tool-item-favorite:hover {
    background: var(--ui-accent-soft, var(--theme-hover-background));
    color: var(--ui-accent, var(--accent-color));
}

.plugin-tool-item-favorite:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tool-item-favorite--active {
    color: var(--ui-accent, var(--accent-color));
}

.plugin-tool-item-favorite-icon {
    display: block;
    width: 16px;
    height: 16px;
}

/* 搜索无结果空态 */
.plugin-tool-search-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 160px;
    padding: 24px;
    box-sizing: border-box;
    text-align: center;
}

.plugin-tool-search-empty-title {
    margin: 0;
    color: var(--ui-text, var(--theme-text-color));
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
}

.plugin-tool-search-empty-hint {
    margin: 0;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
    font-size: var(--ui-font-size, 13px);
}

/* ==================== 插件搜索入口视图（1.5.6：菜单「插件 → 插件搜索」） ==================== */
/* 内容区大搜索框：进入即聚焦、占据主要视觉空间；与工具条搜索框共用 searchText 状态。
   宽度/居中口径与 .plugin-tool-discovery 列表保持一致（正常 760 / 最大化 1040）。 */
.plugin-tool-search-entry {
    flex: 0 0 auto;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 16px 8px;
    box-sizing: border-box;
}

.plugin-tools-container--maximized .plugin-tool-search-entry {
    max-width: 1040px;
}

.plugin-tool-search-entry-title {
    margin: 0 0 12px;
    color: var(--ui-text, var(--theme-text-color));
    font-size: 18px;
    font-weight: 600;
}

.plugin-tool-search-entry-box {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 44px;
    padding: 0 12px;
    box-sizing: border-box;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg, var(--theme-background-color));
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    transition:
        border-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tool-search-entry-box:focus-within {
    border-color: var(--ui-accent, var(--accent-color));
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tool-search-entry-icon {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
}

.plugin-tools-entry-search-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--ui-text, var(--theme-text-color));
    font-family: inherit;
    font-size: 15px;
}

.plugin-tools-entry-search-input::placeholder {
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
}

/* 与工具条搜索框一致：隐藏平台自带清除按钮，使用自绘清除按钮 */
.plugin-tools-entry-search-input::-webkit-search-cancel-button {
    display: none;
}

.plugin-tool-search-entry-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
    cursor: pointer;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.plugin-tool-search-entry-clear:hover {
    background: var(--ui-accent-soft, var(--theme-hover-background));
    color: var(--ui-text, var(--theme-text-color));
}

.plugin-tool-search-entry-clear:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.plugin-tool-search-entry-clear-icon {
    display: block;
    width: 16px;
    height: 16px;
}

.plugin-tool-search-entry-hint {
    margin: 8px 2px 0;
    color: var(--ui-text-tertiary, var(--theme-secondary-text-color));
    font-size: var(--ui-font-size, 13px);
}

/* 入口视图无最近记录空态：只提示不遮挡，下方「全部工具」仍可直接选择 */
.plugin-tool-search-entry-empty {
    margin: 0;
    padding: 12px;
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg-sunken, var(--theme-hover-background));
    color: var(--ui-text-secondary, var(--theme-secondary-text-color));
    font-size: var(--ui-font-size, 13px);
}

.tool-section h1 {
    text-align: center;
}
</style>
