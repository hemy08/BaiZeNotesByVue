<template>
    <div
        ref="rootRef"
        class="submenu-list"
        role="menu"
        :aria-label="ariaLabel"
        :data-menu-level="level"
        @keydown="handleKeydown"
    >
        <!--
            子菜单面板（视觉升级 P1-B2 / T7，递归组件）。

            结构（被既有测试依赖，不得改动层级）：
            .submenu-container > .submenu-list（role=menu）
              ├─ .menu-submenu-item（叶子项，直接子元素）
              └─ .submenu-item-wrapper > .menu-submenu-item（可展开组）+ .nested-submenu > .submenu-list

            a11y / 键盘契约（COMPONENTS.md §2）：
            - role=menu + aria-label 由上层传入（顶层菜单 = 顶层菜单名，嵌套层 = 父组名）；
            - 方向键在「本层」移动，Home/End 跳首尾，跳过 role=separator 与 aria-disabled 项；
            - Enter/Space 激活叶子动作或展开组；ArrowRight 展开组并进入子层；ArrowLeft 返回父层；
            - Escape 关闭整个菜单栏下拉；Tab 关闭下拉并把焦点交回顶层菜单按钮（不把焦点丢进
              teleport 出去的浮动层）；
            - 焦点可见统一走 --ui-focus-shadow（视觉升级方案 §3.3）。
        -->
        <template v-for="(item, index) in items" :key="index">
            <!-- 分隔符：1px hairline + 上下 6px 间距（COMPONENTS.md §2） -->
            <div
                v-if="isMenuSeparator(item)"
                class="menu-separator"
                role="separator"
                aria-orientation="horizontal"
            ></div>

            <!--
                可展开组：仅在「已展开」时包 wrapper（与升级前 1.5.3 的 DOM 层级一致，
                既有测试按 `.submenu-list > .menu-submenu-item` 取一级标签，不能改动默认层级）；
                未展开时与叶子项一样直接作为 .submenu-list 的子元素。
            -->
            <div
                v-else-if="hasMenuSubmenu(item) && openSubmenuIndex === index"
                class="submenu-item-wrapper"
            >
                <MenuSubmenuItem
                    :item="item"
                    :index="index"
                    :active="true"
                    :data-menu-level="level"
                    @activate="handleItemActivate(index)"
                    @hover="handleItemHover(index)"
                    @focus="handleItemFocus(index)"
                />
                <div class="nested-submenu" :class="{ 'nested-submenu--flipped': nestedFlipped }">
                    <MenuSubmenu
                        :items="item.submenu || []"
                        :level="level + 1"
                        :aria-label="submenuAriaLabel(item)"
                        @activate="emit('activate')"
                        @close="emit('close')"
                        @tab="(shiftKey: boolean) => emit('tab', shiftKey)"
                        @back="handleNestedBack"
                    />
                </div>
            </div>

            <!-- 叶子项 / 未展开组：直接作为 .submenu-list 的子元素 -->
            <MenuSubmenuItem
                v-else
                :item="item"
                :index="index"
                :active="false"
                :data-menu-level="level"
                @activate="handleItemActivate(index)"
                @hover="handleItemHover(index)"
                @focus="handleItemFocus(index)"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../../common/i18n'
import { HandleMenuAction } from './menu-actions'
import { resolveNestedSubmenuSide } from './menu-position'
import type { BaiZeMenuEntry } from './menu-config'
import {
    findFirstNavigableIndex,
    findLastNavigableIndex,
    findNavigableIndex,
    hasMenuSubmenu,
    isMenuDisabled,
    isMenuSeparator,
    resolveSubmenuKeyAction
} from './menu-keyboard'
import MenuSubmenuItem from './MenuSubmenuItem.vue'

interface Props {
    /** 当前层菜单项（真实数据由 menu-config 提供，本组件只渲染） */
    items: BaiZeMenuEntry[]
    /** 当前层级：0 = 顶层菜单下拉，1+ = 嵌套子菜单 */
    level?: number
    /** 本层 role=menu 的可访问名称（顶层传顶层菜单名，嵌套传父组名） */
    ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
    level: 0,
    ariaLabel: ''
})

