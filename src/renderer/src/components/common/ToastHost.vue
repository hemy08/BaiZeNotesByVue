<!--
/**
 * 轻量 Toast 宿主（1.5.7 体验优化：减少模态弹窗）。
 *
 * ## 挂载
 * 主界面 `BaiZeNotes.vue` 挂载（与 MessageDialog 等全局组件同级，随主界面异步 chunk 加载，
 * 不进入渲染入口预算）；主界面卸载时复位（宿主自身 `onBeforeUnmount` + 主界面清理双保险）。
 *
 * ## 定位与层级
 * - Teleport 到 body，固定右下角；底部偏移避开主界面状态栏（24px）与窗口缩放热区，
 *   右侧偏移/间距按密度令牌 `--ui-pad` 派生，窄窗口下宽度自适应（max-width 夹取）；
 * - 层级取 `--ui-z-toast`（70，语义阶梯），低于模态对话框（110），**不与对话框抢焦点**，
 *   也不拦截其下内容的点击（宿主 pointer-events: none，条目自身可点）。
 *
 * ## 样式口径（四风格 × 三密度 × 明暗主题零分支）
 * 全部消费 `--ui-*` 令牌（颜色/圆角/阴影/间距/字号/动效），不写 data-style / data-density
 * 分支、不写硬编码色值；类型强调色只切换 `--toast-accent` 变量的取值来源。
 *
 * ## 无障碍
 * - 宿主为 `aria-live="polite"` 的常驻 live region，每条提示 `role="status"`：读屏会在
 *   不打断当前朗读的前提下播报，且不移动焦点；
 * - 类型图标为装饰性（aria-hidden），信息由标题/正文承载；关闭按钮有 `aria-label`；
 * - 动效：入场淡入 + 4px 位移（180ms，MOTION.md 的 Toast 规范），减少动效时由全局
 *   `prefers-reduced-motion` 令牌降级为 0ms。
 *
 * ## 为什么不用 `<TransitionGroup>`（1.5.7 构建预算修复）
 * `<TransitionGroup>` 由 Vue 运行时 `@vue/runtime-dom` 提供。`@vue/runtime-dom` 被渲染入口
 * 静态引用（`createApp`），Rollup 会把入口与主界面异步 chunk 共同引用到的运行时声明
 * **提升进入口 chunk**：实测该声明 +5.3 KiB，使入口 chunk 由 144.75 KiB 涨到 150.18 KiB，
 * 击穿 150 KiB 入口预算。
 * 因此本组件只用「列表 + 入场 CSS 动画」实现（渲染行为/关闭/自动消失逻辑完全不变，
 * 仅不提供条目移除时的离场过渡）；后续如需离场动画，请用本地过渡实现，**不要**再引入
 * `<TransitionGroup>`，避免运行时声明再次被提升进入口 chunk。
 */
-->
<template>
    <Teleport to="body">
        <div class="toast-host" aria-live="polite" aria-atomic="false">
            <div
                v-for="item in toasts"
                :key="item.id"
                class="toast"
                :class="`toast--${item.type}`"
                :data-toast-type="item.type"
                role="status"
                @click="dismissToast(item.id)"
            >
                <span class="toast__icon" aria-hidden="true">
                    <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        focusable="false"
                    >
                        <template v-if="item.type === 'success'">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M8.4 12.2l2.5 2.5 4.7-5.2" />
                        </template>
                        <template v-else-if="item.type === 'error'">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
                        </template>
                        <template v-else-if="item.type === 'warning'">
                            <path d="M12 4.4l8.1 14.8H3.9z" />
                            <path d="M12 9.6v4.1" />
                            <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
                        </template>
                        <template v-else>
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 11v5.4" />
                            <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
                        </template>
                    </svg>
                </span>
                <div class="toast__body">
                    <p v-if="item.title" class="toast__title">{{ item.title }}</p>
                    <p class="toast__message">{{ item.message }}</p>
                </div>
                <button
                    type="button"
                    class="toast__close"
                    :aria-label="t('common.close')"
                    :title="t('common.close')"
                    @click.stop="dismissToast(item.id)"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
                    </svg>
                </button>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * 轻量 Toast 宿主：只消费 `common/toast.ts` 的模块单例状态并渲染，不持有业务逻辑。
 * 卸载时关闭全部提示并回收自动消失定时器（模块单例状态不残留到下一次挂载）。
 */
import { computed, onBeforeUnmount } from 'vue'
import { dismissAllToasts, dismissToast, toastState, type ToastItem } from '../../common/toast'
import { t } from '../../common/i18n'

