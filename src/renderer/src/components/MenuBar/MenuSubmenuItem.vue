<template>
    <div
        class="menu-submenu-item"
        :class="{ disabled, 'has-submenu': hasChildren, active }"
        role="menuitem"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-haspopup="hasChildren ? 'true' : undefined"
        :aria-expanded="hasChildren ? (active ? 'true' : 'false') : undefined"
        tabindex="-1"
        :data-item-index="index"
        @click.stop="handleClick"
        @mouseenter="handleMouseEnter"
        @focus="handleFocus"
    >
        <!--
            单个菜单行（视觉升级 P1-B2 / T7）。

            为什么独立成组件：子菜单渲染需要「有子菜单的项包一层 .submenu-item-wrapper、
            叶子项直接作为 .submenu-list 的直接子元素」——既有渲染结构被 4 个菜单集成测试
            （menubar-interaction-coverage / menubar-plugins / menubar-recent / shell-i18n）依赖，
            不能为了减少重复代码而改变 DOM 层级。抽出本组件后，父组件只在组项外包一层 wrapper，
            行内结构只维护一份。

            a11y：role=menuitem + aria-disabled + aria-haspopup/aria-expanded；
            tabindex 固定 -1（焦点由父级子菜单统一管理：方向键移动、打开时移入首项），
            因此 Tab 不会把焦点丢进 teleport 出去的浮动层。
        -->
        <span class="menu-item-label">{{ labelText }}</span>
        <span v-if="item.accelerator" class="menu-item-accelerator">{{ item.accelerator }}</span>
        <span v-if="hasChildren" class="menu-item-arrow" aria-hidden="true">▶</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../common/i18n'
import type { BaiZeMenuEntry } from './menu-config'
import { hasMenuSubmenu, isMenuDisabled } from './menu-keyboard'

interface Props {
    /** 菜单项数据（含 labelKey / accelerator / submenu / enabled） */
    item: BaiZeMenuEntry
    /** 在当前层级中的索引（父级用它做焦点索引与 data-item-index 定位） */
    index: number
    /** 当前项的子菜单是否展开（仅可展开组有值） */
    active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    active: false
})

const emit = defineEmits<{
    /** 点击激活（叶子项执行动作 / 组项展开子菜单，由父级按类型分发） */
    (e: 'activate', index: number): void
    /** 鼠标进入（父级按既有悬停语义展开/收起嵌套子菜单） */
    (e: 'hover', index: number): void
    /** 获得焦点（父级记录当前键盘焦点项） */
    (e: 'focus', index: number): void
}>()

const labelText = computed(() =>
    props.item.labelKey ? t(props.item.labelKey) : (props.item.label ?? '')
)

/** 有非空子菜单才渲染箭头与展开语义（空数组按叶子处理，与既有菜单渲染一致） */
const hasChildren = computed(() => hasMenuSubmenu(props.item))

/** 禁用项：鼠标可触发 mouseenter/focus，但点击不产生动作 */
const disabled = computed(() => isMenuDisabled(props.item))

function handleClick(): void {
    if (disabled.value) {
        return
    }
    emit('activate', props.index)
}

function handleMouseEnter(): void {
    emit('hover', props.index)
}

function handleFocus(): void {
    emit('focus', props.index)
}
</script>

<style scoped>
.menu-submenu-item {
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
    height: var(--ui-row-height, 28px);
    padding: 0 var(--ui-pad, 12px);
    margin: 0;
    border-radius: var(--ui-radius-sm, 2px);
    color: var(--ui-text, var(--text-color));
    font-size: var(--ui-font-size, 13px);
    line-height: 1;
    white-space: nowrap;
    cursor: default;
    user-select: none;
    /* 状态反馈节奏统一走动效令牌（视觉升级方案 §3.4） */
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

/* 悬停 / 键盘焦点 / 展开组统一使用强调色软底 + 强调色文字（COMPONENTS.md §2） */
.menu-submenu-item:hover:not(.disabled),
.menu-submenu-item.active {
    background-color: var(--ui-accent-soft);
    color: var(--ui-accent);
}

.menu-submenu-item:focus-visible {
    outline: none;
    background-color: var(--ui-accent-soft);
    color: var(--ui-accent);
    box-shadow: var(--ui-focus-shadow);
}

.menu-submenu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.menu-item-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: inherit;
}

/* 快捷键：右对齐、字号 11、三级文字色（COMPONENTS.md §2） */
.menu-item-accelerator {
    flex-shrink: 0;
    margin-left: 32px;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--ui-text-tertiary, var(--secondary-text-color));
}

.menu-item-arrow {
    flex-shrink: 0;
    margin-left: 12px;
    font-size: 8px;
    color: var(--ui-text-tertiary, var(--secondary-text-color));
    transition: transform var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.menu-submenu-item:hover .menu-item-arrow {
    transform: translateX(2px);
}
</style>
