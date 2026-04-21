<template>
    <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
  -->
    <div ref="toolbarContainer" class="toolbar-container">
        <button
            v-for="(items, index) in editor.QuickAccess"
            :id="items.id"
            :key="index"
            :title="items.title"
            :class="['tool-btn', items.class]"
            :style="{ width: buttonSize + 'px', height: buttonSize + 'px' }"
            @click="items.clickFn($event, items.param)"
        ></button>
    </div>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'
import * as editor from './hemy-editor'

const showWidth = ref('')
const toolbarContainer = ref<HTMLElement | null>(null)
const buttonSize = ref(35) // 默认按钮大小
const MIN_BUTTON_SIZE = 20 // 最小按钮大小
const MAX_BUTTON_SIZE = 35 // 最大按钮大小
const BUTTON_GAP = 2 // 按钮之间的间距

const props = defineProps({
    // 编辑器宽度
    toolBarWidth: {
        type: String,
        default: '100%'
    }
})

function initButtonSvg() {
    for (const key in editor.QuickAccess) {
        if (Object.prototype.hasOwnProperty.call(editor.QuickAccess, key)) {
            // 确保 key 是 svgs 对象自身的属性
            const element = document.getElementById(key)
            if (element) {
                element.innerHTML = editor.QuickAccess[key].svg
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
    const buttonCount = Object.keys(editor.QuickAccess).length
    
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
    
    // 使用 ResizeObserver 监听容器大小变化
    if (toolbarContainer.value) {
        const resizeObserver = new ResizeObserver(() => {
            calculateButtonSize()
        })
        resizeObserver.observe(toolbarContainer.value)
    }
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
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

/* 确保 SVG 图标自适应按钮大小 */
.tool-btn :deep(svg) {
    width: 80%;
    height: 80%;
}
</style>
