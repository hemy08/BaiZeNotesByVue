<template>
    <div id="plugin-tools-container" class="plugin-tools-container">
        <div id="plugin-tool-close" class="close-button" @click="handleClosePluginTools">
            <button>返回编辑器</button>
        </div>
        <div v-if="visibleTool" :id="`plugin-tool-${visibleTool.id}`" class="plugin-tool-content">
            <component :is="visibleTool.component" :work-area-width="toolsViewWidth"></component>
        </div>
        <div v-else class="plugin-tool-placeholder">
            <p>请选择其他工具，当前工具正在开发中，敬请期待。。。</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watch, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import EventBus from '../../event-bus'
import { CHANNEL_PLUGIN_TOOL_SHOW } from '../../../../main/common/menu_consts'
import {pluginTools} from './plugin_tools_const'

const props = defineProps({
    pluginsAreaWidth: {
        type: String,
        default: '100%'
    }
})

const toolWidth = ref(props.pluginsAreaWidth)
let isShowPluginToolsContainer = false

const toolsViewWidth = computed(() => {
    const toolWidthValue = parseInt(toolWidth.value.replace('px', ''), 10)
    const conWidthValue = toolWidthValue - 100
    return conWidthValue + 'px'
})

const activeToolId = ref('')
const visibleTool = computed(() => {
    return pluginTools.find((tool) => tool.id === activeToolId.value)
})

window.electron.ipcRenderer.on('plugin-tools-show', (_, context: string) => {
  console.log('context is ', context)
    if (!isShowPluginToolsContainer) {
        EventBus.$emit('plugin-tools-container-show', true)
        isShowPluginToolsContainer = true
    }
    activeToolId.value = context
})

function handleClosePluginTools() {
    if (isShowPluginToolsContainer) {
        isShowPluginToolsContainer = false
    }
    activeToolId.value = ''
    EventBus.$emit('plugin-tools-container-show', false)
}

watch(
    () => props.pluginsAreaWidth,
    (width) => {
        toolWidth.value = width
    }
)

onMounted(() => {
    // 监听插件工具显示事件（来自 menu_actions.ts）
    EventBus.$on(CHANNEL_PLUGIN_TOOL_SHOW, handlePluginToolShow)
    
    // 监听主题更新事件
    EventBus.$on('theme-updated', applyThemeStyles)
})

// 组件卸载时清理监听器
onBeforeUnmount(() => {
    EventBus.$off(CHANNEL_PLUGIN_TOOL_SHOW, handlePluginToolShow)
    EventBus.$off('theme-updated', applyThemeStyles)
})

// 处理插件工具显示事件
function handlePluginToolShow(action: string) {
  // 显示插件工具容器
  if (!isShowPluginToolsContainer) {
    EventBus.$emit('plugin-tools-container-show', true)
    isShowPluginToolsContainer = true
  }

  // 设置当前激活的工具
  activeToolId.value = action
}

function applyThemeStyles() {
    // 主题样式通过 CSS 变量自动应用，无需额外处理
}
</script>

<style scoped>
.plugin-tools-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    background-color: var(--theme-background-color);
    color: var(--theme-text-color);
    overflow-y: auto;
    overflow-x: auto;
    padding-top: 50px; /* 为绝对定位的关闭按钮留出空间 */
}

.close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 18px;
    cursor: pointer;
    z-index: 10;
}

.close-button button {
    background-color: var(--theme-button-background);
    color: var(--theme-button-text-color);
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.close-button button:hover {
    background-color: var(--theme-hover-background);
}

/* 确保动态组件容器正确显示 */
.plugin-tool-content {
    width: 100%;
    min-height: 100%;
    padding: 10px;
    box-sizing: border-box;
}

/* 占位符样式 */
.plugin-tool-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-secondary-text-color);
}

.plugin-tool-placeholder p {
    font-size: 16px;
    text-align: center;
}

.tool-section h1 {
    text-align: center;
}
</style>
