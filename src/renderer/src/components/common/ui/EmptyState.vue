<template>
    <div
        class="empty-state"
        :class="[`empty-state--${size}`, `empty-state--${variant}`]"
        :role="announce ? 'status' : undefined"
    >
        <!--
            统一空态组件（视觉升级 P1-B2 / T11，COMPONENTS.md §7.2）。

            结构：统一 SVG 插图（24 网格 / stroke 1.5 / currentColor）+ 主标题 15/600 +
            描述 13 + 主按钮（--ui-accent 实色）；不使用大段占位文字。
            文案由调用方经 i18n 传入（组件不内置任何文案，避免与各业务空态文案分叉）。

            a11y：默认 role=status（空结果/未启用信息对读屏可感知）；插图 aria-hidden；
            主按钮为原生 button，键盘可聚焦，焦点样式走 --ui-focus-shadow。
        -->
        <div class="empty-state__illustration" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path
                    v-for="(pathData, index) in illustrationPaths"
                    :key="index"
                    :d="pathData"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </div>
        <p class="empty-state__title">{{ title }}</p>
        <p v-if="description" class="empty-state__description">{{ description }}</p>
        <div v-if="actionLabel || $slots.actions" class="empty-state__actions">
            <button
                v-if="actionLabel"
                type="button"
                class="empty-state__action"
                @click="emit('action')"
            >
                {{ actionLabel }}
            </button>
            <slot name="actions"></slot>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
    EMPTY_STATE_ILLUSTRATIONS,
    isKnownEmptyStateVariant,
    type EmptyStateVariant
} from './empty-state-variants'

/** 空态尺寸：default = 常规内容区；compact = 命令面板等受限高度容器 */
type EmptyStateSize = 'default' | 'compact'

interface Props {
    /** 变体（决定插图语义场景，文案由调用方传入） */
    variant?: EmptyStateVariant
    /** 主标题（必填；字号 15 / 字重 600） */
    title: string
    /** 描述（可选；字号 13 / 颜色 --ui-text-secondary） */
    description?: string
    /** 主按钮文案（可选；不传则不渲染按钮） */
    actionLabel?: string
    /** 尺寸档位 */
    size?: EmptyStateSize
    /** 是否作为读屏状态区域播报（默认 true） */
    announce?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    variant: 'empty-file',
    description: '',
    actionLabel: '',
    size: 'default',
    announce: true
})

const emit = defineEmits<{
    /** 主按钮点击 */
    (e: 'action'): void
}>()

/** 插图路径：运行期收到未知变体时回落「空文件」，保证永远有可用插图 */
const illustrationPaths = computed<readonly string[]>(() => {
    const variant = isKnownEmptyStateVariant(props.variant) ? props.variant : 'empty-file'
    return EMPTY_STATE_ILLUSTRATIONS[variant]
})
</script>

<style scoped>
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 16px;
    text-align: center;
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.empty-state--compact {
    gap: 4px;
    padding: 12px 8px;
}

.empty-state__illustration {
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    margin-bottom: 4px;
    color: var(--ui-text-tertiary, var(--secondary-text-color));
}

.empty-state--compact .empty-state__illustration {
    width: 40px;
    height: 40px;
    margin-bottom: 0;
}

.empty-state__illustration svg {
    width: 100%;
    height: 100%;
}

/* 主标题 15 / 600（COMPONENTS.md §7.2） */
.empty-state__title {
    margin: 0;
    color: var(--ui-text, var(--text-color));
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
}

/* 描述 13 / --ui-text-secondary */
.empty-state__description {
    max-width: 360px;
    margin: 0;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    font-size: 13px;
    line-height: 1.5;
}

.empty-state--compact .empty-state__title {
    font-size: 13px;
}

.empty-state--compact .empty-state__description {
    font-size: 12px;
}

.empty-state__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
}

/* 主按钮：--ui-accent 实色 + 主题按钮文字色（白字属既有主题按钮配色，注释豁免） */
.empty-state__action {
    height: var(--ui-control-height, 32px);
    padding: 0 16px;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-accent, var(--accent-color));
    color: var(--button-text-color, #fff);
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    cursor: pointer;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.empty-state__action:hover {
    background: var(--ui-accent-hover, var(--accent-color));
}

.empty-state__action:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}
</style>
