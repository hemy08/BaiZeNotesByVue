<template>
    <div id="tools-container" class="tools-container">
        <div id="tool-close" class="close-button" :style="{ width: toolsViewWidth }">
            <button>返回编辑器</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { defineProps, watch, computed, ref } from 'vue'
//import EventBus from '../../event-bus'

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
</script>

<style scoped></style>
