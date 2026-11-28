<template>
    <span class="info-tip">
        <button
            ref="triggerRef"
            type="button"
            class="info-tip__trigger"
            :aria-label="resolvedAriaLabel"
            :aria-expanded="visible ? 'true' : 'false'"
            :aria-controls="tipId"
            @mouseenter="handleEnter"
            @mouseleave="handleLeave"
            @focus="handleFocus"
            @blur="handleBlur"
            @click.stop="handleClick"
            @keydown.esc.stop.prevent="hide"
        >
            <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
                focusable="false"
            >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5.5" stroke-linecap="round" />
                <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
            </svg>
        </button>
        <Teleport to="body">
            <Transition name="info-tip-fade">
                <div
                    v-if="visible"
                    :id="tipId"
                    ref="popoverRef"
                    class="info-tip__popover"
                    role="tooltip"
                    :style="popoverStyle"
                    @mouseenter="handleEnter"
                    @mouseleave="handleLeave"
                >
                    <slot>{{ text }}</slot>
                </div>
            </Transition>
        </Teleport>
    </span>
</template>

<script setup lang="ts">
/**
 * 统一「解释性说明」提示组件（1.5.6 UI 简洁化）：
 *
 * - 触发：ⓘ 图标按钮；鼠标悬停（约 120ms 延迟）显示，键盘 Tab 聚焦也显示；
 *   点击可固定/取消（触屏与需要常看场景），Esc / 点击外部关闭。
 * - 定位：Teleport 到 body（避免被对话框 overflow 裁剪），默认优先显示在触发点上方，
 *   空间不足自动翻转到下方；水平 clamp 在视口内（8px 边距）并跟随窗口滚动/缩放重算。
 * - 样式：全部消费 --ui-* 令牌（四风格 × 三密度 × 明暗主题自动适配）；
 *   z-index 使用 --ui-z-tooltip（高于应用层浮层 120）。
 * - 无障碍：按钮带 aria-label / aria-expanded / aria-controls；浮层 role="tooltip"
 *   （hover 与 focus 均可显示，键盘用户可读取；弹出层本身不进入 Tab 次序）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../../common/i18n'

const props = withDefaults(
    defineProps<{
        /** 纯文本说明（也可用默认插槽放富文本） */
        text?: string
        /** 触发按钮无障碍标签；默认取 i18n「说明」 */
        ariaLabel?: string
        /** 优先展示方向：默认 top（空间不足自动翻转） */
        placement?: 'top' | 'bottom'
        /** 浮层最大宽度（px） */
        maxWidth?: number
    }>(),
    { text: '', ariaLabel: '', placement: 'top', maxWidth: 320 }
)

const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLDivElement | null>(null)
const visible = ref(false)
const tipId = `info-tip-${Math.random().toString(36).slice(2, 10)}`
const resolvedAriaLabel = computed(() => props.ariaLabel || t('common.infoTipLabel'))

const position = ref<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'top'
})

const popoverStyle = computed(() => ({
    top: `${Math.round(position.value.top)}px`,
    left: `${Math.round(position.value.left)}px`,
    maxWidth: `${props.maxWidth}px`
}))

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const HOVER_DELAY = 120
const HIDE_DELAY = 160
const GAP = 8
const EDGE = 8

function clearTimers(): void {
    if (showTimer) {
        clearTimeout(showTimer)
        showTimer = null
    }
    if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
    }
}

function updatePosition(): void {
    const trigger = triggerRef.value
    const popover = popoverRef.value
    if (!trigger || !popover) return
    const anchor = trigger.getBoundingClientRect()
    const rect = popover.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const preferred = props.placement
    const fitsAbove = anchor.top - rect.height - GAP >= EDGE
    const fitsBelow = anchor.bottom + rect.height + GAP <= viewportHeight - EDGE
    let placement: 'top' | 'bottom' = preferred
    if (preferred === 'top' && !fitsAbove && fitsBelow) placement = 'bottom'
    if (preferred === 'bottom' && !fitsBelow && fitsAbove) placement = 'top'
    const top = placement === 'top' ? anchor.top - rect.height - GAP : anchor.bottom + GAP
    const centered = anchor.left + anchor.width / 2 - rect.width / 2
    const left = Math.min(
        Math.max(centered, EDGE),
        Math.max(EDGE, viewportWidth - rect.width - EDGE)
    )
    position.value = { top, left, placement }
}

function show(): void {
    clearTimers()
    visible.value = true
    void nextTick(() => {
        updatePosition()
        // 字体/内容渲染后再校正一次（多行文本高度可能变化）
        requestAnimationFrame(() => updatePosition())
    })
}

function hide(): void {
    clearTimers()
    visible.value = false
}

function scheduleShow(): void {
    clearTimers()
    if (visible.value) return
    showTimer = setTimeout(show, HOVER_DELAY)
}

function scheduleHide(): void {
    if (!visible.value) return
    hideTimer = setTimeout(() => {
        visible.value = false
    }, HIDE_DELAY)
}

function handleEnter(): void {
    if (showTimer || hideTimer) clearTimers()
    scheduleShow()
}

function handleLeave(): void {
    scheduleHide()
}

function handleFocus(): void {
    show()
}

function handleBlur(): void {
    hide()
}

function handleClick(): void {
    if (visible.value) {
        hide()
        return
    }
    show()
}

function onDocumentPointerDown(event: PointerEvent): void {
    if (!visible.value) return
    const target = event.target as Node | null
    if (!target) return
    if (triggerRef.value?.contains(target) || popoverRef.value?.contains(target)) return
    hide()
}

function onWindowScroll(): void {
    if (!visible.value) return
    updatePosition()
}

function onWindowResize(): void {
    if (!visible.value) return
    updatePosition()
}

function bindGlobalListeners(): void {
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    window.addEventListener('scroll', onWindowScroll, true)
    window.addEventListener('resize', onWindowResize)
}

function unbindGlobalListeners(): void {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    window.removeEventListener('scroll', onWindowScroll, true)
    window.removeEventListener('resize', onWindowResize)
}

// 首帧即绑定全局监听（仅浮层可见时生效，开销可忽略），避免每次显示重复挂卸
onMounted(() => {
    bindGlobalListeners()
})

onBeforeUnmount(() => {
    clearTimers()
    unbindGlobalListeners()
})
</script>

<style scoped>
.info-tip {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
}

.info-tip__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text-tertiary, currentColor);
    cursor: help;
    opacity: 0.75;
    transition:
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        opacity var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.info-tip__trigger:hover,
.info-tip__trigger:focus-visible {
    color: var(--ui-accent, currentColor);
    opacity: 1;
    background: var(--ui-accent-soft, transparent);
}

.info-tip__trigger:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.info-tip__popover {
    position: fixed;
    z-index: var(--ui-z-tooltip, 130);
    padding: 8px 12px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, currentColor);
    border-radius: var(--ui-radius-md, 6px);
    background: var(--ui-bg-elevated, var(--ui-surface));
    color: var(--ui-text, inherit);
    box-shadow: var(--ui-shadow-2);
    font-size: var(--ui-font-size-xs, 12px);
    line-height: 1.55;
    white-space: normal;
    word-break: break-word;
    pointer-events: auto;
}

.info-tip-fade-enter-active,
.info-tip-fade-leave-active {
    transition:
        opacity var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        transform var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.info-tip-fade-enter-from,
.info-tip-fade-leave-to {
    opacity: 0;
    transform: translateY(2px);
}
</style>
