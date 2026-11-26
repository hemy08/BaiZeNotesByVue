<template>
    <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
  -->
    <div ref="toolbarContainer" class="toolbar-container">
        <button
            v-for="(items, index) in QuickAccess"
            :id="items.id"
            :key="index"
            :title="t(items.titleKey)"
            :class="['tool-btn', items.class, { 'tool-btn--active': isFormatActive(items.param) }]"
            :style="{ width: buttonSize + 'px', height: buttonSize + 'px' }"
            @click="items.clickFn($event, items.param)"
        ></button>
    </div>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'
import { t } from '../../common/i18n'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { useEventBus } from '../../composables/useEventBus'
// 结构优化第 2 批 2.2（H4）：直接从功能模块引入 QuickAccess，避免经 `hemy-editor`
// 聚合桶把 Monaco/编辑器动作等重型依赖带进工具栏 chunk（该组件已改为按需加载）。
import { MdEditQuickAccess as QuickAccess } from './hemy-editor-quick-access'

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

const showWidth = ref('')
const toolbarContainer = ref<HTMLElement | null>(null)
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
 * 计算按钮大小，确保所有按钮在一行显示
 */
function calculateButtonSize() {
    if (!toolbarContainer.value) return

    const containerWidth = toolbarContainer.value.clientWidth
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
</script>

<style scoped>
.toolbar-container {
    display: flex;
    flex-wrap: nowrap;
    overflow: hidden;
    width: 100%;
    gap: 2px;
}

.tool-btn {
    border: none;
    background-color: var(--theme-background-color, #f2f2f2);
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
    background-color: var(--theme-hover-background, #eeffff);
}

/* P0：光标/选区处于粗体、斜体、删除线、行内代码时高亮对应按钮 */
.tool-btn--active {
    background-color: var(--theme-accent-color, #764ba2);
    color: var(--theme-button-text-color, #fff);
    fill: var(--theme-button-text-color, #fff);
    box-shadow: inset 0 0 0 1px var(--theme-border-color, #e7e2ef);
}

/* 确保 SVG 图标自适应按钮大小 */
.tool-btn :deep(svg) {
    width: 80%;
    height: 80%;
}
</style>
