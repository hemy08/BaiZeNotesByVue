<template>
  <!-- 左侧区域导航，固定宽度，放置图标，鼠标悬停显示详细信息 -->
  <div id="navi-tab" class="navi-tab" :style="{ width: naviTabWidth }">
    <NaviTab @update:navi:tab="onSwitchNaviTab" />
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
  <div id="resizer-main" class="resizer-main" :style="{ left: resizerLeft }"  @mousedown="startCursorPosition($event)"></div>
  <!-- 右侧编辑区域 -->
  <div id="md-container" class="md-container" :style="{ width: mdContainerWidth }">
    <MdContainer />
  </div>
</template>

<script setup lang="ts">
import NaviTab from './NaviTab.vue'
import ResManager from '../ResourceManager/ResourceManager.vue'
import MdContainer from '../Markdown/MarkdownContainer.vue'
import { ref, computed } from 'vue'

let mouseStartX = 0
// 使用 ref 来创建响应式引用
const naviResManagerShow = ref('file-explorer')
const resMgrWidth = ref('300px')
const naviTabWidth = ref('40px')
const resizerLeft = computed(() => {
  return resMgrWidth.value
})

// 使用 computed 属性来动态计算 mdContainerWidth
const mdContainerWidth = computed(() => {
  // 注意这里使用了 parseInt 移除 'px' 后缀，并且确保计算是有效的
  const naviTabWidthValue = parseInt(naviTabWidth.value.replace('px', ''), 10)
  // 减去 resMgrWidth, naviTabWidth 以及可能的间隙（例如 2px）
  if (isShowResourceMgrArea.value) {
    const resMgrWidthValue = parseInt(resMgrWidth.value.replace('px', ''), 10)
    return `calc(100vw - ${naviTabWidthValue}px - ${resMgrWidthValue}px - 2px)`
  } else {
    return `calc(100vw - ${naviTabWidthValue}px - 2px)`
  }
})

const isShowResourceMgrArea = ref(true)

function onSwitchNaviTab(value: string) {
  if (value == 'switch-open-close') {
    isShowResourceMgrArea.value = !isShowResourceMgrArea.value
  } else if (value == 'file-explorer') {
    window.electron.ipcRenderer.send('file-manager-context-menu-reload-from-disk', '')
    naviResManagerShow.value = 'file-explorer'
  } else if (value == 'markdown-toc') {
    naviResManagerShow.value = 'markdown-toc'
  } else {
    naviResManagerShow.value = 'file-explorer'
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
  const maxWidth = window.innerWidth - 600
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
</script>

<style scoped>
#navi-tab {
  height: calc(100vh - 2px - 20px);
  background-color: white;
  display: flex;
  float: left;
  width: 40px;
}

#resource-manager .resource-manager {
  height: 100vh;
  display: flex;
  float: left;
  margin-right: 2px;
  flex-direction: column;
  background: whitesmoke;
}

#resizer-main {
  cursor: ew-resize;
  color: blue;
  width: 2px;
  background-color: #f0dc4e;
  height: calc(100vh - 20px);
  float: left;
  /* Other styles... */
}

#md-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  float: left;
}
</style>
