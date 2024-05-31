<template>
  <!-- 左侧区域导航，固定宽度，放置图标，鼠标悬停显示详细信息 -->
  <div id="navi-tab" class="navi-tab" :style="naviTabStyle">
    <NaviTab />
  </div>
  <!-- 中间资源管理显示区域，宽度可以调节 -->
  <div id="resource-manager" class="resource-manager" :style="resMgrStyle">
    <ResManager />
  </div>
  <!-- 资源管理器和编辑区域的宽度调节条 -->
  <div
    id="resizer-main"
    class="resizer-main"
    :style="resizerMainStyle"
    @mousedown="startResizerMainResize()"
  >
    1
  </div>
  <!-- 右侧编辑区域 -->
  <div id="edit-area" class="edit-area" :style="editAreaStyle">
    <EditArea />
  </div>
</template>

<script setup lang="ts">
import NaviTab from './NaviTab.vue'
import ResManager from './ResourceManager.vue'
import EditArea from './EditArea.vue'
import { computed, ref } from 'vue'

// 使用 ref 来创建响应式引用
const resMgrWidth = ref('300px')
const naviTabWidth = ref('40px')

const naviTabStyle = computed(() => ({
  width: naviTabWidth.value, // 视窗宽度
  height: '100%' // 视窗高度
}))

// 拖动区域
const resMgrStyle = computed(() => ({
  width: resMgrWidth.value, // 视窗宽度
  height: '100%' // 视窗高度
  //marginLeft: naviTabWidth.value // 左侧遗留navi-tab宽度
}))

// 拖动区域
const resizerMainStyle = computed(() => ({
  width: '2px', // 视窗宽度
  height: '100% - 20px - 2px' // 视窗高度
  // marginLeft: naviTabWidth.value + resMgrWidth.value // 左侧遗留navi-tab宽度
}))

// 预览区域样式设置
const editAreaStyle = computed(() => ({
  width: `calc(100vw - ${naviTabWidth.value} - ${resMgrWidth.value} - 2px)`, // 视窗宽度
  height: '100%' // 视窗高度
  // marginLeft: 'naviTabWidth.value + resMgrWidth.value + 2px' // 左侧遗留navi-tab宽度
}))

function startResizerMainResize() {}
/*
function resize() {

}

function stopResizerMainResize() {

}

function handleResize() {

}*/
</script>

<style scoped>
#navi-tab {
  height: calc(100vh - 2px - 20px);
  background-color: white;
  display: flex;
  float: left;
}

#resource-manager .resource-manager {
  height: 100vh;
  display: flex;
  float: left;
}

#resizer-main {
  cursor: col-resize;
  color: blue;
  background-color: #f0dc4e;
  height: calc(100vh - 20px);
  float: left;
  /* Other styles... */
}

#edit-area {
  height: 100vh;
  display: flex;
  flex-direction: column;
  float: left;
}
</style>