const emit = defineEmits<{
    /** 叶子项动作已执行（由 root MenuBar 统一关闭菜单并归还焦点） */
    (e: 'activate'): void
    /** Esc / 顶层左方向键要求关闭整个下拉 */
    (e: 'close'): void
    /** Tab 关闭下拉并交回焦点（shiftKey 供上层决定焦点落点） */
    (e: 'tab', shiftKey: boolean): void
    /** 嵌套层要求返回父层（ArrowLeft） */
    (e: 'back'): void
    /** 顶层下拉的横向切换（ArrowLeft/ArrowRight，值 = -1 / 1） */
    (e: 'switch-menu', direction: -1 | 1): void
}>()

/** 子菜单面板根节点（键盘焦点落点统一走 data 属性查询，不持有子组件实例） */
const rootRef = ref<HTMLElement | null>(null)
/** 当前展开的嵌套子菜单所属项索引（null = 未展开） */
const openSubmenuIndex = ref<number | null>(null)
/** 当前展开的嵌套子菜单是否翻转至父项左侧（右侧空间不足） */
const nestedFlipped = ref(false)
/** 最近一次键盘焦点项索引（无焦点时的兜底起点） */
const lastFocusedIndex = ref(-1)
/** 视口变化重算的节流句柄（合并高频 scroll/resize；非响应式，无需触发渲染） */
let placementTimer: ReturnType<typeof setTimeout> | null = null

/** 当前层第 index 项的菜单数据 */
function itemAt(index: number): BaiZeMenuEntry | undefined {
    return props.items[index]
}

/** 嵌套层 aria-label：优先父组名，缺省沿用本层名称 */
function submenuAriaLabel(item: BaiZeMenuEntry): string {
    return item.labelKey ? t(item.labelKey) : (item.label ?? props.ariaLabel)
}

/** 定位本层某一行 DOM（data-menu-level 过滤嵌套层同索引行） */
function getItemElement(index: number): HTMLElement | null {
    if (index < 0) {
        return null
    }
    return (
        rootRef.value?.querySelector<HTMLElement>(
            `[data-menu-level="${props.level}"][data-item-index="${index}"]`
        ) ?? null
    )
}

/** 聚焦本层指定索引项（无效索引安全跳过） */
function focusItem(index: number): void {
    if (index < 0) {
        return
    }
    lastFocusedIndex.value = index
    getItemElement(index)?.focus()
}

/** 关闭当前展开的嵌套子菜单（不改变焦点） */
function closeNestedSubmenu(): void {
    openSubmenuIndex.value = null
    nestedFlipped.value = false
    if (placementTimer !== null) {
        clearTimeout(placementTimer)
        placementTimer = null
    }
}

/**
 * 测量当前展开的嵌套子菜单并更新「右侧展开 / 翻转左侧」。
 *
 * 为什么在打开后 nextTick 再量：嵌套面板由 v-if 渲染，宽度取决于内容
 * （`.submenu-list` min-width 220 / max-width 400），必须等 DOM 更新后取实测矩形；
 * 右侧空间不足时给 `.nested-submenu` 加翻转 class（`right: 100%`），避免被窗口右缘裁剪。
 * jsdom 不排版（矩形恒为 0）时由纯函数用最窄宽度兜底，不产生副作用。
 */
function updateNestedPlacement(): void {
    if (openSubmenuIndex.value === null) {
        nestedFlipped.value = false
        return
    }
    const wrapper = rootRef.value?.querySelector<HTMLElement>(':scope > .submenu-item-wrapper')
    const nested = wrapper?.querySelector<HTMLElement>(':scope > .nested-submenu > .submenu-list')
    if (!wrapper || !nested) {
        nestedFlipped.value = false
        return
    }
    const triggerRect = wrapper.getBoundingClientRect()
    const nestedRect = nested.getBoundingClientRect()
    nestedFlipped.value =
        resolveNestedSubmenuSide({
            triggerLeft: triggerRect.left,
            triggerRight: triggerRect.right,
            submenuWidth: nestedRect.width,
            viewportWidth: window.innerWidth
        }) === 'left'
}

/** 视口变化（resize / 任意滚动容器滚动）时重算嵌套层展开方向（已展开时） */
function handleViewportChange(): void {
    scheduleNestedPlacement()
}

/**
 * 合并高频 resize/scroll 事件后重算（32ms 节流 ≈ 两帧）。
 *
 * 为什么节流：scroll 监听挂在 document 捕获阶段，编辑器/工作区滚动会高频触发；
 * 每次重算都要 `getBoundingClientRect()` 强制同步布局，逐事件重算会在菜单打开时
 * 拖慢滚动（PERF 口径）。节流后最多每 ~2 帧测一次，且仅在嵌套层展开时才真正执行。
 */
