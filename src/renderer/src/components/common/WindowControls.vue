<!--
  窗口控制按钮（第 3 批组件化 / 子任务 A1）。

  抽取来源：WelcomeScreen.vue（欢迎页右上角）与 BaiZeNotes.vue（主界面标题栏）此前各自维护
  一份「最小化 / 最大化·还原 / 关闭」按钮 + 图标切换 + no-drag 样式。两处行为此前已统一为
  TOGGLE_MAXIMIZE 语义（2026-11-19 用户反馈），本组件作为唯一实现复用
  `useWindowManagement` composable 的窗口操作与最大化状态同步，避免第三份重复逻辑。

  DOM 契约（现有测试锁定，不得破坏）：
  - 根节点保留 `.window-controls` 类（父组件用于定位/拖拽区域与单元测试选择器）；
  - 三个按钮保留 `.window-btn` + `.minimize` / `.maximize` / `.close` 类名；
  - 按钮内保留 `<svg>` 图标（CSS 对按钮及 SVG 子元素声明 `-webkit-app-region: no-drag`，
    修复历史问题「欢迎页右上角按钮点击被判为拖拽热区、click 不触发」）。
-->
<template>
    <div :class="['window-controls', `window-controls--${props.variant}`]">
        <button
            type="button"
            class="window-btn minimize"
            :title="t('workspace.window.minimize')"
            @click="minimizeWindow"
        >
            <svg viewBox="0 0 12 12"><path d="M2 6h8" /></svg>
        </button>
        <button
            v-if="props.showMaximize"
            type="button"
            class="window-btn maximize"
            :title="isMaximized ? t('workspace.window.restore') : t('workspace.window.maximize')"
            @click="maximizeWindow"
        >
            <!-- 最大化：单层矩形；还原：两层矩形（与抽取前两处实现完全一致） -->
            <svg v-if="!isMaximized" viewBox="0 0 12 12">
                <rect x="2" y="2" width="8" height="8" fill="none" />
            </svg>
            <svg v-else viewBox="0 0 12 12">
                <rect x="2" y="4" width="6" height="6" fill="none" />
                <path d="M4 4V2h6v6H8" fill="none" />
            </svg>
        </button>
        <button
            type="button"
            class="window-btn close"
            :title="t('common.close')"
            @click="closeWindow"
        >
            <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" /></svg>
        </button>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useWindowManagement } from '../../composables/useWindowManagement'
import { t } from '../../common/i18n'

defineOptions({ name: 'WindowControls' })

/**
 * 主题/场景变体（只影响按钮悬停底色与图标描边宽度，不改变按钮尺寸与类名）：
 * - `titlebar`：主界面标题栏（悬停 rgba(255,255,255,0.1)、描边 1.5px）；
 * - `welcome`：欢迎页右上角（悬停 rgba(255,255,255,0.25)、描边 1px）。
 */
type WindowControlsVariant = 'titlebar' | 'welcome'

const props = withDefaults(
    defineProps<{
        /** 是否渲染「最大化/还原」按钮（默认 true，保持两处既有三按钮布局） */
        showMaximize?: boolean
        /** 视觉变体（默认主界面标题栏） */
        variant?: WindowControlsVariant
    }>(),
    {
        showMaximize: true,
        variant: 'titlebar'
    }
)

const emit = defineEmits<{
    /** 最小化/最大化切换后通知父组件重新布局（父组件据此触发布局回调，如 Monaco relayout） */
    (event: 're-layout'): void
}>()

// 复用 composable：窗口操作、最大化状态查询与 resize 同步（双击标题栏/Win+Up/贴边吸附后
// 图标仍能正确切换）全部走同一实现；父组件的布局回调通过 re-layout 事件上抛。
const {
    isMaximized,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    startMaximizedStateSync,
    cleanupWindowEvents
} = useWindowManagement({
    onReLayout: () => emit('re-layout')
})

onMounted(() => {
    // 挂载即查询一次真实最大化状态，并监听 window resize 同步系统级最大化/还原
    startMaximizedStateSync()
})

onBeforeUnmount(() => {
    // 清理 resize 监听与待执行的状态刷新定时器（幂等）
    cleanupWindowEvents()
})
</script>

<style scoped>
/*
  按钮样式自两处父组件抽取合并，按变体保留原有差异：
  - 尺寸/边框/光标/过渡/no-drag：两处完全一致；
  - 悬停底色与 SVG 描边宽度：按 variant 区分。
  父组件仅保留 `.window-controls` 容器自身布局（宽度/高度/拖拽区域等），互不覆盖。
*/
.window-btn {
    width: 46px;
    height: 30px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    -webkit-app-region: no-drag;
}

/* no-drag 契约：drag 区域内的 SVG 子元素默认仍会被当作拖动热区，按钮及全部子元素显式声明
   no-drag，保证按钮任意位置都可点击（历史 bug「欢迎页按钮点击无反应」的 CSS 修复）。 */
.window-btn,
.window-btn svg,
.window-btn svg * {
    -webkit-app-region: no-drag;
}

/* 主界面标题栏变体（默认） */
.window-btn:hover {
    background: rgba(255, 255, 255, 0.1);
}

.window-btn.close:hover {
    background: #e81123;
}

.window-btn svg {
    width: 12px;
    height: 12px;
    stroke: #fff;
    stroke-width: 1.5;
    fill: none;
}

.window-btn.close:hover svg {
    stroke: #fff;
}

/* 欢迎页变体：悬停底色更亮、图标线条更细（与抽取前 WelcomeScreen.vue 一致） */
.window-controls--welcome .window-btn:hover {
    background: rgba(255, 255, 255, 0.25);
}

.window-controls--welcome .window-btn svg {
    stroke: white;
    stroke-width: 1;
}
</style>
