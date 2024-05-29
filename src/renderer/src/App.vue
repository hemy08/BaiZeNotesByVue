<template>
  <div id="editor-container">
    <!-- 应用工具栏和下发区域分割部分，2px高度，宽度与app一致 -->
    <div id="file-bar"></div>
    <!-- 整个工作区域 -->
    <div id="workspace-area" class="workspace-area">
      <!-- 左侧区域导航，固定宽度，放置图标，鼠标悬停显示详细信息 -->
      <div id="navi-tab" class="navi-tab">0</div>
      <!-- 中间资源管理显示区域，宽度可以调节 -->
      <div id="resource-area" class="resource-area">1</div>
      <!-- 资源管理器和编辑区域的宽度调节条 -->
      <div id="resizer-main" class="resizer-main">1</div>
      <!-- 右侧编辑区域 -->
      <div id="edit-area" class="edit-area">
        <div id="md-tools-bar" class="md-tools-bar">ddddddddddddddddddddd</div>
        <div id="md-container" class="md-container">
          <div id="md-edit" class="md-edit">水电费水电费水电费</div>
          <div id="resizer-md" class="md">1</div>
          <div id="md-preview" class="md-preview">阿迪斯发斯蒂芬大师傅</div>
        </div>
      </div>
    </div>
    <!-- 状态栏区域，高度10px，宽度与app一致 -->
    <div id="status-bar" class="status-bar">0字节dsfdsafsdfasdfasdfasdfasdfasdfaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</div>
  </div>
</template>

<script setup lang="ts">
import markdownEdit from "./components/MarkdownEdit.vue";

// eslint-disable-next-line vue/no-export-in-script-setup
export default {
  components:{
    markdownEdit
  }
}
</script>

<style scoped>

#editor-container {
  width: 100%;
  height: 100vh;
}

#file-bar {
  width: 100%;
  height: 1px;
}

#workspace-area {
  width: 100%;
  display: flex;
  flex-direction: row;
}

#navi-tab {
  width: 50px;
  height: 100vh;
  background-color: white;
}

.workspace-area {
  height: calc(100vh - 2px - 20px);
}

#resource-area {
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

#md-container {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: row;
}

#md-tools-bar {
  width: 100%;
  height: 20px;
}

#md-edit {
  height: 100vh;
  width: 50%;
}

#resizer-md {
  cursor: col-resize;
  width: 2px; /* Adjust this based on your needs */
  color: blue;
  background-color: #f0dc4e;
  height: calc(100% - 40px - 2px);
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
}
</style>
