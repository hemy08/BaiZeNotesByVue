<template>
  <!-- 左侧区域导航，固定宽度，放置图标，鼠标悬停显示详细信息 -->
  <div id="navi-tab" class="navi-tab"><NaviTab /></div>
  <!-- 中间资源管理显示区域，宽度可以调节 -->
  <div id="resource-manager" class="resource-manager"><ResManager /></div>
  <!-- 资源管理器和编辑区域的宽度调节条 -->
  <div id="resizer-main" class="resizer-main">1</div>
  <!-- 右侧编辑区域 -->
  <div id="edit-area" class="edit-area"><EditArea /></div>
</template>

<script setup lang="ts">
import NaviTab from './NaviTab.vue'
import ResManager from './ResourceManager.vue'
import EditArea from './EditArea.vue'

</script>


<style scoped>

#navi-tab {
  width: 50px;
  height: calc(100vh - 2px - 20px);
  background-color: white;
}

#resource-manager {
  width: 200px;
  height: 100vh;
}

#resizer-main {
  cursor: col-resize;
  width: 2px; /* Adjust this based on your needs */
  color: blue;
  background-color: #f0dc4e;
  height: calc(100vh - 20px);
  /* Other styles... */
}

#edit-area {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
}

</style>