function scheduleNestedPlacement(): void {
    if (openSubmenuIndex.value === null || placementTimer !== null) {
        return
    }
    placementTimer = setTimeout(() => {
        placementTimer = null
        updateNestedPlacement()
    }, 32)
}

/** 把焦点移入当前嵌套层第一个可导航项（跳过禁用项） */
function focusFirstNestedItem(): void {
    const nestedRoot = rootRef.value?.querySelector<HTMLElement>('.nested-submenu > .submenu-list')
    if (!nestedRoot) {
        return
    }
    const rows = Array.from(
        nestedRoot.querySelectorAll<HTMLElement>(
            ':scope > .menu-submenu-item, :scope > .submenu-item-wrapper > .menu-submenu-item'
        )
    )
    rows.find((row) => !row.classList.contains('disabled'))?.focus()
}

/** 展开指定项的嵌套子菜单；keyboard=true 时把焦点移入子层第一项 */
function openNestedSubmenu(index: number, keyboard: boolean): void {
    const item = itemAt(index)
    if (!item || !hasMenuSubmenu(item)) {
        return
    }
    openSubmenuIndex.value = index
    nestedFlipped.value = false
    void nextTick(() => {
        updateNestedPlacement()
        if (keyboard) {
            focusFirstNestedItem()
        }
    })
}

/** 嵌套层返回父层：关闭嵌套并把焦点归还触发项 */
function handleNestedBack(): void {
    const parentIndex = openSubmenuIndex.value
    closeNestedSubmenu()
    if (parentIndex !== null) {
        // 关闭嵌套会重渲染本层行（wrapper 结构切换），等 DOM 更新后再聚焦
        void nextTick(() => focusItem(parentIndex))
    }
}

/** 鼠标悬浮：组项展开嵌套、叶子项收起嵌套（保持 1.5.3 之前的悬停语义） */
function handleItemHover(index: number): void {
    const item = itemAt(index)
    if (item && hasMenuSubmenu(item)) {
        openNestedSubmenu(index, false)
        return
    }
    closeNestedSubmenu()
}

/** 键盘/鼠标焦点进入本层项时记录索引（不切换展开状态，避免与点击语义冲突） */
function handleItemFocus(index: number): void {
    lastFocusedIndex.value = index
}

/** 点击激活：组项展开嵌套；叶子项执行既有菜单动作并通知上层关闭 */
function handleItemActivate(index: number): void {
    const item = itemAt(index)
    if (!item || isMenuDisabled(item)) {
        return
    }
    if (hasMenuSubmenu(item)) {
        openNestedSubmenu(index, false)
        return
    }
    if (item.menuAction) {
        HandleMenuAction(item.menuAction)
    }
    emit('activate')
}

/**
 * 键盘激活当前焦点项（Enter/Space）：
 * 组项 → 展开并进入子层；叶子项 → 执行动作并关闭（复用 HandleMenuAction 单链路）。
 */
function activateFocusedItem(index: number): void {
    const item = itemAt(index)
    if (!item || isMenuDisabled(item)) {
        return
    }
    if (hasMenuSubmenu(item)) {
        openNestedSubmenu(index, true)
        return
    }
    if (item.menuAction) {
        HandleMenuAction(item.menuAction)
    }
    emit('activate')
}

/** 本层键盘事件（嵌套层处理器会 stopPropagation，不会重复处理） */
function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    const row = target?.closest<HTMLElement>('[data-item-index]') ?? null
    // 兜底：事件来自更深层（例如未 stopPropagation 的按键）时不处理，交给该层自己
    if (row && row.dataset.menuLevel !== String(props.level)) {
        return
    }
    const focusedIndex = row ? Number(row.dataset.itemIndex) : lastFocusedIndex.value
    const action = resolveSubmenuKeyAction(
        event.key,
        props.level,
        focusedIndex >= 0 ? itemAt(focusedIndex) : undefined
    )
    if (!action) {
        return
    }
    event.preventDefault()
    event.stopPropagation()

    switch (action) {
        case 'previous':
        case 'next': {
            closeNestedSubmenu()
            const index = findNavigableIndex(
                props.items,
                focusedIndex,
                action === 'next' ? 'next' : 'previous'
            )
            focusItem(index)
            return
        }
        case 'first':
            closeNestedSubmenu()
            focusItem(findFirstNavigableIndex(props.items))
            return
        case 'last':
            closeNestedSubmenu()
            focusItem(findLastNavigableIndex(props.items))
            return
        case 'activate':
            activateFocusedItem(focusedIndex)
            return
        case 'open-submenu':
            openNestedSubmenu(focusedIndex, true)
            return
        case 'back':
            emit('back')
            return
        case 'switch-previous':
            emit('switch-menu', -1)
            return
        case 'switch-next':
            emit('switch-menu', 1)
            return
        case 'close':
            emit('close')
            return
        case 'tab':
            // Tab 关闭下拉并把焦点交回顶层按钮，避免焦点落在即将卸载的 teleport 节点上
            emit('tab', event.shiftKey)
            return
        default:
            return
    }
}

