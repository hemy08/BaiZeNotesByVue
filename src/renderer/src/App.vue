<template>
  <div id="editor-container">
    <!-- 应用工具栏和下发区域分割部分，2px高度，宽度与app一致 -->
    <div id="file-bar"></div>
    <!-- 整个工作区域 -->
    <div id="workspace-area" class="workspace-area"><WorkSpace /></div>
    <!-- 状态栏区域，高度10px，宽度与app一致 -->
    <div id="status-bar" class="status-bar"><StatusBar /></div>
  </div>
</template>

<script setup lang="ts">
import WorkSpace from './components/WorkSpaceArea/WorkSpace.vue'
import StatusBar from './components/StatusBar.vue'
</script>

<style scoped>
/* 需要隐藏滚动条，如果不隐藏，在区域内部，窗口会层叠*/
#editor-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

#file-bar {
  width: 100%;
  height: 0.5px;
}

#workspace-area {
  width: 100%;
  display: flex;
  flex-direction: row;
}

.workspace-area {
  height: calc(100vh - 2px - 20px);
}

.status-bar {
  font-size: 13px;
  height: 20px;
  background-color: #ffffff;
  color: #777777;
  padding: 0;
  display: flex;
  justify-content: space-between;
  cursor: default;
  user-select: none;
  align-items: center;
  margin: 0;
  z-index: 2;
}
</style>
