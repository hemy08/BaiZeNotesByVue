<template>
    <!-- 左侧区域导航，固定宽度，放置图标，鼠标悬停显示详细信息 -->
    <div id="left-navi" class="navi-tab" :style="{ width: naviTabWidth, float: 'left' }">
        <NaviTab position="left" @update:navi:tab="onSwitchRightNaviTab" />
    </div>
    <!-- 中间资源管理显示区域，宽度可以调节 -->
    <div
        v-show="isShowResourceMgrArea"
        id="resource-manager"
        class="resource-manager"
        :style="{ width: resMgrWidth }"
    >
        <ResManager :navi-show="naviResManagerShow" />
    </div>
    <!-- 资源管理器和编辑区域的宽度调节条 -->
    <div
        id="resizer-main"
        class="resizer-main"
        :style="{ left: resizerLeft }"
        @mousedown="startCursorPosition($event)"
    ></div>
    <!-- 右侧编辑区域 -->
    <div
        v-show="isShowMdContainer"
        id="md-container"
        class="md-container"
        :style="{ width: workAreaWidth, marginRight: naviTabWidth }"
    >
        <MdContainer :md-container-width="workAreaWidth" />
    </div>
    <div
        v-show="isShowPluginsContainer"
        id="plugin-containers"
        class="plugin-containers"
        :style="{ width: workAreaWidth }"
    >
        <PluginTools :plugins-area-width="workAreaWidth" />
    </div>
    <div
        v-show="isShowToolsContainer"
        id="tool-containers"
        class="tool-containers"
        :style="{ width: workAreaWidth }"
    >
        <HemyTools :tools-area-width="workAreaWidth" />
    </div>
    <div
        v-show="isShowHtmlContainer"
        id="html-containers"
        class="html-containers"
        :style="{ width: workAreaWidth }"
    >
        <ShowHtmlView :html-area-width="workAreaWidth" />
    </div>
    <div
        v-show="isShowPdfContainer"
        id="pdf-containers"
        class="pdf-containers"
        :style="{ width: workAreaWidth }"
    >
        <ShowPdfEditor :pds-area-width="workAreaWidth" />
    </div>
    <!-- 最右侧边框 -->
    <div id="right-navi" class="navi-tab" :style="{ width: naviTabWidth, float: 'right' }">
        <NaviTab position="right" @update:navi:tab="onSwitchLeftNaviTab" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import EventBus from "@renderer/common/event_bus/event-bus"
import NaviTab from "@renderer/components/WorkSpaceArea/NaviTab.vue"
import ResManager from "@renderer/components/ResourceManager/ResourceManager.vue"
import MdContainer from "@renderer/components/Markdown/MarkdownContainer.vue"
import PluginTools from "@renderer/components/PluginTools/PluginTools.vue"
import HemyTools from "@renderer/components/HemyTools/HemyTools.vue"
import ShowHtmlView from "@renderer/components/HemyTools/ShowHtmlVIew.vue"
import ShowPdfEditor from "@renderer/components/HemyTools/ShowPdfEditor.vue";

// 使用 ref 来创建响应式引用
const naviResManagerShow = ref('file-explorer')
const windowWidth = ref(window.innerWidth)
const resMgrWidth = ref('300px')
const naviTabWidth = ref('40px')
const isShowResourceMgrArea = ref(true)
const isShowMdContainer = ref(true)
const isShowPluginsContainer = ref(false)
const isShowToolsContainer = ref(false)
const isShowHtmlContainer = ref(false)
const isShowPdfContainer = ref(false)

let mouseStartX = 0

const resizerLeft = computed(() => {
    return resMgrWidth.value
})

// 使用 computed 属性来动态计算 workAreaWidth
const workAreaWidth = computed(() => {
    // 注意这里使用了 parseInt 移除 'px' 后缀，并且确保计算是有效的
    const naviTabWidthValue = parseInt(naviTabWidth.value.replace('px', ''), 10)
    // 减去左右两侧的 naviTabWidth, resMgrWidth 以及可能的间隙（例如 2px）
    // 注意：左右两侧都有 NaviTab，所以需要减去 2 * naviTabWidthValue
    let containerWidth = windowWidth.value - (naviTabWidthValue * 2) - 2
    if (isShowResourceMgrArea.value) {
        const resMgrWidthValue = parseInt(resMgrWidth.value.replace('px', ''), 10)
        containerWidth = windowWidth.value - (naviTabWidthValue * 2) - resMgrWidthValue - 2
    }
    return containerWidth + 'px'
})

// 定义事件处理函数
const handlePluginToolsContainerShow = (value: boolean) => {
    if (value) {
        isShowMdContainer.value = false
        isShowPluginsContainer.value = true
    } else {
        isShowMdContainer.value = true
        isShowPluginsContainer.value = false
    }
}