/** 当前展示的提示（旧 → 新；模块单例只读消费） */
const toasts = computed<ToastItem[]>(() => toastState.toasts)

onBeforeUnmount(() => {
    // 主界面卸载：清空队列并回收全部定时器，避免模块级定时器泄漏到下一次挂载
    dismissAllToasts()
})
</script>

<style scoped>
/* 宿主：固定在右下角，避开状态栏（24px，主界面容器常量）与窗口缩放热区；
   右侧/底部偏移与条目间距由密度令牌 --ui-pad 派生（compact 8 / default 12 / spacious 16）。 */
.toast-host {
    position: fixed;
    right: calc(var(--ui-pad, 12px) * 2);
    bottom: calc(var(--ui-pad, 12px) * 2 + 24px);
    z-index: var(--ui-z-toast, 70);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: calc(var(--ui-pad, 12px) / 2);
    width: min(420px, calc(100vw - var(--ui-pad, 12px) * 4));
    /* 宿主自身不拦截点击，仅条目可交互（不遮挡其下编辑器/按钮） */
    pointer-events: none;
}

.toast {
    /* 类型强调色：四类各自选择语义色令牌（无风格/密度分支，无硬编码色值） */
    --toast-accent: var(--ui-info, var(--ui-accent, currentColor));

    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: calc(var(--ui-pad, 12px) / 2);
    box-sizing: border-box;
    width: 100%;
    padding: calc(var(--ui-pad, 12px) * 0.75) var(--ui-pad, 12px);
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, currentColor);
    border-inline-start: 3px solid var(--toast-accent);
    border-radius: var(--ui-radius-md, 4px);
    /* 玻璃风格经 surface-opacity 令牌得到半透明面；其余风格 opacity=1 即不透明卡片 */
    background-color: color-mix(
        in srgb,
        var(--ui-bg-elevated, var(--ui-surface, transparent))
            calc(var(--ui-surface-opacity, 1) * 100%),
        transparent
    );
    color: var(--ui-text, inherit);
    box-shadow: var(--ui-shadow-2, none);
    cursor: pointer;
}

.toast--success {
    --toast-accent: var(--ui-success, var(--ui-accent, currentColor));
}

.toast--info {
    --toast-accent: var(--ui-info, var(--ui-accent, currentColor));
}

.toast--warning {
    --toast-accent: var(--ui-warning, var(--ui-accent, currentColor));
}

.toast--error {
    --toast-accent: var(--ui-danger, var(--ui-accent, currentColor));
}

.toast__icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--ui-control-height, 32px) * 0.75);
    height: calc(var(--ui-control-height, 32px) * 0.75);
    border-radius: calc(var(--ui-radius-sm, 2px) * 2);
    color: var(--toast-accent);
    background-color: color-mix(in srgb, var(--toast-accent) 14%, transparent);
}

.toast__body {
    flex: 1 1 auto;
    min-width: 0;
}

.toast__title {
    margin: 0 0 2px;
    color: var(--ui-text, inherit);
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
    line-height: 1.45;
}

.toast__message {
    margin: 0;
    color: var(--ui-text-secondary, var(--ui-text, inherit));
    font-size: var(--ui-font-size, 13px);
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: normal;
}

.toast__close {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--ui-control-height, 32px) * 0.625);
    height: calc(var(--ui-control-height, 32px) * 0.625);
    margin: -2px -2px 0 0;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text-tertiary, var(--ui-text-secondary, currentColor));
    cursor: pointer;
    transition:
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.toast__close:hover,
.toast__close:focus-visible {
    color: var(--ui-text, inherit);
    background-color: var(--ui-accent-soft, transparent);
}

.toast__close:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow, none);
}

/* 动效（1.5.7 构建预算修复：不使用 TransitionGroup，只保留入场动画）：
   - 入场：透明度 0 → 1 + 4px 上移复位（180ms，MOTION.md「Toast / 状态提示」规范）；
   - 减少动效时 --ui-duration-pop 由全局媒体查询降级为 0ms，组件无需分支；
   - 条目移除即时生效（无离场过渡）：离场过渡需要 TransitionGroup 或本地过渡宿主，
     而 TransitionGroup 会把运行时声明提升进入口 chunk（见文件头说明）。 */
.toast {
    animation: toast-in var(--ui-duration-pop, 180ms) var(--ui-ease-standard, ease);
}

@keyframes toast-in {
    from {
        opacity: 0;
        transform: translateY(4px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