// 视口变化重算嵌套层展开方向（窗口 resize / 任意滚动容器滚动）。
// 捕获阶段监听 scroll：下拉面板本身不再滚动（已移除 overflow-y: auto），但内部
// 可滚动区域（如长快捷键列表未来扩展）滚动时同样需要重算，避免翻转判断过期。
onMounted(() => {
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleViewportChange)
    document.removeEventListener('scroll', handleViewportChange, true)
    if (placementTimer !== null) {
        clearTimeout(placementTimer)
        placementTimer = null
    }
})
</script>

<style scoped>
.submenu-list {
    position: relative;
    min-width: 220px;
    max-width: 400px;
    /*
     * 1.5.5 用户反馈修复（菜单滚动条 / 三级子菜单「没展示」）：
     * 本面板**不再作为滚动容器**——原 max-height + overflow-y: auto 有双重副作用：
     * ① 菜单内容稍长就出现滚动条；② overflow 会裁剪绝对定位的嵌套（三级）子菜单，
     * 用户看到的是「嵌套子菜单不显示」。
     * 超长菜单改由 MenuBar 的视口 clamp 定位解决（`menu-position.ts`：
     * 顶级下拉按实测宽高夹取到视口内），而不是滚动容器；嵌套层由翻转逻辑保证可见。
     */
    overflow: visible;
    margin: 0;
    /* 内边距 6（COMPONENTS.md §2；下拉面板专用值，不属于 4px 阶梯的内边距档） */
    padding: 6px;
    /* 材质令牌：paper/workbench/hybrid 不透明，glass 半透明 + 小面积模糊（禁止整窗 blur）。
       先给不支持 color-mix 的环境一个不透明兜底，再用变量驱动透明度。 */
    background: var(--ui-surface, var(--card-bg));
    background: color-mix(
        in srgb,
        var(--ui-surface, var(--card-bg)) calc(var(--ui-surface-opacity, 1) * 100%),
        transparent
    );
    backdrop-filter: blur(var(--ui-surface-blur, 0px));
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-lg, 6px);
    /* glass 高光边（alpha 为 0 时不可见）+ 二级阴影 */
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0)),
        var(--ui-shadow-2);
    z-index: var(--ui-z-dropdown, 40);
}

/* 分隔符：1px hairline + 上下 6px 间距（COMPONENTS.md §2） */
.menu-separator {
    height: var(--ui-hairline-width, 1px);
    margin: 6px 8px;
    background-color: var(--ui-border, var(--border-color));
}

.submenu-item-wrapper {
    position: relative;
}

.nested-submenu {
    position: absolute;
    top: -6px;
    left: 100%;
    margin-left: -4px;
    animation: menu-slide-in var(--ui-duration-pop, 180ms) var(--ui-ease-standard, ease);
}

/*
 * 右侧空间不足时翻转至父项左侧（1.5.5 用户反馈：靠右菜单展开三级子菜单时被窗口右缘裁剪）。
 * class 由 MenuSubmenu 按实测矩形（menu-position.ts 纯函数）写入，组件内不做风格分支判断。
 */
.nested-submenu--flipped {
    left: auto;
    right: 100%;
    margin-left: 0;
    margin-right: -4px;
    animation-name: menu-slide-in-flipped;
}

@keyframes menu-slide-in {
    from {
        opacity: 0;
        transform: translateX(-4px);
    }

    to {
        opacity: 1;
        transform: translateX(0);
    }
}

/* 翻转层的入场位移方向与展开方向一致（从右向左滑入） */
@keyframes menu-slide-in-flipped {
    from {
        opacity: 0;
        transform: translateX(4px);
    }

    to {
        opacity: 1;
        transform: translateX(0);
    }
}

/* 系统「减少动效」：仅保留极短淡入（方案 §3.4） */
@media (prefers-reduced-motion: reduce) {
    .nested-submenu {
        animation-duration: 100ms;
    }
}
</style>