const handleWorkAreaContainerShow = (value: string) => {
    isShowMdContainer.value = false
    isShowPluginsContainer.value = false
    isShowHtmlContainer.value = false
    isShowPdfContainer.value = false
    if (value === "plugins") {
        isShowPluginsContainer.value = true
    } else if (value === "html") {
        isShowHtmlContainer.value = true
    } else if (value === "pdf") {
        isShowPdfContainer.value = true
    } else {
        isShowMdContainer.value = true
    }
}
function onSwitchRightNaviTab(value: string) {
    if (value == 'switch-open-close') {
        isShowResourceMgrArea.value = !isShowResourceMgrArea.value
    } else if (value == 'file-explorer') {
        naviResManagerShow.value = 'file-explorer'
        isShowResourceMgrArea.value = true
    } else if (value == 'markdown-toc') {
        // 保存当前tree信息
        naviResManagerShow.value = 'markdown-toc'
        isShowResourceMgrArea.value = true
    } else {
        naviResManagerShow.value = 'file-explorer'
    }
}

function onSwitchLeftNaviTab(value: string) {
    if (value == 'switch-open-close') {
        isShowToolsContainer.value = !isShowToolsContainer.value
    }
}

function startCursorPosition(e: MouseEvent) {
    mouseStartX = e.clientX
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
    const moveX = e.clientX - mouseStartX
    const newWidth = parseInt(resMgrWidth.value, 10) + moveX
    // 限制最小和最大宽度（可选）
    const minWidth = 100
    const maxWidth = windowWidth.value - 600
    if (newWidth > maxWidth) {
        resMgrWidth.value = maxWidth + 'px'
    } else if (newWidth < minWidth) {
        resMgrWidth.value = minWidth + 'px'
    } else {
        resMgrWidth.value = newWidth + 'px'
    }
    mouseStartX = e.clientX
}

function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
}

const handleHideDisplayResManager = () => {
    isShowResourceMgrArea.value = !isShowResourceMgrArea.value
}

function onWindowResized() {
    windowWidth.value = window.innerWidth
}

onMounted(() => {
    windowWidth.value = window.innerWidth
    window.addEventListener('resize', onWindowResized)

    EventBus.$on('plugin-tools-container-show', handlePluginToolsContainerShow)
    EventBus.$on('baize:notes:workspace:show', handleWorkAreaContainerShow)
    window.electron.ipcRenderer.on('menu-view-hide-display-res-manager', handleHideDisplayResManager)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', onWindowResized)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    window.electron.ipcRenderer.removeListener('menu-view-hide-display-res-manager', handleHideDisplayResManager)
    EventBus.$off('plugin-tools-container-show', handlePluginToolsContainerShow)
    EventBus.$off('baize:notes:workspace:show', handleWorkAreaContainerShow)
})
</script>

<style scoped>
#navi-tab {
    height: calc(100vh - 2px - 20px);
    background-color: var(--theme-card-background, white);
    display: flex;
    float: left;
    width: 40px;
    border-right: 1px solid var(--theme-border-color, #e0e0e0);
}

#resource-manager .resource-manager {
    height: 100vh;
    display: flex;
    float: left;
    margin-right: 2px;
    flex-direction: column;
    background: var(--theme-background-color, whitesmoke);
    border-right: 1px solid var(--theme-border-color, #e0e0e0);
}

#resizer-main {
    cursor: ew-resize;
    color: var(--theme-accent-color, blue);
    width: 2px;
    background-color: var(--theme-border-color, #f0dc4e);
    height: calc(100vh - 20px);
    float: left;
    /* Other styles... */
}

#md-container {
    display: flex;
    flex-direction: column;
    float: left;
    background-color: var(--theme-background-color, #ffffff);
}

#plugin-containers {
    display: flex;
    flex-direction: column;
    float: left;
    overflow-x: hidden;
    overflow-y: auto;
    background-color: var(--theme-background-color, #ffffff);
}

#tool-containers {
    display: flex;
    flex-direction: column;
    float: left;
    overflow-x: hidden;
    overflow-y: auto;
    background-color: var(--theme-background-color, #ffffff);
}

/* 应用主题到所有子元素 */
* {
    color: var(--theme-text-color, #2d2d2d);
}

/* 链接颜色 */
a {
    color: var(--theme-accent-color, #764ba2);
}

/* 按钮样式 */
button {
    background-color: var(--theme-button-background, #764ba2);
    color: var(--theme-button-text-color, #ffffff);
}

button:hover {
    background-color: var(--theme-hover-background, #f0e8ff);
}
</style>
