<template>
  <div id="navi-tab">
    <div class="navi-tab-item-btn">
      <button
        data-index="0"
        title="文件管理器"
        class="navi-tab-item file active"
        @click="onShowFileExplorer"
      >
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M886 190.1H438.4L342 132.2c-6.6-4-14.2-6.1-22-6.1H135.1c-51.8 0-93.9 42.1-93.9 93.9v580.3c0 51.8 42.1 93.9 93.9 93.9H886c51.8 0 93.9-42.1 93.9-93.9V284c0-51.8-42.1-93.9-93.9-93.9z m-750.9 21.3h173.1l96.5 57.9c6.6 4 14.2 6.1 22 6.1H886c4.7 0 8.5 3.8 8.5 8.5v36h-768V220c0.1-4.7 3.9-8.6 8.6-8.6zM886 808.8H135.1c-4.7 0-8.5-3.8-8.5-8.5v-395h768v395c0 4.6-3.9 8.5-8.6 8.5z"
          ></path>
        </svg>
      </button>
      <button data-index="1" title="大纲" class="navi-tab-item outline" @click="onShowMarkdownTOC">
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M157.538462 265.846154c0 15.753846-13.784615 29.538462-29.538462 29.538461h-59.076923c-15.753846 0-29.538462-13.784615-29.538462-29.538461v-59.076923C39.384615 191.015385 53.169231 177.230769 68.923077 177.230769h59.076923c15.753846 0 29.538462 13.784615 29.538462 29.538462v59.076923z m827.076923-59.076923c0-15.753846-13.784615-29.538462-29.538462-29.538462h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538462v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538461h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076923z m-827.076923 275.692307c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m748.307692 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-610.461538c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h610.461538c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m-748.307692 275.692308c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z m827.076923 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z"
          ></path>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineEmits } from 'vue'

let currentNaviTal = 'file-explorer'

// 定义 emit 函数
const emit = defineEmits(['update:navi:tab'])

function onShowFileExplorer() {
  if (currentNaviTal == 'file-explorer') {
    // 隐藏文件资源管理器
    emit('update:navi:tab', 'switch-open-close')
  } else {
    // 切换文件资源管理器
    emit('update:navi:tab', 'file-explorer')
    currentNaviTal = 'file-explorer'
  }
}

function onShowMarkdownTOC() {
  if (currentNaviTal == 'markdown-toc') {
    // 隐藏文件资源管理器
    emit('update:navi:tab', 'switch-open-close')
  } else {
    // 切换markdown导航栏
    currentNaviTal = 'markdown-toc'
    emit('update:navi:tab', 'markdown-toc')
  }
}
</script>

<style scoped>
.navi-tab-item-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: white;
  margin: 1px;
}

.navi-tab-item {
  width: 100%;
  background-color: white;
  color: white;
  fill: #986801;
  border: none; /* 去掉外边框 */
  margin-top: 10px;
}

.navi-tab-item:hover {
  background-color: grey;
}
</style>
