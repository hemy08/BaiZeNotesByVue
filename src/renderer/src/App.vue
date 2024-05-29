<template>
  <div id="container">
    <div id="file-bar"></div>
    <div id="workspace-area">
      <div id="navi-tab"></div>
      <div id="split-pane">
        <div id="directory">
          <div id="file-tree" class="directory-panel active"></div>
          <div id="outline" class="directory-panel">
            <div class="markdown-toc"></div>
          </div>
        </div>
        <div id="ide" class="theme-default">
          <div style="width: 50%; height: 100%" id="monaco"></div>
        </div>
      </div>
    </div>
    <div class="status-bar"></div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
#container {
  display: flex;
  position: fixed;
  width: 100%;
  height: 100%;
}

.column {
  height: 2px;
  color: #2e3243;
  user-select: none;
  line-height: 2px;
  padding: 0 5px;
  background-color: #ffffff;
  display: none;
}

.resizer {
  display: auto;
  cursor: col-resize;
  width: 20px; /* Adjust this based on your needs */
  color: blue;
  background-color: #f0dc4e;
  height: 100%;
  /* Other styles... */
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
}
</style>
