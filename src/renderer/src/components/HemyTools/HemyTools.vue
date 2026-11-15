<template>
    <div id="tools-container" class="tools-container">
        <div id="tool-close" class="close-button" :style="{ width: toolsViewWidth }">
            <button @click="handleBackToEditor">{{ t('toolsNetwork.common.backToEditor') }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { t } from '../../common/i18n'
import EventBus from '../../common/event-bus/event-bus'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'

const props = defineProps({
    // 编辑器宽度
    toolsAreaWidth: {
        type: String,
        default: '100%'
    }
})
const toolWidth = ref(props.toolsAreaWidth)
const toolsViewWidth = computed(() => {
    const toolWidthValue = parseInt(toolWidth.value.replace('px', ''), 10)
    const conWidthValue = toolWidthValue - 100
    return conWidthValue + 'px'
})

watch(
    () => props.toolsAreaWidth,
    (width) => {
        toolWidth.value = width
    }
)

/**
 * FE-26：原按钮无 @click——工具面板一旦打开无法经 UI 返回编辑器（只能靠再次触发
 * 左侧导航的开关）。现接回工作区容器切换：发 WORKSPACE_SHOW('md') 由
 * WorkSpace.vue 的统一分支隐藏工具面板并恢复编辑器容器。
 */
function handleBackToEditor() {
    EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
}
</script>

<style scoped>
#tool-close {
    padding: 10px;
}

#tool-close button {
    padding: 5px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background-color: var(--theme-button-background);
    color: var(--theme-button-text-color);
}

#tool-close button:hover {
    background-color: var(--theme-hover-background);
}
</style>
